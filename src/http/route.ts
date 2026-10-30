// One declaration = Express handler + zod validation + auth/RBAC + account-state policy
// + response stripping + OpenAPI entry. app.ts mounts only what modules/index.ts lists,
// and the OpenAPI document is generated from the same list, so docs cannot drift from code.
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import express, { type RequestHandler, type Router } from "express";
import fs from "node:fs/promises";
import { z } from "zod";
import type { Role } from "../generated/prisma/client.js";
import type { Actor } from "../infrastructure/db.js";
import type { JobDef } from "../infrastructure/queue.js";
import { absolutePath } from "../infrastructure/storage.js";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { ERRORS, ErrorBody, fail, type ErrorCode } from "../middleware/errors.js";
import { perAccountLimit } from "../middleware/rate-limit.js";
import { singleFile, uploadLimit, type UploadedFile } from "../middleware/upload.js";

type Auth = "public" | readonly [Role, ...Role[]];
type RoleOf<A extends Auth> = A extends readonly Role[] ? A[number] : never;
type Infer<S> = S extends z.ZodType ? z.output<S> : undefined;

export type Ctx<A extends Auth, P, Q, B> = {
  user: A extends "public" ? null : AuthUser<RoleOf<A>>;
  actor: A extends "public" ? null : Actor;
  params: Infer<P>;
  query: Infer<Q>;
  body: Infer<B>;
  /** Present iff the route declares `upload`. Size-capped by multer; mime is sniffed by files.store. */
  file: UploadedFile | null;
  ip: string;
};

type Method = "get" | "post" | "patch" | "put" | "delete";

export type RouteDef<A extends Auth, P, Q, B, O extends z.ZodType> = {
  method: Method;
  /** Express style, relative to /api/v1. */
  path: `/${string}`;
  summary: string;
  auth: A;
  params?: P;
  query?: Q;
  body?: B;
  /** The handler result is parsed through this. Objects strip unknown keys, so a raw row
   *  with password_hash can never leak. */
  response: O;
  status?: 200 | 201 | 202;
  /** Docs: codes this route is known to return. */
  errors?: readonly ErrorCode[];
  /** multipart/form-data with one `file` field. */
  upload?: { maxBytes: number };
  /** Stream a stored file instead of JSON. Handler returns a `files` row (already access-checked). */
  download?: true;
  /** See middleware/rate-limit.ts. */
  rateLimit?: { perMinute: number };
  /** Default false: a user with must_change_password gets PASSWORD_CHANGE_REQUIRED everywhere else. */
  allowDuringPasswordChange?: boolean;
  /** Default false: alumni get ALUMNI_READ_ONLY on any non-GET route. */
  allowAlumniWrite?: boolean;
  handler: (ctx: Ctx<A, P, Q, B>) => Promise<z.input<O>>;
};

const specs = new WeakMap<RouteSpec, RouteDef<any, any, any, any, any>>();
declare const brand: unique symbol;
/** Opaque: only buildRouter/buildOpenApi can read a spec. */
export type RouteSpec = { readonly [brand]: true };

export function route<
  A extends Auth,
  O extends z.ZodType,
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
>(def: RouteDef<A, P, Q, B, O>): RouteSpec {
  const spec = {} as RouteSpec;
  specs.set(spec, def);
  return spec;
}

export type ModuleDef = { name: string; routes: readonly RouteSpec[]; jobs?: readonly JobDef<any>[] };

// ---------- mounting ----------

export function buildRouter(modules: readonly ModuleDef[]): Router {
  const router = express.Router();
  const seen = new Set<string>();
  for (const m of modules)
    for (const spec of m.routes) {
      const def = specs.get(spec)!;
      const key = `${def.method} ${def.path}`;
      if (seen.has(key)) throw new Error(`duplicate route ${key}`);
      seen.add(key);

      const chain: RequestHandler[] = [];
      if (def.rateLimit) chain.push(perAccountLimit(def.rateLimit.perMinute));
      const run: RequestHandler = async (req, res) => {
        res.locals.route = req.baseUrl + def.path; // for error_log: the pattern, not the URL with ids
        let out;
        try {
          const user = await authenticate(req, def);
          res.locals.userId = user?.id;
          const ctx = {
            user,
            actor: user ? ({ kind: "user", userId: user.id, role: user.role } satisfies Actor) : null,
            params: parseInput(def.params, req.params),
            query: parseInput(def.query, req.query),
            body: parseInput(def.body, req.body ?? {}),
            file: (req.file as UploadedFile | undefined) ?? null,
            ip: req.ip ?? "",
          };
          out = def.response.parse(await def.handler(ctx));
        } finally {
          // The request owns the multer temp file: it is gone before any response, however the handler ended.
          if (req.file) await fs.rm(req.file.path, { force: true });
        }
        if (def.download) {
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.type(out.mime);
          return res.download(absolutePath(out.storage_path), out.original_name);
        }
        res.status(def.status ?? 200).json(out);
      };
      // Upload runs after auth so anonymous callers cannot fill the disk.
      if (def.upload)
        chain.push(async (req, res, next) => {
          res.locals.userId = (await authenticate(req, def))?.id;
          uploadLimit(req, res, (err?: unknown) => (err ? next(err) : singleFile(def.upload!.maxBytes)(req, res, next)));
        });
      chain.push(run);
      router[def.method](def.path, ...chain);
    }
  return router;
}

/** Only request input failing its schema is the caller's fault; any other ZodError is a server bug (500). */
function parseInput(schema: z.ZodType | undefined, value: unknown) {
  if (!schema) return undefined;
  const p = schema.safeParse(value);
  if (!p.success) fail("VALIDATION_FAILED", { issues: p.error.issues });
  return p.data;
}

// ---------- OpenAPI ----------

export function buildOpenApi(modules: readonly ModuleDef[]): object {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent("securitySchemes", "bearer", { type: "http", scheme: "bearer", bearerFormat: "JWT" });
  for (const m of modules)
    for (const spec of m.routes) {
      const def = specs.get(spec)!;
      const codes = [...new Set<ErrorCode>(["VALIDATION_FAILED", ...(def.auth === "public" ? [] : (["UNAUTHENTICATED", "FORBIDDEN"] as const)), ...(def.errors ?? [])])];
      const byStatus = new Map<number, ErrorCode[]>();
      for (const c of codes) byStatus.set(ERRORS[c].status, [...(byStatus.get(ERRORS[c].status) ?? []), c]);
      registry.registerPath({
        method: def.method,
        path: "/api/v1" + def.path.replace(/:(\w+)/g, "{$1}"),
        tags: [m.name],
        summary: def.summary,
        security: def.auth === "public" ? [] : [{ [bearer.name]: [] }],
        description: def.auth === "public" ? "Public" : `Roles: ${def.auth.join(", ")}`,
        request: {
          params: def.params,
          query: def.query,
          body: def.upload
            ? { content: { "multipart/form-data": { schema: z.object({ file: z.string().meta({ format: "binary" }) }) } } }
            : def.body
              ? { content: { "application/json": { schema: def.body } } }
              : undefined,
        },
        responses: {
          [def.status ?? 200]: def.download
            ? { description: "File", content: { "application/octet-stream": { schema: z.string().meta({ format: "binary" }) } } }
            : { description: "OK", content: { "application/json": { schema: def.response } } },
          ...Object.fromEntries(
            [...byStatus].map(([status, cs]) => [status, { description: cs.join(" | "), content: { "application/json": { schema: ErrorBody } } }]),
          ),
        },
      });
    }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "Tezpur University T&P Portal API", version: "1.0.0" },
    servers: [{ url: "/" }],
  });
}

// ---------- shared wire schemas ----------

export const Id = z.object({ id: z.uuid() });
export const Ok = z.object({ ok: z.literal(true) });
export const FileRow = z.object({ storage_path: z.string(), mime: z.string(), original_name: z.string() });
/** Dates leave as ISO strings. */
export const Ts = z.date().transform((d) => d.toISOString()).meta({ type: "string", format: "date-time" });

/** A JSON column read from the DB: accepts Prisma's JsonValue, still documents (and enforces) the real shape. */
export const json = <T extends z.ZodType>(schema: T) => z.preprocess((v) => v, schema) as unknown as z.ZodType<z.output<T>, unknown>;

export const PageQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), page: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }) });

/** Cursor pagination, newest first. ids are uuid v7, so id order is creation order. */
export async function paginate<T extends { id: string }>(
  findMany: (args: { take: number; cursor?: { id: string }; skip: number; orderBy: { id: "desc" } }) => Promise<T[]>,
  q: { cursor?: string; limit: number },
) {
  const rows = await findMany({
    take: q.limit + 1,
    cursor: q.cursor ? { id: q.cursor } : undefined,
    skip: q.cursor ? 1 : 0,
    orderBy: { id: "desc" },
  });
  const has_more = rows.length > q.limit;
  const data = rows.slice(0, q.limit);
  return { data, page: { cursor: has_more ? data[data.length - 1]!.id : null, has_more } };
}
