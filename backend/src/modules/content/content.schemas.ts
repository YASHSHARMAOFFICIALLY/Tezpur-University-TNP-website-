import { z } from "zod";
import { Ts } from "../../http/route.js";

export const Category = z.enum(["private", "mnc", "govt", "ngo", "psu", "startup", "other"]);
export const Contact = z.object({ name: z.string().min(2).max(200), designation: z.string().max(100).optional(), phone: z.string().max(20).optional(), mobile: z.string().max(20).optional(), email: z.email().optional() });
export const ContactOut = z.object({ id: z.string(), name: z.string(), designation: z.string().nullable(), phone: z.string().nullable(), mobile: z.string().nullable(), email: z.string().nullable() });
export const Company = z
  .object({ id: z.string(), name: z.string(), postal_address: z.string().nullable(), website: z.string().nullable(), category: Category, sector: z.string().nullable(), contacts: z.array(ContactOut) })
  .meta({ id: "Company" });
export const CompanyPatch = z.object({ name: z.string().min(2).max(200), postal_address: z.string().max(500), website: z.url(), category: Category, sector: z.string().max(100) }).partial();

export const University = z.object({
  name: z.string().max(200),
  address: z.string().max(500).nullable(),
  website: z.string().nullable(),
  est_year: z.number().int().nullable(),
  ranking: z.string().max(500).nullable(),
  achievements: z.string().max(10000).nullable(),
  contact_emails: z.array(z.email()),
  admin_mobiles: z.array(z.string().max(20)),
});
export const Programme = z.object({ department: z.string().max(200), name: z.string().max(200), code: z.string().max(30), year: z.number().int().nullable(), student_count: z.number().int().nullable() });
export const ProgrammeOut = Programme.extend({ id: z.string() });
export const ProgrammeList = z.array(ProgrammeOut);
export const ProgrammeCreate = Programme.partial({ year: true, student_count: true });
export const ProgrammePatch = Programme.partial();
export const PlacementRecord = z.object({ year: z.number().int(), data: z.record(z.string(), z.unknown()) });
export const PlacementRecordList = z.array(PlacementRecord.extend({ id: z.string(), brochure_file_id: z.string().nullable() }));
export const PlacementRecordOut = PlacementRecord.extend({ id: z.string() });
export const BrochureUploaded = z.object({ file_id: z.string() });

export const Audience = z.enum(["students", "companies", "all"]);
export const Notice = z.object({ id: z.string(), audience: Audience, title: z.string(), body: z.string(), published_at: Ts }).meta({ id: "Notice" });
export const NoticeCreate = z.object({ audience: Audience, title: z.string().min(3).max(200), body: z.string().min(1).max(20000), email: z.boolean().default(false) });
export const Message = z.object({ id: z.string(), company_id: z.string(), from_user: z.string(), subject: z.string(), body: z.string(), read_at: Ts.nullable(), created_at: Ts });
export const MessageCreate = z.object({ company_id: z.uuid().optional(), subject: z.string().min(1).max(200), body: z.string().min(1).max(20000) });

export const Questions = z.array(z.object({ id: z.string().max(50), label: z.string().max(500), kind: z.enum(["text", "rating", "yes_no"]) })).min(1).max(50);
export const FeedbackRequestCreate = z.object({ questions: Questions });
export const FeedbackRequestCreated = z.object({ id: z.string() });
export const FeedbackForms = z.array(z.object({ id: z.string(), opportunity_id: z.string(), questions: Questions, created_at: Ts, submitted: z.boolean() }));
export const FeedbackSubmit = z.object({ answers: z.record(z.string(), z.union([z.string().max(5000), z.number(), z.boolean()])) });
export const FeedbackSubmissions = z.array(z.object({ id: z.string(), user_id: z.string(), answers: z.unknown(), created_at: Ts }));
