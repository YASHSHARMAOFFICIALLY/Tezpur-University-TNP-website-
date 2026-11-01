// Creates/migrates the test database once per run. Same migrations as production.
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://tnp:tnp@localhost:5434/tnp_test";
  const name = new URL(url).pathname.slice(1);
  if (!/^tnp_test\w*$/.test(name)) throw new Error(`refusing to run tests against ${name}: test DB names start with tnp_test`);
  const admin = url.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
  execSync(`psql "${admin}" -tc "select 1 from pg_database where datname='${name}'" | grep -q 1 || psql "${admin}" -c "create database ${name}"`, { stdio: "inherit", shell: "/bin/sh" });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
