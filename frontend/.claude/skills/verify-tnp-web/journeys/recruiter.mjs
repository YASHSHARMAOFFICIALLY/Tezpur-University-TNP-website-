// Recruiter edge cases: a new organisation's empty portal, a past deadline, double submit in the Posting Studio,
// applicants before release, cross-role guard, and phone width.
// usage: webctl journey .claude/skills/verify-tnp-web/journeys/recruiter.mjs [--headed]
import { ADMIN, PW, RECRUITER, SEED_STUDENT, WEB, apiCall, browser, login, newPage, otpFor, run, step, summary, ymd } from "../../../../scripts/e2e-lib.mjs";
import { approvedPosting, noOverflow, shot, sql, tokenFor, userId } from "./lib.mjs";

const NEW_REC = `hr.edge${run}@edge-corp.test`;
const REC_PW = `Edge-${run}-pass`;
const A = await tokenFor(ADMIN);
await apiCall("POST", "/auth/register/recruiter", {
  body: {
    company: { name: `Edge Corp ${run}`, website: "https://edge-corp.test", category: "private", sector: "IT", postal_address: "Pune" },
    name: "Edge HR",
    email: NEW_REC,
    password: REC_PW,
    contact: { designation: "HR", phone: "9876500000" },
  },
});
await apiCall("POST", "/auth/verify-otp", { body: { email: NEW_REC, code: await otpFor(NEW_REC) } });
await apiCall("POST", `/admin/users/${userId(NEW_REC)}/decision`, { token: A, body: { decision: "approve" } });

const fresh = await newPage();
await step("new organisation sees empty states, not errors", async () => {
  await login(fresh, NEW_REC, REC_PW);
  await fresh.waitForURL(/\/recruiter$/);
  await fresh.getByText("No job postings yet").waitFor();
  await fresh.waitForLoadState("networkidle");
  const errs = fresh.getByRole("alert").filter({ hasText: /\S/ }); // Next's route announcer is an empty role=alert on every page
  if (await errs.count()) throw new Error(`error on empty portal: ${await errs.first().textContent()}`);
  await shot(fresh, "recruiter-new-empty");
});
await step("new organisation portal fits a 390px phone", async () => {
  await fresh.setViewportSize({ width: 390, height: 844 });
  await fresh.reload();
  await noOverflow(fresh, "/recruiter (new)");
  await shot(fresh, "recruiter-new-390");
});
await step("recruiter opening /student is sent back to /recruiter", async () => {
  await fresh.goto(`${WEB}/student`);
  await fresh.waitForURL(/\/recruiter$/);
});

const rec = await newPage();
await login(rec, RECRUITER, PW);
await rec.waitForURL(/\/recruiter$/);
const studio = () => rec.getByRole("dialog", { name: "Job & Internship Posting Studio" });
async function fillStudio(title, deadline) {
  await rec.getByRole("button", { name: "Create New Job Opening" }).click();
  const d = studio();
  await d.getByLabel("ROLE PROFILE / JOB TITLE *").fill(title);
  await d.getByLabel("TENTATIVE WORK LOCATION *").fill("Pune");
  await d.getByLabel("JOB DESCRIPTION *").fill("Edge posting.");
  await d.getByLabel("B.Tech Computer Science & Engg").check();
  await d.getByLabel("Passing-out Batch *").selectOption("2026");
  await d.getByLabel("Apply Deadline *").fill(deadline);
  return d;
}
const countTitled = (title) => sql(`select count(*) from opportunities where title = '${title}'`);

await step("a past apply deadline is refused before the posting reaches the T&P cell", async () => {
  const T = `Edge Past ${run}`;
  const d = await fillStudio(T, ymd(new Date(Date.now() - 864e5)));
  await d.getByRole("button", { name: "Publish Opening to Students" }).click();
  await d.getByRole("alert").or(d.locator("input:invalid")).first().waitFor();
  await shot(rec, "recruiter-past-deadline");
  const submitted = sql(`select count(*) from opportunities where title = '${T}' and status <> 'draft'`);
  if (submitted !== "0") throw new Error(`posting with a past deadline was submitted (${submitted})`);
  await d.getByRole("button", { name: "Close" }).click();
});
await step("double-clicking Publish creates one posting", async () => {
  const T = `Edge Dbl ${run}`;
  const d = await fillStudio(T, ymd(new Date(Date.now() + 5 * 864e5)));
  await d.getByRole("button", { name: "Publish Opening to Students" }).dblclick();
  await d.waitFor({ state: "detached" });
  const n = countTitled(T);
  if (n !== "1") throw new Error(`expected 1 posting, found ${n}`);
});
await step("Posting Studio fits a 390px phone", async () => {
  await rec.setViewportSize({ width: 390, height: 844 });
  await rec.reload();
  await rec.getByRole("button", { name: "Create New Job Opening" }).click();
  await studio().waitFor();
  await noOverflow(rec, "posting studio");
  await shot(rec, "recruiter-studio-390");
  await studio().getByRole("button", { name: "Close" }).click();
  await noOverflow(rec, "/recruiter (seed)");
  await shot(rec, "recruiter-seed-390");
  await rec.setViewportSize({ width: 1280, height: 900 });
});

const JOB = `Edge Unreleased ${run}`;
const id = await approvedPosting(JOB);
await apiCall("POST", `/opportunities/${id}/apply`, { token: await tokenFor(SEED_STUDENT) });
await step("before the T&P cell releases, the recruiter sees no applicants and cannot select any", async () => {
  await rec.reload();
  await rec.getByLabel("Choose drive").selectOption({ label: `${JOB} (Live to students)` });
  await rec.getByText("No applicants released yet").waitFor();
  if (await rec.getByLabel("Select Priyanshu Sharma").count()) throw new Error("unreleased applicant is selectable");
  await shot(rec, "recruiter-before-release");
});
await step("the API also refuses to shortlist an unreleased application", async () => {
  const appId = sql(`select id from applications where opportunity_id = '${id}'`);
  const R = await tokenFor(RECRUITER);
  const ok = await apiCall("POST", "/company/applications/shortlist", { token: R, body: { application_ids: [appId] } }).then(() => true, (e) => (console.log(`      refused: ${e.message}`), false));
  const status = sql(`select status from applications where id = '${appId}'`);
  if (ok || status !== "applied") throw new Error(`shortlist accepted=${ok}, status now ${status}`);
});

await browser.close();
summary();
