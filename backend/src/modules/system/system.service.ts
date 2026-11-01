import fs from "node:fs/promises";
import { z } from "zod";
import { env } from "../../config/env.js";
import { paginate } from "../../http/route.js";
import { Prisma } from "../../generated/prisma/client.js";
import { audit, db, inTx, SYSTEM, type Actor, type Tx } from "../../infrastructure/db.js";
import { mail, sendEmail } from "../../infrastructure/mailer.js";
import { hashPassword, randomPassword } from "../../infrastructure/password.js";
import { defineJob, enqueue } from "../../infrastructure/queue.js";
import { ERRORS, fail, type AnyErrorCode } from "../../middleware/errors.js";
import { clearAccountLimit } from "../../middleware/rate-limit.js";
import { workerHeartbeat } from "../../workers/runner.js";
import { emailQueue } from "../admin/admin.service.js";
import { invalidateOtps, issueOtp } from "../auth/auth.service.js";
import { getSetting } from "../settings/settings.service.js";
import type { ErrorQuery, SystemHealth } from "./system.schemas.js";

const HOUR = 3_600_000;
type Signals = Omit<SystemHealth, "status" | "problems">;
type Rule = { level: "warning" | "problem"; say: (s: Signals, now: number) => string | null };

/** Each rule is one admin-facing sentence; the worst level that fires is the overall status. */
const RULES: Rule[] = [
  { level: "problem", say: (s) => (s.worker.alive ? null : "The background worker is not running, so emails and imports are stuck. Restart the portal.") },
  {
    level: "problem",
    say: (s, now) => (s.backup.last_ok_at && now - s.backup.last_ok_at.getTime() < 48 * HOUR ? null : "No backup in the last 48 hours"),
  },
  { level: "problem", say: (s) => (s.storage.free_bytes < s.storage.total_bytes * 0.05 ? "The upload disk is almost full. Ask IT for more space." : null) },
  { level: "warning", say: (s) => {
      const free = s.storage.free_bytes / s.storage.total_bytes;
      return free < 0.15 && free >= 0.05 ? "The upload disk is more than 85% full" : null; // below 5% the problem rule speaks
    } },
  { level: "warning", say: (s) => (s.database.latency_ms > 1000 ? "The database is responding slowly" : null) },
  { level: "warning", say: (s) => (s.email.failed ? `${s.email.failed} emails could not be sent. Use 'Retry failed emails' once mail works.` : null) },
  {
    level: "warning",
    say: (s) => (s.email.daily_cap !== null && s.email.queued > 0 && s.email.sent_24h >= s.email.daily_cap ? `The daily email limit is reached; ${s.email.queued} emails are waiting` : null),
  },
  { level: "warning", say: (s) => (s.jobs.failed > s.email.failed ? `${s.jobs.failed - s.email.failed} background tasks failed; see the error log` : null) },
  { level: "warning", say: (s) => (s.errors_24h ? `${s.errors_24h} server errors in the last 24 hours; see the error log` : null) },
];

export function assess(s: Signals, now: number): Pick<SystemHealth, "status" | "problems"> {
  const fired = RULES.map((r) => ({ level: r.level, text: r.say(s, now) })).filter((r) => r.text !== null);
  const status = fired.some((r) => r.level === "problem") ? "problem" : fired.length ? "warning" : "ok";
  return { status, problems: fired.map((r) => r.text!) };
}

export async function systemHealth(): Promise<SystemHealth> {
  const t0 = performance.now();
  await db.$queryRaw`select 1`;
  const latency_ms = Math.round(performance.now() - t0);
  const now = Date.now();
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
  const [lastDone, jobsQueued, jobsFailed, email, daily_cap, lastBackup, lastOkBackup, uploads, errors_24h, disk] = await Promise.all([
    db.job.aggregate({ _max: { finished_at: true }, where: { status: "done" } }),
    db.job.count({ where: { status: { in: ["queued", "running"] } } }),
    db.job.count({ where: { status: "failed" } }),
    emailQueue(),
    getSetting("email_daily_cap"),
    db.backupRun.findFirst({ orderBy: { id: "desc" } }),
    db.backupRun.findFirst({ where: { ok: true }, orderBy: { id: "desc" } }),
    db.file.aggregate({ _sum: { size: true } }),
    db.errorLog.count({ where: { created_at: { gt: new Date(now - 24 * HOUR) } } }),
    fs.statfs(env.UPLOAD_DIR),
  ]);
  const hb = workerHeartbeat;
  const signals: Signals = {
    database: { ok: true, latency_ms },
    worker: { alive: hb.lastTickAt !== null && now - hb.lastTickAt.getTime() < 3 * hb.intervalMs, last_tick_at: hb.lastTickAt, busy_with: hb.busyWith },
    jobs: { last_finished_at: lastDone._max.finished_at, queued: jobsQueued, failed: jobsFailed },
    email: { ...email, daily_cap },
    backup: {
      last_ok_at: lastOkBackup?.finished_at ?? null,
      last_status: !lastBackup ? "never" : lastBackup.ok ? "ok" : "failed",
      last_detail: lastBackup?.detail ?? null,
    },
    storage: { free_bytes: disk.bavail * disk.bsize, total_bytes: disk.blocks * disk.bsize, uploads_bytes: uploads._sum.size ?? 0 },
    errors_24h,
  };
  return { ...assess(signals, now), ...signals };
}

// ---------- error log ----------

const hintOf = (code: string) => ERRORS[code as AnyErrorCode]?.hint ?? "";

export async function listErrors(q: z.infer<typeof ErrorQuery>) {
  const page = await paginate(
    (a) =>
      db.errorLog.findMany({
        ...a,
        where: {
          code: q.code,
          created_at: { gte: q.from, lte: q.to },
          ...(q.q ? { OR: [{ summary: { contains: q.q, mode: "insensitive" } }, { route: { contains: q.q, mode: "insensitive" } }] } : {}),
        },
      }),
    q,
  );
  return { ...page, data: page.data.map((e) => ({ ...e, hint: hintOf(e.code) })) };
}

export const errorCodes = () => (Object.keys(ERRORS) as AnyErrorCode[]).map((code) => ({ code, status: ERRORS[code].status, message: ERRORS[code].message, hint: ERRORS[code].hint }));

export const pruneErrorLogJob = defineJob({
  type: "system.prune_error_log",
  payload: z.object({}),
  run: async () => ({ deleted: (await db.errorLog.deleteMany({ where: { created_at: { lt: new Date(Date.now() - 90 * 24 * HOUR) } } })).count }),
});

/** Sent emails keep only their recipient (see sendEmail.redact); the rows themselves go after 30 days. */
export const pruneDoneJobsJob = defineJob({
  type: "system.prune_done_jobs",
  payload: z.object({}),
  run: async () => ({ deleted: (await db.job.deleteMany({ where: { status: "done", finished_at: { lt: new Date(Date.now() - 30 * 24 * HOUR) } } })).count }),
});

/** Sign-ups that never verified their email would otherwise hold their email and enrolment number forever. */
export const pruneUnverifiedJob = defineJob({
  type: "system.prune_unverified",
  payload: z.object({}),
  run: async () => ({ deleted: await inTx((tx) => deleteUnverified(tx, Prisma.sql`created_at < ${new Date(Date.now() - 48 * HOUR)}`, SYSTEM)) }),
});

/** Called with the other daily jobs; the dedupe key makes each run at most once per day. */
export async function scheduleSystemJobs() {
  const day = new Date().toISOString().slice(0, 10);
  await inTx(async (tx) => {
    await enqueue(tx, pruneErrorLogJob, {}, { dedupeKey: `prune-error-log:${day}` });
    await enqueue(tx, pruneDoneJobsJob, {}, { dedupeKey: `prune-done-jobs:${day}` });
    await enqueue(tx, pruneUnverifiedJob, {}, { dedupeKey: `prune-unverified:${day}` });
  });
}

/**
 * An unverified account cannot log in, so it owns nothing but its student row, its codes and, for a
 * recruiter, the company it registered. The audit history stays. FOR UPDATE makes a concurrent verify wait, then fail.
 */
async function deleteUnverified(tx: Tx, which: Prisma.Sql, actor: Actor) {
  const users = await tx.$queryRaw<{ id: string; email: string; role: string; company_id: string | null }[]>`
    select id, email, role::text, company_id from users where status = 'pending_email_verify' and ${which} for update`;
  const ids = users.map((u) => u.id);
  await tx.otpCode.deleteMany({ where: { user_id: { in: ids } } });
  await tx.student.deleteMany({ where: { user_id: { in: ids } } });
  await tx.user.deleteMany({ where: { id: { in: ids } } });
  const orphan = { id: { in: users.flatMap((u) => u.company_id ?? []) }, users: { none: {} }, opportunities: { none: {} } };
  await tx.companyContact.deleteMany({ where: { company: orphan } });
  await tx.company.deleteMany({ where: orphan });
  for (const u of users) await audit(tx, actor, "user.unverified_deleted", "user", u.id, { email: u.email, role: u.role });
  return users.length;
}

// ---------- repairs: each is safe to repeat and audited ----------

export async function retryFailedEmails(jobIds: string[] | undefined, actor: Actor) {
  return inTx(async (tx) => {
    const { count } = await tx.job.updateMany({
      where: { type: sendEmail.type, status: "failed", ...(jobIds ? { id: { in: jobIds } } : {}) },
      data: { status: "queued", attempts: 0, run_after: new Date(), locked_at: null },
    });
    if (count) await audit(tx, actor, "repair.retry_failed_emails", "system", "retry-failed-emails", { requeued: count, job_ids: jobIds ?? "all" });
    return { requeued: count };
  });
}

const userOr404 = async (id: string) => (await db.user.findUnique({ where: { id } })) ?? fail("NOT_FOUND");

export async function resendOtp(userId: string, actor: Actor) {
  const u = await userOr404(userId);
  if (u.status !== "pending_email_verify") fail("INVALID_TRANSITION", { from: u.status, reason: "only accounts waiting for email verification get a code" });
  await inTx(async (tx) => {
    await issueOtp(tx, u, "verify_email");
    await audit(tx, actor, "user.otp_resent_by_admin", "user", u.id);
  });
  return { ok: true as const };
}

/** The password only ever leaves in the email; bumping token_version signs the user out everywhere. */
export async function resetPassword(userId: string, actor: Actor) {
  const u = await userOr404(userId);
  const password = randomPassword();
  const password_hash = await hashPassword(password);
  await inTx(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { password_hash, must_change_password: true, token_version: { increment: 1 } } });
    await invalidateOtps(tx, u.id, "password_reset");
    await mail(
      tx,
      { to: u.email, subject: "Your T&P portal password was reset", text: `An administrator reset your password.\nLogin: ${u.email}\nOne-time password: ${password}\nYou must change it when you log in.` },
      { priority: 0 },
    );
    await audit(tx, actor, "user.password_reset_by_admin", "user", u.id);
  });
  return { emailed: true as const };
}

export async function clearRateLimit(userId: string, actor: Actor) {
  const u = await userOr404(userId);
  clearAccountLimit(u.email);
  await inTx(async (tx) => {
    // issueOtp keeps one live code per purpose, so this unlocks exactly the code the user holds.
    await tx.otpCode.updateMany({ where: { user_id: u.id, consumed_at: null }, data: { attempts: 0 } });
    await audit(tx, actor, "user.rate_limit_cleared", "user", u.id);
  });
  return { ok: true as const };
}

export async function deleteUnverifiedUser(userId: string, actor: Actor) {
  const u = await userOr404(userId);
  const only = { reason: "only accounts that never verified their email can be deleted" };
  if (u.status !== "pending_email_verify") fail("INVALID_TRANSITION", { from: u.status, ...only });
  if (!(await inTx((tx) => deleteUnverified(tx, Prisma.sql`id = ${u.id}`, actor)))) fail("INVALID_TRANSITION", only); // verified meanwhile
  return { ok: true as const };
}
