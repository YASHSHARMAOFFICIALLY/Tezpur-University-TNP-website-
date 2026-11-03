// End-to-end UI test for the admin operations pages and recruiter self-service:
// notices, company threads, feedback forms, student roster (edit/probation/CSV import), staff, content,
// settings, recruiter profile, return-and-resubmit of postings, and rejected-recruiter resubmission.
// Same prerequisites as e2e.mjs. Re-runnable: every run uses fresh names.
//
// usage: node scripts/e2e-ops.mjs [--headed]
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { ADMIN, DOMAIN, PW, RECRUITER, SEED_STUDENT, WEB, apiCall, apiList, browser, login, newPage, otpFor, run, step, summary } from "./e2e-lib.mjs";

const NOTICE = `E2E Notice ${run}`;
const JOB2 = `E2E Returned Role ${run}`;
const NEW_REC = `hr${run}@e2e-${run}.test`;
const NEW_REC_PW = `Rec-${run}-pass`;
const CSV_ENROL = `CSB8${run}`;

const adm = await newPage();
const rec = await newPage();
const stu = await newPage();
const guest = await newPage();

await step("admin + recruiter + student sign in", async () => {
  await login(adm, ADMIN, PW);
  await adm.waitForURL(/\/admin$/);
  await login(rec, RECRUITER, PW);
  await rec.waitForURL(/\/recruiter$/);
  await login(stu, SEED_STUDENT, PW);
  await stu.waitForURL(/\/student$/);
});

// ---------- notices & messages ----------
await step("admin posts a student notice; student sees it", async () => {
  await adm.goto(`${WEB}/admin/comms`);
  await adm.getByLabel("Title *").fill(NOTICE);
  await adm.getByLabel("Message *").fill("Bring two printed copies of your resume.");
  await adm.getByRole("button", { name: "Publish Notice" }).click();
  await adm.getByText("Notice published.").waitFor();
  await stu.reload();
  await stu.getByText(`${NOTICE}:`).waitFor();
});
await step("admin replies in a company thread; recruiter sees it", async () => {
  await adm.getByRole("button", { name: /Cognizant Technology Solutions/ }).click();
  await adm.getByLabel("Reply subject").fill(`Re: slots ${run}`);
  await adm.getByLabel("Reply message").fill("Room 102 confirmed.");
  await adm.getByRole("button", { name: "Send Reply" }).click();
  await adm.getByText("Reply sent.").waitFor();
  await rec.reload();
  await rec.getByText(`Re: slots ${run}`).waitFor();
});
await step("admin sends a feedback form; recruiter submits; admin sees answers", async () => {
  await adm.getByLabel("Drive").selectOption({ index: 1 });
  await adm.getByRole("button", { name: "Send Feedback Form" }).click();
  await adm.getByText("Feedback form sent to the recruiter.").waitFor();
  await rec.reload();
  await rec.getByRole("button", { name: "Submit Drive Feedback" }).click();
  const d = rec.getByRole("dialog");
  await d.getByLabel(/Overall experience/).selectOption("5");
  await d.getByLabel(/Candidate preparedness/).selectOption("4");
  await d.getByLabel(/recruit from Tezpur/).selectOption("yes");
  await d.getByLabel(/improve/).fill("More interview rooms.");
  await d.getByRole("button", { name: "Submit Feedback" }).click();
  await d.waitFor({ state: "detached" });
  await adm.getByRole("button", { name: "Refresh answers" }).click();
  await adm.getByText("More interview rooms.").waitFor();
});

// ---------- student roster ----------
await step("CSV import creates a student (job polled to finish)", async () => {
  await adm.goto(`${WEB}/admin/students`);
  const csv = resolve(tmpdir(), `e2e-import-${run}.csv`);
  writeFileSync(
    csv,
    `enrolment_no,name,email,programme_code,year_of_completion,mobile\n${CSV_ENROL},CSV Imported ${run},${CSV_ENROL.toLowerCase()}@${DOMAIN},CSB,2027,9876509876\n`,
  );
  await adm.getByLabel("CSV file").setInputFiles(csv);
  await adm.getByRole("button", { name: "Start Import" }).click();
  await adm.getByText("Import queued.").waitFor();
  await adm.getByText(/Job [0-9a-f]{8}/).waitFor();
  await adm.waitForFunction(() => /done|failed/.test(document.body.innerText), null, { timeout: 30_000 });
  await adm.getByLabel("Search students").fill(CSV_ENROL);
  await adm.getByRole("cell", { name: CSV_ENROL, exact: true }).waitFor();
});
await step("admin edits a student record and toggles probation", async () => {
  await adm.getByRole("row").filter({ hasText: CSV_ENROL }).getByRole("button", { name: "Manage" }).click();
  const d = adm.getByRole("dialog");
  await d.getByLabel("CGPA").fill("8.1");
  await d.getByRole("button", { name: "Save Record" }).click();
  await d.getByText("Record updated").waitFor();
  await d.getByPlaceholder(/Reason/).fill("Attendance below 75%");
  await d.getByRole("button", { name: "Put on Probation" }).click();
  await d.getByText("Student put on probation.").waitFor();
  await d.getByRole("button", { name: "Lift Probation" }).click();
  await d.getByText("Probation lifted.").waitFor();
  await d.getByRole("button", { name: "Clear Sign-in Lock" }).click();
  await d.getByText("Sign-in limit cleared.").waitFor();
  await d.getByRole("button", { name: "Close" }).click();
});

// ---------- staff / content / system ----------
await step("admin creates a teacher login", async () => {
  await adm.goto(`${WEB}/admin/teachers`);
  await adm.getByLabel("Full name *").fill(`Dr. E2E ${run}`);
  await adm.getByLabel("University email *").fill(`faculty${run}@tezu.ernet.in`);
  await adm.getByRole("button", { name: "Create Login" }).click();
  await adm.getByText(`faculty${run}@tezu.ernet.in`).waitFor();
});
await step("admin adds + edits a programme; public page shows it", async () => {
  await adm.goto(`${WEB}/admin/content`);
  const add = adm.locator("form").filter({ has: adm.getByRole("button", { name: "Add", exact: true }) });
  await add.getByLabel("School / Department").fill("School of Humanities & Social Sciences");
  await add.getByLabel("Programme").fill(`MA Mass Communication ${run}`);
  await add.getByLabel("Code").fill(`M${run}`);
  await add.getByLabel("Students").fill("40");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const row = adm.getByRole("listitem").filter({ hasText: `MA Mass Communication ${run}` });
  await row.getByRole("button", { name: "Edit" }).click();
  await adm
    .locator("form")
    .filter({ has: adm.getByRole("button", { name: "Save", exact: true }) })
    .getByLabel("Students")
    .fill("42");
  await adm.getByRole("button", { name: "Save", exact: true }).click();
  await adm
    .getByText(/42 students/)
    .first()
    .waitFor();
  await guest.goto(WEB);
  await guest.getByText(`MA Mass Communication ${run}`).waitFor();
});
await step("admin saves university profile + uploads a brochure", async () => {
  await adm.getByLabel("Ranking / Accreditation").fill(`NAAC A+ • run ${run}`);
  await adm.getByRole("button", { name: "Save Profile" }).click();
  await adm.getByText("University profile saved.").waitFor();
  const pdf = resolve(tmpdir(), `e2e-brochure-${run}.pdf`);
  writeFileSync(
    pdf,
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
  await adm.getByRole("listitem").filter({ hasText: "2024" }).locator('input[type="file"]').setInputFiles(pdf);
  await adm.getByText("Brochure uploaded for 2024.").waitFor();
});
await step("admin changes a setting and resets it; health + audit render", async () => {
  await adm.goto(`${WEB}/admin/system`);
  await adm
    .getByText(/Everything is working|warning|problem/i)
    .first()
    .waitFor();
  const field = adm.getByLabel("Email code lifetime");
  await field.fill("12");
  const row = adm.getByRole("listitem").filter({ has: field });
  await row.getByRole("button", { name: "Save" }).click();
  await adm.getByText("Changed").first().waitFor();
  await adm
    .getByRole("listitem")
    .filter({ has: adm.getByLabel("Email code lifetime") })
    .getByRole("button", { name: "Reset" })
    .click();
  await adm.waitForFunction(() => document.querySelector('input[aria-label="Email code lifetime"]')?.value === "10");
  await adm.reload();
  await adm.getByLabel("Entity filter").selectOption("setting");
  await adm.getByRole("cell", { name: "setting.reset" }).first().waitFor();
  await adm.getByRole("cell", { name: "setting.updated" }).first().waitFor();
});

// ---------- recruiter self-service ----------
await step("recruiter edits organisation profile and contacts", async () => {
  await rec.getByRole("button", { name: "Edit Organisation Profile" }).click();
  const d = rec.getByRole("dialog", { name: "Organisation Profile" });
  await d.getByLabel("Industry Sector").fill("IT Services & Consulting");
  await d.getByRole("button", { name: "Save Profile" }).click();
  await d.getByText("Profile saved.").waitFor();
  await d.getByLabel("Contact name").fill(`E2E Contact ${run}`);
  await d.getByLabel("Contact email").fill(`contact${run}@e2e.test`);
  await d.getByRole("button", { name: "Add Contact" }).click();
  await d.getByText(`E2E Contact ${run}`).waitFor();
  await d.getByRole("button", { name: `Remove E2E Contact ${run}` }).click();
  await d.getByText(`E2E Contact ${run}`).waitFor({ state: "detached" });
  await d.getByRole("button", { name: "Close" }).click();
});
await step("posting returned by admin is edited and resubmitted; untouched fields survive", async () => {
  const { access_token: token } = await apiCall("POST", "/auth/login", { body: { email: RECRUITER, password: PW } });
  const cse = (await apiCall("GET", "/programmes")).find((p) => p.name === "B.Tech Computer Science & Engg");
  const deadline = new Date(Date.now() + 9 * 864e5);
  deadline.setHours(15, 0, 0, 0);
  const eligibility = { min_cgpa: 6, programmes: [cse.id], completion_years: [2026, 2027, 2028], max_age: 28 };
  const { id } = await apiCall("POST", "/company/opportunities", {
    token,
    body: {
      type: "competition",
      title: JOB2,
      location: "Guwahati",
      description: "Draft that needs a fix.",
      apply_deadline: deadline.toISOString(),
      eligibility,
      selection_process: {},
    },
  });
  await apiCall("POST", `/company/opportunities/${id}/submit`, { token });

  await adm.goto(`${WEB}/admin`);
  await adm.getByRole("tab", { name: /Job & Internship Postings/ }).click();
  const row = adm.getByRole("row").filter({ hasText: JOB2 });
  await row.getByRole("button", { name: "Return" }).click();
  await row.getByPlaceholder(/Reason/).fill("Add the CTC breakdown");
  await row.getByRole("button", { name: "Send" }).click();
  await row.waitFor({ state: "detached" });

  await rec.reload();
  await rec.getByLabel("Choose drive").selectOption({ label: `${JOB2} (Returned for edits)` });
  await rec.getByText("Add the CTC breakdown").waitFor();
  await rec.getByRole("button", { name: "Edit Posting" }).click();
  const d = rec.getByRole("dialog", { name: "Edit posting" });
  await d.getByLabel("CTC & Benefits").fill("₹8 LPA base + ₹1 LPA variable");
  await d.getByRole("button", { name: "Save & Resubmit for Approval" }).click();
  await d.waitFor({ state: "detached" });

  await adm.reload();
  await adm.getByRole("tab", { name: /Job & Internship Postings/ }).click();
  await adm.getByRole("row").filter({ hasText: JOB2 }).getByText("₹8 LPA base").waitFor();
  const p = (await apiList("/company/opportunities", token)).find((o) => o.id === id);
  const got = { type: p.type, eligibility: p.eligibility, apply_deadline: new Date(p.apply_deadline).toISOString() };
  assert.deepEqual(got, { type: "competition", eligibility, apply_deadline: deadline.toISOString() }, `after edit: ${JSON.stringify(got)}`);
});
await step("recruiter 4-step registration (UI) + OTP", async () => {
  await guest.goto(`${WEB}/#register`);
  await guest.getByLabel("Organisation Legal Name *").fill(`E2E Ventures ${run}`);
  await guest.getByLabel("Official Website *").fill("https://e2e.test");
  await guest.getByLabel("Corporate Category *").selectOption("startup");
  await guest.getByRole("button", { name: /Next: Sector & Domain/ }).click();
  await guest.getByLabel("Industry Sector *").fill("Fintech");
  await guest.getByRole("button", { name: /Next: Contact Authority/ }).click();
  await guest.getByLabel("Contact Person Name *").fill("Riya E2E");
  await guest.getByLabel("Official Email *").fill(NEW_REC);
  await guest.getByLabel("Create Password *").fill(NEW_REC_PW);
  await guest.getByRole("button", { name: /Submit & Send Code/ }).click();
  await guest.getByLabel("Verification Code *").fill(await otpFor(NEW_REC));
  await guest.getByRole("button", { name: /Verify & Submit/ }).click();
  await guest.getByText("Submitted for TPO verification").waitFor();
});
await step("admin rejects recruiter; recruiter corrects + resubmits from login", async () => {
  await adm.reload();
  await adm.getByRole("tab", { name: /Recruiter Onboarding/ }).click();
  const row = adm.getByRole("row").filter({ hasText: NEW_REC });
  await row.getByRole("button", { name: "Reject" }).click();
  await row.getByPlaceholder(/Reason/).fill("Use your company domain website");
  await row.getByRole("button", { name: "Send" }).click();
  await row.waitFor({ state: "detached" });

  await login(guest, NEW_REC, NEW_REC_PW);
  await guest.getByRole("heading", { name: "Correct & resubmit your organisation" }).waitFor();
  await guest.getByText(/Use your company domain website/).waitFor();
  await guest.getByLabel("Organisation Legal Name *").fill(`E2E Ventures Pvt Ltd ${run}`);
  await guest.getByLabel("Official Website").fill("https://ventures.e2e.test");
  await guest.getByRole("button", { name: "Resubmit for approval" }).click();
  await guest.getByText(/back in the T&P approval queue/).waitFor();

  await adm.reload();
  await adm.getByRole("tab", { name: /Recruiter Onboarding/ }).click();
  await adm.getByRole("row").filter({ hasText: NEW_REC }).getByText(`E2E Ventures Pvt Ltd ${run}`).waitFor();
});
await step("non-admin is kept out of admin pages", async () => {
  await stu.goto(`${WEB}/admin/system`);
  await stu.waitForURL(/\/student$/);
});

await browser.close();
summary();
