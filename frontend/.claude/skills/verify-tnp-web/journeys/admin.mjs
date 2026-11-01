// Admin edge cases: approving a posting whose deadline passed, double-clicking Approve, empty search,
// and every admin page and the Manage dialog at phone width.
// usage: webctl journey .claude/skills/verify-tnp-web/journeys/admin.mjs [--headed]
import { ADMIN, DOMAIN, PW, RECRUITER, WEB, apiCall, browser, login, newPage, otpFor, run, step, summary } from "../../../../scripts/e2e-lib.mjs";
import { noOverflow, shot, sql, tokenFor, userId } from "./lib.mjs";

const R = await tokenFor(RECRUITER);
const cse = (await apiCall("GET", "/programmes")).find((p) => p.name === "B.Tech Computer Science & Engg");
const LATE = `Edge Lapsed ${run}`;
const { id: lateId } = await apiCall("POST", "/company/opportunities", {
  token: R,
  body: {
    type: "job", title: LATE, description: "Deadline lapses while waiting for review.", location: "Pune",
    apply_deadline: new Date(Date.now() + 864e5).toISOString(),
    eligibility: { min_cgpa: 7, programmes: [cse.id], completion_years: [2026] }, selection_process: { technical_interview: true },
  },
});
await apiCall("POST", `/company/opportunities/${lateId}/submit`, { token: R });
sql(`update opportunities set apply_deadline = now() - interval '1 hour' where id = '${lateId}'`);

const PEND = `csb6${run}@${DOMAIN}`;
await apiCall("POST", "/auth/register/student", {
  body: { name: `Edge Pending ${run}`, enrolment_no: `CSB6${run}`, email: PEND, mobile: "9876500001", password: `Edge-${run}-pass`, programme_id: cse.id },
}).catch((e) => console.log(`      register: ${e.message}`));
await apiCall("POST", "/auth/verify-otp", { body: { email: PEND, code: await otpFor(PEND) } });

const adm = await newPage();
await login(adm, ADMIN, PW);
await adm.waitForURL(/\/admin$/);

await step("approving a posting whose deadline lapsed in the queue explains why, and Return still works", async () => {
  await adm.getByRole("tab", { name: /Job & Internship Postings/ }).click();
  const row = adm.getByRole("row").filter({ hasText: LATE });
  await row.getByRole("button", { name: "Approve" }).click();
  await adm.getByRole("alert").filter({ hasText: "apply deadline has already passed" }).waitFor();
  await shot(adm, "admin-approve-lapsed");
  if (sql(`select status from opportunities where id = '${lateId}'`) !== "pending_admin") throw new Error("lapsed posting changed status");
  await row.getByRole("button", { name: /Return|Reject/ }).first().click();
  await row.getByPlaceholder("Reason (sent to user)").fill("Please move the deadline");
  await row.getByRole("button", { name: "Send" }).click();
  await row.waitFor({ state: "detached" });
  if (sql(`select status from opportunities where id = '${lateId}'`) !== "draft") throw new Error("lapsed posting was not returned to draft");
});
await step("double-clicking Approve on a student approves once, with no error", async () => {
  await adm.getByRole("tab", { name: /Student/ }).first().click();
  const row = adm.getByRole("row").filter({ hasText: PEND });
  await row.getByRole("button", { name: "Approve" }).dblclick();
  await row.waitFor({ state: "detached" });
  const errs = adm.getByRole("alert").filter({ hasText: /\S/ });
  if (await errs.count()) throw new Error(`error after double click: ${await errs.first().textContent()}`);
  if (sql(`select status from users where email = '${PEND}'`) !== "active") throw new Error("student not active");
  const mails = sql(`select count(*) from jobs where type = 'email.send' and payload->>'to' = '${PEND}'`); // payload text is blanked after sending
  if (mails !== "2") throw new Error(`expected 2 emails (OTP + one approval), found ${mails}`);
});
await step("student search with no match shows an empty state", async () => {
  await adm.goto(`${WEB}/admin/students`);
  await adm.getByLabel("Search students").fill(`zz-no-such-${run}`);
  await adm.getByText("No students match.").waitFor();
  await shot(adm, "admin-students-empty-search");
});
for (const path of ["/admin", "/admin/students", "/admin/teachers", "/admin/comms", "/admin/content", "/admin/system"]) {
  await step(`${path} fits a 390px phone`, async () => {
    await adm.setViewportSize({ width: 390, height: 844 });
    await adm.goto(`${WEB}${path}`);
    await noOverflow(adm, path);
    await shot(adm, `admin${path.replaceAll("/", "_")}-390`);
  });
}
await step("Manage student dialog fits a 390px phone", async () => {
  await adm.goto(`${WEB}/admin/students`);
  await adm.getByRole("button", { name: "Manage" }).first().click();
  await adm.getByRole("dialog").waitFor();
  await noOverflow(adm, "manage dialog");
  await shot(adm, "admin-manage-dialog-390");
});

await browser.close();
summary();
