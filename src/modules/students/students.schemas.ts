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

/** Field rules come from Editable, so an imported row always fits the StudentProfile response. */
export const ImportRow = z.object({
  enrolment_no: z.string().trim().toUpperCase().regex(/^[A-Z]{3}\d{5,6}$/),
  name: Editable.shape.name.trim().min(2),
  email: z.email().trim().toLowerCase(),
  programme_code: cell(z.string().trim()),
  year_of_completion: cell(z.coerce.number().pipe(Editable.shape.year_of_completion)),
  mobile: cell(Editable.shape.mobile.trim()),
});
export type ImportRow = z.infer<typeof ImportRow>;
