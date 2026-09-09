import { db } from "@/db";
import { mediaAssets, postMedia, MediaAsset, NewMediaAsset } from "@/db/schema";
import { cloudinaryClient } from "@/lib/cloudinary/client";
import { accountService } from "./account.service";
import { eq, and, isNull, desc, like, or, count, sql, lt } from "drizzle-orm";
import crypto from "node:crypto";

export interface RegisterAssetInput {
  accountId?: string | null;
  publicId: string;
  resourceType: "image" | "video";
  secureUrl: string;
  originalFilename?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  durationSeconds?: number | null;
}

export interface ListMediaOptions {
  page?: number;
  limit?: number;
  resourceType?: "image" | "video" | "all";
  search?: string;
}

export class MediaStorageService {
  /**
   * Generates short-lived signed upload parameters for direct browser-to-Cloudinary upload.
   */
  async createUploadSignature(options: {
    accountId?: string;
    resourceType: "image" | "video";
    filename?: string;
  }) {
    let folder = "aff-thread/general";
    if (options.accountId) {
      try {
        const account = await accountService.getAccount(options.accountId);
        if (account?.threadsUserId) {
          folder = `aff-thread/${account.threadsUserId}`;
        }
      } catch {
        // Fall back to general folder if account lookup fails
      }
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dateFolder = `${folder}/${yyyy}/${mm}`;

    const sanitizedBase = options.filename
      ? options.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40)
      : options.resourceType;
    const publicId = `${crypto.randomUUID()}-${sanitizedBase}`;

    const signed = cloudinaryClient.generateUploadSignature({
      folder: dateFolder,
      publicId,
    });

    const uploadUrl = `https://api.cloudinary.com/v1_1/${signed.cloudName}/${options.resourceType}/upload`;

    return {
      ...signed,
      uploadUrl,
      resourceType: options.resourceType,
    };
  }

  /**
   * Validates and persists normalized metadata for an uploaded Cloudinary asset.
   */
  async registerAsset(input: RegisterAssetInput): Promise<MediaAsset> {
    if (!input.publicId || typeof input.publicId !== "string") {
      throw new Error("Invalid publicId provided");
    }

    if (input.resourceType !== "image" && input.resourceType !== "video") {
      throw new Error("Invalid resourceType: must be 'image' or 'video'");
    }

    // Validate delivery URL
    const urlValidation = cloudinaryClient.validateCloudinaryUrl(input.secureUrl);
    if (!urlValidation.isValid) {
      throw new Error("Invalid media URL: does not match configured Cloudinary delivery domain");
    }

    if (urlValidation.resourceType !== input.resourceType) {
      throw new Error(
        `URL resource type '${urlValidation.resourceType}' does not match registered type '${input.resourceType}'`
      );
    }

    // Validate format
    if (input.format) {
      const normalizedFormat = input.format.toLowerCase();
      const allowedImageFormats = ["jpg", "jpeg", "png", "webp", "gif"];
      const allowedVideoFormats = ["mp4", "mov", "webm"];

      if (input.resourceType === "image" && !allowedImageFormats.includes(normalizedFormat)) {
        throw new Error(`Unsupported image format '${normalizedFormat}'. Allowed: ${allowedImageFormats.join(", ")}`);
      }

      if (input.resourceType === "video" && !allowedVideoFormats.includes(normalizedFormat)) {
        throw new Error(`Unsupported video format '${normalizedFormat}'. Allowed: ${allowedVideoFormats.join(", ")}`);
      }
    }

    // Check if asset with this publicId already exists
    const [existing] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.publicId, input.publicId))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(mediaAssets)
      .values({
        accountId: input.accountId || null,
        storageProvider: "CLOUDINARY",
        publicId: input.publicId,
        resourceType: input.resourceType,
        secureUrl: input.secureUrl,
        originalFilename: input.originalFilename || null,
        bytes: input.bytes || null,
        width: input.width || null,
        height: input.height || null,
        format: input.format || null,
        durationSeconds: input.durationSeconds || null,
        uploadStatus: "READY",
      })
      .returning();

    return created;
  }

  /**
   * Lists media assets with search, filters, and usage reference counts.
   */
  async listMediaAssets(options: ListMediaOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [isNull(mediaAssets.deletedAt)];

    if (options.resourceType && options.resourceType !== "all") {
      conditions.push(eq(mediaAssets.resourceType, options.resourceType));
    }

    if (options.search && options.search.trim().length > 0) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          like(mediaAssets.originalFilename, term),
          like(mediaAssets.publicId, term),
          like(mediaAssets.secureUrl, term)
        )!
      );
    }

    const whereClause = and(...conditions);

    // Get total count
    const [totalRow] = await db
      .select({ value: count() })
      .from(mediaAssets)
      .where(whereClause);
    const total = totalRow?.value || 0;

    // Fetch assets with usage count in postMedia
    const items = await db
      .select({
        id: mediaAssets.id,
        accountId: mediaAssets.accountId,
        storageProvider: mediaAssets.storageProvider,
        publicId: mediaAssets.publicId,
        resourceType: mediaAssets.resourceType,
        secureUrl: mediaAssets.secureUrl,
        originalFilename: mediaAssets.originalFilename,
        bytes: mediaAssets.bytes,
        width: mediaAssets.width,
        height: mediaAssets.height,
        format: mediaAssets.format,
        durationSeconds: mediaAssets.durationSeconds,
        uploadStatus: mediaAssets.uploadStatus,
        deletedAt: mediaAssets.deletedAt,
        createdAt: mediaAssets.createdAt,
        updatedAt: mediaAssets.updatedAt,
        usageCount: sql<number>`cast(count(${postMedia.id}) as integer)`,
      })
      .from(mediaAssets)
      .leftJoin(postMedia, eq(mediaAssets.id, postMedia.mediaAssetId))
      .where(whereClause)
      .groupBy(mediaAssets.id)
      .orderBy(desc(mediaAssets.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      assets: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves an asset by ID with usage count.
   */
  async getMediaAssetById(id: string) {
    const [item] = await db
      .select({
        id: mediaAssets.id,
        accountId: mediaAssets.accountId,
        storageProvider: mediaAssets.storageProvider,
        publicId: mediaAssets.publicId,
        resourceType: mediaAssets.resourceType,
        secureUrl: mediaAssets.secureUrl,
        originalFilename: mediaAssets.originalFilename,
        bytes: mediaAssets.bytes,
        width: mediaAssets.width,
        height: mediaAssets.height,
        format: mediaAssets.format,
        durationSeconds: mediaAssets.durationSeconds,
        uploadStatus: mediaAssets.uploadStatus,
        deletedAt: mediaAssets.deletedAt,
        createdAt: mediaAssets.createdAt,
        updatedAt: mediaAssets.updatedAt,
        usageCount: sql<number>`cast(count(${postMedia.id}) as integer)`,
      })
      .from(mediaAssets)
      .leftJoin(postMedia, eq(mediaAssets.id, postMedia.mediaAssetId))
      .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
      .groupBy(mediaAssets.id)
      .limit(1);

    return item || null;
  }

  /**
   * Deletes a media asset safely:
   * 1. Rejects deletion if referenced by any post in post_media.
   * 2. Calls Cloudinary destroy API.
   * 3. Updates database status to DELETED.
   */
  async deleteMediaAsset(id: string) {
    const asset = await this.getMediaAssetById(id);
    if (!asset) {
      throw new Error("Media asset not found");
    }

    if (asset.usageCount > 0) {
      throw new Error(
        `Cannot delete asset: it is currently referenced by ${asset.usageCount} post(s).`
      );
    }

    // Call Cloudinary destroy API
    await cloudinaryClient.deleteAsset(
      asset.publicId,
      asset.resourceType as "image" | "video"
    );

    // Update database record
    await db
      .update(mediaAssets)
      .set({
        uploadStatus: "DELETED",
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, id));

    return { success: true, message: "Media asset deleted successfully" };
  }

  /**
   * Cleans up unreferenced orphaned assets older than a specified duration.
   */
  async cleanupOrphanedAssets(olderThanHours = 24) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    // Find candidate assets
    const unreferenced = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .leftJoin(postMedia, eq(mediaAssets.id, postMedia.mediaAssetId))
      .where(
        and(
          isNull(mediaAssets.deletedAt),
          lt(mediaAssets.createdAt, cutoff),
          isNull(postMedia.id)
        )
      );

    let deletedCount = 0;
    const errors: string[] = [];

    for (const item of unreferenced) {
      try {
        await this.deleteMediaAsset(item.id);
        deletedCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to delete ${item.id}: ${msg}`);
      }
    }

    return { deletedCount, errors };
  }
}

export const mediaStorageService = new MediaStorageService();
