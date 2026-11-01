import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { trackProcesses } from "./proc.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://tnp:tnp@localhost:5434/tnp_test";
const DB_NAME = new URL(DB_URL).pathname.slice(1);
const RESTORE_DB = `${DB_NAME}_restore`;
const RESTORE_URL = DB_URL.replace(/\/[^/?]+(\?|$)/, `/${RESTORE_DB}$1`);
const ADMIN_URL = DB_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fix-d-"));
const SECRET = "0123456789abcdef0123456789abcdef0123";
const { run: spawnTracked } = trackProcesses();

const run = (cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) => {
  const r = spawnTracked(cmd, args, { cwd: opts.cwd ?? ROOT, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...opts.env } });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
};
const psql = (url: string, sql: string) => {
  const r = run("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql]);
  expect(r.code, r.out).toBe(0);
  return r.out.trim();
};

afterAll(() => {
  psql(ADMIN_URL, `drop database if exists ${RESTORE_DB}`);
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("D3 production env refuses unsafe config", () => {
  const prodEnv = { NODE_ENV: "production", DATABASE_URL: DB_URL, JWT_SECRET: SECRET, OTP_SECRET: SECRET, SMTP_HOST: "smtp.tezu.ac.in" };
  const loadEnv = (env: Record<string, string | undefined>) =>
    run(path.join(ROOT, "node_modules/.bin/tsx"), ["-e", `import(${JSON.stringify(path.join(ROOT, "src/config/env.ts"))})`], { cwd: TMP, env });

  it("starts with real secrets and SMTP", () => {
    const r = loadEnv(prodEnv);
    expect(r.code, r.out).toBe(0);
  });
  it("refuses the .env.example placeholder secrets", () => {
    const example = Object.fromEntries(
      fs.readFileSync(path.join(ROOT, ".env.example"), "utf8").split("\n").map((l) => l.split("=", 2) as [string, string]),
    );
    for (const key of ["JWT_SECRET", "OTP_SECRET"]) {
      const r = loadEnv({ ...prodEnv, [key]: example[key] });
      expect(r.code, `production must refuse the example ${key}`).not.toBe(0);
      expect(r.out).toContain(key);
    }
  });
  it("refuses an unset SMTP_HOST, which would mark mail sent without sending it", () => {
    for (const SMTP_HOST of [undefined, ""]) {
      const r = loadEnv({ ...prodEnv, SMTP_HOST });
      expect(r.code, `production must refuse SMTP_HOST=${SMTP_HOST}`).not.toBe(0);
      expect(r.out).toContain("SMTP_HOST");
    }
  });
  it("still allows placeholders outside production", () => {
    const r = loadEnv({ ...prodEnv, NODE_ENV: "development", JWT_SECRET: "change-me-change-me-change-me-change-me", SMTP_HOST: undefined });
    expect(r.code, r.out).toBe(0);
  });
});

describe("D2 container start checks UPLOAD_DIR", () => {
  const cmd = JSON.parse(/^CMD (.+)$/m.exec(fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8"))![1]!) as string[];
  const bin = path.join(TMP, "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const stub of ["npx", "node"]) fs.writeFileSync(path.join(bin, stub), `#!/bin/sh\necho "${stub} $*" >> "$STUB_LOG"\n`, { mode: 0o755 });
  const start = (uploadDir: string) => {
    const log = path.join(TMP, `stub-${path.basename(uploadDir)}.log`);
    const r = spawnTracked(cmd[0]!, cmd.slice(1), { cwd: ROOT, env: { PATH: `${bin}:${process.env.PATH}`, UPLOAD_DIR: uploadDir, STUB_LOG: log } });
    return { code: r.status, out: `${r.stdout}${r.stderr}`, ran: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "" };
  };

  it("fails loudly before migrating when the upload dir is not writable", () => {
    const ro = path.join(TMP, "root-owned-uploads");
    fs.mkdirSync(ro);
    fs.chmodSync(ro, 0o555);
    const r = start(ro);
    expect(r.code, "start must exit non-zero on an unwritable UPLOAD_DIR").not.toBe(0);
    expect(r.out).toContain("not a writable directory");
    expect(r.ran, "nothing may start after the check fails").toBe("");
  });
  it("migrates then starts the server when the upload dir is writable", () => {
    const rw = path.join(TMP, "writable-uploads");
    fs.mkdirSync(rw);
    const r = start(rw);
    expect(r.code, r.out).toBe(0);
    expect(r.ran).toBe("npx prisma migrate deploy\nnode dist/src/server.js\n");
  });
});

describe("D1 the documented seed runs in the image layout (no src/)", () => {
  it("README seeds with prisma db seed, and the configured seed command works without src/", () => {
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme, "README deploy step must use the configured seed").toContain("exec app npx prisma db seed");

    const image = path.join(TMP, "image");
    fs.mkdirSync(image);
    run(path.join(ROOT, "node_modules/.bin/tsc"), ["-p", ".", "--outDir", path.join(image, "dist")]);
    expect(fs.existsSync(path.join(image, "dist/prisma/seed.js")), "tsc must emit dist/prisma/seed.js").toBe(true);
    for (const f of ["package.json", "prisma.config.ts", "prisma"]) fs.cpSync(path.join(ROOT, f), path.join(image, f), { recursive: true });
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(image, "node_modules"));

    const r = run(path.join(ROOT, "node_modules/.bin/prisma"), ["db", "seed"], {
      cwd: image,
      env: { NODE_ENV: "production", DATABASE_URL: DB_URL, JWT_SECRET: SECRET, OTP_SECRET: SECRET, SMTP_HOST: "localhost", SEED_ADMIN_EMAIL: "tpo-fixd@tezu.ac.in", SEED_ADMIN_PASSWORD: "seed-pass-123" },
    });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/(created admin tpo-fixd@tezu\.ac\.in|admin tpo-fixd@tezu\.ac\.in already exists)/);
    expect(psql(DB_URL, "select role from users where email = 'tpo-fixd@tezu.ac.in'")).toBe("admin");
  });
});

describe("D4 backup and restore", () => {
  const backupDir = path.join(TMP, "backups");
  const uploads = path.join(TMP, "uploads");
  const base = { BACKUP_DIR: backupDir, PG_SERVICE: "postgres", PG_DB: DB_NAME, UPLOADS: uploads, ALLOW_LOCAL_BACKUP: "1" };
  const backup = (env: Record<string, string | undefined> = {}) => run("sh", ["deploy/backup.sh"], { env: { ...base, ...env } });
  const lastRun = () => psql(DB_URL, "select ok || ' ' || coalesce(detail, '') from backup_runs order by id desc limit 1");
  const published = () => fs.readdirSync(backupDir).filter((n) => !n.startsWith("."));
  const nextSecond = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
  const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const counts = (url: string) =>
    psql(url, `select string_agg(table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', table_name), false, true, '')))[1]::text, ' ' order by table_name)
               from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_prisma_migrations'`);
  fs.mkdirSync(backupDir);
  fs.mkdirSync(path.join(uploads, "resume"), { recursive: true });
  fs.writeFileSync(path.join(uploads, "resume/a.pdf"), "%PDF-1.4 fix-d");

  it("refuses a BACKUP_DIR on the server's own disk and records the refusal", () => {
    const r = backup({ ALLOW_LOCAL_BACKUP: undefined });
    expect(r.code, "a local BACKUP_DIR must be refused").not.toBe(0);
    expect(r.out).toContain("own disk");
    expect(lastRun()).toMatch(/^false exit 1: .*own disk/);
    expect(published()).toEqual([]);
  });

  let good = "";
  let atDump = "";
  it("publishes a verified backup and records it ok", () => {
    psql(DB_URL, "insert into backup_runs (started_at, ok, detail) values (now(), true, 'fix-d marker')");
    atDump = counts(DB_URL);
    const r = backup();
    expect(r.code, r.out).toBe(0);
    expect(published()).toHaveLength(1);
    good = path.join(backupDir, published()[0]!);
    expect(fs.readdirSync(good).sort()).toEqual(["db.dump", "uploads.tgz"]);
    expect(lastRun()).toMatch(new RegExp(`^true ${path.basename(good)} db.dump`));
  });

  it("a failed rerun leaves the good backup untouched, no staging, and records the failure", () => {
    const before = { db: sha(path.join(good, "db.dump")), up: sha(path.join(good, "uploads.tgz")) };
    nextSecond();
    const r = backup({ UPLOADS: path.join(TMP, "missing-uploads") });
    expect(r.code, "backup with a missing uploads dir must fail").not.toBe(0);
    expect(fs.readdirSync(backupDir), "only the good backup remains").toEqual([path.basename(good)]);
    expect({ db: sha(path.join(good, "db.dump")), up: sha(path.join(good, "uploads.tgz")) }).toEqual(before);
    expect(lastRun()).toMatch(/^false exit/);
  });

  it("refuses to publish a dump that pg_restore cannot read", () => {
    const shim = path.join(TMP, "corrupt-bin");
    fs.mkdirSync(shim);
    fs.writeFileSync(path.join(shim, "docker"), `#!/bin/sh\ncase "$*" in *pg_dump*) echo garbage; exit 0;; esac\nexec ${JSON.stringify(run("sh", ["-c", "command -v docker"]).out.trim())} "$@"\n`, { mode: 0o755 });
    nextSecond();
    const r = run("sh", ["deploy/backup.sh"], { env: { ...base, PATH: `${shim}:${process.env.PATH}` } });
    expect(r.code, "an unreadable dump must not be recorded ok").not.toBe(0);
    expect(fs.readdirSync(backupDir)).toEqual([path.basename(good)]);
    expect(lastRun()).toMatch(/^false exit/);
  });

  it("restores into a scratch database with matching row counts, twice", () => {
    psql(ADMIN_URL, `drop database if exists ${RESTORE_DB}`);
    psql(ADMIN_URL, `create database ${RESTORE_DB}`);
    const target = path.join(TMP, "restored", "uploads");
    fs.mkdirSync(path.dirname(target));
    for (const pass of [1, 2]) {
      const r = run("sh", ["deploy/restore.sh", good], { env: { PG_SERVICE: "postgres", PG_DB: RESTORE_DB, UPLOADS: target } });
      expect(r.code, `restore pass ${pass}: ${r.out}`).toBe(0);
      expect(counts(RESTORE_URL), `row counts after restore pass ${pass}`).toBe(atDump);
      expect(fs.readFileSync(path.join(target, "resume/a.pdf"), "utf8")).toBe("%PDF-1.4 fix-d");
    }
    expect(atDump).toMatch(/backup_runs=[1-9]/);
    expect(atDump).toMatch(/users=[1-9]/);
    expect(fs.readdirSync(path.dirname(target)).filter((n) => n.startsWith("uploads.before-restore-")), "pass 2 kept the previous uploads").toHaveLength(1);
  });
});
