/**
 * Type definitions for Shopee Session Worker V1.
 */

export type SessionState =
  | "NOT_INITIALIZED"
  | "LOGIN_REQUIRED"
  | "AUTHENTICATING"
  | "READY"
  | "CHALLENGE_REQUIRED"
  | "EXPIRED"
  | "ERROR";

export interface SessionHealthResult {
  status: SessionState;
  verifiedAt: string;
  dashboardReachable: boolean;
  profilePath: string;
  chromeExecutable?: string;
  details?: string;
  errorCategory?: string;
}

export interface WorkerProductOffer {
  externalProductId?: string | null;
  shopId?: string | null;
  title: string;
  category?: string | null;
  productUrl: string;
  affiliateUrl: string;
  imageUrl?: string | null;
  currency: string;
  commissionRate?: number | null;
  commissionAmount?: number | null;
  soldCount?: number | null;
  source: string;
  capturedAt: string;
  rawMetadataJson?: string | null;
}

export interface AcquisitionSummary {
  runId: string;
  batchId: string;
  week: string;
  startedAt: string;
  completedAt?: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "DRY_RUN";
  discoveredCount: number;
  normalizedCount: number;
  linksResolvedCount: number;
  importedCount: number;
  rejectedCount: number;
  warningCount: number;
  warnings: string[];
  rejections: string[];
  dryRun: boolean;
}
