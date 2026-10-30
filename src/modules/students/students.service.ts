import { CsvError, parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { db, defineMachine, inTx, SYSTEM, type Actor, type Tx } from "../../infrastructure/db.js";
import { fail } from "../../middleware/errors.js";
import { defineJob, enqueue } from "../../infrastructure/queue.js";
import { inFileTx } from "../../infrastructure/storage.js";
import type { UploadedFile } from "../../middleware/upload.js";
import { getSetting } from "../settings/settings.service.js";
import { userMachine } from "../auth/auth.service.js";
import { findProfile } from "./students.repository.js";
import { ImportRow } from "./students.schemas.js";

/** Probation is a guarded, audited state like any other status. */
export const standingMachine = defineMachine({
  delegate: "student",
  entity: "student_standing",
  field: "academic_standing",
  entry: ["good"],
  transitions: { good: ["probation"], probation: ["good"] },
});

declare const participantBrand: unique symbol;
/**
 * A student allowed to act right now. The only constructor is loadParticipant, so apply and
 * event registration cannot be written without the probation/profile gate: forgetting it is a type error.
 */
export type Participant = {
  readonly [participantBrand]: true;
  studentId: string;
  facts: EligibilityFacts;
};
export type EligibilityFacts = { cgpa: number | null; programme_id: string | null; year_of_completion: number | null; dob: Date | null };

/** Order is contract: ON_PROBATION first, then PROFILE_INCOMPLETE (apply only). */
export async function loadParticipant(tx: Tx, userId: string, purpose: "apply" | "event"): Promise<Participant> {
  const s = await tx.student.findUnique({ where: { user_id: userId } });
  if (!s) fail("FORBIDDEN");
  if (s.academic_standing === "probation") fail("ON_PROBATION");
  if (purpose === "apply") {
    const missing = PROFILE_REQUIRED.filter((k) => s[k] == null);
    if (missing.length) fail("PROFILE_INCOMPLETE", { missing });
  }
  return { studentId: s.id, facts: factsOf(s) } as Participant;
}

export const factsOf = (s: EligibilityFacts): EligibilityFacts => ({
  cgpa: s.cgpa,
  programme_id: s.programme_id,
  year_of_completion: s.year_of_completion,
  dob: s.dob,
});

/** Required before applying. The coloured photo and resume are mandated by the T&P cell. */
export const PROFILE_REQUIRED = ["resume_file_id", "photo_file_id", "cgpa", "programme_id", "year_of_completion", "dob"] as const;

export async function getProfile(userId: string) {
  return findProfile(db, userId);
}

export async function updateProfile(userId: string, data: Record<string, unknown>) {
  const { name, ...rest } = data as { name?: string };
  return inTx(async (tx) => {
    if (name) await tx.user.update({ where: { id: userId }, data: { name } });
    await tx.student.update({ where: { user_id: userId }, data: rest });
    return findProfile(tx, userId);
  });
}

export async function setProbation(studentId: string, on: boolean, reason: string | undefined, actor: Actor) {
  return inTx((tx) => standingMachine.move(tx, studentId, on ? "probation" : "good", actor, { meta: { reason } }));
}

export async function uploadFile(userId: string, kind: "resume" | "photo", file: UploadedFile | null) {
  return inFileTx(async (tx, files) => {
    const s = await tx.student.findUniqueOrThrow({ where: { user_id: userId }, select: { resume_file_id: true, photo_file_id: true } });
    const f = await files.store(userId, kind, file, { replaces: s[`${kind}_file_id`] });
    await tx.student.update({ where: { user_id: userId }, data: { [`${kind}_file_id`]: f.id } });
    return { file_id: f.id };
  });
}

// ---------- CSV import ----------

/** Parses and validates the whole file up front so a bad file is rejected before anything is queued. */
export function parseImportCsv(csv: string, domain: string): ImportRow[] {
  let records: unknown[];
  try {
    records = parse(csv, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, bom: true });
  } catch (e) {
    if (e instanceof CsvError) fail("VALIDATION_FAILED", { csv_errors: [{ line: e.lines, issues: [e.message] }], error_count: 1 });
    throw e;
  }
  const errors: { line: number; issues: string[] }[] = [];
  const rows: ImportRow[] = [];
  records.forEach((r, i) => {
    const p = ImportRow.safeParse(r);
    if (!p.success) errors.push({ line: i + 2, issues: p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`) });
    else if (!p.data.email.endsWith("@" + domain)) errors.push({ line: i + 2, issues: ["email: not a university address"] });
    else rows.push(p.data);
  });
  if (errors.length) fail("VALIDATION_FAILED", { csv_errors: errors.slice(0, 100), error_count: errors.length });
  if (rows.length > 10_000) fail("VALIDATION_FAILED", { reason: "max 10,000 rows per file" });
  return rows;
}

/**
 * Imported students are born active with NO password. Their first login is "forgot password":
 * an OTP to their university inbox sets it. This proves inbox ownership and sends zero bulk mail,
 * which matters under Gmail's ~500/day cap. Idempotent: existing enrolment numbers/emails are skipped.
 */
export const importStudentsJob = defineJob({
  type: "students.import",
  payload: z.object({ rows: z.array(ImportRow), by: z.string() }),
  maxAttempts: 3,
  run: async ({ rows, by }) => {
    const programmes = new Map((await db.programme.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]));
    const report = { created: 0, skipped: [] as { enrolment_no: string; reason: string }[] };
    const actor: Actor = { kind: "user", userId: by, role: "admin" };
    for (const r of rows) {
      const exists = await db.user.findFirst({ where: { OR: [{ email: r.email }, { student: { enrolment_no: r.enrolment_no } }] }, select: { id: true } });
      if (exists) {
        report.skipped.push({ enrolment_no: r.enrolment_no, reason: "already exists" });
        continue;
      }
      await inTx((tx) =>
        userMachine.create(
          tx,
          {
            role: "student",
            email: r.email,
            name: r.name,
            password_hash: "",
            student: {
              create: {
                enrolment_no: r.enrolment_no,
                mobile: r.mobile,
                year_of_completion: r.year_of_completion,
                programme_id: r.programme_code ? programmes.get(r.programme_code) : undefined,
                academic_standing: "good",
              },
            },
          },
          actor,
          { state: "active", meta: { via: "csv_import" } },
        ),
      );
      report.created++;
    }
    return report;
  },
});

export async function queueImport(rows: ImportRow[], adminId: string) {
  return inTx(async (tx) => {
    const job = await enqueue(tx, importStudentsJob, { rows, by: adminId }, { priority: 7 });
    return { job_id: job.id, rows: rows.length };
  });
}

export async function importCsv(adminId: string, file: UploadedFile | null) {
  if (!file) fail("VALIDATION_FAILED", { field: "file" });
  return queueImport(parseImportCsv(await readFile(file.path, "utf8"), await getSetting("student_email_domain")), adminId);
}

// ---------- graduation ----------

/** On the alumni_cutoff date (default 1 July) after their year of completion, students become alumni: same login, read-only. */
export const graduateJob = defineJob({
  type: "students.graduate",
  payload: z.object({}),
  run: async () => {
    const now = new Date();
    const today = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const lastGraduatedYear = today >= (await getSetting("alumni_cutoff")) ? now.getFullYear() : now.getFullYear() - 1;
    const due = await db.user.findMany({
      where: { role: "student", status: "active", student: { year_of_completion: { lte: lastGraduatedYear } } },
      select: { id: true },
    });
    // One transaction per chunk so a full year group stays well inside the interactive-tx timeout.
    // A retry after a partial run re-selects only students still active, so it converges.
    for (let i = 0; i < due.length; i += 200) {
      const ids = due.slice(i, i + 200).map((u) => u.id);
      await inTx((tx) => userMachine.moveMany(tx, ids, "alumni", SYSTEM));
    }
    return { graduated: due.length };
  },
});

/** Called on worker start; the dedupe key makes it run at most once per day. */
export async function scheduleDailyJobs() {
  const day = new Date().toISOString().slice(0, 10);
  await inTx((tx) => enqueue(tx, graduateJob, {}, { dedupeKey: `graduate:${day}` }));
}

/** No dedupe key: an admin pressing "run now" means run again, even after today's daily run. */
export async function graduateNow() {
  await inTx((tx) => enqueue(tx, graduateJob, {}));
  return { ok: true as const };
}
