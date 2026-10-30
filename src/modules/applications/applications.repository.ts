// Release gate invariant: a recruiter sees an application iff its status is in RECRUITER_VISIBLE
// and its opportunity belongs to their company. Every recruiter read and write goes through the
// module-private recruiterWhere(), and RecruiterScope can only be built from a company AuthUser.
import { db, defineMachine, type Tx } from "../../infrastructure/db.js";
import type { AuthUser } from "../../middleware/auth.js";
import type { Prisma } from "../../generated/prisma/client.js";

/** The only writer of applications.status (audited, guarded by the status trigger). */
export const applicationMachine = defineMachine({
  delegate: "application",
  entity: "application",
  entry: ["applied"],
  transitions: {
    applied: ["released_to_recruiter"],
    released_to_recruiter: ["shortlisted", "rejected"],
    shortlisted: ["selected", "rejected"],
    rejected: [],
    selected: [],
  },
});
export type AppStatus = keyof typeof applicationMachine.transitions;

/** Derived from the machine: every state after release. Adding a post-release state widens visibility with no edit here. */
const RECRUITER_VISIBLE = (Object.keys(applicationMachine.transitions) as AppStatus[]).filter((s) => s !== "applied");

export const STUDENT_USER = { name: true, email: true, status: true } as const;

declare const scopeBrand: unique symbol;
export type RecruiterScope = { readonly [scopeBrand]: true; readonly companyId: string };
export const recruiterScope = (user: AuthUser<"company">) => ({ companyId: user.companyId }) as RecruiterScope;

/** THE recruiter filter. Not exported. */
function recruiterWhere(scope: RecruiterScope, opportunityId?: string): Prisma.ApplicationWhereInput {
  return { status: { in: RECRUITER_VISIBLE }, opportunity: { company_id: scope.companyId, ...(opportunityId ? { id: opportunityId } : {}) } };
}

/** For applicationMachine.moveMany's `where`, so the service never holds the raw filter builder. */
export const recruiterMoveWhere = (scope: RecruiterScope) => recruiterWhere(scope);

export const listForRecruiter = (scope: RecruiterScope, opportunityId: string) => async (args: object) => {
  const rows = await db.application.findMany({
    ...args,
    where: recruiterWhere(scope, opportunityId),
    include: { student: { include: { user: { select: STUDENT_USER } } }, interviews: true },
  });
  // recruiterWhere excludes `applied`; the route's response enum re-checks it at runtime.
  return rows as (Omit<(typeof rows)[number], "status"> & { status: Exclude<AppStatus, "applied"> })[];
};

export const findShortlisted = (tx: Tx, scope: RecruiterScope, opportunityId: string, ids: string[]) =>
  tx.application.findMany({ where: { ...recruiterWhere(scope, opportunityId), id: { in: ids }, status: "shortlisted" }, select: { id: true } });

export const countShortlisted = (tx: Tx, scope: RecruiterScope, opportunityId: string, ids: string[]) =>
  tx.application.count({ where: { ...recruiterWhere(scope, opportunityId), id: { in: ids }, status: "shortlisted" } });

/** Used by file download: may this company see this student's resume/photo? */
export async function recruiterCanSeeStudent(scope: RecruiterScope, studentUserId: string) {
  return (await db.application.count({ where: { ...recruiterWhere(scope), student: { user_id: studentUserId } } })) > 0;
}
