// End-to-end UI test for the auth flows: forgot/reset password (CSV-imported student's first login),
// forced password change on first login (new teacher), and silent access-token renewal / expiry.
// Same prerequisites as e2e.mjs. Re-runnable: every run uses fresh accounts.
//
// usage: node scripts/e2e-auth.mjs [--headed]   (13 steps)
import { ADMIN, DOMAIN, PW, SEED_STUDENT, WEB, apiCall, browser, login, mailText, newPage, otpFor, run, step, summary } from "./e2e-lib.mjs";

const ENROL = `CSB7${run}`;
const STUDENT = `${ENROL.toLowerCase()}@${DOMAIN}`;
const STUDENT_PW = `Reset-${run}-pass`;
const TEACHER = `auth${run}@tezu.ernet.in`;
const TEACHER_PW = `Teach-${run}-pass`;

// a JWT-shaped string that is already expired; the server would reject it (bad signature),
// so a request only succeeds if the client refreshed before sending it
const expiredJwt = () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "x", exp: Math.floor(Date.now() / 1000) - 60 })}.invalid-signature`;
};

const admin = await apiCall("POST", "/auth/login", { body: { email: ADMIN, password: PW } });

await step("setup: admin imports a student by CSV (no password yet)", async () => {
  const csv = `enrolment_no,name,email,programme_code,year_of_completion,mobile\n${ENROL},Auth Flow ${run},${STUDENT},CSB,2027,9876501111\n`;
  const { job_id } = await apiCall("POST", "/admin/students/import", {
    token: admin.access_token,
    file: { bytes: new TextEncoder().encode(csv), type: "text/csv", name: "s.csv" },
  });
  for (let i = 0; i < 40; i++) {
    const j = await apiCall("GET", `/admin/jobs/${job_id}`, { token: admin.access_token });
    if (j.finished_at) {
      if (j.status !== "done") throw new Error(`import job ${j.status}: ${j.last_error}`);
      return;
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  throw new Error("import job did not finish");
});

// ---------- forgot / reset ----------
const p = await newPage();
await step("imported student: forgot password -> code -> reset (UI)", async () => {
  await p.goto(`${WEB}/login`);
  await p.getByRole("button", { name: "Forgot password / first login?" }).click();
  await p.getByLabel("Email *").fill(STUDENT);
  await p.getByRole("button", { name: "Send code" }).click();
  await p.getByRole("heading", { name: "Enter the code from your email" }).waitFor();
  await p.getByLabel("6-digit code *").fill(await otpFor(STUDENT));
  await p.getByLabel(/^New password/).fill(STUDENT_PW);
  await p.getByLabel(/^Repeat new password/).fill(STUDENT_PW);
  await p.getByRole("button", { name: "Save new password" }).click();
  await p.getByText("Password saved. Sign in with your new password.").waitFor();
});
await step("reset: mismatched passwords are caught before the API", async () => {
  await p.getByRole("button", { name: "Forgot password / first login?" }).click();
  await p.getByRole("button", { name: "Send code" }).click();
  await p.getByLabel("6-digit code *").fill("000000");
  await p.getByLabel(/^New password/).fill("abcdefgh1");
  await p.getByLabel(/^Repeat new password/).fill("abcdefgh2");
  await p.getByRole("button", { name: "Save new password" }).click();
  await p.getByRole("alert").filter({ hasText: "don't match" }).waitFor();
});
await step("reset: wrong code shows the backend error", async () => {
  await p.getByLabel(/^Repeat new password/).fill("abcdefgh1");
  await p.getByRole("button", { name: "Save new password" }).click();
  await p.getByRole("alert").filter({ hasText: "Code is wrong or expired" }).waitFor();
});
await step("resend code works from the reset screen", async () => {
  await p.getByRole("button", { name: "Resend code" }).click();
  await p.getByText("A new code has been sent.").waitFor();
  await p.getByRole("button", { name: "← Back to sign in" }).click();
});
await step("imported student signs in with the new password", async () => {
  await login(p, STUDENT, STUDENT_PW);
  await p.waitForURL(/\/student$/);
  await p.getByText(`Auth Flow ${run}`).first().waitFor();
});

// ---------- forced change on first login ----------
const t = await newPage();
let otp;
await step("new teacher: one-time password forces a change before anything else", async () => {
  await apiCall("POST", "/admin/teachers", { token: admin.access_token, body: { name: `Auth Teacher ${run}`, email: TEACHER } });
  otp = (await mailText(TEACHER, /admin account/)).match(/One-time password: (\S+)/)?.[1];
  if (!otp) throw new Error("no one-time password in mail");
  await login(t, TEACHER, otp);
  await t.waitForURL(/\/admin$/);
  await t.getByRole("heading", { name: "Set a new password" }).waitFor();
  if (await t.getByRole("heading", { name: "TPO Administrative Control Center" }).count()) throw new Error("console visible before password change");
  await t.getByLabel("Current (one-time) password").fill("not-the-otp");
  await t.getByLabel(/^New password/).fill(TEACHER_PW);
  await t.getByLabel(/^Repeat new password/).fill(TEACHER_PW);
  await t.getByRole("button", { name: "Save password" }).click();
  await t.getByText("Email or password is wrong").waitFor();
  await t.getByRole("heading", { name: "Set a new password" }).waitFor();
  if (!/\/admin$/.test(t.url())) throw new Error(`wrong current password navigated away to ${t.url()}`);
  await t.getByLabel("Current (one-time) password").fill(otp);
  await t.getByLabel(/^New password/).fill(TEACHER_PW);
  await t.getByLabel(/^Repeat new password/).fill(TEACHER_PW);
  await t.getByRole("button", { name: "Save password" }).click();
  await t.getByRole("heading", { name: "TPO Administrative Control Center" }).waitFor();
});
await step("teacher's old one-time password no longer works; new one does", async () => {
  await t.getByRole("button", { name: "Log out" }).click();
  await t.waitForURL(/\/login$/);
  await login(t, TEACHER, otp);
  await t.getByRole("alert").filter({ hasText: "Email or password is wrong" }).waitFor();
  await login(t, TEACHER, TEACHER_PW);
  await t.waitForURL(/\/admin$/);
  await t.getByRole("heading", { name: "TPO Administrative Control Center" }).waitFor();
});

// ---------- token renewal ----------
await step("expired access token is renewed once, silently, before requests", async () => {
  const refreshes = [];
  const rejected = [];
  p.on("request", (r) => r.url().endsWith("/auth/refresh") && refreshes.push(r));
  p.on("response", (r) => r.status() === 401 && rejected.push(r.url()));
  await p.evaluate((tok) => {
    const s = JSON.parse(localStorage.getItem("tnp.session"));
    localStorage.setItem("tnp.session", JSON.stringify({ ...s, access_token: tok }));
  }, expiredJwt());
  await p.reload();
  await p.getByText(`Auth Flow ${run}`).first().waitFor();
  await p.waitForLoadState("networkidle");
  if (refreshes.length !== 1) throw new Error(`expected exactly 1 refresh for the burst of page requests, got ${refreshes.length}`);
  if (rejected.length) throw new Error(`requests went out with the stale token: ${rejected.join(", ")}`);
  const tok = await p.evaluate(() => JSON.parse(localStorage.getItem("tnp.session")).access_token);
  if (tok.endsWith("invalid-signature")) throw new Error("session still holds the expired token");
});
await step("refresh failing upstream (503 / connection reset) keeps the session and shows an error; recovers after", async () => {
  const expire = () =>
    p.evaluate((tok) => {
      const s = JSON.parse(localStorage.getItem("tnp.session"));
      localStorage.setItem("tnp.session", JSON.stringify({ ...s, access_token: tok }));
    }, expiredJwt());
  for (const fail of [(r) => r.fulfill({ status: 503, body: "upstream down" }), (r) => r.abort("connectionreset")]) {
    await p.route("**/api/v1/auth/refresh", fail);
    await expire();
    await p.reload();
    await p.waitForLoadState("networkidle");
    if (!/\/student$/.test(p.url())) throw new Error(`failed refresh navigated to ${p.url()}`);
    if (!(await p.evaluate(() => localStorage.getItem("tnp.session")))) throw new Error("failed refresh wiped the session");
    await p.getByRole("alert").filter({ hasText: "The server isn't responding" }).first().waitFor();
    await p.unroute("**/api/v1/auth/refresh");
  }
  await p.reload();
  await p.getByRole("heading", { name: "Welcome back, Auth" }).waitFor(); // /student lands on Home
  await p.waitForLoadState("networkidle");
  if (await p.getByRole("alert").filter({ hasText: "The server isn't responding" }).count()) throw new Error("error still shown after refresh recovered");
  const tok = await p.evaluate(() => JSON.parse(localStorage.getItem("tnp.session")).access_token);
  if (tok.endsWith("invalid-signature")) throw new Error("session still holds the expired token after recovery");
});
await step("revoked refresh token sends the user back to sign in", async () => {
  await p.evaluate((tok) => {
    const s = JSON.parse(localStorage.getItem("tnp.session"));
    localStorage.setItem("tnp.session", JSON.stringify({ ...s, access_token: tok, refresh_token: "revoked" }));
  }, expiredJwt());
  await p.reload();
  await p.waitForURL(/\/login$/);
  if (await p.evaluate(() => localStorage.getItem("tnp.session"))) throw new Error("dead session left in storage");
});
await step("logout revokes tokens server-side (old refresh token rejected)", async () => {
  const s = await apiCall("POST", "/auth/login", { body: { email: STUDENT, password: STUDENT_PW } });
  await login(p, STUDENT, STUDENT_PW);
  await p.waitForURL(/\/student$/);
  await p.getByRole("button", { name: "Log out" }).click();
  await p.waitForURL(/\/login$/);
  const r = await fetch(`${WEB}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (r.ok) throw new Error("refresh token from before logout still works");
});

await step("next user in the same tab never sees the previous user's cached data", async () => {
  const s = await newPage();
  await login(s, SEED_STUDENT, PW);
  await s.getByRole("heading", { name: "Welcome back, Priyanshu" }).waitFor(); // Home greets by first name
  await s.getByRole("button", { name: "Log out" }).click();
  await s.waitForURL(/\/login$/);
  await s.route("**/api/v1/students/me", async (r) => {
    await new Promise((w) => setTimeout(w, 2500));
    await r.continue().catch(() => {}); // unroute below may already have let this request through
  });
  // fill in place: page.goto would reload the app and drop the client cache this step is about
  await s.getByLabel("Email *").fill(STUDENT);
  await s.getByLabel("Password *").fill(STUDENT_PW);
  await s.getByRole("button", { name: "Sign in" }).click();
  await s.waitForURL(/\/student$/);
  for (let i = 0; i < 8; i++) {
    if ((await s.locator("body").innerText()).includes("Priyanshu")) throw new Error("previous student's data shown to the next user");
    await new Promise((w) => setTimeout(w, 250));
  }
  await s.unroute("**/api/v1/students/me");
  await s.getByRole("heading", { name: "Welcome back, Auth" }).waitFor();
});

await browser.close();
summary();
