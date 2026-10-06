#!/usr/bin/env bun
// Consumer: agents and humans running bounded numerical jobs or heavyweight services.
// This is a Linux fail-closed admission controller: disjoint CPU affinity, aggregate
// reservations, user-systemd cgroup CPU/RAM/swap/task limits, sampled exact process ceilings,
// walltime, and TERM→KILL cleanup.

import {
  closeSync,
  existsSync,
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
import { homedir, tmpdir } from "node:os";
import { cli } from "cleye";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
  type ResultAsync,
} from "neverthrow";
import { jsonOf, jsonText, z } from "../hooks/zod.ts";
import { cgroupMemory } from "./lib/cgroup-memory.ts";

const KiB = 1024;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
// Implementation invariants, not operator policy. Every operator-tunable threshold (CPU/RAM/
// scratch/VRAM safety headroom, GPU idle rules and concurrency cap, sampling intervals) and the
// reason for its value lives in resource-policy.toml next to this file — see loadResourcePolicy.
const LOCK_WAIT_MS = 2_000;
const LOCK_STALE_MS = 5_000;
const MIN_KERNEL_TASKS = 32;
const RUNTIME_TASK_MARGIN_PER_PROCESS = 16;
const MAX_KERNEL_TASKS = 65_535;
const KERNEL_PROBE_MEMORY_BYTES = 16 * MiB;

class UsageError extends Error {}
class StateError extends Error {}

// --- Policy: CONFIG vs MECHANISM ----------------------------------------------------------------
// resource-policy.toml says HOW MUCH is held back; this file says HOW. The TOML is resolved next
// to this script's real path (import.meta.dir, so the `bun link` bin finds it), or at the
// absolute path in AGENT_RESOURCE_POLICY (tests). Every key is required, typed, and range-checked;
// any violation refuses admission with the file and key named — never a guessed default.

/** The validated operator policy, in the units the mechanism uses (bytes, ms). */
export type ResourcePolicy = {
  cpu_safety_count: number;
  min_host_ram_safety_bytes: number;
  host_ram_safety_fraction: number;
  scratch_safety_bytes: number;
  gpu_safety_bytes: number;
  gpu_idle_utilization_percent: number;
  gpu_idle_power_watts: number;
  gpu_max_concurrent_jobs: number;
  gpu_soft_limit_fraction: number;
  default_monitor_interval_ms: number;
  gpu_vram_sample_interval_ms: number;
  gpu_partition_device: number;
  gpu_partition_ccc_bytes: number;
  gpu_partition_rerank_bytes: number;
};

// Any non-null, non-array object (the shape every untrusted JSON/TOML value is first checked
// against); `undefined` when the value is anything else.
const RecordSchema = z.looseObject({});
function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = RecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const safeIntIn = (minimum: number, maximum = Number.MAX_SAFE_INTEGER) =>
  z
    .number()
    .refine(
      (value) =>
        Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    );
const textOf = (maximum = 2_000) =>
  z.string().refine((value) => value.trim() !== "" && value.length <= maximum);

const ResourcePolicySchema: z.ZodType<ResourcePolicy> = z.object({
  cpu_safety_count: z.number(),
  min_host_ram_safety_bytes: z.number(),
  host_ram_safety_fraction: z.number(),
  scratch_safety_bytes: z.number(),
  gpu_safety_bytes: z.number(),
  gpu_idle_utilization_percent: z.number(),
  gpu_idle_power_watts: z.number(),
  gpu_max_concurrent_jobs: z.number(),
  gpu_soft_limit_fraction: z.number(),
  default_monitor_interval_ms: z.number(),
  gpu_vram_sample_interval_ms: z.number(),
  gpu_partition_device: z.number(),
  gpu_partition_ccc_bytes: z.number(),
  gpu_partition_rerank_bytes: z.number(),
});

type PolicyRule = {
  field: keyof ResourcePolicy;
  expected: string;
  valid: (value: number) => boolean;
  scale: number;
};

const positiveInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;
const fraction = (value: number): boolean => value > 0 && value <= 1;
const nonNegativeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

// TOML key -> typed field. Sizes are whole MiB/GiB so the byte values stay exact integers.
const POLICY_RULES: Record<string, PolicyRule> = {
  cpu_safety_count: {
    field: "cpu_safety_count",
    expected: "a positive integer",
    valid: positiveInteger,
    scale: 1,
  },
  min_host_ram_safety_gib: {
    field: "min_host_ram_safety_bytes",
    expected: "a positive integer (GiB)",
    valid: positiveInteger,
    scale: GiB,
  },
  host_ram_safety_fraction: {
    field: "host_ram_safety_fraction",
    expected: "a fraction in (0, 1]",
    valid: fraction,
    scale: 1,
  },
  scratch_safety_gib: {
    field: "scratch_safety_bytes",
    expected: "a positive integer (GiB)",
    valid: positiveInteger,
    scale: GiB,
  },
  gpu_safety_mib: {
    field: "gpu_safety_bytes",
    expected: "a positive integer (MiB)",
    valid: positiveInteger,
    scale: MiB,
  },
  gpu_idle_utilization_percent: {
    field: "gpu_idle_utilization_percent",
    expected: "a percentage in (0, 100]",
    valid: (value) => value > 0 && value <= 100,
    scale: 1,
  },
  gpu_idle_power_watts: {
    field: "gpu_idle_power_watts",
    expected: "a positive number (W)",
    valid: (value) => value > 0,
    scale: 1,
  },
  gpu_max_concurrent_jobs: {
    field: "gpu_max_concurrent_jobs",
    expected: "a positive integer",
    valid: positiveInteger,
    scale: 1,
  },
  gpu_soft_limit_fraction: {
    field: "gpu_soft_limit_fraction",
    expected: "a fraction in (0, 1]",
    valid: fraction,
    scale: 1,
  },
  default_monitor_interval_ms: {
    field: "default_monitor_interval_ms",
    expected: "a positive integer (ms)",
    valid: positiveInteger,
    scale: 1,
  },
  gpu_vram_sample_interval_ms: {
    field: "gpu_vram_sample_interval_ms",
    expected: "a positive integer (ms)",
    valid: positiveInteger,
    scale: 1,
  },
  gpu_partition_device: {
    field: "gpu_partition_device",
    expected: "a non-negative integer (GPU index)",
    valid: nonNegativeInteger,
    scale: 1,
  },
  gpu_partition_ccc_mib: {
    field: "gpu_partition_ccc_bytes",
    expected: "a non-negative integer (MiB; 0 = no partition)",
    valid: nonNegativeInteger,
    scale: MiB,
  },
  gpu_partition_rerank_mib: {
    field: "gpu_partition_rerank_bytes",
    expected: "a non-negative integer (MiB; 0 = no partition)",
    valid: nonNegativeInteger,
    scale: MiB,
  },
};

const DEFAULT_POLICY_PATH = join(import.meta.dir, "resource-policy.toml");

/** The policy file this process reads: AGENT_RESOURCE_POLICY (absolute) or the shipped TOML. */
export function resourcePolicyPath(): Result<string, UsageError> {
  const override = process.env.AGENT_RESOURCE_POLICY;
  if (override === undefined || override === "") return ok(DEFAULT_POLICY_PATH);
  if (!isAbsolute(override)) {
    return err(
      new UsageError(
        `AGENT_RESOURCE_POLICY must be an absolute path, got '${override}'`,
      ),
    );
  }
  return ok(override);
}

function policyKeyErrors(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (raw.schema !== 1) {
    errors.push(`schema: expected 1, got ${JSON.stringify(raw.schema)}`);
  }
  for (const key of Object.keys(raw)) {
    if (key !== "schema" && !Object.hasOwn(POLICY_RULES, key)) {
      errors.push(`${key}: unknown key`);
    }
  }
  for (const [key, rule] of Object.entries(POLICY_RULES)) {
    const value = raw[key];
    if (value === undefined) {
      errors.push(
        `${key}: required key is missing (expected ${rule.expected})`,
      );
    } else if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !rule.valid(value)
    ) {
      errors.push(
        `${key}: expected ${rule.expected}, got ${JSON.stringify(value)}`,
      );
    }
  }
  return errors;
}

/**
 * Read and validate one policy file. Errors name the file and every bad key; there is no default
 * for any key.
 */
export function loadResourcePolicy(
  path?: string,
): Result<ResourcePolicy, UsageError> {
  const selectedPath = path === undefined ? resourcePolicyPath() : ok(path);
  return selectedPath.andThen((policyPath) => {
    const parsed = fromThrowable((): unknown =>
      Bun.TOML.parse(readFileSync(policyPath, "utf8")),
    )();
    if (parsed.isErr()) {
      return err(
        new UsageError(
          `cannot read resource policy '${policyPath}': ${
            parsed.error instanceof Error
              ? parsed.error.message
              : String(parsed.error)
          }`,
        ),
      );
    }
    const raw = asRecord(parsed.value);
    if (raw === undefined) {
      return err(
        new UsageError(`resource policy '${policyPath}' must be a TOML table`),
      );
    }
    const errors = policyKeyErrors(raw);
    if (errors.length > 0) {
      return err(
        new UsageError(
          `resource policy '${policyPath}' is invalid (admission refused, no defaults): ${errors.join("; ")}`,
        ),
      );
    }
    // Every value was range-checked as a finite number by policyKeyErrors above.
    const scaled = Object.entries(POLICY_RULES).map(
      ([key, rule]): [string, number] => {
        const n = z.number().safeParse(raw[key]);
        return [rule.field, (n.success ? n.data : Number.NaN) * rule.scale];
      },
    );
    const policy = ResourcePolicySchema.safeParse(Object.fromEntries(scaled));
    if (!policy.success) {
      return err(
        new UsageError(
          `resource policy '${policyPath}' is invalid (admission refused, no defaults): ${policy.error.message}`,
        ),
      );
    }
    return ok(policy.data);
  });
}

// Loaded once at startup. A broken policy does not crash the import; callers receive its error
// value, which main() reports as `USAGE:` exit 2.
const startupPolicy = loadResourcePolicy();

/** The policy this process started with, or its validation error. */
export function resourcePolicy(): Result<ResourcePolicy, UsageError> {
  return startupPolicy;
}

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
  // Board power draw in watts; undefined when nvidia-smi reports it as not available.
  power_watts?: number;
  // The on-demand reranker (repo-retrieve-rerank.service) is running right now. Only then does its
  // partition count as reserved; undefined = not running.
  rerank_active?: boolean;
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

/** The subset of AdmissionResult that decideAdmission's callers actually propagate as a failure. */
export type AdmissionFailure = Extract<AdmissionResult, { ok: false }>;

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
  /** Test seam for the host opt-in file; `null` = no opt-in. Default: readHostOptIn(). */
  hostOptIn?: HostOptIn | null;
  systemdScopeCleanup?: (scopeUnit: string) => boolean;
  /** Required for child execution so the receipt can name the exact admitted manifest bytes. */
  manifestSource?: ManifestSource;
};

type Lease = {
  // Discriminant against AdmissionFailure (`ok: false`) in acquireLease's result union.
  ok: true;
  reservation: Reservation;
  reservationPath: string;
  stateDirectory: string;
};

type GroupUsage = { processes: number; rssBytes: number; pids: number[] };

/**
 * What was actually observed, as opposed to what the manifest declared (`host_ram_peak_bytes`/
 * `vram_peak_bytes` in the ADMIT line above). `ram_peak_source` is "cgroup" when the scope's own
 * `MemoryPeak` accounting was readable (the authoritative number: kernel-tracked, immune to the
 * monitor loop's own sampling gaps) and "sampled" when it was not (falls back to the highest
 * `/proc` RSS reading the monitor loop itself took). VRAM has no such fallback — nvidia-smi is
 * the only source, so its absence just omits the field, same as `power_watts` on GpuSnapshot.
 */
export type MeasuredPeak = {
  schema: 1;
  job_id: string;
  ram_peak_measured_bytes: number;
  ram_peak_source: "cgroup" | "sampled";
  vram_peak_measured_bytes?: number;
  vram_peak_source?: "nvidia-smi";
  released_at: string;
};

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): Result<void, UsageError> {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    return err(
      new UsageError(`${label} has unknown field(s): ${extras.join(", ")}`),
    );
  }
  return ok(undefined);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): Result<number, UsageError> {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return err(
      new UsageError(`${label} must be an integer in [${minimum}, ${maximum}]`),
    );
  }
  return ok(value);
}

function nonEmpty(
  value: unknown,
  label: string,
  maximum = 2_000,
): Result<string, UsageError> {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maximum
  ) {
    return err(new UsageError(`${label} must be a non-empty string`));
  }
  return ok(value.trim());
}

// Shared by the manifest's own `job_id` field and the CLI's `--job-id` override (main(), below)
// — one rule, so a caller cannot supply through the flag a value the manifest itself would have
// rejected. Filesystem-safe (letters/digits/dot/underscore/hyphen only) because job_id ends up
// in reservation/receipt filenames and systemd unit names elsewhere in this file.
export function validateJobId(
  value: unknown,
  label: string,
): Result<string, UsageError> {
  return nonEmpty(value, label, 80).andThen((jobId) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(jobId)) {
      return err(
        new UsageError(
          `${label} must contain only letters, digits, dot, underscore, or hyphen`,
        ),
      );
    }
    return ok(jobId);
  });
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
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
): Result<T, UsageError> {
  const found = allowed.find((item) => item === value);
  if (found === undefined) {
    return err(
      new UsageError(`${label} must be one of: ${allowed.join(", ")}`),
    );
  }
  return ok(found);
}

function validateDevice(
  input: unknown,
): Result<CpuDevice | GpuDevice, UsageError> {
  const rawDevice = asRecord(input);
  if (rawDevice === undefined)
    return err(new UsageError("device must be an object"));

  if (rawDevice.kind === "cpu") {
    const keys = exactKeys(
      rawDevice,
      ["kind", "gpu_status", "gpu_vram_peak_bytes", "rationale"],
      "device",
    );
    if (keys.isErr()) return err(keys.error);
    const gpuStatus = oneOf(
      rawDevice.gpu_status,
      ["compatible", "incompatible", "not-beneficial"] as const,
      "device.gpu_status",
    );
    if (gpuStatus.isErr()) return err(gpuStatus.error);
    const gpuVram =
      rawDevice.gpu_vram_peak_bytes === undefined
        ? ok<number | undefined, UsageError>(undefined)
        : integer(
            rawDevice.gpu_vram_peak_bytes,
            "device.gpu_vram_peak_bytes",
            1,
          );
    if (gpuVram.isErr()) return err(gpuVram.error);
    if (gpuStatus.value === "compatible" && gpuVram.value === undefined) {
      return err(
        new UsageError(
          "device.gpu_vram_peak_bytes is required when gpu_status is compatible",
        ),
      );
    }
    const rationale = nonEmpty(rawDevice.rationale, "device.rationale");
    if (rationale.isErr()) return err(rationale.error);
    return ok({
      kind: "cpu",
      gpu_status: gpuStatus.value,
      ...(gpuVram.value === undefined
        ? {}
        : { gpu_vram_peak_bytes: gpuVram.value }),
      rationale: rationale.value,
    });
  }

  if (rawDevice.kind === "gpu") {
    const keys = exactKeys(
      rawDevice,
      ["kind", "gpu_id", "vram_peak_bytes"],
      "device",
    );
    if (keys.isErr()) return err(keys.error);
    const gpuId = integer(rawDevice.gpu_id, "device.gpu_id", 0, 1_024);
    if (gpuId.isErr()) return err(gpuId.error);
    const vram = integer(
      rawDevice.vram_peak_bytes,
      "device.vram_peak_bytes",
      1,
    );
    if (vram.isErr()) return err(vram.error);
    return ok({
      kind: "gpu",
      gpu_id: gpuId.value,
      vram_peak_bytes: vram.value,
    });
  }
  return err(new UsageError("device.kind must be cpu or gpu"));
}

function validateCleanup(
  input: unknown,
): Result<Record<string, unknown>, UsageError> {
  const cleanup = asRecord(input);
  if (cleanup === undefined)
    return err(new UsageError("cleanup must be an object"));
  const keys = exactKeys(cleanup, ["mode", "grace_seconds"], "cleanup");
  if (keys.isErr()) return err(keys.error);
  if (cleanup.mode !== "term-then-kill") {
    return err(new UsageError("cleanup.mode must be term-then-kill"));
  }
  return ok(cleanup);
}

export function validateManifest(
  input: unknown,
): Result<ResourceManifest, UsageError> {
  const value = asRecord(input);
  if (value === undefined)
    return err(new UsageError("manifest must be a JSON object"));
  const keys = exactKeys(
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
  if (keys.isErr()) return err(keys.error);
  if (value.schema !== 1) return err(new UsageError("schema must be 1"));
  const jobId = validateJobId(value.job_id, "job_id");
  if (jobId.isErr()) return err(jobId.error);
  const device = validateDevice(value.device);
  if (device.isErr()) return err(device.error);
  const cleanup = validateCleanup(value.cleanup);
  if (cleanup.isErr()) return err(cleanup.error);
  // Validated to be exactly 0; child_fanout is pinned to the literal type 0 in ResourceManifest
  // (no nested agent fanout is supported yet), so the checked value is used as that literal below.
  const childFanout = integer(value.child_fanout, "child_fanout", 0, 0);
  if (childFanout.isErr()) return err(childFanout.error);
  const runClass = oneOf(
    value.run_class,
    ["pilot", "full", "test", "service"] as const,
    "run_class",
  );
  if (runClass.isErr()) return err(runClass.error);
  const cpuThreads = integer(value.cpu_threads, "cpu_threads", 1, 1_024);
  if (cpuThreads.isErr()) return err(cpuThreads.error);
  const processes = integer(value.processes, "processes", 1, 4_096);
  if (processes.isErr()) return err(processes.error);
  const hostRamPeak = integer(
    value.host_ram_peak_bytes,
    "host_ram_peak_bytes",
    1,
  );
  if (hostRamPeak.isErr()) return err(hostRamPeak.error);
  const memoryBound = nonEmpty(value.memory_bound, "memory_bound");
  if (memoryBound.isErr()) return err(memoryBound.error);
  const scratchBytes = integer(value.scratch_bytes, "scratch_bytes", 0);
  if (scratchBytes.isErr()) return err(scratchBytes.error);
  const walltimeSeconds = integer(
    value.walltime_seconds,
    "walltime_seconds",
    1,
    86_400,
  );
  if (walltimeSeconds.isErr()) return err(walltimeSeconds.error);
  const graceSeconds = integer(
    cleanup.value.grace_seconds,
    "cleanup.grace_seconds",
    1,
    30,
  );
  if (graceSeconds.isErr()) return err(graceSeconds.error);

  return ok({
    schema: 1,
    job_id: jobId.value,
    run_class: runClass.value,
    cpu_threads: cpuThreads.value,
    processes: processes.value,
    host_ram_peak_bytes: hostRamPeak.value,
    memory_bound: memoryBound.value,
    device: device.value,
    scratch_bytes: scratchBytes.value,
    child_fanout: 0,
    walltime_seconds: walltimeSeconds.value,
    cleanup: { mode: "term-then-kill", grace_seconds: graceSeconds.value },
  });
}

function addCpuRange(
  range: RegExpExecArray,
  part: string,
  cpus: Set<number>,
): Result<void, StateError> {
  const first = Number(range[1]);
  const last = Number(range[2]);
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    last < first
  ) {
    return err(new StateError(`invalid CPU range '${part}'`));
  }
  for (let cpu = first; cpu <= last; cpu += 1) cpus.add(cpu);
  return ok(undefined);
}

export function parseCpuList(text: string): Result<number[], StateError> {
  const cpus = new Set<number>();
  for (const rawPart of text.trim().split(",")) {
    const part = rawPart.trim();
    if (part === "") continue;
    const added = addCpuPart(part, cpus);
    if (added.isErr()) return err(added.error);
  }
  const result = [...cpus].toSorted((a, b) => a - b);
  if (result.length === 0)
    return err(new StateError("allowed CPU list is empty"));
  return ok(result);
}

function addCpuPart(part: string, cpus: Set<number>): Result<void, StateError> {
  const range = /^(\d+)-(\d+)$/u.exec(part);
  if (range !== null) return addCpuRange(range, part, cpus);
  if (!/^\d+$/u.test(part))
    return err(new StateError(`invalid CPU id '${part}'`));
  cpus.add(Number(part));
  return ok(undefined);
}

function meminfoBytes(text: string, key: string): Result<number, StateError> {
  const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB$`, "mu").exec(text);
  if (match === null) return err(new StateError(`/proc/meminfo lacks ${key}`));
  return ok(Number(match[1]) * KiB);
}

// One row of `nvidia-smi --query-gpu=index,memory.total,memory.used,utilization.gpu,power.draw
// --format=csv,noheader,nounits`. The first four fields are required; power.draw may read
// "[N/A]" on boards that do not report it, which leaves power_watts undefined.
export function parseNvidiaSmiGpuRow(
  line: string,
): Result<GpuSnapshot, StateError> {
  const fields = line.split(",").map((field) => Number(field.trim()));
  const [id, totalMiB, usedMiB, utilization, power] = fields;
  if (
    fields.length !== 5 ||
    id === undefined ||
    totalMiB === undefined ||
    usedMiB === undefined ||
    utilization === undefined ||
    power === undefined ||
    fields.slice(0, 4).some((field) => !Number.isFinite(field))
  ) {
    return err(new StateError(`unparseable nvidia-smi row: ${line}`));
  }
  const row: GpuSnapshot = {
    id,
    total_bytes: totalMiB * MiB,
    used_bytes: usedMiB * MiB,
    utilization_percent: utilization,
  };
  if (Number.isFinite(power)) row.power_watts = power;
  return ok(row);
}

// Unmanaged load: utilization above the idle threshold, unless the board draws idle power
// (display-only load, e.g. a WSL2 host's desktop compositor). Unknown power keeps the
// conservative utilization-only rule.
function unmanagedGpuLoad(gpu: GpuSnapshot, policy: ResourcePolicy): boolean {
  if (gpu.utilization_percent <= policy.gpu_idle_utilization_percent)
    return false;
  if (
    gpu.power_watts !== undefined &&
    gpu.power_watts < policy.gpu_idle_power_watts
  )
    return false;
  return true;
}

export function hasUnmanagedGpuLoad(
  gpu: GpuSnapshot,
  policy?: ResourcePolicy,
): Result<boolean, UsageError> {
  const selectedPolicy = policy === undefined ? resourcePolicy() : ok(policy);
  return selectedPolicy.map((resolvedPolicy) =>
    unmanagedGpuLoad(gpu, resolvedPolicy),
  );
}

function probeGpus(): Result<GpuSnapshot[], StateError> {
  if (Bun.which("nvidia-smi") === null || Bun.which("timeout") === null)
    return ok([]);
  // bounded: GNU timeout caps the local nvidia-smi probe at five seconds.
  const spawned = fromThrowable(() =>
    Bun.spawnSync(
      [
        "timeout",
        "5s",
        "nvidia-smi",
        "--query-gpu=index,memory.total,memory.used,utilization.gpu,power.draw",
        "--format=csv,noheader,nounits",
      ],
      { stdout: "pipe", stderr: "ignore" },
    ),
  )();
  if (spawned.isErr() || spawned.value.exitCode !== 0) return ok([]);
  const rerankActive = rerankServiceActive();
  const snapshots: GpuSnapshot[] = [];
  for (const row of spawned.value.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)) {
    const parsed = parseNvidiaSmiGpuRow(row);
    if (parsed.isErr()) return err(parsed.error);
    snapshots.push(
      rerankActive
        ? Object.assign({}, parsed.value, { rerank_active: true })
        : parsed.value,
    );
  }
  return ok(snapshots);
}

// The reranker is socket-activated and idle-exits, so its partition is held only while it runs.
// If it starts after a job took that room, its own start-up check (gpu_partition.py: free VRAM >=
// partition) refuses, so the two never double-book. No systemd (macOS) → not running.
function rerankServiceActive(): boolean {
  if (Bun.which("systemctl") === null || Bun.which("timeout") === null)
    return false;
  // bounded: GNU timeout caps the local systemctl query at five seconds.
  const probe = fromThrowable(() =>
    Bun.spawnSync(
      [
        "timeout",
        "5s",
        "systemctl",
        "--user",
        "is-active",
        "--quiet",
        "repo-retrieve-rerank.service",
      ],
      { stdout: "ignore", stderr: "ignore" },
    ),
  )();
  return probe.isOk() && probe.value.exitCode === 0;
}

export function probeHostSnapshot(cwd: string): Result<HostSnapshot, Error> {
  if (process.platform !== "linux") {
    return err(
      new StateError(
        `unsupported platform '${process.platform}': affinity/RSS enforcement is Linux-only`,
      ),
    );
  }
  const statusResult = fromThrowable(() =>
    readFileSync("/proc/self/status", "utf8"),
  )();
  if (statusResult.isErr()) return err(asError(statusResult.error));
  const status = statusResult.value;
  const allowed = /^Cpus_allowed_list:\s*(.+)$/mu.exec(status)?.[1];
  if (allowed === undefined) {
    return err(new StateError("/proc/self/status lacks Cpus_allowed_list"));
  }
  const meminfoResult = fromThrowable(() =>
    readFileSync("/proc/meminfo", "utf8"),
  )();
  if (meminfoResult.isErr()) return err(asError(meminfoResult.error));
  const filesystemResult = fromThrowable(() => statfsSync(cwd))();
  if (filesystemResult.isErr()) return err(asError(filesystemResult.error));
  const cpus = parseCpuList(allowed);
  if (cpus.isErr()) return err(cpus.error);
  const total = meminfoBytes(meminfoResult.value, "MemTotal");
  if (total.isErr()) return err(total.error);
  const available = meminfoBytes(meminfoResult.value, "MemAvailable");
  if (available.isErr()) return err(available.error);
  const gpus = probeGpus();
  if (gpus.isErr()) return err(gpus.error);
  // In a container /proc/meminfo is the HOST; admit against the cgroup limit when one caps memory
  // below it (Vast 2026-10-06: host 503 GB "available 307 GB", container limit 171 GiB at 95% anon).
  const cg = cgroupMemory(
    (path) =>
      fromThrowable(() => readFileSync(path, "utf8"))().unwrapOr(undefined),
    total.value,
  );
  return ok({
    allowed_cpu_ids: cpus.value,
    mem_total_bytes:
      cg === undefined ? total.value : Math.min(total.value, cg.limitBytes),
    mem_available_bytes:
      cg === undefined
        ? available.value
        : Math.min(available.value, cg.limitBytes - cg.usedBytes),
    scratch_available_bytes:
      filesystemResult.value.bavail * filesystemResult.value.bsize,
    gpus: gpus.value,
  });
}

function oneLineDiagnostic(text: string): string {
  return text.trim().replaceAll(/\s+/gu, " ").slice(0, 400);
}

export function probeKernelEnforcement(): Result<KernelEnforcement, Error> {
  if (process.platform !== "linux") {
    return ok({
      available: false,
      reason: `user-systemd cgroup enforcement is Linux-only, not '${process.platform}'`,
    });
  }
  const required = ["systemd-run", "systemctl", "timeout", "true"] as const;
  for (const command of required) {
    if (Bun.which(command) === null) {
      return ok({ available: false, reason: `${command} is required` });
    }
  }
  const truePath = Bun.which("true");
  if (truePath === null) {
    return ok({ available: false, reason: "true is required" });
  }

  const unit = `agent-resource-probe-${process.pid}-${randomUUID().slice(0, 8)}`;
  // bounded: GNU timeout caps the user-manager/property capability probe at five seconds.
  const spawned = fromThrowable(() =>
    Bun.spawnSync(
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
    ),
  )();
  if (spawned.isErr()) return err(asError(spawned.error));
  const result = spawned.value;
  if (result.exitCode !== 0) {
    const detail = oneLineDiagnostic(result.stderr.toString());
    return ok({
      available: false,
      reason:
        `user-systemd cgroup probe exited ${result.exitCode}` +
        (detail === "" ? "" : `: ${detail}`),
    });
  }
  return ok({ available: true });
}

// --- Host opt-in: a machine where cgroup enforcement cannot exist --------------------------------
// A rented container (Vast.ai, 2026-10-05) has a read-only cgroup tree, no CAP_SYS_ADMIN and no user
// systemd: probeKernelEnforcement() can never pass there, and fail-closed admitted nothing at all.
// Its owner may declare, ONCE PER MACHINE and with a reason, that jobs there run under the sampled
// ceilings alone — the process-group RSS and process-count monitor, walltime, TERM→KILL that every
// admitted job already runs — without the kernel's own MemoryMax/TasksMax. Never a default: no file
// → refused exactly as before; and where cgroups DO work they are used, whatever the file says.
// Not prlimit as a stand-in: RLIMIT_AS breaks CUDA's address-space reservation, and RLIMIT_NPROC
// counts every process of the user, not the job's.
export type HostOptIn = { sampled_enforcement_reason: string };
export type Enforcement =
  | { kind: "cgroup" }
  | { kind: "sampled"; reason: string };
const HostOptInSchema = z.strictObject({
  schema: z.literal(1),
  sampled_enforcement_reason: z.string().trim().min(1),
});

/** ~/.config/agent-resource/host.toml, or the absolute path in AGENT_RESOURCE_HOST (tests). */
export function hostOptInPath(): Result<string, UsageError> {
  const override = process.env.AGENT_RESOURCE_HOST;
  if (override === undefined || override === "")
    return ok(join(homedir(), ".config", "agent-resource", "host.toml"));
  if (!isAbsolute(override)) {
    return err(
      new UsageError(
        `AGENT_RESOURCE_HOST must be an absolute path, got '${override}'`,
      ),
    );
  }
  return ok(override);
}

/** The host opt-in; null when the file does not exist. Invalid files return an error. */
export function readHostOptIn(path?: string): Result<HostOptIn | null, Error> {
  const selectedPath = path === undefined ? hostOptInPath() : ok(path);
  if (selectedPath.isErr()) return err(selectedPath.error);
  const optInPath = selectedPath.value;
  const exists = fromThrowable(() => existsSync(optInPath))();
  if (exists.isErr()) return err(asError(exists.error));
  if (!exists.value) return ok(null);
  const raw = fromThrowable((): unknown =>
    Bun.TOML.parse(readFileSync(optInPath, "utf8")),
  )();
  if (raw.isErr())
    return err(new StateError(`host opt-in '${optInPath}' is not valid TOML`));
  const parsed = HostOptInSchema.safeParse(raw.value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (i) =>
          `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`,
      )
      .join("; ");
    return err(
      new StateError(`host opt-in '${optInPath}' is invalid: ${issues}`),
    );
  }
  return ok({
    sampled_enforcement_reason: parsed.data.sampled_enforcement_reason,
  });
}

export function resolveEnforcement(
  kernel: KernelEnforcement,
  optIn: HostOptIn | null,
): Result<
  { ok: true; enforcement: Enforcement } | { ok: false; reason: string },
  UsageError
> {
  if (kernel.available)
    return ok({ ok: true, enforcement: { kind: "cgroup" } });
  if (optIn === null) {
    const path = hostOptInPath();
    if (path.isErr()) return err(path.error);
    return ok({
      ok: false,
      reason:
        `kernel enforcement unavailable: ${kernel.reason} ` +
        `(a machine that can never have it may opt into sampled enforcement in ${path.value}; see README)`,
    });
  }
  return ok({
    ok: true,
    enforcement: {
      kind: "sampled",
      reason: `${kernel.reason}; host opt-in: ${optIn.sampled_enforcement_reason}`,
    },
  });
}

function hostRamSafety(snapshot: HostSnapshot, policy: ResourcePolicy): number {
  return Math.max(
    policy.min_host_ram_safety_bytes,
    Math.ceil(snapshot.mem_total_bytes * policy.host_ram_safety_fraction),
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
 *
 * STANDING PARTITIONS (owner ruling 2026-10-01: 「VRAM は ccc と分けて使うべきです。はじめから
 * 隔壁しておけよ」). The resident services — the ccc embedder daemon and the repo-retrieve
 * reranker — each own a fixed VRAM partition, hard-capped inside their own process
 * (agents/resource-control/gpu_partition.py, sized here in resource-policy.toml). Their partitions
 * count as reserved from the start, used or not: a job never meets a card "mysteriously full" when
 * a service wakes up, and a service never grows into job memory.
 *
 *   committed = max(reserved + standing, used_bytes)
 */
/**
 * VRAM the resident services own on this device: the ccc daemon's partition always (it is
 * resident, used or not), the reranker's only while it is running (it starts on demand and exits
 * when idle — reserving it permanently took 2 GiB from jobs for a service that is mostly off).
 */
export function standingPartitionBytes(
  gpu: GpuSnapshot,
  policy: ResourcePolicy,
): number {
  if (gpu.id !== policy.gpu_partition_device) return 0;
  return (
    policy.gpu_partition_ccc_bytes +
    (gpu.rerank_active === true ? policy.gpu_partition_rerank_bytes : 0)
  );
}

function gpuLedger(
  gpu: GpuSnapshot,
  reservations: Reservation[],
  policy: ResourcePolicy,
): GpuLedger {
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
  const committed = Math.max(
    reserved + standingPartitionBytes(gpu, policy),
    gpu.used_bytes,
  );
  return {
    jobs: held.length,
    reserved_bytes: reserved,
    available_bytes: Math.max(
      0,
      gpu.total_bytes - committed - policy.gpu_safety_bytes,
    ),
  };
}

// The clause that refuses this GPU, worded as THAT clause, or null when the job fits. The
// denial used to lead with "VRAM request … exceeds … available" whichever clause refused, and
// append the real one as a suffix; 2026-09-24 a job asking 4.3 GB with 8.4 GB free was denied for
// unmanaged utilization and read as a VRAM denial, so the operator stopped a service to free
// VRAM that was never short. Checked in the same order the admission applies them.
function gpuHeadroomDenial(
  gpu: GpuSnapshot,
  requiredBytes: number,
  reservations: Reservation[],
  policy: ResourcePolicy,
): string | null {
  const ledger = gpuLedger(gpu, reservations, policy);
  const available =
    `${ledger.available_bytes} available on GPU ${gpu.id} after ${ledger.jobs} live ` +
    `reservation(s) (${ledger.reserved_bytes} bytes declared, ${gpu.used_bytes} bytes observed ` +
    `in use), ${standingPartitionBytes(gpu, policy)} bytes of standing service partitions ` +
    `(ccc + reranker, resource-policy.toml) and ${policy.gpu_safety_bytes} bytes of device safety headroom`;
  const vram = `VRAM request ${requiredBytes} vs ${available}`;
  if (ledger.jobs >= policy.gpu_max_concurrent_jobs) {
    return `GPU ${gpu.id} already holds the ${policy.gpu_max_concurrent_jobs}-job concurrency cap; ${vram}`;
  }
  // Utilization screens UNMANAGED load only. Applying it once we already hold a reservation on
  // this device makes an admitted job block the next admission with its own compute load, which
  // silently degrades the ledger to one job per GPU.
  if (ledger.jobs === 0 && unmanagedGpuLoad(gpu, policy)) {
    return (
      `unmanaged load holds GPU ${gpu.id} at ${gpu.utilization_percent}% utilization` +
      (gpu.power_watts === undefined
        ? " (board power unknown)"
        : ` and ${gpu.power_watts} W board power`) +
      ` with no live reservation — retry once it drops; ${vram}`
    );
  }
  if (ledger.available_bytes < requiredBytes) {
    return `VRAM request ${requiredBytes} exceeds ${available}`;
  }
  return null;
}

function gpuHasHeadroom(
  gpu: GpuSnapshot,
  requiredBytes: number,
  reservations: Reservation[],
  policy: ResourcePolicy,
): boolean {
  return gpuHeadroomDenial(gpu, requiredBytes, reservations, policy) === null;
}

function decideAdmissionWithPolicy(
  manifest: ResourceManifest,
  snapshot: HostSnapshot,
  reservations: Reservation[],
  policy: ResourcePolicy,
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
    snapshot.allowed_cpu_ids.length -
      policy.cpu_safety_count -
      reservedAllowedCount,
  );
  if (manifest.cpu_threads > reservableCpuCount) {
    return {
      ok: false,
      reason:
        `CPU request ${manifest.cpu_threads} exceeds ${reservableCpuCount} currently ` +
        `reservable thread(s); ${policy.cpu_safety_count} CPU remains outside reservations`,
    };
  }
  const cpuIds = snapshot.allowed_cpu_ids
    .filter((cpu) => !reservedCpuIds.has(cpu))
    .slice(0, manifest.cpu_threads);

  const ramSafety = hostRamSafety(snapshot, policy);
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
    snapshot.scratch_available_bytes -
      policy.scratch_safety_bytes -
      reservedScratch,
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
          policy,
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

  // Hoisted out of the closure below: property narrowing on `manifest.device.kind` does not
  // survive into a nested arrow function, even though it holds for the rest of this function body.
  const gpuId = manifest.device.gpu_id;
  const gpu = snapshot.gpus.find((item) => item.id === gpuId);
  if (gpu === undefined) {
    return {
      ok: false,
      reason: `GPU ${manifest.device.gpu_id} is not visible to nvidia-smi`,
    };
  }
  const denial = gpuHeadroomDenial(
    gpu,
    manifest.device.vram_peak_bytes,
    reservations,
    policy,
  );
  if (denial !== null) return { ok: false, reason: denial };
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

export function decideAdmission(
  manifest: ResourceManifest,
  snapshot: HostSnapshot,
  reservations: Reservation[],
  policy?: ResourcePolicy,
): Result<AdmissionResult, UsageError> {
  const selectedPolicy = policy === undefined ? resourcePolicy() : ok(policy);
  return selectedPolicy.map((resolvedPolicy) =>
    decideAdmissionWithPolicy(manifest, snapshot, reservations, resolvedPolicy),
  );
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

const ErrnoSchema = z.object({ code: z.string() });
function errorCode(error: unknown): string | undefined {
  const parsed = ErrnoSchema.safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
}

function pidIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  const result = fromThrowable(() => process.kill(pid, 0))();
  return result.isOk() || errorCode(result.error) === "EPERM";
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function releaseLockDirectory(lockDirectory: string): Result<void, Error> {
  const owner = join(lockDirectory, "owner.json");
  const unlinkResult = fromThrowable(() => {
    unlinkSync(owner);
  })();
  if (unlinkResult.isErr() && errorCode(unlinkResult.error) !== "ENOENT") {
    return err(asError(unlinkResult.error));
  }
  const rmdirResult = fromThrowable(() => {
    rmdirSync(lockDirectory);
  })();
  if (rmdirResult.isErr() && errorCode(rmdirResult.error) !== "ENOENT") {
    return err(asError(rmdirResult.error));
  }
  return ok(undefined);
}

function handleLockAcquisitionError(
  error: unknown,
  lockDirectory: string,
): Result<void, StateError> {
  if (errorCode(error) === "EEXIST") return ok(undefined);
  // Preserve the original lock/setup error: discard whatever releaseLockDirectory reports.
  releaseLockDirectory(lockDirectory);
  return err(
    new StateError(
      `cannot acquire reservation lock: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}

const LockOwnerSchema = z.object({ pid: z.number() });

function readOwnerPid(lockDirectory: string): number | null {
  const result = fromThrowable(() =>
    readFileSync(join(lockDirectory, "owner.json"), "utf8"),
  )();
  if (result.isErr()) return null;
  // The owner may still be writing. Age decides whether this becomes stale.
  const owner = jsonOf(LockOwnerSchema).safeParse(result.value);
  return owner.success ? owner.data.pid : null;
}

function releaseIfStale(
  lockDirectory: string,
  ownerPid: number | null,
): boolean {
  const result = fromThrowable(() => {
    const oldEnough =
      Temporal.Now.instant().epochMilliseconds -
        statSync(lockDirectory).mtimeMs >=
      LOCK_STALE_MS;
    if (!oldEnough || (ownerPid !== null && pidIsAlive(ownerPid))) return false;
    return releaseLockDirectory(lockDirectory).isOk();
  })();
  // A concurrent owner can release/recreate the bounded lock; retry.
  return result.isOk() ? result.value : false;
}

async function acquireStateLock(
  stateDirectory: string,
): Promise<Result<() => Result<void, Error>, Error>> {
  const lockDirectory = join(stateDirectory, ".lock");
  const deadline = performance.now() + LOCK_WAIT_MS;
  while (performance.now() < deadline) {
    const created = fromThrowable(() => {
      mkdirSync(lockDirectory, { mode: 0o700 });
      writeFileSync(
        join(lockDirectory, "owner.json"),
        `${JSON.stringify({ pid: process.pid, created_at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }) })}\n`,
        { flag: "wx", mode: 0o600 },
      );
    })();
    if (created.isOk()) {
      return ok(() => releaseLockDirectory(lockDirectory));
    }
    const handled = handleLockAcquisitionError(created.error, lockDirectory);
    if (handled.isErr()) return err(handled.error);

    const ownerPid = readOwnerPid(lockDirectory);
    if (releaseIfStale(lockDirectory, ownerPid)) {
      continue;
    }
    const slept = await fromAsyncThrowable(() => Bun.sleep(25))();
    if (slept.isErr()) return err(asError(slept.error));
  }
  return err(
    new StateError(`reservation lock remained busy for ${LOCK_WAIT_MS} ms`),
  );
}

const anySafeInt = safeIntIn(Number.MIN_SAFE_INTEGER);
const ReservationSchema: z.ZodType<Reservation> = z.object({
  schema: z.literal(1),
  reservation_id: z.string(),
  job_id: z.string(),
  controller_pid: anySafeInt,
  cpu_ids: z.array(anySafeInt),
  host_ram_peak_bytes: anySafeInt,
  scratch_bytes: anySafeInt,
  device: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("cpu") }),
    z.object({
      kind: z.literal("gpu"),
      gpu_id: anySafeInt,
      vram_peak_bytes: anySafeInt,
    }),
  ]),
  started_at: z.string(),
});

function reservationFrom(value: unknown): Reservation | null {
  const parsed = ReservationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function unlinkIgnoringMissing(path: string): Result<void, Error> {
  const result = fromThrowable(() => {
    unlinkSync(path);
  })();
  if (result.isErr() && errorCode(result.error) !== "ENOENT") {
    return err(asError(result.error));
  }
  return ok(undefined);
}

function liveReservations(
  stateDirectory: string,
): Result<Reservation[], Error> {
  const names = fromThrowable(() => readdirSync(stateDirectory))();
  if (names.isErr()) return err(asError(names.error));
  const result: Reservation[] = [];
  for (const name of names.value) {
    if (!name.endsWith(".reservation.json")) continue;
    const path = join(stateDirectory, name);
    const parsed = fromThrowable(() => {
      const json = jsonText.safeParse(readFileSync(path, "utf8"));
      return json.success ? reservationFrom(json.data) : null;
    })();
    const reservation = parsed.isOk() ? parsed.value : null;
    if (reservation !== null && pidIsAlive(reservation.controller_pid)) {
      result.push(reservation);
      continue;
    }
    const unlinked = unlinkIgnoringMissing(path);
    if (unlinked.isErr()) return err(unlinked.error);
  }
  return ok(result);
}

async function acquireLease(
  manifest: ResourceManifest,
  snapshot: HostSnapshot,
  requestedStateDirectory?: string,
): Promise<Result<Lease | AdmissionFailure, Error>> {
  const directoryResult = fromThrowable(() =>
    ensureStateDirectory(requestedStateDirectory ?? defaultStateDirectory()),
  )();
  if (directoryResult.isErr()) return err(asError(directoryResult.error));
  const stateDirectory = directoryResult.value;
  const lockResult = await acquireStateLock(stateDirectory);
  if (lockResult.isErr()) return err(lockResult.error);
  const workResult = fromThrowable(
    (): Result<Lease | AdmissionFailure, Error> => {
      const reservations = liveReservations(stateDirectory);
      if (reservations.isErr()) return err(reservations.error);
      const admissionResult = decideAdmission(
        manifest,
        snapshot,
        reservations.value,
      );
      if (admissionResult.isErr()) return err(admissionResult.error);
      const admission = admissionResult.value;
      if (!admission.ok) return ok(admission);
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
        started_at: Temporal.Now.instant().toString({
          fractionalSecondDigits: 3,
        }),
      };
      const reservationPath = join(
        stateDirectory,
        `${reservationId}.reservation.json`,
      );
      const fd = openSync(reservationPath, "wx", 0o600);
      using _fd = {
        [Symbol.dispose]: () => {
          closeSync(fd);
        },
      };
      writeFileSync(fd, `${JSON.stringify(reservation)}\n`);
      return ok({ ok: true, reservation, reservationPath, stateDirectory });
    },
  )();
  const released = lockResult.value();
  if (released.isErr()) return err(released.error);
  return workResult.isErr() ? err(asError(workResult.error)) : workResult.value;
}

async function releaseLease(lease: Lease): Promise<Result<void, Error>> {
  const lockResult = await acquireStateLock(lease.stateDirectory);
  if (lockResult.isErr()) return err(lockResult.error);
  const unlinked = unlinkIgnoringMissing(lease.reservationPath);
  const released = lockResult.value();
  if (released.isErr()) return err(released.error);
  return unlinked;
}

/**
 * Read one /proc entry's contribution to `pgid`'s usage, or null when it is not a member.
 * The stat and status reads are guarded separately so a process exiting between them still
 * counts toward `processes` (matching the pre-extraction control flow exactly) while
 * contributing zero RSS instead of throwing.
 */
function sampleProcessGroupMember(
  entry: string,
  pgid: number,
): { rssBytes: number } | null {
  // A process can exit between /proc enumeration and either read.
  const statResult = fromThrowable(() =>
    readFileSync(join("/proc", entry, "stat"), "utf8"),
  )();
  if (statResult.isErr()) return null;
  const stat = statResult.value;
  const close = stat.lastIndexOf(")");
  if (close === -1) return null;
  const fields = stat.slice(close + 2).split(" ");
  const processGroup = Number(fields[2]);
  if (processGroup !== pgid) return null;
  // A process can exit between /proc enumeration and either read.
  const statusResult = fromThrowable(() =>
    readFileSync(join("/proc", entry, "status"), "utf8"),
  )();
  if (statusResult.isErr()) return { rssBytes: 0 };
  const rss = /^VmRSS:\s+(\d+)\s+kB$/mu.exec(statusResult.value)?.[1];
  return { rssBytes: rss !== undefined ? Number(rss) * KiB : 0 };
}

function processGroupUsage(pgid: number): GroupUsage {
  let processes = 0;
  let rssBytes = 0;
  const pids: number[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/u.test(entry)) continue;
    const sample = sampleProcessGroupMember(entry, pgid);
    if (sample === null) continue;
    processes += 1;
    rssBytes += sample.rssBytes;
    pids.push(Number(entry));
  }
  return { processes, rssBytes, pids };
}

// One row of `nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits`:
// a PID currently holding a CUDA context and its VRAM, across every GPU and every process on
// the host (not scoped to our job — the caller cross-references against its own process
// group's pids). `used_memory` is MiB, same unit `parseNvidiaSmiGpuRow` above already assumes
// for `memory.total`/`memory.used`. On WSL2, `used_memory` reads literal `[N/A]` for every row
// (confirmed live 2026-09-26 on this host: PIDs list, memory does not) — see this package's
// README, "On WSL2 nvidia-smi reports no per-process VRAM". `Number("[N/A]")` is `NaN`, which
// the `Number.isFinite` check below already rejects, so this degrades the same way an absent
// GPU does: `vram_peak_measured_bytes` is simply omitted, not a wrong zero.
export function parseNvidiaSmiComputeAppRow(
  line: string,
): { pid: number; usedBytes: number } | null {
  const fields = line.split(",").map((field) => Number(field.trim()));
  const [pid, usedMiB] = fields;
  if (
    fields.length !== 2 ||
    pid === undefined ||
    usedMiB === undefined ||
    fields.some((field) => !Number.isFinite(field))
  ) {
    return null;
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  return { pid, usedBytes: usedMiB * MiB };
}

// Always samples once; the once-a-second throttle lives at the one call site (executeJob's
// onSample), via GPU_VRAM_SAMPLE_INTERVAL_MS — not in here.
function sampleGpuComputeApps(): Map<number, number> {
  const usage = new Map<number, number>();
  if (Bun.which("nvidia-smi") === null || Bun.which("timeout") === null) {
    return usage;
  }
  // bounded: GNU timeout caps this nvidia-smi probe at five seconds, same class as probeGpus().
  // no GPU / no driver / transient nvidia-smi failure -> this sample contributes nothing; the
  // running peak this job has already observed is unaffected.
  const spawned = fromThrowable(() =>
    Bun.spawnSync(
      [
        "timeout",
        "5s",
        "nvidia-smi",
        "--query-compute-apps=pid,used_memory",
        "--format=csv,noheader,nounits",
      ],
      { stdout: "pipe", stderr: "ignore" },
    ),
  )();
  if (spawned.isErr() || spawned.value.exitCode !== 0) return usage;
  const rows = spawned.value.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((row) => parseNvidiaSmiComputeAppRow(row))
    .flatMap((row) => (row === null ? [] : [row]));
  for (const row of rows) usage.set(row.pid, row.usedBytes);
  return usage;
}

/**
 * The scope's own cgroup `MemoryPeak` (cgroup v2 `memory.peak`) — the authoritative RAM peak
 * for this job: kernel-tracked continuously, unlike the monitor loop's own 200ms-interval /proc
 * sampling, which can miss a brief spike between polls. MUST be read before the scope is torn
 * down: `systemctl --user stop` releases the cgroup, and `MemoryPeak` disappears with it
 * (reported live 2026-09-26 by a fleet hitting exactly this gap — every run showed "peak
 * unknown" because the caller only checked after cleanup). Absence — "[not set]" (no
 * `MemoryAccounting=yes`) or a kernel too old for `memory.peak` — is not a bug; the monitor
 * loop's own sampled peak is the fallback (see MeasuredPeak's `ram_peak_source`).
 */
function readScopeMemoryPeak(scopeUnit: string): number | undefined {
  if (Bun.which("systemctl") === null || Bun.which("timeout") === null) {
    return undefined;
  }
  // bounded: GNU timeout caps this user-manager property query at five seconds, same class as
  // every other boundedSystemctl call in this file.
  const result = Bun.spawnSync(
    [
      "timeout",
      "5s",
      "systemctl",
      "--user",
      "show",
      scopeUnit,
      "--property=MemoryPeak",
      "--value",
    ],
    { stdout: "pipe", stderr: "ignore" },
  );
  if (result.exitCode !== 0) return undefined;
  const bytes = Number(result.stdout.toString().trim());
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : undefined;
}

function releaseDescription(peak: MeasuredPeak): string {
  const vram =
    peak.vram_peak_measured_bytes === undefined
      ? ""
      : ` vram_peak_measured_bytes=${peak.vram_peak_measured_bytes} ` +
        `vram_peak_source=${peak.vram_peak_source}`;
  return (
    `RELEASE job=${peak.job_id} ram_peak_measured_bytes=${peak.ram_peak_measured_bytes} ` +
    `ram_peak_source=${peak.ram_peak_source}${vram} released_at=${peak.released_at}`
  );
}

// Sibling to the manifest the caller already owns, so a ticket can find its own job's measured
// peak after the run without parsing stdout — the RELEASE report line above carries the same
// data; this is a machine-readable copy at a path the caller can predict without capturing
// stdout at all. Overwritten per run (latest-run semantics), matching every other piece of this
// runner's per-run state (reservations, receipts). Best-effort: a caller that put its manifest
// somewhere unwritable (or, in a test fixture, somewhere that does not exist on disk at all)
// still gets the same data from the RELEASE line, so a write failure here is silent, not fatal.
function writePeakArtifact(manifestPath: string, peak: MeasuredPeak): void {
  // Best-effort — see the header comment above: discard any write failure.
  fromThrowable(() => {
    writeFileSync(`${manifestPath}.peak.json`, `${JSON.stringify(peak)}\n`, {
      mode: 0o600,
    });
  })();
}

function signalProcessGroup(
  pgid: number,
  signal: NodeJS.Signals,
): Result<void, Error> {
  const result = fromThrowable(() => process.kill(-pgid, signal))();
  if (result.isErr() && errorCode(result.error) !== "ESRCH") {
    return err(asError(result.error));
  }
  return ok(undefined);
}

async function terminateProcessGroup(
  pgid: number,
  graceSeconds: number,
): Promise<Result<void, Error>> {
  const terminated = signalProcessGroup(pgid, "SIGTERM");
  if (terminated.isErr()) return err(terminated.error);
  const deadline = performance.now() + graceSeconds * 1_000;
  while (
    performance.now() < deadline &&
    processGroupUsage(pgid).processes > 0
  ) {
    await Bun.sleep(50);
  }
  if (processGroupUsage(pgid).processes > 0) {
    const killed = signalProcessGroup(pgid, "SIGKILL");
    if (killed.isErr()) return err(killed.error);
  }
  return ok(undefined);
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
): Result<Record<string, string | undefined>, UsageError> {
  if (device.kind !== "gpu") {
    // Clear, don't merely omit: these keys are inherited from the caller's environment, so a CPU
    // job launched from a shell that once held a GPU budget would otherwise run under it.
    return ok({
      CUDA_VISIBLE_DEVICES: "",
      AGENT_RESOURCE_VRAM_BYTES: undefined,
      JULIA_CUDA_HARD_MEMORY_LIMIT: undefined,
      JULIA_CUDA_SOFT_MEMORY_LIMIT: undefined,
    });
  }
  const policy = resourcePolicy();
  if (policy.isErr()) return err(policy.error);
  const hard = device.vram_peak_bytes;
  return ok({
    CUDA_VISIBLE_DEVICES: String(device.gpu_id),
    AGENT_RESOURCE_VRAM_BYTES: String(hard),
    JULIA_CUDA_HARD_MEMORY_LIMIT: String(hard),
    JULIA_CUDA_SOFT_MEMORY_LIMIT: String(
      Math.floor(hard * policy.value.gpu_soft_limit_fraction),
    ),
  });
}

export function createAdmissionReceipt(
  manifestSource: ManifestSource,
  reservation: Reservation,
  // Explicitly widened from randomUUID()'s template-literal return type: callers (notably tests)
  // legitimately pass human-readable ids, and nothing downstream requires UUID shape.
  admissionId: string = randomUUID(),
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

// Canonical form only: exactly what the writer emits (ms precision, `Z`), round-tripped.
function isCanonicalInstant(text: string): boolean {
  const canonicalResult = fromThrowable(() =>
    Temporal.Instant.from(text).toString({ fractionalSecondDigits: 3 }),
  )();
  return canonicalResult.isOk() && canonicalResult.value === text;
}

// Exact key sets (strict objects), in the writer's field order so JSON.stringify() of the parsed
// output reproduces the canonical payload byte for byte.
const ReceiptDeviceSchema = z.union([
  z.strictObject({ kind: z.literal("cpu") }),
  z.strictObject({
    kind: z.literal("gpu"),
    gpu_id: safeIntIn(0, 1_024),
    vram_peak_bytes: safeIntIn(1),
  }),
]);

const AdmissionReceiptPayloadSchema: z.ZodType<AdmissionReceiptPayload> = z
  .strictObject({
    schema: z.literal(1),
    admission_id: textOf(),
    manifest_path: textOf().refine(
      (path) => isAbsolute(path) && resolve(path) === path,
    ),
    manifest_sha256: z.string().refine(isSha256Hex),
    job_id: textOf(80),
    reservation_id: textOf(256),
    scope_unit: textOf(300),
    controller_pid: safeIntIn(1),
    cpu_ids: z
      .array(safeIntIn(0))
      .refine((ids) => ids.length > 0 && new Set(ids).size === ids.length),
    host_ram_peak_bytes: safeIntIn(1),
    scratch_bytes: safeIntIn(0),
    device: ReceiptDeviceSchema,
    started_at: textOf(64).refine(isCanonicalInstant),
  })
  .refine(
    (receipt) =>
      receipt.scope_unit === `agent-resource-${receipt.reservation_id}.scope`,
  );

function admissionReceiptPayloadFrom(
  value: unknown,
): AdmissionReceiptPayload | null {
  const parsed = AdmissionReceiptPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
  const parsedResult = jsonText.safeParse(payload);
  if (!parsedResult.success) return false;
  const receipt = admissionReceiptPayloadFrom(parsedResult.data);
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
): Result<Record<string, string | undefined>, Error> {
  if (manifest.job_id !== reservation.job_id) {
    return err(new StateError("manifest and reservation job_id must match"));
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
    return err(
      new StateError(
        "manifest and reservation resources must match before constructing child environment",
      ),
    );
  }
  const gpuEnvironment = gpuBudgetEnvironment(reservation.device);
  if (gpuEnvironment.isErr()) return err(gpuEnvironment.error);
  const threads = String(manifest.cpu_threads);
  return ok({
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
    ...gpuEnvironment.value,
  });
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

/** Sampled enforcement: the same session and affinity as the scope launch, no systemd scope. */
export function buildSampledLaunch(
  reservation: Reservation,
  command: string[],
): string[] {
  return [
    "setsid",
    "--wait",
    "taskset",
    "-c",
    reservation.cpu_ids.join(","),
    ...command,
  ];
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

  // `stop`'s own exit code cannot be trusted as the verification signal: `--collect` unloads a
  // scope from the manager the moment it goes inactive, and the payload here is a `sh -c test`
  // that has usually already exited by the time we reach this line — so the SAME race the
  // `active` check above exists to close can also land here, one syscall later. `systemctl stop`
  // on a unit the manager already unloaded prints "Unit … not loaded" and exits 5, which looks
  // exactly like a genuine failure to stop but means cleanup already succeeded on its own.
  // Measured 2026-09-12 on WSL2 (systemd --user, `systemctl --user is-system-running` = running):
  // a probe running this exact is-active -> stop -> is-active sequence against a real one-shot
  // scope hit exit 5 on 3 of 6 runs, and every one of those runs' final `is-active` already read
  // inactive/unloaded (3 or 4) — i.e. `stop` failing here is not evidence cleanup failed. Ignoring
  // `stop`'s exit code and trusting only the `is-active` re-check below closes that gap without
  // weakening the real failure mode: a scope that is still active after `stop` still fails closed.
  boundedSystemctl(["stop", scopeUnit]);
  const verified = boundedSystemctl(["is-active", "--quiet", scopeUnit]);
  return scopeIsInactive(verified.exitCode);
}

function defaultReport(line: string): void {
  process.stdout.write(`${line}\n`);
}

function admissionDescription(
  lease: Lease,
  enforcement: Enforcement,
  receipt?: AdmissionReceipt,
): string {
  const device =
    lease.reservation.device.kind === "gpu"
      ? `gpu:${lease.reservation.device.gpu_id} vram_bytes=${lease.reservation.device.vram_peak_bytes}`
      : "cpu";
  const scopeUnit =
    enforcement.kind === "cgroup" ? scopeUnitFor(lease.reservation) : "none";
  const receiptFields =
    receipt === undefined
      ? ""
      : ` admission_id=${receipt.admissionId} ` +
        `reservation_id=${lease.reservation.reservation_id} ` +
        `scope_unit=${scopeUnit} ` +
        `manifest_sha256=${receipt.manifestSource.sha256} receipt_sha256=${receipt.sha256}`;
  return (
    `ADMIT job=${lease.reservation.job_id} cpu_ids=${lease.reservation.cpu_ids.join(",")} ` +
    `ram_bytes=${lease.reservation.host_ram_peak_bytes} device=${device} ` +
    (enforcement.kind === "cgroup"
      ? "enforcement=systemd-cgroup+affinity+sampled-process-group"
      : `enforcement=affinity+sampled-process-group cgroup=none cgroup_reason=${JSON.stringify(enforcement.reason)}`) +
    receiptFields
  );
}

async function checkJobResult(
  manifest: ResourceManifest,
  options: ExecuteOptions = {},
): Promise<Result<ExecutionResult, Error>> {
  const report = options.report ?? defaultReport;
  if (Bun.which("setsid") === null || Bun.which("taskset") === null) {
    report(
      `DENY job=${manifest.job_id} reason=setsid and taskset are required for enforcement`,
    );
    return ok({ ok: false, exitCode: 69, reason: "admission" });
  }
  const hostOptIn =
    options.hostOptIn === undefined ? readHostOptIn() : ok(options.hostOptIn);
  if (hostOptIn.isErr()) return err(hostOptIn.error);
  const kernel =
    options.kernelEnforcement === undefined
      ? probeKernelEnforcement()
      : ok(options.kernelEnforcement);
  if (kernel.isErr()) return err(kernel.error);
  const resolved = resolveEnforcement(kernel.value, hostOptIn.value);
  if (resolved.isErr()) return err(resolved.error);
  if (!resolved.value.ok) {
    report(`DENY job=${manifest.job_id} reason=${resolved.value.reason}`);
    return ok({ ok: false, exitCode: 69, reason: "admission" });
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const probedSnapshot =
    options.snapshot === undefined
      ? probeHostSnapshot(cwd)
      : ok(options.snapshot);
  if (probedSnapshot.isErr()) return err(probedSnapshot.error);
  const acquired = await acquireLease(
    manifest,
    probedSnapshot.value,
    options.stateDirectory,
  );
  if (acquired.isErr()) return err(acquired.error);
  if (!acquired.value.ok) {
    report(`DENY job=${manifest.job_id} reason=${acquired.value.reason}`);
    return ok({ ok: false, exitCode: 69, reason: "admission" });
  }
  const lease = acquired.value;
  report(
    `${admissionDescription(lease, resolved.value.enforcement)} check_only=true`,
  );
  const released = await releaseLease(lease);
  if (released.isErr()) return err(released.error);
  return ok({ ok: true, exitCode: 0 });
}

export function checkJob(
  manifest: ResourceManifest,
  options: ExecuteOptions = {},
): ResultAsync<ExecutionResult, Error> {
  return fromAsyncThrowable(() => checkJobResult(manifest, options))()
    .andThen((result) => result)
    .mapErr(asError);
}

/**
 * Poll `pgid`'s usage until it breaches the manifest's declared limits or `isDone` reports the
 * job is no longer being monitored (exited/walltime/interrupt). Returns the breach reason, or
 * null when monitoring simply ended. `onSample`, when given, sees every reading this loop
 * already takes for free — the peak-tracking callers below ride the same poll rather than
 * running a second one.
 */
async function monitorProcessGroup(
  pgid: number,
  manifest: ResourceManifest,
  exitedPromise: Promise<number>,
  intervalMs: number,
  isDone: () => boolean,
  onSample?: (usage: GroupUsage) => void,
): Promise<"memory" | "processes" | null> {
  while (!isDone()) {
    const usage = processGroupUsage(pgid);
    onSample?.(usage);
    if (usage.rssBytes > manifest.host_ram_peak_bytes) return "memory";
    if (usage.processes > manifest.processes) return "processes";
    await Promise.race([exitedPromise, Bun.sleep(intervalMs)]);
  }
  return null;
}

async function executeJobResult(
  manifest: ResourceManifest,
  command: string[],
  options: ExecuteOptions = {},
): Promise<Result<ExecutionResult, Error>> {
  const report = options.report ?? defaultReport;
  const cwd = resolve(options.cwd ?? process.cwd());
  if (command.length === 0 || command[0]?.trim() === "") {
    return err(
      new UsageError("a command is required unless --check-only is used"),
    );
  }
  if (options.manifestSource === undefined) {
    return err(
      new UsageError(
        "executeJob requires manifestSource from the exact manifest bytes read by the runner",
      ),
    );
  }
  // Captured into its own binding: TypeScript's narrowing of `options.manifestSource` above does
  // not survive into the async dispose closure below (a distinct function scope), so the closure
  // reads this local instead of the possibly-undefined property.
  const manifestSource = options.manifestSource;
  if (Bun.which("setsid") === null || Bun.which("taskset") === null) {
    report(
      `DENY job=${manifest.job_id} reason=setsid and taskset are required for enforcement`,
    );
    return ok({ ok: false, exitCode: 69, reason: "admission" });
  }
  const hostOptIn =
    options.hostOptIn === undefined ? readHostOptIn() : ok(options.hostOptIn);
  if (hostOptIn.isErr()) return err(hostOptIn.error);
  const kernel =
    options.kernelEnforcement === undefined
      ? probeKernelEnforcement()
      : ok(options.kernelEnforcement);
  if (kernel.isErr()) return err(kernel.error);
  const resolved = resolveEnforcement(kernel.value, hostOptIn.value);
  if (resolved.isErr()) return err(resolved.error);
  if (!resolved.value.ok) {
    report(`DENY job=${manifest.job_id} reason=${resolved.value.reason}`);
    return ok({ ok: false, exitCode: 69, reason: "admission" });
  }
  const enforcement = resolved.value.enforcement;
  const probedSnapshot =
    options.snapshot === undefined
      ? probeHostSnapshot(cwd)
      : ok(options.snapshot);
  if (probedSnapshot.isErr()) return err(probedSnapshot.error);
  const acquired = await acquireLease(
    manifest,
    probedSnapshot.value,
    options.stateDirectory,
  );
  if (acquired.isErr()) return err(acquired.error);
  if (!acquired.value.ok) {
    report(`DENY job=${manifest.job_id} reason=${acquired.value.reason}`);
    return ok({ ok: false, exitCode: 69, reason: "admission" });
  }

  const lease = acquired.value;
  const policy = resourcePolicy();
  if (policy.isErr()) {
    const released = await releaseLease(lease);
    if (released.isErr()) return err(released.error);
    return err(policy.error);
  }
  const receipt = createAdmissionReceipt(
    options.manifestSource,
    lease.reservation,
  );
  report(admissionDescription(lease, enforcement, receipt));
  const timeoutSignal = AbortSignal.timeout(manifest.walltime_seconds * 1_000);
  let walltimeFired = false;
  let interrupted = false;
  let pgid: number | null = null;
  let scopeUnit: string | null = null;
  // Peak tracking rides the monitor loop's existing poll (see monitorProcessGroup's onSample) —
  // declared out here, not inside the job body below, so the cleanup step can still report
  // them after a breach return happens INSIDE that body, before cleanup ever runs.
  let peakRssBytes = 0;
  let peakVramBytes: number | undefined;
  let lastGpuSampleAtMs = 0;
  let signalFailure: Error | undefined;
  const onSample = (usage: GroupUsage): void => {
    peakRssBytes = Math.max(peakRssBytes, usage.rssBytes);
    if (lease.reservation.device.kind !== "gpu") return;
    const now = performance.now();
    if (now - lastGpuSampleAtMs < policy.value.gpu_vram_sample_interval_ms)
      return;
    lastGpuSampleAtMs = now;
    const gpuUsage = sampleGpuComputeApps();
    const jobVramBytes = usage.pids.reduce(
      (sum, pid) => sum + (gpuUsage.get(pid) ?? 0),
      0,
    );
    peakVramBytes = Math.max(peakVramBytes ?? 0, jobVramBytes);
  };
  const onTimeout = (): void => {
    walltimeFired = true;
    if (pgid !== null) {
      const signaled = signalProcessGroup(pgid, "SIGTERM");
      if (signaled.isErr()) signalFailure = signaled.error;
    }
  };
  const onInterrupt = (): void => {
    interrupted = true;
    if (pgid !== null) {
      const signaled = signalProcessGroup(pgid, "SIGTERM");
      if (signaled.isErr()) signalFailure = signaled.error;
    }
  };
  timeoutSignal.addEventListener("abort", onTimeout, { once: true });
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);

  // Runs the command and returns either its result or undefined when the caller should report
  // PASS. Cleanup runs afterward and can override this result when it cannot release resources.
  const runJob = async (): Promise<
    Result<ExecutionResult | undefined, Error>
  > => {
    const environment = commandEnvironment(
      manifest,
      lease.reservation,
      receipt,
    );
    if (environment.isErr()) {
      report(
        `ERROR job=${manifest.job_id} reason=launch detail=${environment.error.message}`,
      );
      return ok({ ok: false, exitCode: 70, reason: "launch" });
    }
    const launched = fromThrowable(() => {
      // Sampled enforcement: no scope (scopeUnit stays null, so cleanup has none to stop and the
      // peak is the sampled one).
      let argv = buildSampledLaunch(lease.reservation, command);
      if (enforcement.kind === "cgroup") {
        const launch = buildSystemdLaunch(manifest, lease.reservation, command);
        scopeUnit = launch.scopeUnit;
        argv = launch.argv;
      }
      // bounded: AbortSignal enforces manifest.walltime_seconds; the monitor additionally
      // terminates the entire new session/process group for exact process-count breaches.
      // systemd independently enforces CPU, RAM, zero job swap, and a coarse task ceiling.
      return Bun.spawn(argv, {
        cwd,
        env: {
          ...environment.value,
          // What actually bounds this job, for a launcher that records provenance: under
          // "sampled" there is no scope, so the receipt's scope_unit names none (README).
          AGENT_RESOURCE_ENFORCEMENT: enforcement.kind,
        },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        signal: timeoutSignal,
      });
    })();
    if (launched.isErr()) {
      report(
        `ERROR job=${manifest.job_id} reason=launch detail=${
          launched.error instanceof Error
            ? launched.error.message
            : String(launched.error)
        }`,
      );
      return ok({ ok: false, exitCode: 70, reason: "launch" });
    }
    const child = launched.value;
    const groupPid = child.pid;
    pgid = groupPid;

    let exited = false;
    let commandExitCode = 70;
    const exitedPromise = child.exited.then((code) => {
      exited = true;
      commandExitCode = code;
      return code;
    });
    const interval = Math.max(
      10,
      options.monitorIntervalMs ?? policy.value.default_monitor_interval_ms,
    );

    const breach = await monitorProcessGroup(
      groupPid,
      manifest,
      exitedPromise,
      interval,
      () => exited || walltimeFired || interrupted,
      onSample,
    );

    if (signalFailure !== undefined) return err(signalFailure);
    if (walltimeFired || interrupted || breach !== null) {
      const terminated = await terminateProcessGroup(
        groupPid,
        manifest.cleanup.grace_seconds,
      );
      if (terminated.isErr()) return err(terminated.error);
      await exitedPromise.catch(() => 70);
      let reason: "walltime" | "interrupt" | "memory" | "processes" | undefined;
      if (walltimeFired) reason = "walltime";
      else if (interrupted) reason = "interrupt";
      else if (breach !== null) reason = breach;
      if (reason === undefined)
        return err(new StateError("monitor ended without a breach reason"));
      const exitCode = reason === "walltime" ? 124 : 137;
      report(`BREACH job=${manifest.job_id} reason=${reason}`);
      return ok({ ok: false, exitCode, reason });
    }

    await exitedPromise;
    if (processGroupUsage(groupPid).processes > 0) {
      const terminated = await terminateProcessGroup(
        groupPid,
        manifest.cleanup.grace_seconds,
      );
      if (terminated.isErr()) return err(terminated.error);
      report(`BREACH job=${manifest.job_id} reason=cleanup`);
      return ok({ ok: false, exitCode: 137, reason: "cleanup" });
    }
    if (commandExitCode !== 0) {
      report(
        `EXIT job=${manifest.job_id} code=${commandExitCode} reason=command-exit`,
      );
      return ok({
        ok: false,
        exitCode: commandExitCode,
        reason: "command-exit",
      });
    }
    return ok(undefined);
  };

  let cleanupFailed = false;
  const jobResult = await fromAsyncThrowable(() => runJob())();
  const cleanupResult = await fromAsyncThrowable(
    async (): Promise<Result<void, Error>> => {
      timeoutSignal.removeEventListener("abort", onTimeout);
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onInterrupt);
      if (pgid !== null && processGroupUsage(pgid).processes > 0) {
        const terminated = await terminateProcessGroup(
          pgid,
          manifest.cleanup.grace_seconds,
        );
        if (terminated.isErr()) return err(terminated.error);
      }
      // Read before scope teardown: MemoryPeak lives in the scope's cgroup.
      const cgroupPeakBytes =
        scopeUnit === null ? undefined : readScopeMemoryPeak(scopeUnit);
      const measuredPeak: MeasuredPeak = {
        schema: 1,
        job_id: manifest.job_id,
        ram_peak_measured_bytes: cgroupPeakBytes ?? peakRssBytes,
        ram_peak_source: cgroupPeakBytes !== undefined ? "cgroup" : "sampled",
        ...(peakVramBytes === undefined
          ? {}
          : {
              vram_peak_measured_bytes: peakVramBytes,
              vram_peak_source: "nvidia-smi" as const,
            }),
        released_at: Temporal.Now.instant().toString({
          fractionalSecondDigits: 3,
        }),
      };
      report(releaseDescription(measuredPeak));
      writePeakArtifact(manifestSource.path, measuredPeak);
      const scopeCleanup = options.systemdScopeCleanup ?? stopSystemdScope;
      const scopeStopped = scopeUnit === null ? true : scopeCleanup(scopeUnit);
      const released = await releaseLease(lease);
      if (released.isErr()) return err(released.error);
      cleanupFailed = !scopeStopped;
      return ok(undefined);
    },
  )();
  if (cleanupResult.isErr()) return err(asError(cleanupResult.error));
  if (cleanupResult.value.isErr()) return err(cleanupResult.value.error);
  if (cleanupFailed) {
    return err(
      new StateError(
        `failed to verify cleanup of systemd scope '${scopeUnit}'`,
      ),
    );
  }
  if (jobResult.isErr()) return err(asError(jobResult.error));
  if (jobResult.value.isErr()) return err(jobResult.value.error);
  if (jobResult.value.value !== undefined) return ok(jobResult.value.value);
  report(`PASS job=${manifest.job_id} code=0`);
  return ok({ ok: true, exitCode: 0 });
}

export function executeJob(
  manifest: ResourceManifest,
  command: string[],
  options: ExecuteOptions = {},
): ResultAsync<ExecutionResult, Error> {
  return fromAsyncThrowable(() =>
    executeJobResult(manifest, command, options),
  )()
    .andThen((result) => result)
    .mapErr(asError);
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<Result<number, Error>> {
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
        manifest: { type: String },
        // Lets one shared manifest file stand in for a whole resource CLASS (e.g. a
        // "cpu-8g.resource.json" template) rather than needing a fresh copy per invocation just
        // to get a unique job_id — decideAdmission() refuses two live reservations under the
        // same job_id, so without this a caller running several concurrent jobs from the same
        // class had no way to give them distinct identities except copying the file (reported
        // live 2026-09-26: 20+ per-ticket copies of one template under one fleet's envelope
        // directory). The manifest's OWN embedded job_id still works unmodified when this flag
        // is omitted; this only overrides it, and validateJobId() applies the exact same
        // filesystem-safety rule the manifest field itself is checked against.
        jobId: { type: String },
        checkOnly: { type: Boolean, default: false },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  // Fail closed before any manifest work: an invalid policy refuses every admission (after
  // cli() so --help still answers).
  const policy = resourcePolicy();
  if (policy.isErr()) return err(policy.error);
  if (parsed.flags.manifest === undefined) {
    return err(new UsageError("--manifest is required"));
  }
  if (parsed.flags.manifest === "") {
    return err(new UsageError("--manifest requires a value"));
  }
  if (parsed.flags.jobId === "") {
    return err(new UsageError("--job-id requires a value"));
  }
  const manifestPath = resolve(parsed.flags.manifest);
  const readResult = fromThrowable(() => readFileSync(manifestPath))();
  if (readResult.isErr()) {
    return err(
      new UsageError(
        `cannot read manifest '${manifestPath}': ${
          readResult.error instanceof Error
            ? readResult.error.message
            : String(readResult.error)
        }`,
      ),
    );
  }
  const manifestBytes = readResult.value;
  const rawResult = jsonText.safeParse(manifestBytes.toString());
  if (!rawResult.success) {
    return err(
      new UsageError(
        `cannot read manifest '${manifestPath}': ${rawResult.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      ),
    );
  }
  const raw = rawResult.data;
  const parsedManifest = validateManifest(raw);
  if (parsedManifest.isErr()) return err(parsedManifest.error);
  // manifestSource hashes the TEMPLATE file's own bytes, unmodified by --job-id: the receipt
  // then proves "this exact declared envelope shape" independent of which job identity a given
  // invocation supplied, and the receipt's separate `job_id` field still distinguishes them.
  const manifestSource = manifestSourceFromBytes(manifestPath, manifestBytes);
  const jobId =
    parsed.flags.jobId === undefined
      ? ok(parsedManifest.value.job_id)
      : validateJobId(parsed.flags.jobId, "--job-id");
  if (jobId.isErr()) return err(jobId.error);
  const manifest = { ...parsedManifest.value, job_id: jobId.value };
  const command = parsed._.map(String);
  if (parsed.flags.checkOnly && command.length > 0) {
    return err(new UsageError("--check-only does not accept a command"));
  }
  const result = parsed.flags.checkOnly
    ? await checkJob(manifest)
    : await executeJob(manifest, command, { manifestSource });
  if (result.isErr()) return err(result.error);
  return ok(result.value.exitCode);
}

if (import.meta.main) {
  const result = await fromAsyncThrowable(() => main())()
    .andThen((mainResult) => mainResult)
    .mapErr(asError);
  result.match(
    (code) => process.exit(code),
    (error) => {
      const usage = error instanceof UsageError;
      process.stderr.write(`${usage ? "USAGE" : "ERROR"}: ${error.message}\n`);
      process.exit(usage ? 2 : 70);
    },
  );
}
