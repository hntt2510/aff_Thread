import { z } from "zod";

export const ALLOWED_SHOPEE_DOMAINS = [
  "shopee.vn",
  "s.shopee.vn",
  "affiliate.shopee.vn",
  "banhang.shopee.vn",
  "vn.shp.ee",
  "shp.ee",
  "shortpe.com",
];

export function isAllowedShopeeUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_SHOPEE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export function isValidHttpUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const workerProductOfferSchema = z.object({
  externalProductId: z.string().nullable().optional(),
  shopId: z.string().nullable().optional(),
  title: z.string().min(1, "Title is required"),
  category: z.string().nullable().optional(),
  productUrl: z.string().url("Product URL must be a valid URL"),
  affiliateUrl: z
    .string()
    .url("Affiliate URL must be a valid URL")
    .refine((url) => isAllowedShopeeUrl(url), {
      message: "Affiliate URL must be an allowed HTTPS Shopee domain",
    }),
  imageUrl: z.string().url().nullable().optional(),
  currency: z.string().default("VND"),
  commissionRate: z.number().nullable().optional(),
  commissionAmount: z.number().nullable().optional(),
  soldCount: z.number().nullable().optional(),
  source: z.string().default("SHOPEE_SESSION_WORKER"),
  capturedAt: z.string(),
  rawMetadataJson: z.string().nullable().optional(),
});

export const workerAcquisitionBatchSchema = z.object({
  provider: z.literal("SHOPEE"),
  acquisitionBatchId: z.string().min(3),
  week: z.string(),
  capturedAt: z.string(),
  externalRunId: z.string().nullable().optional(),
  source: z.string().default("SHOPEE_SESSION_WORKER"),
  products: z.array(workerProductOfferSchema),
});

export type WorkerProductOfferInput = z.infer<typeof workerProductOfferSchema>;
export type WorkerAcquisitionBatch = z.infer<typeof workerAcquisitionBatchSchema>;
