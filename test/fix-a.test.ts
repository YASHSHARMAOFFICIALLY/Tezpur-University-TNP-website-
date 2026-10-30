import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const dirs = vi.hoisted(() => {
  const root = `${process.cwd()}/data/fix-a`;
  process.env.TMPDIR = `${root}/tmp`;
  process.env.UPLOAD_DIR = `${root}/uploads`;
  return { tmp: `${root}/tmp`, uploads: `${root}/uploads` };
});

import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { hashPassword } from "../src/infrastructure/password.js";
import { inFileTx } from "../src/infrastructure/storage.js";
import { userMachine } from "../src/modules/auth/auth.service.js";
import { graduateJob, scheduleDailyJobs } from "../src/modules/students/students.service.js";
import { as, code, freshDbWithAdmin, login, PDF, PNG } from "./helpers.js";

let admin: ReturnType<typeof as>;
const ls = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)) : []);
const csv = (...lines: string[]) => Buffer.from(["enrolment_no,name,email,programme_code,year_of_completion,mobile", ...lines].join("\n"));

async function makeUser(role: "student" | "company", email: string, extra: Record<string, unknown> = {}) {
  const id = await inTx(async (tx) =>
    (await userMachine.create(tx, { role, email, name: "Test User", password_hash: await hashPassword("pass-word-1"), email_verified_at: new Date(), ...extra }, SYSTEM, { state: "active" })).id,
  );
  return { id, api: as(await login(email, "pass-word-1")) };
}
let n = 0;
const makeStudent = () => {
  const e = `csb2${String(++n).padStart(4, "0")}`;
  return makeUser("student", `${e}@tezu.ac.in`, { student: { create: { enrolment_no: e.toUpperCase(), academic_standing: "good" } } });
};

beforeAll(async () => {
  fs.rmSync(`${process.cwd()}/data/fix-a`, { recursive: true, force: true });
  fs.mkdirSync(dirs.tmp, { recursive: true });
  admin = await freshDbWithAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("A1 upload leaks", () => {
  it("removes the multer temp file when params validation or the handler fails before storing", async () => {
    expect(code(await admin.upload("/admin/placement-records/not-a-uuid/brochure", PDF, "b.pdf")), "bad params is a 400").toBe("VALIDATION_FAILED");
    expect(ls(dirs.tmp), "temp file removed after params failure").toEqual([]);

    const company = await db.company.create({ data: { name: "Other Co" } });
    const rec = await makeUser("company", "hr@other.example", { company_id: company.id });
    const r = await rec.api.upload("/company/opportunities/0190a0a0-0000-7000-8000-000000000000/jd", PDF, "jd.pdf");
    expect(code(r), "unknown posting").toBe("NOT_FOUND");
    expect(ls(dirs.tmp), "temp file removed after attachJd NOT_FOUND").toEqual([]);
  });

  it("removes the stored copy when the transaction rolls back", async () => {
    const r = await admin.upload("/admin/placement-records/0190a0a0-0000-7000-8000-000000000000/brochure", PDF, "b.pdf");
    expect(code(r), "missing placement record is NOT_FOUND (P2025)").toBe("NOT_FOUND");
    expect(ls(dirs.uploads), "no orphan copy in UPLOAD_DIR").toEqual([]);
    expect(await db.file.count(), "no files row").toBe(0);

    const tmp = path.join(dirs.tmp, "upload.pdf");
    fs.writeFileSync(tmp, PDF);
    const failing = inFileTx(async (_tx, files) => {
      await files.store((await db.user.findFirstOrThrow()).id, "jd", { path: tmp, originalname: "jd.pdf", size: PDF.length });
      throw new Error("later write failed");
    });
    await expect(failing, "transaction rolled back").rejects.toThrow("later write failed");
    fs.rmSync(tmp);
    expect(ls(dirs.uploads), "copy removed after a rollback that follows the store").toEqual([]);
    expect(await db.file.count(), "no files row after rollback").toBe(0);
  });

  it("deletes the superseded resume and brochure file and row", async () => {
    const s = await makeStudent();
    await s.api.upload("/students/me/resume", PDF, "v1.pdf").expect(201);
    const second = await s.api.upload("/students/me/resume", PDF, "v2.pdf").expect(201);
    const rows = await db.file.findMany({ where: { owner_user_id: s.id, kind: "resume" } });
    expect(rows.map((f) => f.id), "only the current resume row remains").toEqual([second.body.file_id]);
    expect(ls(path.join(dirs.uploads, "resume")), "only the current resume file remains").toEqual([path.join(dirs.uploads, rows[0]!.storage_path)]);

    const rec = await admin.post("/admin/placement-records", { year: 2025, data: {} }).expect(201);
    await admin.upload(`/admin/placement-records/${rec.body.id}/brochure`, PDF, "b1.pdf").expect(201);
    const b2 = await admin.upload(`/admin/placement-records/${rec.body.id}/brochure`, PDF, "b2.pdf").expect(201);
    expect((await db.file.findMany({ where: { kind: "brochure" } })).map((f) => f.id), "only the current brochure row remains").toEqual([b2.body.file_id]);
    expect(ls(path.join(dirs.uploads, "brochure")).length, "only the current brochure file remains").toBe(1);
  });

  it("rate-limits uploads per user", async () => {
    const s = await makeStudent();
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await s.api.upload("/students/me/photo", PNG, "p.png")).status);
    expect(codes.slice(0, 20).every((c) => c === 201), "first 20 uploads accepted").toBe(true);
    expect(codes[20], "21st upload in a minute is limited").toBe(429);
    await (await makeStudent()).api.upload("/students/me/photo", PNG, "p.png").expect(201);
    expect(ls(dirs.tmp), "rate-limited upload left no temp file").toEqual([]);
  });
});

describe("A2 error classification", () => {
  it("maps an FK violation (P2003) to VALIDATION_FAILED", async () => {
    const s = await makeStudent();
    const r = await s.api.patch("/students/me", { programme_id: "0190a0a0-0000-7000-8000-000000000000" });
    expect([r.status, code(r)], JSON.stringify(r.body)).toEqual([400, "VALIDATION_FAILED"]);
  });

  it("maps a CHECK violation (registration_window) to VALIDATION_FAILED", async () => {
    const ev = await admin.post("/admin/events", {
      type: "workshop", name: "Resume clinic", starts_at: "2027-01-10T10:00:00Z",
      registration_opens_at: "2027-01-01T00:00:00Z", registration_closes_at: "2027-01-05T00:00:00Z",
    }).expect(201);
    const r = await admin.patch(`/admin/events/${ev.body.id}`, { registration_closes_at: "2026-12-01T00:00:00Z" });
    expect([r.status, code(r)], JSON.stringify(r.body)).toEqual([400, "VALIDATION_FAILED"]);
  });

  it("reports a malformed CSV as VALIDATION_FAILED with a line number", async () => {
    const r = await admin.upload("/admin/students/import", csv('CSB21001,"Asha,asha@tezu.ac.in,,,'), "s.csv");
    expect([r.status, code(r)], JSON.stringify(r.body)).toEqual([400, "VALIDATION_FAILED"]);
    expect(r.body.error.details.csv_errors[0].line, "line number given").toBeTypeOf("number");
  });

  it("treats a response that fails its schema as a logged 500, not a 400", async () => {
    const s = await makeStudent();
    await db.student.update({ where: { user_id: s.id }, data: { mobile: "9".repeat(21) } });
    const r = await s.api.get("/students/me").set("x-request-id", "fix-a-bad-response");
    expect([r.status, code(r)], "stored data failing the response schema").toEqual([500, "INTERNAL"]);
    expect(await db.errorLog.count({ where: { request_id: "fix-a-bad-response" } }), "error_log row written").toBe(1);
    expect(code(await s.api.patch("/students/me", { mobile: "9".repeat(21) })), "request body still a 400").toBe("VALIDATION_FAILED");
  });
});

describe("A3 CSV import validators", () => {
  it("rejects a mobile longer than the profile allows", async () => {
    const r = await admin.upload("/admin/students/import", csv("CSB21901,Long Mobile,csb21901@tezu.ac.in,,2027,9876543210987654321012"), "s.csv");
    expect([r.status, code(r)], JSON.stringify(r.body)).toEqual([400, "VALIDATION_FAILED"]);
  });

  it("accepts a blank optional year cell", async () => {
    const r = await admin.upload("/admin/students/import", csv("CSB21902,Blank Year,csb21902@tezu.ac.in,,,9876543210"), "s.csv");
    expect(r.status, JSON.stringify(r.body)).toBe(202);
  });
});

describe("A4 alumni job", () => {
  it("graduates a cohort in transactions of at most 200 students", async () => {
    const year = new Date().getFullYear() - 2;
    await inTx(async (tx) => {
      for (let i = 0; i < 450; i++)
        await userMachine.create(tx, { role: "student", email: `grad${i}@tezu.ac.in`, name: "Grad", password_hash: "", student: { create: { enrolment_no: `GRD${String(i).padStart(5, "0")}`, academic_standing: "good", year_of_completion: year } } }, SYSTEM, { state: "active" });
    });
    const spy = vi.spyOn(userMachine, "moveMany");
    await graduateJob.run({}, { id: "t", attempt: 1 });
    const sizes = spy.mock.calls.map((c) => c[1].length);
    expect(Math.max(...sizes), "no transaction moves more than 200").toBeLessThanOrEqual(200);
    expect(new Set(spy.mock.calls.map((c) => c[0])).size, "each chunk has its own transaction").toBe(spy.mock.calls.length);
    expect(await db.user.count({ where: { email: { startsWith: "grad" }, status: "alumni" } }), "whole cohort graduated").toBe(450);
  });

  it("runs the manual graduation even after today's daily job exists", async () => {
    await scheduleDailyJobs();
    const before = await db.job.count({ where: { type: "students.graduate" } });
    expect((await admin.post("/admin/students/graduate").expect(200)).body).toEqual({ ok: true });
    expect(await db.job.count({ where: { type: "students.graduate" } }), "a new job was queued").toBe(before + 1);
  });
});
