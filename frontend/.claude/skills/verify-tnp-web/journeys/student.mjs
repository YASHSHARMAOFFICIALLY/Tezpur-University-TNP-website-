// Student edge cases: registration/OTP failures and recovery, empty and ineligible states, double submit,
// a deadline passing while the page is open, probation, and phone width.
// usage: webctl journey .claude/skills/verify-tnp-web/journeys/student.mjs [--headed]
import { ADMIN, DOMAIN, PW, SEED_STUDENT, WEB, apiCall, browser, login, newPage, otpFor, run, step, summary } from "../../../../scripts/e2e-lib.mjs";
import { approvedPosting, noOverflow, shot, sql, studentId, tokenFor, userId } from "./lib.mjs";

const ENROL = `CSB8${run}`;
const EMAIL = `${ENROL.toLowerCase()}@${DOMAIN}`;
const NAME = `Edge Student ${run}`;
const STU_PW = `Edge-${run}-pass`;
const alert = (page, text) => page.getByRole("alert").filter({ hasText: text }).waitFor();

async function fillRegistration(page, { email = EMAIL, enrol = ENROL } = {}) {
  await page.goto(`${WEB}/#register`);
  await page.getByRole("tab", { name: "Student / Candidate" }).click();
  await page.getByLabel("Full Name *").fill(NAME);
  await page.getByLabel("Enrolment Number *").fill(enrol);
  await page.getByLabel("University Email *").fill(email);
  await page.getByLabel("Mobile *").fill("9876505678");
  await page.getByLabel("Programme").selectOption({ label: "B.Tech Computer Science & Engg" });
  await page.getByLabel("Create Password *").fill(STU_PW);
  await page.getByRole("button", { name: /Register & Send Code/ }).click();
}

const g = await newPage();
await step("registering with a non-university email is refused with a clear message", async () => {
  await fillRegistration(g, { email: `edge${run}@gmail.com` });
  await alert(g, "Students must register with their university email");
  await shot(g, "student-reg-wrong-domain");
});
await step("wrong OTP shows 'Code is wrong or expired' and keeps the code step", async () => {
  await fillRegistration(g);
  await g.getByLabel("Verification Code *").fill("000000");
  await g.getByRole("button", { name: /Verify & Submit/ }).click();
  await alert(g, "Code is wrong or expired");
  await g.getByLabel("Verification Code *").waitFor();
  await shot(g, "student-reg-wrong-otp");
});
await step("resend within a minute is refused with a wait message", async () => {
  await g.getByRole("button", { name: "Resend code" }).click();
  await alert(g, "Wait before requesting another code");
});
await step("refresh mid-flow, then registering again says the email is taken", async () => {
  await g.reload();
  await fillRegistration(g);
  await alert(g, "Email already registered");
});
await step("same enrolment number with another email is refused", async () => {
  await fillRegistration(g, { email: `x${ENROL.toLowerCase()}@${DOMAIN}` });
  await alert(g, "Enrolment number already registered");
});
await step("sign-in of the unverified account switches to code entry", async () => {
  await login(g, EMAIL, STU_PW);
  await alert(g, "Your email isn't verified yet");
  await g.getByLabel("6-digit code *").waitFor();
  await shot(g, "student-login-verify-mode");
});
await step("expired OTP is refused", async () => {
  const code = await otpFor(EMAIL);
  sql(`update otp_codes set expires_at = now() - interval '1 minute' where user_id = '${userId(EMAIL)}'`);
  await g.getByLabel("6-digit code *").fill(code);
  await g.getByRole("button", { name: "Verify email" }).click();
  await alert(g, "Code is wrong or expired");
});
await step("resend after the cooldown mails a fresh code that verifies the email", async () => {
  sql(`update otp_codes set created_at = now() - interval '2 minutes' where user_id = '${userId(EMAIL)}'`);
  const before = await otpFor(EMAIL);
  await g.getByRole("button", { name: "Resend code" }).click();
  await g.getByText("code is on its way").or(g.getByText("A new code")).first().waitFor();
  let code = before;
  for (let i = 0; i < 20 && code === before; i++) (code = await otpFor(EMAIL)), await g.waitForTimeout(500);
  if (code === before) throw new Error("no new code arrived after resend");
  await g.getByLabel("6-digit code *").fill(code);
  await g.getByRole("button", { name: "Verify email" }).click();
  await g.getByText("Email verified").waitFor();
});
await step("verified but unapproved student sees the pending message", async () => {
  await login(g, EMAIL, STU_PW);
  await alert(g, "Account awaiting admin approval");
});
await step("five wrong codes lock the code", async () => {
  const LOCK = `csb7${run}@${DOMAIN}`;
  await fillRegistration(g, { email: LOCK, enrol: `CSB7${run}` });
  for (let i = 0; i < 5; i++) {
    await g.getByLabel("Verification Code *").fill("000000");
    await g.getByRole("button", { name: /Verify & Submit/ }).click();
    await alert(g, "Code is wrong or expired");
  }
  await g.getByLabel("Verification Code *").fill(await otpFor(LOCK));
  await g.getByRole("button", { name: /Verify & Submit/ }).click();
  await alert(g, "Too many wrong attempts");
  await shot(g, "student-reg-otp-locked");
});

const A = await tokenFor(ADMIN);
await apiCall("POST", `/admin/users/${userId(EMAIL)}/decision`, { token: A, body: { decision: "approve" } });
const fresh = await newPage();
await step("approved new student: empty states render, postings show why they are ineligible", async () => {
  await login(fresh, EMAIL, STU_PW);
  await fresh.waitForURL(/\/student$/);
  await fresh.getByText(/Ineligible:/).first().waitFor();
  if (await fresh.getByRole("button", { name: /Apply Now/ }).count()) throw new Error("ineligible student is offered Apply");
  await fresh.getByText("No active drive yet").waitFor();
  await shot(fresh, "student-new-empty");
});
await step("new student page and profile dialog fit a 390px phone", async () => {
  await fresh.setViewportSize({ width: 390, height: 844 });
  await fresh.reload();
  await noOverflow(fresh, "/student (new)");
  await shot(fresh, "student-new-390");
  await fresh.getByRole("button", { name: "Edit profile" }).click();
  await fresh.getByRole("dialog").waitFor();
  await noOverflow(fresh, "edit profile dialog");
  await shot(fresh, "student-profile-dialog-390");
});

const JOB_A = `Edge Double ${run}`;
const JOB_B = `Edge Deadline ${run}`;
const JOB_C = `Edge Probation ${run}`;
const [idA, idB, idC] = [await approvedPosting(JOB_A), await approvedPosting(JOB_B), await approvedPosting(JOB_C)];
const card = (p, title) => p.locator("article").filter({ hasText: `Role: ${title}` });
const stu = await newPage();
await login(stu, SEED_STUDENT, PW);
await stu.waitForURL(/\/student$/);

await step("double-clicking Apply creates exactly one application", async () => {
  await card(stu, JOB_A).getByRole("button", { name: /Apply Now/ }).dblclick();
  await card(stu, JOB_A).getByText(/^Applied \d/).waitFor();
  const n = sql(`select count(*) from applications a where a.student_id = '${studentId(SEED_STUDENT)}' and a.opportunity_id = '${idA}'`);
  if (n !== "1") throw new Error(`expected 1 application, found ${n}`);
  if (await card(stu, JOB_A).getByText("Already applied").count()) throw new Error("double click surfaced 'Already applied'");
});
await step("deadline passing while the page is open: Apply explains the drive closed", async () => {
  sql(`update opportunities set apply_deadline = now() - interval '1 minute' where id = '${idB}'`);
  await card(stu, JOB_B).getByRole("button", { name: /Apply Now/ }).click();
  await card(stu, JOB_B).getByText("Opportunity is not accepting applications").waitFor();
  await shot(stu, "student-deadline-passed");
  await stu.reload();
  await stu.getByRole("heading", { name: "Cognizant Technology Solutions" }).first().waitFor();
  if (await card(stu, JOB_B).getByRole("button", { name: /Apply Now/ }).count()) throw new Error("closed drive still offers Apply after reload");
});
await step("student on probation is told why they cannot apply", async () => {
  const sid = studentId(SEED_STUDENT);
  await apiCall("POST", `/admin/students/${sid}/probation`, { token: A, body: { on: true, reason: "Edge journey" } });
  try {
    await card(stu, JOB_C).getByRole("button", { name: /Apply Now/ }).click();
    await card(stu, JOB_C).getByText("Students on academic probation cannot apply").waitFor();
    await shot(stu, "student-probation");
  } finally {
    await apiCall("POST", `/admin/students/${sid}/probation`, { token: A, body: { on: false, reason: "Edge journey done" } });
  }
});
await step("seed student page fits a 390px phone", async () => {
  await stu.setViewportSize({ width: 390, height: 844 });
  await stu.reload();
  await noOverflow(stu, "/student (seed)");
  await shot(stu, "student-seed-390");
});

await browser.close();
summary();
