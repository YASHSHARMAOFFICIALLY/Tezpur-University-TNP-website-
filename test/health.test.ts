import { describe, expect, it } from "vitest";
import { assess } from "../src/modules/system/system.service.js";

const GB = 1024 ** 3;
const healthy = {
  database: { ok: true, latency_ms: 2 },
  worker: { alive: true, last_tick_at: new Date() },
  jobs: { last_finished_at: new Date(), queued: 0, failed: 0 },
  email: { queued: 0, sent_24h: 0, failed: 0, daily_cap: null },
  backup: { last_ok_at: new Date(), last_status: "ok", last_detail: null },
  storage: { free_bytes: 50 * GB, total_bytes: 100 * GB, uploads_bytes: 0 },
  errors_24h: 0,
};
const withFree = (gb: number) => ({ ...healthy, storage: { ...healthy.storage, free_bytes: gb * GB } });

describe("system health assessment", () => {
  it("is ok when every signal is healthy", () => {
    expect(assess(healthy as never, Date.now())).toEqual({ status: "ok", problems: [] });
  });
  it("reports exactly one disk message per level", () => {
    expect(assess(withFree(10) as never, Date.now())).toEqual({ status: "warning", problems: ["The upload disk is more than 85% full"] });
    expect(assess(withFree(3) as never, Date.now())).toEqual({ status: "problem", problems: ["The upload disk is almost full. Ask IT for more space."] });
  });
  it("flags a missing backup as a problem", () => {
    const r = assess({ ...healthy, backup: { last_ok_at: null, last_status: "never", last_detail: null } } as never, Date.now());
    expect(r.status).toBe("problem");
    expect(r.problems).toEqual(["No backup in the last 48 hours"]);
  });
});
