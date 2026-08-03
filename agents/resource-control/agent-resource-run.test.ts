import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSystemdLaunch,
  decideAdmission,
  checkJob,
  executeJob,
  kernelTasksMax,
  parseCpuList,
  probeKernelEnforcement,
  probeHostSnapshot,
  validateManifest,
  type HostSnapshot,
  type ResourceManifest,
  type Reservation,
} from "./agent-resource-run.ts";

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

function cpuManifest(
  overrides: Partial<ResourceManifest> = {},
): ResourceManifest {
  return {
    schema: 1,
    job_id: "test-job",
    run_class: "test",
    cpu_threads: 1,
    processes: 2,
    host_ram_peak_bytes: 128 * MiB,
    memory_bound: "measured shell baseline plus 64 MiB margin",
    device: {
      kind: "cpu",
      gpu_status: "incompatible",
      rationale: "the fixture only validates process control",
    },
    scratch_bytes: 0,
    child_fanout: 0,
    walltime_seconds: 5,
    cleanup: { mode: "term-then-kill", grace_seconds: 1 },
    ...overrides,
  };
}

function hostSnapshot(overrides: Partial<HostSnapshot> = {}): HostSnapshot {
  return {
    allowed_cpu_ids: [0, 1, 2, 3, 4, 5, 6, 7],
    mem_total_bytes: 32 * GiB,
    mem_available_bytes: 24 * GiB,
    scratch_available_bytes: 100 * GiB,
    gpus: [
      {
        id: 0,
        total_bytes: 12 * GiB,
        used_bytes: 2 * GiB,
        utilization_percent: 0,
      },
    ],
    ...overrides,
  };
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    schema: 1,
    reservation_id: "existing-1",
    job_id: "other-job",
    controller_pid: process.pid,
    cpu_ids: [0],
    host_ram_peak_bytes: GiB,
    scratch_bytes: 0,
    device: { kind: "cpu" },
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

const temporaryDirectories: string[] = [];
function temporaryStateDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "agent-resource-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("resource manifest", () => {
  test("parses Linux CPU list ranges without duplicates", () => {
    expect(parseCpuList("0-2,4,6-7,2")).toEqual([0, 1, 2, 4, 6, 7]);
  });

  test("accepts a complete bounded CPU manifest", () => {
    expect(validateManifest(cpuManifest())).toEqual(cpuManifest());
  });

  test("rejects an unbounded memory claim and nested agent fanout", () => {
    expect(() =>
      validateManifest({
        ...cpuManifest(),
        memory_bound: "",
      }),
    ).toThrow(/memory_bound/);
    expect(() =>
      validateManifest({ ...cpuManifest(), child_fanout: 1 }),
    ).toThrow(/child_fanout/);
  });
});

describe("admission", () => {
  test("GPU-first rejects CPU when a compatible idle GPU has headroom", () => {
    const manifest = cpuManifest({
      device: {
        kind: "cpu",
        gpu_status: "compatible",
        gpu_vram_peak_bytes: 4 * GiB,
        rationale: "CPU fallback only if no compatible GPU is available",
      },
    });
    const result = decideAdmission(manifest, hostSnapshot(), []);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("gpu-first");
  });

  test("allows an explicit CPU fallback when compatible GPUs lack headroom", () => {
    const manifest = cpuManifest({
      device: {
        kind: "cpu",
        gpu_status: "compatible",
        gpu_vram_peak_bytes: 10 * GiB,
        rationale: "GPU has insufficient free VRAM at admission",
      },
    });
    const result = decideAdmission(manifest, hostSnapshot(), []);
    expect(result.ok).toBe(true);
  });

  test("subtracts concurrent reservations and preserves system headroom", () => {
    const existing = reservation({
      cpu_ids: [0, 1],
      host_ram_peak_bytes: 3 * GiB,
    });
    const manifest = cpuManifest({
      cpu_threads: 2,
      host_ram_peak_bytes: 2 * GiB,
    });
    const result = decideAdmission(
      manifest,
      hostSnapshot({ mem_available_bytes: 8 * GiB }),
      [existing],
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("host RAM");
  });

  test("rejects a duplicate live job id", () => {
    const result = decideAdmission(cpuManifest(), hostSnapshot(), [
      reservation({ job_id: "test-job" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already reserved");
  });
});

describe("kernel enforcement", () => {
  test("maps the envelope to a user-systemd scope", () => {
    const manifest = cpuManifest({ cpu_threads: 2, processes: 3 });
    const launch = buildSystemdLaunch(
      manifest,
      reservation({
        reservation_id: "controller-1",
        cpu_ids: [2, 3],
      }),
      ["sh", "-c", "true"],
    );

    expect(kernelTasksMax(manifest)).toBe(54);
    expect(launch).toMatchObject({
      scopeUnit: "agent-resource-controller-1.scope",
      tasksMax: 54,
    });
    expect(launch.argv).toContain("--property=CPUQuota=200%");
    expect(launch.argv).toContain(`--property=MemoryMax=${128 * MiB}`);
    expect(launch.argv).toContain("--property=MemorySwapMax=0");
    expect(launch.argv).toContain("--property=TasksMax=54");
    expect(launch.argv).toContain("--property=OOMPolicy=kill");
    expect(launch.argv.slice(-6)).toEqual([
      "taskset",
      "-c",
      "2,3",
      "sh",
      "-c",
      "true",
    ]);
  });

  test("the current host accepts the required user-systemd properties", () => {
    expect(probeKernelEnforcement()).toEqual({ available: true });
  });
});

describe("bounded execution", () => {
  test("fails closed when kernel enforcement is unavailable", async () => {
    const stateDirectory = temporaryStateDirectory();
    const reports: string[] = [];
    const result = await checkJob(cpuManifest(), {
      stateDirectory,
      snapshot: hostSnapshot(),
      kernelEnforcement: {
        available: false,
        reason: "fixture user manager unavailable",
      },
      report: (line) => reports.push(line),
    });
    expect(result).toMatchObject({
      ok: false,
      exitCode: 69,
      reason: "admission",
    });
    expect(reports.join("\n")).toContain("kernel enforcement unavailable");
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("reclaims an old lock left before its owner file was written", async () => {
    const stateDirectory = temporaryStateDirectory();
    const lockDirectory = join(stateDirectory, ".lock");
    mkdirSync(lockDirectory);
    const old = new Date(Date.now() - 10_000);
    utimesSync(lockDirectory, old, old);
    const result = await checkJob(cpuManifest(), {
      stateDirectory,
      snapshot: probeHostSnapshot(process.cwd()),
    });
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("injects one-thread settings and releases the reservation", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const result = await executeJob(
      cpuManifest(),
      [
        "sh",
        "-c",
        'test "$OMP_NUM_THREADS" = 1 && test "$JULIA_NUM_THREADS" = 1',
      ],
      { stateDirectory, snapshot, monitorIntervalMs: 25 },
    );
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("terminates the whole process group at the walltime", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const started = performance.now();
    const result = await executeJob(
      cpuManifest({ walltime_seconds: 1 }),
      ["sh", "-c", "sleep 10"],
      { stateDirectory, snapshot, monitorIntervalMs: 25 },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 124,
      reason: "walltime",
    });
    expect(performance.now() - started).toBeLessThan(4_000);
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("terminates a process fanout beyond the declared ceiling", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const result = await executeJob(
      cpuManifest({ processes: 1 }),
      ["sh", "-c", "sleep 10 & wait"],
      { stateDirectory, snapshot, monitorIntervalMs: 25 },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 137,
      reason: "processes",
    });
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("the cgroup kills a job before it can exceed its RAM envelope", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const started = performance.now();
    const result = await executeJob(
      cpuManifest({ host_ram_peak_bytes: 64 * MiB }),
      [
        process.execPath,
        "-e",
        "const value = Buffer.alloc(256 * 1024 * 1024, 1); " +
          "process.stdout.write(String(value.length)); await Bun.sleep(5_000);",
      ],
      { stateDirectory, snapshot, monitorIntervalMs: 1_000 },
    );
    expect(result).toMatchObject({
      ok: false,
      exitCode: 137,
      reason: "command-exit",
    });
    expect(performance.now() - started).toBeLessThan(4_000);
    expect(readdirSync(stateDirectory)).toEqual([]);
  });

  test("scope cleanup kills a descendant that escapes the process group", async () => {
    const stateDirectory = temporaryStateDirectory();
    const snapshot = probeHostSnapshot(process.cwd());
    const pidFile = join(stateDirectory, "escaped.pid");
    const result = await executeJob(
      cpuManifest({ processes: 3 }),
      [
        "sh",
        "-c",
        `setsid sh -c 'echo $$ > ${pidFile}; exec sleep 10' & ` +
          `while [ ! -s ${pidFile} ]; do sleep 0.01; done`,
      ],
      { stateDirectory, snapshot, monitorIntervalMs: 25 },
    );
    const escapedPid = Number(readFileSync(pidFile, "utf8").trim());
    let escapedProcessIsLive = true;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const stat = readFileSync(`/proc/${escapedPid}/stat`, "utf8");
        const close = stat.lastIndexOf(")");
        escapedProcessIsLive = close !== -1 && stat.slice(close + 2)[0] !== "Z";
      } catch {
        escapedProcessIsLive = false;
      }
      if (!escapedProcessIsLive) break;
      await Bun.sleep(25);
    }

    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(escapedProcessIsLive).toBe(false);
    expect(readdirSync(stateDirectory)).toEqual(["escaped.pid"]);
  });

  test("fails closed when systemd scope cleanup cannot be verified", async () => {
    const stateDirectory = temporaryStateDirectory();
    await expect(
      executeJob(cpuManifest(), ["true"], {
        stateDirectory,
        snapshot: probeHostSnapshot(process.cwd()),
        kernelEnforcement: { available: true },
        monitorIntervalMs: 25,
        systemdScopeCleanup: () => false,
      }),
    ).rejects.toThrow("failed to verify cleanup of systemd scope");
    expect(readdirSync(stateDirectory)).toEqual([]);
  });
});
