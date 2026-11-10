import type { z } from "zod";
import { audit, db, inTx, isUniqueViolation, type Actor } from "../../infrastructure/db.js";
import { fail } from "../../middleware/errors.js";
import { mail } from "../../infrastructure/mailer.js";
import { hashPassword, randomPassword } from "../../infrastructure/password.js";
import { paginate, type PageQuery } from "../../http/route.js";
import { userMachine } from "../auth/auth.service.js";
import { deadlineAhead, opportunityMachine } from "../opportunities/opportunities.service.js";
import type { AdminStudentPatch } from "../students/students.schemas.js";
import type { Decision } from "./admin.schemas.js";
import { studentWhere, type StudentFilter } from "../students/students.filter.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Page = z.infer<typeof PageQuery>;

/** Accounts: return == reject-with-reason (recruiter resubmits via /auth/resubmit/recruiter). */
export async function decideUser(id: string, d: Decision, actor: Actor) {
  return inTx(async (tx) => {
    const u = await tx.user.findFirst({ where: { id, role: { in: ["student", "company"] } } });
    if (!u) fail("NOT_FOUND");
    const reason = d.decision === "approve" ? null : d.reason;
    const r = await userMachine.move(tx, id, d.decision === "approve" ? "active" : "rejected", actor, { meta: { reason }, extra: { review_note: reason } });
    if (r.changed)
      await mail(tx, {
        to: u.email,
        subject: d.decision === "approve" ? "Your T&P portal account is approved" : "Your T&P portal registration needs attention",
        text: d.decision === "approve" ? "You can now log in to the T&P portal." : `Reason: ${reason}\n${u.role === "company" ? "Correct the details and resubmit from the portal." : "Contact the T&P cell."}`,
      });
    return { changed: r.changed };
  });
}

export async function decideOpportunity(id: string, d: Decision, actor: Actor) {
  return inTx(async (tx) => {
    const to = { approve: "approved", reject: "rejected", return: "draft" } as const;
    const reason = d.decision === "approve" ? null : d.reason;
    if (d.decision === "approve") await deadlineAhead(tx, id, "approved");
    const r = await opportunityMachine.move(tx, id, to[d.decision], actor, { meta: { reason }, extra: { review_note: reason } });
    if (!r.changed) return { changed: false };
    const o = await tx.opportunity.findUniqueOrThrow({ where: { id }, include: { company: { include: { users: { select: { email: true } } } } } });
    if (d.decision === "approve")
      await tx.notice.create({
        data: { audience: "students", title: `New ${o.type}: ${o.title} (${o.company.name})`, body: `Apply before ${o.apply_deadline.toISOString().slice(0, 10)}.`, created_by: actor.kind === "user" ? actor.userId : null },
      });
    for (const u of o.company.users)
      await mail(tx, { to: u.email, subject: `Posting ${to[d.decision]}: ${o.title}`, text: reason ? `Reason: ${reason}` : "Your posting is live for students." });
    return { changed: true };
  });
}

export async function pendingQueue() {
  const [students, recruiters, opportunities] = await Promise.all([
    db.user.findMany({ where: { role: "student", status: "pending_admin" }, include: { student: { select: { enrolment_no: true, department: true, cgpa: true, programme_id: true, programme: { select: { name: true, department: true } }, resume_file_id: true, photo_file_id: true } } }, orderBy: { id: "asc" }, take: 200 }),
    db.user.findMany({ where: { role: "company", status: "pending_admin" }, include: { company: true }, orderBy: { id: "asc" }, take: 200 }),
    db.opportunity.findMany({ where: { status: "pending_admin" }, include: { company: { select: { name: true } } }, orderBy: { id: "asc" }, take: 200 }),
  ]);
  return { students, recruiters, opportunities };
}

export const listOpportunities = (query: Page & { status?: "draft" | "pending_admin" | "approved" | "rejected" | "closed" }) =>
  paginate((a) => db.opportunity.findMany({ ...a, where: { status: query.status } }), query);

export const closeOpportunity = (id: string, actor: Actor) => inTx((tx) => opportunityMachine.move(tx, id, "closed", actor));

export async function createTeacher(body: { email: string; name: string }, actor: Actor) {
  const password = randomPassword();
  const password_hash = await hashPassword(password);
  try {
    return await inTx(async (tx) => {
      const { id } = await userMachine.create(
        tx,
        { role: "admin", email: body.email, name: body.name, password_hash, must_change_password: true, email_verified_at: new Date() },
        actor,
        { state: "active", meta: { via: "teacher_created" } },
      );
      await mail(tx, { to: body.email, subject: "Your T&P portal admin account", text: `Login: ${body.email}\nOne-time password: ${password}\nYou must change it on first login.` }, { priority: 0 });
      return { id, ...body };
    });
  } catch (e) {
    if (isUniqueViolation(e)) fail("EMAIL_TAKEN");
    throw e;
  }
}

export const deleteTeacher = (id: string, selfId: string, actor: Actor) =>
  inTx(async (tx) => {
    const u = await tx.user.findFirst({ where: { id, role: "admin" } });
    if (!u) fail("NOT_FOUND");
    if (id === selfId) fail("CANNOT_DELETE", { reason: "you cannot delete your own account" });
    if ((await tx.user.count({ where: { role: "admin", status: "active" } })) <= 1 && u.status === "active") fail("CANNOT_DELETE", { reason: "last admin" });
    await tx.otpCode.deleteMany({ where: { user_id: id } });
    await tx.user.delete({ where: { id } });
    await audit(tx, actor, "user.deleted", "user", id, { email: u.email, role: u.role });
    return { ok: true as const };
  });

export const listTeachers = (query: Page) => paginate((a) => db.user.findMany({ ...a, where: { role: "admin" } }), query);

type RosterQuery = Page & StudentFilter & { q?: string; status?: "pending_email_verify" | "pending_admin" | "active" | "rejected" | "alumni" };

export const rosterWhere = (query: Omit<RosterQuery, keyof Page>): Prisma.StudentWhereInput => ({
  AND: [
    studentWhere(query),
    { user: { status: query.status } },
    query.q ? { OR: [{ enrolment_no: { contains: query.q, mode: "insensitive" } }, { user: { name: { contains: query.q, mode: "insensitive" } } }] } : {},
  ],
});

const rosterUser = { select: { name: true, email: true, status: true, password_hash: true } } as const;
/** The hash never leaves the server: the roster only learns whether the student has set a password. */
const claimed = <S extends { user: { password_hash: string; name: string; email: string; status: string } }>(s: S) => {
  const { password_hash, ...user } = s.user;
  return { ...s, user, account_claimed: password_hash !== "" };
};

export const searchStudents = (query: RosterQuery) =>
  paginate(async (a) => (await db.student.findMany({ ...a, where: rosterWhere(query), include: { user: rosterUser } })).map(claimed), query);

export const patchStudent = (id: string, body: z.infer<typeof AdminStudentPatch>, actor: Actor) =>
  inTx(async (tx) => {
    const { name, ...rest } = body;
    const s = await tx.student.update({ where: { id }, data: rest });
    if (name) await tx.user.update({ where: { id: s.user_id }, data: { name } });
    await audit(tx, actor, "student.edited_by_admin", "student", s.id, { fields: Object.keys(body) });
    return claimed(await tx.student.findUniqueOrThrow({ where: { id: s.id }, include: { user: rosterUser } }));
  });

export const getJob = async (id: string) => (await db.job.findUnique({ where: { id } })) ?? fail("NOT_FOUND");

export async function emailQueue() {
  const where = { type: "email.send" };
  const [queued, sent_24h, failed] = await Promise.all([
    db.job.count({ where: { ...where, status: { in: ["queued", "running"] } } }),
    db.job.count({ where: { ...where, status: "done", finished_at: { gt: new Date(Date.now() - 86_400_000) } } }),
    db.job.count({ where: { ...where, status: "failed" } }),
  ]);
  return { queued, sent_24h, failed };
}

/** The log stores ids only; the page adds the actor's and a user entity's name so a row reads "Aditya Saraswat did X", not "01a1c262 did X". */
export async function auditLog(query: Page & { entity?: string; entity_id?: string; actor_user_id?: string }) {
  const page = await paginate((a) => db.auditLog.findMany({ ...a, where: { entity: query.entity, entity_id: query.entity_id, actor_user_id: query.actor_user_id } }), query);
  const ids = [...new Set(page.data.flatMap((a) => [a.actor_user_id, a.entity === "user" ? a.entity_id : null]).filter((x): x is string => !!x))];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return { ...page, data: page.data.map((a) => ({ ...a, actor_name: (a.actor_user_id && names.get(a.actor_user_id)) || null, entity_name: (a.entity === "user" && names.get(a.entity_id)) || null })) };
}

export const placementReport = () =>
  db.$queryRaw<{ year: number | null; students: number; applied: number; selected: number }[]>`
          select s.year_of_completion as year, count(distinct s.id)::int as students,
                 count(distinct a.student_id)::int as applied,
                 count(distinct a.student_id) filter (where a.status = 'selected')::int as selected
          from students s left join applications a on a.student_id = s.id
          group by s.year_of_completion order by s.year_of_completion desc nulls last`;

export const eventReport = () =>
  db.$queryRaw<{ id: string; name: string; type: string; registered: number; attended: number }[]>`
          select e.id, e.name, e.type::text, count(r.id) filter (where r.status <> 'cancelled')::int as registered,
                 count(r.id) filter (where r.status = 'attended')::int as attended
          from events e left join event_registrations r on r.event_id = e.id
          group by e.id order by e.starts_at desc limit 500`;
