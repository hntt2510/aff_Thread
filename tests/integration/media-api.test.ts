import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as signUploadPost } from "@/app/api/media/sign-upload/route";
import { POST as registerPost } from "@/app/api/media/register/route";
import { GET as mediaGet } from "@/app/api/media/route";
import { GET as mediaGetById, DELETE as mediaDelete } from "@/app/api/media/[id]/route";
import { POST as cleanupPost } from "@/app/api/internal/media-cleanup/route";
import { mediaStorageService } from "@/services/media-storage.service";
import { cloudinaryClient } from "@/lib/cloudinary/client";
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

describe.skipIf(!isDbReachable)("Media API Endpoints Integration", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    await db.delete(postMedia);
    await db.delete(posts);
    await db.delete(mediaAssets);
    await db.delete(threadsAccounts);
  });

  it("POST /api/media/sign-upload validates resourceType and returns signature", async () => {
    vi.spyOn(cloudinaryClient, "isConfigured").mockReturnValue(true);
    vi.spyOn(cloudinaryClient, "generateUploadSignature").mockReturnValue({
      signature: "sig123",
      timestamp: 1700000000,
      apiKey: "key123",
      cloudName: "cloud123",
      folder: "aff-thread/general/2026/09",
      publicId: "uuid-test",
    });

    // Invalid resourceType
    const invalidReq = new NextRequest("https://localhost/api/media/sign-upload", {
      method: "POST",
      body: JSON.stringify({ resourceType: "audio" }),
    });
    const invalidRes = await signUploadPost(invalidReq);
    expect(invalidRes.status).toBe(400);

    // Valid resourceType
    const validReq = new NextRequest("https://localhost/api/media/sign-upload", {
      method: "POST",
      body: JSON.stringify({ resourceType: "image", filename: "pic.jpg" }),
    });
    const validRes = await signUploadPost(validReq);
    expect(validRes.status).toBe(200);
    const data = await validRes.json();
    expect(data.success).toBe(true);
    expect(data.signature).toBe("sig123");
    expect(data.uploadUrl).toContain("cloud123/image/upload");
  });

  it("POST /api/media/register validates delivery URL and registers asset", async () => {
    vi.spyOn(cloudinaryClient, "validateCloudinaryUrl").mockImplementation((url) => {
      if (url.includes("res.cloudinary.com/testcloud/image/upload")) {
        return { isValid: true, resourceType: "image", cloudName: "testcloud" };
      }
      return { isValid: false };
    });

    // Missing fields
    const badReq = new NextRequest("https://localhost/api/media/register", {
      method: "POST",
      body: JSON.stringify({ publicId: "test" }),
    });
    const badRes = await registerPost(badReq);
    expect(badRes.status).toBe(400);

    // Valid registration
    const req = new NextRequest("https://localhost/api/media/register", {
      method: "POST",
      body: JSON.stringify({
        publicId: "aff-thread/test-1",
        resourceType: "image",
        secureUrl: "https://res.cloudinary.com/testcloud/image/upload/v1/aff-thread/test-1.jpg",
        originalFilename: "test.jpg",
        bytes: 50000,
        width: 1000,
        height: 800,
        format: "jpg",
      }),
    });
    const res = await registerPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.asset.publicId).toBe("aff-thread/test-1");
  });

  it("GET /api/media lists assets with usage counts", async () => {
    vi.spyOn(cloudinaryClient, "validateCloudinaryUrl").mockReturnValue({
      isValid: true,
      resourceType: "image",
      cloudName: "testcloud",
    });

    await mediaStorageService.registerAsset({
      publicId: "aff-thread/asset-list-1",
      resourceType: "image",
      secureUrl: "https://res.cloudinary.com/testcloud/image/upload/v1/aff-thread/asset-list-1.jpg",
      originalFilename: "asset1.jpg",
    });

    const req = new NextRequest("https://localhost/api/media?page=1&limit=10");
    const res = await mediaGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.assets.length).toBe(1);
    expect(data.assets[0].publicId).toBe("aff-thread/asset-list-1");
  });

  it("GET /api/media/[id] returns asset details", async () => {
    vi.spyOn(cloudinaryClient, "validateCloudinaryUrl").mockReturnValue({
      isValid: true,
      resourceType: "image",
      cloudName: "testcloud",
    });

    const asset = await mediaStorageService.registerAsset({
      publicId: "aff-thread/asset-get-1",
      resourceType: "image",
      secureUrl: "https://res.cloudinary.com/testcloud/image/upload/v1/aff-thread/asset-get-1.jpg",
      originalFilename: "my-photo.jpg",
    });

    const req = new NextRequest(`https://localhost/api/media/${asset.id}`);
    const res = await mediaGetById(req, { params: Promise.resolve({ id: asset.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.asset.id).toBe(asset.id);
    expect(data.asset.originalFilename).toBe("my-photo.jpg");
  });

  it("DELETE /api/media/[id] deletes unreferenced asset", async () => {
    vi.spyOn(cloudinaryClient, "validateCloudinaryUrl").mockReturnValue({
      isValid: true,
      resourceType: "image",
      cloudName: "testcloud",
    });
    vi.spyOn(cloudinaryClient, "deleteAsset").mockResolvedValue({ result: "ok" });

    const asset = await mediaStorageService.registerAsset({
      publicId: "aff-thread/asset-delete-1",
      resourceType: "image",
      secureUrl: "https://res.cloudinary.com/testcloud/image/upload/v1/aff-thread/asset-delete-1.jpg",
    });

    const req = new NextRequest(`https://localhost/api/media/${asset.id}`, { method: "DELETE" });
    const res = await mediaDelete(req, { params: Promise.resolve({ id: asset.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("POST /api/internal/media-cleanup enforces CRON_SECRET authorization", async () => {
    process.env.CRON_SECRET = "super_secret_cron_token_min_32_characters";

    // Unauthorized
    const unauthReq = new NextRequest("https://localhost/api/internal/media-cleanup", {
      method: "POST",
    });
    const unauthRes = await cleanupPost(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Authorized
    const authReq = new NextRequest("https://localhost/api/internal/media-cleanup", {
      method: "POST",
      headers: {
        Authorization: "Bearer super_secret_cron_token_min_32_characters",
      },
    });
    const authRes = await cleanupPost(authReq);
    expect(authRes.status).toBe(200);
    const data = await authRes.json();
    expect(data.success).toBe(true);
    expect(typeof data.deletedCount).toBe("number");
  });
});
