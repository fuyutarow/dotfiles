#!/usr/bin/env bun
// Consumer: humans and agents running one RAM-bounded command; Linux fails closed.
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  opendir,
  readFile,
  readdir,
  readlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { availableParallelism, homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { cli as cleyeCli } from "cleye";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import { standardCli } from "../../shared/src/cli.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import {
  GpuProcessIdentitySchema,
  gpuStatePath,
  readGpuState,
  type GpuState,
} from "../../shared/src/gpu-samples.ts";
import {
  assessRecoveryVerdict,
  readRecoveryVerdict,
} from "./lib/recovery-verdict.ts";
import {
  rejectPrototypeFlag,
  statusCommand,
  statusHasOperands,
} from "./lib/status-command.ts";
import pkg from "../package.json" with { type: "json" };

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, pkg, cliArgv);
class UsageError extends Error {}
const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const jobId = z
  .string()
  .max(80)
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u);
const text = z.string().max(2000).trim().min(1);
const cpuDevice = z
  .strictObject({
    kind: z.literal("cpu"),
    gpu_status: z.enum(["compatible", "incompatible", "not-beneficial"]),
    gpu_vram_peak_bytes: positive.optional(),
    rationale: text,
  })
  .refine(
    (d) => d.gpu_status !== "compatible" || d.gpu_vram_peak_bytes !== undefined,
    {
      message:
        "device.gpu_vram_peak_bytes is required when gpu_status is compatible",
    },
  );
const manifestSchema = z.strictObject({
  schema: z.literal(1),
  job_id: jobId,
  run_class: z.enum(["pilot", "full", "test", "service"]),
  cpu_threads: positive.max(1024),
  processes: positive.max(4096),
  host_ram_peak_bytes: positive,
  memory_bound: text,
  device: z.union([
    cpuDevice,
    z.strictObject({
      kind: z.literal("gpu"),
      gpu_id: z.number().int().min(0).max(1024),
      vram_peak_bytes: positive,
    }),
  ]),
  scratch_bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  child_fanout: z.literal(0),
  compile_slots: z.preprocess(
    (value) => value ?? undefined,
    z.array(z.literal("julia-compile")).max(1).optional(),
  ),
  walltime_seconds: positive.max(86400),
  cleanup: z.strictObject({
    mode: z.literal("term-then-kill"),
    grace_seconds: positive.max(30),
  }),
});
export type ResourceManifest = z.output<typeof manifestSchema>;
export function validateManifest(
  input: unknown,
): Result<ResourceManifest, Error> {
  const parsed = manifestSchema.safeParse(input);
  return parsed.success
    ? ok(parsed.data)
    : err(new UsageError(parsed.error.message));
}
export type ManifestSource = { path: string; sha256: string };
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function manifestSourceFromBytes(
  path: string,
  bytes: Uint8Array,
): ManifestSource {
  return { path: resolve(path), sha256: digest(bytes) };
}
export type ExecutionResult = {
  ok: boolean;
  exitCode: number;
  reason?: string;
};
type ExecuteOptions = {
  cwd?: string;
  report?: (line: string) => void;
  manifestSource?: ManifestSource;
  requestedSlots?: "julia-compile"[];
};
const reportLine = (line: string) => process.stdout.write(`${line}\n`);
const failure = (
  code: number,
  message: string,
  report: (s: string) => void,
): ExecutionResult => {
  report(`${code === 70 ? "HOLD" : "DENY"} ${message}`);
  return { ok: false, exitCode: code, reason: "admission" };
};
async function output(argv: string[], timeout = 5000) {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", timeout });
  const [stdout, stderr, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}
const missing = (error: unknown) =>
  z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
async function optionalText(
  path: string,
): Promise<Result<string | undefined, Error>> {
  const read = await fromAsyncThrowable(() => readFile(path, "utf8"))();
  if (read.isOk()) return ok(read.value);
  if (missing(read.error)) return ok(undefined);
  return err(asError(read.error));
}
const procState = (stat: string) => /^\d+ \(.*\) ([A-Za-z]) /u.exec(stat)?.[1];
// /proc/<id>/stat field 22 (starttime) is stable for one task incarnation.
const procStartTime = (stat: string) =>
  /^\d+ \(.*\) [A-Za-z] (.*)/u.exec(stat)?.[1]?.trim().split(/\s+/u)[18];
export const DXG_CONFIRMATION_INTERVAL_MS = 3_000;
type ThreadGroup = {
  tgid: string;
  state: string;
  startTime: string | undefined;
  statPath: string;
};
type DStateCandidate =
  | {
      kind: "leader";
      pid: string;
      startTime: string;
      statPath: string;
      wchanPath: string;
      observedAt: number;
    }
  | {
      kind: "task";
      tgid: string;
      tid: string;
      leaderStartTime: string;
      taskStartTime: string;
      leaderStatPath: string;
      taskStatPath: string;
      wchanPath: string;
      initialWchan: "dxg" | "unavailable";
      observedAt: number;
    };
type DStateObservation = {
  candidate?: DStateCandidate;
  candidates?: DStateCandidate[];
  refusal?: string;
};
type GpuAdmissionOptions = {
  procRoot?: string;
  state?: Awaited<ReturnType<typeof readGpuState>>;
  currentScope?: string;
  currentReservationId?: string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  // Only scope-entry runs beneath the shared ccc handoff lock. Check-only must
  // never infer release from a stale sampler row.
  cccHandoffHeld?: boolean;
  cccSupervisor?: () => Promise<
    { pid: number; startedAt: number } | null | undefined
  >;
};
// A sampled holder is conservative refusal evidence, never proof of ownership
// or release. Unreadable fd inventories do not establish a GPU tie.
async function hasGpuTie(
  procRoot: string,
  pid: string,
  state: GpuState | undefined,
): Promise<boolean> {
  if (state?.processes.some((holder) => String(holder.pid) === pid) === true)
    return true;
  const fdRoot = join(procRoot, pid, "fd");
  const descriptors = await fromAsyncThrowable(() => readdir(fdRoot))();
  if (descriptors.isErr()) return false;
  for (const fd of descriptors.value) {
    const target = await fromAsyncThrowable(() => readlink(join(fdRoot, fd)))();
    if (target.isOk() && target.value === "/dev/dxg") return true;
  }
  return false;
}
async function leaderDxgObservation(
  pid: string,
  statPath: string,
  wchanPath: string,
  initialStat: string,
  now: () => number,
  gpuTied: () => Promise<boolean>,
): Promise<DStateObservation> {
  const startTime = procStartTime(initialStat);
  if (startTime === undefined)
    return {
      refusal: `GPU process identity unavailable pid=${pid}; evidence=${statPath}`,
    };
  const channel = await optionalText(wchanPath);
  const wchan = channel.unwrapOr(undefined)?.trim();
  if (
    (wchan === undefined || wchan === "" || wchan === "0") &&
    !(await gpuTied())
  )
    return {};
  const current = await optionalText(statPath);
  if (current.isErr())
    return {
      refusal: `GPU D-state recheck unavailable pid=${pid}; evidence=${statPath}`,
    };
  if (current.value === undefined) return {};
  const currentState = procState(current.value);
  if (currentState === undefined)
    return {
      refusal: `GPU D-state recheck unavailable pid=${pid}; evidence=${statPath}`,
    };
  if (currentState !== "D" || procStartTime(current.value) !== startTime)
    return {};
  if (wchan === undefined || wchan === "" || wchan === "0")
    return {
      refusal: `GPU D-state wait channel unavailable pid=${pid}; evidence=${wchanPath}`,
    };
  if (!/dxg/iu.test(wchan)) return {};
  return {
    candidate: {
      kind: "leader",
      pid,
      startTime,
      statPath,
      wchanPath,
      observedAt: now(),
    },
  };
}
async function taskInventoryRefusal(
  taskRoot: string,
  leader: ThreadGroup,
): Promise<string | undefined> {
  const currentLeader = await optionalText(leader.statPath);
  if (currentLeader.isErr())
    return `GPU task inventory unavailable tgid=${leader.tgid} leader_state=${leader.state}; evidence=${taskRoot},${leader.statPath}`;
  const currentLeaderStat = currentLeader.value;
  if (currentLeaderStat === undefined) return undefined;
  const currentStartTime = procStartTime(currentLeaderStat);
  if (
    leader.startTime !== undefined &&
    currentStartTime !== undefined &&
    currentStartTime !== leader.startTime
  )
    return undefined;
  return `GPU task inventory unavailable tgid=${leader.tgid} leader_state=${leader.state}; evidence=${taskRoot},${leader.statPath}`;
}
async function taskDxgRefusal(
  leader: ThreadGroup,
  taskBase: string,
  tid: string,
  now: () => number,
  gpuTied: () => Promise<boolean>,
): Promise<DStateObservation> {
  const taskStatPath = join(taskBase, "stat");
  const taskStat = await optionalText(taskStatPath);
  if (taskStat.isErr())
    return {
      refusal: `GPU task state unreadable tgid=${leader.tgid} tid=${tid} leader_state=${leader.state}; evidence=${taskStatPath}`,
    };
  const taskStatText = taskStat.value;
  if (taskStatText === undefined) return {};
  const taskState = procState(taskStatText);
  if (taskState === undefined)
    return {
      refusal: `GPU task state invalid tgid=${leader.tgid} tid=${tid} leader_state=${leader.state}; evidence=${taskStatPath}`,
    };
  if (taskState !== "D") return {};
  const taskStartTime = procStartTime(taskStatText);
  if (taskStartTime === undefined)
    return {
      refusal: `GPU task identity unavailable tgid=${leader.tgid} tid=${tid} leader_state=${leader.state}; evidence=${taskStatPath}`,
    };
  const wchanPath = join(taskBase, "wchan");
  const channel = await optionalText(wchanPath);
  const wchan = channel.unwrapOr(undefined)?.trim();
  if (
    (wchan === undefined || wchan === "" || wchan === "0") &&
    !(await gpuTied())
  )
    return {};
  const currentTask = await optionalText(taskStatPath);
  if (currentTask.isErr())
    return {
      refusal: `GPU task D-state recheck unavailable tgid=${leader.tgid} tid=${tid} leader_state=${leader.state}; evidence=${taskStatPath}`,
    };
  const currentTaskStat = currentTask.value;
  if (currentTaskStat === undefined) return {};
  const currentTaskState = procState(currentTaskStat);
  if (currentTaskState !== "D") {
    if (currentTaskState !== undefined) return {};
    return {
      refusal: `GPU task D-state recheck unavailable tgid=${leader.tgid} tid=${tid} leader_state=${leader.state}; evidence=${taskStatPath}`,
    };
  }
  if (procStartTime(currentTaskStat) !== taskStartTime) return {};
  const currentLeader = await optionalText(leader.statPath);
  if (currentLeader.isErr())
    return {
      refusal: `GPU task leader recheck unavailable tgid=${leader.tgid} tid=${tid}; evidence=${leader.statPath}`,
    };
  const currentLeaderStat = currentLeader.value;
  if (currentLeaderStat === undefined) return {};
  const currentLeaderState = procState(currentLeaderStat);
  const currentLeaderStartTime = procStartTime(currentLeaderStat);
  if (
    currentLeaderState === undefined ||
    leader.startTime === undefined ||
    currentLeaderStartTime === undefined
  )
    return {
      refusal: `GPU task leader recheck unavailable tgid=${leader.tgid} tid=${tid}; evidence=${leader.statPath}`,
    };
  if (currentLeaderStartTime !== leader.startTime) return {};
  let initialWchan: "dxg" | "unavailable" | undefined;
  if (wchan === undefined || wchan === "" || wchan === "0")
    initialWchan = "unavailable";
  else if (/dxg/iu.test(wchan)) initialWchan = "dxg";
  if (initialWchan !== undefined)
    return {
      candidate: {
        kind: "task",
        tgid: leader.tgid,
        tid,
        leaderStartTime: leader.startTime,
        taskStartTime,
        leaderStatPath: leader.statPath,
        taskStatPath,
        wchanPath,
        initialWchan,
        observedAt: now(),
      },
    };
  return {};
}
async function taskGroupDxgRefusal(
  procRoot: string,
  leader: ThreadGroup,
  now: () => number,
  gpuTied: () => Promise<boolean>,
): Promise<DStateObservation> {
  const taskRoot = join(procRoot, leader.tgid, "task");
  const taskDirectory = await fromAsyncThrowable(() => opendir(taskRoot))();
  if (taskDirectory.isErr()) {
    const refusal = await taskInventoryRefusal(taskRoot, leader);
    return refusal === undefined ? {} : { refusal };
  }
  const candidates: DStateCandidate[] = [];
  const scanned = await fromAsyncThrowable(
    async (): Promise<string | undefined> => {
      for await (const task of taskDirectory.value) {
        const tid = task.name;
        if (!/^\d+$/u.test(tid) || tid === leader.tgid) continue;
        const observation = await taskDxgRefusal(
          leader,
          join(taskRoot, tid),
          tid,
          now,
          gpuTied,
        );
        if (observation.refusal !== undefined) return observation.refusal;
        if (observation.candidate !== undefined)
          candidates.push(observation.candidate);
      }
      return undefined;
    },
  )();
  if (scanned.isErr()) {
    const refusal = await taskInventoryRefusal(taskRoot, leader);
    return refusal === undefined ? {} : { refusal };
  }
  if (scanned.value !== undefined) return { refusal: scanned.value };
  return { candidates };
}
async function confirmedLeaderDxgRefusal(
  candidate: Extract<DStateCandidate, { kind: "leader" }>,
): Promise<string | undefined> {
  const stat = await optionalText(candidate.statPath);
  if (stat.isErr())
    return `GPU D-state confirmation unavailable pid=${candidate.pid}; evidence=${candidate.statPath}`;
  if (stat.value === undefined) return undefined;
  const confirmedState = procState(stat.value);
  const confirmedStartTime = procStartTime(stat.value);
  if (confirmedState === undefined || confirmedStartTime === undefined)
    return `GPU D-state confirmation identity unavailable pid=${candidate.pid}; evidence=${candidate.statPath}`;
  if (confirmedState !== "D" || confirmedStartTime !== candidate.startTime)
    return undefined;
  const channel = await optionalText(candidate.wchanPath);
  const current = await optionalText(candidate.statPath);
  if (current.isErr())
    return `GPU D-state confirmation unavailable pid=${candidate.pid}; evidence=${candidate.statPath}`;
  if (current.value === undefined) return undefined;
  const currentState = procState(current.value);
  const currentStartTime = procStartTime(current.value);
  if (currentState === undefined || currentStartTime === undefined)
    return `GPU D-state confirmation identity unavailable pid=${candidate.pid}; evidence=${candidate.statPath}`;
  if (currentState !== "D" || currentStartTime !== candidate.startTime)
    return undefined;
  const wchan = channel.unwrapOr(undefined)?.trim();
  if (wchan === undefined || wchan === "" || wchan === "0")
    return `GPU D-state wait channel unavailable pid=${candidate.pid}; evidence=${candidate.wchanPath}`;
  if (!/dxg/iu.test(wchan)) return undefined;
  return `GPU persistent dxg stall pid=${candidate.pid} state=D wchan=${wchan}; observations=2 interval_ms>=${DXG_CONFIRMATION_INTERVAL_MS}; evidence=${candidate.statPath},${candidate.wchanPath}`;
}
async function confirmedTaskDxgRefusal(
  candidate: Extract<DStateCandidate, { kind: "task" }>,
): Promise<string | undefined> {
  const task = await optionalText(candidate.taskStatPath);
  if (task.isErr())
    return `GPU task D-state confirmation unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.taskStatPath}`;
  if (task.value === undefined) return undefined;
  const confirmedTaskState = procState(task.value);
  const confirmedTaskStartTime = procStartTime(task.value);
  if (confirmedTaskState === undefined || confirmedTaskStartTime === undefined)
    return `GPU task confirmation identity unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.taskStatPath}`;
  if (
    confirmedTaskState !== "D" ||
    confirmedTaskStartTime !== candidate.taskStartTime
  )
    return undefined;
  const leader = await optionalText(candidate.leaderStatPath);
  if (leader.isErr())
    return `GPU task leader confirmation unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.leaderStatPath}`;
  if (leader.value === undefined) return undefined;
  const confirmedLeaderState = procState(leader.value);
  const confirmedLeaderStartTime = procStartTime(leader.value);
  if (
    confirmedLeaderState === undefined ||
    confirmedLeaderStartTime === undefined
  )
    return `GPU task leader confirmation identity unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.leaderStatPath}`;
  if (confirmedLeaderStartTime !== candidate.leaderStartTime) return undefined;
  const channel = await optionalText(candidate.wchanPath);
  const [currentTask, currentLeader] = await Promise.all([
    optionalText(candidate.taskStatPath),
    optionalText(candidate.leaderStatPath),
  ]);
  if (currentTask.isErr())
    return `GPU task D-state confirmation unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.taskStatPath}`;
  if (currentLeader.isErr())
    return `GPU task leader confirmation unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.leaderStatPath}`;
  if (currentTask.value === undefined || currentLeader.value === undefined)
    return undefined;
  const currentTaskState = procState(currentTask.value);
  const currentTaskStartTime = procStartTime(currentTask.value);
  if (currentTaskState === undefined || currentTaskStartTime === undefined)
    return `GPU task confirmation identity unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.taskStatPath}`;
  const currentLeaderState = procState(currentLeader.value);
  const currentLeaderStartTime = procStartTime(currentLeader.value);
  if (currentLeaderState === undefined || currentLeaderStartTime === undefined)
    return `GPU task leader confirmation identity unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.leaderStatPath}`;
  if (
    currentTaskState !== "D" ||
    currentTaskStartTime !== candidate.taskStartTime ||
    currentLeaderStartTime !== candidate.leaderStartTime
  )
    return undefined;
  const wchan = channel.unwrapOr(undefined)?.trim();
  if (wchan === undefined || wchan === "" || wchan === "0") {
    if (candidate.initialWchan === "unavailable")
      return `GPU persistent D-state wait channel unavailable tgid=${candidate.tgid} tid=${candidate.tid} leader_state=${currentLeaderState} task_state=D; observations=2 interval_ms>=${DXG_CONFIRMATION_INTERVAL_MS}; evidence=${candidate.leaderStatPath},${candidate.taskStatPath},${candidate.wchanPath}`;
    return `GPU task D-state wait channel unavailable tgid=${candidate.tgid} tid=${candidate.tid}; evidence=${candidate.wchanPath}`;
  }
  if (!/dxg/iu.test(wchan)) return undefined;
  if (candidate.initialWchan === "unavailable")
    return `GPU persistent D-state mixed wait-channel evidence tgid=${candidate.tgid} tid=${candidate.tid} leader_state=${currentLeaderState} task_state=D initial_wchan=unavailable confirmed_wchan=${wchan}; observations=2 interval_ms>=${DXG_CONFIRMATION_INTERVAL_MS}; evidence=${candidate.leaderStatPath},${candidate.taskStatPath},${candidate.wchanPath}`;
  return `GPU persistent dxg stall tgid=${candidate.tgid} tid=${candidate.tid} leader_state=${currentLeaderState} task_state=D wchan=${wchan}; observations=2 interval_ms>=${DXG_CONFIRMATION_INTERVAL_MS}; evidence=${candidate.leaderStatPath},${candidate.taskStatPath},${candidate.wchanPath}`;
}
async function confirmedDxgRefusal(
  candidate: DStateCandidate,
): Promise<string | undefined> {
  return candidate.kind === "leader"
    ? confirmedLeaderDxgRefusal(candidate)
    : confirmedTaskDxgRefusal(candidate);
}
async function confirmedDxgCandidates(
  candidates: readonly DStateCandidate[],
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<string | undefined> {
  if (candidates.length === 0) return undefined;
  // This is two observations separated by one bounded shared delay, not proof
  // that a task remained in D continuously throughout that interval.
  await sleep(DXG_CONFIRMATION_INTERVAL_MS);
  for (const candidate of candidates) {
    if (now() - candidate.observedAt < DXG_CONFIRMATION_INTERVAL_MS) continue;
    const refusal = await confirmedDxgRefusal(candidate);
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}
async function policy() {
  const path =
    process.env.AGENT_RESOURCE_POLICY ??
    join(import.meta.dir, "../resource-policy.toml");
  if (!isAbsolute(path))
    return err(new UsageError("AGENT_RESOURCE_POLICY must be absolute"));
  const contents = await fromAsyncThrowable(() => readFile(path, "utf8"))();
  if (contents.isErr())
    return err(new UsageError(`cannot read policy ${path}`));
  const toml = fromThrowable(() => Bun.TOML.parse(contents.value))();
  if (toml.isErr()) return err(new UsageError(`invalid policy TOML ${path}`));
  const parsed = z
    .object({
      schema: z.literal(1),
      gpu_max_concurrent_jobs: positive.max(1024),
      // Preserve the established policy default for older policy files.
      gpu_safety_mib: positive
        .max(1024 * 1024)
        .optional()
        .default(512),
    })
    .safeParse(toml.value);
  if (!parsed.success)
    return err(
      new UsageError(`invalid policy ${path}: ${parsed.error.message}`),
    );
  return ok(parsed.data);
}
async function compileCapacity() {
  const path =
    process.env.AGENT_RESOURCE_SLOTS ??
    join(homedir(), ".config/agent-resource/slots.toml");
  if (!isAbsolute(path))
    return err(new UsageError("AGENT_RESOURCE_SLOTS must be absolute"));
  const read = await optionalText(path);
  if (read.isErr()) return err(read.error);
  const raw = read.value;
  if (raw === undefined)
    return ok(Math.max(1, Math.floor(availableParallelism() / 6)));
  const toml = fromThrowable(() => Bun.TOML.parse(raw))();
  if (toml.isErr()) return err(new UsageError(`invalid slot TOML ${path}`));
  const parsed = z
    .strictObject({ schema: z.literal(1), julia_compile: positive.max(1024) })
    .safeParse(toml.value);
  if (!parsed.success)
    return err(new UsageError(`invalid slot declaration ${path}`));
  return ok(parsed.data.julia_compile);
}
function runtimeDirectory() {
  const root = process.env.XDG_RUNTIME_DIR;
  if (root === undefined || !isAbsolute(root))
    return err(
      new Error("XDG_RUNTIME_DIR must name the user runtime directory"),
    );
  return ok(join(root, "agent-resource"));
}
export const gpuSlotPool = (gpuId: number) => `gpu.${gpuId}`;

// Diagnostic only: local proc observations cannot establish the driver's namespace.
function samplerProvenance(state: GpuState, pid: number): string {
  const sample = `sampled_at=${state.sampledAt ?? "unknown"}`;
  if (state.processIdentity === undefined)
    return `${sample} sampler_identity=legacy-missing`;
  const parsed = GpuProcessIdentitySchema.safeParse(state.processIdentity);
  if (!parsed.success) return `${sample} sampler_identity=invalid`;
  const identity = parsed.data;
  const source = `${sample} identity_sample_at=${identity.sampleAt} driver_binding=unknown`;
  if (identity.sampleAt !== state.sampledAt)
    return `${source} sampler_identity=sample-mismatch`;
  if (!state.samples.some(({ ts }) => ts === identity.sampleAt))
    return `${source} sampler_identity=sample-not-retained`;
  const rows = identity.processes.filter(
    ({ rawDriverPid }) => rawDriverPid === pid,
  );
  if (rows.length !== 1)
    return `${source} sampler_identity=row-unavailable omitted_processes=${identity.omittedProcesses} matching_rows=${rows.length}`;
  const row = rows[0]!;
  if (
    identity.captureStartedAt > identity.captureFinishedAt ||
    row.captureStartedAt < identity.captureStartedAt ||
    row.captureFinishedAt > identity.captureFinishedAt ||
    row.captureStartedAt > row.captureFinishedAt
  )
    return `${source} sampler_identity=invalid-capture-window`;
  const local = row.local;
  const localText =
    local === undefined
      ? ""
      : ` local_pid=${local.pid} local_tgid=${local.tgid} local_nspid=${local.nspid.join(",")} local_starttime=${local.starttime.slice(0, 64)}`;
  // Do not print raw stat/status/namespace/boot values or unrelated process rows.
  return `${source} sampler_identity=sample-correlated capture_ms=${identity.captureStartedAt}..${identity.captureFinishedAt} row_capture_ms=${row.captureStartedAt}..${row.captureFinishedAt} local_observation=${row.status} before=${row.before.status} after=${row.after.status} process_status=${row.processStatus.status} namespace=${row.namespace.status} boot_id=${identity.bootId.status} sampler_collector_pid=${identity.collector.rawDriverPid} collector_observation=${identity.collector.status}${localText}`;
}

async function cccSupervisor(): Promise<{
  pid: number;
  startedAt: number;
} | null> {
  const result = await output([
    "systemctl",
    "--user",
    "--timestamp=us+utc",
    "show",
    "ccc-daemon.service",
    "--property=MainPID,ExecMainStartTimestamp",
  ]);
  if (result.code !== 0) return null;
  const pid = Number(/^MainPID=(\d+)$/mu.exec(result.stdout)?.[1]);
  const timestamp =
    /^ExecMainStartTimestamp=\S+ (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?) UTC$/mu.exec(
      result.stdout,
    );
  if (timestamp === null || !Number.isSafeInteger(pid) || pid <= 0) return null;
  const started = fromThrowable(() =>
    Temporal.Instant.from(`${timestamp[1]}T${timestamp[2]}Z`),
  )();
  if (started.isErr()) return null;
  return { pid, startedAt: started.value.epochMilliseconds };
}

// The lock is the release acknowledgement; local absence alone is not. Bind
// that acknowledgement to the sampled child of the same supervisor incarnation.
async function yieldedCccWorker(
  state: GpuState,
  pid: number,
  procRoot: string,
  options: GpuAdmissionOptions,
) {
  if (options.cccHandoffHeld !== true) return false;
  const parsed = GpuProcessIdentitySchema.safeParse(state.processIdentity);
  if (!parsed.success) return false;
  const identity = parsed.data;
  const rows = identity.processes.filter((row) => row.rawDriverPid === pid);
  if (
    identity.sampleAt !== state.sampledAt ||
    rows.length !== 1 ||
    !state.samples.some(({ ts }) => ts === identity.sampleAt)
  )
    return false;
  const row = rows[0]!;
  if (
    row.status !== "read" ||
    row.before.status !== "read" ||
    row.after.status !== "read" ||
    row.processStatus.status !== "read" ||
    row.local?.pid !== pid ||
    row.local.tgid !== pid ||
    row.local.nspid.length !== 1 ||
    row.local.nspid[0] !== pid ||
    !row.before.value.startsWith(`${pid} (`) ||
    !row.after.value.startsWith(`${pid} (`) ||
    procStartTime(row.before.value) !== row.local.starttime ||
    procStartTime(row.after.value) !== row.local.starttime ||
    identity.captureStartedAt > row.captureStartedAt ||
    row.captureStartedAt > row.captureFinishedAt ||
    row.captureFinishedAt > identity.captureFinishedAt
  )
    return false;
  const parent = /^\d+ \(.*\) [A-Za-z] (\d+) /u;
  const parentPid = Number(parent.exec(row.before.value)?.[1]);
  if (
    !Number.isSafeInteger(parentPid) ||
    parentPid <= 0 ||
    Number(parent.exec(row.after.value)?.[1]) !== parentPid ||
    Number(/^PPid:\s+(\d+)$/mu.exec(row.processStatus.value)?.[1]) !== parentPid
  )
    return false;
  const supervisor = await fromAsyncThrowable(
    options.cccSupervisor ?? cccSupervisor,
  )();
  if (
    supervisor.isErr() ||
    supervisor.value === null ||
    supervisor.value === undefined ||
    supervisor.value.pid !== parentPid ||
    supervisor.value.startedAt >= identity.sampleAt
  )
    return false;
  const boot = await optionalText(join(procRoot, "sys/kernel/random/boot_id"));
  if (
    identity.bootId.status !== "read" ||
    boot.isErr() ||
    boot.value?.trim() !== identity.bootId.value.trim()
  )
    return false;
  const current = await optionalText(join(procRoot, String(pid), "stat"));
  if (current.isErr()) return false;
  if (current.value === undefined) return true;
  const startTime = procStartTime(current.value);
  return (
    current.value.startsWith(`${pid} (`) &&
    startTime !== undefined &&
    /^\d+$/u.test(startTime) &&
    startTime !== row.local.starttime
  );
}

/** Refuse live dxg stalls, unscoped sampled holders, and excess declared VRAM. */
export async function gpuAdmissionRefusal(
  deviceRequest: { gpu_id: number; vram_peak_bytes: number },
  safetyMiB: number,
  options: GpuAdmissionOptions = {},
): Promise<string | undefined> {
  const procRoot = options.procRoot ?? "/proc";
  const now = options.now ?? (() => performance.now());
  const sleep =
    options.sleep ?? ((milliseconds: number) => Bun.sleep(milliseconds));
  const state = options.state ?? (await readGpuState());
  const candidates: DStateCandidate[] = [];
  // Inspect live process state independently of the sampler's paused/cache state.
  // This is host-wide: a dxg wait outside a runner scope can stall this GPU too.
  const procEntries = await fromAsyncThrowable(() => readdir(procRoot))();
  if (procEntries.isErr())
    return `GPU process inventory unavailable; evidence=${procRoot}`;
  for (const entry of procEntries.value) {
    if (!/^\d+$/u.test(entry)) continue;
    const base = join(procRoot, entry);
    const statPath = join(base, "stat");
    const stat = await optionalText(statPath);
    if (stat.isErr())
      return `GPU process state unreadable pid=${entry}; evidence=${statPath}`;
    if (stat.value === undefined) continue; // Exited after inventory.
    // comm may contain spaces and closing parentheses.
    const processState = procState(stat.value);
    if (processState === undefined)
      return `GPU process state invalid pid=${entry}; evidence=${statPath}`;
    if (processState !== "D") continue;
    const observation = await leaderDxgObservation(
      entry,
      statPath,
      join(base, "wchan"),
      stat.value,
      now,
      () => hasGpuTie(procRoot, entry, state),
    );
    if (observation.refusal !== undefined) return observation.refusal;
    if (observation.candidate !== undefined)
      candidates.push(observation.candidate);
  }
  // A D-state thread can hide below a Z or otherwise non-D thread-group leader.
  // Each task directory is short-lived; this scan retains no host-wide task inventory.
  for (const entry of procEntries.value) {
    if (!/^\d+$/u.test(entry)) continue;
    const leaderStatPath = join(procRoot, entry, "stat");
    const leaderStat = await optionalText(leaderStatPath);
    if (leaderStat.isErr())
      return `GPU task leader state unreadable tgid=${entry}; evidence=${leaderStatPath}`;
    if (leaderStat.value === undefined) continue;
    const leaderState = procState(leaderStat.value);
    if (leaderState === undefined)
      return `GPU task leader state invalid tgid=${entry}; evidence=${leaderStatPath}`;
    const observation = await taskGroupDxgRefusal(
      procRoot,
      {
        tgid: entry,
        state: leaderState,
        startTime: procStartTime(leaderStat.value),
        statPath: leaderStatPath,
      },
      now,
      () => hasGpuTie(procRoot, entry, state),
    );
    if (observation.refusal !== undefined) return observation.refusal;
    candidates.push(...(observation.candidates ?? []));
  }
  const confirmation = await confirmedDxgCandidates(candidates, now, sleep);
  if (confirmation !== undefined) return confirmation;
  if (state === undefined)
    return `GPU owner state unavailable; evidence=${gpuStatePath()}`;
  if (state.unresponsiveSince !== undefined) {
    const holders = await Promise.all(
      state.processes.map(async ({ pid }) => {
        const command = (
          await optionalText(join(procRoot, String(pid), "cmdline"))
        ).unwrapOr(undefined);
        return `${pid} ${command?.replaceAll("\0", " ").trim() ?? "[exited or unavailable]"}`;
      }),
    );
    return `GPU stall recorded since ${state.unresponsiveSince}; evidence=${gpuStatePath()}: ${state.stallEvidence ?? state.why ?? "unresponsiveSince set"}; GPU-holding pids: ${holders.length > 0 ? holders.join("; ") : "none recorded"}`;
  }
  const device = state.devices.find(({ id }) => id === deviceRequest.gpu_id);
  if (device === undefined)
    return `GPU device ${deviceRequest.gpu_id} capacity unavailable; evidence=${gpuStatePath()}`;

  const scopes = new Map<string, number>();
  const admittedScopes = new Set<string>();
  for (const entry of procEntries.value) {
    if (!/^\d+$/u.test(entry)) continue;
    const base = join(procRoot, entry);
    const [cgroup, environ] = await Promise.all([
      optionalText(join(base, "cgroup")),
      optionalText(join(base, "environ")),
    ]);
    const scope = cgroup.isOk()
      ? cgroup.value?.match(
          /(?:^|\/)(agent-resource-[^/\n]+\.scope)(?:$|\n)/mu,
        )?.[1]
      : undefined;
    if (scope === undefined || scopes.has(scope)) continue;
    const receiptText = environ
      .unwrapOr(undefined)
      ?.split("\0")
      .find((value) => value.startsWith("AGENT_RESOURCE_ADMISSION_RECEIPT="))
      ?.slice("AGENT_RESOURCE_ADMISSION_RECEIPT=".length);
    const receipt =
      receiptText === undefined
        ? undefined
        : jsonOf(
            z.object({
              device: z
                .object({
                  kind: z.unknown().optional(),
                  gpu_id: z.unknown().optional(),
                  vram_peak_bytes: z.unknown().optional(),
                })
                .optional(),
              reservation_id: z.string().optional(),
            }),
          ).safeParse(receiptText);
    const gpuReceipt =
      receipt !== undefined && receipt.success
        ? receipt.data.device
        : undefined;
    if (gpuReceipt === undefined || gpuReceipt.kind !== "gpu") continue;
    if (
      typeof gpuReceipt.gpu_id !== "number" ||
      !Number.isSafeInteger(gpuReceipt.gpu_id) ||
      typeof gpuReceipt.vram_peak_bytes !== "number" ||
      !Number.isSafeInteger(gpuReceipt.vram_peak_bytes) ||
      gpuReceipt.vram_peak_bytes <= 0
    )
      return `GPU scope receipt invalid scope=${scope}; evidence=${join(base, "environ")}`;
    const reservationId =
      receipt?.success === true
        ? (receipt.data.reservation_id ?? scope)
        : scope;
    const admittedBytes =
      gpuReceipt.gpu_id === deviceRequest.gpu_id
        ? gpuReceipt.vram_peak_bytes
        : 0;
    const existingBytes = scopes.get(reservationId);
    if (existingBytes !== undefined && existingBytes !== admittedBytes)
      return `GPU reservation receipt mismatch reservation=${reservationId}; evidence=${join(base, "environ")}`;
    scopes.set(reservationId, admittedBytes);
    admittedScopes.add(scope);
  }
  // Holder identity is advisory: on WSL the driver reports PIDs that the Linux
  // PID namespace cannot resolve, so refusing on them blocks every concurrent job.
  // Admission rests on the declared VRAM budget below and the dxg stall check.
  const sampled = state;
  for (const { pid } of sampled.processes) {
    const problem = await holderIdentityProblem(sampled, pid);
    if (problem !== undefined)
      console.error(
        `WARN GPU holder check is advisory, not refusing: ${problem}`,
      );
  }
  async function holderIdentityProblem(
    sample: typeof sampled,
    pid: number,
  ): Promise<string | undefined> {
    if (await yieldedCccWorker(sample, pid, procRoot, options))
      return undefined;
    const base = join(procRoot, String(pid));
    const statPath = join(base, "stat");
    // Sampler provenance is diagnostic only. Two local observations can reject
    // reuse, but absence cannot prove driver exit while driver binding is unknown.
    const before = await optionalText(statPath);
    const [cgroup, processStatus] = await Promise.all([
      optionalText(join(base, "cgroup")),
      optionalText(join(base, "status")),
    ]);
    const after = await optionalText(statPath);
    const evidence = `${statPath},${join(base, "status")},${join(base, "cgroup")}`;
    const provenance = samplerProvenance(sample, pid);
    const uncertain = (reason: string) =>
      `GPU holder identity unverified pid=${pid} reason=${reason}; sampled_namespace=unknown; ${provenance}; evidence=${evidence}`;
    if (before.isErr() || after.isErr()) return uncertain("stat-unreadable");
    if (before.value === undefined || after.value === undefined)
      return uncertain(
        before.value !== undefined
          ? "gone-during-check"
          : "absent-or-pid-namespace-mismatch",
      );
    const startTime = procStartTime(before.value);
    if (
      startTime === undefined ||
      !/^\d+$/u.test(startTime) ||
      procStartTime(after.value) === undefined ||
      !before.value.startsWith(`${pid} (`) ||
      !after.value.startsWith(`${pid} (`)
    )
      return uncertain("stat-identity-invalid");
    if (startTime !== procStartTime(after.value))
      return uncertain("pid-reused-during-check");
    const holderStatus = processStatus.unwrapOr(undefined);
    if (holderStatus === undefined)
      return uncertain("status-unreadable-or-gone");
    // A translated/nested PID cannot establish equality with a driver PID.
    const namespacePids = /^NSpid:\s+([^\n]+)/mu
      .exec(holderStatus)?.[1]
      ?.trim()
      .split(/\s+/u);
    const localPid = /^Pid:\s+(\d+)/mu.exec(holderStatus)?.[1];
    const tgid = /^Tgid:\s+(\d+)/mu.exec(holderStatus)?.[1];
    if (
      localPid !== String(pid) ||
      tgid !== String(pid) ||
      namespacePids === undefined ||
      namespacePids.length !== 1 ||
      namespacePids[0] !== String(pid)
    )
      return uncertain("pid-namespace-or-tgid-mismatch");
    if (cgroup.isErr() || cgroup.value === undefined)
      return uncertain("cgroup-unreadable-or-gone");
    const scope = cgroup.isOk()
      ? cgroup.value?.match(
          /(?:^|\/)(agent-resource-[^/\n]+\.scope)(?:$|\n)/mu,
        )?.[1]
      : undefined;
    const zombie =
      processStatus.isOk() && /^State:\s+Z/mu.test(processStatus.value ?? "");
    if (scope === undefined)
      return `GPU holder ownership unverified pid=${pid}${zombie ? " state=ZOMBIE" : ""} local_scope=outside-admitted-GPU-scope local_starttime=${startTime} sampled_namespace=unknown; ${provenance}; evidence=${evidence}`;
    if (!admittedScopes.has(scope))
      return `GPU holder admission receipt unavailable pid=${pid}${zombie ? " state=ZOMBIE" : ""}; ${provenance}; evidence=${join(base, "environ")}`;
    return undefined;
  }
  const admittedBytes = [...scopes.entries()]
    .filter(
      ([reservationId]) =>
        reservationId !== options.currentScope &&
        reservationId !== options.currentReservationId,
    )
    .reduce((sum, [, bytes]) => sum + bytes, 0);
  const ceiling = device.totalMiB * 1024 ** 2 - safetyMiB * 1024 ** 2;
  if (deviceRequest.vram_peak_bytes + admittedBytes > ceiling)
    return `GPU VRAM budget exceeded gpu=${deviceRequest.gpu_id} requested=${deviceRequest.vram_peak_bytes} admitted=${admittedBytes} total=${device.totalMiB * 1024 ** 2} safety_margin=${safetyMiB}MiB; evidence=${gpuStatePath()}`;
  return undefined;
}
// flock itself owns locking and waiting. The availability probe is advisory: the actual
// acquisition below is atomic even when another caller takes this candidate first.
async function poolSlot(directory: string, pool: string, capacity: number) {
  const candidates = Array.from({ length: capacity }, (_, n) =>
    join(directory, `${pool}.${n}`),
  );
  for (const path of candidates) {
    // GPU selection must not briefly reserve an exclusive research slot before
    // announcing the want and receiving ccc's release acknowledgment.
    const mode = pool.startsWith("gpu.") ? ["--shared"] : [];
    const probe = await output([
      "flock",
      ...mode,
      "-n",
      "-E",
      "75",
      path,
      "true",
    ]);
    if (probe.code === 0) return ok(path);
    if (probe.code !== 75)
      return err(new Error(`flock probe failed: ${probe.stderr.trim()}`));
  }
  return ok(candidates[process.pid % capacity]!);
}
function lock(path: string, wait: number, conflict: number, command: string[]) {
  return [
    "flock",
    "-F",
    "-E",
    String(conflict),
    "-w",
    String(wait),
    path,
    ...command,
  ];
}
// Research keeps shared ownership until its slot and all scoped descendants exit.
// ccc owns the same lock exclusively through CUDA process exit, acknowledging release.
export function cccHandoffLock(root: string, wait: number, command: string[]) {
  return [
    "flock",
    "--shared",
    ...lock(join(root, "ccc-gpu.lock"), wait, 75, command).slice(1),
  ];
}
async function cpuIds(count: number) {
  const contents = await readFile("/proc/self/status", "utf8");
  const list = contents.match(/^Cpus_allowed_list:\s*(.+)$/mu)?.[1];
  const ids = (list ?? "").split(",").flatMap((part) => {
    const [first, last] = part.split("-").map(Number);
    return Array.from(
      { length: (last ?? first ?? 0) - (first ?? 0) + 1 },
      (_, n) => (first ?? 0) + n,
    );
  });
  return ids.slice(0, count);
}
export function buildSystemdLaunch(
  manifest: ResourceManifest,
  scope: string,
  command: string[],
) {
  const tasks = Math.min(
    65535,
    Math.max(32, manifest.processes * (manifest.cpu_threads + 16)),
  );
  return [
    "systemd-run",
    "--user",
    "--scope",
    "--collect",
    `--unit=${scope}`,
    "-p",
    `MemoryMax=${manifest.host_ram_peak_bytes}`,
    "-p",
    `MemoryHigh=${manifest.host_ram_peak_bytes}`,
    "-p",
    "MemorySwapMax=0",
    "-p",
    `CPUQuota=${manifest.cpu_threads * 100}%`,
    "-p",
    `TasksMax=${tasks}`,
    "-p",
    `RuntimeMaxSec=${manifest.walltime_seconds}`,
    "-p",
    "OOMPolicy=kill",
    "-p",
    `TimeoutStopSec=${manifest.cleanup.grace_seconds}`,
    "--",
    ...command,
  ];
}
// Keep slot-owning flock processes in a systemd-owned scope, outside the caller's
// service cgroup. If that caller is stopped, the holder remains until its nested
// job scope and every descendant have ended.
export function buildLockHolderLaunch(unit: string, command: string[]) {
  return [
    "systemd-run",
    "--user",
    "--scope",
    "--collect",
    `--unit=${unit}`,
    "--",
    ...command,
  ];
}
async function stopScope(scope: string) {
  const stopped = await output(["systemctl", "--user", "stop", scope], 45000);
  if (stopped.code === 0 || /not loaded|not found/iu.test(stopped.stderr))
    return ok(undefined);
  return err(
    new Error(`scope cleanup failed for ${scope}: ${stopped.stderr.trim()}`),
  );
}
async function run(
  manifest: ResourceManifest,
  command: string[],
  options: ExecuteOptions,
  checkOnly: boolean,
): Promise<Result<ExecutionResult, Error>> {
  const report = options.report ?? reportLine;
  if (!checkOnly && command.length === 0)
    return err(new UsageError("a command is required after --"));
  if (
    process.platform !== "linux" ||
    ["flock", "systemd-run", "systemctl"].some((bin) => Bun.which(bin) === null)
  )
    return ok(failure(69, "Linux flock and user systemd are required", report));
  if (process.env.AGENT_RESOURCE_ADMISSION_RECEIPT !== undefined)
    return ok(
      failure(
        69,
        "nested reservation refused: AGENT_RESOURCE_ADMISSION_RECEIPT is inherited",
        report,
      ),
    );
  const recovery = assessRecoveryVerdict(await readRecoveryVerdict());
  if (recovery.kind === "refuse")
    return ok(failure(70, recovery.message, report));
  report(recovery.message);
  const config = await policy();
  if (config.isErr()) return err(config.error);
  // A live GPU admission check belongs inside scope-entry, after the runner
  // has announced its want and acquired the CCC handoff lock. Before handoff,
  // CCC is still the legitimate GPU owner and can make this check refuse the
  // very request that would ask it to release the device. Check-only has no
  // handoff or scope-entry, so retain its immediate read-only admission check.
  if (manifest.device.kind === "gpu" && checkOnly) {
    const refusal = await gpuAdmissionRefusal(
      manifest.device,
      config.value.gpu_safety_mib,
    );
    if (refusal !== undefined) return ok(failure(69, refusal, report));
  }
  const manager = await output([
    "systemctl",
    "--user",
    "show",
    "--property=Version",
    "--value",
  ]);
  if (manager.code !== 0)
    return ok(
      failure(69, `user systemd unavailable: ${manager.stderr.trim()}`, report),
    );
  const ids = await cpuIds(manifest.cpu_threads);
  if (ids.length !== manifest.cpu_threads)
    return ok(failure(69, "requested CPU count exceeds allowed CPUs", report));
  const runtime = runtimeDirectory();
  if (runtime.isErr()) return err(runtime.error);
  const root = runtime.value;
  const slots = join(root, "slots");
  await mkdir(slots, { recursive: true, mode: 0o700 });
  await mkdir(join(root, "jobs"), { recursive: true, mode: 0o700 });
  const identity = join(root, "jobs", manifest.job_id);
  const available = await output(lock(identity, 0, 69, ["true"]));
  if (available.code !== 0)
    return ok(failure(69, `job=${manifest.job_id} already running`, report));
  if (checkOnly) {
    report(`ADMIT job=${manifest.job_id} check-only`);
    return ok({ ok: true, exitCode: 0 });
  }
  const reservationId = randomUUID();
  const scope = `agent-resource-${reservationId}.scope`;
  const source = options.manifestSource ?? {
    path: "<in-memory>",
    sha256: digest(JSON.stringify(manifest)),
  };
  const admissionId = randomUUID();
  const receipt = JSON.stringify({
    schema: 1,
    admission_id: admissionId,
    manifest_path: source.path,
    manifest_sha256: source.sha256,
    job_id: manifest.job_id,
    reservation_id: reservationId,
    scope_unit: scope,
    controller_pid: process.pid,
    cpu_ids: ids,
    host_ram_peak_bytes: manifest.host_ram_peak_bytes,
    gpu_safety_mib: config.value.gpu_safety_mib,
    scratch_bytes: manifest.scratch_bytes,
    device: manifest.device,
    started_at: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
  });
  const threads = String(manifest.cpu_threads);
  const env = {
    ...process.env,
    AGENT_RESOURCE_ADMISSION_ID: admissionId,
    AGENT_RESOURCE_JOB_ID: manifest.job_id,
    AGENT_RESOURCE_ENFORCEMENT: "cgroup",
    AGENT_RESOURCE_CPU_IDS: ids.join(","),
    AGENT_RESOURCE_MAX_PROCESSES: String(manifest.processes),
    AGENT_RESOURCE_HOST_RAM_BYTES: String(manifest.host_ram_peak_bytes),
    AGENT_RESOURCE_SCRATCH_BYTES: String(manifest.scratch_bytes),
    AGENT_RESOURCE_MANIFEST_PATH: source.path,
    AGENT_RESOURCE_MANIFEST_SHA256: source.sha256,
    AGENT_RESOURCE_RESERVATION_ID: reservationId,
    AGENT_RESOURCE_ADMISSION_RECEIPT: receipt,
    AGENT_RESOURCE_ADMISSION_RECEIPT_SHA256: digest(receipt),
    JULIA_NUM_THREADS: threads,
    OMP_NUM_THREADS: threads,
    OPENBLAS_NUM_THREADS: threads,
    MKL_NUM_THREADS: threads,
    NUMEXPR_NUM_THREADS: threads,
    RAYON_NUM_THREADS: threads,
    POLARS_MAX_THREADS: threads,
    CUDA_VISIBLE_DEVICES:
      manifest.device.kind === "gpu" ? String(manifest.device.gpu_id) : "",
    AGENT_RESOURCE_VRAM_BYTES:
      manifest.device.kind === "gpu"
        ? String(manifest.device.vram_peak_bytes)
        : undefined,
    JULIA_CUDA_HARD_MEMORY_LIMIT:
      manifest.device.kind === "gpu"
        ? String(manifest.device.vram_peak_bytes)
        : undefined,
    JULIA_CUDA_SOFT_MEMORY_LIMIT:
      manifest.device.kind === "gpu"
        ? String(Math.floor(manifest.device.vram_peak_bytes * 0.9))
        : undefined,
    AGENT_RESOURCE_SCOPE_COMMAND: JSON.stringify(command),
  };
  const launch = buildSystemdLaunch(manifest, scope, [
    process.execPath,
    join(import.meta.dir, "scope-entry.ts"),
  ]);
  const scopedEnv = {
    ...env,
    AGENT_RESOURCE_SCOPE_LAUNCH: JSON.stringify({ argv: launch, scope }),
  };
  let argv = [process.execPath, join(import.meta.dir, "scope-controller.ts")];
  const wait = Math.min(900, manifest.walltime_seconds);
  if (
    (options.requestedSlots?.length ?? 0) > 0 ||
    (manifest.compile_slots?.length ?? 0) > 0
  ) {
    const capacity = await compileCapacity();
    if (capacity.isErr()) return err(capacity.error);
    const slot = await poolSlot(slots, "julia-compile", capacity.value);
    if (slot.isErr()) return err(slot.error);
    argv = lock(slot.value, wait, 75, argv);
  }
  await using handoffCleanup = new AsyncDisposableStack();
  let want: string | undefined;
  handoffCleanup.defer(async () => {
    if (want !== undefined) await unlink(want);
  });
  if (manifest.device.kind === "gpu") {
    const slot = await poolSlot(
      slots,
      gpuSlotPool(manifest.device.gpu_id),
      config.value.gpu_max_concurrent_jobs,
    );
    if (slot.isErr()) return err(slot.error);
    argv = lock(slot.value, wait, 75, argv);
    argv = cccHandoffLock(root, wait, argv);
    const wants = join(root, "gpu-wants");
    await mkdir(wants, { recursive: true, mode: 0o700 });
    const marker = join(wants, reservationId);
    await writeFile(marker, String(process.pid), { flag: "wx", mode: 0o600 });
    want = marker;
  }
  argv = lock(identity, 0, 69, argv);
  if (manifest.device.kind === "gpu") {
    argv = buildLockHolderLaunch(
      `agent-resource-holder-${randomUUID()}.scope`,
      argv,
    );
  }
  // bounded: each flock has -w; systemd owns RuntimeMaxSec and descendant cleanup.
  const child = Bun.spawn(argv, {
    cwd: options.cwd ?? process.cwd(),
    env: scopedEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  let interrupted: ReturnType<typeof stopScope> | undefined;
  const interrupt = () => {
    interrupted ??= stopScope(scope);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const completed = await fromAsyncThrowable(() => child.exited, asError)();
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  const interruptedResult = await interrupted;
  const stopped = await stopScope(scope);
  if (interruptedResult?.isErr() === true) return err(interruptedResult.error);
  if (stopped.isErr()) return err(stopped.error);
  if (completed.isErr()) return err(completed.error);
  const code = completed.value;
  if (code === 75)
    report(
      `HOLD job=${manifest.job_id} flock wait expired after ${wait}s code=75`,
    );
  if (code === 69)
    report(`DENY job=${manifest.job_id} reservation not granted code=69`);
  report(`RELEASE job=${manifest.job_id} code=${code}`);
  if (code === 0) report(`PASS job=${manifest.job_id} code=0`);
  return ok({
    ok: code === 0,
    exitCode: code,
    ...(code === 0 ? {} : { reason: "command-exit" }),
  });
}
export function executeJob(
  manifest: ResourceManifest,
  command: string[],
  options: ExecuteOptions = {},
) {
  return fromAsyncThrowable(
    () => run(manifest, command, options, false),
    asError,
  )().andThen((result) => result);
}
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
async function status() {
  const runtime = runtimeDirectory();
  if (runtime.isErr()) return err(runtime.error);
  const slots = join(runtime.value, "slots");
  const names = await fromAsyncThrowable(() => readdir(slots))();
  if (names.isErr() && !missing(names.error)) return err(asError(names.error));
  const locks = await output([
    "lslocks",
    "--json",
    "--notruncate",
    "--output",
    "PID,COMMAND,PATH",
  ]);
  if (locks.code !== 0) return err(new Error(locks.stderr));
  reportLine(`SLOTS directory=${slots} files=${names.unwrapOr([]).join(",")}`);
  const parsed = jsonOf(
    z.object({
      locks: z.array(
        z.object({
          pid: z.number(),
          command: z.string(),
          path: z.string().nullable(),
        }),
      ),
    }),
  ).safeParse(locks.stdout.trim() === "" ? '{"locks":[]}' : locks.stdout);
  if (!parsed.success) return err(new Error("invalid lslocks output"));
  reportLine(
    JSON.stringify(
      parsed.data.locks.filter(
        (row) => row.path?.startsWith(slots + "/") === true,
      ),
    ),
  );
  reportLine(
    `GPU_OWNER evidence=${gpuStatePath()} state=${JSON.stringify((await readGpuState()) ?? null)}`,
  );
  return ok(undefined);
}
async function main() {
  const parsed = cli(
    {
      name: "agent-resource-run",
      version: pkg.version,
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[command...]"],
      commands: [statusCommand],
      flags: {
        manifest: { type: String },
        jobId: { type: String },
        slot: { type: String },
        checkOnly: { type: Boolean, default: false },
      },
    },
    undefined,
    cliArgv(),
  );
  if (parsed.command === "status") {
    if (statusHasOperands(parsed))
      return err(
        new UsageError("status does not accept arguments or admission flags"),
      );
    return (await status()).map(() => 0);
  }
  if (parsed.flags.manifest === undefined || parsed.flags.manifest === "")
    return err(new UsageError("--manifest is required"));
  if (parsed.flags.slot !== undefined && parsed.flags.slot !== "julia-compile")
    return err(new UsageError('--slot must be "julia-compile"'));
  const path = resolve(parsed.flags.manifest);
  const read = await fromAsyncThrowable(() => readFile(path))();
  if (read.isErr())
    return err(new UsageError(`cannot read manifest '${path}'`));
  const bytes = read.value;
  const decoded = jsonOf(manifestSchema).safeParse(bytes.toString());
  if (!decoded.success)
    return err(
      new UsageError(`invalid manifest ${path}: ${decoded.error.message}`),
    );
  const override = jobId.safeParse(parsed.flags.jobId ?? decoded.data.job_id);
  if (!override.success)
    return err(
      new UsageError(
        "--job-id must be a filesystem-safe id of at most 80 characters",
      ),
    );
  if (parsed.flags.checkOnly && parsed._.length > 0)
    return err(new UsageError("--check-only does not accept a command"));
  const manifest = { ...decoded.data, job_id: override.data };
  return (
    await run(
      manifest,
      parsed._.map(String),
      {
        manifestSource: manifestSourceFromBytes(path, bytes),
        requestedSlots:
          parsed.flags.slot === undefined ? [] : ["julia-compile"],
      },
      parsed.flags.checkOnly,
    )
  ).map((result) => result.exitCode);
}
if (import.meta.main) {
  const result = await fromAsyncThrowable(main, asError)().andThen(
    (value) => value,
  );
  result.match(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(
        `${error instanceof UsageError ? "USAGE" : "ERROR"}: ${error.message}\n`,
      );
      process.exit(error instanceof UsageError ? 2 : 70);
    },
  );
}
