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
export const PW = process.env.DEMO_PASSWORD ?? env(resolve(here, ".env.local")).DEMO_PASSWORD;
export const DOMAIN = backend.STUDENT_EMAIL_DOMAIN || "tezu.ac.in";
export const ADMIN = process.env.SEED_ADMIN_EMAIL ?? backend.SEED_ADMIN_EMAIL;
export const SEED_STUDENT = `csb21045@${DOMAIN}`;
export const RECRUITER = "hr.demo@cognizant-demo.test";

export const run = Date.now().toString().slice(-5);

export const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  slowMo: Number(process.env.SLOWMO ?? 0), // SLOWMO=400 to follow a --headed run by eye
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
    console.log(`FAIL  ${name}\n      ${String(e.message).split("\n").slice(0, 4).join("\n      ")}`);
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
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    ignoreHTTPSErrors: WEB.startsWith("https:"),
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on(
    "response",
    (r) => r.status() >= 400 && r.url().includes("/api/") && consoleErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`),
  );
  page.setDefaultTimeout(Number(process.env.E2E_TIMEOUT ?? 10_000)); // raise on a loaded machine, e.g. E2E_TIMEOUT=30000
  page.setDefaultNavigationTimeout(Number(process.env.E2E_TIMEOUT ?? 10_000));
  return page;
}

export async function login(page, email, password) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Text of the newest mail to `email` whose subject matches `subject` (waits up to 15 s). */
export async function mailText(email, subject) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`).then((r) => r.json());
    const hit = r.messages?.find((m) => subject.test(m.Subject));
    if (hit) return (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`).then((r) => r.json())).Text;
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error(`no mail to ${email} matching ${subject}`);
}

/** Direct API call for test setup (not the thing under test). */
export async function apiCall(method, path, { token, body, file } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  let payload;
  if (file) {
    payload = new FormData();
    payload.append("file", new Blob([file.bytes], { type: file.type }), file.name);
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${WEB}/api/v1${path}`, { method, headers, body: payload });
  const json = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${json?.error?.code}`);
  return json;
}

/** Every row of a cursor-paginated list endpoint. */
export async function apiList(path, token) {
  const rows = [];
  for (let cursor = ""; ;) {
    const r = await apiCall("GET", `${path}?limit=100${cursor && `&cursor=${cursor}`}`, { token });
    rows.push(...r.data);
    if (!r.page.has_more) return rows;
    cursor = r.page.cursor;
  }
}

/** Local calendar date (YYYY-MM-DD), as a date input shows it. */
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
