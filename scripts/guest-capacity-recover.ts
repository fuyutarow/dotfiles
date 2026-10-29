import { cli } from "cleye";
import { access, readdir, readFile, statfs } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  guestPressure,
  loadGuestDrive,
  measureTmpPercent,
  writeEpisode,
  guestRecoveryStateDir,
  type Drive,
  type GuestProbes,
  type PressureLevel,
  type StorageMeasurement,
} from "@dotfiles/shared/src/storage-headroom.ts";

// Consumer: guest-capacity-recover.service, queued by the storage-headroom hook below the recover
// line (and again below deny) and run by its timer between tool calls. It frees guest / and /tmp
// with no human and no agent permission: every deletion is a call to `disk-reclaim run <target>
// --yes`, which owns the safety checks, plus `cargo clean` in the workspaces the owner declared
// reclaimable. Stages run in a fixed fast-first order and the run stops as soon as the pressure
// is gone. Every action is a line on stdout, which the journal keeps.

const POLICY_PATH = join(
  import.meta.dir,
  "../agents/hooks/storage-headroom.toml",
);
// Fast first: tmpfs and the graveyard free space in seconds; caches and build dirs take longer.
export const DISK_RECLAIM_STAGES = [
  "tmpfs",
  "rip-expire",
  "clean",
  "builds",
] as const;
// Per-stage budgets, cheap first: one slow stage (builds walking huge node_modules took 300 s on
// 2026-10-15) is cut off and reported, and the next stage still runs.
export const STAGE_TIMEOUT_MS: Record<
  (typeof DISK_RECLAIM_STAGES)[number],
  number
> = {
  tmpfs: 60_000,
  "rip-expire": 120_000,
  clean: 120_000,
  builds: 180_000,
};
const CARGO_CLEAN_TIMEOUT_MS = 5 * 60 * 1000;
const BUILD_PROCESS_NAMES = new Set(["cargo", "rustc", "clippy-driver"]);

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option '--__proto__'\n");
    process.exit(2);
  }
}

export type RunResult = { code: number; output: string; timedOut?: boolean };
export type RunCommand = (
  cmd: string[],
  options: { cwd?: string; timeoutMs: number },
) => Promise<RunResult>;

export type Deps = GuestProbes & {
  run: RunCommand;
  buildRunning: () => boolean | Promise<boolean>;
  exists: (path: string) => boolean | Promise<boolean>;
  log: (line: string) => void;
};

export type Outcome = {
  /** Pressure at the end of the run. */
  level: PressureLevel;
  /** Stage labels that ran, in order. */
  ran: string[];
  /** Stages that exited non-zero or timed out; the run is then a failure for systemd. */
  failed: string[];
  /** Free bytes gained on guest / over the run. */
  reclaimed: number;
};

/** Exit status: 0 only when pressure is gone and no stage failed; 1 is a failed or fruitless run. */
export function exitCode(outcome: Outcome): number {
  if (outcome.level === "ok" && outcome.failed.length === 0) return 0;
  return 1;
}

export function expandHome(path: string, home = homedir()): string {
  return path === "~" || path.startsWith("~/")
    ? join(home, path.slice(1))
    : path;
}

/** True when a cargo/rustc/clippy-driver process exists (reads /proc comm; Linux only). */
export async function hasBuildProcess(procRoot = "/proc"): Promise<boolean> {
  const entries = await readdir(procRoot).then(
    (value) => value,
    () => [],
  );
  for (const entry of entries) {
    if (!/^\d+$/u.test(entry)) continue;
    const isBuildProcess = await readFile(
      join(procRoot, entry, "comm"),
      "utf8",
    ).then(
      (comm) => BUILD_PROCESS_NAMES.has(comm.trim()),
      () => false,
    );
    if (isBuildProcess) return true;
  }
  return false;
}

const runCommand: RunCommand = async (cmd, { cwd, timeoutMs }) => {
  const proc = Bun.spawn(cmd, {
    ...(cwd === undefined ? {} : { cwd }),
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    code,
    output: `${out}${err}`.trim().slice(-400),
    timedOut: proc.signalCode !== null,
  };
};

function freeGiB(path: string): Promise<string> {
  return statfs(path).then(
    (s) => `${((s.bavail * s.bsize) / 1024 ** 3).toFixed(1)}GiB`,
    () => "?",
  );
}

function cargoCleanCommand(): string[] {
  const mise = Bun.which("mise");
  return mise === null
    ? ["cargo", "clean"]
    : [mise, "exec", "--", "cargo", "clean"];
}

/** Uncached free bytes of the guest drive (the hook's 2 s cache must not hide a gain). */
function statfsMeasure(path: string): Promise<StorageMeasurement | null> {
  return statfs(path).then(
    (s) => ({ free: s.bavail * s.bsize, total: s.blocks * s.bsize }),
    () => null,
  );
}

function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/**
 * Reclaim until the pressure is gone. With `dryRun` nothing is removed: each disk-reclaim stage is
 * only planned (`disk-reclaim plan`, read-only) and each cargo workspace is only reported. A stage
 * that fails or times out is journaled, recorded in `failed`, and the next stage still runs.
 */
export async function recover(
  guest: Drive,
  deps: Deps,
  dryRun: boolean,
): Promise<Outcome> {
  const ran: string[] = [];
  const failed: string[] = [];
  const probes: GuestProbes = {
    measure: (path) =>
      deps.measure === undefined ? statfsMeasure(path) : deps.measure(path),
    tmpUse: () =>
      deps.tmpUse === undefined ? measureTmpPercent() : deps.tmpUse(),
  };
  const pressure = (): Promise<PressureLevel> => guestPressure(guest, probes);
  const freeNow = async (): Promise<number> =>
    (await probes.measure?.(guest.path))?.free ?? 0;
  const startFree = await freeNow();
  const finish = async (): Promise<Outcome> => ({
    level: await pressure(),
    ran,
    failed,
    reclaimed: (await freeNow()) - startFree,
  });
  const proceed = async (): Promise<boolean> => {
    if (dryRun) return true;
    const level = await pressure();
    if (level === "ok") deps.log("STOP pressure gone (above recover line)");
    return level !== "ok";
  };
  const report = async (
    kind: string,
    label: string,
    result: RunResult,
    before: number,
  ): Promise<void> => {
    const bad = result.code !== 0 || result.timedOut === true;
    if (bad && !dryRun) failed.push(label);
    const reclaimed = (await freeNow()) - before;
    deps.log(
      `${kind} ${label} exit=${result.code}${result.timedOut === true ? " TIMEOUT" : ""} free_delta=${(reclaimed / 1024 ** 3).toFixed(2)}GiB` +
        (dryRun
          ? ` records=${result.output.split("\n").filter(Boolean).length}`
          : "") +
        (bad ? ` detail=${JSON.stringify(result.output)}` : ""),
    );
  };
  const initial = await pressure();
  deps.log(
    `START level=${initial} dry_run=${dryRun} free_root=${await freeGiB(guest.path)}`,
  );
  if (initial === "ok" && !dryRun) return finish();

  for (const stage of DISK_RECLAIM_STAGES) {
    if (!(await proceed())) return finish();
    const before = await freeNow();
    const cmd = dryRun
      ? ["disk-reclaim", "plan", stage]
      : ["disk-reclaim", "run", stage, "--yes"];
    const result = await deps.run(cmd, { timeoutMs: STAGE_TIMEOUT_MS[stage] });
    ran.push(stage);
    await report(dryRun ? "PLAN" : "STAGE", stage, result, before);
  }

  for (const declared of guest.reclaim_cargo_targets ?? []) {
    if (!(await proceed())) return finish();
    const dir = expandHome(declared);
    const label = `cargo-clean ${dir}`;
    // Declared paths are checked at run time: a workspace that moved or was removed is skipped.
    if (!(await deps.exists(join(dir, "Cargo.toml")))) {
      deps.log(`SKIP ${label} reason=no-Cargo.toml`);
      continue;
    }
    if (await deps.buildRunning()) {
      deps.log(`SKIP ${label} reason=build-running`);
      continue;
    }
    if (dryRun) {
      deps.log(`WOULD ${label}`);
      ran.push(label);
      continue;
    }
    const before = await freeNow();
    const result = await deps.run(cargoCleanCommand(), {
      cwd: dir,
      timeoutMs: CARGO_CLEAN_TIMEOUT_MS,
    });
    ran.push(label);
    await report("STAGE", label, result, before);
  }
  const outcome = await finish();
  deps.log(
    `END level=${outcome.level} ran=${ran.length} failed=${failed.length} reclaimed=${outcome.reclaimed}`,
  );
  return outcome;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "guest-capacity-recover.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        dryRun: Boolean,
        config: { type: String, default: POLICY_PATH },
      },
      help: {
        description:
          "Free guest / and /tmp in a fixed fast-first order until the pressure is gone; --dry-run lists what it would reclaim and removes nothing.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    process.stderr.write(`FATAL: Unexpected argument '${parsed._[0]}'\n`);
    process.exit(2);
  }
  const guest = loadGuestDrive(parsed.flags.config);
  if (guest === null) {
    process.stderr.write(
      `FATAL: no valid [drive.guest] in ${parsed.flags.config}\n`,
    );
    process.exit(2);
  }
  const outcome = await recover(
    guest,
    {
      run: runCommand,
      buildRunning: hasBuildProcess,
      exists: pathExists,
      log: (line) => {
        process.stdout.write(`${line}\n`);
      },
    },
    parsed.flags.dryRun === true,
  );
  if (parsed.flags.dryRun === true) return;
  // A quiet drive ends the episode so the next pressure queues the unit again.
  if (outcome.level === "ok") await writeEpisode(guestRecoveryStateDir(), null);
  // Non-zero (1) when a stage failed or timed out, or the drive is still under pressure: systemd
  // records it (recover-health turns that into a signal). FATAL (2) is a controller failure.
  process.exit(exitCode(outcome));
}

if (import.meta.main) await main();
