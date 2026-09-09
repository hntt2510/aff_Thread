import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { POST } from "@/app/api/internal/shopee/catalog-ingest/route";
import { GET as getAcquisition } from "@/app/api/shopee/acquisition/route";
import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  shopeeAcquisitionRuns,
  affiliateProducts,
  affiliateProductOffers,
  weeklyProductPool,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  isAllowedShopeeUrl,
  ALLOWED_SHOPEE_DOMAINS,
} from "@/services/shopee/shopee-ingestion.service";

const TEST_SECRET = "test-shopee-worker-secret-4091";

describe("Shopee Catalog Ingest Internal API & Service", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPEE_WORKER_SECRET", TEST_SECRET);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    try {
      await db.delete(shopeeAcquisitionRuns).where(eq(shopeeAcquisitionRuns.source, "SHOPEE_SESSION_WORKER"));
    } catch {
      // ignore
    }
  });

  describe("URL & Domain Allowlist Validation", () => {
    it("accepts valid official Shopee HTTPS URLs", () => {
      expect(isAllowedShopeeUrl("https://s.shopee.vn/abcdef123")).toBe(true);
      expect(isAllowedShopeeUrl("https://shopee.vn/product-name-i.123.456")).toBe(true);
      expect(isAllowedShopeeUrl("https://affiliate.shopee.vn/offer/12345")).toBe(true);
      expect(isAllowedShopeeUrl("https://vn.shp.ee/xyz")).toBe(true);
    });

    it("rejects non-HTTPS and unapproved domains", () => {
      expect(isAllowedShopeeUrl("http://s.shopee.vn/abc")).toBe(false); // must be HTTPS
      expect(isAllowedShopeeUrl("https://malicious-site.com/shopee")).toBe(false);
      expect(isAllowedShopeeUrl("https://evil.com?target=s.shopee.vn")).toBe(false);
      expect(isAllowedShopeeUrl("javascript:alert(1)")).toBe(false);
      expect(isAllowedShopeeUrl("data:text/html,bad")).toBe(false);
      expect(isAllowedShopeeUrl("http://localhost:3000")).toBe(false);
      expect(isAllowedShopeeUrl("")).toBe(false);
    });
  });

  describe("Authentication & Security", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/internal/shopee/catalog-ingest", {
        method: "POST",
        body: JSON.stringify({
          provider: "SHOPEE",
          acquisitionBatchId: "TEST_BATCH_01",
          products: [],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns 401 when Bearer token is incorrect", async () => {
      const req = new NextRequest("http://localhost:3000/api/internal/shopee/catalog-ingest", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-secret",
        },
        body: JSON.stringify({
          provider: "SHOPEE",
          acquisitionBatchId: "TEST_BATCH_01",
          products: [],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("unconditionally rejects secret passed in query parameters", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/internal/shopee/catalog-ingest?secret=${TEST_SECRET}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_SECRET}`, // even if header is also present
          },
          body: JSON.stringify({
            provider: "SHOPEE",
            acquisitionBatchId: "TEST_BATCH_01",
            products: [],
          }),
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("Payload Validation", () => {
    it("returns 400 when payload does not conform to Zod schema", async () => {
      const req = new NextRequest("http://localhost:3000/api/internal/shopee/catalog-ingest", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_SECRET}`,
        },
        body: JSON.stringify({
          provider: "UNKNOWN_PROVIDER", // invalid provider
          // missing acquisitionBatchId
          products: "not-an-array",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Validation failed");
      expect(data.details).toBeDefined();
    });
  });

  describe("Ingestion Execution & Idempotency", () => {
    const testBatchId = `TEST_BATCH_${Date.now()}`;
    const testExtId1 = `EXT_ITEM_${Date.now()}_1`;
    const testExtId2 = `EXT_ITEM_${Date.now()}_2`;

    it("successfully ingests products, stores offers, and records audit run", async () => {
      const req = new NextRequest("http://localhost:3000/api/internal/shopee/catalog-ingest", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_SECRET}`,
        },
        body: JSON.stringify({
          provider: "SHOPEE",
          acquisitionBatchId: testBatchId,
          week: "2026-W37",
          capturedAt: new Date().toISOString(),
          externalRunId: "worker-run-999",
          products: [
            {
              externalProductId: testExtId1,
              title: "Nồi Chiên Không Dầu Sunhouse 6L Chính Hãng",
              category: "Gia Dụng",
              productUrl: `https://shopee.vn/sunhouse-noi-chien-${testExtId1}`,
              affiliateUrl: "https://s.shopee.vn/testAffiliateLink1",
              imageUrl: "https://cf.shopee.vn/file/img1.jpg",
              commissionRate: 12.5,
              commissionAmount: 50000,
              soldCount: 3450,
            },
            {
              externalProductId: testExtId2,
              title: "Tai Nghe Bluetooth Không Dây Baseus Bowie E16",
              category: "Thiết Bị Điện Tử",
              productUrl: `https://shopee.vn/baseus-bowie-${testExtId2}`,
              affiliateUrl: "https://s.shopee.vn/testAffiliateLink2",
              commissionRate: "15%",
              soldCount: 8900,
            },
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.batchId).toBe(testBatchId);
      expect(data.importedCount).toBe(2);
      expect(data.rejectedCount).toBe(0);
      expect(data.validCount).toBe(2);

      // Verify DB records
      const [auditRun] = await db
        .select()
        .from(shopeeAcquisitionRuns)
        .where(eq(shopeeAcquisitionRuns.acquisitionBatchId, testBatchId));

      expect(auditRun).toBeDefined();
      expect(auditRun.status).toBe("SUCCESS");
      expect(auditRun.productsImported).toBe(2);
      expect(auditRun.productsSeen).toBe(2);
      expect(auditRun.externalRunId).toBe("worker-run-999");

      // Verify products were inserted
      const [prod1] = await db
        .select()
        .from(affiliateProducts)
        .where(eq(affiliateProducts.externalProductId, testExtId1));

      expect(prod1).toBeDefined();
      expect(prod1.title).toContain("Sunhouse");
      expect(prod1.normalizedTitle).toBeDefined();

      // Verify offer snapshot was created
      const offers = await db
        .select()
        .from(affiliateProductOffers)
        .where(eq(affiliateProductOffers.productId, prod1.id));

      expect(offers.length).toBeGreaterThanOrEqual(1);
      expect(offers[0].affiliateUrl).toBe("https://s.shopee.vn/testAffiliateLink1");
      expect(offers[0].commissionRate).toBe("0.125");
      expect(offers[0].soldCount).toBe(3450);
    });

    it("is idempotent when re-submitting the exact same batchId", async () => {
      const req = new NextRequest("http://localhost:3000/api/internal/shopee/catalog-ingest", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_SECRET}`,
        },
        body: JSON.stringify({
          provider: "SHOPEE",
          acquisitionBatchId: testBatchId,
          week: "2026-W37",
          products: [
            {
              externalProductId: testExtId1,
              title: "Nồi Chiên Không Dầu Sunhouse 6L Chính Hãng",
              productUrl: `https://shopee.vn/sunhouse-noi-chien-${testExtId1}`,
              affiliateUrl: "https://s.shopee.vn/testAffiliateLink1",
            },
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.alreadyIngested).toBe(true);
      expect(data.batchId).toBe(testBatchId);
      expect(data.importedCount).toBe(2); // returns original run stats
    });

    it("handles partial failure when some items have untrusted affiliate domains", async () => {
      const partialBatchId = `TEST_PARTIAL_${Date.now()}`;
      const extValid = `EXT_VALID_${Date.now()}`;
      const extInvalid = `EXT_INVALID_${Date.now()}`;

      const req = new NextRequest("http://localhost:3000/api/internal/shopee/catalog-ingest", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_SECRET}`,
        },
        body: JSON.stringify({
          provider: "SHOPEE",
          acquisitionBatchId: partialBatchId,
          week: "2026-W37",
          products: [
            {
              externalProductId: extValid,
              title: "Sản Phẩm Hợp Lệ Có Link Chuẩn",
              productUrl: `https://shopee.vn/valid-product-${extValid}`,
              affiliateUrl: "https://s.shopee.vn/validAffLink",
            },
            {
              externalProductId: extInvalid,
              title: "Sản Phẩm Link Giả Mạo",
              productUrl: `https://shopee.vn/invalid-product-${extInvalid}`,
              affiliateUrl: "https://malicious-external-domain.com/scam",
            },
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.validCount).toBe(1);
      expect(data.importedCount).toBe(1);
      expect(data.rejectedCount).toBe(1);
      expect(data.rejections.length).toBe(1);
      expect(data.rejections[0]).toContain("not an allowed HTTPS Shopee domain");

      // Check DB audit run status
      const [audit] = await db
        .select()
        .from(shopeeAcquisitionRuns)
        .where(eq(shopeeAcquisitionRuns.acquisitionBatchId, partialBatchId));

      expect(audit.status).toBe("PARTIAL");
      expect(audit.productsImported).toBe(1);
      expect(audit.productsRejected).toBe(1);
    });

    it("provides acquisition runs via GET /api/shopee/acquisition", async () => {
      const req = new NextRequest("http://localhost:3000/api/shopee/acquisition");
      const res = await getAcquisition(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.lastRun).toBeDefined();
      expect(Array.isArray(data.recentRuns)).toBe(true);
    });
  });
});
