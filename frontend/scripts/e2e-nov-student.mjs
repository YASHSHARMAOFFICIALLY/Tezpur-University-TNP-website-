// Student portal + sign-in journeys for the Nov batch: enrolment-number login, student OTP registration, records,
// recruiter feedback, application logistics, placed lock and appeal. Needs the dev stack (web, API, Mailpit).
// usage: WEB=http://localhost:3001 DEMO_PASSWORD=... SEED_ADMIN_EMAIL=... node scripts/e2e-nov-student.mjs [--headed]
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ADMIN, DOMAIN, PW, RECRUITER, WEB, apiCall, browser, here, newPage, otpFor, run, step, summary } from "./e2e-lib.mjs";

const ENROL = `NOV${run}`;
const EMAIL = `${ENROL.toLowerCase()}@${DOMAIN}`;
const NAME = `Nova Student ${run}`;
const SPW = `Nov-Student-${run}!`;
const JOB1 = `Nov Logistics Drive ${run}`;
const JOB2 = `Nov Second Drive ${run}`;
const pdf = resolve(tmpdir(), `nov-${run}.pdf`);
writeFileSync(
  pdf,
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const jpg = resolve(here, "public/img/emblem.jpg");

const token = async (email, password = PW) => (await apiCall("POST", "/auth/login", { body: { email, password } })).access_token;
const rec = await token(RECRUITER);
const adm = await token(ADMIN);
const cse = (await apiCall("GET", "/programmes")).find((p) => p.name === "B.Tech Computer Science & Engg");

async function approvedPosting(title, extra = {}) {
  const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
  const { id } = await apiCall("POST", "/company/opportunities", {
    token: rec,
    body: { type: "job", title, description: "Nov batch e2e posting.", apply_deadline: deadline, eligibility: {}, selection_process: {}, ...extra },
  });
  await apiCall("POST", `/company/opportunities/${id}/submit`, { token: rec });
  await apiCall("POST", `/admin/opportunities/${id}/decision`, { token: adm, body: { decision: "approve" } });
  return id;
}

const page = await newPage();
const card = (title) => page.locator("article").filter({ hasText: title });
const appCard = (title) => page.getByRole("listitem", { name: new RegExp(`Application: .*${title}`) });

await step("student registers via the UI, verifies the OTP and is told the account is active", async () => {
  await page.goto(`${WEB}/#register`);
  await page.getByRole("tab", { name: /Student/ }).click();
  await page.getByLabel("Full Name *").fill(NAME);
  await page.getByLabel("Enrolment Number *").fill(ENROL);
  await page.getByLabel("University Email *").fill(EMAIL);
  await page.getByLabel("Mobile *").fill("9876500000");
  await page.getByLabel("Programme").selectOption(cse.id);
  await page.getByLabel("Create Password *").fill(SPW);
  await page.getByRole("button", { name: /Register & Send Code/ }).click();
  await page.getByLabel("Verification Code *").fill(await otpFor(EMAIL));
  await page.getByRole("button", { name: /Verify & Submit/ }).click();
  await page.getByText("Your account is active, sign in").waitFor();
});

await step("student signs in with the enrolment number", async () => {
  await page.goto(`${WEB}/login`);
  await page.getByLabel("Enrolment number or Email *").fill(ENROL);
  await page.getByLabel("Password *").fill(SPW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/student$/);
  await page.getByRole("heading", { name: "Welcome back, Nova" }).waitFor(); // lands on Home
  await page.getByRole("link", { name: "Profile", exact: true }).first().click();
  await page.getByRole("heading", { name: NAME }).waitFor();
});

const stu = await token(EMAIL, SPW);
await apiCall("POST", "/students/me/photo", { token: stu, file: { bytes: readFileSync(jpg), type: "image/jpeg", name: "p.jpg" } });
await apiCall("POST", "/students/me/resume", { token: stu, file: { bytes: readFileSync(pdf), type: "application/pdf", name: "cv.pdf" } });
await apiCall("PATCH", "/students/me", { token: stu, body: { dob: "2004-03-01", cgpa: 8.1, year_of_completion: 2027 } });
const opp1 = await approvedPosting(JOB1, { drive_mode: "hybrid", hiring_from: "2027-01", hiring_to: "2027-03" });

// The sidebar shows one section at a time; the URL hash picks it, and a reload keeps it.
const view = (h) => page.goto(`${WEB}/student${h}`);
await step("drive card shows the drive mode and the hiring period; Apply works", async () => {
  await view("#drives");
  await page.reload();
  const c = card(JOB1);
  await c.getByText("Hybrid drive").waitFor();
  await c.getByText("Hiring period: Jan–Mar 2027").waitFor();
  await c.getByRole("button", { name: "Apply Now" }).click();
  await c.getByText(/Applied • Awaiting T&P Release/).waitFor();
});

await step("venue and logistics set by the recruiter show on the application", async () => {
  await view("#applications");
  const a = appCard(JOB1);
  await a.getByText("Venue & logistics (shared only with applicants)").waitFor();
  await a.getByText("hasn't shared the venue").waitFor();
  await apiCall("PUT", `/company/opportunities/${opp1}/logistics`, { token: rec, body: { venue: `Seminar Hall ${run}`, logistics: "Report at 9 am with ID card." } });
  await page.reload();
  await appCard(JOB1).getByText(`Seminar Hall ${run}`).waitFor();
  await appCard(JOB1).getByText("Report at 9 am with ID card.").waitFor();
  await appCard(JOB1).getByText("Hiring period: Jan–Mar 2027").waitFor();
});

await step("student rates the recruiter they applied to; re-rating replaces it", async () => {
  const a = appCard(JOB1);
  await a.getByRole("radio", { name: "4 stars" }).click();
  await a.getByLabel("Comment (optional)").fill("Clear process");
  await a.getByRole("button", { name: "Save rating" }).click();
  await a.getByText("Thanks, your rating is saved.").waitFor();
  await a.getByRole("radio", { name: "5 stars" }).click();
  await a.getByRole("button", { name: "Update rating" }).click();
  await a.getByText("Thanks, your rating is saved.").waitFor();
  const mine = (await apiCall("GET", "/students/me/feedback", { token: stu })).filter((f) => f.target_id === opp1);
  assert.deepEqual(
    mine.map((f) => [f.target, f.rating, f.comment]),
    [["opportunity", 5, "Clear process"]],
  );
  await page.reload();
  await appCard(JOB1).getByRole("radio", { name: "5 stars", checked: true }).waitFor();
});

for (const [tab, kind] of [
  ["Certificates", "certificate"],
  ["Internships", "internship"],
  ["Projects", "project"],
]) {
  await step(`student adds ${kind === "internship" ? "an" : "a"} ${kind} with an attachment and sees it listed`, async () => {
    await view("#records");
    const sec = page.locator("#records").locator("..");
    await sec.getByRole("tab", { name: new RegExp(tab) }).click();
    await sec.getByRole("button", { name: `Add ${kind}` }).click();
    const f = sec.getByRole("form", { name: `New ${kind}` });
    await f.getByLabel("Title *").fill(`Nov ${kind} ${run}`);
    await f.getByLabel(/Issued by|Organisation|Guide/).fill("Tezpur Labs");
    await f.getByLabel("Start month").fill("2026-05");
    await f.getByLabel("End month").fill("2026-07");
    await f.getByLabel("Description").fill(`Did the ${kind} work.`);
    await f.getByLabel("Link").fill("https://example.com/proof");
    await f.getByLabel("Attachment").setInputFiles(kind === "project" ? jpg : pdf);
    await f.getByRole("button", { name: `Save ${kind}` }).click();
    await f.waitFor({ state: "detached" });
    const item = sec.getByRole("listitem", { name: `Nov ${kind} ${run}` });
    await item.getByText("May–Jul 2026").waitFor();
    await item.getByRole("button", { name: "View attachment" }).waitFor();
  });
}
await step("records persist on the server with their files", async () => {
  const recs = await apiCall("GET", "/students/me/records", { token: stu });
  assert.deepEqual(recs.map((r) => [r.kind, !!r.file_id, r.start_month, r.end_month]).sort(), [
    ["certificate", true, "2026-05", "2026-07"],
    ["internship", true, "2026-05", "2026-07"],
    ["project", true, "2026-05", "2026-07"],
  ]);
});

await apiCall("POST", `/admin/opportunities/${opp1}/release`, { token: adm, body: {} });
const [applicant] = (await apiCall("GET", `/company/opportunities/${opp1}/applicants?limit=100`, { token: rec })).data;
await apiCall("POST", "/company/applications/shortlist", { token: rec, body: { application_ids: [applicant.id] } });
await apiCall("POST", `/company/opportunities/${opp1}/results`, { token: rec, body: { selected_application_ids: [applicant.id] } });
await apiCall("POST", `/admin/opportunities/${opp1}/results/publish`, { token: adm });
await approvedPosting(JOB2);

await step("placed student sees Apply disabled; the reason is in the banner and the button tooltip", async () => {
  await view("#drives");
  await page.reload();
  await page.getByText(/You are placed at Cognizant Technology Solutions\. Applying to new drives is closed\./).waitFor();
  const c = card(JOB2);
  assert.ok(await c.getByRole("button", { name: "Applying closed" }).isDisabled(), "Apply must be disabled while placed");
  assert.equal(await c.getByRole("button", { name: "Applying closed" }).getAttribute("title"), "You are placed at Cognizant Technology Solutions");
  assert.equal(await c.getByText("You are placed at Cognizant Technology Solutions").count(), 0, "the reason is said once in the banner, not on every card");
});

await step("placed student files an appeal and sees it pending", async () => {
  await page.getByLabel(/Ask the T&P cell to let you apply again/).fill("A core-role offer I want to pursue.");
  await page.getByRole("button", { name: "Send appeal" }).click();
  await page.getByText("Appeal pending").waitFor();
  await page.reload();
  await page.getByText("A core-role offer I want to pursue.").waitFor();
});

await step("after the admin grants the appeal, Apply works again and the note shows", async () => {
  const appeal = (await apiCall("GET", "/admin/appeals", { token: adm })).find((a) => a.enrolment_no === ENROL);
  await apiCall("POST", `/admin/students/${appeal.student_id}/appeal`, { token: adm, body: { grant: true, note: `Go ahead ${run}` } });
  await page.reload();
  await page.getByText(`Go ahead ${run}`).waitFor();
  const c = card(JOB2);
  await c.getByRole("button", { name: "Apply Now" }).click();
  await c.getByText(/Applied • Awaiting T&P Release/).waitFor();
});

await browser.close();
summary();
