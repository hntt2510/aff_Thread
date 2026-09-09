import { WorkerProductOfferInput, workerProductOfferSchema } from "./schema.js";

/**
 * Normalizer utilities for parsing raw text/attributes scraped from Shopee Affiliate UI
 * into clean, typed, and schema-validated structures.
 */

export function parseSoldCount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return isNaN(raw) || raw < 0 ? null : Math.floor(raw);

  const clean = raw.trim().toLowerCase().replace(/đã bán|sold/g, "").trim();
  if (!clean) return null;

  // Handle "1.2k", "1,5k", "10k+"
  const kMatch = clean.match(/^([\d.,]+)\s*k\+?$/);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(",", "."));
    return isNaN(num) ? null : Math.round(num * 1000);
  }

  // Handle "1.2m"
  const mMatch = clean.match(/^([\d.,]+)\s*m\+?$/);
  if (mMatch) {
    const num = parseFloat(mMatch[1].replace(",", "."));
    return isNaN(num) ? null : Math.round(num * 1000000);
  }

  const plainNum = parseInt(clean.replace(/[^\d]/g, ""), 10);
  return isNaN(plainNum) || plainNum < 0 ? null : plainNum;
}

export function parseCommissionRate(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (isNaN(raw) || raw < 0) return null;
    return raw > 1.0 ? raw : Math.round(raw * 10000) / 100;
  }

  const clean = String(raw).replace(/%/g, "").trim();
  const parsed = parseFloat(clean.replace(",", "."));
  if (isNaN(parsed) || parsed < 0) return null;
  return parsed > 1.0 ? parsed : Math.round(parsed * 10000) / 100;
}

export function parseCommissionAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return isNaN(raw) || raw < 0 ? null : Math.round(raw);

  const clean = String(raw).replace(/[^\d]/g, "");
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) || parsed < 0 ? null : parsed;
}

export function normalizeRawProductOffer(raw: {
  externalProductId?: string | null;
  shopId?: string | null;
  title: string;
  category?: string | null;
  productUrl: string;
  affiliateUrl: string;
  imageUrl?: string | null;
  commissionRate?: string | number | null;
  commissionAmount?: string | number | null;
  soldCount?: string | number | null;
  source?: string;
  capturedAt?: string | Date | null;
  rawMetadataJson?: string | null;
}): WorkerProductOfferInput {
  const capturedAt = raw.capturedAt
    ? new Date(raw.capturedAt).toISOString()
    : new Date().toISOString();

  const normalized: WorkerProductOfferInput = {
    externalProductId: raw.externalProductId?.trim() || null,
    shopId: raw.shopId?.trim() || null,
    title: raw.title.trim(),
    category: raw.category?.trim() || null,
    productUrl: raw.productUrl.trim(),
    affiliateUrl: raw.affiliateUrl.trim(),
    imageUrl: raw.imageUrl?.trim() || null,
    currency: "VND",
    commissionRate: parseCommissionRate(raw.commissionRate),
    commissionAmount: parseCommissionAmount(raw.commissionAmount),
    soldCount: parseSoldCount(raw.soldCount),
    source: raw.source || "SHOPEE_SESSION_WORKER",
    capturedAt,
    rawMetadataJson: raw.rawMetadataJson || null,
  };

  return workerProductOfferSchema.parse(normalized);
}
