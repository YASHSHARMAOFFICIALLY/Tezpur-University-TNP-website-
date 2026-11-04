// UI journey for the November recruiter features: JD PDF, drive mode + hiring period, per-posting campus logistics,
// applicant records, and PDF attachments on messages to the T&P cell. Uses fresh postings/students on every run.
//
// usage: node scripts/e2e-nov-recruiter.mjs [--headed]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ADMIN, DOMAIN, PW, RECRUITER, apiCall, apiList, browser, here, login, mailText, newPage, otpFor, run, step, summary, ymd } from "./e2e-lib.mjs";

const PDF =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
const pdfFile = (name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(PDF) });
const JOB = `Nov Data Engineer ${run}`;
const Y = new Date().getFullYear();
const NEXT = Y + 1;
const ENROL = `CSB8${run}`;
const STUDENT = `${ENROL.toLowerCase()}@${DOMAIN}`;
const STUDENT_PW = `Nov-${run}-pass`;
const NAME = `Nov Applicant ${run}`;
const RECORD = `Kafka pipeline internship ${run}`;
const VENUE = `Seminar Hall ${run}, Tezpur University`;
const SUBJECT = `Room plan ${run}`;

const admin = (await apiCall("POST", "/auth/login", { body: { email: ADMIN, password: PW } })).access_token;
const recToken = (await apiCall("POST", "/auth/login", { body: { email: RECRUITER, password: PW } })).access_token;
const cse = (await apiCall("GET", "/programmes")).find((p) => p.name === "B.Tech Computer Science & Engg");
let postingId;
let studentToken;

const rec = await newPage();
await step("recruiter signs in to /recruiter", async () => {
  await login(rec, RECRUITER, PW);
  await rec.waitForURL(/\/recruiter$/);
  for (const n of ["Overview", "Postings", "Drive Desk", "Candidates", "Messages", "Talent Pool"]) await rec.getByRole("link", { name: n, exact: true }).first().waitFor();
});

await step("studio creates a hybrid posting, hiring Jan-Mar next year, with a JD PDF and venue", async () => {
  await rec.getByRole("button", { name: "Create New Job Opening" }).click();
  const d = rec.getByRole("dialog", { name: "Job & Internship Posting Studio" });
  await d.getByLabel("ROLE PROFILE / JOB TITLE *").fill(JOB);
  await d.getByLabel("TENTATIVE WORK LOCATION *").fill("Guwahati");
  await d.getByLabel("JOB DESCRIPTION *").fill("Build streaming data pipelines.");
  await d.getByLabel("JOB DESCRIPTION PDF").setInputFiles(pdfFile("jd.pdf"));
  await d.getByLabel(cse.name).check();
  await d.getByLabel("Minimum Cutoff CGPA").fill("5");
  await d.getByLabel("Passing-out Batch *").selectOption(String(Y));
  await d.getByLabel("Apply Deadline *").fill(ymd(new Date(Date.now() + 6 * 864e5)));
  await d.getByLabel("Drive mode").selectOption({ label: "Hybrid (mix)" });
  await d.getByLabel("Hiring from").fill(`${NEXT}-01`);
  await d.getByLabel("Hiring until (optional)").fill(`${NEXT}-03`);
  await d.getByLabel("Venue").fill("To be confirmed");
  await d.getByRole("button", { name: "Publish Opening to Students" }).click();
  await d.waitFor({ state: "detached" });
  const [p] = (await apiList("/company/opportunities", recToken)).filter((o) => o.title === JOB);
  assert.deepEqual([p.drive_mode, p.hiring_from, p.hiring_to, p.status, !!p.jd_file_id], ["hybrid", `${NEXT}-01`, `${NEXT}-03`, "pending_admin", true]);
  postingId = p.id;
});

await step("posting card shows drive mode, hiring period and a working View JD", async () => {
  const card = rec.getByRole("listitem").filter({ has: rec.getByRole("heading", { name: JOB }) });
  await card.getByText("Hybrid (mix)").waitFor();
  await card.getByText(`Jan ${NEXT} – Mar ${NEXT}`).waitFor();
  const [popup] = await Promise.all([rec.waitForEvent("popup"), card.getByRole("button", { name: /View JD/ }).click()]);
  await popup.close();
});

await step("drive desk shows the same mode and period for the selected drive", async () => {
  await rec.getByRole("listitem").filter({ has: rec.getByRole("heading", { name: JOB }) }).getByRole("button", { name: "Open Drive" }).click();
  const desk = rec.locator("section").filter({ has: rec.locator("#drive") });
  await desk.getByRole("heading", { name: JOB }).waitFor();
  await desk.getByText("Hybrid (mix)").waitFor();
  await desk.getByText(`Jan ${NEXT} – Mar ${NEXT}`).waitFor();
});

await step("a student applies (setup via API: register, OTP, profile, record with file) and admin releases", async () => {
  await apiCall("POST", `/admin/opportunities/${postingId}/decision`, { token: admin, body: { decision: "approve" } });
  await apiCall("POST", "/auth/register/student", { body: { email: STUDENT, password: STUDENT_PW, name: NAME, enrolment_no: ENROL, mobile: "9876512345", programme_id: cse.id } });
  await apiCall("POST", "/auth/verify-otp", { body: { email: STUDENT, code: await otpFor(STUDENT) } });
  studentToken = (await apiCall("POST", "/auth/login", { body: { email: STUDENT, password: STUDENT_PW } })).access_token;
  const token = studentToken;
  await apiCall("PATCH", "/students/me", { token, body: { dob: "2003-05-01", cgpa: 8.4, programme_id: cse.id, year_of_completion: Y } });
  await apiCall("POST", "/students/me/resume", { token, file: { bytes: Buffer.from(PDF), type: "application/pdf", name: "cv.pdf" } });
  await apiCall("POST", "/students/me/photo", { token, file: { bytes: readFileSync(resolve(here, "public/img/emblem.jpg")), type: "image/jpeg", name: "p.jpg" } });
  const r = await apiCall("POST", "/students/me/records", { token, body: { kind: "internship", title: RECORD, organisation: "Acme Data", start_month: `${Y}-05`, end_month: `${Y}-07` } });
  await apiCall("POST", `/students/me/records/${r.id}/file`, { token, file: { bytes: Buffer.from(PDF), type: "application/pdf", name: "letter.pdf" } });
  await apiCall("POST", `/opportunities/${postingId}/apply`, { token });
  const { released } = await apiCall("POST", `/admin/opportunities/${postingId}/release`, { token: admin, body: {} });
  assert.equal(released, 1);
});

await step("recruiter saves campus logistics on the live posting", async () => {
  await rec.reload();
  await rec.getByLabel("Choose drive").selectOption({ label: `${JOB} (Live to students)` });
  const form = rec.getByRole("form", { name: "Campus logistics" });
  await form.getByText(/Only students who applied to this posting see these details/).waitFor();
  await form.getByLabel("Venue").fill(VENUE);
  await form.getByLabel("Logistics notes").fill("Report at 9:00 AM with your ID card.");
  await form.getByRole("button", { name: "Save Logistics" }).click();
  await form.getByText(/Logistics saved/).waitFor();
  await rec.getByRole("listitem").filter({ has: rec.getByRole("heading", { name: JOB }) }).getByText(VENUE).waitFor();
});

await step("the applicant sees the venue on /applications/mine and gets the logistics email", async () => {
  const mine = await apiList("/applications/mine", studentToken);
  const app = mine.find((a) => a.opportunity.id === postingId);
  assert.equal(app?.opportunity.venue, VENUE);
  assert.match(app.opportunity.logistics, /9:00 AM/);
  assert.match(await mailText(STUDENT, /Campus logistics/), new RegExp(VENUE));
});

await step("candidate profile shows the released applicant's records with a file button", async () => {
  await rec.getByRole("button", { name: `View profile of ${NAME}` }).click();
  const d = rec.getByRole("dialog", { name: NAME });
  await d.getByText(RECORD).waitFor();
  await d.getByText(/Acme Data/).waitFor();
  const [popup] = await Promise.all([rec.waitForEvent("popup"), d.getByRole("button", { name: `View file: ${RECORD}` }).click()]);
  await popup.close();
  await d.getByRole("button", { name: "Close" }).click();
});

await step("recruiter sends a message with a PDF and sees the attachment button", async () => {
  await rec.getByLabel("SUBJECT HEADER").fill(SUBJECT);
  await rec.getByLabel("DISPATCH CONTENT").fill("Room plan for the drive attached.");
  await rec.getByLabel("ATTACHMENT (PDF, OPTIONAL)").setInputFiles(pdfFile("rooms.pdf"));
  await rec.getByRole("button", { name: /Transmit Announcement/ }).click();
  await rec.getByText("Sent to the T&P cell with the PDF attached.").waitFor();
  const item = rec.getByRole("listitem").filter({ hasText: SUBJECT });
  const [popup] = await Promise.all([rec.waitForEvent("popup"), item.getByRole("button", { name: `Attachment: ${SUBJECT}` }).click()]);
  await popup.close();
});

await step("an admin reply with a PDF shows an attachment button on the recruiter side", async () => {
  const me = await apiCall("GET", "/companies/me", { token: recToken });
  const reply = `Re: ${SUBJECT}`;
  const m = await apiCall("POST", "/messages", { token: admin, body: { company_id: me.id, subject: reply, body: "Confirmed." } });
  await apiCall("POST", `/messages/${m.id}/attachment`, { token: admin, file: { bytes: Buffer.from(PDF), type: "application/pdf", name: "ok.pdf" } });
  await rec.reload();
  const item = rec.getByRole("listitem").filter({ hasText: reply });
  await item.getByText("T&P cell", { exact: true }).waitFor();
  await item.getByRole("button", { name: `Attachment: ${reply}` }).waitFor();
});

await browser.close();
summary();
