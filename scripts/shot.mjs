// Full-page screenshot of a portal as a given demo user, at the Figma frame width (1280).
// Logs in through the API itself, reading DEMO_PASSWORD from .env.local, so credentials never pass through the caller.
//
// usage: node scripts/shot.mjs <guest|admin|student|recruiter> <path> [out.png]
//   e.g. node scripts/shot.mjs student /student design/compare/student.png
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const [who = "guest", path = "/", out = `design/compare/${who}.png`] = process.argv.slice(2);
const here = resolve(import.meta.dirname, "..");
const WEB = process.env.WEB ?? "http://localhost:3001";
const env = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const backend = env(resolve(here, "../backend/.env"));
const EMAIL = { admin: backend.SEED_ADMIN_EMAIL, student: `csb21045@${backend.STUDENT_EMAIL_DOMAIN || "tezu.ac.in"}`, recruiter: "hr.demo@cognizant-demo.test" };

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

if (who !== "guest") {
  const r = await fetch(`${WEB}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL[who], password: env(resolve(here, ".env.local")).DEMO_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${who} failed: ${r.status}`);
  const session = await r.text();
  await page.goto(WEB + "/login");
  await page.evaluate((s) => localStorage.setItem("tnp.session", s), session);
}
await page.goto(WEB + path, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
if (sw > page.viewportSize().width) errors.push(`horizontal overflow: scrollWidth ${sw}`);
await page.screenshot({ path: resolve(here, out), fullPage: true });
console.log(out, errors.length ? `\nconsole errors:\n- ${[...new Set(errors)].join("\n- ")}` : "(no console errors)");
await browser.close();
