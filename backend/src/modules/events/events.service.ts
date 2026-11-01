import type { z } from "zod";
import { db, defineMachine, inTx, isUniqueViolation, type Actor } from "../../infrastructure/db.js";
import { fail } from "../../middleware/errors.js";
import { paginate, type PageQuery } from "../../http/route.js";
import { loadParticipant } from "../students/students.service.js";
import type { EventBody, EventFields } from "./events.schemas.js";

export const eventMachine = defineMachine({
  delegate: "event",
  entity: "event",
  entry: ["draft"],
  transitions: { draft: ["published", "cancelled"], published: ["completed", "cancelled"], completed: [], cancelled: [] },
});

export const registrationMachine = defineMachine({
  delegate: "eventRegistration",
  entity: "event_registration",
  entry: ["registered"],
  transitions: { registered: ["cancelled", "confirmed"], cancelled: ["registered"], confirmed: ["attended"], attended: [] },
});

/** Pure. Open on [opens, closes). */
export const registrationOpen = (e: { registration_opens_at: Date; registration_closes_at: Date }, now: Date) =>
  now >= e.registration_opens_at && now < e.registration_closes_at;

type Page = z.infer<typeof PageQuery>;
type EventType = z.infer<typeof EventFields>["type"];

export const listPublished = (query: Page & { type?: EventType }) =>
  paginate((a) => db.event.findMany({ ...a, where: { status: { in: ["published", "completed"] }, type: query.type } }), query);

export async function register(userId: string, eventId: string, actor: Actor) {
  const now = new Date();
  try {
    return await inTx(async (tx) => {
      const p = await loadParticipant(tx, userId, "event");
      const e = await tx.event.findUnique({ where: { id: eventId } });
      if (!e || e.status !== "published") fail("NOT_FOUND");
      if (!registrationOpen(e, now)) fail("REGISTRATION_CLOSED", { opens_at: e.registration_opens_at, closes_at: e.registration_closes_at });
      const prior = await tx.eventRegistration.findUnique({ where: { event_id_student_id: { event_id: e.id, student_id: p.studentId } } });
      if (prior?.status === "cancelled") {
        await registrationMachine.move(tx, prior.id, "registered", actor);
        return { id: prior.id, status: "registered" as const };
      }
      if (prior) fail("ALREADY_REGISTERED", { registration_id: prior.id });
      const { id } = await registrationMachine.create(tx, { event_id: e.id, student_id: p.studentId }, actor);
      return { id, status: "registered" as const };
    });
  } catch (err) {
    if (isUniqueViolation(err)) fail("ALREADY_REGISTERED");
    throw err;
  }
}

export const cancelRegistration = (userId: string, eventId: string, actor: Actor) =>
  inTx(async (tx) => {
    const r = await tx.eventRegistration.findFirst({ where: { event_id: eventId, student: { user_id: userId } }, include: { event: true } });
    if (!r) fail("NOT_FOUND");
    if (!registrationOpen(r.event, new Date())) fail("REGISTRATION_CLOSED");
    return registrationMachine.move(tx, r.id, "cancelled", actor);
  });

export const listMine = (userId: string, query: Page) =>
  paginate((a) => db.eventRegistration.findMany({ ...a, where: { student: { user_id: userId } }, include: { event: true } }), query);

export const listAll = (query: Page) => paginate((a) => db.event.findMany(a), query);

export const createEvent = (body: z.infer<typeof EventBody>, actor: Actor) =>
  inTx(async (tx) => tx.event.findUniqueOrThrow({ where: { id: (await eventMachine.create(tx, body, actor)).id } }));

export const updateEvent = (id: string, body: Partial<z.infer<typeof EventFields>>) => db.event.update({ where: { id }, data: body });

export const moveEvent = (id: string, to: "published" | "completed" | "cancelled", actor: Actor) =>
  inTx((tx) => eventMachine.move(tx, id, to, actor));

export const listRegistrations = (eventId: string, query: Page) =>
  paginate((a) => db.eventRegistration.findMany({ ...a, where: { event_id: eventId }, include: { student: { include: { user: true } } } }), query);

export const moveRegistrations = async (ids: string[], to: "confirmed" | "attended", actor: Actor) =>
  ({ changed: (await inTx((tx) => registrationMachine.moveMany(tx, ids, to, actor))).changed.length });
