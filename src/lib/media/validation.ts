import type { PostMediaType } from "@/lib/posts/lifecycle";
import type { MediaItemInput } from "./types";

export class MediaValidationError extends Error {
  code: string;

  constructor(message: string, code = "INVALID_MEDIA") {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

/**
 * Validates a media URL to ensure:
 * 1. It is a well-formed URL.
 * 2. Uses HTTPS exclusively.
 * 3. Uses standard HTTPS port (443 or default).
 * 4. Does NOT point to private, loopback, link-local, carrier-grade NAT, or cloud metadata endpoints (SSRF defense).
 */
export function validateMediaUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string" || !urlStr.trim()) {
    throw new MediaValidationError("Media URL cannot be empty", "INVALID_URL");
  }

  const trimmed = urlStr.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new MediaValidationError("Invalid media URL format", "INVALID_URL");
  }

  // 1. Protocol must be https:
  if (parsed.protocol !== "https:") {
    throw new MediaValidationError(
      `Invalid protocol '${parsed.protocol}'. Media URLs must use HTTPS.`,
      "INSECURE_PROTOCOL"
    );
  }

  // 2. Port must be 443 or default
  if (parsed.port && parsed.port !== "443") {
    throw new MediaValidationError(
      `Invalid port '${parsed.port}'. Media URLs must use the standard HTTPS port (443).`,
      "INVALID_PORT"
    );
  }

  const rawHost = parsed.hostname.toLowerCase();
  // Strip brackets for IPv6 hostnames like [::1]
  const hostname = rawHost.startsWith("[") && rawHost.endsWith("]")
    ? rawHost.slice(1, -1)
    : rawHost;

  if (!hostname) {
    throw new MediaValidationError("Media URL missing hostname", "INVALID_HOST");
  }

  // 3. Reject localhost and cloud metadata domains
  const blockedHosts = [
    "localhost",
    "metadata.google.internal",
    "metadata",
    "instance-data",
  ];

  if (blockedHosts.includes(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new MediaValidationError("Access to local or internal hosts is forbidden", "SSRF_FORBIDDEN");
  }

  // 4. Validate IPv4 addresses
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = hostname.match(ipv4Regex);

  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);

    if ([o1, o2, o3, o4].some((o) => o < 0 || o > 255)) {
      throw new MediaValidationError("Invalid IP address in media URL", "INVALID_HOST");
    }

    // 0.0.0.0/8 (Current network)
    if (o1 === 0) {
      throw new MediaValidationError("Access to 0.0.0.0/8 is forbidden", "SSRF_FORBIDDEN");
    }

    // 10.0.0.0/8 (Private)
    if (o1 === 10) {
      throw new MediaValidationError("Access to private network (10.0.0.0/8) is forbidden", "SSRF_FORBIDDEN");
    }

    // 100.64.0.0/10 (Carrier-grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) {
      throw new MediaValidationError("Access to carrier-grade NAT network is forbidden", "SSRF_FORBIDDEN");
    }

    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) {
      throw new MediaValidationError("Access to loopback addresses is forbidden", "SSRF_FORBIDDEN");
    }

    // 169.254.0.0/16 (Link-local & cloud metadata like 169.254.169.254)
    if (o1 === 169 && o2 === 254) {
      throw new MediaValidationError("Access to link-local/cloud metadata addresses is forbidden", "SSRF_FORBIDDEN");
    }

    // 172.16.0.0/12 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) {
      throw new MediaValidationError("Access to private network (172.16.0.0/12) is forbidden", "SSRF_FORBIDDEN");
    }

    // 192.0.2.0/24 (TEST-NET-1)
    if (o1 === 192 && o2 === 0 && o3 === 2) {
      throw new MediaValidationError("Access to documentation network is forbidden", "SSRF_FORBIDDEN");
    }

    // 192.168.0.0/16 (Private)
    if (o1 === 192 && o2 === 168) {
      throw new MediaValidationError("Access to private network (192.168.0.0/16) is forbidden", "SSRF_FORBIDDEN");
    }

    // 198.51.100.0/24 (TEST-NET-2)
    if (o1 === 198 && o2 === 51 && o3 === 100) {
      throw new MediaValidationError("Access to documentation network is forbidden", "SSRF_FORBIDDEN");
    }

    // 203.0.113.0/24 (TEST-NET-3)
    if (o1 === 203 && o2 === 0 && o3 === 113) {
      throw new MediaValidationError("Access to documentation network is forbidden", "SSRF_FORBIDDEN");
    }

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (o1 >= 224) {
      throw new MediaValidationError("Access to multicast or reserved network is forbidden", "SSRF_FORBIDDEN");
    }
  }

  // 5. Validate IPv6 addresses
  if (
    hostname === "::1" ||
    hostname === "::" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc00:") ||
    hostname.startsWith("fd00:") ||
    hostname.startsWith("::ffff:") ||
    hostname.includes("::ffff:")
  ) {
    throw new MediaValidationError("Access to internal or loopback IPv6 addresses is forbidden", "SSRF_FORBIDDEN");
  }

  return trimmed;
}

/**
 * Validates media items structure and count based on post media type:
 * - TEXT: Exactly 0 items
 * - IMAGE: Exactly 1 item of mediaKind 'IMAGE'
 * - VIDEO: Exactly 1 item of mediaKind 'VIDEO'
 * - CAROUSEL: 2 to 10 items of mediaKind 'IMAGE' or 'VIDEO'
 */
export function validateMediaItems(
  mediaType: PostMediaType,
  items: MediaItemInput[] = []
): MediaItemInput[] {
  if (mediaType === "TEXT") {
    if (items.length > 0) {
      throw new MediaValidationError("Text posts cannot have media attachments", "INVALID_MEDIA_COUNT");
    }
    return [];
  }

  if (mediaType === "IMAGE") {
    if (items.length !== 1) {
      throw new MediaValidationError("Image posts must contain exactly 1 image", "INVALID_MEDIA_COUNT");
    }
    const item = items[0];
    if (item.mediaKind !== "IMAGE") {
      throw new MediaValidationError("Image post item must have mediaKind 'IMAGE'", "INVALID_MEDIA_KIND");
    }
    const validatedUrl = validateMediaUrl(item.sourceUrl);
    return [{
      ...item,
      sourceUrl: validatedUrl,
      position: 0,
      altText: item.altText?.slice(0, 1000) || undefined,
    }];
  }

  if (mediaType === "VIDEO") {
    if (items.length !== 1) {
      throw new MediaValidationError("Video posts must contain exactly 1 video", "INVALID_MEDIA_COUNT");
    }
    const item = items[0];
    if (item.mediaKind !== "VIDEO") {
      throw new MediaValidationError("Video post item must have mediaKind 'VIDEO'", "INVALID_MEDIA_KIND");
    }
    const validatedUrl = validateMediaUrl(item.sourceUrl);
    return [{
      ...item,
      sourceUrl: validatedUrl,
      position: 0,
      altText: item.altText?.slice(0, 1000) || undefined,
    }];
  }

  if (mediaType === "CAROUSEL") {
    if (items.length < 2 || items.length > 10) {
      throw new MediaValidationError(
        `Carousel posts must contain between 2 and 10 items (received ${items.length})`,
        "INVALID_MEDIA_COUNT"
      );
    }

    return items.map((item, index) => {
      if (item.mediaKind !== "IMAGE" && item.mediaKind !== "VIDEO") {
        throw new MediaValidationError(
          `Carousel item at position ${index} must be 'IMAGE' or 'VIDEO'`,
          "INVALID_MEDIA_KIND"
        );
      }
      const validatedUrl = validateMediaUrl(item.sourceUrl);
      return {
        ...item,
        sourceUrl: validatedUrl,
        position: index,
        altText: item.altText?.slice(0, 1000) || undefined,
      };
    });
  }

  throw new MediaValidationError(`Unsupported media type '${mediaType}'`, "UNSUPPORTED_TYPE");
}
