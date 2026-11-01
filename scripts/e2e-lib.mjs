// Shared helpers for the UI end-to-end suites (e2e.mjs, e2e-ops.mjs).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

export const here = resolve(import.meta.dirname, "..");
export const WEB = process.env.WEB ?? "http://localhost:3001";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
export const env = (f) =>
  Object.fromEntries(
    readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
const backend = env(resolve(here, "../backend/.env"));
export const PW = env(resolve(here, ".env.local")).DEMO_PASSWORD;
export const DOMAIN = backend.STUDENT_EMAIL_DOMAIN || "tezu.ac.in";
export const ADMIN = backend.SEED_ADMIN_EMAIL;
export const SEED_STUDENT = `csb21045@${DOMAIN}`;
export const RECRUITER = "hr.demo@cognizant-demo.test";

export const run = Date.now().toString().slice(-5);

export const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
});
const results = [];
const consoleErrors = [];

export async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(["PASS", name, Date.now() - t]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(["FAIL", name, Date.now() - t]);
    console.log(`FAIL  ${name}\n      ${String(e.message).split("\n")[0]}`);
    await browser.close();
    summary();
    process.exit(1);
  }
}
export function summary() {
  const fail = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - fail}/${results.length} steps passed`);
  if (consoleErrors.length) console.log(`console errors:\n- ${[...new Set(consoleErrors)].join("\n- ")}`);
}

export async function otpFor(email) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`).then((r) => r.json());
    const id = r.messages?.[0]?.ID;
    if (id) {
      const code = (await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json())).Text?.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error(`no OTP mail for ${email}`);
}

export async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on(
    "response",
    (r) => r.status() >= 400 && r.url().includes("/api/") && consoleErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`),
  );
  page.setDefaultTimeout(10_000);
  return page;
}

export async function login(page, email, password) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

