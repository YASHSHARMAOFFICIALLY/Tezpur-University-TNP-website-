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

export const OpportunityBody = z.object({
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
});

export const Status = z.enum(["draft", "pending_admin", "approved", "rejected", "closed"]);
export const Opportunity = OpportunityBody.extend({
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
}).meta({ id: "Opportunity" });

export const ForStudent = Opportunity.omit({ review_note: true }).extend({
  company: z.object({ id: z.string(), name: z.string(), website: z.string().nullable() }),
  my_eligibility: z.object({ eligible: z.boolean(), reasons: z.array(z.record(z.string(), z.unknown())) }),
});

export const Moved = z.object({ changed: z.boolean() });

