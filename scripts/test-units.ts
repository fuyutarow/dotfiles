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
// CHANGED: `--changed [--base <revset>]` (default base `alpha`) runs only the units that own a
// file that differs from the base, working copy included. The paths come from `jj diff --from
// <base>`; `ownedUnits` maps them to units:
//   tools/shared/…               every unit (it is imported everywhere)
//   tools/<name>/…               tools/<name>/tests
//   scripts/tests/<x>.test.ts    itself (scripts/tests/<dir>/… its directory unit)
//   scripts/<x>.ts               every scripts/tests unit whose name starts with <x>
//   anything else                no unit
// No owning unit prints "no test unit owns the changed files" and exits 0.
//
// KNOWN-RED: lint/test-known-red.toml lists units that are red today, each with a date and reason.
// A listed unit that fails prints `KNOWN-RED <s>s <unit>` and does not fail the run; a listed unit
// that passes fails the run until its line is removed. `--strict` ignores the list.
//
// EXIT: 0 every selected unit passed or is known-red · 1 a unit failed or timed out, or a
// known-red unit passed · 2 usage error (bad flag or value, a selector that matches no unit, no
// unit found, an unreadable or wrong known-red list, a failed `jj diff`).
import { availableParallelism } from "node:os";
import { basename, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable, z } from "../tools/shared/src/zod.ts";

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

const SHARED_PREFIX = "tools/shared/";

// The units a single changed path belongs to. `units` is the discovered list, so a path whose
// would-be unit does not exist selects nothing.
function ownersOf(file: string, units: string[]): string[] {
  if (file.startsWith(SHARED_PREFIX)) return units;
  const parts = file.split("/");
  const [top, second] = parts;
  if (top === "tools" && parts.length >= 3)
    return units.filter((unit) => unit === `tools/${second}/tests`);
  if (top === "scripts" && second === "tests" && parts.length >= 3)
    return units.filter((unit) => unit === parts.slice(0, 3).join("/"));
  if (top === "scripts" && parts.length === 2 && file.endsWith(".ts")) {
    const stem = basename(file, ".ts");
    return units.filter(
      (unit) =>
        unit.startsWith("scripts/tests/") && basename(unit).startsWith(stem),
    );
  }
  return [];
}

/** The units that own `changed` (repo-relative paths), in the order of `units`, each once. */
export function ownedUnits(changed: string[], units: string[]): string[] {
  const owned = new Set(changed.flatMap((file) => ownersOf(file, units)));
  return units.filter((unit) => owned.has(unit));
}

export const DEFAULT_BASE = "alpha";
const JJ_TIMEOUT_MS = 60_000;
// Both ends of every entry: a rename's source is a changed path as much as its destination.
const JJ_PATHS_TEMPLATE = 'source.path() ++ "\\0" ++ target.path() ++ "\\0"';

type Paths = { ok: true; paths: string[] } | { ok: false; message: string };

/** Paths that differ between `base` and the working copy of the jj repository at `root`. */
export async function changedPaths(root: string, base: string): Promise<Paths> {
  if (base === "" || base.startsWith("-"))
    return { ok: false, message: `--base needs a revset, got '${base}'` };
  const jj = Bun.which("jj");
  if (jj === null) return { ok: false, message: "--changed needs jj on PATH" };
  const child = Bun.spawn(
    [
      jj,
      "diff",
      "--no-pager",
      "--color",
      "never",
      "--from",
      base,
      "-T",
      JJ_PATHS_TEMPLATE,
    ],
    {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: JJ_TIMEOUT_MS,
      killSignal: "SIGKILL",
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exit !== 0)
    return {
      ok: false,
      message: `jj diff --from ${base} failed (exit ${exit}): ${stderr.trim()}`,
    };
  const paths = new Set(stdout.split("\0").filter((path) => path !== ""));
  return { ok: true, paths: [...paths].toSorted() };
}

export const KNOWN_RED_FILE = "lint/test-known-red.toml";

const KnownRedFile = z.strictObject({
  unit: z
    .array(
      z.strictObject({
        path: z.string().min(1),
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD"),
        reason: z.string().min(1),
      }),
    )
    .default([]),
});

export type KnownRed = { path: string; since: string; reason: string };
type Listed = { ok: true; known: KnownRed[] } | { ok: false; message: string };

const parseToml = fromThrowable(
  (text: string): unknown => Bun.TOML.parse(text),
  String,
);

/** The `[[unit]]` entries of `text`; every path must be one of `units`, each at most once. */
export function parseKnownRed(text: string, units: string[]): Listed {
  const parsed = parseToml(text);
  if (parsed.isErr())
    return { ok: false, message: `${KNOWN_RED_FILE}: ${parsed.error}` };
  const table = KnownRedFile.safeParse(parsed.value);
  if (!table.success)
    return {
      ok: false,
      message: `${KNOWN_RED_FILE}: each [[unit]] needs path, since (YYYY-MM-DD) and reason: ${table.error.message}`,
    };
  const known = table.data.unit;
  const unknown = known.filter((entry) => !units.includes(entry.path));
  if (unknown.length > 0)
    return {
      ok: false,
      message: `${KNOWN_RED_FILE}: not a unit: ${unknown.map((entry) => `'${entry.path}'`).join(", ")} (see --list)`,
    };
  const paths = known.map((entry) => entry.path);
  const twice = paths.filter((path, index) => paths.indexOf(path) !== index);
  if (twice.length > 0)
    return {
      ok: false,
      message: `${KNOWN_RED_FILE}: listed twice: ${twice.map((path) => `'${path}'`).join(", ")}`,
    };
  return { ok: true, known };
}

async function readKnownRed(root: string, units: string[]): Promise<Listed> {
  const file = Bun.file(resolve(root, KNOWN_RED_FILE));
  if (!(await file.exists())) return { ok: true, known: [] };
  return parseKnownRed(await file.text(), units);
}

export type Verdict = "pass" | "fail" | "known-red" | "stale-red";

/** A listed unit that fails is reported, not failing; a listed unit that passes must be unlisted. */
export function verdictOf(
  outcome: Outcome,
  known: ReadonlySet<string>,
): Verdict {
  const listed = known.has(outcome.unit);
  if (outcome.status === "pass") return listed ? "stale-red" : "pass";
  return listed ? "known-red" : "fail";
}

const isFailing = (verdict: Verdict): boolean =>
  verdict === "fail" || verdict === "stale-red";

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

const NONE: ReadonlySet<string> = new Set();

const LABELS: Record<Verdict, string> = {
  pass: "PASS",
  fail: "FAIL",
  "known-red": "KNOWN-RED",
  "stale-red": "FAIL",
};

export function unitLine(
  outcome: Outcome,
  known: ReadonlySet<string> = NONE,
): string {
  const label = LABELS[verdictOf(outcome, known)];
  return `${label} ${outcome.seconds.toFixed(1)}s ${outcome.unit}`;
}

export function failureText(
  outcome: Outcome,
  timeoutMs: number,
  known: ReadonlySet<string> = NONE,
): string {
  const verdict = verdictOf(outcome, known);
  if (verdict === "stale-red")
    return `  ${outcome.unit}: passes: remove it from ${KNOWN_RED_FILE}\n`;
  if (verdict === "known-red" || verdict === "pass") return "";
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
  known: ReadonlySet<string> = NONE,
): { lines: string[]; failed: number } {
  const verdicts = outcomes.map((outcome) => verdictOf(outcome, known));
  const failed = outcomes.filter((_, index) =>
    isFailing(verdicts[index] ?? "fail"),
  );
  const red = verdicts.filter((verdict) => verdict === "known-red").length;
  const redNote = red > 0 ? `, ${red} known-red` : "";
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
      `${outcomes.length} units: ${outcomes.length - failed.length - red} passed, ${failed.length} failed${redNote}; ${wallSeconds.toFixed(1)}s wall, ${summed.toFixed(1)}s summed`,
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

type Chosen = { ok: true; units: string[] } | { ok: false; message: string };

// `base` set means --changed: the units that own the paths differing from it; else the selectors.
async function choose(
  units: string[],
  selectors: string[],
  { root, base }: { root: string; base: string | undefined },
): Promise<Chosen> {
  if (base === undefined) return selectUnits(units, selectors);
  const paths = await changedPaths(root, base);
  if (!paths.ok) return paths;
  return { ok: true, units: ownedUnits(paths.paths, units) };
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
        changed: {
          type: Boolean,
          default: false,
          description:
            "run only the units that own a file differing from --base (working copy included)",
        },
        base: {
          type: String,
          description: `revset --changed compares against (default: ${DEFAULT_BASE})`,
        },
        strict: {
          type: Boolean,
          default: false,
          description: `ignore ${KNOWN_RED_FILE}: a known-red unit that fails is a failure`,
        },
      },
      help: {
        description:
          "Run the repo's script and tool tests as parallel units. A unit is one scripts/tests/*.test.ts file, one scripts/tests sub-directory or one tools/<name>/tests directory. Positional arguments select units by path prefix, e.g. tools/smart-copy or scripts/tests/land. --changed selects the units that own the changed files instead. A unit listed in lint/test-known-red.toml that fails is printed KNOWN-RED and does not fail the run; one that passes fails it.",
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
  const { changed, base, strict } = parsed.flags;
  if (base !== undefined && !changed) return usage("--base needs --changed");
  if (changed && parsed._.units.length > 0)
    return usage("--changed and unit selectors cannot be combined");
  const listed = strict
    ? ({ ok: true, known: [] } satisfies Listed)
    : await readKnownRed(root, units);
  if (!listed.ok) return usage(listed.message);
  const known = new Set(listed.known.map((entry) => entry.path));
  const selected = await choose(units, parsed._.units, {
    root,
    base: changed ? (base ?? DEFAULT_BASE) : undefined,
  });
  if (!selected.ok) return usage(selected.message);
  if (parsed.flags.list) {
    process.stdout.write(selected.units.map((unit) => `${unit}\n`).join(""));
    return 0;
  }
  if (selected.units.length === 0) {
    process.stdout.write("test-units: no test unit owns the changed files\n");
    return 0;
  }
  if (changed)
    process.stdout.write(
      `test-units: --changed vs ${base ?? DEFAULT_BASE} selects:\n${selected.units.map((unit) => `  ${unit}\n`).join("")}`,
    );
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
      process.stdout.write(`${unitLine(outcome, known)}\n`);
      process.stdout.write(failureText(outcome, timeoutMs, known));
    },
  );
  const result = summary(outcomes, (performance.now() - started) / 1000, known);
  process.stdout.write(`${result.lines.join("\n")}\n`);
  return result.failed > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
