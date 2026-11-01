import { z } from "zod";
import { Id, Ok, pageOf, PageQuery, paginate, route, type ModuleDef } from "../../http/route.js";
import { AdminApplication, Ids, Mine, RecruiterApplicant, Status } from "./applications.schemas.js";
import * as svc from "./applications.service.js";

export const applicationsModule: ModuleDef = {
  name: "applications",
  routes: [
    // ---- student ----
    route({
      method: "post", path: "/opportunities/:id/apply", summary: "Apply. Eligibility is checked and stored on the application.",
      auth: ["student"], params: Id, status: 201, response: z.object({ id: z.string(), status: z.literal("applied") }),
      errors: ["ON_PROBATION", "PROFILE_INCOMPLETE", "NOT_FOUND", "OPPORTUNITY_NOT_OPEN", "NOT_ELIGIBLE", "ALREADY_APPLIED"],
      handler: ({ user, params, actor }) => svc.apply(user.id, params.id, actor),
    }),
    route({
      method: "get", path: "/applications/mine", summary: "My applications with status, interviews and results",
      auth: ["student"], query: PageQuery, response: pageOf(Mine),
      handler: ({ user, query }) => paginate(svc.listMine(user.id), query),
    }),

    // ---- admin ----
    route({
      method: "get", path: "/admin/opportunities/:id/applications", summary: "All applications of a posting",
      auth: ["admin"], params: Id, query: PageQuery.extend({ status: Status.optional() }), response: pageOf(AdminApplication),
      handler: ({ params, query }) => paginate(svc.listForAdmin(params.id, query.status), query),
    }),
    route({
      method: "post", path: "/admin/opportunities/:id/release", summary: "Release applicants to the recruiter (all `applied` if no ids given)",
      auth: ["admin"], params: Id, body: z.object({ application_ids: z.array(z.uuid()).optional() }), response: z.object({ released: z.number() }),
      errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ params, body, actor }) => svc.release(params.id, body.application_ids, actor),
    }),
    route({
      method: "post", path: "/admin/opportunities/:id/results/publish", summary: "Publish recruiter-submitted results to the noticeboard",
      auth: ["admin"], params: Id, response: z.object({ selected: z.number(), rejected: z.number() }), errors: ["NOT_FOUND"],
      handler: ({ params, actor }) => svc.publishResults(params.id, actor),
    }),

    // ---- recruiter ----
    route({
      method: "get", path: "/company/opportunities/:id/applicants", summary: "Applicants released by the T&P cell (nothing before release)",
      auth: ["company"], params: Id, query: PageQuery, response: pageOf(RecruiterApplicant),
      handler: ({ user, params, query }) => paginate(svc.listApplicants(user, params.id), query),
    }),
    ...(["shortlisted", "rejected"] as const).map((to) =>
      route({
        method: "post", path: `/company/applications/${to === "shortlisted" ? "shortlist" : "reject"}`, summary: to === "shortlisted" ? "Shortlist applicants" : "Reject applicants",
        auth: ["company"], body: Ids, response: z.object({ changed: z.number() }), errors: ["NOT_FOUND", "INVALID_TRANSITION"],
        handler: ({ user, body, actor }) => svc.setOutcome(user, body.application_ids, to, actor),
      }),
    ),
    route({
      method: "post", path: "/company/opportunities/:id/interviews", summary: "Schedule an interview round for shortlisted applicants",
      auth: ["company"], params: Id, status: 201,
      body: Ids.extend({ round: z.string().min(2).max(100), at: z.coerce.date(), venue_or_link: z.string().min(2).max(500) }),
      response: z.object({ scheduled: z.number() }), errors: ["NOT_FOUND"],
      handler: ({ user, params, body }) => svc.scheduleInterviews(user, params.id, body),
    }),
    route({
      method: "post", path: "/company/opportunities/:id/results", summary: "Submit final selections (admin publishes them)",
      auth: ["company"], params: Id, body: z.object({ selected_application_ids: z.array(z.uuid()).max(1000) }), response: Ok,
      errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ user, params, body }) => svc.submitResults(user, params.id, body.selected_application_ids),
    }),
  ],
};
