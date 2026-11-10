// Upload a roster/profile CSV the way the T&P cell does: admin > Student Roster > Choose file > Start Import. Nothing is pre-checked.
// Prints the result the screen shows. Works with any file, so run it on each department's sheet before trusting it in production.
// usage: WEB=... DEMO_PASSWORD=... SEED_ADMIN_EMAIL=... node scripts/e2e-import-sheet.mjs <file.csv> [--headed]   (SLOWMO=400 to follow by eye)
import { resolve } from "node:path";
import { ADMIN, PW, WEB, apiCall, browser, newPage, step, summary } from "./e2e-lib.mjs";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) throw new Error("usage: node scripts/e2e-import-sheet.mjs <file.csv>");

const s = await apiCall("POST", "/auth/login", { body: { email: ADMIN, password: PW } });
const page = await newPage();
await page.goto(`${WEB}/login`);
await page.evaluate((x) => localStorage.setItem("tnp.session", x), JSON.stringify(s));

await step("teacher uploads the sheet from the Student Roster page and the import finishes", async () => {
  await page.goto(`${WEB}/admin/students`);
  await page.getByLabel("CSV file").setInputFiles(resolve(file));
  await page.getByRole("button", { name: "Start Import" }).click();
  await page.getByText("Import finished").waitFor({ timeout: 60_000 });
  const line = (await page.getByText("Import finished").locator("..").innerText()).replace(/\s+/g, " ");
  console.log("      screen says:", line);
  const reasons = {};
  for (const li of await page.locator("li").filter({ has: page.locator("b") }).allInnerTexts()) {
    const why = li.split(":").slice(1).join(":").trim();
    if (why) reasons[why] = (reasons[why] ?? 0) + 1;
  }
  console.log("      skipped because:", reasons);
});

await browser.close();
summary();
