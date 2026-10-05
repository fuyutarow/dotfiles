import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasLiveBuildProcess,
  memoryEmergency,
  parseHostMemory,
  selectStopTargets,
  shouldReclaim,
  startTicks,
  stopCompute,
  type ComputeProcess,
} from "../wsl-capacity-recover.ts";

const p = (
  pid: number,
  comm: string,
  cgroup: string,
  uid = 1002,
): ComputeProcess => ({ pid, uid, comm, cgroup, startTicks: String(pid * 10) });

const buildProcessRecord = (uid: number, comm: string): ComputeProcess => ({
  pid: 10,
  uid,
  comm,
  startTicks: "100",
  cgroup: "0::/",
});

const GiB = 1024 ** 3;
const policy = { denyBytes: 60 * GiB, stopBytes: 30 * GiB };

describe("WSL capacity recovery decisions", () => {
  test("Windows memory needs both low availability and sustained hard reads", () => {
    expect(parseHostMemory("available_mb=700\npage_reads_s=1923\n")).toEqual({
      availableMb: 700,
      pageReadsPerSecond: 1923,
    });
    expect(parseHostMemory("available_mb=700\n")).toBeNull();
    expect(
      memoryEmergency({ availableMb: 700, pageReadsPerSecond: 1923 }),
    ).toBe(true);
    expect(memoryEmergency({ availableMb: 700, pageReadsPerSecond: 27 })).toBe(
      false,
    );
    expect(
      memoryEmergency({ availableMb: 4000, pageReadsPerSecond: 1923 }),
    ).toBe(false);
  });

  test("reclaim is suppressed above the deny line and during cooldown", () => {
    expect(shouldReclaim(61 * GiB, policy, 0, 10_000_000)).toBe(false);
    expect(shouldReclaim(50 * GiB, policy, 9_000_000, 10_000_000)).toBe(false);
    expect(shouldReclaim(50 * GiB, policy, 0, 10_000_000)).toBe(true);
    expect(shouldReclaim(20 * GiB, policy, 9_000_000, 10_000_000)).toBe(true);
  });

  test("starttime is read after a parenthesized process name", () => {
    const tail = [
      "S",
      ...Array.from({ length: 18 }, (_, i) => String(i + 4)),
      "424242",
      "23",
    ];
    expect(startTicks(`123 (name with ) spaces) ${tail.join(" ")}`)).toBe(
      "424242",
    );
    expect(startTicks("unparseable")).toBeNull();
  });

  test("only this user's compute work is selected; dedicated units are stopped whole", () => {
    const targets = selectStopTargets(
      [
        p(
          11,
          "julia",
          "0::/user.slice/user-1002.slice/user@1002.service/app.slice/sb-slb1-pins-verify.service",
        ),
        p(
          12,
          "julia",
          "0::/user.slice/user-1002.slice/user@1002.service/app.slice/sb-slb1-pins-verify.service",
        ),
        p(
          13,
          "cargo",
          "0::/user.slice/user-1002.slice/user@1002.service/app.slice/agent-resource-123.scope",
        ),
        p(14, "rustc", "0::/user.slice/user-1002.slice/session-3.scope"),
        p(
          15,
          "julia",
          "0::/user.slice/user-1002.slice/app.slice/editor.service",
        ),
        p(
          16,
          "ccc",
          "0::/user.slice/user-1002.slice/app.slice/ccc-daemon.service",
        ),
        p(
          17,
          "julia",
          "0::/user.slice/user-1001.slice/app.slice/sb-foreign.service",
          1001,
        ),
      ],
      1002,
    );
    expect(targets).toEqual([
      { kind: "unit", name: "sb-slb1-pins-verify.service" },
      { kind: "unit", name: "agent-resource-123.scope" },
      { kind: "pid", pid: 14, startTicks: "140", comm: "rustc" },
      { kind: "pid", pid: 15, startTicks: "150", comm: "julia" },
    ]);
  });

  test("build cleanup remains closed while this user's compiler is running", () => {
    expect(
      hasLiveBuildProcess(
        [buildProcessRecord(1001, "rustc"), buildProcessRecord(1002, "julia")],
        1002,
      ),
    ).toBe(false);
    expect(hasLiveBuildProcess([buildProcessRecord(1002, "cargo")], 1002)).toBe(
      true,
    );
    expect(
      hasLiveBuildProcess([buildProcessRecord(1002, "clippy-driver")], 1002),
    ).toBe(true);
  });

  test("raw process stop checks starttime and terminates only the selected PID", async () => {
    const dir = mkdtempSync(join(tmpdir(), "capacity-stop-"));
    const executable = join(dir, "julia");
    symlinkSync("/bin/sleep", executable);
    const proc = Bun.spawn([executable, "60"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    using _cleanup = {
      [Symbol.dispose]: () => {
        if (proc.exitCode === null) proc.kill();
        rmSync(dir, { recursive: true, force: true });
      },
    };
    const ticks = startTicks(readFileSync(`/proc/${proc.pid}/stat`, "utf8"));
    expect(ticks).not.toBeNull();
    expect(readFileSync(`/proc/${proc.pid}/comm`, "utf8").trim()).toBe("julia");
    await stopCompute([
      {
        kind: "pid",
        pid: proc.pid,
        startTicks: "wrong-generation",
        comm: "julia",
      },
    ]);
    expect(proc.exitCode).toBeNull();
    await stopCompute([
      {
        kind: "pid",
        pid: proc.pid,
        startTicks: ticks ?? "",
        comm: "julia",
      },
    ]);
    expect(await proc.exited).not.toBe(0);
  });
});
