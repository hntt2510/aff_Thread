import { Page } from "playwright";
import { SHOPEE_SELECTORS } from "./selectors.js";
import { parseCommissionAmount, parseCommissionRate, parseSoldCount } from "../normalization/normalizer.js";

export interface RawScrapedProduct {
  externalProductId?: string | null;
  shopId?: string | null;
  title: string;
  category?: string | null;
  productUrl: string;
  imageUrl?: string | null;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  soldCount?: number | null;
  cardIndex: number;
}

/**
 * Page object for the Shopee Affiliate Product Offer catalog surface.
 * Interacts only with rendered UI elements.
 */
export class ShopeeProductOfferPage {
  constructor(private page: Page) {}

  /**
   * Navigates to the product offer surface.
   */
  async goto(url = "https://affiliate.shopee.vn/offer/product_offer"): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    // Allow brief settle time for dynamic client-side redirects
    await this.page.waitForTimeout(1500);
  }

  /**
   * Evaluates current session state based on rendered markers.
   */
  async detectSessionState(): Promise<"READY" | "LOGIN_REQUIRED" | "CHALLENGE_REQUIRED"> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const currentUrl = this.page.url();

        // 1. URL-based quick check
        if (currentUrl.includes("/login") || currentUrl.includes("/buyer/login")) {
          return "LOGIN_REQUIRED";
        }

        // 2. Check for security challenge / captcha
        for (const selector of SHOPEE_SELECTORS.session.challengeContainer) {
          const el = await this.page.$(selector).catch(() => null);
          if (el && (await el.isVisible().catch(() => false))) {
            return "CHALLENGE_REQUIRED";
          }
        }

        // 3. Check for login form markers
        for (const selector of SHOPEE_SELECTORS.session.loginContainer) {
          const el = await this.page.$(selector).catch(() => null);
          if (el && (await el.isVisible().catch(() => false))) {
            return "LOGIN_REQUIRED";
          }
        }

        // 4. Check for authenticated markers
        for (const selector of SHOPEE_SELECTORS.session.userAvatar) {
          const el = await this.page.$(selector).catch(() => null);
          if (el && (await el.isVisible().catch(() => false))) {
            return "READY";
          }
        }

        // Fallback: if on affiliate portal with no login/challenge markers
        if (currentUrl.includes("affiliate.shopee.vn") && !currentUrl.includes("/login")) {
          return "READY";
        }

        return "LOGIN_REQUIRED";
      } catch {
        if (attempt === 0) {
          await this.page.waitForTimeout(1000);
          continue;
        }
      }
    }

    return "LOGIN_REQUIRED";
  }

  /**
   * Scrapes product cards currently visible on the page.
   */
  async extractVisibleProductCards(maxCount = 70): Promise<RawScrapedProduct[]> {
    const products: RawScrapedProduct[] = [];

    // Find card elements using first matching selector
    let cardSelector = "";
    for (const sel of SHOPEE_SELECTORS.catalog.productCard) {
      const count = await this.page.locator(sel).count();
      if (count > 0) {
        cardSelector = sel;
        break;
      }
    }

    if (!cardSelector) {
      return [];
    }

    const cards = this.page.locator(cardSelector);
    const count = await cards.count();
    const limit = Math.min(count, maxCount);

    for (let i = 0; i < limit; i++) {
      const card = cards.nth(i);

      // 1. Extract Title
      let title = "";
      for (const titleSel of SHOPEE_SELECTORS.catalog.productTitle) {
        const titleLoc = card.locator(titleSel).first();
        if ((await titleLoc.count()) > 0) {
          const text = await titleLoc.textContent();
          if (text && text.trim()) {
            title = text.trim();
            break;
          }
        }
      }

      // 2. Extract Product Link
      let productUrl = "";
      for (const linkSel of SHOPEE_SELECTORS.catalog.productLink) {
        const linkLoc = card.locator(linkSel).first();
        if ((await linkLoc.count()) > 0) {
          const href = await linkLoc.getAttribute("href");
          if (href && (href.startsWith("http") || href.startsWith("//"))) {
            productUrl = href.startsWith("//") ? `https:${href}` : href;
            break;
          }
        }
      }

      if (!title || !productUrl) {
        // Skip unparseable card
        continue;
      }

      // 3. Extract Image URL
      let imageUrl: string | null = null;
      for (const imgSel of SHOPEE_SELECTORS.catalog.productImage) {
        const imgLoc = card.locator(imgSel).first();
        if ((await imgLoc.count()) > 0) {
          const src = (await imgLoc.getAttribute("src")) || (await imgLoc.getAttribute("data-src"));
          if (src && (src.startsWith("http") || src.startsWith("//"))) {
            imageUrl = src.startsWith("//") ? `https:${src}` : src;
            break;
          }
        }
      }

      // 4. Extract Commission Rate & Amount
      let rawCommRate: string | null = null;
      for (const rateSel of SHOPEE_SELECTORS.catalog.commissionRate) {
        const rateLoc = card.locator(rateSel).first();
        if ((await rateLoc.count()) > 0) {
          rawCommRate = await rateLoc.textContent();
          if (rawCommRate) break;
        }
      }

      let rawCommAmt: string | null = null;
      for (const amtSel of SHOPEE_SELECTORS.catalog.commissionAmount) {
        const amtLoc = card.locator(amtSel).first();
        if ((await amtLoc.count()) > 0) {
          rawCommAmt = await amtLoc.textContent();
          if (rawCommAmt) break;
        }
      }

      // 5. Extract Sold Count
      let rawSold: string | null = null;
      for (const soldSel of SHOPEE_SELECTORS.catalog.soldCount) {
        const soldLoc = card.locator(soldSel).first();
        if ((await soldLoc.count()) > 0) {
          rawSold = await soldLoc.textContent();
          if (rawSold) break;
        }
      }

      // 6. Extract Category Tag if visible
      let category: string | null = null;
      for (const catSel of SHOPEE_SELECTORS.catalog.categoryTag) {
        const catLoc = card.locator(catSel).first();
        if ((await catLoc.count()) > 0) {
          const text = await catLoc.textContent();
          if (text && text.trim()) {
            category = text.trim();
            break;
          }
        }
      }

      // 7. Parse externalProductId and shopId from productUrl
      let externalProductId: string | null = null;
      let shopId: string | null = null;

      try {
        const urlObj = new URL(productUrl);
        // Shopee URL patterns: -i.{shopId}.{itemId} or /product/{shopId}/{itemId}
        const itemMatch = urlObj.pathname.match(/-i\.(\d+)\.(\d+)/);
        if (itemMatch) {
          shopId = itemMatch[1];
          externalProductId = itemMatch[2];
        } else {
          const slashMatch = urlObj.pathname.match(/\/product\/(\d+)\/(\d+)/);
          if (slashMatch) {
            shopId = slashMatch[1];
            externalProductId = slashMatch[2];
          }
        }
      } catch {
        // ignore
      }

      products.push({
        externalProductId,
        shopId,
        title,
        category,
        productUrl,
        imageUrl,
        commissionRate: parseCommissionRate(rawCommRate),
        commissionAmount: parseCommissionAmount(rawCommAmt),
        soldCount: parseSoldCount(rawSold),
        cardIndex: i,
      });
    }

    return products;
  }
}
