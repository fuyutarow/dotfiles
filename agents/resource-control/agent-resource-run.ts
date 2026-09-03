#!/usr/bin/env bun
// Consumer: agents and humans running bounded numerical jobs or heavyweight services.
// This is a Linux fail-closed admission controller: disjoint CPU affinity, aggregate
// reservations, user-systemd cgroup CPU/RAM/swap/task limits, sampled exact process ceilings,
// walltime, and TERM→KILL cleanup.

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cli } from "cleye";

const KiB = 1024;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const CPU_SAFETY_COUNT = 1;
const MIN_HOST_RAM_SAFETY_BYTES = 4 * GiB;
const HOST_RAM_SAFETY_FRACTION = 0.1;
const GPU_SAFETY_BYTES = 512 * MiB;
const GPU_IDLE_UTILIZATION_PERCENT = 20;
// VRAM is a divisible reservation like RAM and scratch, so several declared jobs may share one
// device. This backstop bounds SM/PCIe contention and per-context overhead, which the VRAM
// ledger does not price: a manifest declaring a tiny peak must not admit an unbounded fleet.
const GPU_MAX_CONCURRENT_JOBS = 4;
// CUDA.jl releases cached pool blocks at the soft limit and refuses allocation at the hard one.
// Leaving the soft limit below the hard limit turns pool fragmentation into a reclaim instead of
// an out-of-memory error. Ref: CUDA.jl docs/src/usage/memory.md "Memory limits".
const GPU_SOFT_LIMIT_FRACTION = 0.9;
const SCRATCH_SAFETY_BYTES = GiB;
const DEFAULT_MONITOR_INTERVAL_MS = 200;
const LOCK_WAIT_MS = 2_000;
const LOCK_STALE_MS = 5_000;
const MIN_KERNEL_TASKS = 32;
const RUNTIME_TASK_MARGIN_PER_PROCESS = 16;
const MAX_KERNEL_TASKS = 65_535;
const KERNEL_PROBE_MEMORY_BYTES = 16 * MiB;

class UsageError extends Error {}
class StateError extends Error {}

type RunClass = "pilot" | "full" | "test" | "service";
type CpuGpuStatus = "compatible" | "incompatible" | "not-beneficial";

export type CpuDevice = {
  kind: "cpu";
  gpu_status: CpuGpuStatus;
  gpu_vram_peak_bytes?: number;
  rationale: string;
};

export type GpuDevice = {
  kind: "gpu";
  gpu_id: number;
  vram_peak_bytes: number;
};

export type ResourceManifest = {
  schema: 1;
  job_id: string;
  run_class: RunClass;
  cpu_threads: number;
  processes: number;
  host_ram_peak_bytes: number;
  memory_bound: string;
  device: CpuDevice | GpuDevice;
  scratch_bytes: number;
  child_fanout: 0;
  walltime_seconds: number;
  cleanup: {
    mode: "term-then-kill";
    grace_seconds: number;
  };
};

export type GpuSnapshot = {
  id: number;
  total_bytes: number;
  used_bytes: number;
  utilization_percent: number;
};

export type HostSnapshot = {
  allowed_cpu_ids: number[];
  mem_total_bytes: number;
  mem_available_bytes: number;
  scratch_available_bytes: number;
  gpus: GpuSnapshot[];
};

export type Reservation = {
  schema: 1;
  reservation_id: string;
  job_id: string;
  controller_pid: number;
  cpu_ids: number[];
  host_ram_peak_bytes: number;
  scratch_bytes: number;
  device:
    | { kind: "cpu" }
    | { kind: "gpu"; gpu_id: number; vram_peak_bytes: number };
  started_at: string;
};

/**
 * The manifest identity recorded by the CLI while it still has the exact input bytes.
 * `path` is always absolute; `sha256` is lowercase hexadecimal SHA-256 of those bytes.
 */
export type ManifestSource = {
  path: string;
  sha256: string;
};

/**
 * A receipt is an in-process, same-host assertion from this runner, not a signature or remote
 * attestation. Its fixed field order makes JSON.stringify() a canonical payload for consumers.
 */
export type AdmissionReceiptPayload = {
  schema: 1;
  admission_id: string;
  manifest_path: string;
  manifest_sha256: string;
  job_id: string;
  reservation_id: string;
  scope_unit: string;
  controller_pid: number;
  cpu_ids: number[];
  host_ram_peak_bytes: number;
  scratch_bytes: number;
  device: Reservation["device"];
  started_at: string;
};

export type AdmissionReceipt = {
  payload: string;
  sha256: string;
  admissionId: string;
  manifestSource: ManifestSource;
};

export type AdmissionResult =
  | {
      ok: true;
      cpu_ids: number[];
      device: Reservation["device"];
      host_ram_safety_bytes: number;
    }
  | { ok: false; reason: string };

export type ExecutionResult = {
  ok: boolean;
  exitCode: number;
  reason?:
    | "admission"
    | "launch"
    | "command-exit"
    | "walltime"
    | "memory"
    | "processes"
    | "interrupt"
    | "cleanup";
};

export type KernelEnforcement =
  | { available: true }
  | { available: false; reason: string };

export type SystemdLaunch = {
  argv: string[];
  scopeUnit: string;
  tasksMax: number;
};

type ExecuteOptions = {
  stateDirectory?: string;
  snapshot?: HostSnapshot;
  monitorIntervalMs?: number;
  cwd?: string;
  report?: (line: string) => void;
  kernelEnforcement?: KernelEnforcement;
  systemdScopeCleanup?: (scopeUnit: string) => boolean;
  /** Required for child execution so the receipt can name the exact admitted manifest bytes. */
  manifestSource?: ManifestSource;
};

type Lease = {
  reservation: Reservation;
  reservationPath: string;
  stateDirectory: string;
};

type GroupUsage = { processes: number; rssBytes: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    throw new UsageError(`${label} has unknown field(s): ${extras.join(", ")}`);
  }
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new UsageError(
      `${label} must be an integer in [${minimum}, ${maximum}]`,
    );
  }
  return value;
}

function nonEmpty(value: unknown, label: string, maximum = 2_000): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maximum
  ) {
    throw new UsageError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isNonEmptyText(value: unknown, maximum = 2_000): value is string {
  return (
    typeof value === "string" && value.trim() !== "" && value.length <= maximum
  );
}

function isSafeIntegerInRange(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function manifestSourceFromBytes(
  manifestPath: string,
  manifestBytes: Uint8Array,
): ManifestSource {
  return {
    path: resolve(manifestPath),
    sha256: sha256Hex(manifestBytes),
  };
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new UsageError(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function validateManifest(value: unknown): ResourceManifest {
  if (!isRecord(value)) throw new UsageError("manifest must be a JSON object");
  exactKeys(
    value,
    [
      "schema",
      "job_id",
      "run_class",
      "cpu_threads",
      "processes",
      "host_ram_peak_bytes",
      "memory_bound",
      "device",
      "scratch_bytes",
      "child_fanout",
      "walltime_seconds",
      "cleanup",
    ],
    "manifest",
  );
  if (value.schema !== 1) throw new UsageError("schema must be 1");
  const jobId = nonEmpty(value.job_id, "job_id", 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(jobId)) {
    throw new UsageError(
      "job_id must contain only letters, digits, dot, underscore, or hyphen",
    );
  }

  if (!isRecord(value.device)) {
    throw new UsageError("device must be an object");
  }
  let device: CpuDevice | GpuDevice;
  if (value.device.kind === "cpu") {
    exactKeys(
      value.device,
      ["kind", "gpu_status", "gpu_vram_peak_bytes", "rationale"],
      "device",
    );
    const gpuStatus = oneOf(
      value.device.gpu_status,
      ["compatible", "incompatible", "not-beneficial"] as const,
      "device.gpu_status",
    );
    const gpuVram =
      value.device.gpu_vram_peak_bytes === undefined
        ? undefined
        : integer(
            value.device.gpu_vram_peak_bytes,
            "device.gpu_vram_peak_bytes",
            1,
          );
    if (gpuStatus === "compatible" && gpuVram === undefined) {
      throw new UsageError(
        "device.gpu_vram_peak_bytes is required when gpu_status is compatible",
      );
    }
    device = {
      kind: "cpu",
      gpu_status: gpuStatus,
      ...(gpuVram === undefined ? {} : { gpu_vram_peak_bytes: gpuVram }),
      rationale: nonEmpty(value.device.rationale, "device.rationale"),
    };
  } else if (value.device.kind === "gpu") {
    exactKeys(value.device, ["kind", "gpu_id", "vram_peak_bytes"], "device");
    device = {
      kind: "gpu",
      gpu_id: integer(value.device.gpu_id, "device.gpu_id", 0, 1_024),
      vram_peak_bytes: integer(
        value.device.vram_peak_bytes,
        "device.vram_peak_bytes",
        1,
      ),
    };
  } else {
    throw new UsageError("device.kind must be cpu or gpu");
  }

  if (!isRecord(value.cleanup)) {
    throw new UsageError("cleanup must be an object");
  }
  exactKeys(value.cleanup, ["mode", "grace_seconds"], "cleanup");
  if (value.cleanup.mode !== "term-then-kill") {
    throw new UsageError("cleanup.mode must be term-then-kill");
  }
  const childFanout = integer(value.child_fanout, "child_fanout", 0, 0);

  return {
    schema: 1,
    job_id: jobId,
    run_class: oneOf(
      value.run_class,
      ["pilot", "full", "test", "service"] as const,
      "run_class",
    ),
    cpu_threads: integer(value.cpu_threads, "cpu_threads", 1, 1_024),
    processes: integer(value.processes, "processes", 1, 4_096),
    host_ram_peak_bytes: integer(
      value.host_ram_peak_bytes,
      "host_ram_peak_bytes",
      1,
    ),
    memory_bound: nonEmpty(value.memory_bound, "memory_bound"),
    device,
    scratch_bytes: integer(value.scratch_bytes, "scratch_bytes", 0),
    child_fanout: childFanout,
    walltime_seconds: integer(
      value.walltime_seconds,
      "walltime_seconds",
      1,
      86_400,
    ),
    cleanup: {
      mode: "term-then-kill",
      grace_seconds: integer(
        value.cleanup.grace_seconds,
        "cleanup.grace_seconds",
        1,
        30,
      ),
    },
  };
}

export function parseCpuList(text: string): number[] {
  const cpus = new Set<number>();
  for (const rawPart of text.trim().split(",")) {
    const part = rawPart.trim();
    if (part === "") continue;
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range !== null) {
      const first = Number(range[1]);
      const last = Number(range[2]);
      if (
        !Number.isSafeInteger(first) ||
        !Number.isSafeInteger(last) ||
        last < first
      ) {
        throw new StateError(`invalid CPU range '${part}'`);
      }
      for (let cpu = first; cpu <= last; cpu += 1) cpus.add(cpu);
      continue;
    }
    if (!/^\d+$/.test(part)) throw new StateError(`invalid CPU id '${part}'`);
    cpus.add(Number(part));
  }
  const result = [...cpus].sort((a, b) => a - b);
  if (result.length === 0) throw new StateError("allowed CPU list is empty");
  return result;
}

function meminfoBytes(text: string, key: string): number {
  const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, "m").exec(text);
  if (match === null) throw new StateError(`/proc/meminfo lacks ${key}`);
  return Number(match[1]) * KiB;
}

function probeGpus(): GpuSnapshot[] {
  if (Bun.which("nvidia-smi") === null || Bun.which("timeout") === null)
    return [];
  try {
    // bounded: GNU timeout caps the local nvidia-smi probe at five seconds.
    const result = Bun.spawnSync(
      [
        "timeout",
        "5s",
        "nvidia-smi",
        "--query-gpu=index,memory.total,memory.used,utilization.gpu",
        "--format=csv,noheader,nounits",
      ],
      { stdout: "pipe", stderr: "ignore" },
    );
    if (result.exitCode !== 0) return [];
    return result.stdout
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const fields = line.split(",").map((field) => Number(field.trim()));
        if (
          fields.length !== 4 ||
          fields.some((field) => !Number.isFinite(field))
        ) {
          throw new StateError(`unparseable nvidia-smi row: ${line}`);
        }
        return {
          id: fields[0] as number,
          total_bytes: (fields[1] as number) * MiB,
          used_bytes: (fields[2] as number) * MiB,
          utilization_percent: fields[3] as number,
        };
      });
  } catch {
    return [];
  }
}

export function probeHostSnapshot(cwd: string): HostSnapshot {
  if (process.platform !== "linux") {
    throw new StateError(
      `unsupported platform '${process.platform}': affinity/RSS enforcement is Linux-only`,
    );
  }
  const status = readFileSync("/proc/self/status", "utf8");
  const allowed = /^Cpus_allowed_list:\s*(.+)$/m.exec(status)?.[1];
  if (allowed === undefined) {
    throw new StateError("/proc/self/status lacks Cpus_allowed_list");
  }
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const fs = statfsSync(cwd);
  return {
    allowed_cpu_ids: parseCpuList(allowed),
    mem_total_bytes: meminfoBytes(meminfo, "MemTotal"),
    mem_available_bytes: meminfoBytes(meminfo, "MemAvailable"),
    scratch_available_bytes: Number(fs.bavail) * Number(fs.bsize),
    gpus: probeGpus(),
  };
}

function oneLineDiagnostic(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 400);
}

export function probeKernelEnforcement(): KernelEnforcement {
  if (process.platform !== "linux") {
    return {
      available: false,
      reason: `user-systemd cgroup enforcement is Linux-only, not '${process.platform}'`,
    };
  }
  const required = ["systemd-run", "systemctl", "timeout", "true"] as const;
  for (const command of required) {
    if (Bun.which(command) === null) {
      return { available: false, reason: `${command} is required` };
    }
  }
  const truePath = Bun.which("true");
  if (truePath === null) {
    return { available: false, reason: "true is required" };
  }

  const unit = `agent-resource-probe-${process.pid}-${randomUUID().slice(0, 8)}`;
  // bounded: GNU timeout caps the user-manager/property capability probe at five seconds.
  const result = Bun.spawnSync(
    [
      "timeout",
      "5s",
      "systemd-run",
      "--user",
      "--scope",
      "--quiet",
      "--collect",
      "--expand-environment=no",
      `--unit=${unit}`,
      "--property=CPUQuota=100%",
      `--property=MemoryMax=${KERNEL_PROBE_MEMORY_BYTES}`,
      "--property=MemorySwapMax=0",
      `--property=TasksMax=${MIN_KERNEL_TASKS}`,
      "--property=OOMPolicy=kill",
      truePath,
    ],
    { stdout: "ignore", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    const detail = oneLineDiagnostic(result.stderr.toString());
    return {
      available: false,
      reason:
        `user-systemd cgroup probe exited ${result.exitCode}` +
        (detail === "" ? "" : `: ${detail}`),
    };
  }
  return { available: true };
}

function hostRamSafety(snapshot: HostSnapshot): number {
  return Math.max(
    MIN_HOST_RAM_SAFETY_BYTES,
    Math.ceil(snapshot.mem_total_bytes * HOST_RAM_SAFETY_FRACTION),
  );
}

type GpuLedger = {
  jobs: number;
  reserved_bytes: number;
  available_bytes: number;
};

/**
 * Price one GPU against the live reservations held on it.
 *
 * `used_bytes` from nvidia-smi counts unmanaged processes plus whatever our own reserved jobs
 * have actually allocated so far, and a caching allocator (CUDA.jl's pool, PyTorch's) never
 * returns freed blocks to the driver. So neither number alone is a sound floor:
 *
 *   unmanaged = max(0, used_bytes - reserved)      // what we do not control
 *   committed = reserved + unmanaged = max(reserved, used_bytes)
 *
 * The `max` form is conservative in both regimes — before our jobs allocate, `reserved`
 * dominates; when an unmanaged process holds the card, `used_bytes` does.
 */
function gpuLedger(gpu: GpuSnapshot, reservations: Reservation[]): GpuLedger {
  const held = reservations.filter(
    (reservation) =>
      reservation.device.kind === "gpu" && reservation.device.gpu_id === gpu.id,
  );
  const reserved = held.reduce(
    (sum, reservation) =>
      sum +
      (reservation.device.kind === "gpu"
        ? reservation.device.vram_peak_bytes
        : 0),
    0,
  );
  const committed = Math.max(reserved, gpu.used_bytes);
  return {
    jobs: held.length,
    reserved_bytes: reserved,
    available_bytes: Math.max(
      0,
      gpu.total_bytes - committed - GPU_SAFETY_BYTES,
    ),
  };
}

function gpuHasHeadroom(
  gpu: GpuSnapshot,
  requiredBytes: number,
  reservations: Reservation[],
): boolean {
  const ledger = gpuLedger(gpu, reservations);
  if (ledger.jobs >= GPU_MAX_CONCURRENT_JOBS) return false;
  // Utilization screens UNMANAGED load only. Applying it once we already hold a reservation on
  // this device makes an admitted job block the next admission with its own compute load, which
  // silently degrades the ledger to one job per GPU.
  if (
    ledger.jobs === 0 &&
    gpu.utilization_percent > GPU_IDLE_UTILIZATION_PERCENT
  ) {
    return false;
  }
  return ledger.available_bytes >= requiredBytes;
}

export function decideAdmission(
  manifest: ResourceManifest,
  snapshot: HostSnapshot,
  reservations: Reservation[],
): AdmissionResult {
  if (reservations.some((item) => item.job_id === manifest.job_id)) {
    return {
      ok: false,
      reason: `job_id '${manifest.job_id}' is already reserved by a live controller`,
    };
  }

  const allowed = new Set(snapshot.allowed_cpu_ids);
  const reservedCpuIds = new Set(
    reservations.flatMap((reservation) => reservation.cpu_ids),
  );
  const reservedAllowedCount = [...reservedCpuIds].filter((cpu) =>
    allowed.has(cpu),
  ).length;
  const reservableCpuCount = Math.max(
    0,
    snapshot.allowed_cpu_ids.length - CPU_SAFETY_COUNT - reservedAllowedCount,
  );
  if (manifest.cpu_threads > reservableCpuCount) {
    return {
      ok: false,
      reason:
        `CPU request ${manifest.cpu_threads} exceeds ${reservableCpuCount} currently ` +
        `reservable thread(s); ${CPU_SAFETY_COUNT} CPU remains outside reservations`,
    };
  }
  const cpuIds = snapshot.allowed_cpu_ids
    .filter((cpu) => !reservedCpuIds.has(cpu))
    .slice(0, manifest.cpu_threads);

  const ramSafety = hostRamSafety(snapshot);
  const reservedRam = reservations.reduce(
    (sum, item) => sum + item.host_ram_peak_bytes,
    0,
  );
  const ramForNew = Math.max(
    0,
    snapshot.mem_available_bytes - ramSafety - reservedRam,
  );
  if (manifest.host_ram_peak_bytes > ramForNew) {
    return {
      ok: false,
      reason:
        `host RAM request ${manifest.host_ram_peak_bytes} exceeds ${ramForNew} available ` +
        `after live reservations and ${ramSafety} bytes of system safety headroom`,
    };
  }

  const reservedScratch = reservations.reduce(
    (sum, item) => sum + item.scratch_bytes,
    0,
  );
  const scratchForNew = Math.max(
    0,
    snapshot.scratch_available_bytes - SCRATCH_SAFETY_BYTES - reservedScratch,
  );
  if (manifest.scratch_bytes > scratchForNew) {
    return {
      ok: false,
      reason:
        `scratch request ${manifest.scratch_bytes} exceeds ${scratchForNew} available ` +
        `after reservations and safety headroom`,
    };
  }

  if (manifest.device.kind === "cpu") {
    if (
      manifest.device.gpu_status === "compatible" &&
      snapshot.gpus.some((gpu) =>
        gpuHasHeadroom(
          gpu,
          manifest.device.kind === "cpu"
            ? (manifest.device.gpu_vram_peak_bytes ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER,
          reservations,
        ),
      )
    ) {
      return {
        ok: false,
        reason:
          "gpu-first: CPU execution denied because a compatible idle GPU has the " +
          "declared VRAM headroom",
      };
    }
    return {
      ok: true,
      cpu_ids: cpuIds,
      device: { kind: "cpu" },
      host_ram_safety_bytes: ramSafety,
    };
  }

  const gpu = snapshot.gpus.find((item) => item.id === manifest.device.gpu_id);
  if (gpu === undefined) {
    return {
      ok: false,
      reason: `GPU ${manifest.device.gpu_id} is not visible to nvidia-smi`,
    };
  }
  if (!gpuHasHeadroom(gpu, manifest.device.vram_peak_bytes, reservations)) {
    const ledger = gpuLedger(gpu, reservations);
    return {
      ok: false,
      reason:
        `VRAM request ${manifest.device.vram_peak_bytes} exceeds ${ledger.available_bytes} ` +
        `available on GPU ${gpu.id} after ${ledger.jobs} live reservation(s) ` +
        `(${ledger.reserved_bytes} bytes declared, ${gpu.used_bytes} bytes observed in use) ` +
        `and ${GPU_SAFETY_BYTES} bytes of device safety headroom` +
        (ledger.jobs >= GPU_MAX_CONCURRENT_JOBS
          ? `; the device already holds the ${GPU_MAX_CONCURRENT_JOBS}-job concurrency cap`
          : "") +
        (ledger.jobs === 0 &&
        gpu.utilization_percent > GPU_IDLE_UTILIZATION_PERCENT
          ? `; unmanaged load holds the device at ${gpu.utilization_percent}% utilization`
          : ""),
    };
  }
  return {
    ok: true,
    cpu_ids: cpuIds,
    device: {
      kind: "gpu",
      gpu_id: gpu.id,
      vram_peak_bytes: manifest.device.vram_peak_bytes,
    },
    host_ram_safety_bytes: ramSafety,
  };
}

function defaultStateDirectory(): string {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime !== undefined && runtime !== "" && isAbsolute(runtime)) {
    return join(runtime, "agent-resource-control");
  }
  const uid =
    typeof process.getuid === "function" ? process.getuid() : "unknown";
  return join(tmpdir(), `agent-resource-control-${uid}`);
}

function ensureStateDirectory(path: string): string {
  const absolute = resolve(path);
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  return absolute;
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}

function pidIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function releaseLockDirectory(lockDirectory: string): void {
  const owner = join(lockDirectory, "owner.json");
  try {
    unlinkSync(owner);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  try {
    rmdirSync(lockDirectory);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

async function acquireStateLock(stateDirectory: string): Promise<() => void> {
  const lockDirectory = join(stateDirectory, ".lock");
  const deadline = performance.now() + LOCK_WAIT_MS;
  while (performance.now() < deadline) {
    try {
      mkdirSync(lockDirectory, { mode: 0o700 });
      writeFileSync(
        join(lockDirectory, "owner.json"),
        `${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`,
        { flag: "wx", mode: 0o600 },
      );
      return () => releaseLockDirectory(lockDirectory);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        try {
          releaseLockDirectory(lockDirectory);
        } catch {
          // Preserve the original lock/setup error.
        }
        throw new StateError(
          `cannot acquire reservation lock: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let ownerPid: number | null = null;
    try {
      const owner = JSON.parse(
        readFileSync(join(lockDirectory, "owner.json"), "utf8"),
      ) as { pid?: unknown };
      if (typeof owner.pid === "number") ownerPid = owner.pid;
    } catch {
      // The owner may still be writing. Age decides whether this becomes stale.
    }
    try {
      const oldEnough =
        Date.now() - statSync(lockDirectory).mtimeMs >= LOCK_STALE_MS;
      if (oldEnough && (ownerPid === null || !pidIsAlive(ownerPid))) {
        releaseLockDirectory(lockDirectory);
        continue;
      }
    } catch {
      // A concurrent owner can release/recreate the bounded lock; retry.
    }
    await Bun.sleep(25);
  }
  throw new StateError(`reservation lock remained busy for ${LOCK_WAIT_MS} ms`);
}

function reservationFrom(value: unknown): Reservation | null {
  if (!isRecord(value) || value.schema !== 1) return null;
  if (
    typeof value.reservation_id !== "string" ||
    typeof value.job_id !== "string" ||
    !Number.isSafeInteger(value.controller_pid) ||
    !Array.isArray(value.cpu_ids) ||
    !value.cpu_ids.every(Number.isSafeInteger) ||
    !Number.isSafeInteger(value.host_ram_peak_bytes) ||
    !Number.isSafeInteger(value.scratch_bytes) ||
    !isRecord(value.device) ||
    typeof value.started_at !== "string"
  ) {
    return null;
  }
  if (value.device.kind === "cpu") {
    return value as Reservation;
  }
  if (
    value.device.kind === "gpu" &&
    Number.isSafeInteger(value.device.gpu_id) &&
    Number.isSafeInteger(value.device.vram_peak_bytes)
  ) {
    return value as Reservation;
  }
  return null;
}

function liveReservations(stateDirectory: string): Reservation[] {
  const result: Reservation[] = [];
  for (const name of readdirSync(stateDirectory)) {
    if (!name.endsWith(".reservation.json")) continue;
    const path = join(stateDirectory, name);
    let reservation: Reservation | null = null;
    try {
      reservation = reservationFrom(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      reservation = null;
    }
    if (reservation !== null && pidIsAlive(reservation.controller_pid)) {
      result.push(reservation);
      continue;
    }
    try {
      unlinkSync(path);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  }
  return result;
}

async function acquireLease(
  manifest: ResourceManifest,
  snapshot: HostSnapshot,
  requestedStateDirectory?: string,
): Promise<Lease | AdmissionResult> {
  const stateDirectory = ensureStateDirectory(
    requestedStateDirectory ?? defaultStateDirectory(),
  );
  const unlock = await acquireStateLock(stateDirectory);
  try {
    const reservations = liveReservations(stateDirectory);
    const admission = decideAdmission(manifest, snapshot, reservations);
    if (!admission.ok) return admission;
    const reservationId = `${process.pid}-${randomUUID()}`;
    const reservation: Reservation = {
      schema: 1,
      reservation_id: reservationId,
      job_id: manifest.job_id,
      controller_pid: process.pid,
      cpu_ids: admission.cpu_ids,
      host_ram_peak_bytes: manifest.host_ram_peak_bytes,
      scratch_bytes: manifest.scratch_bytes,
      device: admission.device,
      started_at: new Date().toISOString(),
    };
    const reservationPath = join(
      stateDirectory,
      `${reservationId}.reservation.json`,
    );
    const fd = openSync(reservationPath, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(reservation)}\n`);
    } finally {
      closeSync(fd);
    }
    return { reservation, reservationPath, stateDirectory };
  } finally {
    unlock();
  }
}

async function releaseLease(lease: Lease): Promise<void> {
  const unlock = await acquireStateLock(lease.stateDirectory);
  try {
    try {
      unlinkSync(lease.reservationPath);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
  } finally {
    unlock();
  }
}

function processGroupUsage(pgid: number): GroupUsage {
  let processes = 0;
  let rssBytes = 0;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = readFileSync(join("/proc", entry, "stat"), "utf8");
      const close = stat.lastIndexOf(")");
      if (close === -1) continue;
      const fields = stat.slice(close + 2).split(" ");
      const processGroup = Number(fields[2]);
      if (processGroup !== pgid) continue;
      processes += 1;
      const status = readFileSync(join("/proc", entry, "status"), "utf8");
      const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status)?.[1];
      if (rss !== undefined) rssBytes += Number(rss) * KiB;
    } catch {
      // A process can exit between /proc enumeration and either read.
    }
  }
  return { processes, rssBytes };
}

function signalProcessGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (errorCode(error) !== "ESRCH") throw error;
  }
}

async function terminateProcessGroup(
  pgid: number,
  graceSeconds: number,
): Promise<void> {
  signalProcessGroup(pgid, "SIGTERM");
  const deadline = performance.now() + graceSeconds * 1_000;
  while (
    performance.now() < deadline &&
    processGroupUsage(pgid).processes > 0
  ) {
    await Bun.sleep(50);
  }
  if (processGroupUsage(pgid).processes > 0) {
    signalProcessGroup(pgid, "SIGKILL");
  }
}

/**
 * Push the reserved VRAM budget into the job's runtime.
 *
 * Sharing one device between declared jobs is only sound if the declaration binds the process.
 * There is no cgroup controller for VRAM, so the ceiling has to be set inside the runtime:
 * CUDA.jl checks `JULIA_CUDA_HARD_MEMORY_LIMIT` before every allocation, and without it "will
 * configure the memory pool to use all available device memory" — one arm then swallows the card
 * no matter what its manifest claimed. `AGENT_RESOURCE_VRAM_BYTES` publishes the same budget for
 * runtimes we cannot configure through the environment (PyTorch wants an in-process
 * `set_per_process_memory_fraction`); honouring it is the job's responsibility, not the floor's.
 */
function gpuBudgetEnvironment(
  device: Reservation["device"],
): Record<string, string | undefined> {
  if (device.kind !== "gpu") {
    // Clear, don't merely omit: these keys are inherited from the caller's environment, so a CPU
    // job launched from a shell that once held a GPU budget would otherwise run under it.
    return {
      CUDA_VISIBLE_DEVICES: "",
      AGENT_RESOURCE_VRAM_BYTES: undefined,
      JULIA_CUDA_HARD_MEMORY_LIMIT: undefined,
      JULIA_CUDA_SOFT_MEMORY_LIMIT: undefined,
    };
  }
  const hard = device.vram_peak_bytes;
  return {
    CUDA_VISIBLE_DEVICES: String(device.gpu_id),
    AGENT_RESOURCE_VRAM_BYTES: String(hard),
    JULIA_CUDA_HARD_MEMORY_LIMIT: String(hard),
    JULIA_CUDA_SOFT_MEMORY_LIMIT: String(
      Math.floor(hard * GPU_SOFT_LIMIT_FRACTION),
    ),
  };
}

export function createAdmissionReceipt(
  manifestSource: ManifestSource,
  reservation: Reservation,
  admissionId = randomUUID(),
): AdmissionReceipt {
  const payload: AdmissionReceiptPayload = {
    schema: 1,
    admission_id: admissionId,
    manifest_path: manifestSource.path,
    manifest_sha256: manifestSource.sha256,
    job_id: reservation.job_id,
    reservation_id: reservation.reservation_id,
    scope_unit: scopeUnitFor(reservation),
    controller_pid: reservation.controller_pid,
    cpu_ids: reservation.cpu_ids,
    host_ram_peak_bytes: reservation.host_ram_peak_bytes,
    scratch_bytes: reservation.scratch_bytes,
    device: reservation.device,
    started_at: reservation.started_at,
  };
  const canonicalPayload = JSON.stringify(payload);
  return {
    payload: canonicalPayload,
    sha256: sha256Hex(Buffer.from(canonicalPayload, "utf8")),
    admissionId,
    manifestSource,
  };
}

function receiptDeviceFrom(
  value: unknown,
): AdmissionReceiptPayload["device"] | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "cpu") {
    return hasExactKeys(value, ["kind"]) ? { kind: "cpu" } : null;
  }
  if (
    value.kind === "gpu" &&
    hasExactKeys(value, ["kind", "gpu_id", "vram_peak_bytes"]) &&
    isSafeIntegerInRange(value.gpu_id, 0, 1_024) &&
    isSafeIntegerInRange(value.vram_peak_bytes, 1)
  ) {
    return {
      kind: "gpu",
      gpu_id: value.gpu_id,
      vram_peak_bytes: value.vram_peak_bytes,
    };
  }
  return null;
}

function admissionReceiptPayloadFrom(
  value: unknown,
): AdmissionReceiptPayload | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema",
      "admission_id",
      "manifest_path",
      "manifest_sha256",
      "job_id",
      "reservation_id",
      "scope_unit",
      "controller_pid",
      "cpu_ids",
      "host_ram_peak_bytes",
      "scratch_bytes",
      "device",
      "started_at",
    ]) ||
    value.schema !== 1 ||
    !isNonEmptyText(value.admission_id) ||
    !isNonEmptyText(value.manifest_path) ||
    !isAbsolute(value.manifest_path) ||
    resolve(value.manifest_path) !== value.manifest_path ||
    !isSha256Hex(value.manifest_sha256) ||
    !isNonEmptyText(value.job_id, 80) ||
    !isNonEmptyText(value.reservation_id, 256) ||
    !isNonEmptyText(value.scope_unit, 300) ||
    !isSafeIntegerInRange(value.controller_pid, 1) ||
    !Array.isArray(value.cpu_ids) ||
    !isSafeIntegerInRange(value.host_ram_peak_bytes, 1) ||
    !isSafeIntegerInRange(value.scratch_bytes, 0) ||
    !isNonEmptyText(value.started_at, 64) ||
    Number.isNaN(Date.parse(value.started_at))
  ) {
    return null;
  }
  if (new Date(value.started_at).toISOString() !== value.started_at)
    return null;

  const cpuIds: number[] = [];
  for (const cpuId of value.cpu_ids) {
    if (!isSafeIntegerInRange(cpuId, 0) || cpuIds.includes(cpuId)) return null;
    cpuIds.push(cpuId);
  }
  if (cpuIds.length === 0) return null;

  const device = receiptDeviceFrom(value.device);
  if (device === null) return null;
  if (value.scope_unit !== `agent-resource-${value.reservation_id}.scope`) {
    return null;
  }
  return {
    schema: 1,
    admission_id: value.admission_id,
    manifest_path: value.manifest_path,
    manifest_sha256: value.manifest_sha256,
    job_id: value.job_id,
    reservation_id: value.reservation_id,
    scope_unit: value.scope_unit,
    controller_pid: value.controller_pid,
    cpu_ids: cpuIds,
    host_ram_peak_bytes: value.host_ram_peak_bytes,
    scratch_bytes: value.scratch_bytes,
    device,
    started_at: value.started_at,
  };
}

/**
 * Verify the receipt's byte integrity and that this process is in its bound systemd scope.
 * This is cooperative same-host provenance only: another process with the same UID can create
 * matching environment variables and a scope, so it is not cryptographic launcher identity.
 */
export function verifyAdmissionReceipt(
  payload: string,
  expectedSha256: string,
  cgroupText: string,
): boolean {
  if (!isSha256Hex(expectedSha256)) return false;
  if (sha256Hex(Buffer.from(payload, "utf8")) !== expectedSha256) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  const receipt = admissionReceiptPayloadFrom(parsed);
  if (receipt === null || JSON.stringify(receipt) !== payload) return false;
  return cgroupText.split("\n").some((line) => {
    const cgroupPath = line.split(":", 3)[2];
    return cgroupPath?.split("/").includes(receipt.scope_unit) ?? false;
  });
}

export function commandEnvironment(
  manifest: ResourceManifest,
  reservation: Reservation,
  receipt: AdmissionReceipt,
): Record<string, string | undefined> {
  if (manifest.job_id !== reservation.job_id) {
    throw new StateError("manifest and reservation job_id must match");
  }
  if (
    manifest.cpu_threads !== reservation.cpu_ids.length ||
    manifest.host_ram_peak_bytes !== reservation.host_ram_peak_bytes ||
    manifest.scratch_bytes !== reservation.scratch_bytes ||
    (manifest.device.kind === "cpu" && reservation.device.kind !== "cpu") ||
    (manifest.device.kind === "gpu" &&
      (reservation.device.kind !== "gpu" ||
        manifest.device.gpu_id !== reservation.device.gpu_id ||
        manifest.device.vram_peak_bytes !== reservation.device.vram_peak_bytes))
  ) {
    throw new StateError(
      "manifest and reservation resources must match before constructing child environment",
    );
  }
  const threads = String(manifest.cpu_threads);
  return {
    ...process.env,
    // These values are runner-owned. Replacing every key prevents a caller from passing a
    // plausible-looking admission into its child before the real lease exists.
    AGENT_RESOURCE_JOB_ID: manifest.job_id,
    AGENT_RESOURCE_CPU_IDS: reservation.cpu_ids.join(","),
    AGENT_RESOURCE_MAX_PROCESSES: String(manifest.processes),
    AGENT_RESOURCE_HOST_RAM_BYTES: String(reservation.host_ram_peak_bytes),
    AGENT_RESOURCE_SCRATCH_BYTES: String(reservation.scratch_bytes),
    AGENT_RESOURCE_MANIFEST_SHA256: receipt.manifestSource.sha256,
    AGENT_RESOURCE_MANIFEST_PATH: receipt.manifestSource.path,
    AGENT_RESOURCE_ADMISSION_ID: receipt.admissionId,
    AGENT_RESOURCE_RESERVATION_ID: reservation.reservation_id,
    AGENT_RESOURCE_ADMISSION_RECEIPT: receipt.payload,
    AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256: receipt.sha256,
    JULIA_NUM_THREADS: threads,
    OPENBLAS_NUM_THREADS: threads,
    OMP_NUM_THREADS: threads,
    MKL_NUM_THREADS: threads,
    VECLIB_MAXIMUM_THREADS: threads,
    NUMEXPR_NUM_THREADS: threads,
    RAYON_NUM_THREADS: threads,
    POLARS_MAX_THREADS: threads,
    ...gpuBudgetEnvironment(reservation.device),
  };
}

export function kernelTasksMax(manifest: ResourceManifest): number {
  const requested =
    manifest.processes *
    (manifest.cpu_threads + RUNTIME_TASK_MARGIN_PER_PROCESS);
  return Math.min(MAX_KERNEL_TASKS, Math.max(MIN_KERNEL_TASKS, requested));
}

export function scopeUnitFor(reservation: Reservation): string {
  return `agent-resource-${reservation.reservation_id}.scope`;
}

export function buildSystemdLaunch(
  manifest: ResourceManifest,
  reservation: Reservation,
  command: string[],
): SystemdLaunch {
  const scopeUnit = scopeUnitFor(reservation);
  const scopeBase = scopeUnit.slice(0, -".scope".length);
  const tasksMax = kernelTasksMax(manifest);
  return {
    scopeUnit,
    tasksMax,
    argv: [
      "setsid",
      "--wait",
      "systemd-run",
      "--user",
      "--scope",
      "--quiet",
      "--collect",
      "--expand-environment=no",
      `--unit=${scopeBase}`,
      `--property=CPUQuota=${manifest.cpu_threads * 100}%`,
      // MemoryHigh at the SAME value as MemoryMax (2026-09-04, incident: a 28 GiB declaration
      // grew to a 34.5 GB peak and starved the host — the job never went through this function
      // at all, a separate coverage-hole finding; this fix hardens what this function itself
      // emits). Deliberately no runner-chosen multiplier on either number: the declared envelope
      // is the sole source of truth for both the soft-reclaim threshold and the hard-kill
      // threshold. MemoryHigh gives the kernel almost no room to grow past the declared line
      // before MemoryMax's OOM-kill fires — reclaim can run across several small allocations
      // near that line, not exactly once, but the margin stays negligible either way. Strictly
      // tighter than a `declared × 1.1` two-tier design (considered, not used): host safety is
      // what this fix exists for, and a runner-added margin is exactly the "declaration ≠
      // enforced number" shape already rejected for the OOM floor, even framed as kill hysteresis.
      `--property=MemoryHigh=${manifest.host_ram_peak_bytes}`,
      `--property=MemoryMax=${manifest.host_ram_peak_bytes}`,
      "--property=MemorySwapMax=0",
      `--property=TasksMax=${tasksMax}`,
      "--property=OOMPolicy=kill",
      "taskset",
      "-c",
      reservation.cpu_ids.join(","),
      ...command,
    ],
  };
}

function scopeIsInactive(exitCode: number): boolean {
  return exitCode === 3 || exitCode === 4;
}

function boundedSystemctl(args: string[]): ReturnType<typeof Bun.spawnSync> {
  // bounded: GNU timeout caps every user-manager cleanup query at five seconds.
  return Bun.spawnSync(["timeout", "5s", "systemctl", "--user", ...args], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

function stopSystemdScope(scopeUnit: string): boolean {
  const active = boundedSystemctl(["is-active", "--quiet", scopeUnit]);
  if (scopeIsInactive(active.exitCode)) return true;
  if (active.exitCode !== 0) return false;

  const stopped = boundedSystemctl(["stop", scopeUnit]);
  if (stopped.exitCode !== 0) return false;

  const verified = boundedSystemctl(["is-active", "--quiet", scopeUnit]);
  return scopeIsInactive(verified.exitCode);
}

function defaultReport(line: string): void {
  process.stdout.write(`${line}\n`);
}

function admissionDescription(
  lease: Lease,
  receipt?: AdmissionReceipt,
): string {
  const device =
    lease.reservation.device.kind === "gpu"
      ? `gpu:${lease.reservation.device.gpu_id} vram_bytes=${lease.reservation.device.vram_peak_bytes}`
      : "cpu";
  const receiptFields =
    receipt === undefined
      ? ""
      : ` admission_id=${receipt.admissionId} ` +
        `reservation_id=${lease.reservation.reservation_id} ` +
        `scope_unit=${scopeUnitFor(lease.reservation)} ` +
        `manifest_sha256=${receipt.manifestSource.sha256} receipt_sha256=${receipt.sha256}`;
  return (
    `ADMIT job=${lease.reservation.job_id} cpu_ids=${lease.reservation.cpu_ids.join(",")} ` +
    `ram_bytes=${lease.reservation.host_ram_peak_bytes} device=${device} ` +
    `enforcement=systemd-cgroup+affinity+sampled-process-group${receiptFields}`
  );
}

export async function checkJob(
  manifest: ResourceManifest,
  options: ExecuteOptions = {},
): Promise<ExecutionResult> {
  const report = options.report ?? defaultReport;
  if (Bun.which("setsid") === null || Bun.which("taskset") === null) {
    report(
      `DENY job=${manifest.job_id} reason=setsid and taskset are required for enforcement`,
    );
    return { ok: false, exitCode: 69, reason: "admission" };
  }
  const kernel = options.kernelEnforcement ?? probeKernelEnforcement();
  if (!kernel.available) {
    report(
      `DENY job=${manifest.job_id} reason=kernel enforcement unavailable: ${kernel.reason}`,
    );
    return { ok: false, exitCode: 69, reason: "admission" };
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const snapshot = options.snapshot ?? probeHostSnapshot(cwd);
  const acquired = await acquireLease(
    manifest,
    snapshot,
    options.stateDirectory,
  );
  if (!("reservation" in acquired)) {
    report(`DENY job=${manifest.job_id} reason=${acquired.reason}`);
    return { ok: false, exitCode: 69, reason: "admission" };
  }
  try {
    report(`${admissionDescription(acquired)} check_only=true`);
    return { ok: true, exitCode: 0 };
  } finally {
    await releaseLease(acquired);
  }
}

export async function executeJob(
  manifest: ResourceManifest,
  command: string[],
  options: ExecuteOptions = {},
): Promise<ExecutionResult> {
  const report = options.report ?? defaultReport;
  const cwd = resolve(options.cwd ?? process.cwd());
  if (command.length === 0 || command[0]?.trim() === "") {
    throw new UsageError("a command is required unless --check-only is used");
  }
  if (options.manifestSource === undefined) {
    throw new UsageError(
      "executeJob requires manifestSource from the exact manifest bytes read by the runner",
    );
  }
  if (Bun.which("setsid") === null || Bun.which("taskset") === null) {
    report(
      `DENY job=${manifest.job_id} reason=setsid and taskset are required for enforcement`,
    );
    return { ok: false, exitCode: 69, reason: "admission" };
  }
  const kernel = options.kernelEnforcement ?? probeKernelEnforcement();
  if (!kernel.available) {
    report(
      `DENY job=${manifest.job_id} reason=kernel enforcement unavailable: ${kernel.reason}`,
    );
    return { ok: false, exitCode: 69, reason: "admission" };
  }
  const snapshot = options.snapshot ?? probeHostSnapshot(cwd);
  const acquired = await acquireLease(
    manifest,
    snapshot,
    options.stateDirectory,
  );
  if (!("reservation" in acquired)) {
    report(`DENY job=${manifest.job_id} reason=${acquired.reason}`);
    return { ok: false, exitCode: 69, reason: "admission" };
  }

  const lease = acquired;
  const receipt = createAdmissionReceipt(
    options.manifestSource,
    lease.reservation,
  );
  report(admissionDescription(lease, receipt));
  const timeoutSignal = AbortSignal.timeout(manifest.walltime_seconds * 1_000);
  let walltimeFired = false;
  let interrupted = false;
  let pgid: number | null = null;
  let scopeUnit: string | null = null;
  const onTimeout = (): void => {
    walltimeFired = true;
    if (pgid !== null) signalProcessGroup(pgid, "SIGTERM");
  };
  const onInterrupt = (): void => {
    interrupted = true;
    if (pgid !== null) signalProcessGroup(pgid, "SIGTERM");
  };
  timeoutSignal.addEventListener("abort", onTimeout, { once: true });
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);

  try {
    let child: ReturnType<typeof Bun.spawn>;
    try {
      const launch = buildSystemdLaunch(manifest, lease.reservation, command);
      scopeUnit = launch.scopeUnit;
      // bounded: AbortSignal enforces manifest.walltime_seconds; the monitor additionally
      // terminates the entire new session/process group for exact process-count breaches.
      // systemd independently enforces CPU, RAM, zero job swap, and a coarse task ceiling.
      child = Bun.spawn(launch.argv, {
        cwd,
        env: commandEnvironment(manifest, lease.reservation, receipt),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        signal: timeoutSignal,
      });
      pgid = child.pid;
    } catch (error) {
      report(
        `ERROR job=${manifest.job_id} reason=launch detail=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false, exitCode: 70, reason: "launch" };
    }

    let exited = false;
    let commandExitCode = 70;
    const exitedPromise = child.exited.then((code) => {
      exited = true;
      commandExitCode = code;
      return code;
    });
    const interval = Math.max(
      10,
      options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS,
    );
    let breach: "memory" | "processes" | null = null;

    while (!exited && !walltimeFired && !interrupted && breach === null) {
      const usage = processGroupUsage(pgid);
      if (usage.rssBytes > manifest.host_ram_peak_bytes) breach = "memory";
      else if (usage.processes > manifest.processes) breach = "processes";
      if (breach !== null) break;
      await Promise.race([exitedPromise, Bun.sleep(interval)]);
    }

    if (walltimeFired || interrupted || breach !== null) {
      await terminateProcessGroup(pgid, manifest.cleanup.grace_seconds);
      await exitedPromise.catch(() => 70);
      const reason = walltimeFired
        ? "walltime"
        : interrupted
          ? "interrupt"
          : (breach as "memory" | "processes");
      const exitCode = reason === "walltime" ? 124 : 137;
      report(`BREACH job=${manifest.job_id} reason=${reason}`);
      return { ok: false, exitCode, reason };
    }

    await exitedPromise;
    if (processGroupUsage(pgid).processes > 0) {
      await terminateProcessGroup(pgid, manifest.cleanup.grace_seconds);
      report(`BREACH job=${manifest.job_id} reason=cleanup`);
      return { ok: false, exitCode: 137, reason: "cleanup" };
    }
    if (commandExitCode !== 0) {
      report(
        `EXIT job=${manifest.job_id} code=${commandExitCode} reason=command-exit`,
      );
      return {
        ok: false,
        exitCode: commandExitCode,
        reason: "command-exit",
      };
    }
  } finally {
    timeoutSignal.removeEventListener("abort", onTimeout);
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    if (pgid !== null && processGroupUsage(pgid).processes > 0) {
      await terminateProcessGroup(pgid, manifest.cleanup.grace_seconds);
    }
    const scopeCleanup = options.systemdScopeCleanup ?? stopSystemdScope;
    const scopeStopped = scopeUnit === null ? true : scopeCleanup(scopeUnit);
    await releaseLease(lease);
    if (!scopeStopped) {
      throw new StateError(
        `failed to verify cleanup of systemd scope '${scopeUnit}'`,
      );
    }
  }
  report(`PASS job=${manifest.job_id} code=0`);
  return { ok: true, exitCode: 0 };
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new UsageError(`${flag} requires a value`);
    return value;
  };
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "agent-resource-run",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[command...]"],
      help: {
        description:
          "Admit and run one bounded Linux job from a JSON resource envelope.",
      },
      flags: {
        manifest: { type: nonEmptyString("--manifest") },
        checkOnly: { type: Boolean, default: false },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed.flags.manifest === undefined) {
    throw new UsageError("--manifest is required");
  }
  const manifestPath = resolve(parsed.flags.manifest);
  let manifestBytes: Uint8Array;
  let raw: unknown;
  try {
    manifestBytes = readFileSync(manifestPath);
    raw = JSON.parse(manifestBytes.toString());
  } catch (error) {
    throw new UsageError(
      `cannot read manifest '${manifestPath}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const manifest = validateManifest(raw);
  const manifestSource = manifestSourceFromBytes(manifestPath, manifestBytes);
  const command = parsed._.map(String);
  if (parsed.flags.checkOnly === true && command.length > 0) {
    throw new UsageError("--check-only does not accept a command");
  }
  const result =
    parsed.flags.checkOnly === true
      ? await checkJob(manifest)
      : await executeJob(manifest, command, { manifestSource });
  process.exitCode = result.exitCode;
}

if (import.meta.main) {
  main().catch((error) => {
    const usage = error instanceof UsageError;
    process.stderr.write(
      `${usage ? "USAGE" : "ERROR"}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = usage ? 2 : 70;
  });
}
