import { z } from "zod";
import { json, Ts } from "../../http/route.js";

/** Stored as opportunities.eligibility. Parsed through this schema on write AND on read. Every field optional = open to all. */
export const EligibilityRule = z
  .object({
    min_cgpa: z.number().min(0).max(10).optional(),
    programmes: z.array(z.uuid()).min(1).optional(),
    /** Graduating batch (year_of_completion). */
    completion_years: z.array(z.number().int()).min(1).optional(),
    max_age: z.number().int().min(15).max(60).optional(),
    /** 0 = no active backlogs. A student who has not entered their backlogs does not pass. */
    max_active_backlogs: z.number().int().min(0).max(20).optional(),
  })
  .meta({ id: "EligibilityRule" });
export type EligibilityRule = z.infer<typeof EligibilityRule>;


export const SelectionProcess = z.object({
  shortlist_from_resumes: z.boolean().default(false),
  written_test: z.boolean().default(false),
  online_test: z.boolean().default(false),
  group_discussion: z.boolean().default(false),
  technical_interview: z.boolean().default(false),
  hr_interview: z.boolean().default(false),
});

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use YYYY-MM");
export const DriveMode = z.enum(["online", "offline", "hybrid"]);
/** Campus logistics: only students who applied see these. */
export const Logistics = z.object({ venue: z.string().trim().max(300).optional(), logistics: z.string().trim().max(5000).optional() });

export const OpportunityFields = z.object({
  type: z.enum(["job", "internship", "competition"]),
  title: z.string().min(3).max(200),
  job_profile: z.string().max(2000).optional(),
  description: z.string().min(10).max(20000),
  expected_hires: z.number().int().positive().optional(),
  location: z.string().max(200).optional(),
  designation: z.string().max(200).optional(),
  ctc_benefits: z.string().max(2000).optional(),
  bond_details: z.string().max(2000).optional(),
  apply_deadline: z.coerce.date(),
  eligibility: EligibilityRule,
  selection_process: SelectionProcess,
  drive_mode: DriveMode.optional(),
  /** Probable hiring month, or the start of the hiring period. */
  hiring_from: month.optional(),
  hiring_to: month.optional(),
  ...Logistics.shape,
});
const hiringOrder = (o: { hiring_from?: string; hiring_to?: string }) => !o.hiring_to || !o.hiring_from || o.hiring_to >= o.hiring_from;
const hiringMsg = { message: "hiring period ends before it starts", path: ["hiring_to"] };
export const OpportunityBody = OpportunityFields.refine(hiringOrder, hiringMsg);
/** null clears an optional drive detail; omitted keeps it. */
export const OpportunityPatch = OpportunityFields.partial()
  .extend({
    drive_mode: DriveMode.nullable().optional(),
    hiring_from: month.nullable().optional(),
    hiring_to: month.nullable().optional(),
    venue: Logistics.shape.venue.unwrap().nullable().optional(),
    logistics: Logistics.shape.logistics.unwrap().nullable().optional(),
  })
  .refine((o) => hiringOrder({ hiring_from: o.hiring_from ?? undefined, hiring_to: o.hiring_to ?? undefined }), hiringMsg);

export const Status = z.enum(["draft", "pending_admin", "approved", "rejected", "closed"]);
export const Opportunity = OpportunityFields.extend({
  id: z.string(),
  company_id: z.string(),
  status: Status,
  review_note: z.string().nullable(),
  jd_file_id: z.string().nullable(),
  apply_deadline: Ts,
  created_at: Ts,
  eligibility: json(EligibilityRule),
  selection_process: json(SelectionProcess),
  job_profile: z.string().nullable(),
  expected_hires: z.number().nullable(),
  location: z.string().nullable(),
  designation: z.string().nullable(),
  ctc_benefits: z.string().nullable(),
  bond_details: z.string().nullable(),
  drive_mode: DriveMode.nullable(),
  hiring_from: z.string().nullable(),
  hiring_to: z.string().nullable(),
  venue: z.string().nullable(),
  logistics: z.string().nullable(),
}).meta({ id: "Opportunity" });

/** Logistics are left out: a student sees them only on their own application. */
export const ForStudent = Opportunity.omit({ review_note: true, venue: true, logistics: true }).extend({
  company: z.object({ id: z.string(), name: z.string(), website: z.string().nullable() }),
  my_eligibility: z.object({ eligible: z.boolean(), reasons: z.array(z.record(z.string(), z.unknown())) }),
});

export const Moved = z.object({ changed: z.boolean() });

