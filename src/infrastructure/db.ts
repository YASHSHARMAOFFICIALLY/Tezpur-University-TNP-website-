// Prisma client + the only code path allowed to write a status column.
//
// Invariant: every status change writes exactly one audit_log row in the same transaction.
// Enforced by the database, not by convention: a trigger (migration *_status_guard) rejects any
// INSERT or status-changing UPDATE on a guarded table unless `app.transition = 'on'` in the
// current transaction. Only Machine (below) turns it on, and turns it off before returning.
// So `tx.application.update({ data: { status } })` fails on its first run, from Prisma, raw SQL or psql.
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient, type Role } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { fail } from "../middleware/errors.js";

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
export type Tx = Prisma.TransactionClient;

export const inTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => db.$transaction(fn, { timeout: 30_000 });

/** Who did it, for audit_log. */
export type Actor = { kind: "user"; userId: string; role: Role } | { kind: "system"; job?: string };
export const SYSTEM: Actor = { kind: "system" };

/** Tables guarded by the trigger. scripts/test check this list against the migration. */
type Delegate = "user" | "student" | "opportunity" | "application" | "event" | "eventRegistration";

export type Machine<S extends string> = {
  readonly entity: string;
  readonly transitions: { readonly [K in S]: readonly S[] };
  /** States from which `to` is reachable in one step. */
  froms(to: S): S[];
  /** Insert a row born in `state` (must be in `entry`). `data` may hold nested creates. Audited. */
  create(tx: Tx, data: Record<string, unknown>, actor: Actor, opts?: { state?: S; meta?: object }): Promise<{ id: string }>;
  /**
   * Move one row to `to`. Idempotent: already in `to` is a no-op (no audit). Compare-and-set update,
   * so concurrent moves cannot both win. `where` scopes the lookup (invisible = NOT_FOUND).
   * `extra` sets companion columns in the same UPDATE.
   */
  move(tx: Tx, id: string, to: S, actor: Actor, opts?: MoveOpts): Promise<{ changed: boolean; from: S }>;
  moveMany(tx: Tx, ids: readonly string[], to: S, actor: Actor, opts?: MoveOpts): Promise<{ changed: string[] }>;
};
type MoveOpts = { meta?: object; extra?: Record<string, unknown>; where?: Record<string, unknown> };

export function defineMachine<S extends string>(cfg: {
  delegate: Delegate;
  entity: string;
  field?: string;
  entry: readonly [S, ...S[]];
  transitions: { readonly [K in S]: readonly S[] };
}): Machine<S> {
  const field = cfg.field ?? "status";
  // ponytail: `any` is confined to this line; Prisma has no type for "a delegate chosen at runtime".
  const d = (tx: Tx) => (tx as any)[cfg.delegate];
  const froms = (to: S) => (Object.keys(cfg.transitions) as S[]).filter((k) => cfg.transitions[k].includes(to));

  const guarded = async <T>(tx: Tx, fn: () => Promise<T>): Promise<T> => {
    await tx.$executeRaw`select set_config('app.transition', 'on', true)`;
    const out = await fn();
    // Reset only on success: on error Postgres aborts the transaction (and the flag with it),
    // and a reset query there would mask the real error (e.g. P2002 -> ALREADY_APPLIED).
    await tx.$executeRaw`select set_config('app.transition', 'off', true)`;
    return out;
  };

  const move: Machine<S>["move"] = async (tx, id, to, actor, opts = {}) => {
    const row = await d(tx).findFirst({ where: { ...opts.where, id }, select: { [field]: true } });
    if (!row) fail("NOT_FOUND", { entity: cfg.entity, id });
    const from = row[field] as S;
    if (from === to) return { changed: false, from };
    if (!cfg.transitions[from].includes(to)) fail("INVALID_TRANSITION", { entity: cfg.entity, id, from, to });
    const { count } = await guarded<{ count: number }>(tx, () =>
      d(tx).updateMany({ where: { id, [field]: from }, data: { ...opts.extra, [field]: to } }),
    );
    if (count === 0) fail("CONFLICT", { entity: cfg.entity, id, reason: "changed concurrently, retry" });
    await audit(tx, actor, `${cfg.entity}.${from}->${to}`, cfg.entity, id, opts.meta);
    return { changed: true, from };
  };

  return {
    entity: cfg.entity,
    transitions: cfg.transitions,
    froms,
    async create(tx, data, actor, opts = {}) {
      const state = opts.state ?? cfg.entry[0];
      if (!cfg.entry.includes(state)) fail("INVALID_TRANSITION", { entity: cfg.entity, to: state });
      const row = await guarded<{ id: string }>(tx, () => d(tx).create({ data: { ...data, [field]: state }, select: { id: true } }));
      await audit(tx, actor, `${cfg.entity}.created`, cfg.entity, row.id, { state, ...opts.meta });
      return row;
    },
    move,
    // Same contract as calling move() per id, in a constant number of round trips: one read, one
    // compare-and-set UPDATE per distinct source state (a handful at most), one audit insert.
    async moveMany(tx, ids, to, actor, opts = {}) {
      const unique = [...new Set(ids)];
      const rows: { id: string; [k: string]: string }[] = await d(tx).findMany({ where: { ...opts.where, id: { in: unique } }, select: { id: true, [field]: true } });
      const fromOf = new Map(rows.map((r) => [r.id, r[field] as S]));
      const byFrom = new Map<S, string[]>();
      for (const id of unique) {
        const from = fromOf.get(id);
        if (!from) fail("NOT_FOUND", { entity: cfg.entity, id });
        if (from === to) continue;
        if (!cfg.transitions[from].includes(to)) fail("INVALID_TRANSITION", { entity: cfg.entity, id, from, to });
        byFrom.set(from, [...(byFrom.get(from) ?? []), id]);
      }
      const changed = unique.filter((id) => fromOf.get(id) !== to);
      if (!changed.length) return { changed };
      await guarded(tx, async () => {
        for (const [from, group] of byFrom) {
          const { count } = await d(tx).updateMany({ where: { id: { in: group }, [field]: from }, data: { ...opts.extra, [field]: to } });
          if (count !== group.length) fail("CONFLICT", { entity: cfg.entity, reason: "changed concurrently, retry" });
        }
      });
      await tx.auditLog.createMany({
        data: changed.map((id) => ({ ...auditRow(actor, opts.meta), action: `${cfg.entity}.${fromOf.get(id)}->${to}`, entity: cfg.entity, entity_id: id })),
      });
      return { changed };
    },
  };
}

/** Audit for non-status events (profile edits by admin, imports, file deletes). Status changes use Machine. */
export async function audit(tx: Tx, actor: Actor, action: string, entity: string, entityId: string, metadata: object = {}) {
  await tx.auditLog.create({ data: { ...auditRow(actor, metadata), action, entity, entity_id: entityId } });
}

const auditRow = (actor: Actor, metadata: object = {}) => ({
  actor_kind: actor.kind,
  actor_user_id: actor.kind === "user" ? actor.userId : null,
  metadata: metadata as Prisma.InputJsonValue,
});

/** P2002 (unique violation) -> domain error code. */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
