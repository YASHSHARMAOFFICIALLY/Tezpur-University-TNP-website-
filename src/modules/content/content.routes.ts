// Plain CRUD with no state machine: company profile, university master data, noticeboard,
// admin<->recruiter messages, feedback forms, file downloads.
import { FileRow, Id, Ok, pageOf, PageQuery, route, type ModuleDef } from "../../http/route.js";
import * as svc from "./content.service.js";
import {
  BrochureUploaded,
  Company,
  CompanyPatch,
  Contact,
  ContactOut,
  FeedbackForms,
  FeedbackRequestCreate,
  FeedbackRequestCreated,
  FeedbackSubmissions,
  FeedbackSubmit,
  Message,
  MessageCreate,
  Notice,
  NoticeCreate,
  PlacementRecord,
  PlacementRecordList,
  PlacementRecordOut,
  ProgrammeCreate,
  ProgrammeList,
  ProgrammeOut,
  ProgrammePatch,
  University,
} from "./content.schemas.js";

export const contentModule: ModuleDef = {
  name: "content",
  routes: [
    // ---- company profile ----
    route({ method: "get", path: "/companies/me", summary: "My organisation profile", auth: ["company"], response: Company, handler: ({ user }) => svc.myCompany(user) }),
    route({
      method: "patch", path: "/companies/me", summary: "Update organisation profile", auth: ["company"], body: CompanyPatch, response: Company,
      handler: ({ user, body }) => svc.updateMyCompany(user, body),
    }),
    route({
      method: "post", path: "/companies/me/contacts", summary: "Add a contact person", auth: ["company"], status: 201, body: Contact, response: ContactOut,
      handler: ({ user, body }) => svc.addContact(user, body),
    }),
    route({
      method: "delete", path: "/companies/me/contacts/:id", summary: "Remove a contact person", auth: ["company"], params: Id, response: Ok, errors: ["NOT_FOUND"],
      handler: ({ user, params }) => svc.removeContact(user, params.id),
    }),
    route({
      method: "get", path: "/admin/companies", summary: "All organisations", auth: ["admin"], query: PageQuery, response: pageOf(Company),
      handler: ({ query }) => svc.listCompanies(query),
    }),

    // ---- university master data (public read: recruiters see it before registering) ----
    route({
      method: "get", path: "/university", summary: "University profile", auth: "public", response: University.nullable(),
      handler: () => svc.getUniversity(),
    }),
    route({
      method: "put", path: "/admin/university", summary: "Set the university profile", auth: ["admin"], body: University, response: University,
      handler: ({ body }) => svc.setUniversity(body),
    }),
    route({
      method: "get", path: "/programmes", summary: "Departments, programmes and student strength", auth: "public",
      response: ProgrammeList,
      handler: () => svc.listProgrammes(),
    }),
    route({
      method: "post", path: "/admin/programmes", summary: "Add a programme", auth: ["admin"], status: 201,
      body: ProgrammeCreate, response: ProgrammeOut,
      handler: ({ body }) => svc.createProgramme(body),
    }),
    route({
      method: "patch", path: "/admin/programmes/:id", summary: "Edit a programme", auth: ["admin"], params: Id, body: ProgrammePatch,
      response: ProgrammeOut, handler: ({ params, body }) => svc.updateProgramme(params.id, body),
    }),
    route({
      method: "get", path: "/placement-records", summary: "Year-wise placement records and brochures", auth: "public",
      response: PlacementRecordList,
      handler: () => svc.listPlacementRecords(),
    }),
    route({
      method: "post", path: "/admin/placement-records", summary: "Add a year's placement record", auth: ["admin"], status: 201, body: PlacementRecord,
      response: PlacementRecordOut, handler: ({ body }) => svc.createPlacementRecord(body),
    }),
    route({
      method: "post", path: "/admin/placement-records/:id/brochure", summary: "Upload the brochure PDF for a year", auth: ["admin"], params: Id,
      upload: { maxBytes: 20 << 20 }, status: 201, response: BrochureUploaded,
      handler: ({ user, params, file }) => svc.uploadBrochure(user.id, params.id, file),
    }),

    // ---- noticeboard ----
    route({
      method: "get", path: "/noticeboard", summary: "Notices for my portal", auth: ["student", "company", "admin"], query: PageQuery, response: pageOf(Notice),
      handler: ({ user, query }) => svc.noticeboard(user, query),
    }),
    route({
      method: "post", path: "/admin/notices", summary: "Post a notice. email=true also mails the audience (drains slowly under the Gmail cap).",
      auth: ["admin"], status: 201, body: NoticeCreate,
      response: Notice,
      handler: ({ user, body }) => svc.postNotice(user, body),
    }),

    // ---- admin <-> recruiter messages (one thread per company) ----
    route({
      method: "get", path: "/messages", summary: "My company's thread with the T&P cell", auth: ["company"], query: PageQuery, response: pageOf(Message),
      handler: ({ user, query }) => svc.myMessages(user, query),
    }),
    route({
      method: "get", path: "/admin/companies/:id/messages", summary: "Thread with one company", auth: ["admin"], params: Id, query: PageQuery, response: pageOf(Message),
      handler: ({ params, query }) => svc.companyMessages(params.id, query),
    }),
    route({
      method: "post", path: "/messages", summary: "Send a message. Recruiters write to the T&P cell; admins must pass company_id.",
      auth: ["company", "admin"], status: 201, body: MessageCreate,
      response: Message, errors: ["VALIDATION_FAILED", "NOT_FOUND"],
      handler: ({ user, body }) => svc.sendMessage(user, body),
    }),

    // ---- recruiter feedback ----
    route({
      method: "post", path: "/admin/opportunities/:id/feedback-request", summary: "Send the recruiter a feedback form", auth: ["admin"], params: Id, status: 201,
      body: FeedbackRequestCreate, response: FeedbackRequestCreated, errors: ["NOT_FOUND"],
      handler: ({ params, body }) => svc.requestFeedback(params.id, body),
    }),
    route({
      method: "get", path: "/feedback", summary: "Feedback forms for my company", auth: ["company"],
      response: FeedbackForms,
      handler: ({ user }) => svc.myFeedbackForms(user),
    }),
    route({
      method: "post", path: "/feedback/:id", summary: "Submit a feedback form", auth: ["company"], params: Id, status: 201,
      body: FeedbackSubmit, response: Ok, errors: ["NOT_FOUND", "CONFLICT"],
      handler: ({ user, params, body }) => svc.submitFeedback(user, params.id, body),
    }),
    route({
      method: "get", path: "/admin/feedback/:id", summary: "Submissions for a feedback request", auth: ["admin"], params: Id,
      response: FeedbackSubmissions,
      handler: ({ params }) => svc.feedbackSubmissions(params.id),
    }),

    // ---- files ----
    route({
      method: "get", path: "/files/:id", summary: "Download a file you may see (own uploads; admin all; recruiters: JDs and released applicants' resume/photo; brochures public to any login)",
      auth: ["admin", "student", "company"], params: Id, download: true, response: FileRow, errors: ["NOT_FOUND"],
      handler: ({ user, params }) => svc.downloadFile(user, params.id),
    }),
  ],
};
