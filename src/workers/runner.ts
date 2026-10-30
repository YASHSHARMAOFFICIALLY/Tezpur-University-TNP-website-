// In-process worker: claims rows from the jobs table and runs their handlers.
import { Prisma } from "../generated/prisma/client.js";
import { db } from "../infrastructure/db.js";
import { recordError } from "../infrastructure/error-log.js";
import { log } from "../infrastructure/logger.js";
import { RESERVE_SHARE, type JobDef } from "../infrastructure/queue.js";

type Row = { id: string; type: string; payload: unknown; attempts: number };

type Limits = Awaited<ReturnType<NonNullable<JobDef<unknown>["throttle"]>>>;

type Blocked = { all: string[]; bulk: string[] };

async function blockedTypes(throttles: readonly (readonly [string, Limits])[]): Promise<Blocked> {
  const blocked: Blocked = { all: [], bulk: [] };
  for (const [type, t] of throttles) {
    for (const [limit, interval] of [[t.perMinute, "1 minute"], [t.perDay, "1 day"]] as const) {
      if (limit === null) continue;
      const [{ n }] = await db.$queryRaw<[{ n: number }]>`
        select count(*)::int as n from jobs
        where type = ${type} and status = 'done' and finished_at > now() - ${interval}::interval`;
      if (n >= limit) blocked.all.push(type);
      else if (n >= limit - Math.ceil(limit * RESERVE_SHARE)) blocked.bulk.push(type);
    }
  }
  return blocked;
}

/** Claims one batch. Also reclaims jobs stuck in `running` for 10 min (crash recovery). */
async function claim(blocked: Blocked, n: number): Promise<Row[]> {
  return db.$queryRaw<Row[]>`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id in (
      select id from jobs
      where ((status = 'queued' and run_after <= now()) or (status = 'running' and locked_at < now() - interval '10 minutes'))
        and not (type = any(${blocked.all}::text[]))
        and not (priority > 0 and type = any(${blocked.bulk}::text[]))
      order by priority, run_after
      limit ${n}
      for update skip locked)
    returning id, type, payload, attempts`;
}

/** In-memory liveness for /admin/system-health: the API and the worker share one process. */
export const workerHeartbeat = { lastTickAt: null as Date | null, intervalMs: 2000, busyWith: null as string | null };

export function startWorker(defs: readonly JobDef<any>[], { intervalMs = 2000 } = {}) {
  workerHeartbeat.intervalMs = intervalMs;
  const byType = new Map(defs.map((d) => [d.type, d]));
  let stopping = false;
  let current: Promise<void> = Promise.resolve();

  async function runOne(row: Row) {
    const def = byType.get(row.type);
    // Jobs run one at a time, so a long one (CSV import) must keep the heartbeat fresh itself.
    const beat = setInterval(() => (workerHeartbeat.lastTickAt = new Date()), intervalMs);
    workerHeartbeat.busyWith = row.type;
    try {
      if (!def) throw new Error(`no handler for job type ${row.type}`);
      const payload = def.payload.parse(row.payload);
      const result = await def.run(payload, { id: row.id, attempt: row.attempts });
      await db.job.update({
        where: { id: row.id },
        data: {
          status: "done",
          finished_at: new Date(),
          result: (result ?? undefined) as Prisma.InputJsonValue | undefined,
          payload: def.redact ? (def.redact(payload) as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (err) {
      const max = def?.maxAttempts ?? 5;
      const failed = row.attempts >= max;
      log.warn({ err, job: row.id, type: row.type, attempt: row.attempts }, "job failed");
      if (failed)
        await recordError({ source: { kind: "job", type: row.type, attempts: row.attempts }, request_id: row.id, user_id: null, status: 500, code: "JOB_FAILED", err });
      await db.job.update({
        where: { id: row.id },
        data: {
          status: failed ? "failed" : "queued",
          last_error: String(err).slice(0, 2000),
          run_after: new Date(Date.now() + 2 ** row.attempts * 30_000),
        },
      });
    } finally {
      clearInterval(beat);
      workerHeartbeat.busyWith = null;
    }
  }

  async function tick() {
    // Throttled types are claimed one at a time so a batch cannot overshoot the SMTP quota.
    workerHeartbeat.lastTickAt = new Date();
    const throttles = (await Promise.all(defs.map(async (d) => [d.type, await d.throttle?.()] as const))).filter(
      (x): x is readonly [string, Limits] => x[1] !== undefined,
    );
    const blocked = await blockedTypes(throttles);
    const throttled = throttles.some(([, t]) => t.perDay !== null || t.perMinute !== null);
    const rows = await claim(blocked, throttled ? 1 : 5);
    for (const r of rows) await runOne(r);
    return rows.length;
  }

  const loop = async () => {
    while (!stopping) {
      try {
        current = tick().then(() => undefined);
        await current;
      } catch (err) {
        log.error({ err }, "worker tick failed");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  void loop();
  return {
    tick,
    async stop() {
      stopping = true;
      await current;
    },
  };
}
