import readline from "node:readline";
import { sessionBrowserManager } from "../browser/browser-context.js";
import { weeklyAcquisitionRunner } from "../jobs/weekly-acquisition.js";
import { mainAppClient } from "../transport/main-app-client.js";

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRunArg = args.some((a) => a.includes("dry-run"));
  const isAutoYes = args.some((a) => a === "--yes" || a === "-y");
  const skipLinkArg = args.some((a) => a.includes("skip-links"));

  const isDryRun = isDryRunArg || process.env.SHOPEE_WORKER_DRY_RUN === "true";

  console.log("==================================================");
  console.log("SHOPEE AFFILIATE WEEKLY CATALOG ACQUISITION");
  console.log("==================================================");
  if (isDryRun) {
    console.log("[MODE: DRY RUN — No data will be sent to Main App]\n");
  }

  try {
    const result = await weeklyAcquisitionRunner.run({
      dryRun: isDryRun,
      skipLinkResolution: skipLinkArg,
      autoSubmit: false,
    });

    if (result.requiresOperatorAction) {
      console.log(`\n[!] ACTION REQUIRED: ${result.operatorMessage}`);
      await sessionBrowserManager.close();
      process.exit(1);
    }

    const { summary, batch } = result;

    console.log("\n==================================================");
    console.log("ACQUISITION PREVIEW");
    console.log("==================================================");
    console.log(`Batch ID:             ${summary.batchId}`);
    console.log(`Target Week:          ${summary.week}`);
    console.log(`Products Discovered:  ${summary.discoveredCount}`);
    console.log(`Normalized Valid:     ${summary.normalizedCount}`);
    console.log(`With Affiliate Links: ${summary.linksResolvedCount}`);
    console.log(`Warnings:             ${summary.warningCount}`);
    console.log(`Rejected:             ${summary.rejectedCount}`);

    if (batch && batch.products.length > 0) {
      console.log("\nSample candidate products:");
      const sample = batch.products.slice(0, 5);
      sample.forEach((p, idx) => {
        const comm = p.commissionRate ? `${p.commissionRate}%` : "N/A";
        const sold = p.soldCount ? `${p.soldCount.toLocaleString()} sold` : "";
        console.log(`  ${idx + 1}. ${p.title.substring(0, 45)}... [Comm: ${comm}, ${sold}]`);
        console.log(`     Link: ${p.affiliateUrl}`);
      });
    }

    if (summary.warnings.length > 0) {
      console.log("\nWarnings encountered:");
      summary.warnings.slice(0, 3).forEach((w) => console.log(`  - ${w}`));
      if (summary.warnings.length > 3) {
        console.log(`  ...and ${summary.warnings.length - 3} more`);
      }
    }

    if (isDryRun) {
      console.log("\n==================================================");
      console.log("DRY RUN COMPLETE — NOTHING IMPORTED TO MAIN APP");
      console.log(`Local run artifacts saved to: worker-data/runs/${summary.runId}/`);
      console.log("==================================================");
      await sessionBrowserManager.close();
      process.exit(0);
    }

    if (!batch || batch.products.length === 0) {
      console.log("\n[!] No valid products available for import.");
      await sessionBrowserManager.close();
      process.exit(1);
    }

    // Interactive confirmation
    let confirmed = isAutoYes;
    if (!confirmed) {
      confirmed = await askConfirmation(
        `\nDo you want to import ${batch.products.length} products to Main App? (y/N): `
      );
    }

    if (!confirmed) {
      console.log("\nImport cancelled by operator. Nothing was sent to Main App.");
      await sessionBrowserManager.close();
      process.exit(0);
    }

    console.log("\nSending batch to Main App...");
    const transportResult = await mainAppClient.sendBatch(batch);

    console.log("\n==================================================");
    console.log("[✓] INGESTION COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
    console.log(`Batch ID:          ${transportResult.batchId}`);
    console.log(`Imported Products: ${transportResult.importedCount}`);
    console.log(`Weekly Pool Items: ${transportResult.poolCount ?? "N/A"}`);
    console.log(`Audit Run ID:      ${transportResult.runId}`);

    await sessionBrowserManager.close();
    process.exit(0);
  } catch (err: unknown) {
    console.error("\n[✗] Acquisition failed:", err instanceof Error ? err.message : String(err));
    await sessionBrowserManager.close();
    process.exit(1);
  }
}

main();
