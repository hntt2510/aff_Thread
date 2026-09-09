import { describe, it, expect } from "vitest";
import { isAllowedShopeeUrl, isValidHttpUrl } from "../src/normalization/schema.js";

describe("Worker Link Validation & Allowlist", () => {
  it("approves official Shopee short links and affiliate domains", () => {
    expect(isAllowedShopeeUrl("https://s.shopee.vn/8f3aBc12")).toBe(true);
    expect(isAllowedShopeeUrl("https://affiliate.shopee.vn/offer/12345")).toBe(true);
    expect(isAllowedShopeeUrl("https://shopee.vn/product-name-i.111.222")).toBe(true);
    expect(isAllowedShopeeUrl("https://vn.shp.ee/abcdef")).toBe(true);
    expect(isAllowedShopeeUrl("https://shp.ee/xyz123")).toBe(true);
  });

  it("strictly rejects non-HTTPS protocols", () => {
    expect(isAllowedShopeeUrl("http://s.shopee.vn/abc")).toBe(false);
    expect(isAllowedShopeeUrl("http://shopee.vn/item")).toBe(false);
  });

  it("strictly rejects suspicious or unauthorized domains", () => {
    expect(isAllowedShopeeUrl("https://evil-shopee.vn/steal")).toBe(false);
    expect(isAllowedShopeeUrl("https://s.shopee.vn.attacker.com/malicious")).toBe(false);
    expect(isAllowedShopeeUrl("https://google.com")).toBe(false);
    expect(isAllowedShopeeUrl("https://lazada.vn/item")).toBe(false);
    expect(isAllowedShopeeUrl("javascript:alert(document.cookie)")).toBe(false);
    expect(isAllowedShopeeUrl("data:text/html,<script>evil()</script>")).toBe(false);
    expect(isAllowedShopeeUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedShopeeUrl("https://localhost:3000/")).toBe(false);
  });

  it("validates generic HTTP URLs safely", () => {
    expect(isValidHttpUrl("https://shopee.vn/product-title")).toBe(true);
    expect(isValidHttpUrl("http://example.com/test")).toBe(true);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});
