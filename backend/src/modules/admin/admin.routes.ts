import { z } from "zod";
import { Id, pageOf, PageQuery, route, type ModuleDef } from "../../http/route.js";
import { Opportunity } from "../opportunities/opportunities.schemas.js";
import { AdminStudentPatch, StudentProfile } from "../students/students.schemas.js";
import { AuditEntry, Decision, EmailQueue, EventReport, Job, Pending, PlacementReport, Teacher } from "./admin.schemas.js";
import * as svc from "./admin.service.js";

/** Admin-only: user_id lets the console call the /admin/users/:id repairs for a student row. */
const AdminStudent = StudentProfile.extend({ user_id: z.string() }).meta({ id: "AdminStudent" });

export const adminModule: ModuleDef = {
  name: "admin",
  routes: [
    route({
      method: "get", path: "/admin/pending", summary: "The approval queue: students, recruiters and postings awaiting a decision (oldest first, max 200 each)",
      auth: ["admin"], response: Pending,
      handler: () => svc.pendingQueue(),
    }),
    route({
      method: "post", path: "/admin/users/:id/decision", summary: "Approve, reject or return a pending student/recruiter account",
      auth: ["admin"], params: Id, body: Decision, response: z.object({ changed: z.boolean() }), errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ params, body, actor }) => svc.decideUser(params.id, body, actor),
    }),
    route({
      method: "post", path: "/admin/opportunities/:id/decision", summary: "Approve (visible to students), reject, or return a posting for edits",
      auth: ["admin"], params: Id, body: Decision, response: z.object({ changed: z.boolean() }), errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ params, body, actor }) => svc.decideOpportunity(params.id, body, actor),
    }),
    route({
      method: "get", path: "/admin/opportunities", summary: "All postings", auth: ["admin"],
      query: PageQuery.extend({ status: z.enum(["draft", "pending_admin", "approved", "rejected", "closed"]).optional() }), response: pageOf(Opportunity),
      handler: ({ query }) => svc.listOpportunities(query),
    }),
    route({
      method: "post", path: "/admin/opportunities/:id/close", summary: "Close an approved posting", auth: ["admin"], params: Id,
      response: z.object({ changed: z.boolean() }), errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ params, actor }) => svc.closeOpportunity(params.id, actor),
    }),

    // ---- teachers ----
    route({
      method: "post", path: "/admin/teachers", summary: "Create a teacher/faculty admin login. One-time password is emailed; change forced on first login.",
      auth: ["admin"], status: 201, body: z.object({ email: z.email().toLowerCase(), name: z.string().min(2).max(200) }), response: Teacher, errors: ["EMAIL_TAKEN"],
      handler: ({ body, actor }) => svc.createTeacher(body, actor),
    }),
    route({
      method: "get", path: "/admin/teachers", summary: "Admin/teacher accounts", auth: ["admin"], query: PageQuery, response: pageOf(Teacher.extend({ status: z.string() })),
      handler: ({ query }) => svc.listTeachers(query),
    }),

    // ---- students ----
    route({
      method: "get", path: "/admin/students", summary: "Search students", auth: ["admin"],
      query: PageQuery.extend({ q: z.string().max(100).optional(), status: z.enum(["pending_email_verify", "pending_admin", "active", "rejected", "alumni"]).optional() }),
      response: pageOf(AdminStudent),
      handler: ({ query }) => svc.searchStudents(query),
    }),
    route({
      method: "patch", path: "/admin/students/:id", summary: "Correct a student's record", auth: ["admin"], params: Id, body: AdminStudentPatch,
      response: StudentProfile, errors: ["NOT_FOUND"],
      handler: ({ params, body, actor }) => svc.patchStudent(params.id, body, actor),
    }),

    // ---- ops ----
    route({
      method: "get", path: "/admin/jobs/:id", summary: "Background job status (e.g. CSV import report)", auth: ["admin"], params: Id,
      response: Job,
      errors: ["NOT_FOUND"],
      handler: ({ params }) => svc.getJob(params.id),
    }),
    route({
      method: "get", path: "/admin/email-queue", summary: "Queued vs sent emails (Gmail's daily cap makes this worth watching)", auth: ["admin"],
      response: EmailQueue,
      handler: () => svc.emailQueue(),
    }),
    route({
      method: "get", path: "/admin/audit-log", summary: "Audit trail of every status change", auth: ["admin"],
      query: PageQuery.extend({ entity: z.string().max(50).optional(), entity_id: z.uuid().optional(), actor_user_id: z.uuid().optional() }),
      response: pageOf(AuditEntry),
      handler: ({ query }) => svc.auditLog(query),
    }),
    route({
      method: "get", path: "/admin/reports/placements", summary: "Year-wise placement summary (by year of completion)", auth: ["admin"],
      response: PlacementReport,
      handler: () => svc.placementReport(),
    }),
    route({
      method: "get", path: "/admin/reports/events", summary: "Event participation", auth: ["admin"],
      response: EventReport,
      handler: () => svc.eventReport(),
    }),
  ],
};
