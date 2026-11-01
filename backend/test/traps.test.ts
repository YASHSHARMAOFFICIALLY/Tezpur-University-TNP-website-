// An EXIT/ERR trap that writes to >&2 in a script that also runs steps under `2>>file` inherits that
// redirect when a step fails, so the trap can write into (or cat a file onto) itself. deploy/backup.sh
// once filled the disk this way. Saving the real stderr first (`exec 3>&2`) and writing to >&3 is safe.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(ROOT, "test/fixtures");
const SKIP = new Set(["node_modules", ".git", "dist"]);

function handlerBody(src: string, handler: string) {
  if (/^\w+$/.test(handler)) return new RegExp(`^${handler}\\s*\\(\\)\\s*\\{[\\s\\S]*?^\\}`, "m").exec(src)?.[0] ?? "";
  return handler;
}

function trapProblem(src: string): string | null {
  const traps = [...src.matchAll(/^\s*trap\s+('[^']*'|"[^"]*"|\S+)\s+([^\n#]*)/gm)].filter((m) => /\b(EXIT|ERR|0)\b/.test(m[2]!));
  const writesStderr = traps.some((m) => />&2/.test(handlerBody(src, m[1]!.replace(/^['"]|['"]$/g, ""))));
  const stderrToFile = /(^|\s)2>>?\s*(?!&|\/dev\/null)\S/m.test(src);
  if (writesStderr && stderrToFile && !/^\s*exec 3>&2\b/m.test(src))
    return "EXIT/ERR trap writes to >&2 while steps redirect stderr into a file; add `exec 3>&2` and write to >&3";
  return null;
}

function shellScripts(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) || p === FIXTURES ? [] : shellScripts(p);
    if (!e.isFile()) return [];
    if (e.name.endsWith(".sh")) return [p];
    const fd = fs.openSync(p, "r");
    const head = Buffer.alloc(64);
    fs.readSync(fd, head, 0, 64, 0);
    fs.closeSync(fd);
    return /^#!.*\b(ba|da|z)?sh\b/.test(head.toString("utf8").split("\n")[0]!) ? [p] : [];
  });
}

describe("shell trap stderr check", () => {
  it("flags the old backup.sh trap pattern", () => {
    expect(trapProblem(fs.readFileSync(path.join(FIXTURES, "backup-trap-selfappend.sh"), "utf8"))).toMatch(/exec 3>&2/);
  });

  it("finds the repo's shell scripts, including deploy/backup.sh", () => {
    expect(shellScripts(ROOT).map((p) => path.relative(ROOT, p))).toContain("deploy/backup.sh");
  });

  it("no shell script in the repo has the self-appending trap", () => {
    const bad = shellScripts(ROOT).flatMap((p) => {
      const problem = trapProblem(fs.readFileSync(p, "utf8"));
      return problem ? [`${path.relative(ROOT, p)}: ${problem}`] : [];
    });
    expect(bad.join("\n")).toBe("");
  });
});
