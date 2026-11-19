// `mise run test:scripts` — the repo's own script and tool tests, one `bun test` process per unit,
// several units at a time.
//
// WHY: `bun test scripts/tests tools/*/tests` runs about 100 files one after another in ONE process.
// The tests mostly wait on processes they spawn (12% of one core), so that run took longer than 25
// minutes. The same work split into 110 units and run 8 at a time took 817 s.
//
// UNITS come from the tree, never from a list written here:
//   scripts/tests/<name>.test.ts      one unit per file
//   scripts/tests/<dir>/…             one unit per sub-directory that holds a *.test.ts
//   tools/<name>/tests/…              one unit per tool
// Every unit is `bun test ./<path>` with TZ=UTC in its own process. lint:test-reach asks
// `unitsOf` the same question, so a test file outside every unit fails that gate.
//
// BOUNDS: at most --jobs child processes at once (1..64, default half the cores, at least 2); each
// unit has a time limit (--timeout, default 900 s) that kills it and is reported as a FAIL naming
// the unit; a unit's output is kept to its last 64 KiB; output still open after the unit's exit is
// abandoned after 2 s so a grandchild holding a pipe cannot hang the runner.
//
// EXIT: 0 every selected unit passed · 1 a unit failed or timed out · 2 usage error (bad flag or
// value, a selector that matches no unit, no unit found).
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { cli } from "cleye";

export const TEST_GLOBS = [
  "scripts/tests/**/*.test.ts",
  "tools/*/tests/**/*.test.ts",
] as const;

const DEFAULT_TIMEOUT_S = 900;
const MAX_JOBS = 64;
const OUTPUT_TAIL_CHARS = 65_536;
const OUTPUT_TAIL_LINES = 200;
const DRAIN_GRACE_MS = 2000;
const SLOWEST = 5;

export type Outcome = {
  unit: string;
  status: "pass" | "fail" | "timeout";
  exit: number | null;
  seconds: number;
  output: string;
};

/** The units that cover `files` (repo-relative `*.test.ts` paths), sorted, each once. */
export function unitsOf(files: string[]): string[] {
  const units = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    if (parts.includes("node_modules") || !file.endsWith(".test.ts")) continue;
    // scripts/tests/a.test.ts is its own unit; scripts/tests/dir/b.test.ts joins scripts/tests/dir.
    if (file.startsWith("scripts/tests/"))
      units.add(parts.slice(0, 3).join("/"));
    else if (parts[0] === "tools" && parts[2] === "tests" && parts.length > 3)
      units.add(parts.slice(0, 3).join("/"));
  }
  return [...units].toSorted();
}

export async function discover(root: string): Promise<string[]> {
  const found = await Promise.all(
    TEST_GLOBS.map((pattern) =>
      Array.fromAsync(
        new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true }),
      ),
    ),
  );
  return unitsOf(found.flat());
}

const normalize = (selector: string): string =>
  selector.replace(/^\.\//u, "").replace(/\/+$/u, "");

/** Units whose path starts with any selector; every selector must match something. */
export function selectUnits(
  units: string[],
  selectors: string[],
): { ok: true; units: string[] } | { ok: false; message: string } {
  if (selectors.length === 0) return { ok: true, units };
  const wanted = selectors.map((selector) => normalize(selector));
  const unmatched = wanted.filter(
    (selector) => !units.some((unit) => unit.startsWith(selector)),
  );
  if (unmatched.length > 0)
    return {
      ok: false,
      message: `no unit starts with ${unmatched.map((selector) => `'${selector}'`).join(", ")} (see --list)`,
    };
  return {
    ok: true,
    units: units.filter((unit) =>
      wanted.some((selector) => unit.startsWith(selector)),
    ),
  };
}

export function defaultJobs(cores = availableParallelism()): number {
  return Math.max(2, Math.floor(cores / 2));
}

type Tail = { done: Promise<void>; text: () => string; stop: () => void };

// Keeps only the last OUTPUT_TAIL_CHARS of a stream, so a noisy unit cannot grow the runner.
function tail(stream: ReadableStream<Uint8Array>): Tail {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const keep = (value: Uint8Array | undefined) => {
    text = (text + decoder.decode(value, { stream: true })).slice(
      -OUTPUT_TAIL_CHARS,
    );
  };
  const pump = async (): Promise<void> => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      keep(chunk.value);
    }
  };
  // A cancelled or broken stream ends the read: the tail read so far is what we keep.
  const done = pump().catch((): void => {});
  return {
    done,
    text: () => text,
    stop: () => void reader.cancel().catch(() => null),
  };
}

const running = new Set<Bun.Subprocess>();

// The time limit decides first: a killed unit's exit code is the kill, not the test's verdict.
function statusOf(timedOut: boolean, exit: number): Outcome["status"] {
  if (timedOut) return "timeout";
  return exit === 0 ? "pass" : "fail";
}

export type RunOptions = { root: string; timeoutMs: number };

/** One unit in its own `bun test` process, bounded by a time limit. Never throws, never hangs. */
export async function runUnit(
  unit: string,
  { root, timeoutMs }: RunOptions,
): Promise<Outcome> {
  const started = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn([process.execPath, "test", `./${unit}`], {
    cwd: root,
    env: { ...process.env, TZ: "UTC" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });
  running.add(child);
  const out = tail(child.stdout);
  const err = tail(child.stderr);
  const exit = await child.exited;
  running.delete(child);
  await Promise.race([
    Promise.all([out.done, err.done]),
    Bun.sleep(DRAIN_GRACE_MS),
  ]);
  out.stop();
  err.stop();
  const timedOut = signal.aborted;
  return {
    unit,
    status: statusOf(timedOut, exit),
    exit: timedOut ? null : exit,
    seconds: (performance.now() - started) / 1000,
    output: `${out.text()}${err.text()}`,
  };
}

/** Runs `units` with at most `jobs` at once; `onDone` sees each outcome as it finishes. */
export async function runAll(
  units: string[],
  jobs: number,
  options: RunOptions,
  onDone: (outcome: Outcome) => void,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const unit = units[next++];
      if (unit === undefined) return;
      const outcome = await runUnit(unit, options);
      outcomes.push(outcome);
      onDone(outcome);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(jobs, units.length) }, () => worker()),
  );
  return outcomes;
}

const label = (outcome: Outcome): string =>
  outcome.status === "pass" ? "PASS" : "FAIL";

export function unitLine(outcome: Outcome): string {
  return `${label(outcome)} ${outcome.seconds.toFixed(1)}s ${outcome.unit}`;
}

export function failureText(outcome: Outcome, timeoutMs: number): string {
  const lines = outcome.output.trimEnd().split("\n").slice(-OUTPUT_TAIL_LINES);
  const reason =
    outcome.status === "timeout"
      ? `timed out after ${timeoutMs / 1000}s and killed`
      : `exit ${outcome.exit}`;
  return [`  ${outcome.unit}: ${reason}`, ...lines.map((line) => `  | ${line}`)]
    .join("\n")
    .concat("\n");
}

export function summary(
  outcomes: Outcome[],
  wallSeconds: number,
): { lines: string[]; failed: number } {
  const failed = outcomes.filter((outcome) => outcome.status !== "pass");
  const summed = outcomes.reduce((sum, outcome) => sum + outcome.seconds, 0);
  const slowest = outcomes
    .toSorted((a, b) => b.seconds - a.seconds)
    .slice(0, SLOWEST)
    .map((outcome) => `  ${outcome.seconds.toFixed(1)}s ${outcome.unit}`);
  return {
    failed: failed.length,
    lines: [
      `slowest ${slowest.length}:`,
      ...slowest,
      ...(failed.length > 0
        ? [
            "failed:",
            ...failed
              .map((outcome) => outcome.unit)
              .toSorted()
              .map((unit) => `  ${unit}`),
          ]
        : []),
      `${outcomes.length} units: ${outcomes.length - failed.length} passed, ${failed.length} failed; ${wallSeconds.toFixed(1)}s wall, ${summed.toFixed(1)}s summed`,
    ],
  };
}

function usage(message: string): number {
  process.stderr.write(`test-units: ${message}\n`);
  return 2;
}

// Every unknown option (`--__proto__` included) is a usage error, exit 2 — not Cleye's exit 1,
// which here would read as "a unit failed".
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag") {
    process.stderr.write(`test-units: unknown option '${flag}'\n`);
    process.exit(2);
  }
}

function killRunning(): void {
  for (const child of running) child.kill("SIGKILL");
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "test-units.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[units...]"],
      flags: {
        jobs: {
          type: Number,
          alias: "j",
          description: `units run at once, 1..${MAX_JOBS} (default: half the cores, at least 2)`,
        },
        timeout: {
          type: Number,
          alias: "t",
          default: DEFAULT_TIMEOUT_S,
          description: "seconds one unit may run before it is killed and fails",
        },
        root: {
          type: String,
          description:
            "directory whose scripts/tests and tools/*/tests are run (default: this repository)",
        },
        list: {
          type: Boolean,
          default: false,
          description: "print the selected units and exit",
        },
      },
      help: {
        description:
          "Run the repo's script and tool tests as parallel units. A unit is one scripts/tests/*.test.ts file, one scripts/tests sub-directory or one tools/<name>/tests directory. Positional arguments select units by path prefix, e.g. tools/smart-copy or scripts/tests/land.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  const jobs = parsed.flags.jobs ?? defaultJobs();
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > MAX_JOBS)
    return usage(`--jobs must be an integer from 1 to ${MAX_JOBS}`);
  const timeout = parsed.flags.timeout;
  if (!Number.isFinite(timeout) || timeout <= 0)
    return usage("--timeout must be a positive number of seconds");
  const root = resolve(parsed.flags.root ?? resolve(import.meta.dir, ".."));
  const units = await discover(root);
  if (units.length === 0)
    return usage(`no unit found under ${TEST_GLOBS.join(", ")}`);
  const selected = selectUnits(units, parsed._.units);
  if (!selected.ok) return usage(selected.message);
  if (parsed.flags.list) {
    process.stdout.write(selected.units.map((unit) => `${unit}\n`).join(""));
    return 0;
  }
  const timeoutMs = timeout * 1000;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      killRunning();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  process.stdout.write(
    `test-units: ${selected.units.length} units, ${Math.min(jobs, selected.units.length)} at a time, ${timeout}s limit each\n`,
  );
  const started = performance.now();
  const outcomes = await runAll(
    selected.units,
    jobs,
    { root, timeoutMs },
    (outcome) => {
      process.stdout.write(`${unitLine(outcome)}\n`);
      if (outcome.status !== "pass")
        process.stdout.write(failureText(outcome, timeoutMs));
    },
  );
  const result = summary(outcomes, (performance.now() - started) / 1000);
  process.stdout.write(`${result.lines.join("\n")}\n`);
  return result.failed > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
