// Admin + landing journeys for the Nov 2026 batch, driven through the real UI against the dev stack.
// Setup that is not under test (accounts, postings, a placed student) goes through the API.
// usage: WEB=http://localhost:3001 DEMO_PASSWORD=... SEED_ADMIN_EMAIL=... node scripts/e2e-nov-admin.mjs [--headed]
import assert from "node:assert/strict";
import { ADMIN, DOMAIN, PW, RECRUITER, WEB, apiCall, apiList, browser, newPage, otpFor, run, step, summary } from "./e2e-lib.mjs";

const PDF = { name: "e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%e2e\n") };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const BATCH = new Date().getFullYear() + 4; // the newest batch chip the filter offers; no seed student has it
const ENROL = `ZZE${run}`;
const STUDENT_EMAIL = `${ENROL.toLowerCase()}@${DOMAIN}`;
const STUDENT_PW = "E2e-Student-Pass-2026";

async function token(email, password) {
  for (let i = 0; ; i++) {
    try {
      return await apiCall("POST", "/auth/login", { body: { email, password } });
    } catch (e) {
      if (i > 5) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
/** A browser page already signed in, the way shot.mjs does it (no UI login, no logout). */
async function pageAs(session) {
  const page = await newPage();
  await page.goto(`${WEB}/login`);
  await page.evaluate((s) => localStorage.setItem("tnp.session", s), JSON.stringify(session));
  return page;
}

const adminS = await token(ADMIN, PW);
const A = adminS.access_token;
const R = (await token(RECRUITER, PW)).access_token;
const adm = await pageAs(adminS);
const guest = await newPage();

// ---------- setup: an active student in batch BATCH with a full profile ----------
const progs = await apiCall("GET", "/programmes");
const prog = progs[0];
await apiCall("POST", "/auth/register/student", {
  body: { email: STUDENT_EMAIL, password: STUDENT_PW, name: `E2E Appellant ${run}`, enrolment_no: ENROL, mobile: "9876500000", programme_id: prog.id },
});
await apiCall("POST", "/auth/verify-otp", { body: { email: STUDENT_EMAIL, code: await otpFor(STUDENT_EMAIL) } });
const S = (await token(STUDENT_EMAIL, STUDENT_PW)).access_token;
await apiCall("PATCH", "/students/me", { token: S, body: { programme_id: prog.id, year_of_completion: BATCH, cgpa: 8.8, dob: "2003-01-01" } });
await apiCall("POST", "/students/me/resume", { token: S, file: { bytes: PDF.buffer, type: "application/pdf", name: "cv.pdf" } });
await apiCall("POST", "/students/me/photo", { token: S, file: { bytes: PNG, type: "image/png", name: "me.png" } });

await step("landing: hero title edited in admin shows on the public page (newline = line break)", async () => {
  await adm.goto(`${WEB}/admin/content`);
  const title = adm.getByLabel("Hero headline");
  await title.fill(`E2E Headline ${run}\nSecond line ${run}`);
  await adm.getByLabel("Directorate card title").fill(`E2E Directorate ${run}`);
  await adm.getByRole("button", { name: "Save Landing Text" }).click();
  await adm.getByText("Landing page text saved").waitFor();
  await guest.goto(WEB);
  const h1 = guest.getByRole("heading", { level: 1 });
  await h1.getByText(`E2E Headline ${run}`).waitFor();
  assert.equal(await h1.innerText(), `E2E Headline ${run}\nSecond line ${run}`);
  await guest.getByRole("heading", { name: `E2E Directorate ${run}` }).waitFor();
});

await step("landing: university profile save keeps the landing text", async () => {
  await adm.getByRole("button", { name: "Save Profile" }).click();
  await adm.getByText("University profile saved.").waitFor();
  await guest.reload();
  await guest.getByText(`E2E Headline ${run}`).waitFor();
});

await step("landing: clearing the fields restores the built-in text", async () => {
  await adm.reload();
  await adm.getByLabel("Hero headline").fill("");
  await adm.getByLabel("Directorate card title").fill("");
  await adm.getByRole("button", { name: "Save Landing Text" }).click();
  await adm.getByText("Landing page text saved").waitFor();
  await guest.reload();
  await guest.getByRole("heading", { level: 1, name: /Empowering Aspirations/ }).waitFor();
});

await step("landing: every claim line (top bar, stat captions, brochure note, registration copy) is admin-editable and resets", async () => {
  const wanted = {
    "Top bar line (above the header)": `E2E top ${run}`,
    "Hero registration button label": `E2E cta ${run}`,
    "Hero stat caption: highest compensation": `E2E peak ${run}`,
    "Brochure card note": `E2E note ${run}`,
    "Registration section title": `E2E register ${run}`,
  };
  await adm.goto(`${WEB}/admin/content`);
  for (const [label, v] of Object.entries(wanted)) await adm.getByLabel(label).fill(v);
  await adm.getByRole("button", { name: "Save Landing Text" }).click();
  await adm.getByText("Landing page text saved").waitFor();
  await guest.goto(WEB);
  for (const v of Object.values(wanted)) await guest.getByText(v).first().waitFor();
  await adm.reload();
  for (const label of Object.keys(wanted)) await adm.getByLabel(label).fill("");
  await adm.getByRole("button", { name: "Save Landing Text" }).click();
  await adm.getByText("Landing page text saved").waitFor();
  await guest.reload();
  await guest.getByText("International/Domestic Peak").waitFor();
  await guest.getByText("Institutional Dual Registration Desk").waitFor();
});

await step("content: placement record edit and delete", async () => {
  const year = 2090 + (Number(run) % 9);
  await apiCall("POST", "/admin/placement-records", { token: A, body: { year, data: { placement_rate: 50 } } }).catch(() => {});
  await adm.reload();
  const row = () => adm.getByRole("listitem").filter({ has: adm.getByText(String(year), { exact: true }) });
  await row().getByRole("button", { name: "Edit" }).click();
  await adm.getByLabel("Placement rate (%)").last().fill("77");
  await adm.getByRole("button", { name: "Save Record" }).click();
  await row().getByText("Placement rate (%): 77").waitFor();
  await row().getByRole("button", { name: "Delete" }).click();
  await row().getByRole("button", { name: `Confirm Delete ${year}` }).click();
  await adm.getByText(`Record for ${year} deleted.`).waitFor();
  await row().waitFor({ state: "detached" });
});

await step("staff: create then delete a staff account with inline confirm", async () => {
  const email = `staff${run}@tezu.ac.in`;
  await adm.goto(`${WEB}/admin/teachers`);
  await adm.getByLabel("Full name *").fill(`E2E Staff ${run}`);
  await adm.getByLabel("University email *").fill(email);
  await adm.getByRole("button", { name: "Create Login" }).click();
  const row = adm.getByRole("listitem").filter({ hasText: email });
  await row.waitFor();
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Confirm Delete" }).click();
  await adm.getByText(`E2E Staff ${run}'s account deleted.`).waitFor();
  await row.waitFor({ state: "detached" });
});

await step("staff: deleting yourself shows CANNOT_DELETE (API, button is hidden for self)", async () => {
  const me = adminS.user.id;
  const r = await fetch(`${WEB}/api/v1/admin/teachers/${me}`, { method: "DELETE", headers: { authorization: `Bearer ${A}` } }).then((r) => r.json());
  assert.equal(r.error.code, "CANNOT_DELETE");
});

await step("notices: targeted notice shows live reach, posts with PDF, history shows chips + PDF", async () => {
  const expected = (await apiCall("GET", `/admin/notices/reach?batches=${BATCH}`, { token: A })).students;
  assert.ok(expected >= 1, "setup student is in the batch");
  await adm.goto(`${WEB}/admin/comms`);
  const form = adm.locator("form").filter({ has: adm.getByRole("button", { name: "Publish Notice" }) });
  await form.getByTestId("reach").getByText(/Reaches \d+ active student/).waitFor();
  const all = await form.getByTestId("reach").innerText();
  await form.getByLabel("Title *").fill(`E2E targeted ${run}`);
  await form.getByLabel("Message *").fill("Only the newest batch should see this.");
  await form.getByText(/Target students/).click();
  await form.getByRole("button", { name: String(BATCH), exact: true }).click();
  await form.getByTestId("reach").getByText(`Reaches ${expected} active student${expected === 1 ? "" : "s"}`).waitFor();
  assert.notEqual(all, await form.getByTestId("reach").innerText(), "reach narrowed");
  await form.getByLabel("PDF attachment (optional)").setInputFiles(PDF);
  await form.getByRole("button", { name: "Publish Notice" }).click();
  await adm.getByText("Notice published with its PDF.").waitFor();
  const item = adm.getByRole("listitem").filter({ hasText: `E2E targeted ${run}` });
  await item.getByText(`Batch ${BATCH}`).waitFor();
  await item.getByRole("button", { name: "PDF" }).waitFor();
  const n = (await apiCall("GET", `/admin/notices?limit=20&batches=${BATCH}`, { token: A })).data.find((x) => x.title === `E2E targeted ${run}`);
  assert.ok(n?.file_id, "notice has its PDF");
  assert.deepEqual(n.batches, [BATCH]);
});

await step("notices: student in the batch sees the targeted notice", async () => {
  const board = await apiCall("GET", "/noticeboard?limit=50", { token: S });
  assert.ok(board.data.some((x) => x.title === `E2E targeted ${run}`));
});

await step("messages: admin reply with PDF shows an Attachment button", async () => {
  await adm.getByLabel("Reply subject").fill(`E2E file ${run}`);
  await adm.getByLabel("Reply message").fill("JD attached.");
  await adm.locator("form").filter({ has: adm.getByRole("button", { name: "Send Reply" }) }).getByLabel("PDF attachment (optional)").setInputFiles(PDF);
  await adm.getByRole("button", { name: "Send Reply" }).click();
  await adm.getByText("Reply sent.").waitFor();
  const bubble = adm.locator("div").filter({ has: adm.getByText(`E2E file ${run}`) }).last();
  await bubble.getByRole("button", { name: "Attachment" }).waitFor();
});

await step("roster: batch filter narrows rows; notice action is prefilled and warns about search", async () => {
  await adm.goto(`${WEB}/admin/students`);
  const rows = adm.locator("tbody tr");
  await rows.first().waitFor();
  const before = await rows.count();
  await adm.getByText("Department, programme, batch, CGPA").click();
  await adm.getByRole("button", { name: String(BATCH), exact: true }).click();
  await adm.locator("tbody tr").filter({ hasText: ENROL }).waitFor();
  await adm.waitForFunction((n) => document.querySelectorAll("tbody tr").length < n, before);
  await adm.getByLabel("Search students").fill(ENROL);
  await adm.getByRole("button", { name: "Send notice to these students" }).click();
  const d = adm.getByRole("dialog", { name: "Notice to these students" });
  await d.getByText(/name search .* can.t be applied/).waitFor();
  assert.equal(await d.getByRole("button", { name: String(BATCH), exact: true }).getAttribute("aria-pressed"), "true");
  await d.getByTestId("reach").getByText(/Reaches \d+ active student/).waitFor();
  await d.getByRole("button", { name: "Close" }).click();
});

await step("roster: Manage shows the student's records with a file button", async () => {
  const rec = await apiCall("POST", "/students/me/records", { token: S, body: { kind: "certificate", title: `E2E Cert ${run}`, organisation: "NPTEL" } });
  await apiCall("POST", `/students/me/records/${rec.id}/file`, { token: S, file: { bytes: PDF.buffer, type: "application/pdf", name: "c.pdf" } });
  await adm.locator("tbody tr").filter({ hasText: ENROL }).getByRole("button", { name: "Manage" }).click();
  const d = adm.getByRole("dialog");
  const item = d.getByRole("listitem").filter({ hasText: `E2E Cert ${run}` });
  await item.getByRole("button", { name: "File" }).waitFor();
  await d.getByRole("button", { name: "Close" }).click();
});

await step("roster: clearing the last filter chip keeps the filter panel open", async () => {
  await adm.goto(`${WEB}/admin/students`);
  await adm.getByText("Department, programme, batch, CGPA").click();
  const chip = adm.getByRole("button", { name: String(BATCH), exact: true });
  await chip.click();
  await chip.click();
  assert.equal(await adm.locator("details").first().getAttribute("open"), "");
  await adm.getByRole("button", { name: "Female", exact: true }).click({ timeout: 3000 });
});

await step("CSV import with profile columns: first upload adds, second updates", async () => {
  const enrol = `ZZC${run}`;
  const csv = (cgpa) =>
    Buffer.from(
      `enrolment_no,name,email,programme_code,dob,minority,cgpa,year_of_completion,linkedin_url\n${enrol},E2E Csv ${run},${enrol.toLowerCase()}@${DOMAIN},${prog.code},2004-02-03,no,${cgpa},${BATCH},https://www.linkedin.com/in/e2e\n`,
    );
  const card = adm.locator("section").filter({ hasText: "Bulk Import from CSV" });
  for (const [cgpa, badge] of [
    ["7.1", "1 added"],
    ["7.9", "1 updated"],
  ]) {
    await card.getByLabel("CSV file").setInputFiles({ name: "s.csv", mimeType: "text/csv", buffer: csv(cgpa) });
    await card.getByRole("button", { name: "Start Import" }).click();
    await card.getByText(badge).waitFor({ timeout: 20_000 });
  }
  await card.getByText("0 skipped").waitFor();
  const r = await apiCall("GET", `/admin/students?q=${enrol}`, { token: A });
  assert.equal(r.data[0].cgpa, 7.9);
  assert.equal(r.data[0].dob?.slice(0, 10), "2004-02-03");
});

await step("appeal: placed student's appeal is granted from the console", async () => {
  const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
  const { id } = await apiCall("POST", "/company/opportunities", {
    token: R,
    body: { type: "job", title: `E2E Appeal Drive ${run}`, description: "Placement for the appeal journey.", apply_deadline: deadline, eligibility: {}, selection_process: {} },
  });
  await apiCall("POST", `/company/opportunities/${id}/submit`, { token: R });
  await apiCall("POST", `/admin/opportunities/${id}/decision`, { token: A, body: { decision: "approve" } });
  const app = await apiCall("POST", `/opportunities/${id}/apply`, { token: S });
  await apiCall("POST", `/admin/opportunities/${id}/release`, { token: A, body: {} });
  await apiCall("POST", "/company/applications/shortlist", { token: R, body: { application_ids: [app.id] } });
  await apiCall("POST", `/company/opportunities/${id}/results`, { token: R, body: { selected_application_ids: [app.id] } });
  await apiCall("POST", `/admin/opportunities/${id}/results/publish`, { token: A });
  assert.equal((await apiCall("GET", "/students/me/placement", { token: S })).placed, true);
  await apiCall("POST", "/students/me/appeal", { token: S, body: { reason: "I want to try for a core engineering role." } });
  await apiCall("POST", "/students/me/feedback", { token: S, body: { target: "opportunity", target_id: id, rating: 4, comment: `E2E comment ${run}` } });

  await adm.goto(`${WEB}/admin`);
  const item = adm.getByRole("listitem").filter({ hasText: ENROL });
  await item.getByText("I want to try for a core engineering role.").waitFor();
  await item.getByText(`E2E Appeal Drive ${run}`).waitFor();
  await item.getByLabel(/Note to/).fill("Granted for core roles.");
  await item.getByRole("button", { name: "Grant" }).click();
  await adm.getByText(/can apply again/).waitFor();
  await item.waitFor({ state: "detached" });
  const p = await apiCall("GET", "/students/me/placement", { token: S });
  assert.equal(p.placed, false);
  assert.equal(p.appeal_note, "Granted for core roles.");
});

await step("feedback panel shows the recruiter rating and comment", async () => {
  await adm.getByRole("tab", { name: "Recruiters" }).click();
  const fb = adm.locator("section").filter({ hasText: "Student Feedback" });
  const row = fb.getByRole("listitem").filter({ hasText: `E2E Appeal Drive ${run}` }).first();
  await row.waitFor();
  await row.getByText(/rating/).click();
  await row.getByText(`E2E comment ${run}`).waitFor();
  await row.getByText("4/5", { exact: false }).waitFor();
});

await step("drives: closing an approved drive from the console removes it from students' open drives", async () => {
  const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
  const { id } = await apiCall("POST", "/company/opportunities", {
    token: R,
    body: { type: "job", title: `E2E Close Drive ${run}`, description: "Drive that the T&P cell closes early.", apply_deadline: deadline, eligibility: {}, selection_process: {} },
  });
  await apiCall("POST", `/company/opportunities/${id}/submit`, { token: R });
  await apiCall("POST", `/admin/opportunities/${id}/decision`, { token: A, body: { decision: "approve" } });
  assert.ok((await apiList("/opportunities", S)).some((o) => o.id === id), "approved drive is open to students");
  await adm.goto(`${WEB}/admin`);
  await adm.getByLabel("Select Concluded Drive").selectOption(id);
  await adm.getByRole("button", { name: "Close drive to new applicants" }).click();
  await adm.getByRole("button", { name: "Keep open" }).click(); // backing out changes nothing
  assert.ok((await apiList("/opportunities", S)).some((o) => o.id === id), "keeping it open leaves the drive open");
  await adm.getByRole("button", { name: "Close drive to new applicants" }).click();
  await adm.getByRole("button", { name: "Close drive", exact: true }).click();
  await adm.getByText("Drive closed.").waitFor();
  assert.ok(!(await apiList("/opportunities", S)).some((o) => o.id === id), "closed drive is gone from students' open drives");
});

await browser.close();
summary();
