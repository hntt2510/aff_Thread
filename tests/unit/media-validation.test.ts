import { describe, it, expect } from "vitest";
import {
  validateMediaUrl,
  validateMediaItems,
  MediaValidationError,
} from "@/lib/media/validation";

describe("Media URL Validation & SSRF Defense", () => {
  it("accepts valid public HTTPS URLs", () => {
    const validUrls = [
      "https://images.unsplash.com/photo-123456789",
      "https://example.com/video.mp4",
      "https://cdn.mysite.org/assets/image.png?size=large&v=2",
      "https://sub.domain.co.uk:443/file.jpg",
    ];

    for (const url of validUrls) {
      expect(validateMediaUrl(url)).toBe(url);
    }
  });

  it("rejects non-HTTPS protocols", () => {
    const invalidProtocols = [
      "http://example.com/image.jpg",
      "ftp://example.com/image.jpg",
      "file:///etc/passwd",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "javascript:alert(1)",
    ];

    for (const url of invalidProtocols) {
      expect(() => validateMediaUrl(url)).toThrow(MediaValidationError);
      expect(() => validateMediaUrl(url)).toThrow(/HTTPS/i);
    }
  });

  it("rejects non-standard ports", () => {
    const customPorts = [
      "https://example.com:8080/image.jpg",
      "https://example.com:8443/image.jpg",
      "https://example.com:3000/image.jpg",
      "https://example.com:22/image.jpg",
    ];

    for (const url of customPorts) {
      expect(() => validateMediaUrl(url)).toThrow(MediaValidationError);
      expect(() => validateMediaUrl(url)).toThrow(/standard HTTPS port/i);
    }
  });

  it("rejects localhost and cloud metadata domain names", () => {
    const forbiddenDomains = [
      "https://localhost/image.jpg",
      "https://app.localhost/image.jpg",
      "https://server.local/image.jpg",
      "https://metadata.google.internal/computeMetadata/v1",
      "https://metadata/computeMetadata/v1",
      "https://instance-data/latest/meta-data",
    ];

    for (const url of forbiddenDomains) {
      expect(() => validateMediaUrl(url)).toThrow(MediaValidationError);
      expect(() => validateMediaUrl(url)).toThrow(/forbidden/i);
    }
  });

  it("rejects private, loopback, and link-local IPv4 addresses (SSRF)", () => {
    const ssrfUrls = [
      "https://127.0.0.1/image.jpg",
      "https://127.0.0.2/image.jpg",
      "https://10.0.0.1/image.jpg",
      "https://10.255.255.255/image.jpg",
      "https://172.16.0.1/image.jpg",
      "https://172.31.255.255/image.jpg",
      "https://192.168.1.1/image.jpg",
      "https://192.168.0.254/image.jpg",
      "https://169.254.169.254/latest/meta-data", // Cloud metadata
      "https://169.254.1.1/image.jpg",
      "https://0.0.0.0/image.jpg",
      "https://100.64.0.1/image.jpg", // Carrier-grade NAT
      "https://192.0.2.1/image.jpg", // TEST-NET-1
      "https://198.51.100.1/image.jpg", // TEST-NET-2
      "https://203.0.113.1/image.jpg", // TEST-NET-3
      "https://224.0.0.1/image.jpg", // Multicast
      "https://240.0.0.1/image.jpg", // Reserved
    ];

    for (const url of ssrfUrls) {
      expect(() => validateMediaUrl(url)).toThrow(MediaValidationError);
      expect(() => validateMediaUrl(url)).toThrow(/forbidden/i);
    }
  });

  it("rejects internal and loopback IPv6 addresses", () => {
    const ipv6Urls = [
      "https://[::1]/image.jpg",
      "https://[fe80::1]/image.jpg",
      "https://[fc00::1]/image.jpg",
      "https://[fd00::1]/image.jpg",
      "https://[::ffff:127.0.0.1]/image.jpg",
      "https://[::ffff:169.254.169.254]/image.jpg",
    ];

    for (const url of ipv6Urls) {
      expect(() => validateMediaUrl(url)).toThrow(MediaValidationError);
      expect(() => validateMediaUrl(url)).toThrow(/forbidden/i);
    }
  });

  describe("Media Item Constraints by Post Type", () => {
    it("enforces TEXT post constraints (0 media items)", () => {
      expect(validateMediaItems("TEXT", [])).toEqual([]);
      expect(validateMediaItems("TEXT", undefined)).toEqual([]);

      expect(() =>
        validateMediaItems("TEXT", [
          { mediaKind: "IMAGE", sourceUrl: "https://example.com/img.jpg" },
        ])
      ).toThrow(MediaValidationError);
    });

    it("enforces IMAGE post constraints (exactly 1 image)", () => {
      expect(() => validateMediaItems("IMAGE", [])).toThrow(/exactly 1 image/);
      expect(() =>
        validateMediaItems("IMAGE", [
          { mediaKind: "IMAGE", sourceUrl: "https://example.com/img1.jpg" },
          { mediaKind: "IMAGE", sourceUrl: "https://example.com/img2.jpg" },
        ])
      ).toThrow(/exactly 1 image/);

      expect(() =>
        validateMediaItems("IMAGE", [
          { mediaKind: "VIDEO", sourceUrl: "https://example.com/video.mp4" },
        ])
      ).toThrow(/mediaKind 'IMAGE'/);

      const validated = validateMediaItems("IMAGE", [
        { mediaKind: "IMAGE", sourceUrl: "https://example.com/photo.jpg", altText: "Photo description" },
      ]);
      expect(validated).toHaveLength(1);
      expect(validated[0].sourceUrl).toBe("https://example.com/photo.jpg");
      expect(validated[0].position).toBe(0);
      expect(validated[0].altText).toBe("Photo description");
    });

    it("enforces VIDEO post constraints (exactly 1 video)", () => {
      expect(() => validateMediaItems("VIDEO", [])).toThrow(/exactly 1 video/);
      expect(() =>
        validateMediaItems("VIDEO", [
          { mediaKind: "IMAGE", sourceUrl: "https://example.com/img.jpg" },
        ])
      ).toThrow(/mediaKind 'VIDEO'/);

      const validated = validateMediaItems("VIDEO", [
        { mediaKind: "VIDEO", sourceUrl: "https://example.com/clip.mp4" },
      ]);
      expect(validated).toHaveLength(1);
      expect(validated[0].mediaKind).toBe("VIDEO");
      expect(validated[0].position).toBe(0);
    });

    it("enforces CAROUSEL post constraints (2 to 10 items)", () => {
      // Under minimum (< 2)
      expect(() =>
        validateMediaItems("CAROUSEL", [
          { mediaKind: "IMAGE", sourceUrl: "https://example.com/1.jpg" },
        ])
      ).toThrow(/between 2 and 10/);

      // Over maximum (> 10)
      const elevenItems = Array.from({ length: 11 }, (_, i) => ({
        mediaKind: "IMAGE" as const,
        sourceUrl: `https://example.com/${i}.jpg`,
      }));
      expect(() => validateMediaItems("CAROUSEL", elevenItems)).toThrow(/between 2 and 10/);

      // Valid mixed carousel of 3 items
      const validItems = [
        { mediaKind: "IMAGE" as const, sourceUrl: "https://example.com/1.jpg", altText: "Slide 1" },
        { mediaKind: "VIDEO" as const, sourceUrl: "https://example.com/2.mp4" },
        { mediaKind: "IMAGE" as const, sourceUrl: "https://example.com/3.jpg", altText: "Slide 3" },
      ];

      const result = validateMediaItems("CAROUSEL", validItems);
      expect(result).toHaveLength(3);
      expect(result[0].position).toBe(0);
      expect(result[1].position).toBe(1);
      expect(result[2].position).toBe(2);
    });
  });
});
