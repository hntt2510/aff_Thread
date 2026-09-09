import { sessionBrowserManager } from "../browser/browser-context.js";
import { ShopeeProductOfferPage } from "../extractors/product-extractor.js";
import { SessionStateMachine } from "../session/state-machine.js";

async function main() {
  console.log("==================================================");
  console.log("SHOPEE AFFILIATE INTERACTIVE OPERATOR LOGIN");
  console.log("==================================================");
  console.log("Launching persistent Chromium browser in headed mode...");
  console.log(`Profile directory: ${sessionBrowserManager.getProfileDir()}`);
  console.log("\n[i] Please log in to your Shopee Affiliate account in the browser.");
  console.log("[i] Worker never asks for or stores passwords.");
  console.log("[i] If a CAPTCHA puzzle appears, please solve it manually in the browser.\n");

  const stateMachine = new SessionStateMachine();
  const page = await sessionBrowserManager.getPage();
  const offerPage = new ShopeeProductOfferPage(page);

  await offerPage.goto("https://affiliate.shopee.vn");

  const startTime = Date.now();
  const timeoutMs = 5 * 60 * 1000; // 5 minutes operator window
  let lastReportedState = "";

  while (Date.now() - startTime < timeoutMs) {
    const currentState = await offerPage.detectSessionState();

    if (currentState !== lastReportedState) {
      lastReportedState = currentState;
      stateMachine.transitionTo(currentState);

      if (currentState === "READY") {
        console.log("\n==================================================");
        console.log("[✓] AUTHENTICATION SUCCESSFUL!");
        console.log("==================================================");
        console.log(`Session Status: READY`);
        console.log(`Verified At:    ${new Date().toISOString()}`);
        console.log(`Profile:        ${sessionBrowserManager.getProfileDir()}`);
        console.log("\nSession profile saved. You can now execute:");
        console.log("  npm run shopee:status");
        console.log("  npm run shopee:weekly");
        await sessionBrowserManager.close();
        process.exit(0);
      } else if (currentState === "CHALLENGE_REQUIRED") {
        console.log("\n[!] SECURITY VERIFICATION REQUIRED:");
        console.log("Shopee has presented a security challenge/CAPTCHA puzzle in the browser.");
        console.log("Please solve it directly in the browser window.\n");
      } else if (currentState === "LOGIN_REQUIRED") {
        console.log("[...] Waiting for operator login in browser window...");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  console.error("\n[✗] Login timed out after 5 minutes.");
  console.error("Please re-run `npm run shopee:login` to try again.");
  await sessionBrowserManager.close();
  process.exit(1);
}

main().catch(async (err) => {
  console.error("\n[✗] Error during login session:", err.message);
  await sessionBrowserManager.close();
  process.exit(1);
});
