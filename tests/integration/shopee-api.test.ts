import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getProductsRoute, POST as postProductsRoute } from "@/app/api/shopee/products/route";
import { POST as importRoute } from "@/app/api/shopee/products/import/route";
import { GET as getPoolRoute } from "@/app/api/shopee/weekly-pool/route";
import { GET as getDealsRoute, POST as postDealsRoute } from "@/app/api/shopee/deals/route";
import { POST as runMatcherRoute } from "@/app/api/shopee/matcher/run/route";

describe("Shopee Deal Intelligence API Routes", () => {
  it("GET /api/shopee/products returns paginated products list", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/products?limit=5");
    const res = await getProductsRoute(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);
  });

  it("POST /api/shopee/products validates required fields", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Incomplete product" }),
    });
    const res = await postProductsRoute(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing required fields");
  });

  it("POST /api/shopee/products/import returns validation preview", async () => {
    const csvContent = `title,product_url,affiliate_url,commission_rate,sold_count
Tai nghe test,https://shopee.vn/test1,https://s.shopee.vn/aff1,15%,500`;

    const req = new NextRequest("http://localhost:3000/api/shopee/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "PREVIEW",
        csvContent,
      }),
    });
    const res = await importRoute(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("PREVIEW");
    expect(body.preview.validCount).toBe(1);
    expect(body.preview.rejectedCount).toBe(0);
  });

  it("GET /api/shopee/weekly-pool returns current week pool", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/weekly-pool");
    const res = await getPoolRoute(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.week).toBe("string");
    expect(Array.isArray(body.pool)).toBe(true);
  });

  it("GET /api/shopee/deals returns observations list", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/deals?limit=5");
    const res = await getDealsRoute(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.observations)).toBe(true);
  });

  it("POST /api/shopee/matcher/run rejects missing postId with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/shopee/matcher/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await runMatcherRoute(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing postId");
  });
});
