/**
 * Structured CSV Provider for Shopee Catalog Ingestion.
 * Validates URLs, formats, numbers, duplicates, and generates a pre-persistence preview.
 * Persists products idempotently while recording every historical offer snapshot.
 */

import { db } from "@/db";
import { affiliateProducts, affiliateProductOffers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getCurrentIsoWeek } from "../weekly-pool.service";
import { normalizeVietnameseText } from "../relevance-evaluator.service";

export interface CsvImportRow {
  externalProductId?: string;
  shopId?: string;
  title: string;
  category?: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl?: string;
  commissionRate?: number;
  commissionAmount?: number;
  soldCount?: number;
  capturedAt?: Date;
}

export interface ImportPreviewValidation {
  validCount: number;
  warningsCount: number;
  rejectedCount: number;
  duplicateCount: number;
  validRows: CsvImportRow[];
  warnings: Array<{ row: number; message: string }>;
  rejections: Array<{ row: number; reason: string }>;
}

export class CsvProductCatalogProvider {
  readonly providerId = "csv-import-provider";

  /**
   * Parses raw CSV string into tokens, handling quotes and commas.
   */
  parseCsv(csvContent: string): string[][] {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const result: string[][] = [];

    for (const line of lines) {
      const row: string[] = [];
      let inQuote = false;
      let currentToken = "";

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === "," && !inQuote) {
          row.push(currentToken.trim());
          currentToken = "";
        } else {
          currentToken += char;
        }
      }
      row.push(currentToken.trim());
      result.push(row);
    }

    return result;
  }

  private isValidHttpUrl(urlStr: string): boolean {
    if (!urlStr) return false;
    try {
      const u = new URL(urlStr);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Validates raw CSV content and returns a preview report before database persistence.
   */
  validateCsv(csvContent: string): ImportPreviewValidation {
    const rows = this.parseCsv(csvContent);
    if (rows.length === 0) {
      return {
        validCount: 0,
        warningsCount: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        validRows: [],
        warnings: [],
        rejections: [{ row: 0, reason: "Empty CSV file" }],
      };
    }

    const header = rows[0].map((h) => h.toLowerCase().trim().replace(/[\s_-]+/g, ""));
    const getIndex = (keys: string[]) => header.findIndex((h) => keys.includes(h));

    const titleIdx = getIndex(["title", "producttitle", "name", "ten"]);
    const prodUrlIdx = getIndex(["producturl", "link", "url", "productlink"]);
    const affUrlIdx = getIndex(["affiliateurl", "afflink", "linkaff", "shortlink"]);
    const extIdIdx = getIndex(["externalproductid", "productid", "itemid", "id"]);
    const catIdx = getIndex(["category", "danhmucc", "danhmuc"]);
    const imgIdx = getIndex(["imageurl", "image", "anh"]);
    const commRateIdx = getIndex(["commissionrate", "commission", "hoahong", "rate"]);
    const commAmtIdx = getIndex(["commissionamount", "amount", "tienhoahong"]);
    const soldIdx = getIndex(["soldcount", "sold", "daban", "sales"]);
    const dateIdx = getIndex(["capturedat", "date", "ngay"]);

    if (titleIdx === -1 || prodUrlIdx === -1 || affUrlIdx === -1) {
      return {
        validCount: 0,
        warningsCount: 0,
        rejectedCount: 1,
        duplicateCount: 0,
        validRows: [],
        warnings: [],
        rejections: [
          {
            row: 1,
            reason:
              "Missing mandatory columns. CSV must have at least: title, product_url, affiliate_url",
          },
        ],
      };
    }

    const validRows: CsvImportRow[] = [];
    const warnings: Array<{ row: number; message: string }> = [];
    const rejections: Array<{ row: number; reason: string }> = [];
    const seenUrls = new Set<string>();
    let duplicateCount = 0;

    for (let r = 1; r < rows.length; r++) {
      const line = rows[r];
      const rowNum = r + 1;

      const rawTitle = line[titleIdx] || "";
      const rawProdUrl = line[prodUrlIdx] || "";
      const rawAffUrl = line[affUrlIdx] || "";

      // Mandatory validation
      if (!rawTitle.trim()) {
        rejections.push({ row: rowNum, reason: "Title is empty" });
        continue;
      }
      if (!this.isValidHttpUrl(rawProdUrl)) {
        rejections.push({ row: rowNum, reason: `Invalid product URL: "${rawProdUrl}"` });
        continue;
      }
      if (!this.isValidHttpUrl(rawAffUrl)) {
        rejections.push({ row: rowNum, reason: `Invalid affiliate URL: "${rawAffUrl}"` });
        continue;
      }

      // Check duplicates within batch
      const dedupeKey = rawProdUrl.toLowerCase();
      if (seenUrls.has(dedupeKey)) {
        duplicateCount++;
        warnings.push({ row: rowNum, message: "Duplicate product URL in batch. Skipped." });
        continue;
      }
      seenUrls.add(dedupeKey);

      // Parse numbers & warnings
      let commissionRate: number | undefined;
      if (commRateIdx !== -1 && line[commRateIdx]) {
        const rawRate = line[commRateIdx].replace("%", "").trim();
        const parsed = parseFloat(rawRate);
        if (!isNaN(parsed) && parsed >= 0) {
          commissionRate = parsed > 1.0 ? parsed / 100 : parsed;
        } else {
          warnings.push({ row: rowNum, message: `Invalid commission rate "${line[commRateIdx]}" ignored.` });
        }
      }

      let commissionAmount: number | undefined;
      if (commAmtIdx !== -1 && line[commAmtIdx]) {
        const rawAmt = line[commAmtIdx].replace(/[^\d]/g, "");
        const parsed = parseInt(rawAmt, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          commissionAmount = parsed;
        }
      }

      let soldCount: number | undefined;
      if (soldIdx !== -1 && line[soldIdx]) {
        const rawSold = line[soldIdx].replace(/[^\d]/g, "");
        const parsed = parseInt(rawSold, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          soldCount = parsed;
        }
      }

      let capturedAt: Date | undefined;
      if (dateIdx !== -1 && line[dateIdx]) {
        const parsedDate = new Date(line[dateIdx]);
        if (!isNaN(parsedDate.getTime())) {
          capturedAt = parsedDate;
        }
      }

      validRows.push({
        externalProductId: extIdIdx !== -1 && line[extIdIdx] ? line[extIdIdx].trim() : undefined,
        title: rawTitle.trim(),
        productUrl: rawProdUrl.trim(),
        affiliateUrl: rawAffUrl.trim(),
        category: catIdx !== -1 && line[catIdx] ? line[catIdx].trim() : undefined,
        imageUrl: imgIdx !== -1 && this.isValidHttpUrl(line[imgIdx]) ? line[imgIdx].trim() : undefined,
        commissionRate,
        commissionAmount,
        soldCount,
        capturedAt,
      });
    }

    return {
      validCount: validRows.length,
      warningsCount: warnings.length,
      rejectedCount: rejections.length,
      duplicateCount,
      validRows,
      warnings,
      rejections,
    };
  }

  /**
   * Persists validated rows to affiliate_products and affiliate_product_offers.
   */
  async persistImport(
    validRows: CsvImportRow[],
    currentWeek = getCurrentIsoWeek()
  ): Promise<{ insertedProducts: number; updatedProducts: number; createdOffers: number }> {
    let insertedProducts = 0;
    let updatedProducts = 0;
    let createdOffers = 0;

    for (const row of validRows) {
      const now = new Date();
      const normalizedTitle = normalizeVietnameseText(row.title);

      // 1. Check if product already exists
      let existingProduct: typeof affiliateProducts.$inferSelect | undefined;

      if (row.externalProductId) {
        const [found] = await db
          .select()
          .from(affiliateProducts)
          .where(
            and(
              eq(affiliateProducts.provider, "SHOPEE"),
              eq(affiliateProducts.externalProductId, row.externalProductId)
            )
          )
          .limit(1);
        existingProduct = found;
      }

      if (!existingProduct) {
        const [foundByUrl] = await db
          .select()
          .from(affiliateProducts)
          .where(eq(affiliateProducts.productUrl, row.productUrl))
          .limit(1);
        existingProduct = foundByUrl;
      }

      let productId: string;

      if (existingProduct) {
        productId = existingProduct.id;
        // Update product metadata & lastSeenAt
        await db
          .update(affiliateProducts)
          .set({
            title: row.title,
            normalizedTitle,
            category: row.category || existingProduct.category,
            imageUrl: row.imageUrl || existingProduct.imageUrl,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(eq(affiliateProducts.id, productId));
        updatedProducts++;
      } else {
        const [created] = await db
          .insert(affiliateProducts)
          .values({
            provider: "SHOPEE",
            externalProductId: row.externalProductId || null,
            title: row.title,
            normalizedTitle,
            category: row.category || null,
            productUrl: row.productUrl,
            imageUrl: row.imageUrl || null,
            currency: "VND",
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now,
          })
          .returning();
        productId = created.id;
        insertedProducts++;
      }

      // 2. Append new historical offer snapshot in affiliate_product_offers
      await db.insert(affiliateProductOffers).values({
        productId,
        capturedWeek: currentWeek,
        capturedAt: row.capturedAt || now,
        affiliateUrl: row.affiliateUrl,
        commissionRate: row.commissionRate ? String(row.commissionRate) : null,
        commissionAmount: row.commissionAmount || null,
        soldCount: row.soldCount !== undefined ? row.soldCount : null,
        source: "CSV_IMPORT",
        isActive: true,
      });
      createdOffers++;
    }

    return { insertedProducts, updatedProducts, createdOffers };
  }
}

export const csvProductCatalogProvider = new CsvProductCatalogProvider();
