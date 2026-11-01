// End-to-end over HTTP against a real Postgres (DATABASE_URL -> tnp_test, see vitest.config.ts).
// Each assertion targets one invariant, so removing the rule that backs it turns this red.
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { startWorker } from "../src/workers/runner.js";
import { userMachine } from "../src/modules/auth/auth.service.js";
import { jobs } from "../src/modules/index.js";
import { api, app, as, code, freshDbWithAdmin, lastOtp, login, PDF, PNG } from "./helpers.js";

let admin: ReturnType<typeof as>;
let programmeId: string;

beforeAll(async () => {
  admin = await freshDbWithAdmin();
  programmeId = (await admin.post("/admin/programmes", { department: "CSE", name: "B.Tech CSE", code: "BTCSE" })).body.id;
});

describe("status guard", () => {
  it("rejects a status write that bypasses Machine, from Prisma and from raw SQL", async () => {
    const u = await db.user.findFirstOrThrow();
    await expect(db.user.update({ where: { id: u.id }, data: { status: "rejected" } })).rejects.toThrow(/STATUS_WRITE_OUTSIDE_MACHINE/);
    await expect(db.$executeRaw`update users set status = 'rejected' where id = ${u.id}`).rejects.toThrow(/STATUS_WRITE_OUTSIDE_MACHINE/);
  });
  it("guards exactly the tables that have a Machine", async () => {
    const rows = await db.$queryRaw<{ t: string }[]>`select event_object_table as t from information_schema.triggers where trigger_name = 'guard_status' group by 1 order by 1`;
    expect(rows.map((r) => r.t)).toEqual(["applications", "event_registrations", "events", "opportunities", "students", "users"]);
  });
});

describe("placement workflow", () => {
  let student: ReturnType<typeof as>;
  let recruiter: ReturnType<typeof as>;
  let oppId: string;
  let appId: string;

  it("student registers with the university email only, verifies by OTP, waits for approval", async () => {
    const body = { email: "csb21001@tezu.ac.in", password: "student-pass", name: "Asha Das", enrolment_no: "CSB21001", mobile: "9876543210" };
    expect(code(await request(app).post(api("/auth/register/student")).send({ ...body, email: "asha@gmail.com" }))).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect((await request(app).post(api("/auth/register/student")).send(body)).status).toBe(201);
    expect(code(await request(app).post(api("/auth/login")).send({ email: body.email, password: body.password }))).toBe("EMAIL_NOT_VERIFIED");
    expect(code(await request(app).post(api("/auth/verify-otp")).send({ email: body.email, code: "000000" }))).toBe("OTP_INVALID");
    const v = await request(app).post(api("/auth/verify-otp")).send({ email: body.email, code: await lastOtp(body.email) });
    expect(v.body).toEqual({ status: "pending_admin" });
    expect(code(await request(app).post(api("/auth/login")).send({ email: body.email, password: body.password }))).toBe("PENDING_ADMIN_APPROVAL");

    const pending = await admin.get("/admin/pending");
    const id = pending.body.students[0].id;
    expect((await admin.post(`/admin/users/${id}/decision`, { decision: "approve" })).body).toEqual({ changed: true });
    student = as(await login(body.email, body.password));
  });

  it("recruiter registers, gets approved, posts, admin approves the posting", async () => {
    const email = "hr@acme.example";
    await request(app).post(api("/auth/register/recruiter")).send({ email, password: "recruiter-pass", name: "R. Hire", company: { name: "Acme Ltd", category: "private" } }).expect(201);
    await request(app).post(api("/auth/verify-otp")).send({ email, code: await lastOtp(email) }).expect(200);
    const id = (await admin.get("/admin/pending")).body.recruiters[0].id;
    await admin.post(`/admin/users/${id}/decision`, { decision: "approve" }).expect(200);
    recruiter = as(await login(email, "recruiter-pass"));

    const draft = await recruiter.post("/company/opportunities", {
      type: "job", title: "Graduate Engineer", description: "Build things for a living.", apply_deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      eligibility: { min_cgpa: 7, programmes: [programmeId] }, selection_process: { technical_interview: true },
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    oppId = draft.body.id;
    expect((await student.get(`/opportunities/${oppId}`)).status).toBe(404); // draft is invisible to students
    await recruiter.post(`/company/opportunities/${oppId}/submit`).expect(200);
    await admin.post(`/admin/opportunities/${oppId}/decision`, { decision: "approve" }).expect(200);
    expect((await student.get("/noticeboard")).body.data[0].title).toMatch(/Graduate Engineer/);
  });

  it("a posting whose deadline has passed can be drafted but not submitted or approved", async () => {
    const body = (days: number) => ({
      type: "job", title: "Late Posting", description: "Deadline checks for submit and approve.", apply_deadline: new Date(Date.now() + days * 86_400_000).toISOString(),
      eligibility: { min_cgpa: 7, programmes: [programmeId] }, selection_process: { technical_interview: true },
    });
    const past = (await recruiter.post("/company/opportunities", body(-1)).expect(201)).body.id;
    expect(code(await recruiter.post(`/company/opportunities/${past}/submit`))).toBe("VALIDATION_FAILED");
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: past } })).status).toBe("draft");

    const lapsed = (await recruiter.post("/company/opportunities", body(1)).expect(201)).body.id;
    await recruiter.post(`/company/opportunities/${lapsed}/submit`).expect(200);
    await db.opportunity.update({ where: { id: lapsed }, data: { apply_deadline: new Date(Date.now() - 60_000) } });
    expect(code(await admin.post(`/admin/opportunities/${lapsed}/decision`, { decision: "approve" }))).toBe("VALIDATION_FAILED");
    await admin.post(`/admin/opportunities/${lapsed}/decision`, { decision: "return", reason: "Move the deadline" }).expect(200);

    // Once the deadline passes, a repeat submit or approve is still a no-op, not an error.
    const live = (await recruiter.post("/company/opportunities", body(1)).expect(201)).body.id;
    await recruiter.post(`/company/opportunities/${live}/submit`).expect(200);
    await db.opportunity.update({ where: { id: live }, data: { apply_deadline: new Date(Date.now() - 60_000) } });
    expect((await recruiter.post(`/company/opportunities/${live}/submit`).expect(200)).body).toEqual({ changed: false });
    await db.opportunity.update({ where: { id: live }, data: { apply_deadline: new Date(Date.now() + 86_400_000) } });
    await admin.post(`/admin/opportunities/${live}/decision`, { decision: "approve" }).expect(200);
    await db.opportunity.update({ where: { id: live }, data: { apply_deadline: new Date(Date.now() - 60_000) } });
    expect((await admin.post(`/admin/opportunities/${live}/decision`, { decision: "approve" }).expect(200)).body).toEqual({ changed: false });

    // Another company sees NOT_FOUND, never this company's deadline.
    const email = "hr@other.example";
    await request(app).post(api("/auth/register/recruiter")).send({ email, password: "recruiter-pass", name: "O. Ther", company: { name: "Other Ltd", category: "private" } }).expect(201);
    await request(app).post(api("/auth/verify-otp")).send({ email, code: await lastOtp(email) }).expect(200);
    await admin.post(`/admin/users/${(await admin.get("/admin/pending")).body.recruiters[0].id}/decision`, { decision: "approve" }).expect(200);
    const other = as(await login(email, "recruiter-pass"));
    expect(code(await other.post(`/company/opportunities/${past}/submit`))).toBe("NOT_FOUND");
  });

  it("apply enforces profile, then eligibility with reasons, then uniqueness", async () => {
    expect(code(await student.post(`/opportunities/${oppId}/apply`))).toBe("PROFILE_INCOMPLETE");
    expect(code(await student.upload("/students/me/resume", PNG, "cv.pdf"))).toBe("FILE_TYPE_NOT_ALLOWED"); // sniffed, not trusted
    await student.upload("/students/me/resume", PDF, "cv.pdf").expect(201);
    await student.upload("/students/me/photo", PNG, "me.png").expect(201);
    await student.patch("/students/me", { cgpa: 6.5, programme_id: programmeId, year_of_completion: 2027, dob: "2003-05-01" }).expect(200);

    const ne = await student.post(`/opportunities/${oppId}/apply`);
    expect(code(ne)).toBe("NOT_ELIGIBLE");
    expect(ne.body.error.details.reasons).toEqual([{ rule: "min_cgpa", required: 7, actual: 6.5 }]);

    await student.patch("/students/me", { cgpa: 8.1 }).expect(200);
    const ok = await student.post(`/opportunities/${oppId}/apply`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    appId = ok.body.id;
    expect(code(await student.post(`/opportunities/${oppId}/apply`))).toBe("ALREADY_APPLIED");
    const stored = await db.application.findUniqueOrThrow({ where: { id: appId } });
    expect(stored.eligibility_result).toMatchObject({ eligible: true, rule: { min_cgpa: 7 } });
  });

  it("recruiter sees nothing before admin release, and cannot act on unreleased rows", async () => {
    expect((await recruiter.get(`/company/opportunities/${oppId}/applicants`)).body.data).toEqual([]);
    expect(code(await recruiter.post("/company/applications/shortlist", { application_ids: [appId] }))).toBe("NOT_FOUND");
    const resumeId = (await db.student.findFirstOrThrow()).resume_file_id!;
    expect((await recruiter.get(`/files/${resumeId}`)).status).toBe(404);

    expect((await admin.post(`/admin/opportunities/${oppId}/release`, {})).body).toEqual({ released: 1 });
    const seen = await recruiter.get(`/company/opportunities/${oppId}/applicants`);
    expect(seen.body.data).toHaveLength(1);
    expect(seen.body.data[0].student).not.toHaveProperty("academic_standing");
    expect((await recruiter.get(`/files/${resumeId}`)).status).toBe(200);
  });

  it("shortlist, interview, results, publish", async () => {
    await recruiter.post("/company/applications/shortlist", { application_ids: [appId] }).expect(200);
    await recruiter.post(`/company/opportunities/${oppId}/interviews`, { application_ids: [appId], round: "Technical", at: new Date().toISOString(), venue_or_link: "Room 1" }).expect(201);
    await recruiter.post(`/company/opportunities/${oppId}/results`, { selected_application_ids: [appId] }).expect(200);
    expect((await admin.post(`/admin/opportunities/${oppId}/results/publish`)).body).toEqual({ selected: 1, rejected: 0 });
    expect((await admin.post(`/admin/opportunities/${oppId}/results/publish`)).body.selected).toBe(1); // idempotent
    const mine = await student.get("/applications/mine");
    expect(mine.body.data[0].status).toBe("selected");
    expect(mine.body.data[0].interviews).toHaveLength(1);
  });

  it("every application status change is in the audit log", async () => {
    const actions = (await db.auditLog.findMany({ where: { entity_id: appId }, orderBy: { id: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["application.created", "application.applied->released_to_recruiter", "application.released_to_recruiter->shortlisted", "application.shortlisted->selected"]);
    await expect(db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it("admin student search exposes user_id for repairs; recruiter view does not", async () => {
    const s = await db.student.findFirstOrThrow();
    const row = (await admin.get(`/admin/students?q=${s.enrolment_no}`).expect(200)).body.data[0];
    expect(row.user_id).toBe(s.user_id);
    const applicant = (await recruiter.get(`/company/opportunities/${oppId}/applicants`).expect(200)).body.data[0];
    expect(applicant.student.user_id).toBeUndefined();
  });

  it("probation blocks applying and event registration", async () => {
    const s = await db.student.findFirstOrThrow();
    await admin.post(`/admin/students/${s.id}/probation`, { on: true, reason: "attendance" }).expect(200);
    const ev = await admin.post("/admin/events", {
      type: "workshop", name: "Resume workshop", starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      registration_opens_at: new Date(Date.now() - 3_600_000).toISOString(), registration_closes_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await admin.post(`/admin/events/${ev.body.id}/publish`).expect(200);
    expect(code(await student.post(`/events/${ev.body.id}/register`))).toBe("ON_PROBATION");
    expect(code(await student.post(`/opportunities/${oppId}/apply`))).toBe("ON_PROBATION");
    await admin.post(`/admin/students/${s.id}/probation`, { on: false }).expect(200);
    await student.post(`/events/${ev.body.id}/register`).expect(201);
    expect(code(await student.post(`/events/${ev.body.id}/register`))).toBe("ALREADY_REGISTERED");
  });

  it("event registration outside the window is REGISTRATION_CLOSED", async () => {
    const ev = await admin.post("/admin/events", {
      type: "training", name: "Aptitude bootcamp", starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      registration_opens_at: new Date(Date.now() + 86_400_000).toISOString(), registration_closes_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    await admin.post(`/admin/events/${ev.body.id}/publish`).expect(200);
    expect(code(await student.post(`/events/${ev.body.id}/register`))).toBe("REGISTRATION_CLOSED");
  });
});

describe("accounts", () => {
  it("teacher gets one-time credentials and must change password before anything else", async () => {
    await admin.post("/admin/teachers", { email: "prof@tezu.ac.in", name: "Prof. K" }).expect(201);
    const job = await db.job.findFirstOrThrow({ where: { payload: { path: ["to"], equals: "prof@tezu.ac.in" } } });
    const pw = /One-time password: (\S+)/.exec((job.payload as { text: string }).text)![1]!;
    const t = as(await login("prof@tezu.ac.in", pw));
    expect(code(await t.get("/admin/pending"))).toBe("PASSWORD_CHANGE_REQUIRED");
    const s = await t.post("/auth/change-password", { current_password: pw, new_password: "new-strong-pass" });
    expect(s.status).toBe(200);
    expect((await as(s.body.access_token).get("/admin/pending")).status).toBe(200);
    expect((await t.get("/auth/me")).status).toBe(401); // old token revoked
  });

  it("CSV-imported students activate through forgot-password, with no bulk mail", async () => {
    const csv = "enrolment_no,name,email,programme_code,year_of_completion\nCSB21002,Bina Roy,csb21002@tezu.ac.in,BTCSE,2027\n";
    const r = await admin.upload("/admin/students/import", Buffer.from(csv), "s.csv");
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    const mailsBefore = await db.job.count({ where: { type: "email.send" } });
    const worker = startWorker(jobs, { intervalMs: 50 });
    for (let i = 0; i < 20 && (await db.job.findUniqueOrThrow({ where: { id: r.body.job_id } })).status !== "done"; i++) await worker.tick();
    await worker.stop();
    const job = await db.job.findUniqueOrThrow({ where: { id: r.body.job_id } });
    expect(job.result).toMatchObject({ created: 1 });
    expect(code(await request(app).post(api("/auth/login")).send({ email: "csb21002@tezu.ac.in", password: "anything" }))).toBe("INVALID_CREDENTIALS");
    expect(await db.job.count({ where: { type: "email.send" } })).toBe(mailsBefore); // import sent no mail

    await request(app).post(api("/auth/forgot-password")).send({ email: "csb21002@tezu.ac.in" }).expect(200);
    const otp = await lastOtp("csb21002@tezu.ac.in");
    await request(app).post(api("/auth/reset-password")).send({ email: "csb21002@tezu.ac.in", code: otp, new_password: "bina-pass-1" }).expect(200);
    await login("csb21002@tezu.ac.in", "bina-pass-1");
  });

  it("alumni keep their login but are read-only", async () => {
    const u = await db.user.findFirstOrThrow({ where: { email: "csb21002@tezu.ac.in" } });
    await inTx((tx) => userMachine.move(tx, u.id, "alumni", SYSTEM));
    const t = as(await login("csb21002@tezu.ac.in", "bina-pass-1"));
    expect((await t.get("/students/me")).status).toBe(200);
    expect(code(await t.patch("/students/me", { mobile: "9999999999" }))).toBe("ALUMNI_READ_ONLY");
  });
});

describe("rate limits", () => {
  it("limits logins per account, not per shared campus IP", async () => {
    const attempt = (email: string) => request(app).post(api("/auth/login")).send({ email, password: "wrong-password" });
    for (let i = 0; i < 12; i++) expect(code(await attempt(`nat${i}@tezu.ac.in`))).toBe("INVALID_CREDENTIALS");
    for (let i = 0; i < 10; i++) await attempt("victim@tezu.ac.in");
    expect(code(await attempt("victim@tezu.ac.in"))).toBe("RATE_LIMITED");
  });
});

describe("contract", () => {
  it("serves an OpenAPI 3.1 document covering every route, and errors share one shape", async () => {
    const spec = (await request(app).get(api("/openapi.json"))).body;
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(60);
    const r = await request(app).get(api("/nope"));
    expect(r.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found", details: {} } });
    fs.writeFileSync(path.join(import.meta.dirname, "..", "openapi.json"), JSON.stringify(spec, null, 2) + "\n");
  });
});
