// Every page of every portal at phone width (390px): nothing may scroll sideways and no page may throw.
// usage: WEB=http://localhost:3001 DEMO_PASSWORD=... SEED_ADMIN_EMAIL=... node scripts/e2e-mobile.mjs [--headed]
import { ADMIN, PW, RECRUITER, SEED_STUDENT, WEB, apiCall, browser, newPage, step, summary } from "./e2e-lib.mjs";

const PORTALS = {
  [ADMIN]: ["/admin", "/admin/students", "/admin/comms", "/admin/content", "/admin/teachers", "/admin/system"],
  [RECRUITER]: ["#overview", "#postings", "#drive", "#messages", "#talent"].map((h) => `/recruiter${h}`),
  [SEED_STUDENT]: ["home", "notices", "drives", "applications", "training", "records", "placement", "profile"].map((h) => `/student#${h}`),
  guest: ["/", "/login"],
};

for (const [who, pages] of Object.entries(PORTALS)) {
  const page = await newPage();
  await page.setViewportSize({ width: 390, height: 800 });
  if (who !== "guest") {
    const s = await apiCall("POST", "/auth/login", { body: { email: who, password: PW } });
    await page.goto(`${WEB}/login`);
    await page.evaluate((x) => localStorage.setItem("tnp.session", x), JSON.stringify(s));
  }
  await step(`${who === "guest" ? "public pages" : who.split("@")[0]}: no sideways scroll at 390px (${pages.length} pages)`, async () => {
    const bad = [];
    for (const p of pages) {
      await page.goto(WEB + p, { waitUntil: "networkidle" });
      await page.reload({ waitUntil: "networkidle" }); // hash-only goto doesn't reload; make sure this page's data is on screen
      await page.waitForTimeout(600);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 391) bad.push(`${p} is ${w}px wide`);
    }
    if (bad.length) throw new Error(bad.join("; "));
  });
  await page.context().close();
}
await browser.close();
summary();
