// Sweep every page of every portal at desktop + phone width in real Chrome. Reports page errors, failed API calls,
// sideways scroll, broken images, unnamed controls, tiny tap targets. Saves a screenshot per page+width.
// usage: SHOTS=/some/dir node scripts/scan.mjs [--headed]
import { mkdirSync } from "node:fs";
import { ADMIN, PW, RECRUITER, SEED_STUDENT, WEB, apiCall, browser, newPage } from "./e2e-lib.mjs";

const SHOTS = process.env.SHOTS ?? "/tmp/tnp-scan";
mkdirSync(SHOTS, { recursive: true });
const PORTALS = {
  [ADMIN]: ["/admin", "/admin/students", "/admin/comms", "/admin/content", "/admin/teachers", "/admin/system"],
  [RECRUITER]: ["overview", "postings", "drive", "messages", "talent"].map((h) => `/recruiter#${h}`),
  [SEED_STUDENT]: ["home", "notices", "drives", "applications", "training", "records", "placement", "profile"].map((h) => `/student#${h}`),
  guest: ["/", "/login"],
};
const WIDTHS = [1280, 390];

const audit = () => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`sideways scroll ${document.documentElement.scrollWidth}>${vw}`);
  for (const i of document.images) if (i.complete && i.naturalWidth === 0) out.push(`broken image ${i.src.slice(-50)}`);
  const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
  const name = (e) => (e.getAttribute("aria-label") || e.textContent || e.title || "").trim();
  for (const b of document.querySelectorAll("button, a[href]")) if (vis(b) && !name(b) && !b.querySelector("img[alt]")) out.push(`unnamed ${b.tagName.toLowerCase()} ${b.outerHTML.slice(0, 80)}`);
  for (const i of document.querySelectorAll("input:not([type=hidden]), select, textarea"))
    if (vis(i) && !i.labels?.length && !i.getAttribute("aria-label") && !i.getAttribute("aria-labelledby")) out.push(`unlabelled field ${i.name || i.type} ${i.placeholder || ""}`);
  if (vw < 500) {
    const small = [...document.querySelectorAll("button, a[href], select")].filter((e) => vis(e) && (e.getBoundingClientRect().height < 32 || e.getBoundingClientRect().width < 32) && name(e).length < 40);
    if (small.length) out.push(`${small.length} tap targets <32px, ${[...new Set(small.map((e) => `${name(e).slice(0, 24) || e.tagName}(${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)})`))].join(" | ")}`);
  }
  const off = [...document.querySelectorAll("button, a[href]")].filter((e) => vis(e) && e.getBoundingClientRect().right > vw + 1 && !e.closest("table, nav, [class*=overflow-x]"));
  if (off.length) out.push(`controls past the right edge: ${off.slice(0, 4).map((e) => name(e).slice(0, 20)).join(" | ")}`);
  for (const e of document.querySelectorAll("h1,h2,h3,p,td,th,span,label,button,a"))
    if (vis(e) && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== "visible" && getComputedStyle(e).textOverflow !== "ellipsis" && e.children.length === 0)
      out.push(`clipped text "${e.textContent.trim().slice(0, 40)}"`);
  return [...new Set(out)];
};

for (const [who, pages] of Object.entries(PORTALS)) {
  for (const width of WIDTHS) {
    const page = await newPage();
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(`console: ${m.text().slice(0, 120)}`));
    await page.setViewportSize({ width: width, height: 900 });
    if (who !== "guest") {
      const s = await apiCall("POST", "/auth/login", { body: { email: who, password: PW } });
      await page.goto(`${WEB}/login`);
      await page.evaluate((x) => localStorage.setItem("tnp.session", x), JSON.stringify(s));
    }
    for (const p of pages) {
      errs.length = 0;
      await page.goto(WEB + p, { waitUntil: "networkidle" });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const issues = [...errs, ...(await page.evaluate(audit))];
      const tag = `${who.split("@")[0]}${p.replace(/[/#]/g, "_")}-${width}`;
      await page.screenshot({ path: `${SHOTS}/${tag}.png`, fullPage: true });
      console.log(`${issues.length ? "ISSUE" : "ok   "} ${tag}${issues.map((i) => `\n        - ${i}`).join("")}`);
    }
    await page.context().close();
  }
}
await browser.close();
