import { z } from "zod";
import { Id, pageOf, PageQuery, paginate, route, type ModuleDef } from "../../http/route.js";
import { ForStudent, Moved, Opportunity, OpportunityBody } from "./opportunities.schemas.js";
import * as svc from "./opportunities.service.js";

export const opportunitiesModule: ModuleDef = {
  name: "opportunities",
  routes: [
    // ---- recruiter ----
    route({
      method: "post", path: "/company/opportunities", summary: "Create a job/internship posting (draft)",
      auth: ["company"], status: 201, body: OpportunityBody, response: Opportunity,
      handler: ({ user, body, actor }) => svc.createDraft(user.companyId, user.id, body, actor),
    }),
    route({
      method: "patch", path: "/company/opportunities/:id", summary: "Edit a draft (also after admin returned it)",
      auth: ["company"], params: Id, body: OpportunityBody.partial(), response: Opportunity, errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ user, params, body }) => svc.updateDraft(user.companyId, params.id, body),
    }),
    route({
      method: "post", path: "/company/opportunities/:id/jd", summary: "Upload the job description PDF",
      auth: ["company"], params: Id, upload: { maxBytes: 10 << 20 }, status: 201, response: z.object({ file_id: z.string() }),
      handler: ({ user, params, file }) => svc.attachJd(user.companyId, params.id, user.id, file),
    }),
    route({
      method: "post", path: "/company/opportunities/:id/submit", summary: "Submit a draft for admin approval",
      auth: ["company"], params: Id, response: Moved, errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ user, params, actor }) => svc.recruiterMove(user.companyId, params.id, "pending_admin", actor),
    }),
    route({
      method: "post", path: "/company/opportunities/:id/close", summary: "Stop accepting applications",
      auth: ["company"], params: Id, response: Moved, errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ user, params, actor }) => svc.recruiterMove(user.companyId, params.id, "closed", actor),
    }),
    route({
      method: "get", path: "/company/opportunities", summary: "My company's postings", auth: ["company"],
      query: PageQuery, response: pageOf(Opportunity),
      handler: ({ user, query }) => paginate(svc.listForCompany(user.companyId), query),
    }),

    // ---- student ----
    route({
      method: "get", path: "/opportunities", summary: "Open postings, each with my eligibility",
      auth: ["student"],
      query: PageQuery.extend({ type: z.enum(["job", "internship", "competition"]).optional(), eligible_only: z.stringbool().default(false) }),
      response: pageOf(ForStudent),
      handler: ({ user, query }) => svc.listOpenForStudent(user.id, query),
    }),
    route({
      method: "get", path: "/opportunities/:id", summary: "One open posting with my eligibility", auth: ["student"], params: Id,
      response: ForStudent, errors: ["NOT_FOUND"],
      handler: ({ user, params }) => svc.getForStudent(user.id, params.id),
    }),
  ],
};
