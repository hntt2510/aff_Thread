import { describe, it, expect, beforeEach, vi } from "vitest";
import { MediaStorageService } from "@/services/media-storage.service";
import { cloudinaryClient } from "@/lib/cloudinary/client";
import { accountService } from "@/services/account.service";
import { db } from "@/db";
import { mediaAssets, postMedia, posts, threadsAccounts } from "@/db/schema";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
let isDbReachable = false;

if (databaseUrl) {
  try {
    const probe = postgres(databaseUrl, { max: 1, connect_timeout: 2 });
    await probe`SELECT 1`;
    await probe.end();
    isDbReachable = true;
  } catch {
    isDbReachable = false;
  }
}

describe.skipIf(!isDbReachable)("MediaStorageService (PostgreSQL)", () => {
  let service: MediaStorageService;

  beforeEach(async () => {
    service = new MediaStorageService();
    vi.restoreAllMocks();

    await db.delete(postMedia);
    await db.delete(posts);
    await db.delete(mediaAssets);
    await db.delete(threadsAccounts);
  });

  it("generates deterministic upload signature scoped to account and date", async () => {
    vi.spyOn(accountService, "getAccount").mockResolvedValue({
      id: "acc_1",
      threadsUserId: "99887766",
      username: "test_user",
      displayName: "Test User",
    } as any);

    vi.spyOn(cloudinaryClient, "generateUploadSignature").mockReturnValue({
      signature: "mock_sig_123",
      timestamp: 1700000000,
      apiKey: "test_key",
      cloudName: "test_cloud",
      folder: "aff-thread/99887766/2026/09",
      publicId: "uuid-pic.jpg",
    });

    const result = await service.createUploadSignature({
      accountId: "acc_1",
      resourceType: "image",
      filename: "my photo.jpg",
    });

    expect(result.signature).toBe("mock_sig_123");
    expect(result.uploadUrl).toBe("https://api.cloudinary.com/v1_1/test_cloud/image/upload");
    expect(result.resourceType).toBe("image");
  });

  it("registers valid Cloudinary asset and rejects forged URLs", async () => {
    vi.spyOn(cloudinaryClient, "validateCloudinaryUrl").mockImplementation((url) => {
      if (url.includes("res.cloudinary.com/mycloud/image/upload")) {
        return { isValid: true, resourceType: "image", cloudName: "mycloud" };
      }
      return { isValid: false };
    });

    // Valid registration
    const asset = await service.registerAsset({
      publicId: "aff-thread/99887766/2026/09/sample-1",
      resourceType: "image",
      secureUrl: "https://res.cloudinary.com/mycloud/image/upload/v1/aff-thread/sample.jpg",
      originalFilename: "sample.jpg",
      bytes: 102400,
      width: 800,
      height: 600,
      format: "jpg",
    });

    expect(asset.id).toBeDefined();
    expect(asset.publicId).toBe("aff-thread/99887766/2026/09/sample-1");
    expect(asset.uploadStatus).toBe("READY");

    // Forged URL rejection
    await expect(
      service.registerAsset({
        publicId: "aff-thread/forged",
        resourceType: "image",
        secureUrl: "https://attacker.com/evil.jpg",
      })
    ).rejects.toThrow("does not match configured Cloudinary delivery domain");
  });

  it("blocks asset deletion if asset is referenced by existing posts", async () => {
    vi.spyOn(cloudinaryClient, "validateCloudinaryUrl").mockReturnValue({
      isValid: true,
      resourceType: "image",
      cloudName: "mycloud",
    });

    const asset = await service.registerAsset({
      publicId: "aff-thread/sample-used",
      resourceType: "image",
      secureUrl: "https://res.cloudinary.com/mycloud/image/upload/v1/aff-thread/sample-used.jpg",
    });

    // Create account, post, and postMedia referencing this asset
    const [acc] = await db
      .insert(threadsAccounts)
      .values({
        threadsUserId: "user_ref_test",
        username: "reftest",
        displayName: "Ref Test",
        encryptedAccessToken: "enc",
        tokenIv: "iv",
        tokenAuthTag: "tag",
      })
      .returning();

    const [post] = await db
      .insert(posts)
      .values({
        accountId: acc.id,
        accountThreadsUserId: acc.threadsUserId,
        accountUsername: acc.username,
        accountDisplayName: acc.displayName,
        text: "Testing reference",
        mediaType: "IMAGE",
        status: "PUBLISHED",
      })
      .returning();

    await db.insert(postMedia).values({
      postId: post.id,
      mediaAssetId: asset.id,
      mediaKind: "IMAGE",
      sourceUrl: asset.secureUrl,
      position: 0,
    });

    // Attempting to delete should throw
    await expect(service.deleteMediaAsset(asset.id)).rejects.toThrow(
      "Cannot delete asset: it is currently referenced by 1 post(s)"
    );

    // Remove postMedia reference and delete should succeed
    await db.delete(postMedia);

    const destroySpy = vi.spyOn(cloudinaryClient, "deleteAsset").mockResolvedValue({ result: "ok" });
    const deleteRes = await service.deleteMediaAsset(asset.id);
    expect(deleteRes.success).toBe(true);
    expect(destroySpy).toHaveBeenCalledWith("aff-thread/sample-used", "image");
  });
});
