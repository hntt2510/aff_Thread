/**
 * Deal Image Foundation Contract.
 * Defines the shared schema for future deal image card generators.
 * Guarantees that the generated visual card consumes the IDENTICAL FinalPriceCalculationResult
 * as the deal reply text, preventing price or voucher discrepancy.
 *
 * ONE DEAL FACT PIPELINE
 *
 * Observation
 * → FinalPriceCalculator
 * → DealOpportunityScoringService
 * → Calculation Snapshot
 *    ├── UI
 *    ├── Product Matcher
 *    ├── Reply Composer
 *    └── Future Deal Image
 *
 * INVARIANT: No consumer recalculates financial/deal facts.
 */

import { FinalPriceCalculationResult } from "./final-price-calculator";

export interface DealImagePayload {
  productId: string;
  productTitle: string;
  productImageUrl?: string | null;
  calculation: FinalPriceCalculationResult;
  voucherCode?: string | null;
  saleWindowBadge?: string | null; // e.g. "SALE 12:00" | "FLASH SALE" | "GIÁ SỐC"
  theme?: "SHOPEE_ORANGE" | "DARK_DEAL" | "MINIMAL_CLEAN";
  dimensions?: {
    width: number; // default 1080
    height: number; // default 1080 or 1350 (4:5)
  };
}

export interface DealImageOutput {
  imageUrl?: string;
  publicId?: string;
  bytes?: number;
  format?: string;
  sourceCalculationVersion: string;
  renderedAt: Date;
}

export interface DealImageGenerator {
  generateCard(payload: DealImagePayload): Promise<DealImageOutput>;
}
