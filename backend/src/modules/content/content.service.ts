import type { z } from "zod";
import { db, inTx } from "../../infrastructure/db.js";
import { fail } from "../../middleware/errors.js";
import { mail } from "../../infrastructure/mailer.js";
import { inFileTx } from "../../infrastructure/storage.js";
import { paginate, type PageQuery } from "../../http/route.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { UploadedFile } from "../../middleware/upload.js";
import { recruiterCanSeeStudent, recruiterScope } from "../applications/applications.repository.js";
import {
  Questions,
  type CompanyPatch,
  type Contact,
  type FeedbackRequestCreate,
  type FeedbackSubmit,
  type MessageCreate,
  type NoticeCreate,
  type PlacementRecord,
  type ProgrammeCreate,
  type ProgrammePatch,
  type University,
} from "./content.schemas.js";

type Page = z.output<typeof PageQuery>;

const companyOf = (companyId: string) => db.company.findUniqueOrThrow({ where: { id: companyId }, include: { contacts: true } });

export const myCompany = (user: AuthUser<"company">) => companyOf(user.companyId);

export async function updateMyCompany(user: AuthUser<"company">, body: z.output<typeof CompanyPatch>) {
  await db.company.update({ where: { id: user.companyId }, data: body });
  return companyOf(user.companyId);
}

export const addContact = (user: AuthUser<"company">, body: z.output<typeof Contact>) => db.companyContact.create({ data: { ...body, company_id: user.companyId } });

export async function removeContact(user: AuthUser<"company">, id: string) {
  const { count } = await db.companyContact.deleteMany({ where: { id, company_id: user.companyId } });
  if (!count) fail("NOT_FOUND");
  return { ok: true as const };
}

export const listCompanies = (query: Page & { status?: "pending_email_verify" | "pending_admin" | "active" | "rejected" | "alumni" }) =>
  paginate((a) => db.company.findMany({ ...a, where: query.status ? { users: { some: { status: query.status } } } : {}, include: { contacts: true } }), query);

export const getUniversity = () => db.universityProfile.findUnique({ where: { id: 1 } });

export const setUniversity = (body: z.output<typeof University>) => db.universityProfile.upsert({ where: { id: 1 }, create: { id: 1, ...body }, update: body });

export const listProgrammes = () => db.programme.findMany({ orderBy: [{ department: "asc" }, { name: "asc" }] });

export const createProgramme = (body: z.output<typeof ProgrammeCreate>) => db.programme.create({ data: body });

export const updateProgramme = (id: string, body: z.output<typeof ProgrammePatch>) => db.programme.update({ where: { id }, data: body });

export const listPlacementRecords = () => db.placementRecord.findMany({ orderBy: { year: "desc" } }) as never;

export const createPlacementRecord = (body: z.output<typeof PlacementRecord>) => db.placementRecord.create({ data: { year: body.year, data: body.data as object } }) as never;

export const uploadBrochure = (userId: string, recordId: string, file: UploadedFile | null) =>
  inFileTx(async (tx, files) => {
    const r = await tx.placementRecord.findUniqueOrThrow({ where: { id: recordId }, select: { brochure_file_id: true } });
    const f = await files.store(userId, "brochure", file, { replaces: r.brochure_file_id });
    await tx.placementRecord.update({ where: { id: recordId }, data: { brochure_file_id: f.id } });
    return { file_id: f.id };
  });

export function noticeboard(user: AuthUser<"student" | "company" | "admin">, query: Page) {
  const audience = { student: ["students", "all"], company: ["companies", "all"], admin: undefined }[user.role] as ("students" | "companies" | "all")[] | undefined;
  return paginate((a) => db.notice.findMany({ ...a, where: { audience: audience ? { in: audience } : undefined } }), query);
}

export const postNotice = (user: AuthUser<"admin">, body: z.output<typeof NoticeCreate>) =>
  inTx(async (tx) => {
    const n = await tx.notice.create({ data: { audience: body.audience, title: body.title, body: body.body, created_by: user.id } });
    if (body.email) {
      const roles = { students: ["student"], companies: ["company"], all: ["student", "company"] }[body.audience] as ("student" | "company")[];
      const to = await tx.user.findMany({ where: { role: { in: roles }, status: "active" }, select: { email: true } });
      for (const u of to) await mail(tx, { to: u.email, subject: body.title, text: body.body }, { priority: 9, dedupeKey: `notice:${n.id}:${u.email}` });
    }
    return n;
  });

export const myMessages = (user: AuthUser<"company">, query: Page) => paginate((a) => db.message.findMany({ ...a, where: { company_id: user.companyId } }), query);

export const companyMessages = (companyId: string, query: Page) => paginate((a) => db.message.findMany({ ...a, where: { company_id: companyId } }), query);

export const sendMessage = (user: AuthUser<"company" | "admin">, body: z.output<typeof MessageCreate>) =>
  inTx(async (tx) => {
    const companyId = user.role === "company" ? user.companyId! : (body.company_id ?? fail("VALIDATION_FAILED", { field: "company_id" }));
    const company = await tx.company.findUnique({ where: { id: companyId }, include: { users: { where: { status: "active" }, select: { email: true } } } });
    if (!company) fail("NOT_FOUND");
    const m = await tx.message.create({ data: { company_id: companyId, from_user: user.id, subject: body.subject, body: body.body } });
    if (user.role === "admin") for (const u of company.users) await mail(tx, { to: u.email, subject: `T&P Cell: ${body.subject}`, text: body.body });
    return m;
  });

export const requestFeedback = (opportunityId: string, body: z.output<typeof FeedbackRequestCreate>) =>
  inTx(async (tx) => {
    const o = await tx.opportunity.findUnique({ where: { id: opportunityId }, include: { company: { include: { users: { select: { email: true } } } } } });
    if (!o) fail("NOT_FOUND");
    const r = await tx.feedbackRequest.create({ data: { opportunity_id: o.id, questions: body.questions } });
    for (const u of o.company.users) await mail(tx, { to: u.email, subject: `Feedback requested: ${o.title}`, text: "Please fill the feedback form in your recruiter portal." });
    return { id: r.id };
  });

export const myFeedbackForms = async (user: AuthUser<"company">) =>
  (await db.feedbackRequest.findMany({ where: { opportunity: { company_id: user.companyId } }, include: { submissions: { where: { user_id: user.id }, select: { id: true } } }, orderBy: { id: "desc" } }))
    .map((r) => ({ ...r, questions: Questions.parse(r.questions), submitted: r.submissions.length > 0 }));

export async function submitFeedback(user: AuthUser<"company">, requestId: string, body: z.output<typeof FeedbackSubmit>) {
  const r = await db.feedbackRequest.findFirst({ where: { id: requestId, opportunity: { company_id: user.companyId } } });
  if (!r) fail("NOT_FOUND");
  await db.feedbackSubmission.create({ data: { request_id: r.id, user_id: user.id, answers: body.answers } });
  return { ok: true as const };
}

export const feedbackSubmissions = (requestId: string) => db.feedbackSubmission.findMany({ where: { request_id: requestId } });

export async function downloadFile(user: AuthUser<"admin" | "student" | "company">, fileId: string) {
  const f = await db.file.findUnique({ where: { id: fileId } });
  if (!f) fail("NOT_FOUND");
  const allowed =
    user.role === "admin" ||
    f.owner_user_id === user.id ||
    f.kind === "brochure" ||
    (f.kind === "jd" && (user.role === "student" || (await db.opportunity.count({ where: { jd_file_id: f.id, company_id: user.companyId! } })) > 0)) ||
    (user.role === "company" && (f.kind === "resume" || f.kind === "photo") && (await recruiterCanSeeStudent(recruiterScope(user as never), f.owner_user_id)));
  if (!allowed) fail("NOT_FOUND");
  return f;
}
