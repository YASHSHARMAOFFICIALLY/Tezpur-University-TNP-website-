// End-to-end UI test: drives the real app in Chrome through the main flows of all three portals.
// Needs API (:3000), web (:3001), Mailpit (:8025) and `node scripts/seed-demo.mjs` already run.
// Every run uses fresh unique accounts/postings, so it can be re-run. Exit code 1 on the first failed step.
//
// usage: node scripts/e2e.mjs [--headed]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const here = resolve(import.meta.dirname, "..");
const WEB = process.env.WEB ?? "http://localhost:3001";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
const env = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const backend = env(resolve(here, "../backend/.env"));
const PW = env(resolve(here, ".env.local")).DEMO_PASSWORD;
const DOMAIN = backend.STUDENT_EMAIL_DOMAIN || "tezu.ac.in";
const ADMIN = backend.SEED_ADMIN_EMAIL;
const SEED_STUDENT = `csb21045@${DOMAIN}`;
const RECRUITER = "hr.demo@cognizant-demo.test";

const run = Date.now().toString().slice(-5);
const NEW_ENROL = `CSB9${run}`;
const NEW_STUDENT = `${NEW_ENROL.toLowerCase()}@${DOMAIN}`;
const NEW_PW = `E2e-${run}-pass`;
const JOB = `E2E Cloud Engineer ${run}`;

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: !process.argv.includes("--headed") });
const results = [];
const consoleErrors = [];

async function step(name, fn) {
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
function summary() {
  const fail = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - fail}/${results.length} steps passed`);
  if (consoleErrors.length) console.log(`console errors:\n- ${[...new Set(consoleErrors)].join("\n- ")}`);
}

async function otpFor(email) {
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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("response", (r) => r.status() >= 400 && r.url().includes("/api/") && consoleErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  page.setDefaultTimeout(10_000);
  return page;
}

async function login(page, email, password) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// ---------- guest ----------
const guest = await newPage();
await step("public page renders live programmes + metrics", async () => {
  await guest.goto(WEB);
  await guest.getByRole("heading", { name: "Schools & Disciplines on Offer" }).waitFor();
  await guest.getByText("B.Tech Computer Science & Engg").waitFor();
  await guest.getByText("87.4").waitFor();
});
await step("login shows backend error for wrong password", async () => {
  await login(guest, ADMIN, "definitely-wrong");
  await guest.getByRole("alert").waitFor();
});
await step("guest is redirected from /admin to /login", async () => {
  await guest.goto(`${WEB}/admin`);
  await guest.waitForURL(/\/login$/);
});
await step("student self-registration + OTP verification (UI)", async () => {
  await guest.goto(`${WEB}/#register`);
  await guest.getByRole("tab", { name: "Student / Candidate" }).click();
  await guest.getByLabel("Full Name *").fill("E2E Test Student");
  await guest.getByLabel("Enrolment Number *").fill(NEW_ENROL);
  await guest.getByLabel("University Email *").fill(NEW_STUDENT);
  await guest.getByLabel("Mobile *").fill("9876501234");
  await guest.getByLabel("Programme").selectOption({ label: "B.Tech Computer Science & Engg" });
  await guest.getByLabel("Create Password *").fill(NEW_PW);
  await guest.getByRole("button", { name: /Register & Send Code/ }).click();
  await guest.getByLabel("Verification Code *").fill(await otpFor(NEW_STUDENT));
  await guest.getByRole("button", { name: /Verify & Submit/ }).click();
  await guest.getByText("Submitted for TPO verification").waitFor();
});
await step("unapproved student can't sign in yet (pending message)", async () => {
  await login(guest, NEW_STUDENT, NEW_PW);
  await guest.getByRole("alert").waitFor();
});

// ---------- recruiter creates a posting ----------
const rec = await newPage();
await step("recruiter login lands on /recruiter", async () => {
  await login(rec, RECRUITER, PW);
  await rec.waitForURL(/\/recruiter$/);
  await rec.getByText("Cognizant Technology Solutions").first().waitFor();
});
await step("recruiter creates + submits posting via Posting Studio", async () => {
  await rec.getByRole("button", { name: "Create New Job Opening" }).click();
  const d = rec.getByRole("dialog", { name: "Job & Internship Posting Studio" });
  await d.getByLabel("ROLE PROFILE / JOB TITLE *").fill(JOB);
  await d.getByLabel("TENTATIVE WORK LOCATION *").fill("Pune");
  await d.getByLabel("JOB DESCRIPTION *").fill("E2E posting.");
  await d.getByLabel("Base Compensation (INR LPA)").fill("9");
  await d.getByLabel("B.Tech Computer Science & Engg").check();
  await d.getByLabel("Passing-out Batch *").selectOption("2026");
  await d.getByLabel("Apply Deadline *").fill(new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10));
  await d.getByRole("button", { name: "Publish Opening to Students" }).click();
  await d.waitFor({ state: "detached" });
});

// ---------- admin approves ----------
const adm = await newPage();
await step("admin approves new student in queue", async () => {
  await login(adm, ADMIN, PW);
  await adm.waitForURL(/\/admin$/);
  const row = adm.getByRole("row").filter({ hasText: NEW_STUDENT });
  await row.getByRole("button", { name: "Approve" }).click();
  await row.waitFor({ state: "detached" });
});
await step("admin approves the posting (postings tab)", async () => {
  await adm.getByRole("tab", { name: /Job & Internship Postings/ }).click();
  const row = adm.getByRole("row").filter({ hasText: JOB });
  await row.getByRole("button", { name: "Approve" }).click();
  await row.waitFor({ state: "detached" });
});
await step("admin publishes a new event (Event Creator)", async () => {
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  await adm.getByLabel("Workshop / Session Topic").fill(`E2E Resume Clinic ${run}`);
  await adm.getByLabel("Date", { exact: true }).fill(day(6));
  await adm.getByLabel("RSVP Cut-off Date").fill(day(4));
  await adm.getByRole("button", { name: /Broadcast & Enlist Session/ }).click();
  await adm.getByText("Session published").waitFor();
});

// ---------- students ----------
const stuNew = await newPage();
await step("approved new student logs in; posting shows ineligible (no CGPA yet)", async () => {
  await login(stuNew, NEW_STUDENT, NEW_PW);
  await stuNew.waitForURL(/\/student$/);
  const card = stuNew.locator("article").filter({ hasText: JOB });
  await card.getByText(/Ineligible: Cutoff CGPA/).waitFor();
  await card.getByRole("button", { name: /Apply Now/ }).waitFor({ state: "detached" });
});
await step("new student registers for the event", async () => {
  await stuNew.getByRole("tab", { name: /Training & Workshops/ }).click();
  const card = stuNew.locator("article").filter({ hasText: `E2E Resume Clinic ${run}` });
  await card.getByRole("button", { name: "Register" }).click();
  await card.getByRole("button", { name: "Cancel Registration" }).waitFor();
});

const stu = await newPage();
await step("seeded student applies to new posting (one-click)", async () => {
  await login(stu, SEED_STUDENT, PW);
  await stu.waitForURL(/\/student$/);
  const card = stu.locator("article").filter({ hasText: JOB });
  await card.getByRole("button", { name: /Apply Now/ }).click();
  await card.getByText(/Applied • Awaiting T&P Release/).waitFor();
});

// ---------- release -> shortlist -> interview -> results -> publish ----------
await step("admin releases applicants to recruiter", async () => {
  await adm.reload();
  await adm.getByLabel("Select Concluded Drive").selectOption({ label: `Cognizant Technology Solutions - ${JOB}` });
  await adm.getByRole("button", { name: /Release 1 Applicant/ }).click();
  await adm.getByText("Applicants released to the recruiter.").waitFor();
});
await step("recruiter bulk-shortlists + schedules interview", async () => {
  await rec.reload();
  await rec.getByLabel("Choose drive").selectOption({ label: `${JOB} (Live to students)` });
  await rec.getByLabel("Select Priyanshu Sharma").check();
  await rec.getByRole("button", { name: /Bulk Shortlist \( 1 \)/ }).click();
  await rec.getByText("1 candidate(s) updated.").waitFor();
  await rec.getByLabel("Select Priyanshu Sharma").check();
  await rec.getByRole("button", { name: "Schedule Interview" }).click();
  const d = rec.getByRole("dialog");
  await d.getByLabel("Date & time *").fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16));
  await d.getByLabel("Venue or meeting link *").fill("Computer Center Lab 2");
  await d.getByRole("button", { name: "Schedule & Notify" }).click();
  await rec.getByText("Interview scheduled").waitFor();
});
await step("recruiter submits final selection", async () => {
  await rec.getByLabel("Select Priyanshu Sharma").check();
  await rec.getByRole("button", { name: "Submit as Final Selections" }).click();
  await rec.getByText("Final selections sent").waitFor();
});
await step("admin publishes results", async () => {
  await adm.reload();
  await adm.getByLabel("Select Concluded Drive").selectOption({ label: `Cognizant Technology Solutions - ${JOB}` });
  await adm.getByRole("button", { name: /Execute Select Rollout/ }).click();
  await adm.getByText("Results published").waitFor();
});
await step("student sees selection on their card", async () => {
  await stu.reload();
  await stu.locator("article").filter({ hasText: JOB }).getByText(/Selected • Offer/).waitFor();
});
await step("recruiter sends liaison message", async () => {
  await rec.getByLabel("SUBJECT HEADER").fill(`E2E slot ${run}`);
  await rec.getByLabel("DISPATCH CONTENT").fill("Please confirm room 102.");
  await rec.getByRole("button", { name: /Transmit Announcement/ }).click();
  await rec.getByText(`E2E slot ${run}`).waitFor();
});
await step("logout returns to login", async () => {
  await stu.getByRole("button", { name: "Log out" }).click();
  await stu.waitForURL(/\/login$/);
});

await browser.close();
summary();
