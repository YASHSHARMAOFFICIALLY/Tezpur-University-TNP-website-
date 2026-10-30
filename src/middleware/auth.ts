// Bearer tokens + the per-request account policy every route() runs before its handler.
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { Role, UserStatus } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { db } from "../infrastructure/db.js";
import { fail } from "./errors.js";

/** Built per request from a FRESH users row, so approval, rejection, alumni flips and
 *  password changes take effect on the next request with no token revocation machinery. */
export type AuthUser<R extends Role = Role> = {
  id: string;
  role: R;
  email: string;
  name: string;
  status: Extract<UserStatus, "active" | "alumni">;
  mustChangePassword: boolean;
  /** Set iff role is company, so recruiter handlers never null-check. */
  companyId: R extends "company" ? string : null;
};

type Claims = { sub: string; tv: number; typ: "access" | "refresh" };
const TTL = { access: "15m", refresh: "30d" } as const;

export function signTokens(user: { id: string; token_version: number }) {
  const sign = (typ: Claims["typ"]) =>
    jwt.sign({ sub: user.id, tv: user.token_version, typ }, env.JWT_SECRET, { expiresIn: TTL[typ], algorithm: "HS256" });
  return { access_token: sign("access"), refresh_token: sign("refresh") };
}

/** Verifies a token and returns the fresh users row. token_version mismatch = revoked (logout, password change). */
export async function verifyToken(token: string, typ: Claims["typ"]) {
  let c: Claims;
  try {
    c = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as Claims;
  } catch {
    return null;
  }
  if (c.typ !== typ) return null;
  const u = await db.user.findUnique({ where: { id: c.sub } });
  return u && u.token_version === c.tv ? u : null;
}

/** The slice of a route declaration that decides who may call it. */
export type AuthPolicy = {
  auth: "public" | readonly Role[];
  method: string;
  allowDuringPasswordChange?: boolean;
  allowAlumniWrite?: boolean;
};

export async function authenticate(req: Request, policy: AuthPolicy): Promise<AuthUser | null> {
  if (policy.auth === "public") return null;
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const u = token ? await verifyToken(token, "access") : null;
  if (!u || (u.status !== "active" && u.status !== "alumni")) fail("UNAUTHENTICATED");
  if (!policy.auth.includes(u.role)) fail("FORBIDDEN");
  if (u.must_change_password && !policy.allowDuringPasswordChange) fail("PASSWORD_CHANGE_REQUIRED");
  if (u.status === "alumni" && policy.method !== "get" && !policy.allowAlumniWrite) fail("ALUMNI_READ_ONLY");
  if (u.role === "company" && !u.company_id) fail("FORBIDDEN");
  return {
    id: u.id,
    role: u.role,
    email: u.email,
    name: u.name,
    status: u.status,
    mustChangePassword: u.must_change_password,
    companyId: u.company_id,
  } as AuthUser;
}
