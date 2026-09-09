import { describe, it, expect } from "vitest";
import { csvProductCatalogProvider } from "@/services/shopee/providers/csv-provider";

describe("CsvProductCatalogProvider", () => {
  it("parses and validates a valid CSV file correctly", () => {
    const csv = `title,product_url,affiliate_url,category,commission_rate,sold_count
Tai nghe bluetooth Pro,https://shopee.vn/product/1,https://s.shopee.vn/aff1,Công nghệ,15%,1200
Bàn phím cơ không dây,https://shopee.vn/product/2,https://s.shopee.vn/aff2,Công nghệ,12%,850`;

    const preview = csvProductCatalogProvider.validateCsv(csv);

    expect(preview.validCount).toBe(2);
    expect(preview.rejectedCount).toBe(0);
    expect(preview.validRows[0].title).toBe("Tai nghe bluetooth Pro");
    expect(preview.validRows[0].commissionRate).toBe(0.15);
    expect(preview.validRows[0].soldCount).toBe(1200);
    expect(preview.validRows[0].affiliateUrl).toBe("https://s.shopee.vn/aff1");
  });

  it("rejects invalid URLs and empty titles", () => {
    const csv = `title,product_url,affiliate_url
,https://shopee.vn/product/1,https://s.shopee.vn/aff1
Valid Product,invalid-url,https://s.shopee.vn/aff2
Another Product,https://shopee.vn/product/3,javascript:alert(1)`;

    const preview = csvProductCatalogProvider.validateCsv(csv);

    expect(preview.validCount).toBe(0);
    expect(preview.rejectedCount).toBe(3);
    expect(preview.rejections[0].reason).toContain("empty");
    expect(preview.rejections[1].reason).toContain("Invalid product URL");
    expect(preview.rejections[2].reason).toContain("Invalid affiliate URL");
  });

  it("detects and skips duplicate URLs within batch", () => {
    const csv = `title,product_url,affiliate_url
Item 1,https://shopee.vn/item,https://s.shopee.vn/aff1
Item 2 Duplicate,https://shopee.vn/item,https://s.shopee.vn/aff2`;

    const preview = csvProductCatalogProvider.validateCsv(csv);

    expect(preview.validCount).toBe(1);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.warnings.some((w) => w.message.includes("Duplicate"))).toBe(true);
  });
});
