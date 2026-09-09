import { describe, it, expect, beforeEach, vi } from "vitest";
import { CloudinaryClient, CloudinaryConfigurationError } from "@/lib/cloudinary/client";
import * as envModule from "@/lib/env";
import { v2 as cloudinary } from "cloudinary";

describe("CloudinaryClient", () => {
  let client: CloudinaryClient;

  beforeEach(() => {
    client = new CloudinaryClient();
    vi.restoreAllMocks();
  });

  it("fails closed if environment variables are missing", () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({
      NODE_ENV: "test",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      SESSION_SECRET: "12345678901234567890123456789012",
      THREADS_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgresql://localhost:5432/aff_thread",
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
    } as any);

    expect(client.isConfigured()).toBe(false);
    expect(() => client.getPublicConfig()).toThrow(CloudinaryConfigurationError);
    expect(() =>
      client.generateUploadSignature({ folder: "test", publicId: "asset1" })
    ).toThrow(CloudinaryConfigurationError);
  });

  it("generates correct signature and never exposes API Secret", () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({
      NODE_ENV: "test",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      SESSION_SECRET: "12345678901234567890123456789012",
      THREADS_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgresql://localhost:5432/aff_thread",
      CLOUDINARY_CLOUD_NAME: "demo_cloud",
      CLOUDINARY_API_KEY: "1234567890",
      CLOUDINARY_API_SECRET: "my_super_secret_key",
    } as any);

    expect(client.isConfigured()).toBe(true);

    const publicConfig = client.getPublicConfig();
    expect(publicConfig.cloudName).toBe("demo_cloud");
    expect(publicConfig.apiKey).toBe("1234567890");
    expect((publicConfig as any).apiSecret).toBeUndefined();

    const signed = client.generateUploadSignature({
      folder: "aff-thread/user1/2026/09",
      publicId: "asset-123",
      timestamp: 1700000000,
    });

    expect(signed.cloudName).toBe("demo_cloud");
    expect(signed.apiKey).toBe("1234567890");
    expect(signed.folder).toBe("aff-thread/user1/2026/09");
    expect(signed.publicId).toBe("asset-123");
    expect(signed.timestamp).toBe(1700000000);
    expect(typeof signed.signature).toBe("string");
    expect(signed.signature.length).toBeGreaterThan(10);
    expect((signed as any).apiSecret).toBeUndefined();
  });

  it("validates Cloudinary delivery URLs strictly", () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({
      NODE_ENV: "test",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      SESSION_SECRET: "12345678901234567890123456789012",
      THREADS_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgresql://localhost:5432/aff_thread",
      CLOUDINARY_CLOUD_NAME: "mycloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "sec",
    } as any);

    // Valid image URL
    expect(
      client.validateCloudinaryUrl(
        "https://res.cloudinary.com/mycloud/image/upload/v123456/aff-thread/sample.jpg"
      ).isValid
    ).toBe(true);

    // Valid video URL
    expect(
      client.validateCloudinaryUrl(
        "https://res.cloudinary.com/mycloud/video/upload/v123456/aff-thread/sample.mp4"
      ).isValid
    ).toBe(true);

    // Wrong cloud name
    expect(
      client.validateCloudinaryUrl(
        "https://res.cloudinary.com/othercloud/image/upload/v123456/aff-thread/sample.jpg"
      ).isValid
    ).toBe(false);

    // Insecure HTTP
    expect(
      client.validateCloudinaryUrl(
        "http://res.cloudinary.com/mycloud/image/upload/v123456/aff-thread/sample.jpg"
      ).isValid
    ).toBe(false);

    // Wrong hostname
    expect(
      client.validateCloudinaryUrl(
        "https://evil-cloudinary.com/mycloud/image/upload/v123456/aff-thread/sample.jpg"
      ).isValid
    ).toBe(false);
  });

  it("calls cloudinary destroy when deleting asset", async () => {
    vi.spyOn(envModule, "getEnv").mockReturnValue({
      NODE_ENV: "test",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      SESSION_SECRET: "12345678901234567890123456789012",
      THREADS_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      DATABASE_URL: "postgresql://localhost:5432/aff_thread",
      CLOUDINARY_CLOUD_NAME: "mycloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "sec",
    } as any);

    const destroySpy = vi
      .spyOn(cloudinary.uploader, "destroy")
      .mockResolvedValue({ result: "ok" });

    const res = await client.deleteAsset("aff-thread/test1", "image");
    expect(destroySpy).toHaveBeenCalledWith("aff-thread/test1", {
      resource_type: "image",
      invalidate: true,
    });
    expect(res.result).toBe("ok");
  });
});
