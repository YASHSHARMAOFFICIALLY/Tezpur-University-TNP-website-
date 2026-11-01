import { z } from "zod";
import { Ts } from "../../http/route.js";

export const EventFields = z.object({
    type: z.enum(["training", "expert_session", "awareness", "workshop"]),
    name: z.string().min(3).max(200),
    topic: z.string().max(500).optional(),
    resource_person: z.string().max(200).optional(),
    starts_at: z.coerce.date(),
    venue: z.string().max(200).optional(),
    chargeable: z.boolean().default(false),
    fee: z.number().nonnegative().optional(),
    registration_opens_at: z.coerce.date(),
    registration_closes_at: z.coerce.date(),
});
export const EventBody = EventFields
  .refine((e) => e.registration_opens_at < e.registration_closes_at, { message: "registration must open before it closes", path: ["registration_closes_at"] })
  .refine((e) => !e.chargeable || e.fee !== undefined, { message: "fee required for chargeable events", path: ["fee"] });

export const Event = z
  .object({
    id: z.string(),
    type: z.string(),
    name: z.string(),
    topic: z.string().nullable(),
    resource_person: z.string().nullable(),
    starts_at: Ts,
    venue: z.string().nullable(),
    chargeable: z.boolean(),
    fee: z.number().nullable(),
    registration_opens_at: Ts,
    registration_closes_at: Ts,
    status: z.enum(["draft", "published", "cancelled", "completed"]),
  })
  .meta({ id: "Event" });

export const RegStatus = z.enum(["registered", "cancelled", "confirmed", "attended"]);
export const Moved = z.object({ changed: z.boolean() });
