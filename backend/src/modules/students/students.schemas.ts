import { z } from "zod";
import { Ts } from "../../http/route.js";

const s = (max = 300) => z.string().max(max);
/** The ONE list of student-editable profile fields: PATCH body and profile response both derive from it. */
export const Editable = z.object({
  name: s(200),
  mobile: s(20),
  dob: z.coerce.date(),
  gender: s(30),
  category: s(30),
  minority: z.boolean(),
  specially_abled: z.boolean(),
  regional_diversity: s(100),
  jee_rank: z.number().int().positive(),
  jee_score: z.number(),
  jee_percentile: z.number().min(0).max(100),
  gate_qualified: z.boolean(),
  gate_score: z.number(),
  programme_id: z.uuid(),
  department: s(200),
  year_of_admission: z.number().int().min(1990).max(2100),
  year_of_completion: z.number().int().min(1990).max(2100),
  cgpa: z.number().min(0).max(10),
  current_address: s(500),
  permanent_address: s(500),
  marks_10: z.number().min(0).max(100), yop_10: z.number().int(),
  marks_12: z.number().min(0).max(100), yop_12: z.number().int(),
  marks_ug: z.number().min(0).max(100), yop_ug: z.number().int(),
  marks_pg: z.number().min(0).max(100), yop_pg: z.number().int(),
  other_courses: s(2000),
  professional_interests: s(2000),
  certifications: s(2000),
  portfolio_url: z.url(),
  linkedin_url: z.url(),
});

export const nullable = <T extends z.ZodRawShape>(o: z.ZodObject<T>) =>
  z.object(Object.fromEntries(Object.entries(o.shape).map(([k, v]) => [k, (v as z.ZodType).nullable()])) as unknown as { [K in keyof T]: z.ZodNullable<T[K]> });

export const StudentProfile = nullable(Editable.omit({ name: true, dob: true }))
  .extend({
    id: z.string(),
    enrolment_no: z.string(),
    dob: Ts.nullable(),
    resume_file_id: z.string().nullable(),
    photo_file_id: z.string().nullable(),
    academic_standing: z.enum(["good", "probation"]),
    user: z.object({ name: z.string(), email: z.string(), status: z.string() }),
  })
  .meta({ id: "StudentProfile" });

/** Admin may also correct enrolment_no; students may not. */
export const AdminStudentPatch = Editable.partial().extend({ enrolment_no: z.string().regex(/^[A-Za-z]{3}\d{5,6}$/) }).partial();

export const StudentPatch = Editable.partial();
export const FileIdResponse = z.object({ file_id: z.string() });
export const ProbationBody = z.object({ on: z.boolean(), reason: z.string().max(500).optional() });
export const ProbationResponse = z.object({ changed: z.boolean() });
export const ImportResponse = z.object({ job_id: z.string(), rows: z.number() });

/** A blank CSV cell is an absent value, not "" (or 0 once coerced). */
const cell = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

/** CSV text to the field's type: numbers parse, booleans accept yes/no/true/false/1/0, text is trimmed. */
const csv = (t: z.ZodType) =>
  cell(
    z.preprocess((v) => {
      if (typeof v !== "string") return v;
      if (t instanceof z.ZodNumber) return Number(v.trim());
      if (t instanceof z.ZodBoolean) return /^(1|y|yes|true)$/i.test(v.trim()) ? true : /^(0|n|no|false)$/i.test(v.trim()) ? false : v;
      return v.trim();
    }, t),
  );

/** Every profile field except name/programme_id (programme comes by code) is an optional column. */
export const IMPORT_FIELDS = Object.keys(Editable.omit({ name: true, programme_id: true }).shape) as (keyof Omit<z.infer<typeof Editable>, "name" | "programme_id">)[];
// The cast only restates the output type: each column parses to its Editable field's type, or undefined.
const importCells = Object.fromEntries(IMPORT_FIELDS.map((k) => [k, csv(Editable.shape[k])])) as unknown as {
  [K in (typeof IMPORT_FIELDS)[number]]: z.ZodOptional<(typeof Editable.shape)[K]>;
};

/** Field rules come from Editable, so an imported row always fits the StudentProfile response. */
export const ImportRow = z.object({
  enrolment_no: z.string().trim().toUpperCase().regex(/^[A-Z]{3}\d{5,6}$/),
  name: Editable.shape.name.trim().min(2),
  email: z.email().trim().toLowerCase(),
  programme_code: cell(z.string().trim()),
  ...importCells,
});
export type ImportRow = z.infer<typeof ImportRow>;
export const ImportReport = z.object({ created: z.number(), updated: z.number(), skipped: z.array(z.object({ enrolment_no: z.string(), reason: z.string() })) });

// ---------- records, feedback, placement ----------

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM");
export const RecordKind = z.enum(["certificate", "internship", "project"]);
export const RecordBody = z.object({
  kind: RecordKind,
  title: z.string().trim().min(2).max(200),
  organisation: s(200).optional(),
  description: s(2000).optional(),
  start_month: month.optional(),
  end_month: month.optional(),
  url: z.url().max(500).optional(),
});
export const RecordOut = z
  .object({
    id: z.string(), kind: RecordKind, title: z.string(), organisation: z.string().nullable(), description: z.string().nullable(),
    start_month: z.string().nullable(), end_month: z.string().nullable(), url: z.string().nullable(), file_id: z.string().nullable(), created_at: Ts,
  })
  .meta({ id: "StudentRecord" });

export const FeedbackTarget = z.enum(["event", "opportunity"]);
export const FeedbackBody = z.object({ target: FeedbackTarget, target_id: z.uuid(), rating: z.number().int().min(1).max(5), comment: s(2000).optional() });
export const FeedbackOut = z.object({ id: z.string(), target: FeedbackTarget, target_id: z.string(), rating: z.number(), comment: z.string().nullable(), created_at: Ts });
export const AdminFeedback = FeedbackOut.extend({ target_name: z.string(), student: z.object({ name: z.string(), enrolment_no: z.string() }) });

const Selection = z.object({ opportunity_id: z.string(), title: z.string(), company: z.string(), published_at: Ts });
/** placed = a published selection after the last granted appeal. Apply is refused while placed. */
export const Placement = z.object({
  placed: z.boolean(),
  selections: z.array(Selection),
  apply_unlocked_at: Ts.nullable(),
  appeal: z.object({ reason: z.string(), at: Ts }).nullable(),
  appeal_note: z.string().nullable(),
});
export const AppealBody = z.object({ reason: z.string().trim().min(10).max(2000) });
export const AppealDecision = z.object({ grant: z.boolean(), note: z.string().trim().max(1000).optional() });
export const Appeal = z.object({ student_id: z.string(), name: z.string(), enrolment_no: z.string(), reason: z.string(), at: Ts, selections: z.array(Selection) });
