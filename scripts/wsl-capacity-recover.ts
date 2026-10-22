import { cli } from "cleye";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import {
  mkdir,
  open,
  unlink,
  readdir,
  stat as fileStat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import {
  loadStorageHeadroom,
  storageLine,
} from "../tools/shared/src/storage-headroom.ts";

// Consumer: a user-systemd timer and the Claude storage hook. One short run checks the Windows
// drive and host RAM under WSL, reclaims only the repository's unattended-safe tiers, and stops
// compute work at an emergency floor. The hook starts the unit asynchronously; it never does GC.
// Research outputs and the human-only reclaim:purge task are outside this controller.

const GiB = 1024 ** 3;
const REGULAR_RECLAIM_COOLDOWN_MS = 60 * 60 * 1000;
const EMERGENCY_RECLAIM_COOLDOWN_MS = 5 * 60 * 1000;
const POLICY_PATH = join(
  import.meta.dir,
  "../agents/hooks/storage-headroom.toml",
);
const STAMP_PATH = join(
  homedir(),
  ".local/state/wsl-capacity-recover/last-attempt",
);
const VERDICT_PATH = join(
  homedir(),
  ".local/state/wsl-capacity-recover/latest-verdict.json",
);
const CACHE_DROP_STAMP_PATH = join(
  homedir(),
  ".local/state/wsl-capacity-recover/last-cache-drop",
);
const COMPUTE_NAMES = new Set([
  "julia",
  "cargo",
  "rustc",
  "clippy-driver",
  "polysearch",
]);
const DEDICATED_UNIT =
  /^(?:sb-|agent-resource-|fd-|polysearch-)[A-Za-z0-9_.@-]+\.(?:service|scope)$/u;
const POWERSHELL =
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
const WSL_DISTRO = "Ubuntu-24.04";
const MEMORY_AVAILABLE_EMERGENCY_MB = 2048;
const CACHE_DROP_COOLDOWN_MS = 10 * 60 * 1000;
// Persisted across timer invocations; one extra cache drop per continuous emergency.
export const EMERGENCY_CACHE_DROP_OVERRIDE_LIMIT = 1;
const EMERGENCY_EPISODE_PATH = join(
  homedir(),
  ".local/state/wsl-capacity-recover/emergency-cache-drop",
);
const DROP_CACHE_UNIT = "dotfiles-dropcache.service";
const HARD_PAGE_READS_EMERGENCY_PER_SECOND = 500;
export const TMPFS_RECLAIM_PERCENT = 80;
let cliError: string | undefined;

type Policy = {
  path: string;
  denyBytes: number;
  stopBytes: number;
};

export type HostMemory = {
  availableMb: number;
  pageReadsPerSecond: number;
};

export type RecoveryVerdictRecord = {
  schema: 1;
  verdict: "OK" | "HOLD";
  memory_emergency: boolean;
  windows_available_mb: number | null;
  recorded_at: string;
};

export function recoveryVerdictRecord(
  verdict: "OK" | "HOLD",
  isMemoryEmergency: boolean,
  memory: HostMemory | null,
  recordedAt: string,
): RecoveryVerdictRecord {
  return {
    schema: 1,
    verdict,
    memory_emergency: isMemoryEmergency,
    windows_available_mb: memory?.availableMb ?? null,
    recorded_at: recordedAt,
  };
}

export function writeRecoveryVerdict(
  record: RecoveryVerdictRecord,
  path = VERDICT_PATH,
): void {
  const temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(record)}\n`);
  renameSync(temporary, path);
}

export type ComputeProcess = {
  pid: number;
  uid: number;
  comm: string;
  startTicks: string;
  cgroup: string;
};

export type StopTarget =
  | { kind: "unit"; name: string }
  | { kind: "pid"; pid: number; startTicks: string; comm: string };

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    cliError = `Unknown option '--${flag}'`;
  }
}

export function loadRecoveryPolicy(path = POLICY_PATH): Result<Policy, Error> {
  const loaded = loadStorageHeadroom(path);
  if (loaded.errors.length > 0) return err(new Error(loaded.errors.join("; ")));
  const host = loaded.drives.find((drive) => drive.label.startsWith("host C:"));
  if (
    host === undefined ||
    host.stop_gib === undefined ||
    host.stop_gib <= 0 ||
    host.deny_gib <= host.stop_gib
  ) {
    return err(
      new Error(`drive.host needs path and 0 < stop_gib < deny_gib in ${path}`),
    );
  }
  return ok({
    path: host.path,
    denyBytes: storageLine(host.deny_gib, host.deny_pct, null),
    stopBytes: host.stop_gib * GiB,
  });
}

function freeBytes(path: string): Result<number, Error> {
  const stats = fromThrowable(() => statfsSync(path))();
  if (stats.isErr()) return err(new Error(String(stats.error)));
  const value = stats.value.bavail * stats.value.bsize;
  if (!Number.isSafeInteger(value) || value < 0) {
    return err(new Error(`${path} returned an invalid free-byte count`));
  }
  return ok(value);
}

function gib(bytes: number): string {
  return `${(bytes / GiB).toFixed(1)}GiB`;
}

export function shouldReclaim(
  free: number,
  policy: Pick<Policy, "denyBytes" | "stopBytes">,
  lastAttemptMs: number,
  nowMs: number,
): boolean {
  if (free >= policy.denyBytes) return false;
  const cooldown =
    free < policy.stopBytes
      ? EMERGENCY_RECLAIM_COOLDOWN_MS
      : REGULAR_RECLAIM_COOLDOWN_MS;
  return nowMs - lastAttemptMs >= cooldown;
}

export type TmpfsUsage = {
  inodes: { used: number; total: number; percent: number };
  bytes: { used: number; total: number; percent: number };
};

export function tmpfsUsage(
  statfs: Pick<
    ReturnType<typeof statfsSync>,
    "files" | "ffree" | "blocks" | "bavail" | "bsize"
  >,
): Result<TmpfsUsage, Error> {
  const total = Number(statfs.files);
  const free = Number(statfs.ffree);
  const used = total - free;
  const totalBytes = Number(statfs.blocks) * Number(statfs.bsize);
  const availableBytes = Number(statfs.bavail) * Number(statfs.bsize);
  const usedBytes = totalBytes - availableBytes;
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(free) ||
    total <= 0 ||
    free < 0 ||
    used < 0 ||
    used > total ||
    !Number.isSafeInteger(totalBytes) ||
    !Number.isSafeInteger(availableBytes) ||
    totalBytes <= 0 ||
    availableBytes < 0 ||
    usedBytes < 0 ||
    usedBytes > totalBytes
  ) {
    return err(new Error("/tmp returned invalid tmpfs capacity counts"));
  }
  return ok({
    inodes: { used, total, percent: (used / total) * 100 },
    bytes: {
      used: usedBytes,
      total: totalBytes,
      percent: (usedBytes / totalBytes) * 100,
    },
  });
}

export function tmpfsThreshold(raw: string | undefined): Result<number, Error> {
  const percent = Number(raw);
  if (
    raw === undefined ||
    !Number.isInteger(percent) ||
    percent <= 0 ||
    percent >= 85
  ) {
    return err(
      new Error(`TMPFS_RECLAIM_PERCENT must be an integer from 1 to 84`),
    );
  }
  return ok(percent);
}

export async function recoverTmpfsCapacity(options: {
  thresholdPercent: number;
  measure: () => Result<TmpfsUsage, Error>;
  runTarget: () => Promise<{ code: number; timedOut: boolean; output: string }>;
  log: (message: string) => void;
  warn: (message: string) => void;
}): Promise<void> {
  const measuredBefore = fromThrowable(options.measure)();
  if (measuredBefore.isErr()) {
    options.warn(
      `WARN tmpfs capacity measurement failed: ${String(measuredBefore.error)}\n`,
    );
    return;
  }
  if (measuredBefore.value.isErr()) {
    options.warn(
      `WARN tmpfs capacity measurement failed: ${String(measuredBefore.value.error)}\n`,
    );
    return;
  }
  const before = measuredBefore.value.value;
  const pressure = Math.max(before.inodes.percent, before.bytes.percent);
  if (pressure < options.thresholdPercent) {
    options.log(
      `TMPFS HOLD inodes=${before.inodes.used}/${before.inodes.total} (${before.inodes.percent.toFixed(1)}%) bytes=${gib(before.bytes.used)}/${gib(before.bytes.total)} (${before.bytes.percent.toFixed(1)}%) threshold=${options.thresholdPercent}%\n`,
    );
    return;
  }
  const action = await fromAsyncThrowable(options.runTarget)();
  if (action.isErr()) {
    options.warn(`WARN tmpfs reclaim failed: ${String(action.error)}\n`);
    return;
  }
  const measuredAfter = fromThrowable(options.measure)();
  if (measuredAfter.isErr()) {
    options.warn(
      `WARN tmpfs post-reclaim measurement failed: ${String(measuredAfter.error)}\n`,
    );
    return;
  }
  if (measuredAfter.value.isErr()) {
    options.warn(
      `WARN tmpfs post-reclaim measurement failed: ${String(measuredAfter.value.error)}\n`,
    );
    return;
  }
  const result = action.value;
  const after = measuredAfter.value.value;
  const reclaimed = before.inodes.used - after.inodes.used;
  const reclaimedBytes = before.bytes.used - after.bytes.used;
  const line =
    `TMPFS_RECLAIM exit=${result.code} timeout=${result.timedOut} ` +
    `before_inodes=${before.inodes.used}/${before.inodes.total} after_inodes=${after.inodes.used}/${after.inodes.total} ` +
    `before_bytes=${gib(before.bytes.used)}/${gib(before.bytes.total)} after_bytes=${gib(after.bytes.used)}/${gib(after.bytes.total)} ` +
    `reclaimed_inodes=${reclaimed} reclaimed_bytes=${gib(reclaimedBytes)} detail=${JSON.stringify(result.output)}\n`;
  if (result.code !== 0 || result.timedOut) options.warn(line);
  else options.log(line);
}

function measureTmpfs(): Result<TmpfsUsage, Error> {
  return tmpfsUsage(statfsSync("/tmp", { bigint: true }));
}

const DISK_RECLAIM = join(
  import.meta.dir,
  "../tools/disk-reclaim/src/reclaim.ts",
);

function miseBinary(): string {
  return Bun.which("mise") ?? "/home/linuxbrew/.linuxbrew/bin/mise";
}

// The controller reaches the disk-reclaim CLI directly with an explicit target; no mise task
// stands between them, so a renamed task cannot silently turn a stage into a failed spawn.
export function diskReclaimArgv(mise: string, target: string): string[] {
  return [
    mise,
    "exec",
    "--",
    "bun",
    DISK_RECLAIM,
    "run",
    target,
    "--yes",
    "--no-progress",
    "--json",
  ];
}

export type ReclaimStage = {
  name: string;
  argv: string[];
  timeoutMs: number;
};

/** Timer maintenance is independent of host pressure and the recovery cooldown. */
export async function expireGraveyard(
  dryRun: boolean,
  run: (stage: ReclaimStage) => Promise<StageRun>,
  mise = miseBinary(),
): Promise<StageRun> {
  const argv = diskReclaimArgv(mise, "rip-expire");
  if (dryRun) {
    argv[argv.indexOf("run")] = "plan";
    argv.splice(argv.indexOf("--yes"), 1);
  }
  // Expiry spends at most two minutes on incremental work; allow time to flush
  // its partial receipt before the controller's outer deadline.
  return run({ name: "rip-expire", argv, timeoutMs: 3 * 60_000 });
}

// Order is execution order: the Windows host levers first, then guest build output and caches.
// `builds` is the one stage with no age filter of its own; disk-reclaim refuses any path a live
// process holds and reports an unreadable-process path as ASK, which --yes never runs.
export function reclaimStages(mise: string): ReclaimStage[] {
  return [
    { name: "host", timeoutMs: 120_000 },
    { name: "builds", timeoutMs: 180_000 },
    { name: "clean", timeoutMs: 120_000 },
  ].map(({ name, timeoutMs }) => ({
    name,
    argv: diskReclaimArgv(mise, name),
    timeoutMs,
  }));
}

// Every command the controller spawns that names a mise task, a disk-reclaim target, or a mise
// subcommand. The test resolves each one against this checkout.
export function controllerCalls(mise = "mise"): ReclaimStage[] {
  return [
    {
      name: "tmpfs",
      argv: diskReclaimArgv(mise, "tmpfs"),
      timeoutMs: 120_000,
    },
    {
      name: "rip-expire",
      argv: diskReclaimArgv(mise, "rip-expire"),
      timeoutMs: 120_000,
    },
    ...reclaimStages(mise),
    {
      name: "cargo-clean",
      argv: [mise, "exec", "--", "cargo", "clean"],
      timeoutMs: 300_000,
    },
  ];
}

async function runTmpfsTarget(): Promise<{
  code: number;
  timedOut: boolean;
  output: string;
}> {
  return runBounded(diskReclaimArgv(miseBinary(), "tmpfs"), 120_000);
}

function readLastAttemptMs(): number {
  return fromThrowable(() => statSync(STAMP_PATH).mtimeMs)().unwrapOr(0);
}

function markAttempt(): void {
  const result = fromThrowable(() => {
    mkdirSync(join(homedir(), ".local/state/wsl-capacity-recover"), {
      recursive: true,
    });
    writeFileSync(
      STAMP_PATH,
      `${Temporal.Now.instant().toString({ fractionalSecondDigits: 3 })}\n`,
    );
  })();
  if (result.isErr()) {
    process.stderr.write(`WARN stamp unavailable: ${String(result.error)}\n`);
  }
}

export function shouldDropPageCache(
  lastAttemptMs: number,
  nowMs: number,
): boolean {
  return nowMs - lastAttemptMs >= CACHE_DROP_COOLDOWN_MS;
}

function readLastCacheDropMs(): number {
  return fromThrowable(() =>
    Number(readFileSync(CACHE_DROP_STAMP_PATH, "utf8").trim()),
  )()
    .map((value) => (Number.isFinite(value) ? value : 0))
    .unwrapOr(0);
}

function markCacheDropAttempt(): boolean {
  const result = fromThrowable(() => {
    mkdirSync(join(homedir(), ".local/state/wsl-capacity-recover"), {
      recursive: true,
    });
    writeFileSync(
      CACHE_DROP_STAMP_PATH,
      `${Temporal.Now.instant().epochMilliseconds}\n`,
    );
  })();
  if (result.isErr()) {
    process.stderr.write(
      `WARN cache-drop rate-limit stamp unavailable: ${String(result.error)}\n`,
    );
    return false;
  }
  return true;
}

function cacheDropAllowed(): boolean {
  return shouldDropPageCache(
    readLastCacheDropMs(),
    Temporal.Now.instant().epochMilliseconds,
  );
}

async function runBounded(
  argv: string[],
  timeoutMs: number,
  cwd = join(import.meta.dir, ".."),
  env?: NodeJS.ProcessEnv,
  outputLimit = 1200,
): Promise<{
  code: number;
  timedOut: boolean;
  output: string;
}> {
  const signal = AbortSignal.timeout(timeoutMs);
  const proc = Bun.spawn(argv, {
    cwd,
    ...(env === undefined ? {} : { env }),
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    code,
    timedOut: signal.aborted,
    output: `${stdout}\n${stderr}`.trim().slice(-outputLimit),
  };
}

function encodedPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

const MEMORY_PROBE = `
$ErrorActionPreference = 'Stop'
$available = @(); $reads = @()
1..3 | ForEach-Object {
  $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  $available += $m.AvailableMBytes
  $reads += $m.PageReadsPersec
  if ($_ -lt 3) { Start-Sleep -Milliseconds 400 }
}
"available_mb=" + [int](($available | Measure-Object -Average).Average)
"page_reads_s=" + [int](($reads | Measure-Object -Average).Average)
`;

export function parseHostMemory(output: string): HostMemory | null {
  const availableMb = Number(/(?:^|\n)available_mb=(\d+)/u.exec(output)?.[1]);
  const pageReadsPerSecond = Number(
    /(?:^|\n)page_reads_s=(\d+)/u.exec(output)?.[1],
  );
  if (
    !Number.isSafeInteger(availableMb) ||
    !Number.isSafeInteger(pageReadsPerSecond) ||
    !output.includes("available_mb=") ||
    !output.includes("page_reads_s=")
  ) {
    return null;
  }
  return { availableMb, pageReadsPerSecond };
}

export function memoryEmergency(memory: HostMemory | null): boolean {
  return (
    memory !== null &&
    memory.availableMb < MEMORY_AVAILABLE_EMERGENCY_MB &&
    memory.pageReadsPerSecond > HARD_PAGE_READS_EMERGENCY_PER_SECOND
  );
}

type MemoryEmergencyOptions = {
  before: HostMemory;
  beforeBuffCacheMb?: number | null;
  thresholdMb: number;
  isLeverAvailable: () => boolean | Promise<boolean>;
  startLever: () => boolean | Promise<boolean>;
  fallbackDrop: () => boolean | Promise<boolean>;
  wait: () => void | Promise<void>;
  measure: () => HostMemory | null | Promise<HostMemory | null>;
  measureBuffCache?: () => number | null;
  canAttemptDrop?: () => boolean;
  claimEmergencyOverride?: () => boolean | Promise<boolean>;
  markDropAttempt?: () => boolean | void;
  fallbackWhenUnavailable?: boolean;
  isRestored?: (memory: HostMemory | null) => boolean;
  stopOnFailure?: boolean;
  stopCompute: (recovery: MemoryRecovery) => void | Promise<void>;
};

export type MemoryRecovery = {
  leverAttempted: boolean;
  dropAttempted: boolean;
  beforeMb: number;
  afterMb: number | null;
  memoryAfter: HostMemory | null;
  beforeBuffCacheMb: number | null;
  afterBuffCacheMb: number | null;
  outcome: string;
  emergencyOverride: boolean;
  stopped: boolean;
};

/** Atomic claim survives timer restarts; a clear measurement ends the episode. */
export async function claimEmergencyCacheDrop(
  path = EMERGENCY_EPISODE_PATH,
): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  const claimed = await fromAsyncThrowable(() => open(path, "wx"))();
  if (claimed.isErr()) return false;
  await using file = claimed.value;
  await file.sync();
  await using directory = await open(dirname(path), "r");
  await directory.sync();
  return true;
}

export async function resetEmergencyCacheDrop(
  path = EMERGENCY_EPISODE_PATH,
): Promise<void> {
  const removed = await fromAsyncThrowable(() => unlink(path))();
  if (removed.isErr() && !String(removed.error).includes("ENOENT")) {
    process.stderr.write(
      `WARN emergency episode reset failed: ${String(removed.error)}\n`,
    );
  }
}

async function performCacheDrop(
  options: MemoryEmergencyOptions,
  available: boolean,
): Promise<{
  leverAttempted: boolean;
  dropAttempted: boolean;
  outcome: string;
}> {
  if (!available && options.fallbackWhenUnavailable === false) {
    return {
      leverAttempted: false,
      dropAttempted: false,
      outcome: "unavailable",
    };
  }
  if (options.markDropAttempt?.() === false) {
    return {
      leverAttempted: false,
      dropAttempted: false,
      outcome: "rate-limit-state-unavailable",
    };
  }
  if (available) {
    const started = await options.startLever();
    if (started) {
      return { leverAttempted: true, dropAttempted: true, outcome: "started" };
    }
    process.stderr.write(
      `WARN ${DROP_CACHE_UNIT} start failed; using existing WSL-root cache drop fallback\n`,
    );
    const dropped = await options.fallbackDrop();
    return {
      leverAttempted: true,
      dropAttempted: true,
      outcome: dropped
        ? "start-failed-fallback"
        : "start-failed-fallback-failed",
    };
  }
  process.stderr.write(
    `INFO ${DROP_CACHE_UNIT} unavailable; using existing WSL-root cache drop fallback\n`,
  );
  const dropped = await options.fallbackDrop();
  return {
    leverAttempted: false,
    dropAttempted: true,
    outcome: dropped ? "unavailable-fallback" : "unavailable-fallback-failed",
  };
}

export async function recoverMemoryEmergency(
  options: MemoryEmergencyOptions,
): Promise<MemoryRecovery> {
  const available = await options.isLeverAvailable();
  let leverAttempted = false;
  let dropAttempted = false;
  let outcome: string = "rate-limited";
  const canAttempt = options.canAttemptDrop?.() ?? true;
  const emergencyOverride =
    !canAttempt &&
    options.stopOnFailure !== false &&
    memoryEmergency(options.before) &&
    (await (options.claimEmergencyOverride ?? claimEmergencyCacheDrop)());
  if (canAttempt || emergencyOverride) {
    const result = await performCacheDrop(options, available);
    leverAttempted = result.leverAttempted;
    dropAttempted = result.dropAttempted;
    outcome = result.outcome;
  }
  if (dropAttempted) await options.wait();
  const after = await options.measure();
  const afterBuffCacheMb = options.measureBuffCache?.() ?? null;
  const restored =
    options.isRestored !== undefined
      ? options.isRestored(after)
      : after !== null &&
        !(
          after.availableMb < options.thresholdMb &&
          after.pageReadsPerSecond > HARD_PAGE_READS_EMERGENCY_PER_SECOND
        );
  if (restored && dropAttempted) outcome = "restored";
  else if (outcome === "started") outcome = "no-effect";
  process.stdout.write(
    `MEM_RECLAIM lever=${leverAttempted ? DROP_CACHE_UNIT : "unavailable"} ` +
      `attempted=${dropAttempted} ` +
      `emergency_override=${emergencyOverride} override_limit=${EMERGENCY_CACHE_DROP_OVERRIDE_LIMIT} ` +
      `before_mb=${options.before.availableMb} after_mb=${after?.availableMb ?? "unknown"} ` +
      `delta_mb=${after === null ? "unknown" : after.availableMb - options.before.availableMb} ` +
      `before_buff_cache_mb=${options.beforeBuffCacheMb ?? "unknown"} ` +
      `after_buff_cache_mb=${afterBuffCacheMb ?? "unknown"} ` +
      `buff_cache_delta_mb=${afterBuffCacheMb === null || options.beforeBuffCacheMb === null || options.beforeBuffCacheMb === undefined ? "unknown" : afterBuffCacheMb - options.beforeBuffCacheMb} ` +
      `outcome=${outcome}\n`,
  );
  // Tool faults, unknown measurements, and exhausted override budgets never authorize STOP.
  const dropSucceeded =
    dropAttempted &&
    [
      "restored",
      "no-effect",
      "unavailable-fallback",
      "start-failed-fallback",
    ].includes(outcome);
  const stopped =
    !restored &&
    after !== null &&
    dropSucceeded &&
    options.stopOnFailure !== false;
  const recovery = {
    leverAttempted,
    dropAttempted,
    beforeMb: options.before.availableMb,
    afterMb: after?.availableMb ?? null,
    memoryAfter: after,
    beforeBuffCacheMb: options.beforeBuffCacheMb ?? null,
    afterBuffCacheMb,
    outcome,
    emergencyOverride,
    stopped,
  };
  if (stopped) await options.stopCompute(recovery);
  return recovery;
}

function guestBuffCacheMb(): number | null {
  const result = fromThrowable(() => readFileSync("/proc/meminfo", "utf8"))();
  if (result.isErr()) return null;
  const values = new Map(
    [
      ...result.value.matchAll(
        /^(Buffers|Cached|SReclaimable|Shmem):\s+(\d+) kB$/gmu,
      ),
    ].map((match) => [match[1], Number(match[2])]),
  );
  const names = ["Buffers", "Cached", "SReclaimable", "Shmem"];
  if (names.some((name) => !values.has(name))) return null;
  const total =
    (values.get("Buffers") ?? 0) +
    (values.get("Cached") ?? 0) +
    (values.get("SReclaimable") ?? 0) -
    (values.get("Shmem") ?? 0);
  return Math.max(0, Math.round(total / 1024));
}

async function dropCacheLeverAvailable(): Promise<boolean> {
  const result = await fromAsyncThrowable(() =>
    runBounded(["systemctl", "cat", DROP_CACHE_UNIT], 5_000),
  )();
  return result.isOk() && result.value.code === 0 && !result.value.timedOut;
}

async function startDropCacheLever(): Promise<boolean> {
  const result = await fromAsyncThrowable(() =>
    runBounded(["sudo", "-n", "systemctl", "start", DROP_CACHE_UNIT], 30_000),
  )();
  return result.isOk() && result.value.code === 0 && !result.value.timedOut;
}

export async function probeHostMemory({
  env = process.env,
  powershell = POWERSHELL,
  interopDirectory = "/run/WSL",
  timeoutMs = 10_000,
}: {
  env?: NodeJS.ProcessEnv;
  powershell?: string;
  interopDirectory?: string;
  timeoutMs?: number;
} = {}): Promise<HostMemory | null> {
  const measure = async (probeEnv: NodeJS.ProcessEnv) => {
    const result = await fromAsyncThrowable(() =>
      runBounded(
        [
          powershell,
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          encodedPowerShell(MEMORY_PROBE),
        ],
        timeoutMs,
        undefined,
        probeEnv,
      ),
    )();
    if (result.isErr() || result.value.code !== 0 || result.value.timedOut) {
      return null;
    }
    return parseHostMemory(result.value.output.replaceAll("\r", ""));
  };
  const direct = await measure(env);
  if (direct !== null || env.WSL_INTEROP !== undefined) return direct;

  // The user manager inherits no WSL_INTEROP: even an absolute Windows executable then
  // fails with "Invalid argument". Like wsl-audit's local PowerShell transport, borrow a
  // live session socket. Socket files can outlive their sessions, so try up to four,
  // newest first. Keep the caller's environment and never override an explicit socket.
  const names = await readdir(interopDirectory).catch((): string[] => []);
  const sockets = await Promise.all(
    names
      .filter((name) => /^\d+_interop$/u.test(name))
      .map(async (name) => {
        const path = join(interopDirectory, name);
        const info = await fileStat(path).catch(() => null);
        return { path, mtime: info?.mtimeMs ?? 0 };
      }),
  );
  for (const socket of sockets
    .toSorted((a, b) => b.mtime - a.mtime)
    .slice(0, 4)) {
    const memory = await measure({ ...env, WSL_INTEROP: socket.path });
    if (memory !== null) return memory;
  }
  return null;
}

async function dropPageCache(): Promise<boolean> {
  // Windows can invoke this distro as root without a standing passwordless sudo rule. `sync`
  // makes the following Linux page-cache drop safe for dirty data; only cache is discarded.
  const script = `
$ErrorActionPreference = 'Stop'
& wsl.exe -d ${WSL_DISTRO} -u root --exec /bin/sh -c 'sync; echo 1 > /proc/sys/vm/drop_caches'
exit $LASTEXITCODE
`;
  const result = await fromAsyncThrowable(() =>
    runBounded(
      [
        POWERSHELL,
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedPowerShell(script),
      ],
      30_000,
    ),
  )();
  if (result.isErr()) {
    process.stderr.write(
      `WARN page-cache drop failed: ${String(result.error)}\n`,
    );
    return false;
  }
  process.stdout.write(
    `MEM_RECLAIM exit=${result.value.code} timeout=${result.value.timedOut} ` +
      `detail=${JSON.stringify(result.value.output)}\n`,
  );
  return result.value.code === 0 && !result.value.timedOut;
}

export type StageRun = { code: number; timedOut: boolean; output: string };

// A stage that cannot start, times out, or exits non-zero is a failure the caller must surface:
// the unit runs every minute and systemd records only the exit status.
export async function runReclaimStages(options: {
  stages: ReclaimStage[];
  free: number;
  denyBytes: number;
  run: (stage: ReclaimStage) => Promise<StageRun>;
  measure: () => Result<number, Error>;
  log: (message: string) => void;
  warn: (message: string) => void;
}): Promise<Result<{ free: number; failures: string[] }, Error>> {
  let free = options.free;
  const failures: string[] = [];
  for (const stage of options.stages) {
    if (free >= options.denyBytes) break;
    const before = free;
    const result = await fromAsyncThrowable(() => options.run(stage))();
    const measured = options.measure();
    if (measured.isErr()) return err(measured.error);
    free = measured.value;
    if (result.isErr()) {
      failures.push(`${stage.name}: ${String(result.error)}`);
      options.warn(
        `WARN reclaim stage=${stage.name} failed: ${String(result.error)}\n`,
      );
      continue;
    }
    const line =
      `RECLAIM stage=${stage.name} exit=${result.value.code} timeout=${result.value.timedOut} ` +
      `host_delta=${gib(free - before)} detail=${JSON.stringify(result.value.output)}\n`;
    if (result.value.code !== 0 || result.value.timedOut) {
      failures.push(
        `${stage.name}: exit=${result.value.code} timeout=${result.value.timedOut}`,
      );
      options.warn(line);
    } else {
      options.log(line);
    }
  }
  return ok({ free, failures });
}

async function reclaim(
  policy: Policy,
): Promise<Result<{ free: number; failures: string[] }, Error>> {
  const initial = freeBytes(policy.path);
  if (initial.isErr()) return err(initial.error);
  markAttempt();
  return runReclaimStages({
    stages: reclaimStages(miseBinary()),
    free: initial.value,
    denyBytes: policy.denyBytes,
    // This unattended service may run while compute is active; disk-reclaim judges liveness.
    run: (stage) => runBounded(stage.argv, stage.timeoutMs),
    measure: () => freeBytes(policy.path),
    log: (message) => {
      process.stdout.write(message);
    },
    warn: (message) => {
      process.stderr.write(message);
    },
  });
}

export function startTicks(stat: string): string | null {
  const close = stat.lastIndexOf(")");
  if (close < 0) return null;
  // After ") ", the state field is #3; starttime is field #22, zero-based index 19.
  return (
    stat
      .slice(close + 2)
      .trim()
      .split(/\s+/u)[19] ?? null
  );
}

export function selectStopTargets(
  processes: ComputeProcess[],
  currentUid: number,
): StopTarget[] {
  const targets = new Map<string, StopTarget>();
  for (const p of processes) {
    if (p.uid !== currentUid || !COMPUTE_NAMES.has(p.comm)) continue;
    const unit = /\/app\.slice\/([^/]+\.(?:service|scope))(?:\/|$)/u.exec(
      p.cgroup,
    )?.[1];
    if (unit !== undefined && DEDICATED_UNIT.test(unit)) {
      targets.set(`unit:${unit}`, { kind: "unit", name: unit });
    } else {
      targets.set(`pid:${p.pid}`, {
        kind: "pid",
        pid: p.pid,
        startTicks: p.startTicks,
        comm: p.comm,
      });
    }
  }
  return [...targets.values()];
}

function readProcess(pid: number): ComputeProcess | null {
  const result = fromThrowable(() => {
    const root = `/proc/${pid}`;
    const comm = readFileSync(`${root}/comm`, "utf8").trim();
    if (!COMPUTE_NAMES.has(comm)) return null;
    const status = readFileSync(`${root}/status`, "utf8");
    const uid = Number(/^Uid:\s+(\d+)/mu.exec(status)?.[1]);
    const ticks = startTicks(readFileSync(`${root}/stat`, "utf8"));
    if (!Number.isInteger(uid) || ticks === null) return null;
    return {
      pid,
      uid,
      comm,
      startTicks: ticks,
      cgroup: readFileSync(`${root}/cgroup`, "utf8"),
    };
  })();
  return result.unwrapOr(null);
}

function liveTargets(): StopTarget[] {
  const processes = readdirSync("/proc")
    .filter((name) => /^\d+$/u.test(name))
    .map((name) => readProcess(Number(name)))
    .flatMap((p) => (p === null ? [] : [p]));
  return selectStopTargets(processes, process.getuid?.() ?? -1);
}

export function hasLiveBuildProcess(
  processes: ComputeProcess[],
  uid: number,
): boolean {
  return processes.some(
    (p) =>
      p.uid === uid &&
      (p.comm === "cargo" || p.comm === "rustc" || p.comm === "clippy-driver"),
  );
}

function buildStillRunning(): boolean {
  const processes = readdirSync("/proc")
    .filter((name) => /^\d+$/u.test(name))
    .map((name) => readProcess(Number(name)))
    .flatMap((p) => (p === null ? [] : [p]));
  return hasLiveBuildProcess(processes, process.getuid?.() ?? -1);
}

function sameProcess(target: Extract<StopTarget, { kind: "pid" }>): boolean {
  const current = readProcess(target.pid);
  return (
    current !== null &&
    current.startTicks === target.startTicks &&
    current.comm === target.comm
  );
}

export type CapacityDecisionContext = {
  reason: "memory-emergency" | "disk-emergency" | "capacity-hold";
  disk_free_bytes: number | null;
  disk_deny_bytes: number | null;
  disk_stop_bytes: number | null;
  memory: HostMemory | null;
  recovery: MemoryRecovery | null;
  recordPath?: string;
};

export function capacityDecisionPath(): string {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
    "dotfiles/capacity-decisions.jsonl",
  );
}

/** Flush the intent before acting: inability to record must never kill research. */
export async function recordCapacityDecision(
  decision: "STOP" | "HOLD",
  context: CapacityDecisionContext,
  target: StopTarget | null = null,
  signal: "TERM" | "KILL" | "unit-stop" | null = null,
): Promise<string> {
  const path = context.recordPath ?? capacityDecisionPath();
  let members: ComputeProcess[] = [];
  if (target?.kind === "unit") {
    members = (await readdir("/proc"))
      .filter((name) => /^\d+$/u.test(name))
      .map((name) => readProcess(Number(name)))
      .flatMap((member) =>
        member !== null &&
        member.cgroup.split("/").some((part) => part.trim() === target.name)
          ? [member]
          : [],
      );
  }
  const current =
    target?.kind === "pid" ? readProcess(target.pid) : (members[0] ?? null);
  const record = {
    schema: 1,
    time: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
    decision,
    reason: context.reason,
    measurements: {
      disk_free_bytes: context.disk_free_bytes,
      windows_available_mb: context.memory?.availableMb ?? null,
      page_reads_s: context.memory?.pageReadsPerSecond ?? null,
    },
    thresholds: {
      disk_deny_bytes: context.disk_deny_bytes,
      disk_stop_bytes: context.disk_stop_bytes,
      memory_available_mb: MEMORY_AVAILABLE_EMERGENCY_MB,
      page_reads_s: HARD_PAGE_READS_EMERGENCY_PER_SECOND,
    },
    lever: context.recovery ?? {
      outcome: "not-tried",
      dropAttempted: false,
      emergencyOverride: false,
    },
    emergency_override_limit: EMERGENCY_CACHE_DROP_OVERRIDE_LIMIT,
    target: {
      pid: target?.kind === "pid" ? target.pid : (current?.pid ?? null),
      comm: target?.kind === "pid" ? target.comm : (current?.comm ?? null),
      cgroup: current?.cgroup.trim() ?? null,
      scope: target?.kind === "unit" ? target.name : null,
      start_ticks: target?.kind === "pid" ? target.startTicks : null,
      members: members.map(({ pid, comm, cgroup, startTicks: ticks }) => ({
        pid,
        comm,
        cgroup: cgroup.trim(),
        start_ticks: ticks,
      })),
    },
    signal,
    phase: "decision-before-action",
  };
  await mkdir(dirname(path), { recursive: true });
  await using file = await open(path, "a", 0o600);
  await file.appendFile(`${JSON.stringify(record)}\n`);
  await file.sync();
  await using directory = await open(dirname(path), "r");
  await directory.sync();
  return path;
}

const UNKNOWN_DECISION_CONTEXT: CapacityDecisionContext = {
  reason: "disk-emergency",
  disk_free_bytes: null,
  disk_deny_bytes: null,
  disk_stop_bytes: null,
  memory: null,
  recovery: null,
};

async function stopTarget(
  target: StopTarget,
  raw: Extract<StopTarget, { kind: "pid" }>[],
  context: CapacityDecisionContext,
): Promise<void> {
  if (target.kind === "unit") {
    const recordPath = await recordCapacityDecision(
      "STOP",
      context,
      target,
      "unit-stop",
    );
    const stopped = await fromAsyncThrowable(() =>
      runBounded(["systemctl", "--user", "stop", target.name], 25_000),
    )();
    const active = await fromAsyncThrowable(() =>
      runBounded(["systemctl", "--user", "is-active", target.name], 5_000),
    )();
    process.stdout.write(
      `STOP unit=${target.name} record=${recordPath} exit=${stopped.isOk() ? stopped.value.code : "error"} ` +
        `inactive=${active.isOk() && active.value.code !== 0 && !active.value.timedOut}\n`,
    );
    return;
  }
  if (!sameProcess(target)) return;
  const recordPath = await recordCapacityDecision(
    "STOP",
    context,
    target,
    "TERM",
  );
  if (!sameProcess(target)) return;
  const result = fromThrowable(() => process.kill(target.pid, "SIGTERM"))();
  if (result.isOk()) {
    raw.push(target);
    process.stdout.write(
      `STOP pid=${target.pid} comm=${target.comm} signal=TERM record=${recordPath}\n`,
    );
    return;
  }
  process.stderr.write(
    `WARN pid=${target.pid} TERM failed: ${String(result.error)}\n`,
  );
}

export async function stopCompute(
  targets: StopTarget[],
  context: CapacityDecisionContext = UNKNOWN_DECISION_CONTEXT,
): Promise<void> {
  if (targets.length === 0) {
    process.stderr.write("NO_TARGET no recognized compute process to stop\n");
    return;
  }
  const raw: Extract<StopTarget, { kind: "pid" }>[] = [];
  for (const target of targets) {
    await stopTarget(target, raw, context);
  }
  if (raw.length > 0) await Bun.sleep(1_000);
  if (raw.some((target) => sameProcess(target))) await Bun.sleep(9_000);
  for (const target of raw) {
    if (!sameProcess(target)) continue;
    const recordPath = await recordCapacityDecision(
      "STOP",
      context,
      target,
      "KILL",
    );
    if (!sameProcess(target)) continue;
    const result = fromThrowable(() => process.kill(target.pid, "SIGKILL"))();
    if (result.isOk()) {
      process.stdout.write(
        `STOP pid=${target.pid} comm=${target.comm} signal=KILL record=${recordPath}\n`,
      );
    } else {
      process.stderr.write(
        `WARN pid=${target.pid} KILL failed: ${String(result.error)}\n`,
      );
    }
  }
}

async function emergencyBuildReclaim(
  policy: Policy,
): Promise<Result<number, Error>> {
  // This is a regenerable Cargo target, never research output. It is cleaned only after the
  // emergency stop, and only after every observed Cargo/rustc/clippy process has exited.
  const project = join(homedir(), "Workspace/polysearch-rs");
  if (!existsSync(join(project, "Cargo.toml"))) {
    process.stdout.write("BUILD_RECLAIM skip=project-absent\n");
    return freeBytes(policy.path);
  }
  if (buildStillRunning()) {
    process.stderr.write("BUILD_RECLAIM skip=build-still-running\n");
    return freeBytes(policy.path);
  }
  const mise = miseBinary();
  const beforeResult = freeBytes(policy.path);
  if (beforeResult.isErr()) return err(beforeResult.error);
  const before = beforeResult.value;
  const result = await fromAsyncThrowable(() =>
    runBounded([mise, "exec", "--", "cargo", "clean"], 300_000, project),
  )();
  const afterResult = freeBytes(policy.path);
  if (afterResult.isErr()) return err(afterResult.error);
  const after = afterResult.value;
  if (result.isErr() || result.value.code !== 0 || result.value.timedOut) {
    process.exitCode = 1;
  }
  process.stdout.write(
    `BUILD_RECLAIM exit=${result.isOk() ? result.value.code : "error"} ` +
      `host_delta=${gib(after - before)} ` +
      `detail=${JSON.stringify(result.isOk() ? result.value.output : String(result.error))}\n`,
  );
  return ok(after);
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "wsl-capacity-recover.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        dryRun: Boolean,
        config: { type: String, default: POLICY_PATH },
      },
      help: {
        description:
          "Check WSL host C: and memory once; reclaim safe caches and contain compute before exhaustion.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (cliError !== undefined) {
    process.stderr.write(`FATAL: ${cliError}\n`);
    process.exit(2);
  }
  if (parsed._.length > 0) {
    process.stderr.write(`FATAL: Unexpected argument '${parsed._[0]}'\n`);
    process.exit(2);
  }
  if (parsed.flags.config !== POLICY_PATH && parsed.flags.dryRun !== true) {
    process.stderr.write(
      "FATAL: --config override is permitted only with --dry-run\n",
    );
    process.exit(2);
  }
  const policyResult = loadRecoveryPolicy(parsed.flags.config);
  if (policyResult.isErr()) {
    process.stderr.write(`FATAL: ${String(policyResult.error)}\n`);
    process.exit(2);
  }
  const policy = policyResult.value;
  if (!process.platform.includes("linux") || !policy.path.startsWith("/mnt/")) {
    process.stderr.write("FATAL: WSL host path required\n");
    process.exit(2);
  }
  const thresholdResult = tmpfsThreshold(process.env.TMPFS_RECLAIM_PERCENT);
  if (thresholdResult.isErr()) {
    process.stderr.write(`FATAL: ${String(thresholdResult.error)}\n`);
    process.exit(2);
  }
  const expiry = await fromAsyncThrowable(() =>
    expireGraveyard(parsed.flags.dryRun === true, (stage) =>
      runBounded(
        stage.argv,
        stage.timeoutMs,
        undefined,
        undefined,
        parsed.flags.dryRun === true ? Number.POSITIVE_INFINITY : 1200,
      ),
    ),
  )();
  if (expiry.isErr()) {
    process.stderr.write(`GRAVEYARD failed: ${String(expiry.error)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `GRAVEYARD ${parsed.flags.dryRun === true ? "PLAN" : "EXPIRE"} exit=${expiry.value.code} timeout=${expiry.value.timedOut} detail=${JSON.stringify(expiry.value.output)}\n`,
    );
    if (expiry.value.code !== 0 || expiry.value.timedOut) process.exitCode = 1;
  }
  // A dry run previews only: no recovery verdict, tmpfs action, or cache-drop stamp.
  if (parsed.flags.dryRun === true) return;
  await recoverTmpfsCapacity({
    thresholdPercent: thresholdResult.value,
    measure: measureTmpfs,
    runTarget: runTmpfsTarget,
    log: (message) => {
      process.stdout.write(message);
    },
    warn: (message) => {
      process.stderr.write(message);
    },
  });
  const initialFree = freeBytes(policy.path);
  if (initialFree.isErr()) {
    process.stderr.write(`FATAL: ${String(initialFree.error)}\n`);
    process.exit(2);
  }
  let free = initialFree.value;
  const memoryBefore = await probeHostMemory();
  if (memoryBefore === null) {
    process.stderr.write("WARN Windows memory could not be measured\n");
  } else {
    process.stdout.write(
      `MEMORY windows_available_mb=${memoryBefore.availableMb} page_reads_s=${memoryBefore.pageReadsPerSecond}\n`,
    );
  }
  const memoryLow = memoryEmergency(memoryBefore);
  if (
    memoryBefore !== null &&
    memoryBefore.availableMb >= MEMORY_AVAILABLE_EMERGENCY_MB
  ) {
    await resetEmergencyCacheDrop();
  }
  const memoryAvailableLow =
    memoryBefore !== null &&
    memoryBefore.availableMb < MEMORY_AVAILABLE_EMERGENCY_MB;
  if (free >= policy.denyBytes && !memoryAvailableLow) {
    writeRecoveryVerdict(
      recoveryVerdictRecord(
        "OK",
        false,
        memoryBefore,
        Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
      ),
    );
    process.stdout.write(
      `${memoryBefore === null ? "DISK_CLEAR_MEMORY_UNKNOWN" : "CLEAR"} host_free=${gib(free)}\n`,
    );
    return;
  }
  writeRecoveryVerdict(
    recoveryVerdictRecord(
      "HOLD",
      memoryLow,
      memoryBefore,
      Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
    ),
  );
  const runReclaim = shouldReclaim(
    free,
    policy,
    readLastAttemptMs(),
    Temporal.Now.instant().epochMilliseconds,
  );
  const diskEmergency = free < policy.stopBytes;
  let memoryStillLow = memoryAvailableLow;
  let memoryLatest = memoryBefore;
  let memoryStopPerformed = false;
  let recovery: MemoryRecovery | null = null;
  const decisionContext = (
    reason: CapacityDecisionContext["reason"],
  ): CapacityDecisionContext => ({
    reason,
    disk_free_bytes: free,
    disk_deny_bytes: policy.denyBytes,
    disk_stop_bytes: policy.stopBytes,
    memory: memoryLatest,
    recovery,
  });
  await recordCapacityDecision("HOLD", decisionContext("capacity-hold"));
  if (memoryLow && memoryBefore !== null) {
    const memoryResult = await recoverMemoryEmergency({
      before: memoryBefore,
      beforeBuffCacheMb: guestBuffCacheMb(),
      thresholdMb: MEMORY_AVAILABLE_EMERGENCY_MB,
      isLeverAvailable: dropCacheLeverAvailable,
      startLever: startDropCacheLever,
      fallbackDrop: dropPageCache,
      wait: () => Bun.sleep(2_000),
      measure: probeHostMemory,
      measureBuffCache: guestBuffCacheMb,
      canAttemptDrop: cacheDropAllowed,
      claimEmergencyOverride: claimEmergencyCacheDrop,
      markDropAttempt: markCacheDropAttempt,
      stopCompute: async (result) => {
        recovery = result;
        memoryLatest = result.memoryAfter;
        memoryStopPerformed = true;
        await stopCompute(liveTargets(), decisionContext("memory-emergency"));
      },
    });
    recovery = memoryResult;
    memoryStillLow =
      memoryResult.afterMb === null ||
      memoryResult.afterMb < MEMORY_AVAILABLE_EMERGENCY_MB;
    memoryLatest = memoryResult.memoryAfter;
  } else if (memoryAvailableLow) {
    const holdMemoryResult = await recoverMemoryEmergency({
      before: memoryBefore,
      beforeBuffCacheMb: guestBuffCacheMb(),
      thresholdMb: MEMORY_AVAILABLE_EMERGENCY_MB,
      isLeverAvailable: dropCacheLeverAvailable,
      startLever: startDropCacheLever,
      fallbackDrop: dropPageCache,
      fallbackWhenUnavailable: false,
      wait: () => Bun.sleep(2_000),
      measure: probeHostMemory,
      measureBuffCache: guestBuffCacheMb,
      canAttemptDrop: cacheDropAllowed,
      markDropAttempt: markCacheDropAttempt,
      isRestored: (memory) =>
        memory !== null && memory.availableMb >= MEMORY_AVAILABLE_EMERGENCY_MB,
      stopOnFailure: false,
      stopCompute: () => Promise.resolve(),
    });
    memoryStillLow =
      holdMemoryResult.afterMb === null ||
      holdMemoryResult.afterMb < MEMORY_AVAILABLE_EMERGENCY_MB;
    memoryLatest = holdMemoryResult.memoryAfter;
    recovery = holdMemoryResult;
  }
  if (
    memoryLatest !== null &&
    memoryLatest.availableMb >= MEMORY_AVAILABLE_EMERGENCY_MB
  ) {
    await resetEmergencyCacheDrop();
  }
  if (diskEmergency) {
    // Stop the known writers before a potentially slow cache walk. Once C: is at this floor,
    // spending minutes scanning while they keep writing can exhaust Windows first.
    if (!memoryStopPerformed)
      await stopCompute(liveTargets(), decisionContext("disk-emergency"));
    const measured = freeBytes(policy.path);
    if (measured.isErr()) {
      process.stderr.write(`FATAL: ${String(measured.error)}\n`);
      process.exit(2);
    }
    free = measured.value;
  }
  if (runReclaim) {
    const reclaimed = await reclaim(policy);
    if (reclaimed.isErr()) {
      process.stderr.write(`FATAL: ${String(reclaimed.error)}\n`);
      process.exit(2);
    }
    free = reclaimed.value.free;
    if (reclaimed.value.failures.length > 0) {
      process.stderr.write(
        `FAILED_STAGES ${reclaimed.value.failures.join("; ")}\n`,
      );
      process.exitCode = 1;
    }
  }
  if (!diskEmergency && free < policy.stopBytes) {
    await stopCompute(liveTargets(), decisionContext("disk-emergency"));
    const measured = freeBytes(policy.path);
    if (measured.isErr()) {
      process.stderr.write(`FATAL: ${String(measured.error)}\n`);
      process.exit(2);
    }
    free = measured.value;
  }
  if (diskEmergency && free < policy.denyBytes) {
    const reclaimed = await emergencyBuildReclaim(policy);
    if (reclaimed.isErr()) {
      process.stderr.write(`FATAL: ${String(reclaimed.error)}\n`);
      process.exit(2);
    }
    free = reclaimed.value;
  }
  if (free < policy.stopBytes) {
    // A service may have restarted while cleanup ran. Repeat the containment check.
    await stopCompute(liveTargets(), decisionContext("disk-emergency"));
    const measured = freeBytes(policy.path);
    if (measured.isErr()) {
      process.stderr.write(`FATAL: ${String(measured.error)}\n`);
      process.exit(2);
    }
    free = measured.value;
  }
  if (free < policy.denyBytes || memoryStillLow) {
    const recordPath = await recordCapacityDecision(
      "HOLD",
      decisionContext("capacity-hold"),
    );
    writeRecoveryVerdict(
      recoveryVerdictRecord(
        "HOLD",
        memoryEmergency(memoryLatest),
        memoryLatest,
        Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
      ),
    );
    process.stdout.write(
      `HOLD disk_free=${gib(free)} deny_below=${gib(policy.denyBytes)} ` +
        `stop_below=${gib(policy.stopBytes)} memory_emergency=${memoryStillLow}; ` +
        `new compute must remain denied record=${recordPath}\n`,
    );
    process.exitCode = 1;
    return;
  }
  writeRecoveryVerdict(
    recoveryVerdictRecord(
      "OK",
      false,
      memoryLatest,
      Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
    ),
  );
  process.stdout.write(`RECOVERED host_free=${gib(free)}\n`);
}

if (import.meta.main) {
  const result = await fromAsyncThrowable(main)();
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${String(result.error)}\n`);
    process.exitCode = 2;
  }
}
