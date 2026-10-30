import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { Prisma, type Setting } from "../../generated/prisma/client.js";
import { audit, db, inTx, type Actor } from "../../infrastructure/db.js";
import { log } from "../../infrastructure/logger.js";
import { fail } from "../../middleware/errors.js";
import { SETTING_KEYS, SETTINGS, type SettingKey, type SettingValue } from "./settings.registry.js";

/** Stored override (a DB boundary, so re-parsed) or the registry default. */
function resolve<K extends SettingKey>(key: K, row: Pick<Setting, "value"> | null): SettingValue<K> {
  const d = SETTINGS[key];
  if (!row) return d.default as SettingValue<K>;
  const p = d.schema.safeParse(row.value);
  if (p.success) return p.data as SettingValue<K>;
  // e.g. a hard cap lowered in code below a stored override: keep working on the default.
  log.warn({ key, value: row.value }, "stored setting no longer valid, using default");
  return d.default as SettingValue<K>;
}

// Single process, so an in-memory cache is exact once writes invalidate it. `version` stops a read
// that started before a write from caching the old value after the write invalidated it.
const cache = new Map<SettingKey, unknown>();
let version = 0;
const invalidate = (key: SettingKey) => {
  version++;
  cache.delete(key);
};

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  if (cache.has(key)) return cache.get(key) as SettingValue<K>;
  const v = version;
  const value = resolve(key, await db.setting.findUnique({ where: { key } }));
  if (v === version) cache.set(key, value);
  return value;
}

const view = (key: SettingKey, row: Setting | null) => {
  const { schema: _, default: def, ...meta } = SETTINGS[key];
  return { key, value: resolve(key, row), default: def, is_overridden: row !== null, ...meta };
};

export async function listSettings() {
  const rows = new Map((await db.setting.findMany()).map((r) => [r.key, r]));
  return SETTING_KEYS.map((k) => view(k, rows.get(k) ?? null));
}

const by = (actor: Actor) => (actor.kind === "user" ? actor.userId : "system");

/** Equal to the current value = no-op, no audit row. */
export async function setSetting(key: SettingKey, raw: unknown, actor: Actor) {
  const parsed = (SETTINGS[key].schema as z.ZodType).safeParse(raw);
  if (!parsed.success) fail("VALIDATION_FAILED", { key, message: z.prettifyError(parsed.error), issues: parsed.error.issues });
  const to = parsed.data;
  const row = await inTx(async (tx) => {
    const current = await tx.setting.findUnique({ where: { key } });
    const from = resolve(key, current);
    if (isDeepStrictEqual(from, to)) return current;
    const value = to === null ? Prisma.JsonNull : (to as Prisma.InputJsonValue);
    const saved = await tx.setting.upsert({ where: { key }, create: { key, value, updated_by: by(actor) }, update: { value, updated_by: by(actor) } });
    await audit(tx, actor, "setting.updated", "setting", key, { from, to });
    return saved;
  });
  invalidate(key);
  return view(key, row);
}

/** Back to the registry default. No override = no-op, no audit row. */
export async function resetSetting(key: SettingKey, actor: Actor) {
  await inTx(async (tx) => {
    const current = await tx.setting.findUnique({ where: { key } });
    if (!current) return;
    await tx.setting.delete({ where: { key } });
    await audit(tx, actor, "setting.reset", "setting", key, { from: resolve(key, current), to: SETTINGS[key].default });
  });
  invalidate(key);
  return view(key, null);
}
