import { cli } from "cleye";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import { z } from "../agents/hooks/zod.ts";

// Consumer: a user-systemd timer and the Claude storage hook. One short run checks the Windows
// drive and host RAM under WSL, reclaims only the repository's unattended-safe tiers, and stops
// compute work at an emergency floor. The hook starts the unit asynchronously; it never does GC.
// Research outputs and the human-only reclaim:purge task are outside this controller.

const GiB = 1024 ** 3;
const REGULAR_RECLAIM_COOLDOWN_MS = 60 * 60 * 1000;
const EMERGENCY_RECLAIM_COOLDOWN_MS = 5 * 60 * 1000;
const POLICY_PATH = join(
  import.meta.dir,
  "../agents/claude/hooks/storage-headroom.toml",
);
const STAMP_PATH = join(
  homedir(),
  ".local/state/wsl-capacity-recover/last-attempt",
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
const HARD_PAGE_READS_EMERGENCY_PER_SECOND = 500;
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

const JsonRecord = z.record(z.string(), z.unknown());

// A plain table as a string-keyed record; undefined for anything else.
function record(value: unknown): Record<string, unknown> | undefined {
  const parsed = JsonRecord.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function policyFromToml(path: string): Result<Policy, Error> {
  const decoded = fromThrowable((): unknown =>
    Bun.TOML.parse(readFileSync(path, "utf8")),
  )();
  if (decoded.isErr()) return err(new Error(String(decoded.error)));
  const parsed = decoded.value;
  const host = record(record(record(parsed)?.drive)?.host);
  if (host === undefined) {
    return err(new Error(`missing drive.host in ${path}`));
  }
  if (
    typeof host.path !== "string" ||
    typeof host.deny_gib !== "number" ||
    typeof host.stop_gib !== "number" ||
    !Number.isFinite(host.deny_gib) ||
    !Number.isFinite(host.stop_gib) ||
    host.stop_gib <= 0 ||
    host.deny_gib <= host.stop_gib
  ) {
    return err(
      new Error(`drive.host needs path and 0 < stop_gib < deny_gib in ${path}`),
    );
  }
  return ok({
    path: host.path,
    denyBytes: host.deny_gib * GiB,
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

async function runBounded(
  argv: string[],
  timeoutMs: number,
  cwd = join(import.meta.dir, ".."),
  env?: NodeJS.ProcessEnv,
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
    output: `${stdout}\n${stderr}`.trim().slice(-1200),
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

async function probeHostMemory(): Promise<HostMemory | null> {
  const result = await fromAsyncThrowable(() =>
    runBounded(
      [
        POWERSHELL,
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedPowerShell(MEMORY_PROBE),
      ],
      10_000,
    ),
  )();
  if (result.isErr() || result.value.code !== 0 || result.value.timedOut) {
    return null;
  }
  return parseHostMemory(result.value.output.replaceAll("\r", ""));
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

async function reclaim(policy: Policy): Promise<Result<number, Error>> {
  const mise = Bun.which("mise") ?? "/home/linuxbrew/.linuxbrew/bin/mise";
  const steps: [string, ...string[]][] = [
    ["reclaim:host", "--", "--execute"],
    ["reclaim:builds"],
    ["reclaim:clean"],
  ];
  const initial = freeBytes(policy.path);
  if (initial.isErr()) return err(initial.error);
  let free = initial.value;
  markAttempt();
  for (const [task, ...args] of steps) {
    if (free >= policy.denyBytes) break;
    const before = free;
    // This unattended service may run while compute is active; retain the previous age grace.
    const env =
      task === "reclaim:builds"
        ? { ...process.env, KONDO_OLDER: "30d" }
        : undefined;
    const result = await fromAsyncThrowable(() =>
      runBounded(
        [mise, "run", task, ...args],
        task === "reclaim:builds" ? 180_000 : 120_000,
        undefined,
        env,
      ),
    )();
    const measured = freeBytes(policy.path);
    if (measured.isErr()) return err(measured.error);
    free = measured.value;
    if (result.isOk()) {
      process.stdout.write(
        `RECLAIM task=${task} exit=${result.value.code} timeout=${result.value.timedOut} ` +
          `host_delta=${gib(free - before)} detail=${JSON.stringify(result.value.output)}\n`,
      );
    } else {
      process.stderr.write(
        `WARN reclaim task=${task} failed: ${String(result.error)}\n`,
      );
    }
  }
  return ok(free);
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

async function stopTarget(
  target: StopTarget,
  raw: Extract<StopTarget, { kind: "pid" }>[],
): Promise<void> {
  if (target.kind === "unit") {
    const stopped = await fromAsyncThrowable(() =>
      runBounded(["systemctl", "--user", "stop", target.name], 25_000),
    )();
    const active = await fromAsyncThrowable(() =>
      runBounded(["systemctl", "--user", "is-active", target.name], 5_000),
    )();
    process.stdout.write(
      `STOP unit=${target.name} exit=${stopped.isOk() ? stopped.value.code : "error"} ` +
        `inactive=${active.isOk() && active.value.code !== 0 && !active.value.timedOut}\n`,
    );
    return;
  }
  if (!sameProcess(target)) return;
  const result = fromThrowable(() => process.kill(target.pid, "SIGTERM"))();
  if (result.isOk()) {
    raw.push(target);
    process.stdout.write(
      `STOP pid=${target.pid} comm=${target.comm} signal=TERM\n`,
    );
    return;
  }
  process.stderr.write(
    `WARN pid=${target.pid} TERM failed: ${String(result.error)}\n`,
  );
}

export async function stopCompute(targets: StopTarget[]): Promise<void> {
  if (targets.length === 0) {
    process.stderr.write("NO_TARGET no recognized compute process to stop\n");
    return;
  }
  const raw: Extract<StopTarget, { kind: "pid" }>[] = [];
  for (const target of targets) {
    await stopTarget(target, raw);
  }
  if (raw.length > 0) await Bun.sleep(1_000);
  if (raw.some((target) => sameProcess(target))) await Bun.sleep(9_000);
  for (const target of raw) {
    if (!sameProcess(target)) continue;
    const result = fromThrowable(() => process.kill(target.pid, "SIGKILL"))();
    if (result.isOk()) {
      process.stdout.write(
        `STOP pid=${target.pid} comm=${target.comm} signal=KILL\n`,
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
  const mise = Bun.which("mise") ?? "/home/linuxbrew/.linuxbrew/bin/mise";
  const beforeResult = freeBytes(policy.path);
  if (beforeResult.isErr()) return err(beforeResult.error);
  const before = beforeResult.value;
  const result = await fromAsyncThrowable(() =>
    runBounded([mise, "exec", "--", "cargo", "clean"], 300_000, project),
  )();
  const afterResult = freeBytes(policy.path);
  if (afterResult.isErr()) return err(afterResult.error);
  const after = afterResult.value;
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
  const policyResult = policyFromToml(parsed.flags.config);
  if (policyResult.isErr()) {
    process.stderr.write(`FATAL: ${String(policyResult.error)}\n`);
    process.exit(2);
  }
  const policy = policyResult.value;
  if (!process.platform.includes("linux") || !policy.path.startsWith("/mnt/")) {
    process.stderr.write("FATAL: WSL host path required\n");
    process.exit(2);
  }
  const initialFree = freeBytes(policy.path);
  if (initialFree.isErr()) {
    process.stderr.write(`FATAL: ${String(initialFree.error)}\n`);
    process.exit(2);
  }
  let free = initialFree.value;
  const memoryBefore = await probeHostMemory();
  if (memoryBefore === null) {
    process.stderr.write("WARN Windows memory could not be measured\n");
  }
  const memoryLow = memoryEmergency(memoryBefore);
  if (free >= policy.denyBytes && !memoryLow) {
    process.stdout.write(
      `${memoryBefore === null ? "DISK_CLEAR_MEMORY_UNKNOWN" : "CLEAR"} host_free=${gib(free)}\n`,
    );
    return;
  }
  const runReclaim = shouldReclaim(
    free,
    policy,
    readLastAttemptMs(),
    Temporal.Now.instant().epochMilliseconds,
  );
  const targets = free < policy.stopBytes || memoryLow ? liveTargets() : [];
  if (parsed.flags.dryRun === true) {
    process.stdout.write(
      `DRY_RUN host_free=${gib(free)} reclaim=${runReclaim} ` +
        `memory=${JSON.stringify(memoryBefore)} memory_emergency=${memoryLow} ` +
        `stop=${free < policy.stopBytes || memoryLow} ` +
        `build_reclaim=${free < policy.stopBytes && existsSync(join(homedir(), "Workspace/polysearch-rs/Cargo.toml"))} ` +
        `targets=${JSON.stringify(targets)}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const diskEmergency = free < policy.stopBytes;
  if (diskEmergency) {
    // Stop the known writers before a potentially slow cache walk. Once C: is at this floor,
    // spending minutes scanning while they keep writing can exhaust Windows first.
    await stopCompute(liveTargets());
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
    free = reclaimed.value;
  }
  let memoryStillLow = memoryLow;
  if (memoryLow) {
    await dropPageCache();
    await Bun.sleep(2_000);
    const memoryAfter = await probeHostMemory();
    memoryStillLow = memoryAfter === null || memoryEmergency(memoryAfter);
    process.stdout.write(
      `MEM_CHECK before=${JSON.stringify(memoryBefore)} after=${JSON.stringify(memoryAfter)} ` +
        `still_low=${memoryStillLow}\n`,
    );
  }
  if (memoryStillLow || (!diskEmergency && free < policy.stopBytes)) {
    await stopCompute(liveTargets());
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
    await stopCompute(liveTargets());
    const measured = freeBytes(policy.path);
    if (measured.isErr()) {
      process.stderr.write(`FATAL: ${String(measured.error)}\n`);
      process.exit(2);
    }
    free = measured.value;
  }
  if (free < policy.denyBytes || memoryStillLow) {
    process.stdout.write(
      `HOLD host_free=${gib(free)} deny_below=${gib(policy.denyBytes)} ` +
        `stop_below=${gib(policy.stopBytes)} memory_emergency=${memoryStillLow}; ` +
        `new compute must remain denied\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`RECOVERED host_free=${gib(free)}\n`);
}

if (import.meta.main) {
  const result = await fromAsyncThrowable(main)();
  if (result.isErr()) {
    process.stderr.write(`FATAL: ${String(result.error)}\n`);
    process.exitCode = 2;
  }
}
