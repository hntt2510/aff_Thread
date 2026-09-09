import { describe, it, expect, beforeEach } from "vitest";
import { affiliateService } from "@/services/affiliate.service";
import { db } from "@/db";
import { affiliateCampaigns, affiliateLinks, affiliateClicks } from "@/db/schema";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
let isDbReachable = false;

if (databaseUrl) {
  try {
    const probe = postgres(databaseUrl, { max: 1, connect_timeout: 2 });
    await probe`SELECT 1`;
    await probe.end();
    isDbReachable = true;
  } catch {
    isDbReachable = false;
  }
}

describe.skipIf(!isDbReachable)("Affiliate Tracking & Tracked Redirect Flow", () => {
  beforeEach(async () => {
    await db.delete(affiliateClicks);
    await db.delete(affiliateLinks);
    await db.delete(affiliateCampaigns);
  });

  it("creates a campaign and a link with custom slug", async () => {
    const campaign = await affiliateService.createCampaign({
      name: "Shopee Tech Mega Sale",
      network: "Shopee",
      description: "Q3 Tech campaign",
    });
    expect(campaign.id).toBeDefined();
    expect(campaign.name).toBe("Shopee Tech Mega Sale");

    const link = await affiliateService.createLink({
      destinationUrl: "https://shopee.vn/product/item-12345",
      label: "Wireless Earbuds Promo",
      campaignId: campaign.id,
      publicSlug: "earbuds-deal",
      network: "Shopee",
    });

    expect(link.id).toBeDefined();
    expect(link.publicSlug).toBe("earbuds-deal");
    expect(link.destinationUrl).toBe("https://shopee.vn/product/item-12345");
  });

  it("generates an automatic unique slug if none is provided", async () => {
    const link = await affiliateService.createLink({
      destinationUrl: "https://example.com/target-page",
      label: "Auto slug link",
    });

    expect(link.publicSlug).toBeDefined();
    expect(link.publicSlug.length).toBeGreaterThanOrEqual(6);
  });

  it("records clicks with privacy-preserving IP hash and bot classification", async () => {
    const link = await affiliateService.createLink({
      destinationUrl: "https://example.com/gadget-review",
      label: "Gadget Review",
      publicSlug: "gadget-link",
    });

    // Human mobile click
    const humanClick = await affiliateService.recordClick({
      slug: "gadget-link",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      ip: "203.0.113.195",
      referer: "https://www.threads.net/@influencer",
      country: "VN",
    });

    expect(humanClick).toBeDefined();
    expect(humanClick?.destinationUrl).toBe("https://example.com/gadget-review");

    // Bot click
    const botClick = await affiliateService.recordClick({
      slug: "gadget-link",
      userAgent: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      ip: "198.51.100.42",
      referer: "https://threads.net",
    });

    expect(botClick).toBeDefined();

    // Verify analytics reflects human vs bot
    const analytics = await affiliateService.getAnalytics();
    expect(analytics.summary.totalClicks).toBe(2);
    expect(analytics.summary.humanClicks).toBe(1);
    expect(analytics.summary.botClicks).toBe(1);

    // Verify IP is never saved raw
    const savedClicks = await db.select().from(affiliateClicks);
    expect(savedClicks).toHaveLength(2);
    for (const c of savedClicks) {
      expect(c.anonymizedIpHash).not.toContain("203.0.113.195");
      expect(c.anonymizedIpHash).not.toContain("198.51.100.42");
      expect(c.anonymizedIpHash?.length).toBe(16);
    }
  });

  it("returns null for non-existent or paused links", async () => {
    const result = await affiliateService.recordClick({
      slug: "does-not-exist-slug",
    });
    expect(result).toBeNull();
  });
});
