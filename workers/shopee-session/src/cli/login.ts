import { sessionBrowserManager } from "../browser/browser-context.js";
import { ShopeeProductOfferPage } from "../extractors/product-extractor.js";
import { LoginLifecycleRunner } from "../session/login-lifecycle.js";

async function main() {
  console.log("==================================================");
  console.log("SHOPEE AFFILIATE REAL CHROME OPERATOR LOGIN");
  console.log("==================================================");
  console.log("Dedicated Profile: " + sessionBrowserManager.getProfileDir());
  console.log("Remote Debug Port: " + sessionBrowserManager.getDebugPort());
  console.log("\nLaunching real Google Chrome with dedicated profile...");
  console.log("[i] Please log in to your Shopee Affiliate account in the Chrome window.");
  console.log("[i] Worker never asks for or stores passwords.");
  console.log("[i] If a CAPTCHA puzzle or OTP appears, please solve it manually in Chrome.\n");

  const page = await sessionBrowserManager.getPage();
  const chromePath = sessionBrowserManager.getChromeExecutablePath();
  if (chromePath) {
    console.log(`[i] Active Chrome executable: ${chromePath}`);
  }

  const offerPage = new ShopeeProductOfferPage(page);
  await offerPage.goto("https://affiliate.shopee.vn");

  const runner = new LoginLifecycleRunner({
    detector: () => offerPage.detectSessionState(),
    browserCloser: () => sessionBrowserManager.close(),
    profileDir: sessionBrowserManager.getProfileDir(),
    executablePath: chromePath,
    pollIntervalMs: 5000,
    heartbeatIntervalMs: 30000,
  });

  await runner.run();
}

main().catch(async (err) => {
  console.error(
    "\n[✗] Error during login session:",
    err instanceof Error ? err.message : String(err)
  );
  await sessionBrowserManager.close().catch(() => {});
  process.exit(1);
});
