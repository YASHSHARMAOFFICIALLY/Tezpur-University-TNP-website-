import { db, inTx, isUniqueViolation, type Actor, type Tx } from "../../infrastructure/db.js";
import type { AuthUser } from "../../middleware/auth.js";
import { fail } from "../../middleware/errors.js";
import { mail } from "../../infrastructure/mailer.js";
import { checkEligibility, getOpenForApply, opportunityMachine } from "../opportunities/opportunities.service.js";
import { findOwn } from "../opportunities/opportunities.repository.js";
import { loadParticipant } from "../students/students.service.js";
import { applicationMachine, countShortlisted, findShortlisted, listForRecruiter, recruiterMoveWhere, recruiterScope, STUDENT_USER, type AppStatus } from "./applications.repository.js";

// ---------- student ----------

/** Order of checks is contract: ON_PROBATION, PROFILE_INCOMPLETE, NOT_FOUND/OPPORTUNITY_NOT_OPEN, NOT_ELIGIBLE, ALREADY_APPLIED. */
export async function apply(userId: string, opportunityId: string, actor: Actor) {
  const now = new Date();
  try {
    return await inTx(async (tx) => {
      const p = await loadParticipant(tx, userId, "apply");
      const opp = await getOpenForApply(tx, opportunityId, now);
      const result = checkEligibility(p.facts, opp.rule, now);
      if (!result.eligible) fail("NOT_ELIGIBLE", { reasons: result.reasons });
      const snapshot = { ...result, rule: opp.rule, facts: { ...p.facts, dob: p.facts.dob?.toISOString() ?? null } };
      const { id } = await applicationMachine.create(tx, { opportunity_id: opp.id, student_id: p.studentId, eligibility_result: snapshot }, actor);
      return { id, status: "applied" as const };
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.application.findFirst({ where: { opportunity_id: opportunityId, student: { user_id: userId } }, select: { id: true } });
    fail("ALREADY_APPLIED", { application_id: existing?.id });
  }
}

export const listMine = (userId: string) => (args: object) =>
  db.application.findMany({
    ...args,
    where: { student: { user_id: userId } },
    include: {
      opportunity: {
        select: {
          id: true, title: true, type: true, drive_mode: true, hiring_from: true, hiring_to: true, venue: true, logistics: true, jd_file_id: true,
          company: { select: { id: true, name: true } }, result: { select: { published_at: true } },
        },
      },
      interviews: true,
    },
  });

// ---------- admin ----------

export const listForAdmin = (opportunityId: string, status?: AppStatus) => (args: object) =>
  db.application.findMany({ ...args, where: { opportunity_id: opportunityId, status }, include: { student: { include: { user: { select: STUDENT_USER }, records: true } }, interviews: true } });

/** The only way the gate opens. Idempotent: already-released rows are skipped. */
export async function release(opportunityId: string, applicationIds: string[] | undefined, actor: Actor) {
  return inTx(async (tx) => {
    const opp = await tx.opportunity.findUnique({ where: { id: opportunityId }, include: { company: { include: { users: { where: { status: "active" }, select: { email: true } } } } } });
    if (!opp) fail("NOT_FOUND");
    const ids =
      applicationIds ??
      (await tx.application.findMany({ where: { opportunity_id: opportunityId, status: "applied" }, select: { id: true } })).map((a) => a.id);
    const { changed } = await applicationMachine.moveMany(tx, ids, "released_to_recruiter", actor, { where: { opportunity_id: opportunityId } });
    if (changed.length)
      for (const u of opp.company.users)
        await mail(tx, { to: u.email, subject: `Applicants released: ${opp.title}`, text: `${changed.length} applicant(s) for "${opp.title}" are now visible in your recruiter portal.` });
    return { released: changed.length };
  });
}

/** Recruiter submitted results -> selected/rejected, notice posted, selected students mailed. Idempotent via published_at. */
export async function publishResults(opportunityId: string, actor: Actor) {
  return inTx(async (tx) => {
    // Claim publication first: the conditional UPDATE row-locks the result, so a racing submit either
    // commits before it (and we read its selection below) or finds published_at set and is refused.
    const { count: claimed } = await tx.result.updateMany({ where: { opportunity_id: opportunityId, published_at: null }, data: { published_at: new Date() } });
    const r = await tx.result.findUnique({ where: { opportunity_id: opportunityId }, include: { opportunity: { include: { company: true } } } });
    if (!r) fail("NOT_FOUND", { reason: "recruiter has not submitted results" });
    if (!claimed) return { selected: r.selected_application_ids.length, rejected: 0 };
    await opportunityMachine.move(tx, opportunityId, "closed", actor);
    const { changed: selected } = await applicationMachine.moveMany(tx, r.selected_application_ids, "selected", actor, { where: { opportunity_id: opportunityId } });
    const rest = await tx.application.findMany({ where: { opportunity_id: opportunityId, status: { in: ["shortlisted", "released_to_recruiter"] } }, select: { id: true } });
    const { changed: rejected } = await applicationMachine.moveMany(tx, rest.map((a) => a.id), "rejected", actor);
    const winners = await tx.application.findMany({ where: { id: { in: selected } }, include: { student: { include: { user: true } } } });
    const title = `Results: ${r.opportunity.title} (${r.opportunity.company.name})`;
    await tx.notice.create({
      data: { audience: "all", title, body: `Selected:\n${winners.map((w) => `${w.student.user.name} (${w.student.enrolment_no})`).join("\n") || "none"}`, created_by: actor.kind === "user" ? actor.userId : null },
    });
    for (const w of winners) await mail(tx, { to: w.student.user.email, subject: title, text: `Congratulations, you have been selected for "${r.opportunity.title}".` });
    return { selected: selected.length, rejected: rejected.length };
  });
}

// ---------- recruiter (everything takes RecruiterScope) ----------

/** Unreleased or foreign rows are NOT_FOUND, indistinguishable from nonexistent. */
export async function setOutcome(user: AuthUser<"company">, ids: string[], to: "shortlisted" | "rejected", actor: Actor) {
  const scope = recruiterScope(user);
  return inTx(async (tx) => {
    const { changed } = await applicationMachine.moveMany(tx, ids, to, actor, { where: recruiterMoveWhere(scope) });
    if (to === "shortlisted") await notifyStudents(tx, changed, "You have been shortlisted", (t) => `You have been shortlisted for "${t}". Check the portal for interview details.`);
    return { changed: changed.length };
  });
}

export async function scheduleInterviews(user: AuthUser<"company">, opportunityId: string, input: { application_ids: string[]; round: string; at: Date; venue_or_link: string }) {
  const scope = recruiterScope(user);
  return inTx(async (tx) => {
    const rows = await findShortlisted(tx, scope, opportunityId, input.application_ids);
    if (rows.length !== input.application_ids.length) fail("NOT_FOUND", { reason: "only shortlisted applicants of this posting can be scheduled" });
    await tx.interviewSchedule.createMany({ data: rows.map((r) => ({ application_id: r.id, round: input.round, at: input.at, venue_or_link: input.venue_or_link })) });
    await notifyStudents(tx, rows.map((r) => r.id), `Interview scheduled: ${input.round}`, (t) => `${input.round} for "${t}" on ${input.at.toISOString()} at ${input.venue_or_link}.`);
    return { scheduled: rows.length };
  });
}

/** Draft result; admin publishes. Re-submitting before publish replaces the selection. */
export async function submitResults(user: AuthUser<"company">, opportunityId: string, selectedIds: string[]) {
  const scope = recruiterScope(user);
  const ids = [...new Set(selectedIds)];
  return inTx(async (tx) => {
    if (!(await findOwn(tx, scope.companyId, opportunityId))) fail("NOT_FOUND");
    const ok = await countShortlisted(tx, scope, opportunityId, ids);
    if (ok !== ids.length) fail("NOT_FOUND", { reason: "selected applicants must be shortlisted for this posting" });
    // "Unpublished" is part of the write, so it holds against a concurrent publishResults (see there).
    const { count } = await tx.result.updateMany({ where: { opportunity_id: opportunityId, published_at: null }, data: { selected_application_ids: ids, submitted_at: new Date() } });
    if (count) return { ok: true as const };
    if (await tx.result.findUnique({ where: { opportunity_id: opportunityId } })) fail("INVALID_TRANSITION", { reason: "results already published" });
    await tx.result.create({ data: { opportunity_id: opportunityId, selected_application_ids: ids } });
    return { ok: true as const };
  });
}

async function notifyStudents(tx: Tx, applicationIds: string[], subject: string, text: (title: string) => string) {
  const apps = await tx.application.findMany({ where: { id: { in: applicationIds } }, include: { opportunity: true, student: { include: { user: true } } } });
  for (const a of apps) await mail(tx, { to: a.student.user.email, subject, text: text(a.opportunity.title) });
}

export const listApplicants = (user: AuthUser<"company">, opportunityId: string) => listForRecruiter(recruiterScope(user), opportunityId);
