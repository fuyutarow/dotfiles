#!/usr/bin/env bun
// Consumer: humans and agents running one RAM-bounded command; Linux fails closed.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
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
import { gpuStatePath, readGpuState } from "../../shared/src/gpu-samples.ts";
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
      gpu_safety_mib: positive.max(1024 * 1024),
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

/** Refuse GPU work unless every sampled holder belongs to a declared GPU scope. */
export async function gpuAdmissionRefusal(
  deviceRequest: { gpu_id: number; vram_peak_bytes: number },
  safetyMiB: number,
  options: {
    procRoot?: string;
    state?: Awaited<ReturnType<typeof readGpuState>>;
    currentScope?: string;
    currentReservationId?: string;
  } = {},
): Promise<string | undefined> {
  const procRoot = options.procRoot ?? "/proc";
  const state = options.state ?? (await readGpuState());
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
  const procEntries = await fromAsyncThrowable(() => readdir(procRoot))();
  if (procEntries.isErr())
    return `GPU process inventory unavailable; evidence=${procRoot}`;
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
  for (const { pid } of state.processes) {
    const base = join(procRoot, String(pid));
    const [cgroup, processStatus, command] = await Promise.all([
      optionalText(join(base, "cgroup")),
      optionalText(join(base, "status")),
      optionalText(join(base, "cmdline")),
    ]);
    const scope = cgroup.isOk()
      ? cgroup.value?.match(
          /(?:^|\/)(agent-resource-[^/\n]+\.scope)(?:$|\n)/mu,
        )?.[1]
      : undefined;
    const zombie =
      processStatus.isOk() && /^State:\s+Z/mu.test(processStatus.value ?? "");
    if (scope === undefined)
      return `GPU holder outside admitted GPU scope pid=${pid}${zombie ? " state=ZOMBIE" : ""} command=${command.unwrapOr(undefined)?.replaceAll("\0", " ").trim() ?? "[unavailable]"}; evidence=${join(base, "cgroup")}`;
    if (!admittedScopes.has(scope))
      return `GPU holder admission receipt unavailable pid=${pid}${zombie ? " state=ZOMBIE" : ""}; evidence=${join(base, "environ")}`;
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
    const mode = pool === "gpu" ? ["--shared"] : [];
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
  if (manifest.device.kind === "gpu") {
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
