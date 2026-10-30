import { z } from "zod";
import { Ts } from "../../http/route.js";
import { StudentProfile } from "../students/students.schemas.js";

export const Status = z.enum(["applied", "released_to_recruiter", "shortlisted", "rejected", "selected"]);
export const Interview = z.object({ id: z.string(), round: z.string(), at: Ts, venue_or_link: z.string() });
export const Ids = z.object({ application_ids: z.array(z.uuid()).min(1).max(1000) });

export const Mine = z.object({
  id: z.string(),
  status: Status,
  created_at: Ts,
  eligibility_result: z.unknown(),
  opportunity: z.object({ id: z.string(), title: z.string(), type: z.string(), company: z.object({ name: z.string() }) }),
  interviews: z.array(Interview),
});

export const Applicant = z.object({
  id: z.string(),
  status: Status,
  created_at: Ts,
  student: StudentProfile.omit({ academic_standing: true }),
  interviews: z.array(Interview),
}).meta({ id: "Applicant" });

/** Recruiters never see `applied` (pre-release) rows, so their enum omits it. */
export const RecruiterApplicant = Applicant.extend({ status: Status.exclude(["applied"]) });


export const AdminApplication = Applicant.extend({ eligibility_result: z.unknown(), student: StudentProfile });
