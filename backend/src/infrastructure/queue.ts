// Postgres-table job queue. No Redis. Jobs are declared next to the code that enqueues them and
// listed in their ModuleDef; workers/runner.ts claims and runs them.
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import type { Tx } from "./db.js";

export type JobDef<P> = {
  type: string;
  payload: z.ZodType<P>;
  maxAttempts?: number;
  /** Lower runs first. 0 = login codes, 5 = default, 9 = bulk fan-out. */
  priority?: number;
  /**
   * For quota-limited resources (SMTP). Over the limit, rows stay queued; no attempt is burned. null = no limit, 0 = paused.
   * Priority 0 may use the whole limit; other priorities stop RESERVE_SHARE short of it, so bulk mail cannot starve login codes.
   */
  throttle?: () => Promise<{ perMinute: number | null; perDay: number | null }>;
  /** What to keep of the payload once the job is done (drop secrets). Failed jobs keep theirs so they can be retried. */
  redact?: (payload: P) => P;
  /** Must be safe to run twice (crash after the side effect, before marking done). */
  run: (payload: P, job: { id: string; attempt: number }) => Promise<unknown>;
};

export const defineJob = <P>(def: JobDef<P>) => def;

export const RESERVE_SHARE = 0.1;

/**
 * Insert a job inside the caller's transaction, so it exists iff the business write committed.
 * dedupeKey makes enqueue idempotent on retries.
 */
export async function enqueue<P>(tx: Tx, job: JobDef<P>, payload: P, opts: { runAfter?: Date; dedupeKey?: string; priority?: number } = {}) {
  job.payload.parse(payload);
  if (opts.dedupeKey) {
    const existing = await tx.job.findUnique({ where: { dedupe_key: opts.dedupeKey }, select: { id: true } });
    if (existing) return existing;
  }
  return tx.job.create({
    select: { id: true },
    data: {
      type: job.type,
      payload: payload as Prisma.InputJsonValue,
      priority: opts.priority ?? job.priority ?? 5,
      run_after: opts.runAfter ?? new Date(),
      dedupe_key: opts.dedupeKey,
    },
  });
}
