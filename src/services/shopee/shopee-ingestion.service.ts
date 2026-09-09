/**
 * Authoritative Ingestion Service for Shopee Session Worker catalog batches.
 * Validates payload schema, enforces HTTPS Shopee domain allowlist,
 * deduplicates and upserts products idempotently, stores offer snapshots,
 * refreshes weekly pool, and records audit trail in shopee_acquisition_runs.
 */

import { db } from "@/db";
import {
  affiliateProducts,
  affiliateProductOffers,
  shopeeAcquisitionRuns,
  ShopeeAcquisitionStatus,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { normalizeVietnameseText } from "./relevance-evaluator.service";
import { weeklyPoolService, getCurrentIsoWeek } from "./weekly-pool.service";

// Configurable Shopee Domain Allowlist
export const ALLOWED_SHOPEE_DOMAINS = [
  "shopee.vn",
  "s.shopee.vn",
  "affiliate.shopee.vn",
  "banhang.shopee.vn",
  "vn.shp.ee",
  "shp.ee",
  "shortpe.com",
];

export function isAllowedShopeeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_SHOPEE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export function isValidHttpUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const ingestionProductItemSchema = z.object({
  externalProductId: z.string().nullable().optional(),
  shopId: z.string().nullable().optional(),
  title: z.string().min(1, "Title is required"),
  category: z.string().nullable().optional(),
  productUrl: z.string().url("Invalid product URL"),
  affiliateUrl: z.string().url("Invalid affiliate URL"),
  imageUrl: z.string().url().nullable().optional(),
  currency: z.string().default("VND").optional(),
  commissionRate: z.union([z.number(), z.string()]).nullable().optional(),
  commissionAmount: z.number().nullable().optional(),
  soldCount: z.number().nullable().optional(),
  source: z.string().default("SHOPEE_SESSION_WORKER").optional(),
  capturedAt: z.union([z.string(), z.date()]).nullable().optional(),
  rawMetadataJson: z.string().nullable().optional(),
});

export const ingestionPayloadSchema = z.object({
  provider: z.literal("SHOPEE"),
  acquisitionBatchId: z.string().min(3, "acquisitionBatchId is required"),
  week: z.string().regex(/^\d{4}-W\d{2}$/, "week must match YYYY-Www format").optional(),
  capturedAt: z.union([z.string(), z.date()]).optional(),
  externalRunId: z.string().nullable().optional(),
  source: z.string().default("SHOPEE_SESSION_WORKER").optional(),
  products: z.array(ingestionProductItemSchema),
});

export type IngestionProductItem = z.infer<typeof ingestionProductItemSchema>;
export type IngestionPayload = z.infer<typeof ingestionPayloadSchema>;

export interface IngestionResult {
  success: boolean;
  batchId: string;
  alreadyIngested?: boolean;
  seenCount: number;
  validCount: number;
  importedCount: number;
  rejectedCount: number;
  warningsCount: number;
  warnings: string[];
  rejections: string[];
  poolCount?: number;
  runId: string;
}

export class ShopeeIngestionService {
  /**
   * Validates payload schema using Zod.
   */
  validatePayload(payload: unknown): IngestionPayload {
    return ingestionPayloadSchema.parse(payload);
  }

  /**
   * Idempotently ingests a batch of catalog products from the Shopee Session Worker.
   */
  async ingestBatch(rawPayload: unknown): Promise<IngestionResult> {
    const validated = this.validatePayload(rawPayload);
    const now = new Date();
    const week = validated.week || getCurrentIsoWeek(now);
    const batchId = validated.acquisitionBatchId;
    const source = validated.source || "SHOPEE_SESSION_WORKER";

    // 1. Check idempotency: if batch was already successfully completed, return early
    const [existingRun] = await db
      .select()
      .from(shopeeAcquisitionRuns)
      .where(eq(shopeeAcquisitionRuns.acquisitionBatchId, batchId))
      .limit(1);

    if (existingRun && existingRun.status === "SUCCESS") {
      return {
        success: true,
        batchId,
        alreadyIngested: true,
        seenCount: existingRun.productsSeen,
        validCount: existingRun.productsValid,
        importedCount: existingRun.productsImported,
        rejectedCount: existingRun.productsRejected,
        warningsCount: existingRun.warningCount,
        warnings: ["Batch was already processed successfully. Returning existing run record."],
        rejections: [],
        runId: existingRun.id,
      };
    }

    // 2. Initialize or update acquisition audit run
    let runId = existingRun?.id;
    if (!runId) {
      const [createdRun] = await db
        .insert(shopeeAcquisitionRuns)
        .values({
          externalRunId: validated.externalRunId || null,
          acquisitionBatchId: batchId,
          startedAt: now,
          provider: "SHOPEE",
          status: "RUNNING",
          productsSeen: validated.products.length,
          source,
        })
        .returning();
      runId = createdRun.id;
    } else {
      await db
        .update(shopeeAcquisitionRuns)
        .set({
          status: "RUNNING",
          productsSeen: validated.products.length,
          startedAt: now,
        })
        .where(eq(shopeeAcquisitionRuns.id, runId));
    }

    const warnings: string[] = [];
    const rejections: string[] = [];
    const seenUrls = new Set<string>();
    const validItems: IngestionProductItem[] = [];

    // 3. Validate each product: URLs, domain allowlist, required fields, duplicates
    for (let i = 0; i < validated.products.length; i++) {
      const item = validated.products[i];
      const itemLabel = item.title ? `"${item.title.substring(0, 30)}..."` : `Item #${i + 1}`;

      if (!item.title || !item.title.trim()) {
        rejections.push(`${itemLabel}: missing or empty title`);
        continue;
      }

      if (!isValidHttpUrl(item.productUrl)) {
        rejections.push(`${itemLabel}: invalid product URL scheme`);
        continue;
      }

      if (!isAllowedShopeeUrl(item.affiliateUrl)) {
        rejections.push(
          `${itemLabel}: affiliate URL "${item.affiliateUrl}" is not an allowed HTTPS Shopee domain`
        );
        continue;
      }

      const dedupeKey = item.productUrl.toLowerCase();
      if (seenUrls.has(dedupeKey)) {
        warnings.push(`${itemLabel}: duplicate productUrl in batch, skipped duplicate`);
        continue;
      }
      seenUrls.add(dedupeKey);
      validItems.push(item);
    }

    let importedCount = 0;

    // 4. Upsert valid products and create/update offer snapshots
    for (const item of validItems) {
      const normalizedTitle = normalizeVietnameseText(item.title);
      let existingProduct: typeof affiliateProducts.$inferSelect | undefined;

      if (item.externalProductId) {
        const [found] = await db
          .select()
          .from(affiliateProducts)
          .where(
            and(
              eq(affiliateProducts.provider, "SHOPEE"),
              eq(affiliateProducts.externalProductId, item.externalProductId)
            )
          )
          .limit(1);
        existingProduct = found;
      }

      if (!existingProduct) {
        const [foundByUrl] = await db
          .select()
          .from(affiliateProducts)
          .where(eq(affiliateProducts.productUrl, item.productUrl))
          .limit(1);
        existingProduct = foundByUrl;
      }

      let productId: string;

      if (existingProduct) {
        productId = existingProduct.id;
        await db
          .update(affiliateProducts)
          .set({
            title: item.title,
            normalizedTitle,
            category: item.category || existingProduct.category,
            imageUrl: item.imageUrl || existingProduct.imageUrl,
            externalProductId: item.externalProductId || existingProduct.externalProductId,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(affiliateProducts.id, productId));
      } else {
        const [created] = await db
          .insert(affiliateProducts)
          .values({
            provider: "SHOPEE",
            externalProductId: item.externalProductId || null,
            shopId: item.shopId || null,
            title: item.title,
            normalizedTitle,
            category: item.category || null,
            productUrl: item.productUrl,
            imageUrl: item.imageUrl || null,
            currency: item.currency || "VND",
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now,
          })
          .returning();
        productId = created.id;
      }

      // Check if offer snapshot for this week and affiliateUrl already exists
      const [existingOffer] = await db
        .select()
        .from(affiliateProductOffers)
        .where(
          and(
            eq(affiliateProductOffers.productId, productId),
            eq(affiliateProductOffers.capturedWeek, week),
            eq(affiliateProductOffers.affiliateUrl, item.affiliateUrl)
          )
        )
        .limit(1);

      let parsedCommissionRate: string | null = null;
      if (item.commissionRate !== undefined && item.commissionRate !== null) {
        const str = String(item.commissionRate).replace("%", "").trim();
        const num = parseFloat(str);
        if (!isNaN(num) && num >= 0) {
          parsedCommissionRate = num > 1.0 ? String(num / 100) : String(num);
        }
      }

      const capturedAtDate = item.capturedAt ? new Date(item.capturedAt) : now;

      if (existingOffer) {
        await db
          .update(affiliateProductOffers)
          .set({
            commissionRate: parsedCommissionRate ?? existingOffer.commissionRate,
            commissionAmount: item.commissionAmount !== undefined ? item.commissionAmount : existingOffer.commissionAmount,
            soldCount: item.soldCount !== undefined ? item.soldCount : existingOffer.soldCount,
            capturedAt: isNaN(capturedAtDate.getTime()) ? now : capturedAtDate,
            isActive: true,
          })
          .where(eq(affiliateProductOffers.id, existingOffer.id));
      } else {
        await db.insert(affiliateProductOffers).values({
          productId,
          capturedWeek: week,
          capturedAt: isNaN(capturedAtDate.getTime()) ? now : capturedAtDate,
          affiliateUrl: item.affiliateUrl,
          commissionRate: parsedCommissionRate,
          commissionAmount: item.commissionAmount || null,
          soldCount: item.soldCount !== undefined ? item.soldCount : null,
          source,
          sourceMetadataJson: item.rawMetadataJson || null,
          isActive: true,
        });
      }

      importedCount++;
    }

    // 5. Regenerate Weekly Product Pool to incorporate freshly ingested candidates
    let poolCount = 0;
    try {
      const poolItems = await weeklyPoolService.generateWeeklyPool(week);
      poolCount = poolItems.length;
    } catch (err: unknown) {
      warnings.push(`Weekly pool regeneration notice: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 6. Determine final status and update audit record
    const finalStatus: ShopeeAcquisitionStatus =
      importedCount === 0 && rejections.length > 0
        ? "FAILED"
        : rejections.length > 0 || warnings.length > 0
        ? "PARTIAL"
        : "SUCCESS";

    const errorSummary =
      rejections.length > 0
        ? `Rejected ${rejections.length} items:\n${rejections.slice(0, 5).join("\n")}${
            rejections.length > 5 ? `\n...and ${rejections.length - 5} more` : ""
          }`
        : null;

    await db
      .update(shopeeAcquisitionRuns)
      .set({
        status: finalStatus,
        completedAt: new Date(),
        productsValid: validItems.length,
        productsImported: importedCount,
        productsRejected: rejections.length,
        warningCount: warnings.length,
        errorSummary,
        rawMetadataJson: JSON.stringify({
          batchId,
          week,
          warnings: warnings.slice(0, 20),
          rejections: rejections.slice(0, 20),
        }),
      })
      .where(eq(shopeeAcquisitionRuns.id, runId));

    return {
      success: importedCount > 0 || validItems.length === 0,
      batchId,
      seenCount: validated.products.length,
      validCount: validItems.length,
      importedCount,
      rejectedCount: rejections.length,
      warningsCount: warnings.length,
      warnings,
      rejections,
      poolCount,
      runId,
    };
  }

  /**
   * Retrieves the most recent acquisition runs for administrative inspection.
   */
  async getRecentAcquisitionRuns(limit = 10) {
    return db
      .select()
      .from(shopeeAcquisitionRuns)
      .orderBy(desc(shopeeAcquisitionRuns.startedAt))
      .limit(limit);
  }

  /**
   * Retrieves the latest completed acquisition run.
   */
  async getLastAcquisitionRun() {
    const [latest] = await db
      .select()
      .from(shopeeAcquisitionRuns)
      .orderBy(desc(shopeeAcquisitionRuns.startedAt))
      .limit(1);
    return latest || null;
  }
}

export const shopeeIngestionService = new ShopeeIngestionService();
