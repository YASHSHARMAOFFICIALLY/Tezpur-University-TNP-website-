import { z } from "zod";
import { Ts } from "../../http/route.js";
import { Opportunity } from "../opportunities/opportunities.schemas.js";

/** One decision vocabulary for every approvable thing. `return` = send back for correction with a reason. */
export const Decision = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({ decision: z.literal("reject"), reason: z.string().min(3).max(1000) }),
  z.object({ decision: z.literal("return"), reason: z.string().min(3).max(1000) }),
]);
export type Decision = z.infer<typeof Decision>;

/** What the admin checks before approving a student account. */
const PendingStudent = z.object({
  enrolment_no: z.string(), department: z.string().nullable(), cgpa: z.number().nullable(), programme_id: z.string().nullable(),
  programme: z.object({ name: z.string(), department: z.string() }).nullable(), resume_file_id: z.string().nullable(), photo_file_id: z.string().nullable(),
});

export const Pending = z.object({
  students: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), created_at: Ts, student: PendingStudent.nullable() })),
  recruiters: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), created_at: Ts, review_note: z.string().nullable(), company: z.object({ id: z.string(), name: z.string(), website: z.string().nullable(), category: z.string() }).nullable() })),
  opportunities: z.array(Opportunity.extend({ company: z.object({ name: z.string() }) })),
});

export const Teacher = z.object({ id: z.string(), email: z.string(), name: z.string() });

export const Job = z.object({ id: z.string(), type: z.string(), status: z.string(), attempts: z.number(), last_error: z.string().nullable(), result: z.unknown(), created_at: Ts, finished_at: Ts.nullable() });
export const EmailQueue = z.object({ queued: z.number(), sent_24h: z.number(), failed: z.number() });
export const AuditEntry = z.object({ id: z.string(), actor_kind: z.string(), actor_user_id: z.string().nullable(), action: z.string(), entity: z.string(), entity_id: z.string(), metadata: z.unknown(), created_at: Ts, actor_name: z.string().nullable(), entity_name: z.string().nullable() });
export const PlacementReport = z.array(z.object({ year: z.number().nullable(), students: z.number(), applied: z.number(), selected: z.number() }));
export const EventReport = z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), registered: z.number(), attended: z.number() }));
