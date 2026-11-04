import { z } from "zod";
import { Id, Ok, route, type ModuleDef } from "../../http/route.js";
import {
  AdminFeedback, Appeal, AppealBody, AppealDecision, FeedbackBody, FeedbackOut, FeedbackTarget, FileIdResponse, ImportResponse, Placement,
  ProbationBody, ProbationResponse, RecordBody, RecordOut, StudentPatch, StudentProfile,
} from "./students.schemas.js";
import * as svc from "./students.service.js";

export const studentsModule: ModuleDef = {
  name: "students",
  jobs: [svc.importStudentsJob, svc.graduateJob],
  routes: [
    route({
      method: "get", path: "/students/me", summary: "My profile", auth: ["student"], response: StudentProfile,
      handler: ({ user }) => svc.getProfile(user.id),
    }),
    route({
      method: "patch", path: "/students/me", summary: "Update my profile", auth: ["student"],
      body: StudentPatch, response: StudentProfile,
      handler: ({ user, body }) => svc.updateProfile(user.id, body),
    }),
    ...(["resume", "photo"] as const).map((kind) =>
      route({
        method: "post", path: `/students/me/${kind}`, summary: kind === "resume" ? "Upload resume (PDF, max 5 MB)" : "Upload coloured photo (JPEG/PNG, max 2 MB)",
        auth: ["student"], upload: { maxBytes: kind === "resume" ? 5 << 20 : 2 << 20 }, status: 201,
        response: FileIdResponse, errors: ["FILE_TOO_LARGE", "FILE_TYPE_NOT_ALLOWED"],
        handler: ({ user, file }) => svc.uploadFile(user.id, kind, file),
      }),
    ),

    // ---- placement lock / appeal ----
    route({
      method: "get", path: "/students/me/placement", summary: "Am I placed (applying closed)? Selections, appeal state", auth: ["student"], response: Placement,
      handler: ({ user }) => svc.placement(user.id),
    }),
    route({
      method: "post", path: "/students/me/appeal", summary: "Placed students ask the T&P cell to reopen applying", auth: ["student"], body: AppealBody,
      response: Placement, errors: ["INVALID_TRANSITION"],
      handler: ({ user, body }) => svc.fileAppeal(user.id, body.reason),
    }),

    // ---- certificates / internships / projects ----
    route({
      method: "get", path: "/students/me/records", summary: "My certificates, internships and projects", auth: ["student"], response: z.array(RecordOut),
      handler: ({ user }) => svc.listRecords(user.id),
    }),
    route({
      method: "post", path: "/students/me/records", summary: "Add a certificate, internship or project", auth: ["student"], status: 201, body: RecordBody, response: RecordOut,
      handler: ({ user, body }) => svc.addRecord(user.id, body),
    }),
    route({
      method: "delete", path: "/students/me/records/:id", summary: "Remove a record", auth: ["student"], params: Id, response: Ok, errors: ["NOT_FOUND"],
      handler: ({ user, params }) => svc.deleteRecord(user.id, params.id),
    }),
    route({
      method: "post", path: "/students/me/records/:id/file", summary: "Attach proof to a record (PDF, JPEG or PNG, max 5 MB)", auth: ["student"], params: Id,
      upload: { maxBytes: 5 << 20 }, status: 201, response: FileIdResponse, errors: ["NOT_FOUND", "FILE_TOO_LARGE", "FILE_TYPE_NOT_ALLOWED"],
      handler: ({ user, params, file }) => svc.attachRecordFile(user.id, params.id, file),
    }),

    // ---- feedback on trainings and recruiters ----
    route({
      method: "get", path: "/students/me/feedback", summary: "Ratings I gave", auth: ["student"], response: z.array(FeedbackOut),
      handler: ({ user }) => svc.myFeedback(user.id),
    }),
    route({
      method: "post", path: "/students/me/feedback", summary: "Rate a training event I registered for, or a recruiter I applied to (re-sending replaces it)",
      auth: ["student"], body: FeedbackBody, response: FeedbackOut, errors: ["NOT_PARTICIPANT"],
      handler: ({ user, body }) => svc.giveFeedback(user.id, body),
    }),

    // ---- admin side ----
    route({
      method: "get", path: "/admin/appeals", summary: "Placed students asking to apply again", auth: ["admin"], response: z.array(Appeal),
      handler: () => svc.listAppeals(),
    }),
    route({
      method: "post", path: "/admin/students/:id/appeal", summary: "Grant (reopen applying) or reject a student's appeal", auth: ["admin"], params: Id,
      body: AppealDecision, response: z.object({ changed: z.boolean() }), errors: ["NOT_FOUND"],
      handler: ({ params, body, actor }) => svc.decideAppeal(params.id, body.grant, body.note, actor),
    }),
    route({
      method: "get", path: "/admin/students/:id/records", summary: "A student's certificates, internships and projects", auth: ["admin"], params: Id,
      response: z.array(RecordOut), handler: ({ params }) => svc.recordsOf(params.id),
    }),
    route({
      method: "get", path: "/admin/student-feedback", summary: "Student ratings of trainings and recruiters", auth: ["admin"],
      query: z.object({ target: FeedbackTarget.optional() }), response: z.array(AdminFeedback),
      handler: ({ query }) => svc.allFeedback(query.target),
    }),
    route({
      method: "post", path: "/admin/students/:id/probation", summary: "Put a student on, or lift, academic probation",
      auth: ["admin"], params: Id, body: ProbationBody,
      response: ProbationResponse, errors: ["NOT_FOUND"],
      handler: ({ params, body, actor }) => svc.setProbation(params.id, body.on, body.reason, actor),
    }),
    route({
      method: "post", path: "/admin/students/import", summary: "Bulk-add or update students from CSV. Required: enrolment_no,name,email. Optional: programme_code and any profile field (see the admin roster page). Existing students (same email + enrolment) are updated. Runs as a job.",
      auth: ["admin"], upload: { maxBytes: 5 << 20 }, status: 202,
      response: ImportResponse, errors: ["VALIDATION_FAILED"],
      handler: ({ user, file }) => svc.importCsv(user.id, file),
    }),
    route({
      method: "post", path: "/admin/students/graduate", summary: "Run the alumni transition now (also runs daily)",
      auth: ["admin"], response: Ok,
      handler: () => svc.graduateNow(),
    }),
  ],
};
