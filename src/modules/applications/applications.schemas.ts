import { z } from "zod";
import { Ts } from "../../http/route.js";
import { RecordOut, StudentProfile } from "../students/students.schemas.js";

export const Status = z.enum(["applied", "released_to_recruiter", "shortlisted", "rejected", "selected"]);
export const Interview = z.object({ id: z.string(), round: z.string(), at: Ts, venue_or_link: z.string() });
export const Ids = z.object({ application_ids: z.array(z.uuid()).min(1).max(1000) });

export const Mine = z.object({
  id: z.string(),
  status: Status,
  created_at: Ts,
  eligibility_result: z.unknown(),
  /** venue/logistics are visible here because this student applied. */
  opportunity: z.object({
    id: z.string(), title: z.string(), type: z.string(), company: z.object({ id: z.string(), name: z.string() }),
    drive_mode: z.enum(["online", "offline", "hybrid"]).nullable(), hiring_from: z.string().nullable(), hiring_to: z.string().nullable(),
    venue: z.string().nullable(), logistics: z.string().nullable(), jd_file_id: z.string().nullable(),
  }),
  interviews: z.array(Interview),
});

export const Applicant = z.object({
  id: z.string(),
  status: Status,
  created_at: Ts,
  student: StudentProfile.omit({ academic_standing: true }).extend({ records: z.array(RecordOut) }),
  interviews: z.array(Interview),
}).meta({ id: "Applicant" });

/** Recruiters never see `applied` (pre-release) rows, so their enum omits it. */
export const RecruiterApplicant = Applicant.extend({ status: Status.exclude(["applied"]) });


export const AdminApplication = Applicant.extend({ eligibility_result: z.unknown(), student: StudentProfile.extend({ records: z.array(RecordOut) }) });
