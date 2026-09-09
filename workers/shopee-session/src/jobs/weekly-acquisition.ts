import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { sessionBrowserManager } from "../browser/browser-context.js";
import { SessionStateMachine } from "../session/state-machine.js";
import { ShopeeProductOfferPage } from "../extractors/product-extractor.js";
import { ShopeeLinkResolverPage } from "../extractors/link-resolver.js";
import { normalizeRawProductOffer } from "../normalization/normalizer.js";
import { WorkerAcquisitionBatch, WorkerProductOfferInput } from "../normalization/schema.js";
import { mainAppClient, TransportResponse } from "../transport/main-app-client.js";
import { AcquisitionSummary } from "../types.js";

export interface WeeklyJobOptions {
  dryRun?: boolean;
  targetCount?: number;
  maxCount?: number;
  skipLinkResolution?: boolean;
  profileDir?: string;
  autoSubmit?: boolean;
}

/**
 * Calculates current ISO week (e.g. 2026-W37)
 */
export function getIsoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Coordinates the full weekly Shopee Affiliate catalog and link acquisition workflow.
 */
export class WeeklyAcquisitionRunner {
  private stateMachine = new SessionStateMachine();

  getStateMachine(): SessionStateMachine {
    return this.stateMachine;
  }

  async run(options?: WeeklyJobOptions): Promise<{
    summary: AcquisitionSummary;
    batch?: WorkerAcquisitionBatch;
    transportResult?: TransportResponse;
    requiresOperatorAction?: boolean;
    operatorMessage?: string;
  }> {
    const runId = crypto.randomUUID();
    const week = getIsoWeek();
    const batchId = `SHOPEE_${week}_${runId.substring(0, 8)}`;
    const startedAt = new Date().toISOString();
    const isDryRun = options?.dryRun ?? (process.env.SHOPEE_WORKER_DRY_RUN === "true");
    const targetCount = options?.targetCount || parseInt(process.env.SHOPEE_TARGET_CANDIDATES || "60", 10);
    const maxCount = options?.maxCount || parseInt(process.env.SHOPEE_MAX_CANDIDATES || "100", 10);

    const warnings: string[] = [];
    const rejections: string[] = [];

    // 1. Launch persistent browser & evaluate session state
    const page = await sessionBrowserManager.getPage();
    const offerPage = new ShopeeProductOfferPage(page);
    const linkResolver = new ShopeeLinkResolverPage(page);

    await offerPage.goto();
    const detectedState = await offerPage.detectSessionState();
    this.stateMachine.transitionTo(detectedState);

    if (detectedState === "LOGIN_REQUIRED") {
      return {
        summary: {
          runId,
          batchId,
          week,
          startedAt,
          status: "FAILED",
          discoveredCount: 0,
          normalizedCount: 0,
          linksResolvedCount: 0,
          importedCount: 0,
          rejectedCount: 0,
          warningCount: 1,
          warnings: ["Operator login required. Please run `npm run shopee:login`."],
          rejections: [],
          dryRun: isDryRun,
        },
        requiresOperatorAction: true,
        operatorMessage: "Shopee Affiliate session is expired or not logged in. Please run `npm run shopee:login` interactively.",
      };
    }

    if (detectedState === "CHALLENGE_REQUIRED") {
      return {
        summary: {
          runId,
          batchId,
          week,
          startedAt,
          status: "FAILED",
          discoveredCount: 0,
          normalizedCount: 0,
          linksResolvedCount: 0,
          importedCount: 0,
          rejectedCount: 0,
          warningCount: 1,
          warnings: ["Security challenge encountered on Shopee portal."],
          rejections: [],
          dryRun: isDryRun,
        },
        requiresOperatorAction: true,
        operatorMessage: "Shopee requires manual verification in the opened browser. Complete the verification, then resume.",
      };
    }

    // 2. Discover product cards
    const rawCards = await offerPage.extractVisibleProductCards(maxCount);
    const discoveredCount = rawCards.length;

    if (discoveredCount === 0) {
      warnings.push("No product cards discovered on offer page. UI layout may have changed or page did not finish rendering.");
    }

    // 3. Resolve direct affiliate links and normalize products
    const validProducts: WorkerProductOfferInput[] = [];

    for (const card of rawCards) {
      if (validProducts.length >= targetCount) break;

      let affiliateUrl = "";
      if (options?.skipLinkResolution) {
        // Fallback for tests or dry run without live click interaction
        affiliateUrl = `https://s.shopee.vn/test_${card.externalProductId || card.cardIndex}`;
      } else {
        const linkRes = await linkResolver.resolveLinkForCard(card.cardIndex);
        if (linkRes.success && linkRes.affiliateUrl) {
          affiliateUrl = linkRes.affiliateUrl;
        } else {
          warnings.push(
            `Product "${card.title.substring(0, 30)}...": link resolution failed (${linkRes.error || linkRes.failureCategory})`
          );
          continue; // Skip product if direct affiliate link could not be acquired
        }
      }

      try {
        const normalized = normalizeRawProductOffer({
          externalProductId: card.externalProductId,
          shopId: card.shopId,
          title: card.title,
          category: card.category,
          productUrl: card.productUrl,
          affiliateUrl,
          imageUrl: card.imageUrl,
          commissionRate: card.commissionRate,
          commissionAmount: card.commissionAmount,
          soldCount: card.soldCount,
          source: "SHOPEE_AFFILIATE_SESSION",
        });

        validProducts.push(normalized);
      } catch (err: unknown) {
        rejections.push(`Normalization failed for "${card.title.substring(0, 30)}...": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const batch: WorkerAcquisitionBatch = {
      provider: "SHOPEE",
      acquisitionBatchId: batchId,
      week,
      capturedAt: new Date().toISOString(),
      externalRunId: runId,
      source: "SHOPEE_SESSION_WORKER",
      products: validProducts,
    };

    // 4. Save local run artifacts to worker-data/runs/<run-id>/
    const artifactsDir = path.resolve(process.cwd(), "worker-data", "runs", runId);
    try {
      fs.mkdirSync(artifactsDir, { recursive: true });
      fs.writeFileSync(
        path.join(artifactsDir, "summary.json"),
        JSON.stringify(
          {
            runId,
            batchId,
            week,
            startedAt,
            discoveredCount,
            validCount: validProducts.length,
            warnings,
            rejections,
          },
          null,
          2
        ),
        "utf8"
      );
      fs.writeFileSync(
        path.join(artifactsDir, "normalized-products.json"),
        JSON.stringify(validProducts, null, 2),
        "utf8"
      );
    } catch {
      // Local artifact writing is best-effort
    }

    // 5. Dry-run early exit
    if (isDryRun) {
      return {
        summary: {
          runId,
          batchId,
          week,
          startedAt,
          completedAt: new Date().toISOString(),
          status: "DRY_RUN",
          discoveredCount,
          normalizedCount: validProducts.length,
          linksResolvedCount: validProducts.length,
          importedCount: 0,
          rejectedCount: rejections.length,
          warningCount: warnings.length,
          warnings,
          rejections,
          dryRun: true,
        },
        batch,
      };
    }

    // 6. Submit to Main App if autoSubmit requested
    let transportResult: TransportResponse | undefined;
    if (options?.autoSubmit && validProducts.length > 0) {
      transportResult = await mainAppClient.sendBatch(batch);
    }

    const summary: AcquisitionSummary = {
      runId,
      batchId,
      week,
      startedAt,
      completedAt: new Date().toISOString(),
      status:
        validProducts.length === 0
          ? "FAILED"
          : rejections.length > 0
          ? "PARTIAL"
          : "SUCCESS",
      discoveredCount,
      normalizedCount: validProducts.length,
      linksResolvedCount: validProducts.length,
      importedCount: transportResult?.importedCount ?? 0,
      rejectedCount: rejections.length,
      warningCount: warnings.length,
      warnings,
      rejections,
      dryRun: false,
    };

    return {
      summary,
      batch,
      transportResult,
    };
  }
}

export const weeklyAcquisitionRunner = new WeeklyAcquisitionRunner();
