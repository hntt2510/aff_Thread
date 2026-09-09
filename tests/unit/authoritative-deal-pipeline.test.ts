import { describe, it, expect } from "vitest";
import { shopeeDealService } from "@/services/shopee/shopee-deal.service";
import { productMatcherService, MatcherCandidateItem } from "@/services/shopee/product-matcher.service";
import { dealReplyComposerService } from "@/services/shopee/deal-reply-composer.service";
import fs from "node:fs";
import path from "node:path";

describe("Authoritative Server-Side Deal Pipeline & Zero-Drift Protection", () => {
  const evalTime = new Date("2026-09-09T11:40:00.000Z");

  // 1. Authoritative Calculation Tests
  it("100000 + 30% calculates authoritative final price of 70000", () => {
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      evaluationTime: evalTime,
    });

    expect(result.state).toBe("ACTIVE");
    expect(result.applicable).toBe("YES");
    expect(result.basePrice).toBe(100000);
    expect(result.discountAmount).toBe(30000);
    expect(result.estimatedFinalPrice).toBe(70000);
    expect(result.dealScore).toBeGreaterThan(0);
    expect(result.calculationVersion).toBeDefined();
  });

  it("100000 + 30% max 20000 calculates authoritative final price of 80000", () => {
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherMaxDiscount: 20000,
      evaluationTime: evalTime,
    });

    expect(result.state).toBe("ACTIVE");
    expect(result.applicable).toBe("YES");
    expect(result.basePrice).toBe(100000);
    expect(result.discountAmount).toBe(20000); // capped
    expect(result.estimatedFinalPrice).toBe(80000);
  });

  it("100000 + min spend 150000 is NOT APPLICABLE", () => {
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherMinSpend: 150000,
      evaluationTime: evalTime,
    });

    expect(result.applicable).toBe("NO");
    expect(result.discountAmount).toBe(0);
    expect(result.estimatedFinalPrice).toBe(100000);
    expect(result.reason).toContain("Minimum spend");
  });

  it("future voucher returns UPCOMING and warns not to claim future price as current", () => {
    const validFrom = new Date("2026-09-09T12:00:00.000Z");
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidFrom: validFrom,
      evaluationTime: evalTime, // 11:40
    });

    expect(result.state).toBe("UPCOMING");
    expect(result.estimatedFinalPrice).toBe(70000);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("Do not claim");
    expect(result.warning).toContain("as current price");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("expired voucher returns EXPIRED with 0 discount", () => {
    const validUntil = new Date("2026-09-09T11:00:00.000Z");
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 30,
      voucherValidUntil: validUntil,
      evaluationTime: evalTime, // 11:40 > 11:00
    });

    expect(result.state).toBe("EXPIRED");
    expect(result.applicable).toBe("NO");
    expect(result.discountAmount).toBe(0);
    expect(result.estimatedFinalPrice).toBe(100000);
    expect(result.dealScore).toBe(0);
  });

  it("fixed voucher applies exact integer discount amount", () => {
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "FIXED",
      voucherDiscountAmount: 25000,
      evaluationTime: evalTime,
    });

    expect(result.state).toBe("ACTIVE");
    expect(result.applicable).toBe("YES");
    expect(result.discountAmount).toBe(25000);
    expect(result.estimatedFinalPrice).toBe(75000);
  });

  it("unknown eligibility returns UNKNOWN applicability and lower confidence", () => {
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 20,
      userEligibility: "UNKNOWN",
      evaluationTime: evalTime,
    });

    expect(result.applicable).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(1.0);
    expect(result.warning).toBeDefined();
  });

  it("boundary at validFrom: exactly at validFrom is ACTIVE, not UPCOMING", () => {
    const activationTime = new Date("2026-09-09T12:00:00.000Z");
    const result = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 20,
      voucherValidFrom: activationTime,
      evaluationTime: activationTime, // eval == validFrom
    });

    expect(result.state).toBe("ACTIVE");
    expect(result.applicable).toBe("YES");
  });

  it("boundary at validUntil: at validUntil is ACTIVE, after validUntil is EXPIRED", () => {
    const expiryTime = new Date("2026-09-09T12:00:00.000Z");

    // Exact boundary
    const exact = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 20,
      voucherValidUntil: expiryTime,
      evaluationTime: expiryTime,
    });
    expect(exact.state).toBe("ACTIVE");

    // 1 ms after
    const after = shopeeDealService.calculateDeal({
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 20,
      voucherValidUntil: expiryTime,
      evaluationTime: new Date("2026-09-09T12:00:00.001Z"),
    });
    expect(after.state).toBe("EXPIRED");
  });

  // 2. Anti-tampering & Security Authority
  it("server calculates authoritative price even if client injects fabricated calculations", () => {
    // Malicious payload trying to inject false final price
    const input: any = {
      observedPrice: 100000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 10,
      estimatedFinalPrice: 1000, // Fabricated client claim
      discountAmount: 99000, // Fabricated client claim
      dealScore: 100, // Fabricated client claim
      evaluationTime: evalTime,
    };

    const authoritative = shopeeDealService.calculateDeal(input);
    expect(authoritative.discountAmount).toBe(10000); // 10% of 100000
    expect(authoritative.estimatedFinalPrice).toBe(90000); // strictly not 1000!
  });

  // 3. Matcher Audit Test
  it("ProductMatcher consumes authoritative dealOpportunityScore without custom math", () => {
    const candidates: MatcherCandidateItem[] = [
      {
        id: "prod-1",
        title: "Tai nghe gaming không dây",
        productUrl: "https://shopee.vn/p1",
        affiliateUrl: "https://s.shopee.vn/aff1",
        catalogScore: 80,
        dealOpportunityScore: 90, // Authoritative score from DealOpportunityScoringService
      },
    ];

    const matches = productMatcherService.rankCandidates("tìm tai nghe gaming", candidates);
    expect(matches.length).toBe(1);
    expect(matches[0].components.deal).toBe(90);
    expect(matches[0].components.catalog).toBe(80);
  });

  // 4. Composer Audit Test
  it("DealReplyComposer strictly consumes calculation result without recalculating price", () => {
    const calculation = shopeeDealService.calculateDeal({
      observedPrice: 120000,
      voucherDiscountType: "PERCENT",
      voucherDiscountPercent: 25,
      evaluationTime: evalTime,
    });

    const reply = dealReplyComposerService.composeReply([
      {
        title: "Nồi chiên không dầu",
        directAffiliateUrl: "https://s.shopee.vn/test-deal",
        calculation: calculation.calculation,
      },
    ]);

    expect(reply.text).toContain("120.000đ");
    expect(reply.text).toContain("90.000đ");
    expect(reply.text).toContain("tiết kiệm 30.000đ");
    expect(reply.directUrlsUsed).toContain("https://s.shopee.vn/test-deal");
  });

  // 5. Client Source Code Drift Audit
  it("verifies no duplicate calculations exist in the React Shopee client", () => {
    const clientPath = path.resolve(process.cwd(), "src/app/(dashboard)/shopee/page.tsx");
    const content = fs.readFileSync(clientPath, "utf-8");

    // Must not contain the old duplicate function
    expect(content.includes("computeLiveCalculation")).toBe(false);
    expect(content.includes("liveCalc")).toBe(false);

    // Must not contain ad-hoc voucher arithmetic in client
    expect(content.includes("(basePrice * value) / 100")).toBe(false);
    expect(content.includes("basePrice - discountAmount")).toBe(false);

    // Must call the authoritative calculate endpoint
    expect(content.includes("/api/shopee/deals/calculate")).toBe(true);
  });
});
