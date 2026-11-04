import { rateLimit } from "express-rate-limit";
import multer from "multer";
import os from "node:os";
import type { FileKind } from "../generated/prisma/client.js";
import { AppError } from "./errors.js";

/** What a route handler receives for its single `file` field. */
export type UploadedFile = { path: string; originalname: string; size: number };

/** One `file` field, size-capped, to a temp dir. storage.ts sniffs and moves it. */
export const singleFile = (maxBytes: number) => multer({ dest: os.tmpdir(), limits: { fileSize: maxBytes, files: 1 } }).single("file");

/** Every upload route, per user: caps how fast one account can write to disk. Keyed by the user id set after auth. */
export const uploadLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (_req, res) => `upload:${res.locals.userId}`,
  handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
});

export type Mime = "application/pdf" | "image/jpeg" | "image/png";
export const MB = 1024 * 1024;
/** Hard caps. The admin `upload_max_mb` setting can only lower them. */
export const FILE_POLICY: Record<FileKind, { mimes: readonly Mime[]; maxBytes: number }> = {
  resume: { mimes: ["application/pdf"], maxBytes: 5 * MB },
  photo: { mimes: ["image/jpeg", "image/png"], maxBytes: 2 * MB },
  jd: { mimes: ["application/pdf"], maxBytes: 10 * MB },
  brochure: { mimes: ["application/pdf"], maxBytes: 20 * MB },
  /** Notice and message attachments. */
  attachment: { mimes: ["application/pdf"], maxBytes: 10 * MB },
  /** Student certificate / internship / project proof. */
  record: { mimes: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 5 * MB },
};
