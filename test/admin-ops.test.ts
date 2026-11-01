// Admin operations: settings, error log, system health, repairs. Real Postgres over HTTP.
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { hashPassword } from "../src/infrastructure/password.js";
import { ERRORS } from "../src/middleware/errors.js";
import { userMachine } from "../src/modules/auth/auth.service.js";
import { jobs } from "../src/modules/index.js";
import { graduateJob } from "../src/modules/students/students.service.js";
import { pruneErrorLogJob } from "../src/modules/system/system.service.js";
import { startWorker } from "../src/workers/runner.js";
import { api, app, as, code, freshDbWithAdmin, lastOtp, login, PDF } from "./helpers.js";

let admin: ReturnType<typeof as>;
let n = 0;
const register = (email: string) =>
  request(app).post(api("/auth/register/student")).send({ email, password: "student-pass", name: "Test Student", enrolment_no: `CSB3${String(++n).padStart(4, "0")}`, mobile: "9876543210" });

/** An approved, logged-in student made through the real signup path. */
async function activeStudent(local: string) {
  const email = `${local}@tezu.ac.in`;
  await register(email).expect(201);
  await request(app).post(api("/auth/verify-otp")).send({ email, code: await lastOtp(email) }).expect(200);
  const id = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  await admin.post(`/admin/users/${id}/decision`, { decision: "approve" }).expect(200);
  return { id, email, token: await login(email, "student-pass") };
}
async function drainWorker(times = 3) {
  // run_after comes from the host clock and claim() compares with Postgres now(); Docker's clock can lag.
  await db.job.updateMany({ where: { status: "queued" }, data: { run_after: new Date(Date.now() - 60_000) } });
  const w = startWorker(jobs, { intervalMs: 10_000 });
  for (let i = 0; i < times; i++) await w.tick();
  await w.stop();
}
const auditRows = (entity: string, entity_id: string) => db.auditLog.findMany({ where: { entity, entity_id }, orderBy: { id: "asc" } });

beforeAll(async () => {
  admin = await freshDbWithAdmin();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("approval queue", () => {
  it("shows the admin a pending student's academic record and resume, not just the enrolment number", async () => {
    const programme = (await admin.post("/admin/programmes", { department: "Civil Engineering", name: "B.Tech Civil", code: "BTCE" })).body;
    const email = "queue1@tezu.ac.in";
    await request(app)
      .post(api("/auth/register/student"))
      .send({ email, password: "student-pass", name: "Queue Student", enrolment_no: "CEB30001", mobile: "9876543210", programme_id: programme.id })
      .expect(201);
    await request(app).post(api("/auth/verify-otp")).send({ email, code: await lastOtp(email) }).expect(200);
    await db.student.update({ where: { enrolment_no: "CEB30001" }, data: { cgpa: 8.25, department: "Civil", resume_file_id: "resume-1", photo_file_id: "photo-1" } });

    const row = (await admin.get("/admin/pending")).body.students.find((s: { email: string }) => s.email === email);
    expect(row.student).toEqual({
      enrolment_no: "CEB30001", department: "Civil", cgpa: 8.25, programme_id: programme.id,
      programme: { name: "B.Tech Civil", department: "Civil Engineering" }, resume_file_id: "resume-1", photo_file_id: "photo-1",
    });
  });
});

describe("settings", () => {
  it("lists every setting with value, default and plain-English help", async () => {
    const r = await admin.get("/admin/settings").expect(200);
    expect(r.body.map((s: { key: string }) => s.key)).toEqual(["email_daily_cap", "email_per_minute_cap", "alumni_cutoff", "otp_expiry_minutes", "student_email_domain", "upload_max_mb"]);
    const domain = r.body.find((s: { key: string }) => s.key === "student_email_domain");
    expect(domain).toMatchObject({ value: "tezu.ac.in", default: "tezu.ac.in", is_overridden: false, unit: "domain" });
    expect(domain.help.length).toBeGreaterThan(20);
  });

  it("a domain change is enforced at registration, audited, and reset restores the default", async () => {
    const put = await admin.put("/admin/settings/student_email_domain", { value: "example.edu" });
    expect(put.body).toMatchObject({ value: "example.edu", is_overridden: true });

    const refused = await register("new1@tezu.ac.in");
    expect(code(refused)).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect(refused.body.error.details).toEqual({ domain: "example.edu" });
    await register("new1@example.edu").expect(201);

    await admin.put("/admin/settings/student_email_domain", { value: "example.edu" }).expect(200); // same value: no-op
    const audits = await auditRows("setting", "student_email_domain");
    expect(audits.map((a) => [a.action, a.metadata])).toEqual([["setting.updated", { from: "tezu.ac.in", to: "example.edu" }]]);

    expect((await admin.delete("/admin/settings/student_email_domain")).body).toMatchObject({ value: "tezu.ac.in", is_overridden: false });
    await register("new2@tezu.ac.in").expect(201);
    expect((await auditRows("setting", "student_email_domain")).map((a) => a.action)).toEqual(["setting.updated", "setting.reset"]);
  });

  it("a bad value is VALIDATION_FAILED with the reason, and nothing changes", async () => {
    const r = await admin.put("/admin/settings/otp_expiry_minutes", { value: 3 });
    expect(code(r)).toBe("VALIDATION_FAILED");
    expect(r.body.error.details.message).toMatch(/>=5/);
    expect(code(await admin.put("/admin/settings/upload_max_mb", { value: { resume: 50, photo: 2, jd: 10, brochure: 20 } }))).toBe("VALIDATION_FAILED"); // above hard cap
    expect(code(await admin.put("/admin/settings/no_such_key", { value: 1 }))).toBe("VALIDATION_FAILED");
    expect(await db.setting.count()).toBe(0);
  });

  it("upload size, OTP lifetime, email cap and alumni date are read from settings", async () => {
    const s = await activeStudent("consumer");
    const student = as(s.token);

    await admin.put("/admin/settings/upload_max_mb", { value: { resume: 0.00001, photo: 2, jd: 10, brochure: 20 } }).expect(200); // ~10 bytes
    expect(code(await student.upload("/students/me/resume", PDF, "cv.pdf"))).toBe("FILE_TOO_LARGE");
    await admin.delete("/admin/settings/upload_max_mb").expect(200);
    await student.upload("/students/me/resume", PDF, "cv.pdf").expect(201);

    await admin.put("/admin/settings/otp_expiry_minutes", { value: 30 }).expect(200);
    await register("otp30@tezu.ac.in").expect(201);
    const otp = await db.otpCode.findFirstOrThrow({ where: { user_id: (await db.user.findUniqueOrThrow({ where: { email: "otp30@tezu.ac.in" } })).id } });
    expect(Math.round((otp.expires_at.getTime() - otp.created_at.getTime()) / 60_000)).toBe(30);

    await drainWorker(); // send whatever is queued so the cap test starts empty
    await admin.put("/admin/settings/email_daily_cap", { value: 0 }).expect(200);
    await request(app).post(api("/auth/forgot-password")).send({ email: s.email }).expect(200);
    await drainWorker();
    const held = await db.job.findFirstOrThrow({ where: { type: "email.send", payload: { path: ["to"], equals: s.email } }, orderBy: { id: "desc" } });
    expect(held.status).toBe("queued");
    await admin.delete("/admin/settings/email_daily_cap").expect(200);
    await drainWorker();
    expect((await db.job.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("done");

    const year = new Date().getFullYear();
    await db.student.update({ where: { user_id: s.id }, data: { year_of_completion: year } });
    await admin.put("/admin/settings/alumni_cutoff", { value: "12-31" }).expect(200);
    if (new Date().toISOString().slice(5, 10) !== "12-31") {
      await graduateJob.run({}, { id: "t", attempt: 1 });
      expect((await db.user.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("active");
    }
    await admin.put("/admin/settings/alumni_cutoff", { value: "01-01" }).expect(200);
    await graduateJob.run({}, { id: "t", attempt: 1 });
    expect((await db.user.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("alumni");
    await admin.delete("/admin/settings/alumni_cutoff").expect(200);
  });
});

describe("error log", () => {
  it("a 500 is stored with request id, user and summary, and listed with its hint; the response is unchanged", async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("boom"));
    const r = await admin.get("/admin/reports/placements").set("x-request-id", "req-500-test");
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { code: "INTERNAL", message: "Internal error", details: {} } });

    const row = await db.errorLog.findFirstOrThrow({ where: { request_id: "req-500-test" } });
    const adminId = (await db.user.findUniqueOrThrow({ where: { email: "tpo@tezu.ac.in" } })).id;
    expect(row).toMatchObject({
      method: "GET", route: "/api/v1/admin/reports/placements", user_id: adminId, status: 500, code: "INTERNAL",
      summary: "Unexpected error while handling GET /api/v1/admin/reports/placements",
    });
    expect(row.detail).toMatch(/^Error: boom/);

    const list = await admin.get("/admin/errors?code=INTERNAL&q=placements").expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ request_id: "req-500-test", hint: ERRORS.INTERNAL.hint });
    expect((await admin.get("/admin/errors?q=no-such-route").expect(200)).body.data).toEqual([]);
  });

  it("4xx contract errors are not logged", async () => {
    const before = await db.errorLog.count();
    expect(code(await admin.get("/nope"))).toBe("NOT_FOUND");
    expect(code(await admin.put("/admin/settings/otp_expiry_minutes", { value: 1 }))).toBe("VALIDATION_FAILED");
    expect(code(await request(app).get(api("/admin/errors")))).toBe("UNAUTHENTICATED");
    expect(await db.errorLog.count()).toBe(before);
  });

  it("a database outage gets a plain summary, and a failed error_log write still returns the original 500", async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5434"), { code: "ECONNREFUSED" }));
    await admin.get("/admin/reports/placements").set("x-request-id", "req-db-down").expect(500);
    expect((await db.errorLog.findFirstOrThrow({ where: { request_id: "req-db-down" } })).summary).toBe("The database could not be reached");

    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(db.errorLog, "create").mockRejectedValueOnce(new Error("error_log unavailable"));
    const r = await admin.get("/admin/reports/placements").set("x-request-id", "req-no-log");
    expect(r.status).toBe(500);
    expect(code(r)).toBe("INTERNAL");
    expect(await db.errorLog.count({ where: { request_id: "req-no-log" } })).toBe(0);
  });

  it("a job that exhausts its attempts is logged as JOB_FAILED", async () => {
    const job = await db.job.create({ data: { type: "test.unknown", payload: {}, attempts: 4 } });
    await drainWorker(10);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("failed");
    const row = await db.errorLog.findFirstOrThrow({ where: { request_id: job.id } });
    expect(row).toMatchObject({ method: "JOB", route: "job:test.unknown", status: 500, code: "JOB_FAILED", summary: "Background task 'test.unknown' failed after 5 attempts" });
    expect((await admin.get("/admin/errors?code=JOB_FAILED")).body.data[0].hint).toBe(ERRORS.JOB_FAILED.hint);
  });

  it("the daily prune deletes rows older than 90 days only", async () => {
    const old = await db.errorLog.create({ data: { request_id: "old", method: "GET", route: "/x", status: 500, code: "INTERNAL", summary: "s", detail: "d", created_at: new Date(Date.now() - 91 * 86_400_000) } });
    const recent = await db.errorLog.create({ data: { request_id: "recent", method: "GET", route: "/x", status: 500, code: "INTERNAL", summary: "s", detail: "d", created_at: new Date(Date.now() - 89 * 86_400_000) } });
    await pruneErrorLogJob.run({}, { id: "t", attempt: 1 });
    expect(await db.errorLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.errorLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});

describe("error hints", () => {
  it("every error code has a hint, listed by /admin/error-codes, and JOB_FAILED never reaches the HTTP contract", async () => {
    for (const [c, e] of Object.entries(ERRORS)) expect(e.hint.trim(), c).not.toBe("");
    const r = await admin.get("/admin/error-codes").expect(200);
    expect(r.body.map((e: { code: string }) => e.code)).toEqual(Object.keys(ERRORS));
    expect(r.body.find((e: { code: string }) => e.code === "JOB_FAILED")).toMatchObject({ status: 500, hint: ERRORS.JOB_FAILED.hint });
    const spec = (await request(app).get(api("/openapi.json"))).body;
    expect(spec.components.schemas.Error.properties.error.properties.code.enum).not.toContain("JOB_FAILED");
  });
});

describe("system health", () => {
  it("reports every section and derives status; the backup section follows backup_runs", async () => {
    const before = (await admin.get("/admin/system-health").expect(200)).body;
    for (const k of ["database", "worker", "jobs", "email", "backup", "storage", "errors_24h", "status", "problems"]) expect(before).toHaveProperty(k);
    expect(before.database.ok).toBe(true);
    expect(before.storage.total_bytes).toBeGreaterThan(0);
    expect(before.backup).toEqual({ last_ok_at: null, last_status: "never", last_detail: null });
    expect(before.status).toBe("problem");
    expect(before.problems).toContain("No backup in the last 48 hours");
    expect(before.errors_24h).toBeGreaterThan(0); // from the error log tests

    await db.backupRun.create({ data: { started_at: new Date(Date.now() - 60_000), ok: true, detail: "backup ok" } });
    const after = (await admin.get("/admin/system-health")).body;
    expect(after.backup).toMatchObject({ last_status: "ok", last_detail: "backup ok" });
    expect(after.problems).not.toContain("No backup in the last 48 hours");

    await db.backupRun.create({ data: { started_at: new Date(), ok: false, detail: "pg_dump: connection refused" } });
    expect((await admin.get("/admin/system-health")).body.backup).toMatchObject({ last_status: "failed", last_detail: "pg_dump: connection refused", last_ok_at: after.backup.last_ok_at });
  });
});

describe("repairs", () => {
  it("retry-failed-emails requeues failed mail once and is audited", async () => {
    const failed = await db.job.create({ data: { type: "email.send", payload: { to: "x@tezu.ac.in", subject: "s", text: "t" }, status: "failed", attempts: 6, last_error: "SMTP down" } });
    expect((await admin.post("/admin/repairs/retry-failed-emails", {})).body).toEqual({ requeued: 1 });
    expect(await db.job.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({ status: "queued", attempts: 0 });
    expect((await admin.post("/admin/repairs/retry-failed-emails", { job_ids: [failed.id] })).body).toEqual({ requeued: 0 });
    expect(await auditRows("system", "retry-failed-emails")).toHaveLength(1);
  });

  it("resend-otp only works for accounts waiting to verify, and keeps the 60 s limit", async () => {
    await register("resend@tezu.ac.in").expect(201);
    const u = await db.user.findUniqueOrThrow({ where: { email: "resend@tezu.ac.in" } });
    expect(code(await admin.post(`/admin/users/${u.id}/resend-otp`))).toBe("OTP_RESEND_TOO_SOON");
    await db.otpCode.updateMany({ where: { user_id: u.id }, data: { created_at: new Date(Date.now() - 120_000) } });
    const first = await lastOtp(u.email);
    await admin.post(`/admin/users/${u.id}/resend-otp`).expect(200);
    expect(await lastOtp(u.email)).not.toBe(first);
    expect((await auditRows("user", u.id)).map((a) => a.action)).toContain("user.otp_resent_by_admin");

    const active = (await db.user.findUniqueOrThrow({ where: { email: "tpo@tezu.ac.in" } })).id;
    expect(code(await admin.post(`/admin/users/${active}/resend-otp`))).toBe("INVALID_TRANSITION");
  });

  it("reset-password emails a one-time password, revokes sessions and forces a change", async () => {
    const s = await activeStudent("reset");
    const r = await admin.post(`/admin/users/${s.id}/reset-password`);
    expect(r.body).toEqual({ emailed: true });
    expect((await as(s.token).get("/students/me")).status).toBe(401);
    const mail = await db.job.findFirstOrThrow({ where: { type: "email.send", payload: { path: ["to"], equals: s.email } }, orderBy: { id: "desc" } });
    expect(mail.priority).toBe(0);
    const pw = /One-time password: (\S+)/.exec((mail.payload as { text: string }).text)![1]!;
    expect(code(await request(app).post(api("/auth/login")).send({ email: s.email, password: "student-pass" }))).toBe("INVALID_CREDENTIALS");
    const t = as(await login(s.email, pw));
    expect(code(await t.get("/students/me"))).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await auditRows("user", s.id)).map((a) => a.action)).toContain("user.password_reset_by_admin");
  });

  it("clear-rate-limit unlocks a locked account", async () => {
    const email = "locked@tezu.ac.in";
    const id = (await inTx(async (tx) => userMachine.create(tx, { role: "student", email, name: "Locked", password_hash: await hashPassword("right-pass"), student: { create: { enrolment_no: "CSB39999", academic_standing: "good" } } }, SYSTEM, { state: "active" }))).id;
    const attempt = (password: string) => request(app).post(api("/auth/login")).send({ email, password });
    for (let i = 0; i < 10; i++) expect(code(await attempt("wrong-pass"))).toBe("INVALID_CREDENTIALS");
    expect(code(await attempt("right-pass"))).toBe("RATE_LIMITED");
    await admin.post(`/admin/users/${id}/clear-rate-limit`).expect(200);
    expect((await attempt("right-pass")).status).toBe(200);
    expect((await auditRows("user", id)).map((a) => a.action)).toContain("user.rate_limit_cleared");
  });
});
