export interface GenerateLinkResult {
  success: boolean;
  shortLink?: string;
  longLink?: string;
  failCode?: number;
  error?: string;
  errorCategory?: "AUTH_EXPIRED" | "CHALLENGE_REQUIRED" | "INVALID_URL" | "RATE_LIMITED" | "NETWORK_ERROR";
}

export interface SessionValidationResult {
  isValid: boolean;
  username?: string;
  affiliateId?: string;
  status: "ACTIVE" | "EXPIRED" | "INVALID" | "CHALLENGE_REQUIRED";
  error?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export class ShopeeDirectApiClient {
  private gqlEndpoint: string;

  constructor(options?: { endpoint?: string }) {
    this.gqlEndpoint =
      options?.endpoint ||
      process.env.SHOPEE_AFFILIATE_GQL_URL ||
      "https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink";
  }

  /**
   * Generates direct affiliate short link (https://s.shopee.vn/...) for a given product URL
   * using authenticated GraphQL API.
   */
  async generateCustomLink(
    originalUrl: string,
    cookieHeader: string,
    subIds?: string[]
  ): Promise<GenerateLinkResult> {
    if (!originalUrl || !originalUrl.startsWith("http")) {
      return {
        success: false,
        error: "Invalid Shopee URL provided",
        errorCategory: "INVALID_URL",
      };
    }

    if (!cookieHeader) {
      return {
        success: false,
        error: "Session cookies are required to generate affiliate links",
        errorCategory: "AUTH_EXPIRED",
      };
    }

    const payload = {
      operationName: "batchGetCustomLink",
      query: `query batchGetCustomLink($linkParams: [CustomLinkParam!]!, $sourceCaller: SourceCaller) {
  batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) {
    shortLink
    longLink
    failCode
  }
}`,
      variables: {
        linkParams: [
          {
            originalLink: originalUrl,
            advancedLinkParams: {
              subId1: subIds?.[0] || "",
              subId2: subIds?.[1] || "",
              subId3: subIds?.[2] || "",
              subId4: subIds?.[3] || "",
              subId5: subIds?.[4] || "",
            },
          },
        ],
        sourceCaller: "CUSTOM_LINK_CALLER",
      },
    };

    try {
      const response = await fetch(this.gqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": DEFAULT_USER_AGENT,
          Referer: "https://affiliate.shopee.vn/",
          Origin: "https://affiliate.shopee.vn",
          Cookie: cookieHeader,
        },
        body: JSON.stringify(payload),
      });

      // Check HTTP status
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: `Shopee rejected session authentication (HTTP ${response.status}). Cookies may be expired.`,
          errorCategory: "AUTH_EXPIRED",
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          error: "Shopee rate limit exceeded. Please wait a moment and try again.",
          errorCategory: "RATE_LIMITED",
        };
      }

      const responseText = await response.text();
      let resJson: any;
      try {
        resJson = JSON.parse(responseText);
      } catch {
        // If response is HTML, it might be a CAPTCHA or Anti-bot challenge
        const lower = responseText.toLowerCase();
        if (lower.includes("challenge") || lower.includes("captcha") || lower.includes("security") || lower.includes("robot")) {
          return {
            success: false,
            error: "Shopee returned anti-bot verification challenge. Fresh browser cookies required.",
            errorCategory: "CHALLENGE_REQUIRED",
          };
        }
        return {
          success: false,
          error: `Unexpected response from Shopee (HTTP ${response.status})`,
          errorCategory: "NETWORK_ERROR",
        };
      }

      // Check GraphQL errors
      if (resJson.errors && Array.isArray(resJson.errors) && resJson.errors.length > 0) {
        const firstErr = resJson.errors[0]?.message || "GraphQL error";
        const isAuthErr =
          firstErr.toLowerCase().includes("auth") ||
          firstErr.toLowerCase().includes("login") ||
          firstErr.toLowerCase().includes("session") ||
          firstErr.toLowerCase().includes("unauthorized");

        return {
          success: false,
          error: `Shopee API error: ${firstErr}`,
          errorCategory: isAuthErr ? "AUTH_EXPIRED" : "NETWORK_ERROR",
        };
      }

      const batchResults = resJson.data?.batchCustomLink;
      if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
        return {
          success: false,
          error: "No link data returned from Shopee Affiliate API",
          errorCategory: "NETWORK_ERROR",
        };
      }

      const result = batchResults[0];
      if (result.failCode && result.failCode !== 0) {
        // Fail code 10001 usually means not an affiliate linkable product, 10002 session expired
        const isAuthFail = result.failCode === 10002 || result.failCode === 10003;
        return {
          success: false,
          failCode: result.failCode,
          error: `Shopee failed to generate link (code: ${result.failCode})`,
          errorCategory: isAuthFail ? "AUTH_EXPIRED" : "INVALID_URL",
        };
      }

      if (!result.shortLink) {
        return {
          success: false,
          error: "Shopee did not return a shortLink for this product",
          errorCategory: "INVALID_URL",
        };
      }

      return {
        success: true,
        shortLink: result.shortLink,
        longLink: result.longLink,
        failCode: 0,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Network error connecting to Shopee: ${msg}`,
        errorCategory: "NETWORK_ERROR",
      };
    }
  }

  /**
   * Validates if the provided session cookies are alive and authenticated.
   */
  async validateSession(cookieHeader: string): Promise<SessionValidationResult> {
    if (!cookieHeader) {
      return {
        isValid: false,
        status: "INVALID",
        error: "Empty cookie header",
      };
    }

    // Test with standard Shopee home/product link to check batchCustomLink authentication
    const testUrl = "https://shopee.vn/product/1/1";
    const result = await this.generateCustomLink(testUrl, cookieHeader);

    if (result.success || (result.failCode !== undefined && result.errorCategory === "INVALID_URL")) {
      // If generateCustomLink succeeded or failed only due to invalid product (not auth expired),
      // the session cookies are authentic and accepted by Shopee!
      return {
        isValid: true,
        status: "ACTIVE",
      };
    }

    if (result.errorCategory === "CHALLENGE_REQUIRED") {
      return {
        isValid: false,
        status: "CHALLENGE_REQUIRED",
        error: result.error,
      };
    }

    if (result.errorCategory === "AUTH_EXPIRED") {
      return {
        isValid: false,
        status: "EXPIRED",
        error: result.error || "Session cookies have expired. Please re-login on Chrome.",
      };
    }

    return {
      isValid: false,
      status: "INVALID",
      error: result.error || "Session validation failed.",
    };
  }
}

export const shopeeDirectApiClient = new ShopeeDirectApiClient();
