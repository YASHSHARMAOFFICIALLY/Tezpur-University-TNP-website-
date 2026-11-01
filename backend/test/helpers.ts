// Shared by the end-to-end test files: the app over HTTP plus a clean database.
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app.js";
import { db, inTx, SYSTEM } from "../src/infrastructure/db.js";
import { hashPassword } from "../src/infrastructure/password.js";
import { userMachine } from "../src/modules/auth/auth.service.js";

export const app = createApp();
export const api = (p: string) => "/api/v1" + p;
export const PDF = Buffer.from("%PDF-1.4\n%test\n");
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export async function lastOtp(email: string) {
  const job = await db.job.findFirst({ where: { type: "email.send", payload: { path: ["to"], equals: email } }, orderBy: { id: "desc" } });
  return /code: (\d{6})/.exec((job!.payload as { subject: string }).subject)![1]!;
}
export async function login(email: string, password: string) {
  const r = await request(app).post(api("/auth/login")).send({ email, password });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.access_token as string;
}
export const as = (token: string) => ({
  get: (p: string) => request(app).get(api(p)).set("Authorization", `Bearer ${token}`),
  post: (p: string, body?: object) => request(app).post(api(p)).set("Authorization", `Bearer ${token}`).send(body),
  put: (p: string, body: object) => request(app).put(api(p)).set("Authorization", `Bearer ${token}`).send(body),
  patch: (p: string, body: object) => request(app).patch(api(p)).set("Authorization", `Bearer ${token}`).send(body),
  delete: (p: string) => request(app).delete(api(p)).set("Authorization", `Bearer ${token}`),
  upload: (p: string, buf: Buffer, name: string) => request(app).post(api(p)).set("Authorization", `Bearer ${token}`).attach("file", buf, name),
});
export const code = (r: request.Response) => r.body?.error?.code;

/** Empties every table and returns a logged-in admin. */
export async function freshDbWithAdmin() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  // Truncate is not an UPDATE/DELETE row trigger, so the append-only audit guard does not block it.
  await db.$executeRawUnsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} cascade`);
  await inTx(async (tx) =>
    userMachine.create(tx, { role: "admin", email: "tpo@tezu.ac.in", name: "TPO", password_hash: await hashPassword("admin-pass-1"), email_verified_at: new Date() }, SYSTEM, { state: "active" }),
  );
  return as(await login("tpo@tezu.ac.in", "admin-pass-1"));
}
