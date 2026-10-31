import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromAsyncThrowable, ok } from "neverthrow";
import { fromThrowable, jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import {
  hasLiveBuildProcess,
  claimEmergencyCacheDrop,
  resetEmergencyCacheDrop,
  recordCapacityDecision,
  loadRecoveryPolicy,
  memoryEmergency,
  parseHostMemory,
  recoveryVerdictRecord,
  recoverTmpfsCapacity,
  recoverMemoryEmergency,
  selectStopTargets,
  shouldDropPageCache,
  shouldReclaim,
  startTicks,
  stopCompute,
  tmpfsUsage,
  tmpfsThreshold,
  writeRecoveryVerdict,
  type ComputeProcess,
  type CapacityDecisionContext,
} from "../wsl-capacity-recover.ts";

// The raw stop reads /proc/<pid>/stat for a process's start time (Linux procfs): declared, so macOS
// SKIPs this case instead of failing it.
const NO_PROCFS = !existsSync("/proc/self/stat");

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
const recoveryVerdictRoots: string[] = [];
const RecoveryVerdictSchema = z.looseObject({
  schema: z.literal(1),
  verdict: z.enum(["OK", "HOLD"]),
  memory_emergency: z.boolean(),
  windows_available_mb: z.number().int().nonnegative().nullable(),
  recorded_at: z.string(),
});
const DecisionSchema = z.looseObject({
  schema: z.literal(1),
  decision: z.enum(["STOP", "HOLD"]),
  reason: z.string(),
  measurements: z.looseObject({ windows_available_mb: z.number().nullable() }),
  target: z.looseObject({
    pid: z.number().nullable(),
    comm: z.string().nullable(),
  }),
  signal: z.string().nullable(),
});

function decisionContext(recordPath: string): CapacityDecisionContext {
  return {
    reason: "memory-emergency",
    disk_free_bytes: 154 * GiB,
    disk_deny_bytes: 6 * GiB,
    disk_stop_bytes: 4 * GiB,
    memory: { availableMb: 900, pageReadsPerSecond: 700 },
    recovery: null,
    recordPath,
  };
}

function decisionRecords(path: string) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .flatMap((line) => {
      const parsed = jsonOf(DecisionSchema).safeParse(line);
      expect(parsed.success).toBe(true);
      return parsed.success ? [parsed.data] : [];
    });
}

afterEach(() => {
  for (const root of recoveryVerdictRoots.splice(0)) {
    const removed = fromThrowable(() => {
      rmSync(root, { recursive: true, force: true });
    })();
    expect(removed.isOk()).toBe(true);
  }
});

describe("WSL capacity recovery decisions", () => {
  test("rate-limited emergency gets one persisted override per episode; restoration avoids STOP", async () => {
    const root = mkdtempSync(join(tmpdir(), "capacity-episode-"));
    recoveryVerdictRoots.push(root);
    const episode = join(root, "episode");
    const events: string[] = [];
    let availableMb = 900;
    const options = {
      before: { availableMb: 900, pageReadsPerSecond: 700 },
      thresholdMb: 2048,
      canAttemptDrop: () => false,
      claimEmergencyOverride: () => claimEmergencyCacheDrop(episode),
      isLeverAvailable: () => true,
      startLever: () => {
        events.push("drop");
        return true;
      },
      fallbackDrop: () => false,
      wait: () => {},
      measure: () => ({ availableMb, pageReadsPerSecond: 700 }),
      stopCompute: () => {
        events.push("stop");
      },
    };
    expect(await recoverMemoryEmergency(options)).toMatchObject({
      emergencyOverride: true,
      dropAttempted: true,
      stopped: true,
    });
    // A fresh timer invocation must not reuse the override while pressure persists.
    expect(await recoverMemoryEmergency({ ...options })).toMatchObject({
      emergencyOverride: false,
      dropAttempted: false,
      stopped: false,
    });
    expect(events).toEqual(["drop", "stop"]);
    await resetEmergencyCacheDrop(episode);
    availableMb = 3000;
    expect(await recoverMemoryEmergency(options)).toMatchObject({
      emergencyOverride: true,
      outcome: "restored",
      stopped: false,
    });
    expect(events).toEqual(["drop", "stop", "drop"]);
  });

  test("non-emergency HOLD keeps the ten-minute rate limit", async () => {
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      before: { availableMb: 900, pageReadsPerSecond: 10 },
      thresholdMb: 2048,
      stopOnFailure: false,
      canAttemptDrop: () => false,
      claimEmergencyOverride: () => {
        events.push("override");
        return true;
      },
      isLeverAvailable: () => true,
      startLever: () => {
        events.push("drop");
        return true;
      },
      fallbackDrop: () => false,
      wait: () => {},
      measure: () => ({ availableMb: 900, pageReadsPerSecond: 10 }),
      stopCompute: () => {
        events.push("stop");
      },
    });
    expect(result).toMatchObject({
      outcome: "rate-limited",
      emergencyOverride: false,
      stopped: false,
    });
    expect(events).toEqual([]);
  });

  test.each(["stamp-fault", "lever-fault", "unknown-measurement"])(
    "%s cannot authorize a memory STOP",
    async (fault) => {
      let stopped = false;
      const result = await recoverMemoryEmergency({
        before: { availableMb: 900, pageReadsPerSecond: 700 },
        thresholdMb: 2048,
        canAttemptDrop: () => false,
        claimEmergencyOverride: () => true,
        markDropAttempt: () => fault !== "stamp-fault",
        isLeverAvailable: () => true,
        startLever: () => fault !== "lever-fault",
        fallbackDrop: () => false,
        wait: () => {},
        measure: () =>
          fault === "unknown-measurement"
            ? null
            : { availableMb: 900, pageReadsPerSecond: 700 },
        stopCompute: () => {
          stopped = true;
        },
      });
      expect(result.stopped).toBe(false);
      expect(stopped).toBe(false);
    },
  );

  test("HOLD and unit stop decisions append independently readable JSON lines", async () => {
    const root = mkdtempSync(join(tmpdir(), "capacity-decisions-"));
    recoveryVerdictRoots.push(root);
    const path = join(root, "nested", "decisions.jsonl");
    const context = decisionContext(path);
    await recordCapacityDecision("HOLD", {
      ...context,
      reason: "capacity-hold",
    });
    await recordCapacityDecision(
      "STOP",
      context,
      { kind: "unit", name: "sb-test.scope" },
      "unit-stop",
    );
    expect(decisionRecords(path)).toMatchObject([
      {
        decision: "HOLD",
        signal: null,
        measurements: { windows_available_mb: 900 },
      },
      {
        decision: "STOP",
        signal: "unit-stop",
        target: { scope: "sb-test.scope" },
        thresholds: { memory_available_mb: 2048 },
        emergency_override_limit: 1,
      },
    ]);
  });
  test("writes an atomic, timestamped latest verdict consumable by admission", async () => {
    const root = mkdtempSync(join(tmpdir(), "wsl-recovery-verdict-"));
    recoveryVerdictRoots.push(root);
    const path = join(root, "state", "latest-verdict.json");
    const record = recoveryVerdictRecord(
      "HOLD",
      true,
      { availableMb: 900, pageReadsPerSecond: 900 },
      "2026-10-12T00:00:00.000Z",
    );
    await writeRecoveryVerdict(record, path);
    const parsed = jsonOf(RecoveryVerdictSchema).safeParse(
      readFileSync(path, "utf8"),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({
      schema: 1,
      verdict: "HOLD",
      memory_emergency: true,
      windows_available_mb: 900,
      recorded_at: "2026-10-12T00:00:00.000Z",
    });
  });

  test("HOLD check drops guest cache when installed lever can restore Windows memory", async () => {
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      before: { availableMb: 1100, pageReadsPerSecond: 10 },
      beforeBuffCacheMb: 15_000,
      thresholdMb: 2048,
      isLeverAvailable: () => true,
      startLever: () => {
        events.push("drop");
        return true;
      },
      fallbackDrop: () => false,
      wait: () => Promise.resolve(),
      measure: () => ({ availableMb: 2600, pageReadsPerSecond: 10 }),
      measureBuffCache: () => Promise.resolve(9000),
      canAttemptDrop: () => true,
      markDropAttempt: () => {
        events.push("stamp");
      },
      isRestored: (memory) => memory !== null && memory.availableMb >= 2048,
      stopOnFailure: false,
      stopCompute: () => {
        events.push("stop");
      },
    });
    expect(result).toMatchObject({
      dropAttempted: true,
      beforeMb: 1100,
      afterMb: 2600,
      beforeBuffCacheMb: 15_000,
      afterBuffCacheMb: 9000,
      outcome: "restored",
      stopped: false,
    });
    expect(events).toEqual(["stamp", "drop"]);
  });

  test("HOLD remains and compute is not terminated when cache drop misses the threshold", async () => {
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      before: { availableMb: 1100, pageReadsPerSecond: 10 },
      thresholdMb: 2048,
      isLeverAvailable: () => true,
      startLever: () => {
        events.push("drop");
        return true;
      },
      fallbackDrop: () => false,
      wait: () => Promise.resolve(),
      measure: () => ({ availableMb: 1200, pageReadsPerSecond: 10 }),
      canAttemptDrop: () => true,
      markDropAttempt: () => true,
      isRestored: (memory) => memory !== null && memory.availableMb >= 2048,
      stopOnFailure: false,
      stopCompute: () => {
        events.push("stop");
      },
    });
    expect(result).toMatchObject({
      dropAttempted: true,
      outcome: "no-effect",
      stopped: false,
      afterMb: 1200,
    });
    expect(events).toEqual(["drop"]);
  });

  test("page-cache lever is rate-limited to one attempt per ten minutes", () => {
    expect(shouldDropPageCache(0, 10 * 60 * 1000 - 1)).toBe(false);
    expect(shouldDropPageCache(0, 10 * 60 * 1000)).toBe(true);
  });

  test("installed drop-cache lever restores memory before compute is stopped", async () => {
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      thresholdMb: 2048,
      isLeverAvailable: () => true,
      startLever: () => {
        events.push("start");
        return true;
      },
      fallbackDrop: () => {
        events.push("fallback");
        return false;
      },
      wait: () => {
        events.push("wait");
      },
      measure: () => {
        events.push("measure");
        return { availableMb: 3000, pageReadsPerSecond: 1 };
      },
      stopCompute: () => {
        events.push("stop");
      },
      before: { availableMb: 700, pageReadsPerSecond: 1923 },
    });
    expect(result).toMatchObject({
      leverAttempted: true,
      beforeMb: 700,
      afterMb: 3000,
      outcome: "restored",
      stopped: false,
    });
    expect(events).toEqual(["start", "wait", "measure"]);
  });

  test("installed drop-cache lever with no effect is followed by TERM", async () => {
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      thresholdMb: 2048,
      isLeverAvailable: () => true,
      startLever: () => true,
      fallbackDrop: () => false,
      wait: () => {},
      measure: () => ({ availableMb: 700, pageReadsPerSecond: 1923 }),
      stopCompute: () => {
        events.push("stop");
      },
      before: { availableMb: 700, pageReadsPerSecond: 1923 },
    });
    expect(result).toMatchObject({
      leverAttempted: true,
      beforeMb: 700,
      afterMb: 700,
      outcome: "no-effect",
      stopped: true,
    });
    expect(events).toEqual(["stop"]);
  });

  test("unavailable lever retains fallback cache drop and then stops if still low", async () => {
    const events: string[] = [];
    const result = await recoverMemoryEmergency({
      thresholdMb: 2048,
      isLeverAvailable: () => false,
      startLever: () => false,
      fallbackDrop: () => {
        events.push("fallback");
        return true;
      },
      wait: () => {},
      measure: () => ({ availableMb: 700, pageReadsPerSecond: 1923 }),
      stopCompute: () => {
        events.push("stop");
      },
      before: { availableMb: 700, pageReadsPerSecond: 1923 },
    });
    expect(result).toMatchObject({
      leverAttempted: false,
      beforeMb: 700,
      afterMb: 700,
      outcome: "unavailable-fallback",
      stopped: true,
    });
    expect(events).toEqual(["fallback", "stop"]);
  });

  test("loads the host thresholds from the canonical TOML path without WSL", () => {
    const loaded = loadRecoveryPolicy();
    expect(loaded.isOk()).toBe(true);
    if (loaded.isErr()) return;
    expect(loaded.value).toEqual({
      path: "/mnt/c",
      denyBytes: 6 * GiB,
      stopBytes: 4 * GiB,
    });
  });

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

  test("tmpfs inodes HOLD below threshold and reclaim once at or above it", async () => {
    const threshold = tmpfsThreshold("80");
    expect(threshold.isOk()).toBe(true);
    if (threshold.isErr()) return;
    const events: string[] = [];
    let free = 21;
    const measure = () =>
      tmpfsUsage({
        files: 100,
        ffree: free,
        blocks: 100n,
        bavail: 50n,
        bsize: 1n,
      });
    const runTarget = () => {
      events.push("target");
      free = 19;
      return Promise.resolve({ code: 0, timedOut: false, output: "ok" });
    };
    await recoverTmpfsCapacity({
      thresholdPercent: threshold.value,
      measure,
      runTarget,
      log: (message) => {
        events.push(message);
      },
      warn: (message) => {
        events.push(message);
      },
    });
    expect(events[0]).toContain("TMPFS HOLD inodes=79/100 (79.0%)");
    expect(events[0]).toContain("bytes=0.0GiB/0.0GiB (50.0%)");

    events.length = 0;
    free = 15;
    await recoverTmpfsCapacity({
      thresholdPercent: threshold.value,
      measure,
      runTarget,
      log: (message) => {
        events.push(message);
      },
      warn: (message) => {
        events.push(message);
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toBe("target");
    expect(events[1]).toContain("reclaimed_inodes=4");
  });

  test("100% byte pressure reclaims even with only 65% inode use", async () => {
    const events: string[] = [];
    let available = 0n;
    const measure = () =>
      tmpfsUsage({
        files: 100,
        ffree: 35,
        blocks: 100n,
        bavail: available,
        bsize: 1024n * 1024n,
      });
    await recoverTmpfsCapacity({
      thresholdPercent: 80,
      measure,
      runTarget: () => {
        events.push("target");
        available = 30n;
        return Promise.resolve({
          code: 0,
          timedOut: false,
          output: "reclaimed",
        });
      },
      log: (message) => {
        events.push(message);
      },
      warn: (message) => {
        events.push(message);
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toBe("target");
    expect(events[1]).toContain("before_bytes=0.1GiB/0.1GiB");
    expect(events[1]).toContain("reclaimed_bytes=0.0GiB");
  });

  test("tmpfs target failures are logged without escaping the controller", async () => {
    const events: string[] = [];
    await recoverTmpfsCapacity({
      thresholdPercent: 80,
      measure: () =>
        ok({
          inodes: { used: 85, total: 100, percent: 85 },
          bytes: { used: 50, total: 100, percent: 50 },
        }),
      runTarget: () =>
        Promise.resolve({
          code: 1,
          timedOut: false,
          output: "target unavailable",
        }),
      log: (message) => {
        events.push(message);
      },
      warn: (message) => {
        events.push(message);
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("TMPFS_RECLAIM exit=1");
    expect(events[0]).toContain('detail="target unavailable"');
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

  test.skipIf(NO_PROCFS).each(["TERM", "KILL"])(
    "raw process %s checks starttime and records every signal for the selected PID",
    async (signal) => {
      const dir = mkdtempSync(join(tmpdir(), "capacity-stop-"));
      const executable = join(dir, "julia");
      const context = decisionContext(join(dir, "capacity-decisions.jsonl"));
      symlinkSync(process.execPath, executable);
      const proc = Bun.spawn(
        [
          executable,
          "-e",
          `${signal === "KILL" ? 'process.on("SIGTERM", () => {});' : ""} setInterval(() => {}, 1000); process.stdout.write("ready\\n");`,
        ],
        {
          stdout: "pipe",
          stderr: "ignore",
        },
      );
      using _cleanup = {
        [Symbol.dispose]: () => {
          if (proc.exitCode === null) proc.kill();
          rmSync(dir, { recursive: true, force: true });
        },
      };
      const reader = proc.stdout.getReader();
      await reader.read();
      reader.releaseLock();
      const ticks = startTicks(readFileSync(`/proc/${proc.pid}/stat`, "utf8"));
      expect(ticks).not.toBeNull();
      expect(readFileSync(`/proc/${proc.pid}/comm`, "utf8").trim()).toBe(
        "julia",
      );
      await stopCompute(
        [
          {
            kind: "pid",
            pid: proc.pid,
            startTicks: "wrong-generation",
            comm: "julia",
          },
        ],
        context,
      );
      expect(proc.exitCode).toBeNull();
      expect(existsSync(context.recordPath ?? "")).toBe(false);
      // A recording fault must leave the selected process alive.
      const recordingFailure = await fromAsyncThrowable(() =>
        stopCompute(
          [
            {
              kind: "pid",
              pid: proc.pid,
              startTicks: ticks ?? "",
              comm: "julia",
            },
          ],
          { ...context, recordPath: join(executable, "impossible.jsonl") },
        ),
      )();
      expect(recordingFailure.isErr()).toBe(true);
      expect(proc.exitCode).toBeNull();
      await recoverMemoryEmergency({
        before: { availableMb: 900, pageReadsPerSecond: 700 },
        thresholdMb: 2048,
        canAttemptDrop: () => false,
        claimEmergencyOverride: () =>
          claimEmergencyCacheDrop(join(dir, "episode")),
        isLeverAvailable: () => true,
        startLever: () => true,
        fallbackDrop: () => false,
        wait: () => {},
        measure: () => context.memory,
        stopCompute: (recovery) =>
          stopCompute(
            [
              {
                kind: "pid",
                pid: proc.pid,
                startTicks: ticks ?? "",
                comm: "julia",
              },
            ],
            { ...context, recovery },
          ),
      });
      expect(await proc.exited).not.toBe(0);
      const records = decisionRecords(context.recordPath ?? "");
      expect(records.slice(0, 1)).toMatchObject([
        {
          decision: "STOP",
          reason: "memory-emergency",
          signal: "TERM",
          measurements: {
            windows_available_mb: 900,
            disk_free_bytes: 154 * GiB,
          },
          thresholds: { disk_stop_bytes: 4 * GiB },
          lever: {
            emergencyOverride: true,
            outcome: "no-effect",
            dropAttempted: true,
          },
          target: {
            pid: proc.pid,
            comm: "julia",
            cgroup: readFileSync("/proc/self/cgroup", "utf8").trim(),
          },
        },
      ]);
      expect(records.map((record) => record.signal)).toEqual(
        signal === "KILL" ? ["TERM", "KILL"] : ["TERM"],
      );
      expect(records.at(-1)?.target.pid).toBe(proc.pid);
    },
    15_000,
  );
});
