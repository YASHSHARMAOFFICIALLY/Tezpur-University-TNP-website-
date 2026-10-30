// Maps thrown errors to the error envelope. Kept apart from errors.ts so the error catalog (imported by
// db.ts) does not pull in error-log.ts, which imports db.ts.
import type { ErrorRequestHandler } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { recordError } from "../infrastructure/error-log.js";
import { log } from "../infrastructure/logger.js";
import { AppError, ERRORS } from "./errors.js";

// A ZodError is not mapped here: route.ts turns request-parse failures into VALIDATION_FAILED, so any
// other ZodError (response or stored data failing its schema) is a server bug and falls through to INTERNAL.
function classify(err: any): AppError | null {
  if (err instanceof AppError) return err;
  if (err?.code === "LIMIT_FILE_SIZE") return new AppError("FILE_TOO_LARGE");
  if (err?.type === "entity.parse.failed") return new AppError("VALIDATION_FAILED", { reason: "invalid JSON" });
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const entity = err.meta?.modelName;
  if (err.code === "P2002") return new AppError("CONFLICT", { target: err.meta?.target });
  if (err.code === "P2025") return new AppError("NOT_FOUND", { entity });
  if (err.code === "P2003") return new AppError("VALIDATION_FAILED", { reason: "references a record that does not exist", entity });
  // Prisma has no code of its own for a CHECK violation; it arrives wrapped, carrying Postgres's 23514.
  const cause = (err.meta?.driverAdapterError as { cause?: { originalCode?: string; originalMessage?: string } } | undefined)?.cause;
  if (cause?.originalCode === "23514") return new AppError("VALIDATION_FAILED", { constraint: /constraint "([^"]+)"/.exec(cause.originalMessage ?? "")?.[1], entity });
  return null;
}

export const errorMiddleware: ErrorRequestHandler = async (err, req, res, _next) => {
  let e = classify(err);
  if (!e) {
    log.error({ err, reqId: req.id }, "unhandled error");
    e = new AppError("INTERNAL");
  }
  const status = ERRORS[e.code].status;
  if (status >= 500)
    await recordError({
      source: { kind: "request", method: req.method, route: (res.locals.route as string | undefined) ?? req.path },
      request_id: String(req.id),
      user_id: (res.locals.userId as string | undefined) ?? null,
      status,
      code: e.code,
      err,
    });
  res.status(status).json({ error: { code: e.code, message: e.message, details: e.details } });
};
