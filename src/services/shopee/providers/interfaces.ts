/**
 * Provider-neutral interfaces for Shopee Catalog, Affiliate Links, Performance & Deal Observations.
 * Designed to allow clean swapping between Manual Import, CSV Ingestion,
 * future external Shopee Session Worker, or future official Shopee Open Platform APIs
 * without touching core Product Matcher, Pricing, or DB consumers.
 */

export interface RawProductData {
  externalProductId?: string | null;
  shopId?: string | null;
  title: string;
  category?: string | null;
  productUrl: string;
  imageUrl?: string | null;
  currency?: string;
  commissionRate?: number | string | null;
  commissionAmount?: number | null;
  soldCount?: number | null;
  capturedAt?: Date | string | null;
  rawMetadataJson?: string | null;
}

export interface NormalizedProductOffer {
  externalProductId?: string;
  shopId?: string;
  title: string;
  normalizedTitle: string;
  category?: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl?: string;
  currency: string;
  commissionRate?: number;
  commissionAmount?: number;
  soldCount?: number;
  capturedWeek: string;
  capturedAt: Date;
  source: string;
}

export interface ProductCatalogProvider {
  readonly providerId: string;
  fetchProducts(options?: Record<string, any>): Promise<RawProductData[]>;
  normalizeProduct(raw: RawProductData): NormalizedProductOffer;
}

export interface AffiliateLinkProvider {
  readonly providerId: string;
  resolveAffiliateLink(productUrl: string, subId?: string): Promise<string>;
}

export interface RawPerformanceRecord {
  productId?: string;
  externalProductId?: string;
  periodStart: Date;
  periodEnd: Date;
  clicks?: number;
  orders?: number;
  itemsSold?: number;
  orderAmount?: number;
  estimatedCommission?: number;
  source: string;
}

export interface AffiliatePerformanceProvider {
  readonly providerId: string;
  fetchPerformance(periodStart: Date, periodEnd: Date): Promise<RawPerformanceRecord[]>;
}

export interface RawDealObservation {
  productId: string;
  observedPrice?: number;
  originalPrice?: number;
  voucherCode?: string;
  voucherDiscountType?: "PERCENT" | "FIXED";
  voucherDiscountPercent?: number;
  voucherDiscountAmount?: number;
  voucherMaxDiscount?: number;
  voucherMinSpend?: number;
  voucherValidFrom?: Date;
  voucherValidUntil?: Date;
  flashSale?: boolean;
  freeShipping?: boolean;
  observedAt: Date;
  source: string;
  confidence?: number;
}

export interface DealObservationProvider {
  readonly providerId: string;
  observeProductDeal(productId: string, options?: Record<string, any>): Promise<RawDealObservation>;
}
