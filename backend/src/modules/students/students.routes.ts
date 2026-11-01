import { Id, Ok, route, type ModuleDef } from "../../http/route.js";
import { FileIdResponse, ImportResponse, ProbationBody, ProbationResponse, StudentPatch, StudentProfile } from "./students.schemas.js";
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

    // ---- admin side ----
    route({
      method: "post", path: "/admin/students/:id/probation", summary: "Put a student on, or lift, academic probation",
      auth: ["admin"], params: Id, body: ProbationBody,
      response: ProbationResponse, errors: ["NOT_FOUND"],
      handler: ({ params, body, actor }) => svc.setProbation(params.id, body.on, body.reason, actor),
    }),
    route({
      method: "post", path: "/admin/students/import", summary: "Bulk-add students from CSV (columns: enrolment_no,name,email[,programme_code,year_of_completion,mobile]). Runs as a job.",
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
