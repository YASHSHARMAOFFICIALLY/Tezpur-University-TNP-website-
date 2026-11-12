import type { OtpPurpose, User } from "../../generated/prisma/client.js";
import { db, defineMachine, inTx, isUniqueViolation, SYSTEM, type Tx } from "../../infrastructure/db.js";
import { AppError, fail } from "../../middleware/errors.js";
import { mail } from "../../infrastructure/mailer.js";
import { DUMMY_HASH, hashPassword, newOtp, otpHash, verifyPassword } from "../../infrastructure/password.js";
import { signTokens, verifyToken, type AuthUser } from "../../middleware/auth.js";
import { getSetting } from "../settings/settings.service.js";
import { env } from "../../config/env.js";

/**
 * Account lifecycle. Self-registered users start at pending_email_verify; admin-created teachers
 * and CSV-imported students are born active. rejected -> pending_admin is the recruiter
 * "fix and resubmit" path (admin rejects with a reason; the reason is the correction request).
 */
export const userMachine = defineMachine({
  delegate: "user",
  entity: "user",
  entry: ["pending_email_verify", "active"],
  transitions: {
    // Students: the OTP to their university inbox is the approval, so they go straight to active.
    pending_email_verify: ["pending_admin", "active"],
    pending_admin: ["active", "rejected"],
    rejected: ["pending_admin"],
    active: ["alumni"],
    alumni: [],
  },
});

const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MS = 60_000;

const normalize = (email: string) => email.trim().toLowerCase();

/** Retires every outstanding code, so only the newest issued code can ever be used. */
export const invalidateOtps = (tx: Tx, userId: string, purpose: OtpPurpose) =>
  tx.otpCode.updateMany({ where: { user_id: userId, purpose, consumed_at: null }, data: { consumed_at: new Date() } });

/** Issues a fresh OTP and queues its email in the same transaction. */
export async function issueOtp(tx: Tx, user: Pick<User, "id" | "email">, purpose: OtpPurpose) {
  const last = await tx.otpCode.findFirst({ where: { user_id: user.id, purpose }, orderBy: { created_at: "desc" } });
  if (last && Date.now() - last.created_at.getTime() < OTP_RESEND_MS) fail("OTP_RESEND_TOO_SOON", { retry_after_s: 60 });
  const code = newOtp();
  const minutes = await getSetting("otp_expiry_minutes");
  await invalidateOtps(tx, user.id, purpose);
  await tx.otpCode.create({
    data: { user_id: user.id, purpose, code_hash: otpHash(user.id, purpose, code), expires_at: new Date(Date.now() + minutes * 60_000) },
  });
  const what = purpose === "verify_email" ? "verify your email" : "reset your password";
  await mail(tx, { to: user.email, subject: `T&P portal code: ${code}`, text: `Your code to ${what} is ${code}. It expires in ${minutes} minutes.` }, { priority: 0 });
}

/** Sends the sign-up code, or with SKIP_EMAIL_OTP marks the email verified at once (student active, recruiter to admin queue). */
async function startEmailVerify(tx: Tx, user: Pick<User, "id" | "email">, role: "student" | "company") {
  if (!env.SKIP_EMAIL_OTP) {
    await issueOtp(tx, user, "verify_email");
    return "pending_email_verify" as const;
  }
  const to = role === "student" ? ("active" as const) : ("pending_admin" as const);
  await userMachine.move(tx, user.id, to, SYSTEM, { extra: { email_verified_at: new Date() }, meta: { via: "otp_skipped" } });
  return to;
}

/** Single use, expires per otp_expiry_minutes, 5 attempts on the latest code. Wrong attempts are committed even though the call fails. */
async function consumeOtp(userId: string, purpose: OtpPurpose, code: string) {
  const otp = await db.otpCode.findFirst({ where: { user_id: userId, purpose, consumed_at: null }, orderBy: { created_at: "desc" } });
  if (!otp || otp.expires_at < new Date()) fail("OTP_INVALID");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) fail("OTP_LOCKED");
  if (otp.code_hash !== otpHash(userId, purpose, code)) {
    await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    fail("OTP_INVALID");
  }
  const { count } = await db.otpCode.updateMany({ where: { id: otp.id, consumed_at: null }, data: { consumed_at: new Date() } });
  if (count === 0) fail("OTP_INVALID"); // raced with another request using the same code
}

export async function registerStudent(input: { email: string; password: string; name: string; enrolment_no: string; mobile: string; programme_id?: string }) {
  const email = normalize(input.email);
  const domain = await getSetting("student_email_domain");
  if (!email.endsWith("@" + domain)) fail("EMAIL_DOMAIN_NOT_ALLOWED", { domain });
  const password_hash = await hashPassword(input.password);
  try {
    return await inTx(async (tx) => {
      const { id } = await userMachine.create(
        tx,
        {
          role: "student",
          email,
          name: input.name,
          password_hash,
          student: {
            create: { enrolment_no: input.enrolment_no.toUpperCase(), mobile: input.mobile, programme_id: input.programme_id, academic_standing: "good" },
          },
        },
        SYSTEM,
      );
      return { id, status: await startEmailVerify(tx, { id, email }, "student") };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      if (await db.user.findUnique({ where: { email } })) fail("EMAIL_TAKEN");
      fail("ENROLMENT_TAKEN");
    }
    throw e;
  }
}

export type CompanyInput = { name: string; postal_address?: string; website?: string; category?: "private" | "mnc" | "govt" | "ngo" | "psu" | "startup" | "other"; sector?: string };
export type ContactInput = { designation?: string; phone?: string; mobile?: string };

export async function registerRecruiter(input: { email: string; password: string; name: string; company: CompanyInput; contact: ContactInput }) {
  const email = normalize(input.email);
  const password_hash = await hashPassword(input.password);
  try {
    return await inTx(async (tx) => {
      const company = await tx.company.create({
        data: { ...input.company, contacts: { create: { name: input.name, email, ...input.contact } } },
      });
      const { id } = await userMachine.create(tx, { role: "company", email, name: input.name, password_hash, company_id: company.id }, SYSTEM);
      return { id, status: await startEmailVerify(tx, { id, email }, "company") };
    });
  } catch (e) {
    if (isUniqueViolation(e)) fail("EMAIL_TAKEN");
    throw e;
  }
}

async function userByEmail(email: string) {
  return db.user.findUnique({ where: { email: normalize(email) } });
}

/** Students may sign in with their enrolment number (institute ID) instead of their email. */
async function userByLogin(id: string) {
  if (id.includes("@")) return userByEmail(id);
  return db.user.findFirst({ where: { student: { enrolment_no: id.trim().toUpperCase() } } });
}

export async function verifyEmail(email: string, code: string) {
  const u = await userByEmail(email);
  if (!u || u.status !== "pending_email_verify") fail("OTP_INVALID");
  await consumeOtp(u.id, "verify_email", code);
  const to = u.role === "student" ? ("active" as const) : ("pending_admin" as const);
  await inTx((tx) => userMachine.move(tx, u.id, to, SYSTEM, { extra: { email_verified_at: new Date() }, meta: { via: "email_otp" } }));
  return { status: to };
}

export async function resendVerification(email: string) {
  const u = await userByEmail(email);
  // Same answer whether or not the account exists.
  if (u?.status === "pending_email_verify") await inTx((tx) => issueOtp(tx, u, "verify_email"));
  return { ok: true as const };
}

export async function login(email: string, password: string) {
  const u = await userByLogin(email);
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) fail("INVALID_CREDENTIALS");
  if (u.status === "pending_email_verify") fail("EMAIL_NOT_VERIFIED");
  if (u.status === "pending_admin") fail("PENDING_ADMIN_APPROVAL");
  if (u.status === "rejected") fail("ACCOUNT_REJECTED", { reason: u.review_note });
  return session(u);
}

const session = (u: User) => ({
  ...signTokens(u),
  // Only reached for active/alumni users (login/refresh check; other paths are authenticated).
  user: { id: u.id, role: u.role, name: u.name, email: u.email, status: u.status as "active" | "alumni", must_change_password: u.must_change_password },
});

export async function refresh(token: string) {
  const u = await verifyToken(token, "refresh");
  if (!u || (u.status !== "active" && u.status !== "alumni")) fail("REFRESH_INVALID");
  return session(u);
}

export async function me(user: AuthUser) {
  return { ...user, must_change_password: user.mustChangePassword, company_id: user.companyId };
}

/** Bumping token_version revokes every access and refresh token of the user. */
export async function logout(userId: string) {
  await db.user.update({ where: { id: userId }, data: { token_version: { increment: 1 } } });
  return { ok: true as const };
}

export async function changePassword(userId: string, current: string, next: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, u.password_hash))) fail("INVALID_CREDENTIALS");
  const password_hash = await hashPassword(next);
  const updated = await inTx(async (tx) => {
    await invalidateOtps(tx, userId, "password_reset");
    return tx.user.update({ where: { id: userId }, data: { password_hash, must_change_password: false, token_version: { increment: 1 } } });
  });
  return session(updated);
}

/** Also the first-login path for CSV-imported students: they have no password until they reset it via their TU inbox. */
export async function forgotPassword(email: string) {
  const u = await userByEmail(email);
  if (u && u.status !== "rejected") {
    try {
      await inTx((tx) => issueOtp(tx, u, "password_reset"));
    } catch (e) {
      // Do not reveal existence through the resend limiter.
      if (!(e instanceof AppError && e.code === "OTP_RESEND_TOO_SOON")) throw e;
    }
  }
  return { ok: true as const };
}

export async function resetPassword(email: string, code: string, next: string) {
  const u = await userByEmail(email);
  if (!u || u.status === "rejected") fail("OTP_INVALID");
  await consumeOtp(u.id, "password_reset", code);
  const password_hash = await hashPassword(next);
  await db.user.update({
    where: { id: u.id },
    data: { password_hash, must_change_password: false, token_version: { increment: 1 }, email_verified_at: u.email_verified_at ?? new Date() },
  });
  return { ok: true as const };
}

/** Rejected recruiter fixes the details named in review_note and goes back into the approval queue. */
export async function resubmitRecruiter(input: { email: string; password: string; company: Partial<CompanyInput> }) {
  const u = await userByEmail(input.email);
  if (!u || u.role !== "company" || !(await verifyPassword(input.password, u.password_hash))) fail("INVALID_CREDENTIALS");
  if (u.status !== "rejected") fail("INVALID_TRANSITION", { from: u.status, to: "pending_admin" });
  await inTx(async (tx) => {
    await tx.company.update({ where: { id: u.company_id! }, data: input.company });
    await userMachine.move(tx, u.id, "pending_admin", { kind: "user", userId: u.id, role: u.role });
  });
  return { status: "pending_admin" as const };
}
