// Admin changes, made in the browser, show up on the student's screens (and go away again when undone).
// Notices, placement records, a drive approved then closed, and a published event. Setup that is not under test goes through the API.
// usage: WEB=http://localhost:3001 DEMO_PASSWORD=... SEED_ADMIN_EMAIL=... node scripts/e2e-admin-student.mjs
import assert from "node:assert/strict";
import { ADMIN, DOMAIN, PW, RECRUITER, WEB, apiCall, browser, newPage, otpFor, run, step, summary } from "./e2e-lib.mjs";

const PDF = Buffer.from("%PDF-1.4\n%e2e\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ENROL = `ZZA${run}`;
const EMAIL = `${ENROL.toLowerCase()}@${DOMAIN}`;
const SPW = "E2e-Student-Pass-2026";
const NOTICE = `E2E Admin Notice ${run}`;
const COHORT = `E2E Cohort ${run}`;
const DRIVE = `E2E Admin Drive ${run}`;
const EVENT = `E2E Admin Workshop ${run}`;
const YEAR = 2090 + (Number(run) % 11); // the form allows 2000-2100

const login = (email, password) => apiCall("POST", "/auth/login", { body: { email, password } });
const pageAs = async (session) => {
  const page = await newPage();
  await page.goto(`${WEB}/login`);
  await page.evaluate((s) => localStorage.setItem("tnp.session", s), JSON.stringify(session));
  return page;
};
const A = (await login(ADMIN, PW)).access_token;
const R = (await login(RECRUITER, PW)).access_token;

// a fresh, complete, unplaced student so the seed student's state doesn't matter
const prog = (await apiCall("GET", "/programmes"))[0];
await apiCall("POST", "/auth/register/student", { body: { email: EMAIL, password: SPW, name: `Admin Check ${run}`, enrolment_no: ENROL, mobile: "9876500001", programme_id: prog.id } });
await apiCall("POST", "/auth/verify-otp", { body: { email: EMAIL, code: await otpFor(EMAIL) } });
const sess = await login(EMAIL, SPW);
const S = sess.access_token;
await apiCall("PATCH", "/students/me", { token: S, body: { programme_id: prog.id, year_of_completion: new Date().getFullYear() + 1, cgpa: 8.5, dob: "2003-01-01" } });
await apiCall("POST", "/students/me/resume", { token: S, file: { bytes: PDF, type: "application/pdf", name: "cv.pdf" } });
await apiCall("POST", "/students/me/photo", { token: S, file: { bytes: PNG, type: "image/png", name: "me.png" } });

const adm = await pageAs(await login(ADMIN, PW));
const stu = await pageAs(sess);
/** Open a student tab fresh, so nothing comes from a stale client cache. */
const studentView = async (hash) => {
  await stu.goto(`${WEB}/student#${hash}`);
  await stu.reload();
};

await step("notice: admin posts it; the student sees it on Home and in Notices", async () => {
  await adm.goto(`${WEB}/admin/comms`);
  await adm.getByLabel("Title *").fill(NOTICE);
  await adm.getByLabel("Message *").fill("Bring two printed copies of your resume.");
  await adm.getByRole("button", { name: "Publish Notice" }).click();
  await adm.getByText("Notice published.").waitFor();
  await studentView("home");
  await stu.getByRole("heading", { name: `Welcome back, Admin` }).waitFor();
  await stu.getByText(NOTICE).first().waitFor(); // newest three appear on Home
  await studentView("notices");
  await stu.getByRole("heading", { name: NOTICE }).waitFor();
});

await step("placement record: admin adds, edits and deletes it; the student's stats follow each change", async () => {
  for (const r of await apiCall("GET", "/placement-records")) if (r.year === YEAR) await apiCall("DELETE", `/admin/placement-records/${r.id}`, { token: A });
  await adm.goto(`${WEB}/admin/content`);
  await adm.getByLabel("Year *").first().fill(String(YEAR));
  await adm.getByLabel("Placement rate (%)").first().fill("61.3");
  await adm.getByLabel("Highest CTC (LPA)").first().fill("33.3");
  await adm.getByLabel("Cohort label").first().fill(COHORT);
  await adm.getByRole("button", { name: "Add Record" }).click();
  await adm.getByText("Record added.").waitFor();
  await studentView("placement");
  await stu.getByRole("heading", { name: COHORT }).waitFor();
  await stu.getByText("61.3%").waitFor();
  await stu.getByText("33.3 LPA").waitFor();
  await studentView("home"); // the newest year feeds the Home card
  await stu.getByText(COHORT).waitFor();

  const row = () => adm.getByRole("listitem").filter({ has: adm.getByText(String(YEAR), { exact: true }) });
  await row().getByRole("button", { name: "Edit" }).click();
  await adm.getByLabel("Placement rate (%)").last().fill("62.7");
  await adm.getByRole("button", { name: "Save Record" }).click();
  await row().getByText("Placement rate (%): 62.7").waitFor();
  await studentView("placement");
  await stu.getByText("62.7%").waitFor();

  await row().getByRole("button", { name: "Delete" }).click();
  await row().getByRole("button", { name: `Confirm Delete ${YEAR}` }).click();
  await adm.getByText(`Record for ${YEAR} deleted.`).waitFor();
  await studentView("placement");
  await stu.getByText(COHORT).waitFor({ state: "detached" });
});

await step("drive: admin approves it; the student can apply; admin closes it; it leaves the student's list", async () => {
  const { id } = await apiCall("POST", "/company/opportunities", {
    token: R,
    body: { type: "job", title: DRIVE, description: "Drive approved then closed by the admin.", apply_deadline: new Date(Date.now() + 7 * 864e5).toISOString(), eligibility: {}, selection_process: {} },
  });
  await apiCall("POST", `/company/opportunities/${id}/submit`, { token: R });
  await studentView("drives");
  await stu.locator("article").filter({ hasText: DRIVE }).waitFor({ state: "detached" }); // pending drives are invisible to students

  await adm.goto(`${WEB}/admin`);
  await adm.getByRole("tab", { name: /Job & Internship Postings/ }).click();
  const row = adm.getByRole("row").filter({ hasText: DRIVE });
  await row.getByRole("button", { name: "Approve" }).click();
  await row.waitFor({ state: "detached" });
  await studentView("drives");
  await stu.locator("article").filter({ hasText: DRIVE }).getByRole("button", { name: /Apply Now/ }).waitFor();

  await adm.goto(`${WEB}/admin`);
  await adm.getByLabel("Select Concluded Drive").selectOption(id);
  await adm.getByRole("button", { name: "Close drive to new applicants" }).click();
  await adm.getByRole("button", { name: "Close drive", exact: true }).click();
  await adm.getByText("Drive closed.").waitFor();
  await studentView("drives");
  await stu.locator("article").filter({ hasText: DRIVE }).waitFor({ state: "detached" });
});

await step("event: admin publishes it; the student sees it, registers, and it is listed as registered", async () => {
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  await adm.goto(`${WEB}/admin`);
  const studio = adm.locator("details").filter({ hasText: "Event & Training Creator Studio" });
  if (!(await studio.evaluate((el) => el.open))) await adm.getByText("Event & Training Creator Studio").click();
  await adm.getByLabel("Workshop / Session Topic").fill(EVENT);
  await adm.getByLabel("Date", { exact: true }).fill(day(6));
  await adm.getByLabel("RSVP Cut-off Date").fill(day(4));
  await adm.getByRole("button", { name: /Broadcast & Enlist Session/ }).click();
  await adm.getByText("Session published").waitFor();
  await studentView("training");
  const card = stu.locator("article").filter({ hasText: EVENT });
  await card.getByRole("button", { name: "Register" }).click();
  await card.getByRole("button", { name: "Cancel Registration" }).waitFor();
  const mine = await apiCall("GET", "/events/mine?limit=100", { token: S });
  assert.ok(mine.data.some((r) => JSON.stringify(r.event).includes(EVENT) && r.status !== "cancelled"), "registration is recorded");
});

await browser.close();
summary();
