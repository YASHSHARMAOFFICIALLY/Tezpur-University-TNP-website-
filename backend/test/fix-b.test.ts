import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import type { AuthUser } from "../src/middleware/auth.js";
import { applicationMachine } from "../src/modules/applications/applications.repository.js";
import { publishResults, submitResults } from "../src/modules/applications/applications.service.js";
import { freshDbWithAdmin } from "./helpers.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One company with one approved posting and `n` applications in `status`. Fixture only, so it writes past Machine. */
async function seed(n: number, status: string) {
  const tag = randomUUID().slice(0, 8);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.transition', 'on', true)`;
    const [c] = await tx.$queryRaw<{ id: string }[]>`insert into companies (id, name) values (gen_random_uuid(), ${"Co " + tag}) returning id`;
    const [u] = await tx.$queryRaw<{ id: string }[]>`
      insert into users (id, role, email, password_hash, name, status, company_id)
      values (gen_random_uuid(), 'company', ${"hr-" + tag + "@co.example"}, 'x', 'HR', 'active', ${c!.id}) returning id`;
    const [o] = await tx.$queryRaw<{ id: string }[]>`
      insert into opportunities (id, company_id, type, title, description, apply_deadline, eligibility, selection_process, status, posted_by)
      values (gen_random_uuid(), ${c!.id}, 'job', ${"Role " + tag}, 'd', now() + interval '7 days', '{}', '{}', 'approved', ${u!.id}) returning id`;
    await tx.$executeRawUnsafe(
      `with su as (
         insert into users (id, role, email, password_hash, name, status)
         select gen_random_uuid(), 'student', '${tag}-' || g || '@tezu.ac.in', 'x', 'S' || g, 'active' from generate_series(1, ${n}) g
         returning id, email),
       st as (
         insert into students (id, user_id, enrolment_no, academic_standing)
         select gen_random_uuid(), id, email, 'good' from su returning id)
       insert into applications (id, opportunity_id, student_id, eligibility_result, status)
       select gen_random_uuid(), '${o!.id}', id, '{}', '${status}' from st`,
    );
    const apps = await tx.application.findMany({ where: { opportunity_id: o!.id }, select: { id: true }, orderBy: { id: "asc" } });
    const recruiter = { id: u!.id, role: "company", email: "hr", name: "HR", status: "active", mustChangePassword: false, companyId: c!.id } as AuthUser<"company">;
    return { oppId: o!.id, recruiter, appIds: apps.map((a) => a.id) };
  }, { timeout: 60_000 });
}

const codeOf = (p: Promise<unknown>) => p.then(() => "resolved", (e: { code?: string }) => e.code ?? String(e));
const statusOf = async (id: string) => (await db.application.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  await freshDbWithAdmin();
});

describe("B1 results ownership", () => {
  it("rejects an empty selection for another company's posting and dedupes ids", async () => {
    const a = await seed(2, "shortlisted");
    const b = await seed(1, "shortlisted");
    expect(await codeOf(submitResults(b.recruiter, a.oppId, [])), "foreign posting with empty ids").toBe("NOT_FOUND");
    expect(await db.result.findUnique({ where: { opportunity_id: a.oppId } }), "no result written for the foreign posting").toBeNull();

    await submitResults(a.recruiter, a.oppId, [a.appIds[0]!, a.appIds[0]!]);
    const r = await db.result.findUniqueOrThrow({ where: { opportunity_id: a.oppId } });
    expect(r.selected_application_ids, "duplicate ids stored once").toEqual([a.appIds[0]]);
  });
});

describe("B2 submit/publish ordering", () => {
  it("publishing results closes the posting, audited", async () => {
    const s = await seed(2, "shortlisted");
    await submitResults(s.recruiter, s.oppId, [s.appIds[0]!]);
    expect(await publishResults(s.oppId, SYSTEM)).toEqual({ selected: 1, rejected: 1 });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id: s.oppId } })).status, "posting closed").toBe("closed");
    const audit = await db.auditLog.findMany({ where: { entity_id: s.oppId, action: "opportunity.approved->closed" } });
    expect(audit, "close audited once").toHaveLength(1);
    expect((await publishResults(s.oppId, SYSTEM)).selected, "republish is a no-op").toBe(1);
  });

  it("a submit racing a publish cannot change the published selection", async () => {
    const s = await seed(2, "shortlisted");
    await submitResults(s.recruiter, s.oppId, [s.appIds[0]!]);
    let racing!: Promise<string>;
    await db.$transaction(async (tx) => {
      await tx.result.update({ where: { opportunity_id: s.oppId }, data: { published_at: new Date() } });
      racing = codeOf(submitResults(s.recruiter, s.oppId, [s.appIds[1]!]));
      await sleep(400);
    });
    expect(await racing, "submit after publication commits is refused").toBe("INVALID_TRANSITION");
    const r = await db.result.findUniqueOrThrow({ where: { opportunity_id: s.oppId } });
    expect(r.selected_application_ids, "published selection unchanged").toEqual([s.appIds[0]]);
  });

  it("a publish racing a resubmit uses the committed selection", async () => {
    const s = await seed(2, "shortlisted");
    const [first, second] = s.appIds as [string, string];
    await submitResults(s.recruiter, s.oppId, [first]);
    let racing!: Promise<unknown>;
    await db.$transaction(async (tx) => {
      await tx.result.update({ where: { opportunity_id: s.oppId }, data: { selected_application_ids: [second] } });
      racing = publishResults(s.oppId, SYSTEM);
      await sleep(400);
    });
    await racing;
    expect(await statusOf(second), "resubmitted pick is selected").toBe("selected");
    expect(await statusOf(first), "dropped pick is rejected").toBe("rejected");
  });
});

describe("B3 moveMany in bulk", () => {
  it("moves 3,000 rows well inside the transaction timeout, audited once each, idempotent", async () => {
    const s = await seed(3000, "applied");
    const t0 = Date.now();
    const { changed } = await inTx((tx) => applicationMachine.moveMany(tx, s.appIds, "released_to_recruiter", SYSTEM, { where: { opportunity_id: s.oppId } }));
    const ms = Date.now() - t0;
    expect(changed, "every id changed, in input order").toEqual(s.appIds);
    expect(ms, "3,000 moves take under 5 s").toBeLessThan(5_000);
    const audited = () => db.auditLog.count({ where: { entity: "application", entity_id: { in: s.appIds }, action: "application.applied->released_to_recruiter" } });
    expect(await audited(), "one audit row per move").toBe(3000);

    const again = await inTx((tx) => applicationMachine.moveMany(tx, [...s.appIds.slice(0, 5), s.appIds[0]!], "released_to_recruiter", SYSTEM));
    expect(again.changed, "already in target is a no-op").toEqual([]);
    expect(await audited(), "no-op writes no audit").toBe(3000);
  });

  it("keeps NOT_FOUND and INVALID_TRANSITION, and rolls back the whole batch", async () => {
    const s = await seed(2, "applied");
    const [a, b] = s.appIds as [string, string];
    expect(await codeOf(inTx((tx) => applicationMachine.moveMany(tx, [a, randomUUID()], "released_to_recruiter", SYSTEM))), "unknown id").toBe("NOT_FOUND");
    expect(await codeOf(inTx((tx) => applicationMachine.moveMany(tx, [a, b], "released_to_recruiter", SYSTEM, { where: { opportunity_id: randomUUID() } }))), "out of scope").toBe("NOT_FOUND");
    expect(await codeOf(inTx((tx) => applicationMachine.moveMany(tx, [a, b], "selected", SYSTEM))), "illegal step").toBe("INVALID_TRANSITION");
    expect([await statusOf(a), await statusOf(b)], "nothing moved").toEqual(["applied", "applied"]);

    const { changed } = await inTx((tx) => applicationMachine.moveMany(tx, [b, a], "released_to_recruiter", SYSTEM, { meta: { why: "t" } }));
    expect(changed, "input order").toEqual([b, a]);
    const rows = await db.auditLog.findMany({ where: { entity_id: { in: [a, b] } }, orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.entity_id, r.action, r.metadata, r.actor_kind]), "audit rows match single move()").toEqual([
      [b, "application.applied->released_to_recruiter", { why: "t" }, "system"],
      [a, "application.applied->released_to_recruiter", { why: "t" }, "system"],
    ]);
  });
});
