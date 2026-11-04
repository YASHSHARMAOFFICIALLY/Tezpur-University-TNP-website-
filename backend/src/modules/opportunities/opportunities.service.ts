import { createHash } from "node:crypto";
import { db, defineMachine, inTx, type Actor, type Tx } from "../../infrastructure/db.js";
import { fail } from "../../middleware/errors.js";
import { inFileTx } from "../../infrastructure/storage.js";
import { mail } from "../../infrastructure/mailer.js";
import { paginate } from "../../http/route.js";
import type { UploadedFile } from "../../middleware/upload.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { factsOf, type EligibilityFacts } from "../students/students.service.js";
import { EligibilityRule } from "./opportunities.schemas.js";
import { findOwn, openWhere, own } from "./opportunities.repository.js";

export const listForCompany = (companyId: string) => (args: object) => db.opportunity.findMany({ ...args, where: own(companyId) });

/** rejected is final; "return" sends a posting back to draft with a review note so the recruiter can fix it. */
export const opportunityMachine = defineMachine({
  delegate: "opportunity",
  entity: "opportunity",
  entry: ["draft"],
  transitions: {
    draft: ["pending_admin"],
    pending_admin: ["approved", "rejected", "draft"],
    approved: ["closed"],
    rejected: [],
    closed: [],
  },
});

export type OpportunityInput = Omit<Prisma.OpportunityUncheckedCreateInput, "id" | "company_id" | "status" | "posted_by" | "review_note" | "created_at" | "jd_file_id"> & {
  eligibility: EligibilityRule;
};

export type EligibilityReason =
  | { rule: "min_cgpa"; required: number; actual: number | null }
  | { rule: "programmes"; actual: string | null }
  | { rule: "completion_years"; required: number[]; actual: number | null }
  | { rule: "max_age"; required: number; actual: number | null };

export type EligibilityResult = { eligible: boolean; reasons: EligibilityReason[]; checked_at: string };

/** Full years old on `at`. */
export function ageOn(dob: Date, at: Date): number {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = at.getUTCMonth() < dob.getUTCMonth() || (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

/**
 * Pure. Returns EVERY failing rule (not just the first) so the student sees all reasons at once.
 * A missing fact fails the rule that needs it: unknown CGPA is not >= 7. Age is measured on the
 * day of applying. Probation is not checked here; loadParticipant blocks it earlier with ON_PROBATION.
 */
export function checkEligibility(f: EligibilityFacts, rule: EligibilityRule, now: Date): EligibilityResult {
  const reasons: EligibilityReason[] = [];
  if (rule.min_cgpa !== undefined && (f.cgpa === null || f.cgpa < rule.min_cgpa))
    reasons.push({ rule: "min_cgpa", required: rule.min_cgpa, actual: f.cgpa });
  if (rule.programmes && (!f.programme_id || !rule.programmes.includes(f.programme_id)))
    reasons.push({ rule: "programmes", actual: f.programme_id });
  if (rule.completion_years && (f.year_of_completion === null || !rule.completion_years.includes(f.year_of_completion)))
    reasons.push({ rule: "completion_years", required: rule.completion_years, actual: f.year_of_completion });
  if (rule.max_age !== undefined) {
    const age = f.dob ? ageOn(f.dob, now) : null;
    if (age === null || age > rule.max_age) reasons.push({ rule: "max_age", required: rule.max_age, actual: age });
  }
  return { eligible: reasons.length === 0, reasons, checked_at: now.toISOString() };
}

export async function createDraft(companyId: string, userId: string, input: OpportunityInput, actor: Actor) {
  return inTx(async (tx) => {
    const { id } = await opportunityMachine.create(tx, { ...input, company_id: companyId, posted_by: userId }, actor);
    return tx.opportunity.findUniqueOrThrow({ where: { id } });
  });
}

export async function updateDraft(companyId: string, id: string, input: Partial<OpportunityInput>) {
  return inTx(async (tx) => {
    const o = await findOwn(tx, companyId, id);
    if (!o) fail("NOT_FOUND");
    if (o.status !== "draft") fail("INVALID_TRANSITION", { reason: "only drafts can be edited", status: o.status });
    return tx.opportunity.update({ where: { id }, data: input });
  });
}

/** Logistics change after approval too (venue is often fixed late). Applicants still in the running are mailed. */
export async function setLogistics(companyId: string, id: string, body: { venue?: string; logistics?: string }) {
  return inTx(async (tx) => {
    const o = await findOwn(tx, companyId, id);
    if (!o) fail("NOT_FOUND");
    const updated = await tx.opportunity.update({ where: { id }, data: { venue: body.venue ?? null, logistics: body.logistics ?? null } });
    const apps = await tx.application.findMany({ where: { opportunity_id: id, status: { not: "rejected" } }, include: { student: { include: { user: { select: { email: true } } } } } });
    const text = `Venue: ${updated.venue ?? "to be announced"}\n${updated.logistics ?? ""}`.trim();
    for (const a of apps) await mail(tx, { to: a.student.user.email, subject: `Campus logistics: ${o.title}`, text }, { dedupeKey: `logistics:${id}:${a.id}:${createHash("sha1").update(text).digest("hex")}` });
    return updated;
  });
}

export async function attachJd(companyId: string, id: string, userId: string, file: UploadedFile | null) {
  return inFileTx(async (tx, files) => {
    const o = await findOwn(tx, companyId, id);
    if (!o) fail("NOT_FOUND");
    const f = await files.store(userId, "jd", file, { replaces: o.jd_file_id });
    await tx.opportunity.update({ where: { id }, data: { jd_file_id: f.id } });
    return { file_id: f.id };
  });
}

/**
 * A posting can only go to the T&P cell, or live, while students still have time to apply.
 * Checks only a real move: a no-op, a disallowed move or another company's posting falls through to move()'s own answer.
 */
export async function deadlineAhead(tx: Tx, id: string, to: "pending_admin" | "approved", where: Prisma.OpportunityWhereInput = {}) {
  const o = await tx.opportunity.findFirst({ where: { ...where, id }, select: { apply_deadline: true, status: true } });
  if (o && opportunityMachine.transitions[o.status].includes(to) && o.apply_deadline <= new Date())
    fail("VALIDATION_FAILED", { field: "apply_deadline", apply_deadline: o.apply_deadline }, "The apply deadline has already passed. Set a later date.");
}

export async function recruiterMove(companyId: string, id: string, to: "pending_admin" | "closed", actor: Actor) {
  return inTx(async (tx) => {
    if (to === "pending_admin") await deadlineAhead(tx, id, to, own(companyId));
    return opportunityMachine.move(tx, id, to, actor, { where: own(companyId) });
  });
}

const COMPANY = { company: { select: { id: true, name: true, website: true } } } as const;

export async function listOpenForStudent(userId: string, query: { cursor?: string; limit: number; type?: "job" | "internship" | "competition"; eligible_only: boolean }) {
  const facts = factsOf(await db.student.findUniqueOrThrow({ where: { user_id: userId } }));
  const now = new Date();
  const page = await paginate((a) => db.opportunity.findMany({ ...a, where: { ...openWhere(now), type: query.type }, include: COMPANY }), query);
  const data = page.data.map((o) => ({ ...o, my_eligibility: checkEligibility(facts, ruleOf(o), now) }));
  // ponytail: eligible_only filters within the page, so a page can come back short; fine at this scale.
  return { ...page, data: query.eligible_only ? data.filter((o) => o.my_eligibility.eligible) : data };
}

export async function getForStudent(userId: string, id: string) {
  const o = await db.opportunity.findFirst({ where: { id, status: { in: ["approved", "closed"] } }, include: COMPANY });
  if (!o) fail("NOT_FOUND");
  const facts = factsOf(await db.student.findUniqueOrThrow({ where: { user_id: userId } }));
  return { ...o, my_eligibility: checkEligibility(facts, ruleOf(o), new Date()) };
}

/** Read-time parse: a malformed rule in the DB is a bug and fails loudly, never "open to all". */
export function ruleOf(o: { eligibility: Prisma.JsonValue }): EligibilityRule {
  return EligibilityRule.parse(o.eligibility);
}

export async function getOpenForApply(tx: Tx, id: string, now: Date) {
  const o = await tx.opportunity.findUnique({ where: { id } });
  if (!o || o.status === "draft" || o.status === "pending_admin" || o.status === "rejected") fail("NOT_FOUND");
  if (o.status !== "approved" || o.apply_deadline <= now) fail("OPPORTUNITY_NOT_OPEN", { status: o.status, apply_deadline: o.apply_deadline });
  return { ...o, rule: ruleOf(o) };
}
