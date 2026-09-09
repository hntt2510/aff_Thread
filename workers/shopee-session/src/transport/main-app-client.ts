import { WorkerAcquisitionBatch } from "../normalization/schema.js";

export interface TransportResponse {
  success: boolean;
  batchId: string;
  alreadyIngested?: boolean;
  seenCount: number;
  validCount: number;
  importedCount: number;
  rejectedCount: number;
  warningsCount: number;
  warnings?: string[];
  rejections?: string[];
  poolCount?: number;
  runId: string;
}

/**
 * HTTP Client communicating with the Main Application's internal ingestion endpoint.
 * Authenticates via Authorization: Bearer <SHOPEE_WORKER_SECRET>.
 * Employs timing and exponential backoff retry for transient network hiccups.
 */
export class MainAppClient {
  private baseUrl: string;
  private secret: string;

  constructor(options?: { baseUrl?: string; secret?: string }) {
    this.baseUrl = (
      options?.baseUrl ||
      process.env.SHOPEE_MAIN_APP_URL ||
      "http://localhost:3000"
    ).replace(/\/+$/, "");

    this.secret = options?.secret || process.env.SHOPEE_WORKER_SECRET || "";
  }

  isConfigured(): boolean {
    return Boolean(this.secret && this.baseUrl);
  }

  async sendBatch(batch: WorkerAcquisitionBatch, maxRetries = 3): Promise<TransportResponse> {
    if (!this.secret) {
      throw new Error("SHOPEE_WORKER_SECRET is not configured on worker");
    }

    const endpoint = `${this.baseUrl}/api/internal/shopee/catalog-ingest`;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.secret}`,
            "User-Agent": "ShopeeSessionWorker/1.0",
          },
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          const status = response.status;
          let errorText = "";
          try {
            const errJson = await response.json();
            errorText = errJson.error || JSON.stringify(errJson);
          } catch {
            errorText = await response.text();
          }

          if (status === 401) {
            throw new Error(`Main App rejected worker authentication (HTTP 401): ${errorText}`);
          }
          if (status === 400) {
            throw new Error(`Main App rejected payload validation (HTTP 400): ${errorText}`);
          }

          throw new Error(`HTTP ${status} from Main App: ${errorText}`);
        }

        const data = (await response.json()) as TransportResponse;
        return data;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Do not retry 401 or 400
        if (
          lastError.message.includes("HTTP 401") ||
          lastError.message.includes("HTTP 400")
        ) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError || new Error("Failed to send batch after multiple retries");
  }
}

export const mainAppClient = new MainAppClient();
