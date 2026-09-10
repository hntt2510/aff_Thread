import { describe, it, expect, vi } from "vitest";
import { ShopeeProductOfferPage } from "../src/extractors/product-extractor.js";
import { Page } from "playwright";

/**
 * Creates a lightweight mock Playwright Page for fast, deterministic session state unit testing
 * without launching any real browsers.
 */
function createMockPage(options: {
  url: string;
  visibleSelectors?: string[];
}): Page {
  const visibleSet = new Set(options.visibleSelectors || []);

  const mockPage = {
    url: vi.fn(() => options.url),
    waitForTimeout: vi.fn(async () => {}),
    $: vi.fn(async (selector: string) => {
      if (visibleSet.has(selector)) {
        return {
          isVisible: vi.fn(async () => true),
        };
      }
      return null;
    }),
  } as unknown as Page;

  return mockPage;
}

describe("Session State Detection & Challenge Handling", () => {
  it("returns NOT_INITIALIZED when page URL is blank or uninitialized", async () => {
    const page = createMockPage({ url: "about:blank" });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("NOT_INITIALIZED");
  });

  it("detects CHALLENGE_REQUIRED when CAPTCHA puzzle or anti-bot verification is present", async () => {
    const page = createMockPage({
      url: "https://affiliate.shopee.vn/verify",
      visibleSelectors: [".shopee-captcha", 'text="Xác minh bảo mật"'],
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("CHALLENGE_REQUIRED");
  });

  it("detects CHALLENGE_REQUIRED when anti-bot unusual traffic page appears", async () => {
    const page = createMockPage({
      url: "https://affiliate.shopee.vn/challenge",
      visibleSelectors: ['text="Hệ thống phát hiện truy cập bất thường"'],
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("CHALLENGE_REQUIRED");
  });

  it("detects EXPIRED when session expired message is visible", async () => {
    const page = createMockPage({
      url: "https://affiliate.shopee.vn/offer/product_offer",
      visibleSelectors: ['text="Phiên đăng nhập đã hết hạn"'],
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("EXPIRED");
  });

  it("detects LOGIN_REQUIRED when on login URL even without form selectors", async () => {
    const page = createMockPage({
      url: "https://affiliate.shopee.vn/login",
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("LOGIN_REQUIRED");
  });

  it("detects LOGIN_REQUIRED when login form is rendered", async () => {
    const page = createMockPage({
      url: "https://affiliate.shopee.vn",
      visibleSelectors: ['form[action*="login"]', 'input[name="loginKey"]'],
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("LOGIN_REQUIRED");
  });

  it("does NOT grant READY merely because user is on an affiliate portal page", async () => {
    // Opening a Shopee page is NOT sufficient for READY
    const page = createMockPage({
      url: "https://affiliate.shopee.vn/some-page",
      visibleSelectors: [], // No authenticated indicators
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).not.toBe("READY");
    expect(state).toBe("LOGIN_REQUIRED");
  });

  it("detects READY only when positive authenticated markers (avatar / username) are confirmed", async () => {
    const page = createMockPage({
      url: "https://affiliate.shopee.vn/offer/product_offer",
      visibleSelectors: ['[data-testid="user-avatar"]', '[data-testid="username"]'],
    });
    const offerPage = new ShopeeProductOfferPage(page);

    const state = await offerPage.detectSessionState();
    expect(state).toBe("READY");
  });
});
