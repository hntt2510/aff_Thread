import { v2 as cloudinary } from "cloudinary";
import { getEnv } from "@/lib/env";

export class CloudinaryConfigurationError extends Error {
  constructor(message = "Cloudinary is not configured. Missing required server environment variables.") {
    super(message);
    this.name = "CloudinaryConfigurationError";
  }
}

export interface UploadSignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId: string;
}

export class CloudinaryClient {
  /**
   * Checks if Cloudinary credentials are fully configured on the server.
   */
  isConfigured(): boolean {
    try {
      const env = getEnv();
      return Boolean(
        env.CLOUDINARY_CLOUD_NAME &&
        env.CLOUDINARY_API_KEY &&
        env.CLOUDINARY_API_SECRET
      );
    } catch {
      return false;
    }
  }

  /**
   * Initializes and returns the active credentials or throws if missing (fail-closed).
   */
  private getCredentials() {
    const env = getEnv();
    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new CloudinaryConfigurationError();
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    return { cloudName, apiKey, apiSecret };
  }

  /**
   * Returns safe public configuration parameters (cloud name, API key) for client uploads.
   * NEVER exposes API Secret.
   */
  getPublicConfig(): { cloudName: string; apiKey: string } {
    const { cloudName, apiKey } = this.getCredentials();
    return { cloudName, apiKey };
  }

  /**
   * Generates a signed parameter set for direct browser-to-Cloudinary upload.
   * The signature is derived using HMAC-SHA1 / Cloudinary signature protocol.
   */
  generateUploadSignature(options: {
    folder: string;
    publicId: string;
    timestamp?: number;
  }): UploadSignatureResult {
    const { cloudName, apiKey, apiSecret } = this.getCredentials();
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);

    const paramsToSign: Record<string, string | number> = {
      folder: options.folder,
      public_id: options.publicId,
      timestamp,
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder: options.folder,
      publicId: options.publicId,
    };
  }

  /**
   * Destroys an uploaded asset from Cloudinary storage.
   */
  async deleteAsset(
    publicId: string,
    resourceType: "image" | "video" = "image"
  ): Promise<{ result: string }> {
    this.getCredentials(); // ensures configured

    try {
      const response = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      });

      return {
        result: response.result || "ok",
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Cloudinary asset deletion failed: ${message}`);
    }
  }

  /**
   * Validates whether a given delivery URL belongs to this project's configured Cloudinary cloud.
   */
  validateCloudinaryUrl(urlStr: string): {
    isValid: boolean;
    cloudName?: string;
    resourceType?: "image" | "video";
    publicId?: string;
  } {
    try {
      const parsed = new URL(urlStr);
      if (parsed.protocol !== "https:") return { isValid: false };
      if (parsed.hostname !== "res.cloudinary.com") return { isValid: false };

      const { cloudName } = this.getCredentials();
      const parts = parsed.pathname.split("/").filter(Boolean);

      // Path format: /:cloudName/:resourceType/:deliveryType/:optionalTransformations/:publicId
      if (parts[0] !== cloudName) {
        return { isValid: false };
      }

      const resourceType = parts[1] as "image" | "video";
      if (resourceType !== "image" && resourceType !== "video") {
        return { isValid: false };
      }

      return {
        isValid: true,
        cloudName,
        resourceType,
      };
    } catch {
      return { isValid: false };
    }
  }
}

export const cloudinaryClient = new CloudinaryClient();
