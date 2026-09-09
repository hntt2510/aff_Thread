import { Page } from "playwright";
import { SHOPEE_SELECTORS } from "./selectors.js";
import { isAllowedShopeeUrl } from "../normalization/schema.js";

export interface LinkResolutionResult {
  success: boolean;
  affiliateUrl?: string;
  error?: string;
  failureCategory?: "LINK_RESOLUTION_FAILED" | "VALIDATION_FAILED" | "MODAL_TIMEOUT";
}

/**
 * Page object for resolving direct Shopee affiliate links via the official "Get Link" workflow.
 */
export class ShopeeLinkResolverPage {
  constructor(private page: Page) {}

  /**
   * Resolves the direct affiliate link for a specific card on the page.
   */
  async resolveLinkForCard(cardIndex: number): Promise<LinkResolutionResult> {
    try {
      // 1. Locate product card
      let cardSelector = "";
      for (const sel of SHOPEE_SELECTORS.catalog.productCard) {
        if ((await this.page.locator(sel).count()) > 0) {
          cardSelector = sel;
          break;
        }
      }

      if (!cardSelector) {
        return {
          success: false,
          error: "Product cards not found on page",
          failureCategory: "LINK_RESOLUTION_FAILED",
        };
      }

      const card = this.page.locator(cardSelector).nth(cardIndex);

      // 2. Click "Get Link" / "Lấy link" button
      let buttonFound = false;
      for (const btnSel of SHOPEE_SELECTORS.linkModal.getLinkButton) {
        const btn = card.locator(btnSel).first();
        if ((await btn.count()) > 0 && (await btn.isVisible())) {
          await btn.click({ timeout: 5000 });
          buttonFound = true;
          break;
        }
      }

      if (!buttonFound) {
        return {
          success: false,
          error: "Get Link button not found on product card",
          failureCategory: "LINK_RESOLUTION_FAILED",
        };
      }

      // 3. Wait for modal input containing the link
      let affiliateUrl = "";
      for (const inputSel of SHOPEE_SELECTORS.linkModal.linkInput) {
        try {
          const inputLoc = this.page.locator(inputSel).first();
          await inputLoc.waitFor({ state: "visible", timeout: 8000 });
          const val = await inputLoc.inputValue();
          if (val && val.trim().startsWith("http")) {
            affiliateUrl = val.trim();
            break;
          }
        } catch {
          // try next selector
        }
      }

      // Close modal cleanly
      for (const closeSel of SHOPEE_SELECTORS.linkModal.closeButton) {
        try {
          const closeBtn = this.page.locator(closeSel).first();
          if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible())) {
            await closeBtn.click({ timeout: 2000 });
            break;
          }
        } catch {
          // ignore
        }
      }

      if (!affiliateUrl) {
        return {
          success: false,
          error: "Affiliate URL could not be extracted from modal",
          failureCategory: "MODAL_TIMEOUT",
        };
      }

      // 4. Validate URL security allowlist
      if (!isAllowedShopeeUrl(affiliateUrl)) {
        return {
          success: false,
          error: `Extracted URL "${affiliateUrl}" does not match allowed HTTPS Shopee domains`,
          failureCategory: "VALIDATION_FAILED",
        };
      }

      return {
        success: true,
        affiliateUrl,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        failureCategory: "LINK_RESOLUTION_FAILED",
      };
    }
  }
}
