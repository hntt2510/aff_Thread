import { sessionBrowserManager } from "../browser/browser-context.js";
import { ShopeeProductOfferPage } from "../extractors/product-extractor.js";
import { SessionStateMachine } from "../session/state-machine.js";

async function main() {
  const stateMachine = new SessionStateMachine();
  let dashboardReachable = false;
  let status = "ERROR";

  try {
    const page = await sessionBrowserManager.getPage();
    const offerPage = new ShopeeProductOfferPage(page);

    await offerPage.goto("https://affiliate.shopee.vn");
    dashboardReachable = true;

    const detected = await offerPage.detectSessionState();
    stateMachine.transitionTo(detected);
    status = detected;
  } catch (err: unknown) {
    status = "ERROR";
    stateMachine.transitionTo("ERROR", err instanceof Error ? err.message : String(err));
  } finally {
    await sessionBrowserManager.close();
  }

  const result = stateMachine.getHealthSummary(
    sessionBrowserManager.getProfileDir(),
    dashboardReachable
  );

  console.log(JSON.stringify(result, null, 2));

  if (status === "READY") {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(JSON.stringify({ status: "ERROR", error: err.message }, null, 2));
  await sessionBrowserManager.close();
  process.exit(1);
});
