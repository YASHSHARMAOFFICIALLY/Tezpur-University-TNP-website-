import { z } from "zod";
import { PageQuery, Ts } from "../../http/route.js";
import { ERRORS, type AnyErrorCode } from "../../middleware/errors.js";

const Code = z.enum(Object.keys(ERRORS) as [AnyErrorCode, ...AnyErrorCode[]]);
const When = Ts.nullable();

export const SystemHealth = z.object({
  status: z.enum(["ok", "warning", "problem"]),
  problems: z.array(z.string()),
  database: z.object({ ok: z.boolean(), latency_ms: z.number() }),
  worker: z.object({ alive: z.boolean(), last_tick_at: When, busy_with: z.string().nullable() }),
  jobs: z.object({ last_finished_at: When, queued: z.number(), failed: z.number() }),
  email: z.object({ queued: z.number(), sent_24h: z.number(), failed: z.number(), daily_cap: z.number().nullable() }),
  backup: z.object({ last_ok_at: When, last_status: z.enum(["ok", "failed", "never"]), last_detail: z.string().nullable() }),
  storage: z.object({ free_bytes: z.number(), total_bytes: z.number(), uploads_bytes: z.number() }),
  errors_24h: z.number(),
});
export type SystemHealth = z.input<typeof SystemHealth>;

export const ErrorQuery = PageQuery.extend({
  code: Code.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(100).optional(),
});
export const ErrorEntry = z.object({
  id: z.string(), request_id: z.string(), method: z.string(), route: z.string(), user_id: z.string().nullable(),
  status: z.number(), code: z.string(), summary: z.string(), detail: z.string(), created_at: Ts, hint: z.string(),
});
export const ErrorCodeInfo = z.object({ code: Code, status: z.number(), message: z.string(), hint: z.string() });

export const RetryBody = z.object({ job_ids: z.array(z.uuid()).max(1000).optional() });
