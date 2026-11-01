import { z } from "zod";
import { Id, pageOf, PageQuery, route, Ts, type ModuleDef } from "../../http/route.js";
import { Event, EventBody, EventFields, Moved, RegStatus } from "./events.schemas.js";
import * as svc from "./events.service.js";

export const eventsModule: ModuleDef = {
  name: "events",
  routes: [
    route({
      method: "get", path: "/events", summary: "Published trainings, expert sessions, awareness programmes and workshops",
      auth: ["student", "admin"], query: PageQuery.extend({ type: EventFields.shape.type.optional() }), response: pageOf(Event),
      handler: ({ query }) => svc.listPublished(query),
    }),
    route({
      method: "post", path: "/events/:id/register", summary: "Register for an event inside its registration window",
      auth: ["student"], params: Id, status: 201, response: z.object({ id: z.string(), status: z.literal("registered") }),
      errors: ["ON_PROBATION", "NOT_FOUND", "REGISTRATION_CLOSED", "ALREADY_REGISTERED"],
      handler: ({ user, params, actor }) => svc.register(user.id, params.id, actor),
    }),
    route({
      method: "post", path: "/events/:id/cancel-registration", summary: "Cancel my registration (only while registration is open)",
      auth: ["student"], params: Id, response: Moved, errors: ["NOT_FOUND", "REGISTRATION_CLOSED", "INVALID_TRANSITION"],
      handler: ({ user, params, actor }) => svc.cancelRegistration(user.id, params.id, actor),
    }),
    route({
      method: "get", path: "/events/mine", summary: "My event registrations", auth: ["student"], query: PageQuery,
      response: pageOf(z.object({ id: z.string(), status: RegStatus, created_at: Ts, event: Event })),
      handler: ({ user, query }) => svc.listMine(user.id, query),
    }),

    // ---- admin ----
    route({
      method: "get", path: "/admin/events", summary: "All events incl. drafts", auth: ["admin"], query: PageQuery, response: pageOf(Event),
      handler: ({ query }) => svc.listAll(query),
    }),
    route({
      method: "post", path: "/admin/events", summary: "Create an event (draft)", auth: ["admin"], status: 201, body: EventBody, response: Event,
      handler: ({ body, actor }) => svc.createEvent(body, actor),
    }),
    route({
      method: "patch", path: "/admin/events/:id", summary: "Edit event details", auth: ["admin"], params: Id,
      body: EventFields.partial(), response: Event, errors: ["NOT_FOUND"],
      handler: ({ params, body }) => svc.updateEvent(params.id, body),
    }),
    ...(["published", "completed", "cancelled"] as const).map((to) =>
      route({
        method: "post", path: `/admin/events/:id/${{ published: "publish", completed: "complete", cancelled: "cancel" }[to]}`,
        summary: `Event -> ${to}`, auth: ["admin"], params: Id, response: Moved, errors: ["NOT_FOUND", "INVALID_TRANSITION"],
        handler: ({ params, actor }) => svc.moveEvent(params.id, to, actor),
      }),
    ),
    route({
      method: "get", path: "/admin/events/:id/registrations", summary: "Registrations of an event", auth: ["admin"], params: Id, query: PageQuery,
      response: pageOf(z.object({ id: z.string(), status: RegStatus, created_at: Ts, student: z.object({ enrolment_no: z.string(), user: z.object({ name: z.string(), email: z.string() }) }) })),
      handler: ({ params, query }) => svc.listRegistrations(params.id, query),
    }),
    ...(["confirmed", "attended"] as const).map((to) =>
      route({
        method: "post", path: `/admin/registrations/${to === "confirmed" ? "confirm" : "attend"}`, summary: to === "confirmed" ? "Confirm registrations" : "Mark attendance",
        auth: ["admin"], body: z.object({ registration_ids: z.array(z.uuid()).min(1).max(2000) }), response: z.object({ changed: z.number() }),
        errors: ["NOT_FOUND", "INVALID_TRANSITION"],
        handler: ({ body, actor }) => svc.moveRegistrations(body.registration_ids, to, actor),
      }),
    ),
  ],
};
