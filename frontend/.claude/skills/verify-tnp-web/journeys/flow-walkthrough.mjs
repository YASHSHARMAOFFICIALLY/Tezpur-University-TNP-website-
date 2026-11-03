// Captioned walkthrough of the whole placement flow (recruiter, admin, student) for documentation.
// Writes numbered PNGs with the caption burned into the top of each image, plus flow.md, to FLOW_OUT (default ~/Downloads/tnp-flow).
// usage: webctl journey .claude/skills/verify-tnp-web/journeys/flow-walkthrough.mjs [--headed]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
import { ADMIN, DOMAIN, PW, RECRUITER, WEB, browser, here, login, newPage, otpFor, run, step, summary, ymd } from "../../../../scripts/e2e-lib.mjs";

const OUT = process.env.FLOW_OUT ?? resolve(homedir(), "Downloads/tnp-flow");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ENROL = `CSB8${run}`;
const STUDENT = `${ENROL.toLowerCase()}@${DOMAIN}`;
const STUDENT_PW = `Flow-${run}-pass`;
const NAME = `Flow Student ${run}`;
const JOB = `Cloud Engineer ${run}`;
const DEADLINE = ymd(new Date(Date.now() + 5 * 864e5));

const rows = [];
let n = 0;

/** Burns "Step N · Actor / caption" into the page, screenshots it, removes it, and logs the row for flow.md. */
async function snap(page, actor, title, caption, { full = true } = {}) {
  n += 1;
  const file = `${String(n).padStart(2, "0")}-${actor.toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    ([label, text]) => {
      const b = document.createElement("div");
      b.id = "flow-caption";
      b.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0b1b3a;color:#fff;padding:10px 20px;font:600 15px/1.35 system-ui;border-bottom:3px solid #f59e0b";
      b.textContent = `${label}  ${text}`;
      document.body.append(b);
      document.body.style.paddingTop = "52px";
    },
    [`STEP ${n} · ${actor.toUpperCase()} ·`, caption],
  );
  await page.screenshot({ path: resolve(OUT, file), fullPage: full });
  await page.evaluate(() => {
    document.getElementById("flow-caption")?.remove();
    document.body.style.paddingTop = "";
  });
  rows.push({ n, actor, title, caption, file });
}

// ---------- recruiter: sign in, dashboard, profile, posting ----------
const rec = await newPage();
await step("recruiter signs in and sees the corporate desk", async () => {
  await rec.goto(`${WEB}/login`);
  await snap(rec, "recruiter", "sign in", "Recruiters sign in with the email and password the T&P cell approved.", { full: false });
  await login(rec, RECRUITER, PW);
  await rec.waitForURL(/\/recruiter$/);
  await rec.getByText("Cognizant Technology Solutions").first().waitFor();
  await snap(rec, "recruiter", "corporate desk", "Corporate Desk: organisation, live-drive counters and the three main actions.");
});
await step("recruiter opens the university panel", async () => {
  const sum = rec.locator("summary").first();
  if (await sum.count()) {
    await sum.click();
    await snap(rec, "recruiter", "university panel", "University details come from the T&P profile the admin maintains; the panel expands and collapses.");
    await sum.click();
  }
});
await step("recruiter reviews the organisation profile", async () => {
  await rec.getByRole("button", { name: "Edit Organisation Profile" }).click();
  await rec.getByRole("dialog").waitFor();
  await snap(rec, "recruiter", "organisation profile", "Edit Organisation Profile: contacts, category, sector and address saved to the T&P record.", { full: false });
  await rec.keyboard.press("Escape");
  if (await rec.getByRole("dialog").count()) await rec.getByRole("dialog").getByRole("button", { name: /Cancel|Close/ }).first().click();
});
await step("recruiter creates a job opening", async () => {
  await rec.getByRole("button", { name: "Create New Job Opening" }).click();
  const d = rec.getByRole("dialog", { name: "Job & Internship Posting Studio" });
  await d.getByLabel("ROLE PROFILE / JOB TITLE *").fill(JOB);
  await d.getByLabel("TENTATIVE WORK LOCATION *").fill("Pune");
  await d.getByLabel("JOB DESCRIPTION *").fill("Build and run cloud services for campus hires.");
  await d.getByLabel("Base Compensation (INR LPA)").fill("9");
  await d.getByLabel("B.Tech Computer Science & Engg").check();
  await d.getByLabel("Minimum Cutoff CGPA").fill("5");
  await d.getByLabel("Passing-out Batch *").selectOption("2026");
  await d.getByLabel("Apply Deadline *").fill(DEADLINE);
  await snap(rec, "recruiter", "posting studio", "Posting Studio: role, eligibility (programme, CGPA, batch) and the apply deadline.", { full: false });
  await d.getByRole("button", { name: "Publish Opening to Students" }).click();
  await d.waitFor({ state: "detached" });
  await rec.getByLabel("Choose drive").getByRole("option", { name: new RegExp(`${JOB}.*Awaiting`) }).waitFor({ state: "attached" });
  await snap(rec, "recruiter", "posting submitted", "The opening is submitted and waits for T&P approval before students see it.");
});

// ---------- student registers (so the drive has an applicant) ----------
const guest = await newPage();
await step("student registers with OTP", async () => {
  await guest.goto(`${WEB}/#register`);
  await guest.getByRole("tab", { name: "Student / Candidate" }).click();
  await guest.getByLabel("Full Name *").fill(NAME);
  await guest.getByLabel("Enrolment Number *").fill(ENROL);
  await guest.getByLabel("University Email *").fill(STUDENT);
  await guest.getByLabel("Mobile *").fill("9876501234");
  await guest.getByLabel("Programme").selectOption({ label: "B.Tech Computer Science & Engg" });
  await guest.getByLabel("Create Password *").fill(STUDENT_PW);
  await snap(guest, "student", "registration", "Student registration with the university email, enrolment number and programme.", { full: false });
  await guest.getByRole("button", { name: /Register & Send Code/ }).click();
  await guest.getByLabel("Verification Code *").fill(await otpFor(STUDENT));
  await guest.getByRole("button", { name: /Verify & Submit/ }).click();
  await guest.getByText("Submitted for TPO verification").waitFor();
  await snap(guest, "student", "awaiting approval", "After the emailed code is verified the account waits for T&P verification.", { full: false });
});

// ---------- admin: dashboard, approvals, event ----------
const adm = await newPage();
await step("admin reviews the dashboard and approves the student", async () => {
  await login(adm, ADMIN, PW);
  await adm.waitForURL(/\/admin$/);
  await adm.getByText("Registered Candidates", { exact: true }).waitFor();
  await snap(adm, "admin", "dashboard", "Admin / TPO dashboard: registered candidates, approved recruiters and the verification queue.");
  const row = adm.getByRole("row").filter({ hasText: STUDENT });
  await row.getByRole("button", { name: "Approve" }).click();
  await row.waitFor({ state: "detached" });
  await snap(adm, "admin", "student approved", "The admin approves the student, who can now sign in and apply.");
});
await step("admin approves the recruiter's posting", async () => {
  await adm.getByRole("tab", { name: /Job & Internship Postings/ }).click();
  const row = adm.getByRole("row").filter({ hasText: JOB });
  await snap(adm, "admin", "posting review", "Postings tab: the admin reviews the recruiter's opening before it goes live.", { full: false });
  await row.getByRole("button", { name: "Approve" }).click();
  await row.waitFor({ state: "detached" });
  await snap(adm, "admin", "posting approved", "Approved: the opening is now visible to eligible students.");
});
await step("admin publishes a training event", async () => {
  const day = (k) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
  const studio = adm.locator("details").filter({ hasText: "Event & Training Creator Studio" });
  if (!(await studio.evaluate((el) => el.open))) await adm.getByText("Event & Training Creator Studio").click();
  await adm.getByLabel("Workshop / Session Topic").fill(`Resume Clinic ${run}`);
  await adm.getByLabel("Date", { exact: true }).fill(day(6));
  await adm.getByLabel("RSVP Cut-off Date").fill(day(4));
  await adm.getByRole("button", { name: /Broadcast & Enlist Session/ }).click();
  await adm.getByText("Session published").waitFor();
  await snap(adm, "admin", "event published", "Event Creator: a workshop is published and students can register.");
});

// ---------- student applies ----------
const stu = await newPage();
await step("student applies to the posting", async () => {
  await login(stu, STUDENT, STUDENT_PW);
  await stu.waitForURL(/\/student$/);
  await stu.getByRole("button", { name: /Edit Profile/ }).click();
  const d = stu.getByRole("dialog", { name: "Edit profile" });
  const pdf = resolve(tmpdir(), `flow-cv-${run}.pdf`);
  writeFileSync(
    pdf,
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  await d.getByLabel(/Coloured Photo/).setInputFiles(resolve(here, "public/img/emblem.jpg"));
  await d.getByLabel(/Resume \(PDF/).setInputFiles(pdf);
  await d.getByLabel("Date of Birth *").fill("2004-02-10");
  await d.getByLabel("Cumulative CGPA *").fill("8.1");
  await d.getByLabel("Year of Completion *").fill("2026");
  await snap(stu, "student", "profile", "The student completes the profile (photo, resume, CGPA) that recruiters will see.", { full: false });
  await d.getByRole("button", { name: "Save Profile" }).click();
  await d.waitFor({ state: "detached" });
  const card = stu.locator("article").filter({ hasText: JOB });
  await card.getByRole("button", { name: /Apply Now/ }).click();
  await card.getByText(/Applied • Awaiting T&P Release/).waitFor();
  await snap(stu, "student", "applied", "One click applies; status reads Applied, awaiting T&P release to the recruiter.");
});

// ---------- admin releases, recruiter shortlists / interviews / selects ----------
await step("admin releases the applicants to the recruiter", async () => {
  await adm.reload();
  await adm.getByLabel("Select Concluded Drive").selectOption({ label: `Cognizant Technology Solutions - ${JOB}` });
  await snap(adm, "admin", "release applicants", "The admin picks the concluded drive and releases screened applicants to the recruiter.", { full: false });
  await adm.getByRole("button", { name: /Release 1 Applicant/ }).click();
  await adm.getByText("Applicants released to the recruiter.").waitFor();
  await snap(adm, "admin", "released", "Applicants released.");
});
await step("recruiter shortlists, schedules an interview and selects", async () => {
  await rec.reload();
  await rec.getByLabel("Choose drive").selectOption({ label: `${JOB} (Live to students)` });
  await rec.getByLabel(`Select ${NAME}`).waitFor();
  await snap(rec, "recruiter", "candidates", "Released candidates with CGPA and programme; filter, export CSV and bulk actions.");
  await rec.getByLabel(`Select ${NAME}`).check();
  await rec.getByRole("button", { name: /Bulk Shortlist \( 1 \)/ }).click();
  await rec.getByText("1 candidate(s) updated.").waitFor();
  await snap(rec, "recruiter", "shortlisted", "Bulk Shortlist moves the candidate to the technical interview round.");
  await rec.getByLabel(`Select ${NAME}`).check();
  await rec.getByRole("button", { name: "Schedule Interview" }).click();
  const d = rec.getByRole("dialog");
  await d.getByLabel("Date & time *").fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16));
  await d.getByLabel("Venue or meeting link *").fill("Computer Center Lab 2");
  await snap(rec, "recruiter", "schedule interview", "Schedule Interview: date, time and venue; the student is notified.", { full: false });
  await d.getByRole("button", { name: "Schedule & Notify" }).click();
  await rec.getByText("Interview scheduled").waitFor();
  await rec.getByLabel(`Select ${NAME}`).check();
  await rec.getByRole("button", { name: "Submit as Final Selections" }).click();
  await snap(rec, "recruiter", "final selection", "Final selection asks for confirmation and warns that unselected candidates are rejected.", { full: false });
  await rec.getByRole("dialog", { name: "Submit final selections" }).getByRole("button", { name: "Confirm" }).click();
  await rec.getByText("Final selections sent").waitFor();
  await snap(rec, "recruiter", "selections sent", "Final selections sent to the T&P cell.");
});
await step("recruiter closes the drive and messages the T&P cell", async () => {
  await rec.getByRole("button", { name: "Stop Accepting Applications" }).click();
  await rec.getByLabel("Choose drive").getByRole("option", { name: `${JOB} (Closed)` }).waitFor({ state: "attached" });
  await rec.getByLabel("SUBJECT HEADER").fill(`Joining slot ${run}`);
  await rec.getByLabel("DISPATCH CONTENT").fill("Please confirm room 102 for the pre-placement talk.");
  await rec.getByRole("button", { name: /Transmit Announcement/ }).click();
  await rec.getByText(`Joining slot ${run}`).first().waitFor();
  await snap(rec, "recruiter", "liaison dispatch", "The drive is closed and the recruiter messages the T&P liaison.");
});
await step("admin publishes the results and the student sees the offer", async () => {
  await adm.reload();
  await adm.getByLabel("Select Concluded Drive").selectOption({ label: `Cognizant Technology Solutions - ${JOB}` });
  await adm.getByRole("button", { name: /Execute Select Rollout/ }).click();
  await adm.getByText("Results published").waitFor();
  await snap(adm, "admin", "results published", "The admin publishes the results; selected students are marked placed.");
  await stu.reload();
  await stu.locator("article").filter({ hasText: JOB }).getByText(/Selected • Offer/).waitFor();
  await snap(stu, "student", "offer", "The student's card now reads Selected • Offer.");
});

// ---------- admin: the other consoles ----------
await step("admin consoles", async () => {
  for (const [path, title, caption] of [
    ["/admin/students", "students", "Students console: search, edit, probation and bulk CSV import."],
    ["/admin/teachers", "teachers", "Teachers console: faculty coordinators."],
    ["/admin/comms", "comms", "Communications: notices and recruiter threads."],
    ["/admin/content", "content", "Content: the university profile and public-site content shown to recruiters and visitors."],
    ["/admin/system", "system", "System: settings, health and the audit log."],
  ]) {
    await adm.goto(`${WEB}${path}`);
    await adm.waitForLoadState("networkidle");
    await snap(adm, "admin", title, caption);
  }
});

const md = [
  "# T&P portal: recruiter and admin flow",
  "",
  `Run ${run}, ${new Date().toISOString().slice(0, 10)}. Every image is a real browser capture of the running app.`,
  "",
  ...rows.flatMap((r) => [`## ${r.n}. ${r.actor}: ${r.title}`, "", r.caption, "", `![${r.title}](${r.file})`, ""]),
];
writeFileSync(resolve(OUT, "flow.md"), md.join("\n"));
console.log(`\n${rows.length} captioned screenshots + flow.md in ${OUT}`);
await browser.close();
summary();
