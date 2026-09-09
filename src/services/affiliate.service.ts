import { db } from "@/db";
import {
  affiliateCampaigns,
  affiliateLinks,
  affiliateClicks,
  posts,
  AffiliateCampaign,
  AffiliateLink,
} from "@/db/schema";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import crypto from "crypto";

export interface CreateCampaignInput {
  name: string;
  network?: string;
  description?: string;
}

export interface CreateLinkInput {
  destinationUrl: string;
  label?: string;
  campaignId?: string;
  network?: string;
  subId?: string;
  publicSlug?: string;
}

export interface ClickTrackingInput {
  slug: string;
  postId?: string;
  userAgent?: string;
  referer?: string;
  ip?: string;
  country?: string;
}

export interface AffiliateAnalytics {
  summary: {
    totalLinks: number;
    totalCampaigns: number;
    totalClicks: number;
    humanClicks: number;
    botClicks: number;
    clicksLast7Days: number;
  };
  topLinks: {
    id: string;
    label: string | null;
    publicSlug: string;
    destinationUrl: string;
    network: string | null;
    campaignName: string | null;
    totalClicks: number;
    humanClicks: number;
  }[];
  topPosts: {
    id: string;
    accountUsername: string;
    text: string;
    mediaType: string;
    publishedAt: Date | null;
    totalClicks: number;
  }[];
  topReferers: {
    domain: string;
    clicks: number;
  }[];
  recentClicks: {
    id: string;
    linkSlug: string;
    linkLabel: string | null;
    clickedAt: Date;
    userAgentClass: string | null;
    isBot: boolean;
    refererDomain: string | null;
    country: string | null;
  }[];
}

export class AffiliateService {
  /**
   * Campaigns
   */
  async createCampaign(input: CreateCampaignInput): Promise<AffiliateCampaign> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Campaign name cannot be empty");
    }

    const [campaign] = await db
      .insert(affiliateCampaigns)
      .values({
        name,
        network: input.network?.trim() || null,
        description: input.description?.trim() || null,
        status: "ACTIVE",
      })
      .returning();

    return campaign;
  }

  async listCampaigns(): Promise<AffiliateCampaign[]> {
    return await db
      .select()
      .from(affiliateCampaigns)
      .orderBy(desc(affiliateCampaigns.createdAt));
  }

  async updateCampaign(
    id: string,
    data: Partial<CreateCampaignInput> & { status?: "ACTIVE" | "PAUSED" | "ARCHIVED" }
  ): Promise<AffiliateCampaign> {
    const [updated] = await db
      .update(affiliateCampaigns)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(affiliateCampaigns.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Campaign not found: ${id}`);
    }

    return updated;
  }

  /**
   * Links
   */
  async createLink(input: CreateLinkInput): Promise<AffiliateLink> {
    const dest = input.destinationUrl.trim();
    if (!dest) {
      throw new Error("Destination URL is required");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(dest);
    } catch {
      throw new Error("Invalid destination URL format");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Destination URL must use http or https protocol");
    }

    let slug = input.publicSlug ? input.publicSlug.trim().toLowerCase() : "";
    if (slug) {
      // Validate slug format: alphanumeric + hyphen + underscore
      if (!/^[a-z0-9_-]{2,64}$/.test(slug)) {
        throw new Error("Custom slug must be 2-64 alphanumeric characters, dashes, or underscores");
      }
      // Check slug uniqueness
      const [existing] = await db
        .select()
        .from(affiliateLinks)
        .where(eq(affiliateLinks.publicSlug, slug))
        .limit(1);

      if (existing) {
        throw new Error(`Slug '${slug}' is already in use. Please choose another.`);
      }
    } else {
      // Generate a unique 6-character random hex slug
      let generated = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = crypto.randomBytes(4).toString("hex").slice(0, 7);
        const [existing] = await db
          .select()
          .from(affiliateLinks)
          .where(eq(affiliateLinks.publicSlug, candidate))
          .limit(1);

        if (!existing) {
          generated = candidate;
          break;
        }
      }
      if (!generated) {
        generated = `${Date.now().toString(36).slice(-4)}${crypto.randomBytes(2).toString("hex")}`;
      }
      slug = generated;
    }

    const [link] = await db
      .insert(affiliateLinks)
      .values({
        destinationUrl: dest,
        publicSlug: slug,
        label: input.label?.trim() || null,
        campaignId: input.campaignId || null,
        network: input.network?.trim() || null,
        subId: input.subId?.trim() || null,
        status: "ACTIVE",
      })
      .returning();

    return link;
  }

  async listLinks(campaignId?: string): Promise<(AffiliateLink & { campaignName: string | null; clickCount: number })[]> {
    const whereClause = campaignId ? eq(affiliateLinks.campaignId, campaignId) : undefined;

    const rows = await db
      .select({
        link: affiliateLinks,
        campaignName: affiliateCampaigns.name,
      })
      .from(affiliateLinks)
      .leftJoin(affiliateCampaigns, eq(affiliateLinks.campaignId, affiliateCampaigns.id))
      .where(whereClause)
      .orderBy(desc(affiliateLinks.createdAt));

    // Get click counts per link
    const clickCounts = await db
      .select({
        linkId: affiliateClicks.affiliateLinkId,
        count: count(),
      })
      .from(affiliateClicks)
      .groupBy(affiliateClicks.affiliateLinkId);

    const countMap = new Map<string, number>();
    for (const c of clickCounts) {
      countMap.set(c.linkId, Number(c.count));
    }

    return rows.map((r) => ({
      ...r.link,
      campaignName: r.campaignName || null,
      clickCount: countMap.get(r.link.id) || 0,
    }));
  }

  async getLinkBySlug(slug: string): Promise<AffiliateLink | null> {
    const [link] = await db
      .select()
      .from(affiliateLinks)
      .where(eq(affiliateLinks.publicSlug, slug.trim().toLowerCase()))
      .limit(1);

    return link || null;
  }

  async updateLink(
    id: string,
    data: Partial<CreateLinkInput> & { status?: "ACTIVE" | "PAUSED" }
  ): Promise<AffiliateLink> {
    const [updated] = await db
      .update(affiliateLinks)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(affiliateLinks.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Link not found: ${id}`);
    }

    return updated;
  }

  /**
   * Click Tracking & Privacy-Preserving Logging
   */
  async recordClick(
    input: ClickTrackingInput
  ): Promise<{ destinationUrl: string; linkId: string } | null> {
    const link = await this.getLinkBySlug(input.slug);
    if (!link || link.status !== "ACTIVE") {
      return null;
    }

    try {
      const salt = process.env.SESSION_SECRET || "aff_track_salt_v1";
      const anonymizedIpHash = input.ip
        ? crypto
            .createHash("sha256")
            .update(input.ip + salt)
            .digest("hex")
            .slice(0, 16)
        : null;

      const ua = (input.userAgent || "").toLowerCase();
      const botPattern =
        /bot|crawl|spider|facebookexternalhit|facebot|threads|whatsapp|twitterbot|telegrambot|applebot|bingbot|googlebot|duckduckbot|yandex|slurp|curl|wget|python-requests|aiohttp|httpclient/i;
      const isBot = botPattern.test(ua);

      let userAgentClass: "BOT" | "MOBILE" | "DESKTOP" | "UNKNOWN" = "UNKNOWN";
      if (isBot) {
        userAgentClass = "BOT";
      } else if (/mobile|android|iphone|ipad|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
        userAgentClass = "MOBILE";
      } else if (ua) {
        userAgentClass = "DESKTOP";
      }

      let refererDomain: string | null = null;
      if (input.referer) {
        try {
          refererDomain = new URL(input.referer).hostname.toLowerCase();
        } catch {
          refererDomain = null;
        }
      }

      const country = input.country && input.country.length <= 10 ? input.country.toUpperCase() : null;

      await db.insert(affiliateClicks).values({
        affiliateLinkId: link.id,
        postId: input.postId || null,
        campaignId: link.campaignId || null,
        anonymizedIpHash,
        userAgentClass,
        isBot,
        refererDomain,
        country,
      });
    } catch {
      // Non-blocking: database logging error must never break the user redirect
    }

    return {
      destinationUrl: link.destinationUrl,
      linkId: link.id,
    };
  }

  /**
   * Analytics Aggregation
   */
  async getAnalytics(): Promise<AffiliateAnalytics> {
    // 1. Total counts
    const [linksCountRow] = await db.select({ count: count() }).from(affiliateLinks);
    const [campaignsCountRow] = await db.select({ count: count() }).from(affiliateCampaigns);
    const [clicksCountRow] = await db.select({ count: count() }).from(affiliateClicks);
    const [humanClicksRow] = await db
      .select({ count: count() })
      .from(affiliateClicks)
      .where(eq(affiliateClicks.isBot, false));

    const totalLinks = Number(linksCountRow?.count || 0);
    const totalCampaigns = Number(campaignsCountRow?.count || 0);
    const totalClicks = Number(clicksCountRow?.count || 0);
    const humanClicks = Number(humanClicksRow?.count || 0);
    const botClicks = totalClicks - humanClicks;

    // 2. Clicks last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [last7DaysRow] = await db
      .select({ count: count() })
      .from(affiliateClicks)
      .where(gte(affiliateClicks.clickedAt, sevenDaysAgo));

    const clicksLast7Days = Number(last7DaysRow?.count || 0);

    // 3. Top Links with click counts
    const topLinksRows = await db
      .select({
        id: affiliateLinks.id,
        label: affiliateLinks.label,
        publicSlug: affiliateLinks.publicSlug,
        destinationUrl: affiliateLinks.destinationUrl,
        network: affiliateLinks.network,
        campaignName: affiliateCampaigns.name,
        totalClicks: count(affiliateClicks.id),
      })
      .from(affiliateLinks)
      .leftJoin(affiliateCampaigns, eq(affiliateLinks.campaignId, affiliateCampaigns.id))
      .leftJoin(affiliateClicks, eq(affiliateLinks.id, affiliateClicks.affiliateLinkId))
      .groupBy(affiliateLinks.id, affiliateCampaigns.name)
      .orderBy(desc(count(affiliateClicks.id)))
      .limit(10);

    // Human clicks per top link
    const humanClicksByLink = await db
      .select({
        linkId: affiliateClicks.affiliateLinkId,
        humanClicks: count(),
      })
      .from(affiliateClicks)
      .where(eq(affiliateClicks.isBot, false))
      .groupBy(affiliateClicks.affiliateLinkId);

    const humanMap = new Map<string, number>();
    for (const h of humanClicksByLink) {
      humanMap.set(h.linkId, Number(h.humanClicks));
    }

    const topLinks = topLinksRows.map((r) => ({
      id: r.id,
      label: r.label,
      publicSlug: r.publicSlug,
      destinationUrl: r.destinationUrl,
      network: r.network,
      campaignName: r.campaignName,
      totalClicks: Number(r.totalClicks),
      humanClicks: humanMap.get(r.id) || 0,
    }));

    // 4. Top Posts by Clicks
    const topPostsRows = await db
      .select({
        id: posts.id,
        accountUsername: posts.accountUsername,
        text: posts.text,
        mediaType: posts.mediaType,
        publishedAt: posts.publishedAt,
        totalClicks: count(affiliateClicks.id),
      })
      .from(posts)
      .innerJoin(affiliateClicks, eq(posts.id, affiliateClicks.postId))
      .groupBy(posts.id)
      .orderBy(desc(count(affiliateClicks.id)))
      .limit(5);

    const topPosts = topPostsRows.map((p) => ({
      id: p.id,
      accountUsername: p.accountUsername,
      text: p.text,
      mediaType: p.mediaType,
      publishedAt: p.publishedAt,
      totalClicks: Number(p.totalClicks),
    }));

    // 5. Top Referer Domains
    const topReferersRows = await db
      .select({
        domain: affiliateClicks.refererDomain,
        clicks: count(),
      })
      .from(affiliateClicks)
      .where(sql`${affiliateClicks.refererDomain} IS NOT NULL`)
      .groupBy(affiliateClicks.refererDomain)
      .orderBy(desc(count()))
      .limit(5);

    const topReferers = topReferersRows.map((r) => ({
      domain: r.domain || "direct",
      clicks: Number(r.clicks),
    }));

    // 6. Recent 20 clicks
    const recentClicksRows = await db
      .select({
        id: affiliateClicks.id,
        linkSlug: affiliateLinks.publicSlug,
        linkLabel: affiliateLinks.label,
        clickedAt: affiliateClicks.clickedAt,
        userAgentClass: affiliateClicks.userAgentClass,
        isBot: affiliateClicks.isBot,
        refererDomain: affiliateClicks.refererDomain,
        country: affiliateClicks.country,
      })
      .from(affiliateClicks)
      .innerJoin(affiliateLinks, eq(affiliateClicks.affiliateLinkId, affiliateLinks.id))
      .orderBy(desc(affiliateClicks.clickedAt))
      .limit(20);

    return {
      summary: {
        totalLinks,
        totalCampaigns,
        totalClicks,
        humanClicks,
        botClicks,
        clicksLast7Days,
      },
      topLinks,
      topPosts,
      topReferers,
      recentClicks: recentClicksRows,
    };
  }
}

export const affiliateService = new AffiliateService();
