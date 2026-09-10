import { sessionBrowserManager } from "../browser/browser-context.js";
import { ShopeeProductOfferPage } from "../extractors/product-extractor.js";
import { LoginLifecycleRunner } from "../session/login-lifecycle.js";

async function main() {
  console.log("==================================================");
  console.log("SHOPEE AFFILIATE INTERACTIVE OPERATOR LOGIN");
  console.log("==================================================");
  console.log("Launching persistent Chromium browser in headed mode...");
  console.log(`Profile directory: ${sessionBrowserManager.getProfileDir()}`);
  console.log("\n[i] Please log in to your Shopee Affiliate account in the browser.");
  console.log("[i] Worker never asks for or stores passwords.");
  console.log("[i] If a CAPTCHA puzzle or OTP appears, please solve it manually in the browser.\n");

  const page = await sessionBrowserManager.getPage();
  const offerPage = new ShopeeProductOfferPage(page);

  await offerPage.goto("https://affiliate.shopee.vn");

  const runner = new LoginLifecycleRunner({
    detector: () => offerPage.detectSessionState(),
    browserCloser: () => sessionBrowserManager.close(),
    profileDir: sessionBrowserManager.getProfileDir(),
    pollIntervalMs: 5000,
    heartbeatIntervalMs: 30000,
  });

  await runner.run();
}

main().catch(async (err) => {
  console.error("\n[✗] Error during login session:", err instanceof Error ? err.message : String(err));
  await sessionBrowserManager.close().catch(() => {});
  process.exit(1);
});
