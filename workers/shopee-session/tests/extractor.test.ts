import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, Browser, Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { ShopeeProductOfferPage } from "../src/extractors/product-extractor.js";

describe("ShopeeProductOfferPage Extractor with HTML Fixture", () => {
  let browser: Browser;
  let page: Page;
  let offerPage: ShopeeProductOfferPage;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    offerPage = new ShopeeProductOfferPage(page);

    const fixturePath = path.resolve(__dirname, "fixtures/shopee-offer-card.html");
    const html = fs.readFileSync(fixturePath, "utf8");
    await page.setContent(html);
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it("detects READY session state from user avatar marker in fixture", async () => {
    const state = await offerPage.detectSessionState();
    expect(state).toBe("READY");
  });

  it("extracts visible product cards accurately", async () => {
    const products = await offerPage.extractVisibleProductCards();
    expect(products.length).toBe(2);

    const first = products[0];
    expect(first.title).toBe("Nồi Chiên Không Dầu Sunhouse 6L SHD4026");
    expect(first.category).toBe("Thiết Bị Gia Dụng");
    expect(first.productUrl).toBe("https://shopee.vn/noi-chien-sunhouse-i.12345.67890");
    expect(first.shopId).toBe("12345");
    expect(first.externalProductId).toBe("67890");
    expect(first.commissionRate).toBe(12.5);
    expect(first.commissionAmount).toBe(45000);
    expect(first.soldCount).toBe(1500);

    const second = products[1];
    expect(second.title).toBe("Chuột Không Dây Logitech M331 Silent Plus");
    expect(second.category).toBe("Phụ Kiện Máy Tính");
    expect(second.commissionRate).toBe(8);
    expect(second.soldCount).toBe(12300);
  });
});
