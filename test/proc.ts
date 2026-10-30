// Shell-outs from tests run in their own process group, so a timeout kills the whole tree. A spawnSync
// timeout that killed only the direct child once left grandchild `cat` loops writing 18.7 GB.
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { afterEach } from "vitest";

const alive = (pgid: number) => {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
};
const killGroup = (pgid: number) => {
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {}
};
const settle = (pgid: number) => {
  for (let i = 0; i < 50 && alive(pgid); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  return !alive(pgid);
};

export function trackProcesses() {
  const groups = new Set<number>();
  // Kills and returns the groups that still have a live process.
  const reap = () => {
    const leaked = [...groups].filter((g) => !settle(g));
    for (const g of leaked) killGroup(g);
    groups.clear();
    return leaked;
  };
  afterEach(() => {
    const leaked = reap();
    if (leaked.length) throw new Error(`test left processes running in group(s) ${leaked.join(", ")}`);
  });
  const run = (cmd: string, args: string[], opts: Omit<SpawnSyncOptions, "encoding" | "detached"> = {}) => {
    // Node honours `detached` in spawnSync (setsid), though @types/node omits it.
    const r = spawnSync(cmd, args, { ...opts, encoding: "utf8", ...{ detached: true } });
    if (r.pid) {
      groups.add(r.pid);
      if (r.error || r.signal) killGroup(r.pid);
    }
    return r;
  };
  return { run, reap };
}
