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
import { IMPORT_FIELDS, ImportRow, type FeedbackBody, type RecordBody } from "./students.schemas.js";
import { mail } from "../../infrastructure/mailer.js";
import { audit } from "../../infrastructure/db.js";

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

/** Order is contract: ON_PROBATION first, then PLACED and PROFILE_INCOMPLETE (apply only). */
export async function loadParticipant(tx: Tx, userId: string, purpose: "apply" | "event"): Promise<Participant> {
  const s = await tx.student.findUnique({ where: { user_id: userId } });
  if (!s) fail("FORBIDDEN");
  if (s.academic_standing === "probation") fail("ON_PROBATION");
  if (purpose === "apply") {
    const placed = await selectionsSince(tx, s.id, s.apply_unlocked_at);
    if (placed.length) fail("PLACED", { selections: placed });
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
    const report = { created: 0, updated: 0, skipped: [] as { enrolment_no: string; reason: string }[] };
    const actor: Actor = { kind: "user", userId: by, role: "admin" };
    for (const r of rows) {
      const fields = Object.fromEntries(IMPORT_FIELDS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
      if (r.programme_code) {
        if (!programmes.has(r.programme_code)) {
          report.skipped.push({ enrolment_no: r.enrolment_no, reason: `unknown programme_code ${r.programme_code}` });
          continue;
        }
        fields.programme_id = programmes.get(r.programme_code);
      }
      const exists = await db.user.findFirst({ where: { OR: [{ email: r.email }, { student: { enrolment_no: r.enrolment_no } }] }, include: { student: { select: { enrolment_no: true } } } });
      if (exists) {
        // Re-importing the roster fills in / corrects profile fields of the same student. A clash is reported, never merged.
        if (exists.email !== r.email || exists.student?.enrolment_no !== r.enrolment_no) {
          report.skipped.push({ enrolment_no: r.enrolment_no, reason: "email and enrolment number belong to different accounts" });
          continue;
        }
        await inTx(async (tx) => {
          await tx.user.update({ where: { id: exists.id }, data: { name: r.name } });
          await tx.student.update({ where: { user_id: exists.id }, data: fields });
          await audit(tx, actor, "student.updated_by_import", "student", exists.id, { fields: Object.keys(fields) });
        });
        report.updated++;
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
              create: { ...fields, enrolment_no: r.enrolment_no, academic_standing: "good" },
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

// ---------- placement lock and appeal ----------

/** Selections published after the last granted appeal. Any one of them means "placed". */
export async function selectionsSince(tx: Tx, studentId: string, unlockedAt: Date | null) {
  const rows = await tx.application.findMany({
    where: { student_id: studentId, status: "selected", opportunity: { result: { published_at: unlockedAt ? { gt: unlockedAt } : { not: null } } } },
    include: { opportunity: { include: { company: { select: { name: true } }, result: { select: { published_at: true } } } } },
  });
  return rows.map((a) => ({ opportunity_id: a.opportunity_id, title: a.opportunity.title, company: a.opportunity.company.name, published_at: a.opportunity.result!.published_at! }));
}

export async function placement(userId: string) {
  const s = await db.student.findUniqueOrThrow({ where: { user_id: userId } });
  const selections = await selectionsSince(db, s.id, s.apply_unlocked_at);
  return {
    placed: selections.length > 0,
    selections,
    apply_unlocked_at: s.apply_unlocked_at,
    appeal: s.appeal_reason && s.appeal_at ? { reason: s.appeal_reason, at: s.appeal_at } : null,
    appeal_note: s.appeal_note,
  };
}

export async function fileAppeal(userId: string, reason: string) {
  const s = await db.student.findUniqueOrThrow({ where: { user_id: userId } });
  if (!(await selectionsSince(db, s.id, s.apply_unlocked_at)).length) fail("INVALID_TRANSITION", { reason: "you are not placed, so there is nothing to appeal" });
  await db.student.update({ where: { id: s.id }, data: { appeal_reason: reason, appeal_at: new Date(), appeal_note: null } });
  return placement(userId);
}

export async function listAppeals() {
  const rows = await db.student.findMany({ where: { appeal_at: { not: null } }, include: { user: { select: { name: true } } }, orderBy: { appeal_at: "asc" }, take: 200 });
  return Promise.all(
    rows.map(async (s) => ({ student_id: s.id, name: s.user.name, enrolment_no: s.enrolment_no, reason: s.appeal_reason ?? "", at: s.appeal_at!, selections: await selectionsSince(db, s.id, s.apply_unlocked_at) })),
  );
}

/** Grant reopens applying for every selection published so far; a later selection locks again. Idempotent per pending appeal. */
export const decideAppeal = (studentId: string, grant: boolean, note: string | undefined, actor: Actor) =>
  inTx(async (tx) => {
    const s = await tx.student.findUnique({ where: { id: studentId }, include: { user: { select: { email: true } } } });
    if (!s) fail("NOT_FOUND");
    if (!s.appeal_at) return { changed: false };
    await tx.student.update({
      where: { id: s.id },
      data: { appeal_reason: null, appeal_at: null, appeal_note: note ?? null, ...(grant ? { apply_unlocked_at: new Date() } : {}) },
    });
    await audit(tx, actor, grant ? "student.appeal_granted" : "student.appeal_rejected", "student", s.id, { note });
    await mail(tx, {
      to: s.user.email,
      subject: grant ? "Your appeal is granted: you may apply again" : "Your appeal was not granted",
      text: grant ? `You can apply to open postings again.${note ? `\nNote: ${note}` : ""}` : `Note from the T&P cell: ${note ?? "no reason given"}`,
    });
    return { changed: true };
  });

// ---------- certificates, internships, projects ----------

const studentIdOf = async (userId: string) => (await db.student.findUniqueOrThrow({ where: { user_id: userId }, select: { id: true } })).id;

export const listRecords = async (userId: string) => db.studentRecord.findMany({ where: { student_id: await studentIdOf(userId) }, orderBy: { id: "desc" } });

export const recordsOf = (studentId: string) => db.studentRecord.findMany({ where: { student_id: studentId }, orderBy: { id: "desc" } });

export const addRecord = async (userId: string, body: z.output<typeof RecordBody>) => db.studentRecord.create({ data: { ...body, student_id: await studentIdOf(userId) } });

// ponytail: the attached file's bytes stay on disk after a record is deleted; add a sweep if storage ever matters.
export async function deleteRecord(userId: string, id: string) {
  const { count } = await db.studentRecord.deleteMany({ where: { id, student_id: await studentIdOf(userId) } });
  if (!count) fail("NOT_FOUND");
  return { ok: true as const };
}

export const attachRecordFile = (userId: string, id: string, file: UploadedFile | null) =>
  inFileTx(async (tx, files) => {
    const r = await tx.studentRecord.findFirst({ where: { id, student: { user_id: userId } }, select: { file_id: true } });
    if (!r) fail("NOT_FOUND");
    const f = await files.store(userId, "record", file, { replaces: r.file_id });
    await tx.studentRecord.update({ where: { id }, data: { file_id: f.id } });
    return { file_id: f.id };
  });

// ---------- student feedback on trainings and recruiters ----------

/** Re-sending replaces the earlier rating, so the call is idempotent. */
export async function giveFeedback(userId: string, body: z.output<typeof FeedbackBody>) {
  const studentId = await studentIdOf(userId);
  const tookPart =
    body.target === "event"
      ? await db.eventRegistration.count({ where: { event_id: body.target_id, student_id: studentId, status: { not: "cancelled" } } })
      : await db.application.count({ where: { opportunity_id: body.target_id, student_id: studentId } });
  if (!tookPart) fail("NOT_PARTICIPANT");
  const key = { student_id_target_target_id: { student_id: studentId, target: body.target, target_id: body.target_id } };
  const data = { rating: body.rating, comment: body.comment ?? null };
  return db.studentFeedback.upsert({ where: key, create: { student_id: studentId, target: body.target, target_id: body.target_id, ...data }, update: data });
}

export const myFeedback = async (userId: string) => db.studentFeedback.findMany({ where: { student_id: await studentIdOf(userId) } });

export async function allFeedback(target?: "event" | "opportunity") {
  const rows = await db.studentFeedback.findMany({ where: { target }, include: { student: { select: { enrolment_no: true, user: { select: { name: true } } } } }, orderBy: { id: "desc" }, take: 1000 });
  const ids = (t: "event" | "opportunity") => rows.filter((r) => r.target === t).map((r) => r.target_id);
  const [events, opps] = await Promise.all([
    db.event.findMany({ where: { id: { in: ids("event") } }, select: { id: true, name: true } }),
    db.opportunity.findMany({ where: { id: { in: ids("opportunity") } }, select: { id: true, title: true, company: { select: { name: true } } } }),
  ]);
  const names = new Map<string, string>([...events.map((e) => [e.id, e.name] as const), ...opps.map((o) => [o.id, `${o.company.name}: ${o.title}`] as const)]);
  return rows.map((r) => ({ ...r, target_name: names.get(r.target_id) ?? "(deleted)", student: { name: r.student.user.name, enrolment_no: r.student.enrolment_no } }));
}
