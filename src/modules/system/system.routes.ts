import { z } from "zod";
import { Id, Ok, pageOf, route, type ModuleDef } from "../../http/route.js";
import { ErrorCodeInfo, ErrorEntry, ErrorQuery, RetryBody, SystemHealth } from "./system.schemas.js";
import * as svc from "./system.service.js";

export const systemModule: ModuleDef = {
  name: "system",
  jobs: [svc.pruneErrorLogJob, svc.pruneDoneJobsJob, svc.pruneUnverifiedJob],
  routes: [
    route({
      method: "get", path: "/admin/system-health", summary: "Is everything working? Database, worker, jobs, email, backups, disk and recent errors, with plain-English problems",
      auth: ["admin"], response: SystemHealth,
      handler: () => svc.systemHealth(),
    }),
    route({
      method: "get", path: "/admin/errors", summary: "Server errors and failed background tasks (newest first, kept 90 days), each with what to do next",
      auth: ["admin"], query: ErrorQuery, response: pageOf(ErrorEntry),
      handler: ({ query }) => svc.listErrors(query),
    }),
    route({
      method: "get", path: "/admin/error-codes", summary: "Every error code with its admin hint",
      auth: ["admin"], response: z.array(ErrorCodeInfo),
      handler: async () => svc.errorCodes(),
    }),
    route({
      method: "post", path: "/admin/repairs/retry-failed-emails", summary: "Put failed emails back in the queue (all, or the given job ids)",
      auth: ["admin"], body: RetryBody, response: z.object({ requeued: z.number() }),
      handler: ({ body, actor }) => svc.retryFailedEmails(body.job_ids, actor),
    }),
    route({
      method: "post", path: "/admin/users/:id/resend-otp", summary: "Email a new verification code to an account still waiting to verify its email",
      auth: ["admin"], params: Id, response: Ok, errors: ["NOT_FOUND", "INVALID_TRANSITION", "OTP_RESEND_TOO_SOON"],
      handler: ({ params, actor }) => svc.resendOtp(params.id, actor),
    }),
    route({
      method: "post", path: "/admin/users/:id/reset-password", summary: "Email the user a one-time password, sign them out everywhere, and force a change at next login",
      auth: ["admin"], params: Id, response: z.object({ emailed: z.literal(true) }), errors: ["NOT_FOUND"],
      handler: ({ params, actor }) => svc.resetPassword(params.id, actor),
    }),
    route({
      method: "post", path: "/admin/users/:id/clear-rate-limit", summary: "Unlock a user who hit the login or code attempt limit",
      auth: ["admin"], params: Id, response: Ok, errors: ["NOT_FOUND"],
      handler: ({ params, actor }) => svc.clearRateLimit(params.id, actor),
    }),
    route({
      method: "post", path: "/admin/users/:id/delete-unverified", summary: "Delete an account that never verified its email, freeing its email and enrolment number",
      auth: ["admin"], params: Id, response: Ok, errors: ["NOT_FOUND", "INVALID_TRANSITION"],
      handler: ({ params, actor }) => svc.deleteUnverifiedUser(params.id, actor),
    }),
  ],
};
