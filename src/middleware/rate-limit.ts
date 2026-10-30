import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { AppError } from "./errors.js";

const accountKey = (email: string) => email.trim().toLowerCase();
const byEmailLimiters: RateLimitRequestHandler[] = [];
const onLimit = { handler: (_req: unknown, _res: unknown, next: (e: AppError) => void) => next(new AppError("RATE_LIMITED")) };

/** Two limits: per account (body.email), which stops brute force on one account without locking out
 *  a campus NAT where hundreds of students share an IP, and a coarse per-IP one against floods.
 *  Single process, so in-memory is enough. */
export const perAccountLimit = (perMinute: number): RequestHandler => {
  const byEmail = rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    // No email in the body: fall back to the IP so malformed requests do not share one bucket.
    keyGenerator: (req) => accountKey(String(req.body?.email ?? "")) || `ip:${ipKeyGenerator(req.ip ?? "")}`,
    ...onLimit,
  });
  const byIp = rateLimit({ windowMs: 60_000, limit: 300, keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""), ...onLimit });
  byEmailLimiters.push(byEmail);
  return (req, res, next) => byIp(req, res, (err?: unknown) => (err ? next(err) : byEmail(req, res, next)));
};

/** Admin repair: unlock one account on every rate-limited route. */
export const clearAccountLimit = (email: string) => {
  for (const l of byEmailLimiters) l.resetKey(accountKey(email));
};
