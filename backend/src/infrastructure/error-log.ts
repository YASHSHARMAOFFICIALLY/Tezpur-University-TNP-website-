// error_log: what admins read to see that something broke. Fed by errorMiddleware (5xx) and the
// job runner (final failure). Writing it must never mask the original error.
import { Prisma } from "../generated/prisma/client.js";
import { db } from "./db.js";
import { log } from "./logger.js";

export type ErrorSource = { kind: "request"; method: string; route: string } | { kind: "job"; type: string; attempts: number };

const DB_UNREACHABLE = new Set(["P1001", "P1002", "P1017", "P2024", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01"]);

function isDbUnreachable(err: unknown): boolean {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e instanceof Prisma.PrismaClientInitializationError) return true;
    if (typeof e.code === "string" && DB_UNREACHABLE.has(e.code)) return true;
  }
  return false;
}

/** The one place that turns a failure into a sentence an admin can act on. */
export function errorSummary(source: ErrorSource, err: unknown): string {
  if (isDbUnreachable(err)) return "The database could not be reached";
  if (source.kind === "job") return `Background task '${source.type}' failed after ${source.attempts} attempts`;
  return `Unexpected error while handling ${source.method} ${source.route}`;
}

const detailOf = (err: unknown) =>
  (err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)).slice(0, 4000);

export async function recordError(e: { source: ErrorSource; request_id: string; user_id: string | null; status: number; code: string; err: unknown }) {
  const { source } = e;
  try {
    await db.errorLog.create({
      data: {
        request_id: e.request_id,
        method: source.kind === "request" ? source.method : "JOB",
        route: source.kind === "request" ? source.route : `job:${source.type}`,
        user_id: e.user_id,
        status: e.status,
        code: e.code,
        summary: errorSummary(source, e.err),
        detail: detailOf(e.err),
      },
    });
  } catch (writeErr) {
    log.error({ writeErr, original: e.err, request_id: e.request_id }, "could not write error_log");
  }
}
