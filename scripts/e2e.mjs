// End-to-end UI test: drives the real app in Chrome through the main flows of all three portals.
// Needs API (:3000), web (:3001), Mailpit (:8025) and `node scripts/seed-demo.mjs` already run.
// Every run uses fresh unique accounts/postings, so it can be re-run. Exit code 1 on the first failed step.
//
// usage: node scripts/e2e.mjs [--headed]   (21 steps)
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ADMIN, DOMAIN, PW, RECRUITER, SEED_STUDENT, WEB, browser, here, login, newPage, otpFor, run, step, summary } from "./e2e-lib.mjs";

const NEW_ENROL = `CSB9${run}`;
const NEW_STUDENT = `${NEW_ENROL.toLowerCase()}@${DOMAIN}`;
const NEW_PW = `E2e-${run}-pass`;
const JOB = `E2E Cloud Engineer ${run}`;

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
  await guest.getByRole("alert").filter({ hasText: "Email or password is wrong" }).waitFor();
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
  await guest.getByRole("alert").filter({ hasText: "Account awaiting admin approval" }).waitFor();
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
await step("admin queue shows the new student's real programme, then approves", async () => {
  await login(adm, ADMIN, PW);
  await adm.waitForURL(/\/admin$/);
  const row = adm.getByRole("row").filter({ hasText: NEW_STUDENT });
  await row.getByRole("cell", { name: "School of Engineering B.Tech Computer Science & Engg" }).waitFor();
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
await step("a failed event transition (Complete) shows the error to the admin", async () => {
  await adm.route(
    /\/api\/v1\/admin\/events\/[^/]+\/complete$/,
    (r) =>
      r.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "INVALID_TRANSITION", message: "Event can't move to completed", details: {} } }),
      }),
    { times: 1 },
  );
  const row = adm
    .locator("div")
    .filter({ has: adm.getByRole("button", { name: `E2E Resume Clinic ${run}` }) })
    .last();
  await row.getByRole("button", { name: "Complete" }).click();
  await adm.getByRole("alert").filter({ hasText: "Event can't move to completed" }).waitFor();
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
await step("new student completes profile (photo + resume upload) and applies without a reload", async () => {
  const pdf = resolve(tmpdir(), `e2e-cv-${run}.pdf`);
  writeFileSync(
    pdf,
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  await stuNew.getByRole("button", { name: /Edit Profile/ }).click();
  const d = stuNew.getByRole("dialog", { name: "Edit profile" });
  await d.getByLabel(/Coloured Photo/).setInputFiles(resolve(here, "public/img/emblem.jpg"));
  await d.getByLabel(/Resume \(PDF/).setInputFiles(pdf);
  await d.getByLabel("Date of Birth *").fill("2004-02-10");
  await d.getByLabel("Cumulative CGPA *").fill("8.4");
  await d.getByLabel("Year of Completion *").fill("2026");
  await d.getByRole("button", { name: "Save Profile" }).click();
  await d.waitFor({ state: "detached" });
  const card = stuNew.locator("article").filter({ hasText: JOB });
  await card.getByRole("button", { name: /Apply Now/ }).click();
  await card.getByText(/Applied • Awaiting T&P Release/).waitFor();
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
  await adm.getByRole("button", { name: /Release \d+ Applicant/ }).click();
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
  await stu
    .locator("article")
    .filter({ hasText: JOB })
    .getByText(/Selected • Offer/)
    .waitFor();
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
