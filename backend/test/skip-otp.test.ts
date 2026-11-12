// SKIP_EMAIL_OTP (pre-launch testing): sign-up skips the email code; off by default.
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { db } from "../src/infrastructure/db.js";
import { api, app, code, freshDbWithAdmin, login } from "./helpers.js";

const student = (n: string) => ({ email: `csb2${n}@tezu.ac.in`, password: "student-pass", name: "Skip Test", enrolment_no: `CSB2${n}`, mobile: "9876543210" });
const mailsTo = (to: string) => db.job.count({ where: { type: "email.send", payload: { path: ["to"], equals: to } } });

describe("SKIP_EMAIL_OTP", () => {
  beforeAll(freshDbWithAdmin);
  afterEach(() => void (env.SKIP_EMAIL_OTP = false));

  it("off (default): student must enter the code before login", async () => {
    const s = student("9001");
    expect((await request(app).post(api("/auth/register/student")).send(s)).body.status).toBe("pending_email_verify");
    expect(code(await request(app).post(api("/auth/login")).send({ email: s.email, password: s.password }))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("on: student is active and can log in at once, no code mailed", async () => {
    env.SKIP_EMAIL_OTP = true;
    const s = student("9002");
    expect((await request(app).post(api("/auth/register/student")).send(s)).body.status).toBe("active");
    await login(s.email, s.password);
    expect(await mailsTo(s.email)).toBe(0);
  });

  it("on: recruiter skips the code but still waits for admin approval", async () => {
    env.SKIP_EMAIL_OTP = true;
    const email = "hr@skip-otp.example";
    const r = await request(app).post(api("/auth/register/recruiter")).send({ email, password: "recruiter-pass", name: "R. Hire", company: { name: "Skip Co", category: "private" } });
    expect(r.body.status).toBe("pending_admin");
    expect(code(await request(app).post(api("/auth/login")).send({ email, password: "recruiter-pass" }))).toBe("PENDING_ADMIN_APPROVAL");
  });
});
