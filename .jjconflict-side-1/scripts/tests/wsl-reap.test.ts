// bun test for scripts/wsl-reap.ts — the orphan predicate and the probe parser.
//
// The predicate is the only decision here that can stop a process, so it is pinned against every
// shape a LIVE session takes. The cases come from r99 on 2026-09-22: the 9 orphans were `sshd -R`
// children of the sshd service with no child and no socket, while the healthy connection beside
// them was `sshd -R` -> `sshd -z` -> pwsh with a socket. CPU time must never select: a days-long
// herdr session accumulates it legitimately.
import { describe, expect, test } from "bun:test";

import {
  classifyOrphans,
  killScript,
  parseProbe,
  type SshdProc,
} from "../wsl-reap";

const SVC = 4416;

function proc(over: Partial<SshdProc>): SshdProc {
  return {
    name: "sshd.exe",
    pid: 22976,
    ppid: SVC,
    isR: true,
    hasChild: false,
    hasSocket: false,
    cpuSeconds: 58_108,
    bornMs: 1_758_464_820_000,
    ...over,
  };
}

const services = new Set([SVC]);
const pids = (ps: SshdProc[]) => ps.map((p) => p.pid);

describe("classifyOrphans — structural, never by CPU time", () => {
  test("the measured orphan: service child, -R, no child, no socket -> reaped", () => {
    expect(pids(classifyOrphans([proc({})], services))).toEqual([22976]);
  });

  test("a live session has a -z child -> kept", () => {
    expect(classifyOrphans([proc({ hasChild: true })], services)).toEqual([]);
  });

  test("a live session owns a socket -> kept", () => {
    expect(classifyOrphans([proc({ hasSocket: true })], services)).toEqual([]);
  });

  test("a days-long live session with huge CPU is still kept", () => {
    const herdr = proc({
      cpuSeconds: 900_000,
      hasChild: true,
      hasSocket: true,
    });
    expect(classifyOrphans([herdr], services)).toEqual([]);
  });

  test("the service listener itself (no -R, parent services.exe) -> kept", () => {
    const listener = proc({
      pid: SVC,
      ppid: 1420,
      isR: false,
      hasSocket: true,
    });
    expect(classifyOrphans([listener], services)).toEqual([]);
  });

  test("a `sshd -z` child (parent is the -R, not the service) -> kept", () => {
    const z = proc({ pid: 13816, ppid: 22960, isR: false });
    expect(classifyOrphans([z], services)).toEqual([]);
  });

  test("an -R whose parent is NOT an sshd service -> kept", () => {
    expect(classifyOrphans([proc({ ppid: 9999 })], services)).toEqual([]);
  });

  test("the service was renamed (sshd -> sshd10): its pid still counts as a parent", () => {
    const sshd10 = 7123;
    const orphan = proc({ ppid: sshd10 });
    expect(pids(classifyOrphans([orphan], new Set([SVC, sshd10])))).toEqual([
      22976,
    ]);
  });

  test("mixed set: only the orphans come back", () => {
    const set = [
      proc({ pid: 1 }),
      proc({ pid: 2, hasChild: true }),
      proc({ pid: 3, hasSocket: true }),
      proc({ pid: 4 }),
    ];
    expect(pids(classifyOrphans(set, services))).toEqual([1, 4]);
  });
});

describe("parseProbe — errors lean safe", () => {
  const sample = [
    "svc=4416",
    "sock_ok=1",
    "proc=sshd.exe|4416|1420|0|1|1|1|1757640000000",
    "proc=sshd.exe|22976|4416|1|0|0|58108|1758464820000",
    "proc=sshd.exe|22960|4416|1|1|0|0|1758523560000",
  ].join("\r\n");

  test("reads services, processes and flags (CRLF tolerated)", () => {
    const { procs, servicePids } = parseProbe(sample);
    expect([...servicePids]).toEqual([4416]);
    expect(procs).toHaveLength(3);
    expect(procs[1]).toEqual({
      name: "sshd.exe",
      pid: 22976,
      ppid: 4416,
      isR: true,
      hasChild: false,
      hasSocket: false,
      cpuSeconds: 58108,
      bornMs: 1758464820000,
    });
  });

  test("end to end: only the socketless childless -R is an orphan", () => {
    const { procs, servicePids } = parseProbe(sample);
    expect(pids(classifyOrphans(procs, servicePids))).toEqual([22976]);
  });

  test("an unreadable socket table keeps EVERYTHING (cannot prove socketless)", () => {
    const { procs, servicePids } = parseProbe(
      sample.replace("sock_ok=1", "sock_ok=0"),
    );
    expect(procs.every((p) => p.hasSocket)).toBe(true);
    expect(classifyOrphans(procs, servicePids)).toEqual([]);
  });

  test("a missing sock_ok line is treated as unreadable, too", () => {
    const { procs, servicePids } = parseProbe(
      sample.replace("sock_ok=1\r\n", ""),
    );
    expect(classifyOrphans(procs, servicePids)).toEqual([]);
  });

  test("malformed and noise lines are ignored", () => {
    const { procs } = parseProbe(
      "#< CLIXML\nproc=sshd.exe|abc|1|1|0|0|1|1\nproc=sshd.exe|5|4416|1|0|0|1\nproc=ssh.exe|5|4416|1|0|0|1|1\n",
    );
    expect(procs).toEqual([]);
  });
});

// OpenSSH 10.0 moved per-connection work into sshd-session.exe. The tree below is r99 as measured
// on 2026-09-22 right after the upgrade: listener -> `sshd-session -R` -> `sshd-session -z`. A
// probe that only knew sshd.exe saw one process here and called the box clean while blind.
describe("OpenSSH 10.0 layout — sshd-session.exe", () => {
  const live10 = [
    "svc=20868",
    "sock_ok=1",
    "proc=sshd.exe|20868|1420|0|1|1|3|1758520000000",
    "proc=sshd-session.exe|24968|20868|1|1|1|1|1758530000000",
    "proc=sshd-session.exe|23396|24968|0|0|0|0|1758530001000",
  ].join("\n");

  test("the live 10.0 session is parsed and kept", () => {
    const { procs, servicePids } = parseProbe(live10);
    expect(procs.map((p) => p.name)).toEqual([
      "sshd.exe",
      "sshd-session.exe",
      "sshd-session.exe",
    ]);
    expect(classifyOrphans(procs, servicePids)).toEqual([]);
  });

  test("an orphaned `sshd-session -R` (no child, no socket) is reaped", () => {
    const withOrphan = `${live10}\nproc=sshd-session.exe|31000|20868|1|0|0|40000|1758500000000`;
    const { procs, servicePids } = parseProbe(withOrphan);
    const orphans = classifyOrphans(procs, servicePids);
    expect(orphans.map((o) => `${o.name}:${o.pid}`)).toEqual([
      "sshd-session.exe:31000",
    ]);
  });

  test("the kill check accepts either image", () => {
    const s = killScript([proc({ name: "sshd-session.exe", pid: 31000 })]);
    expect(s).toContain("'sshd-session.exe'");
    expect(s).toContain("Stop-Process -Id 31000");
  });
});

describe("killScript — a pid alone never authorizes a stop", () => {
  test("every stop is gated on the planned creation time", () => {
    const s = killScript([proc({ pid: 22976, bornMs: 1758464820000 })]);
    expect(s).toContain("ProcessId=22976");
    expect(s).toContain("ToUnixTimeMilliseconds() -eq 1758464820000");
    expect(s).toContain("Stop-Process -Id 22976");
    expect(s).toContain("skipped=22976");
  });

  test("an empty plan stops nothing", () => {
    expect(killScript([])).not.toContain("Stop-Process");
  });
});
