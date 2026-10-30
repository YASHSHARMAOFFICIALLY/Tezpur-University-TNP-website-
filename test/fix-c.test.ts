// Group C fixes: OTP lifecycle, email quota reserve, worker heartbeat, unverified sign-ups, job payload hygiene.
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { mail } from "../src/infrastructure/mailer.js";
import { hashPassword } from "../src/infrastructure/password.js";
import { defineJob } from "../src/infrastructure/queue.js";
import { userMachine } from "../src/modules/auth/auth.service.js";
import { jobs } from "../src/modules/index.js";
import { pruneDoneJobsJob, pruneUnverifiedJob } from "../src/modules/system/system.service.js";
import { startWorker } from "../src/workers/runner.js";
import { api, app, as, code, freshDbWithAdmin, lastOtp, login } from "./helpers.js";

let admin: ReturnType<typeof as>;
let n = 0;
const post = (p: string, body: object) => request(app).post(api(p)).send(body);
const HOUR = 3_600_000;

async function activeStudent(local: string) {
  const email = `${local}@tezu.ac.in`;
  const id = (await inTx(async (tx) =>
    userMachine.create(tx, { role: "student", email, name: local, password_hash: await hashPassword("student-pass"), email_verified_at: new Date(), student: { create: { enrolment_no: `CSC1${String(++n).padStart(4, "0")}`, academic_standing: "good" } } }, SYSTEM, { state: "active" }),
  )).id;
  return { id, email };
}
const allowResend = (userId: string) => db.otpCode.updateMany({ where: { user_id: userId }, data: { created_at: new Date(Date.now() - 120_000) } });
async function resetCode(u: { id: string; email: string }) {
  await allowResend(u.id);
  await post("/auth/forgot-password", { email: u.email }).expect(200);
  return lastOtp(u.email);
}
const reset = (email: string, c: string, new_password = "new-pass-123") => post("/auth/reset-password", { email, code: c, new_password });
async function drain(times: number) {
  await db.job.updateMany({ where: { status: "queued" }, data: { run_after: new Date(Date.now() - 60_000) } });
  const w = startWorker(jobs, { intervalMs: 10_000 });
  for (let i = 0; i < times; i++) await w.tick();
  await w.stop();
}

beforeEach(async () => {
  admin = await freshDbWithAdmin();
});

describe("C1 superseded OTP codes", () => {
  it("an older reset code does not come back after the newer one is used", async () => {
    const u = await activeStudent("revive");
    const a = await resetCode(u);
    const b = await resetCode(u);
    await reset(u.email, b).expect(200);
    expect(code(await reset(u.email, a, "attacker-pass-1")), "code A must be dead once B was issued").toBe("OTP_INVALID");
  });

  it("changing the password, by any path, kills outstanding reset codes", async () => {
    const u = await activeStudent("change");
    const c1 = await resetCode(u);
    const token = await login(u.email, "student-pass");
    await as(token).post("/auth/change-password", { current_password: "student-pass", new_password: "changed-pass-1" }).expect(200);
    expect(code(await reset(u.email, c1)), "reset code after change-password").toBe("OTP_INVALID");

    const c2 = await resetCode(u);
    await admin.post(`/admin/users/${u.id}/reset-password`).expect(200);
    expect(code(await reset(u.email, c2)), "reset code after admin reset").toBe("OTP_INVALID");
  });
});

describe("C2 email quota reserve", () => {
  it("bulk mail cannot use the last part of the daily cap, so a login code still goes out", async () => {
    await admin.put("/admin/settings/email_daily_cap", { value: 10 }).expect(200);
    await inTx(async (tx) => {
      for (let i = 0; i < 12; i++) await mail(tx, { to: `bulk${i}@tezu.ac.in`, subject: "notice", text: "t" }, { priority: 9 });
    });
    await drain(12);
    const bulkSent = await db.job.count({ where: { type: "email.send", priority: 9, status: "done" } });
    expect(bulkSent, "bulk stops below the cap").toBe(9);

    const u = await activeStudent("quota");
    await post("/auth/forgot-password", { email: u.email }).expect(200);
    await drain(1);
    const otpMail = await db.job.findFirstOrThrow({ where: { type: "email.send", priority: 0 } });
    expect(otpMail.status, "priority-0 mail uses the reserve").toBe("done");
  });
});

describe("C3 worker heartbeat during a long job", () => {
  it("health says busy, not dead, while a job runs longer than the liveness window", async () => {
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const slow = defineJob({ type: "test.slow", payload: z.object({}), run: () => done });
    await db.job.create({ data: { type: slow.type, payload: {}, run_after: new Date(Date.now() - 60_000) } });
    const w = startWorker([slow], { intervalMs: 50 });
    try {
      for (let i = 0; i < 100 && (await db.job.count({ where: { status: "running" } })) === 0; i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 400));
      const h = (await admin.get("/admin/system-health").expect(200)).body;
      expect(h.worker, "worker alive and busy").toMatchObject({ alive: true, busy_with: "test.slow" });
      expect(h.problems.join(" ")).not.toMatch(/not running/);
    } finally {
      finish();
      await w.stop();
    }
  });
});

describe("C4 unverified registrations", () => {
  const registerStudent = (local: string, enrolment_no: string) =>
    post("/auth/register/student", { email: `${local}@tezu.ac.in`, password: "student-pass", name: local, enrolment_no, mobile: "9876543210" });
  const age = (email: string, hours: number) => db.user.update({ where: { email }, data: { created_at: new Date(Date.now() - hours * HOUR) } });

  it("the daily job deletes sign-ups unverified for 48 h, frees the email and enrolment, and keeps the audit history", async () => {
    await registerStudent("stale", "CSC20001").expect(201);
    await registerStudent("fresh", "CSC20002").expect(201);
    await post("/auth/register/recruiter", { email: "hr@stale.example", password: "recruiter-pass", name: "HR", company: { name: "Stale Co" }, contact: {} }).expect(201);
    const stale = await db.user.findUniqueOrThrow({ where: { email: "stale@tezu.ac.in" } });
    await age(stale.email, 49);
    await age("fresh@tezu.ac.in", 47);
    await age("hr@stale.example", 49);

    await pruneUnverifiedJob.run({}, { id: "t", attempt: 1 });

    expect(await db.user.findUnique({ where: { email: stale.email } }), "stale user deleted").toBeNull();
    expect(await db.otpCode.count({ where: { user_id: stale.id } }), "its otp codes deleted").toBe(0);
    expect(await db.user.findUnique({ where: { email: "hr@stale.example" } }), "stale recruiter deleted").toBeNull();
    expect(await db.company.count({ where: { name: "Stale Co" } }), "its company deleted").toBe(0);
    expect(await db.user.findUnique({ where: { email: "fresh@tezu.ac.in" } }), "47 h old sign-up kept").not.toBeNull();
    expect((await db.auditLog.findMany({ where: { entity: "user", entity_id: stale.id } })).map((a) => a.action)).toContain("user.unverified_deleted");
    await registerStudent("stale", "CSC20001").expect(201);
  });

  it("an admin can delete one unverified account, and only an unverified one", async () => {
    await registerStudent("typo", "CSC20003").expect(201);
    const u = await db.user.findUniqueOrThrow({ where: { email: "typo@tezu.ac.in" } });
    const active = await activeStudent("keeper");
    expect(code(await admin.post(`/admin/users/${active.id}/delete-unverified`)), "active account refused").toBe("INVALID_TRANSITION");
    await admin.post(`/admin/users/${u.id}/delete-unverified`).expect(200);
    expect(await db.user.findUnique({ where: { id: u.id } }), "deleted").toBeNull();
    expect(await db.student.count({ where: { enrolment_no: "CSC20003" } })).toBe(0);
    expect((await db.auditLog.findMany({ where: { entity: "user", entity_id: u.id } })).map((a) => a.action)).toContain("user.unverified_deleted");
    expect(code(await admin.post(`/admin/users/${u.id}/delete-unverified`)), "second call").toBe("NOT_FOUND");
  });
});

describe("C5 clear-rate-limit unlocks a locked code", () => {
  it("the correct code works again after the admin clears the limit", async () => {
    const u = await activeStudent("otplock");
    const c = await resetCode(u);
    await db.otpCode.updateMany({ where: { user_id: u.id }, data: { attempts: 5 } });
    expect(code(await reset(u.email, c))).toBe("OTP_LOCKED");
    await admin.post(`/admin/users/${u.id}/clear-rate-limit`).expect(200);
    const r = await reset(u.email, c);
    expect(code(r), "code usable again").toBeUndefined();
    expect(r.status).toBe(200);
  });
});

describe("C6 email secrets in jobs.payload", () => {
  it("a sent email keeps only its recipient", async () => {
    const u = await activeStudent("scrub");
    await resetCode(u);
    await drain(2);
    const job = await db.job.findFirstOrThrow({ where: { type: "email.send", payload: { path: ["to"], equals: u.email } } });
    expect(job.status).toBe("done");
    expect(job.payload, "subject and text blanked").toEqual({ to: u.email, subject: "", text: "" });
  });

  it("the daily prune deletes done jobs older than 30 days and keeps the rest", async () => {
    const payload = { to: "x@tezu.ac.in", subject: "", text: "" };
    const old = await db.job.create({ data: { type: "email.send", payload, status: "done", finished_at: new Date(Date.now() - 31 * 24 * HOUR) } });
    const recent = await db.job.create({ data: { type: "email.send", payload, status: "done", finished_at: new Date(Date.now() - 24 * HOUR) } });
    const failed = await db.job.create({ data: { type: "email.send", payload, status: "failed", created_at: new Date(Date.now() - 31 * 24 * HOUR) } });
    await pruneDoneJobsJob.run({}, { id: "t", attempt: 1 });
    expect(await db.job.findUnique({ where: { id: old.id } }), "old done job pruned").toBeNull();
    expect(await db.job.findUnique({ where: { id: recent.id } }), "recent done job kept").not.toBeNull();
    expect(await db.job.findUnique({ where: { id: failed.id } }), "failed job kept for retry").not.toBeNull();
  });
});
