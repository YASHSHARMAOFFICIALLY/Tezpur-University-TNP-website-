import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { trackProcesses } from "./proc.js";

const { run, reap } = trackProcesses();
const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("test shell-outs run in their own process group", () => {
  it("a timeout kills grandchildren, not just the direct child", () => {
    const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "proc-")), "pid");
    const r = run("sh", ["-c", `sh -c 'echo $$ > ${pidFile}; while :; do sleep 1; done' & wait`], { timeout: 1000 });
    expect(r.error?.message).toMatch(/ETIMEDOUT/);
    const grandchild = Number(fs.readFileSync(pidFile, "utf8"));
    try {
      for (let i = 0; i < 50 && isAlive(grandchild); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      expect(isAlive(grandchild), "grandchild loop must die with the timed-out child").toBe(false);
    } finally {
      if (isAlive(grandchild)) process.kill(grandchild, "SIGKILL");
    }
  });

  it("the leak check finds a background process a command left behind", () => {
    run("sh", ["-c", "sleep 30 >/dev/null 2>&1 &"]);
    expect(reap(), "one group still alive").toHaveLength(1);
  });
});
