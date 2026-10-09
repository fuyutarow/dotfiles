// PreToolUse gate — refuse tool calls that may write when storage headroom is gone.
//
// Why a hook and not prose: 2026-09-21 23:50 JST the Windows host drive that holds the WSL2
// vhdx sat at 96% (46 GB free of 931 GB) while inside WSL `df /` still showed 483 GB free —
// the guest never sees the host pressure, and every experiment kept writing state dumps
// (58.7 GB of unreferenced .jls/.bin under archives/runs-2026-09-21/artifacts alone) and Rust
// build output (polysearch-rs/target 62 GB). A full host drive takes down WSL and Windows
// together, so the assert has to sit in front of the commands that CREATE bytes, not in a
// CLAUDE.md sentence the model can forget under pressure.
//
// CONFIG vs MECHANISM. Everything that says WHAT is guarded lives in storage-headroom.toml next
// to this file: the drives and their deny/warn sizes, the launcher commands, the per-language
// artifact budgets and their advice, and the measuring bounds. This file is only the mechanism:
// load and validate that config, parse commands, measure free space and artifact sizes, and decide.
// STORAGE_HEADROOM_CONFIG points the hook at another config (the test suite's fixtures).
//
// Decisions: every non-allowlisted tool call below a drive's deny line is denied; launchers are
// denied below the warn line. Between the deny and warn lines, calls are allowed with a warning.
// An artifact over its budget → allow, with the warnings in
// `additionalContext` (on PreToolUse, stderr with exit 0 reaches no one — measured 2026-09-22).
// An invalid config → deny every non-allowlisted tool call with every config error: a silent
// fallback to defaults would disarm the gate. Cleanup and read-only commands remain available.
//
// FAIL CLOSED on hook errors (run.sh --fail-closed). VENDOR-NEUTRAL since 2026-09-27:
// wired into Claude Code AND Codex from agents/hooks/hooks.toml (rendered by scripts/render-home.ts). Codex
// canonicalizes its shell tools to tool_name "Bash" + tool_input.command, so this file reads one
// payload shape for both. The 2026-09-26 near-miss that forced it: a Codex session rebuilt 145 GB
// of target/ with C: at 3% free because this gate was registered for Claude only.
// Authored in the firedancer session 2026-09-21 (host C: at 96%), installed here by the dotfiles
// owner the same night; config split out 2026-09-22.

import { createHash } from "node:crypto";
import {
  loadStorageHeadroom,
  storageLine as effective,
  type Drive,
} from "../../tools/shared/src/storage-headroom.ts";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { attempt, attemptOr, errorMessage } from "./attempt.ts";
import { decidePre, readStdinJson } from "./lib.ts";
import {
  type ShellCommand,
  effective as effectiveCommand,
  parseShell,
} from "./shell-syntax.ts";
import {
  type Obj,
  arr,
  at,
  bool,
  num,
  obj,
  parseJson,
  str,
  strAt,
} from "./narrow.ts";

const GiB = 1024 ** 3;
const MAX_SCRATCHPAD_WRITE_BYTES = 64 * 1024;
const CONFIG_PATH =
  process.env.STORAGE_HEADROOM_CONFIG ??
  join(import.meta.dir, "storage-headroom.toml");

// --- Config: shape and validation -------------------------------------------------------------

type Launcher = { command: string; subcommands?: string[]; tasks?: string[] };
type Budget = {
  name: string;
  launchers: string[];
  locate: "path" | "cargo-target";
  path?: string;
  warn_gib: number;
  deny_gib?: number;
  incremental?: boolean;
  advice: string;
};
type Config = {
  schema: 1;
  sparse_required_above_mb: number;
  drive: Record<string, Drive>;
  deny: { advice: string };
  launcher: Launcher[];
  budget: Budget[];
  measure: { du_timeout_seconds: number; cache_minutes: number };
};

// Hand-rolled on purpose: hooks stay zero-dep (writing-bun-scripts BG3), so no schema library.
// Every error is collected, not the first one — a fixed typo should not reveal the next. Each
// reader below pushes its error and returns a placeholder; the placeholders are only ever used
// when `errors` ends up non-empty, in which case the whole config is discarded.
function nonNegative(v: unknown, where: string, errors: string[]): number {
  const n = num(v);
  if (n === undefined || n < 0) {
    errors.push(
      `${where}: expected a non-negative number, got ${JSON.stringify(v)}`,
    );
    return 0;
  }
  return n;
}

function optionalNonNegative(
  v: unknown,
  where: string,
  errors: string[],
): number | undefined {
  return v === undefined ? undefined : nonNegative(v, where, errors);
}

function nonEmptyString(v: unknown, where: string, errors: string[]): string {
  const s = str(v);
  if (s === undefined || s === "") {
    errors.push(`${where}: expected a non-empty string`);
    return "";
  }
  return s;
}

function nonEmptyStrings(
  v: unknown,
  where: string,
  errors: string[],
): string[] {
  const list = arr(v);
  const items = (list ?? []).flatMap((s) => {
    const t = str(s);
    return t === undefined || t === "" ? [] : [t];
  });
  if (list === undefined || list.length === 0 || items.length !== list.length) {
    errors.push(`${where}: expected a non-empty array of non-empty strings`);
    return [];
  }
  return items;
}

function onlyKeys(
  o: Obj,
  keys: string[],
  where: string,
  errors: string[],
): void {
  for (const k of Object.keys(o))
    if (!keys.includes(k)) errors.push(`${where}: unknown key '${k}'`);
}

function parseDeny(raw: unknown, errors: string[]): { advice: string } {
  const t = obj(raw);
  if (t === undefined) {
    errors.push("deny: expected a [deny] table");
    return { advice: "" };
  }
  onlyKeys(t, ["advice"], "deny", errors);
  return { advice: nonEmptyString(at(t, "advice"), "deny.advice", errors) };
}

function parseLauncher(l: unknown, i: number, errors: string[]): Launcher {
  const where = `launcher[${i}]`;
  const t = obj(l);
  if (t === undefined) {
    errors.push(`${where}: expected a table`);
    return { command: "" };
  }
  onlyKeys(t, ["command", "subcommands", "tasks"], where, errors);
  const rawCommand = at(t, "command");
  const command = nonEmptyString(rawCommand, `${where}.command`, errors);
  if (
    typeof rawCommand === "string" &&
    !/^[A-Za-z0-9._-]+$/u.test(rawCommand)
  ) {
    errors.push(`${where}.command: '${rawCommand}' is not a bare command name`);
  }
  const rawSubcommands = at(t, "subcommands");
  const subcommands =
    rawSubcommands === undefined
      ? undefined
      : nonEmptyStrings(rawSubcommands, `${where}.subcommands`, errors);
  const rawTasks = at(t, "tasks");
  const tasks =
    rawTasks === undefined
      ? undefined
      : nonEmptyStrings(rawTasks, `${where}.tasks`, errors);
  return {
    command,
    ...(subcommands === undefined ? {} : { subcommands }),
    ...(tasks === undefined ? {} : { tasks }),
  };
}

function parseLaunchers(
  list: readonly unknown[] | undefined,
  errors: string[],
): Launcher[] {
  if (list === undefined || list.length === 0) {
    errors.push("launcher: expected at least one [[launcher]]");
    return [];
  }
  return list.map((l, i) => parseLauncher(l, i, errors));
}

function parseBudget(
  b: unknown,
  i: number,
  known: ReadonlySet<unknown>,
  errors: string[],
): Budget {
  const where = `budget[${i}]`;
  const t = obj(b);
  if (t === undefined) {
    errors.push(`${where}: expected a table`);
    return { name: "", launchers: [], locate: "path", warn_gib: 0, advice: "" };
  }
  onlyKeys(
    t,
    [
      "name",
      "launchers",
      "locate",
      "path",
      "warn_gib",
      "deny_gib",
      "incremental",
      "advice",
    ],
    where,
    errors,
  );
  const name = nonEmptyString(at(t, "name"), `${where}.name`, errors);
  const rawLaunchers = at(t, "launchers");
  const launchers = nonEmptyStrings(rawLaunchers, `${where}.launchers`, errors);
  for (const l of arr(rawLaunchers) ?? []) {
    if (!known.has(l))
      errors.push(
        `${where}.launchers: '${String(l)}' is not a [[launcher]] command`,
      );
  }
  const rawLocate = at(t, "locate");
  const locateMode = rawLocate === "cargo-target" ? rawLocate : "path";
  if (rawLocate !== "path" && rawLocate !== "cargo-target") {
    errors.push(`${where}.locate: expected "path" or "cargo-target"`);
  }
  const path =
    rawLocate === "path"
      ? nonEmptyString(at(t, "path"), `${where}.path`, errors)
      : undefined;
  const rawWarn = at(t, "warn_gib");
  const warn = nonNegative(rawWarn, `${where}.warn_gib`, errors);
  const rawDeny = at(t, "deny_gib");
  const deny = optionalNonNegative(rawDeny, `${where}.deny_gib`, errors);
  if (
    typeof rawDeny === "number" &&
    typeof rawWarn === "number" &&
    rawDeny <= rawWarn
  ) {
    errors.push(`${where}.deny_gib: must be above warn_gib`);
  }
  const rawIncremental = at(t, "incremental");
  const incremental = bool(rawIncremental);
  if (rawIncremental !== undefined && incremental === undefined) {
    errors.push(`${where}.incremental: expected true or false`);
  }
  const advice = nonEmptyString(at(t, "advice"), `${where}.advice`, errors);
  return {
    name,
    launchers,
    locate: locateMode,
    warn_gib: warn,
    advice,
    ...(path === undefined ? {} : { path }),
    ...(deny === undefined ? {} : { deny_gib: deny }),
    ...(incremental === undefined ? {} : { incremental }),
  };
}

function parseBudgets(
  raw: unknown,
  known: ReadonlySet<unknown>,
  errors: string[],
): Budget[] {
  const list = arr(raw);
  if (list === undefined) {
    errors.push("budget: expected [[budget]] tables");
    return [];
  }
  return list.map((b, i) => parseBudget(b, i, known, errors));
}

function parseMeasure(raw: unknown, errors: string[]): Config["measure"] {
  const t = obj(raw);
  if (t === undefined) {
    errors.push("measure: expected a [measure] table");
    return { du_timeout_seconds: 0, cache_minutes: 0 };
  }
  onlyKeys(t, ["du_timeout_seconds", "cache_minutes"], "measure", errors);
  return {
    du_timeout_seconds: nonNegative(
      at(t, "du_timeout_seconds"),
      "measure.du_timeout_seconds",
      errors,
    ),
    cache_minutes: nonNegative(
      at(t, "cache_minutes"),
      "measure.cache_minutes",
      errors,
    ),
  };
}

function validate(
  raw: unknown,
  loadedDrives: Drive[],
  driveErrors: string[],
): { config: Config | null; errors: string[] } {
  const errors: string[] = [...driveErrors];
  const top = obj(raw);
  if (top === undefined)
    return { config: null, errors: ["top level: expected a table"] };
  onlyKeys(
    top,
    [
      "schema",
      "sparse_required_above_mb",
      "drive",
      "deny",
      "launcher",
      "budget",
      "measure",
    ],
    "top level",
    errors,
  );
  if (at(top, "schema") !== 1)
    errors.push(`schema: expected 1, got ${JSON.stringify(at(top, "schema"))}`);

  const rawDrives = obj(at(top, "drive"));
  const drive: Record<string, Drive> = {};
  Object.keys(rawDrives ?? {}).forEach((name, index) => {
    const loadedDrive = loadedDrives[index];
    if (loadedDrive !== undefined) drive[name] = loadedDrive;
  });
  const deny = parseDeny(at(top, "deny"), errors);
  const rawLaunchers = arr(at(top, "launcher"));
  const launcher = parseLaunchers(rawLaunchers, errors);
  // Budgets name launchers by their raw `command` value, valid or not.
  const known = new Set<unknown>(
    (rawLaunchers ?? []).map((l) => at(l, "command")),
  );
  const budget = parseBudgets(at(top, "budget") ?? [], known, errors);
  const measure = parseMeasure(at(top, "measure"), errors);
  const sparseRequiredAboveMb = nonNegative(
    at(top, "sparse_required_above_mb"),
    "sparse_required_above_mb",
    errors,
  );

  return errors.length > 0
    ? { config: null, errors }
    : {
        config: {
          schema: 1,
          sparse_required_above_mb: sparseRequiredAboveMb,
          drive,
          deny,
          launcher,
          budget,
          measure,
        },
        errors,
      };
}

async function loadConfig(): Promise<{
  config: Config | null;
  errors: string[];
}> {
  const read = await attempt(() => readFileSync(CONFIG_PATH, "utf8"));
  if (!read.ok) {
    return {
      config: null,
      errors: [`cannot read ${CONFIG_PATH}: ${errorMessage(read.error)}`],
    };
  }
  const parsed = await attempt(() => Bun.TOML.parse(read.value));
  if (!parsed.ok) {
    return {
      config: null,
      errors: [
        `${CONFIG_PATH} is not valid TOML: ${errorMessage(parsed.error)}`,
      ],
    };
  }
  const loaded = loadStorageHeadroom(CONFIG_PATH);
  return validate(parsed.value, loaded.drives, loaded.errors);
}

// --- Launch matching --------------------------------------------------------------------------

const POS = String.raw`(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*`;
const PREFIX = String.raw`(?:(?:sudo|command|time|nice|exec|timeout\s+\S+)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|[A-Za-z_]\w*=\S+\s+)*`;
const esc = (s: string) => s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

// Every launcher takes PREFIX: `RUSTFLAGS=-C... cargo build` and `env X=1 julia` are the
// common spellings, and a gate that misses them is decoration (caught by the test suite on
// install, 2026-09-22 — the first draft applied PREFIX to only three of the five).
function matchLauncher(
  command: string,
  launchers: Launcher[],
): { command: string; label: string } | null {
  const parsed = parseShell(command);
  if (parsed !== undefined) return launcherBySyntax(parsed.commands, launchers);
  return launcherByText(command, launchers);
}

// A launch is a command that EXECUTES (shell-syntax.ts): launcher text in a heredoc body or a quoted
// word is data. `timeout 110 mise run test` in a brief the model is writing is not a build.
function launcherBySyntax(
  commands: ShellCommand[],
  launchers: Launcher[],
): { command: string; label: string } | null {
  for (const l of launchers) {
    const label = syntaxLabel(l, commands);
    if (label !== undefined) return { command: l.command, label };
  }
  return null;
}

function leadingMatch(
  names: string[] | undefined,
  arg: string,
): string | undefined {
  if (names === undefined) return undefined;
  return new RegExp(`^(?:${names.map((n) => esc(n)).join("|")})\\b`, "u").exec(
    arg,
  )?.[0];
}

function syntaxLabel(
  l: Launcher,
  commands: ShellCommand[],
): string | undefined {
  for (const c of commands) {
    const eff = effectiveCommand(c);
    const label = eff?.name === l.command ? argsLabel(l, eff.args) : undefined;
    if (label !== undefined) return label;
  }
  return undefined;
}

function argsLabel(l: Launcher, args: string[]): string | undefined {
  const [first = "", second = ""] = args;
  const sub = leadingMatch(l.subcommands, first);
  if (l.subcommands !== undefined && sub === undefined) return undefined;
  const task = leadingMatch(
    l.tasks,
    l.subcommands === undefined ? first : second,
  );
  if (l.tasks !== undefined && task === undefined) return undefined;
  return [l.command, sub, task].filter((p) => p !== undefined).join(" ");
}

function launcherByText(
  command: string,
  launchers: Launcher[],
): { command: string; label: string } | null {
  for (const l of launchers) {
    const sub =
      l.subcommands !== undefined
        ? String.raw`\s+(?<sub>${l.subcommands.map(esc).join("|")})\b`
        : "";
    const task =
      l.tasks !== undefined
        ? String.raw`\s+(?<task>${l.tasks.map(esc).join("|")})\b`
        : "";
    const m = new RegExp(
      `${POS}${PREFIX}(?:\\S*\\/)?${esc(l.command)}\\b${sub}${task}`,
      "u",
    ).exec(command);
    if (m !== null)
      return {
        command: l.command,
        label: [l.command, m.groups?.sub, m.groups?.task]
          .filter((part) => part !== undefined)
          .join(" "),
      };
  }
  return null;
}

const READ_ONLY = new Set([
  "df",
  "du",
  "dust",
  "ls",
  "cat",
  "head",
  "tail",
  "rr",
]);

function cargoCleanInProject(c: ShellCommand): boolean {
  const eff = effectiveCommand(c);
  if (eff?.name !== "cargo" || eff.args[0] !== "clean") return false;
  const args = eff.args.slice(1);
  let manifestPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (
      ((arg === "-p" || arg === "--package" || arg === "--manifest-path") &&
        (next === undefined || next.startsWith("-"))) ||
      (arg?.startsWith("--package=") === true &&
        arg.length === "--package=".length) ||
      (arg?.startsWith("--manifest-path=") === true &&
        arg.length === "--manifest-path=".length)
    ) {
      return false;
    }
    if (arg === "-p" || arg === "--package") {
      i++;
      continue;
    } else if (arg?.startsWith("--package=") === true) {
      continue;
    } else if (arg === "--manifest-path") {
      manifestPath = next;
      i++;
      continue;
    } else if (arg?.startsWith("--manifest-path=") === true) {
      manifestPath = arg.slice("--manifest-path=".length);
      continue;
    } else {
      return false;
    }
  }
  return (
    existsSync(join(c.cwd, "Cargo.toml")) ||
    (manifestPath !== undefined &&
      existsSync(join(dirname(resolve(c.cwd, manifestPath)), "Cargo.toml")))
  );
}

type WorkspaceAdd = { cwd: string; args: string[] };

function workspaceAdd(c: ShellCommand): WorkspaceAdd | null {
  const eff = effectiveCommand(c);
  return eff?.name === "jj" &&
    eff.args[0] === "workspace" &&
    eff.args[1] === "add"
    ? { cwd: c.cwd, args: eff.args }
    : null;
}

function workspaceRoot(path: string): string | null {
  for (let dir = resolve(path); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".jj"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
  }
}

const TRACKED_FILE_COUNT_TIMEOUT_MS = 2_000;
const CHECKOUT_SIZE_TIMEOUT_MS = 5_000;
const SMALL_CHECKOUT_FILE_LIMIT = 10_000;
const SPARSE_WORKSPACE_ADVICE =
  "Use `jj workspace add --sparse-patterns empty <dir>`, then `jj sparse set --add <paths>`.";

export type CheckoutProbeResult = { bytes: number | null; elapsedMs: number };
export type TrackedFileCountResult = {
  count: number | null;
  elapsedMs: number;
};
export type CheckoutCacheEntry = {
  bytes?: number;
  trackedFileCount?: number;
  at: number;
};
export type CheckoutPolicyDeps = {
  now: () => number;
  cachedSize: (
    root: string,
    now: () => number,
  ) => Promise<CheckoutCacheEntry | null>;
  saveCache: (root: string, entry: CheckoutCacheEntry) => void;
  probeSize: (root: string, budgetMs: number) => CheckoutProbeResult;
  trackedFileCount: (root: string, budgetMs: number) => TrackedFileCountResult;
};

function probeCheckoutSize(
  root: string,
  budgetMs: number,
): CheckoutProbeResult {
  const started = performance.now();
  const result = Bun.spawnSync(["du", "-sk", "-I", ".jj", "-I", ".git", root], {
    timeout: budgetMs,
    stdout: "pipe",
    stderr: "ignore",
  });
  if (result.exitCode !== 0)
    return { bytes: null, elapsedMs: performance.now() - started };
  const kib = Number(result.stdout.toString().trim().split(/\s/u)[0]);
  return {
    bytes: Number.isFinite(kib) && kib >= 0 ? kib * 1024 : null,
    elapsedMs: performance.now() - started,
  };
}

// `jj file list` avoids walking file contents. Its bounded output count is a cheap proxy for
// whether a full checkout is safe to start without walking file contents.
function probeTrackedFileCount(
  root: string,
  budgetMs: number,
): TrackedFileCountResult {
  const started = performance.now();
  const result = Bun.spawnSync(
    ["jj", "--ignore-working-copy", "-R", root, "file", "list", "-T", '"x\\n"'],
    {
      timeout: budgetMs,
      stdout: "pipe",
      stderr: "ignore",
      maxBuffer: 256 * 1024,
    },
  );
  if (result.exitCode !== 0)
    return { count: null, elapsedMs: performance.now() - started };
  const output = result.stdout.toString();
  return {
    count: output === "" ? 0 : output.split("\n").length - 1,
    elapsedMs: performance.now() - started,
  };
}

export function checkoutCachePath(root: string, home = homedir()): string {
  return join(
    home,
    ".cache",
    "claude-hooks",
    "storage-headroom",
    `${createHash("sha1").update(root).digest("hex")}.checkout.json`,
  );
}

export function writeCheckoutCache(
  root: string,
  entry: CheckoutCacheEntry,
  home = homedir(),
): void {
  const cacheFile = checkoutCachePath(root, home);
  const cacheDir = dirname(cacheFile);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(entry));
}

const defaultCheckoutPolicyDeps: CheckoutPolicyDeps = {
  now: () => Temporal.Now.instant().epochMilliseconds,
  cachedSize: cachedCheckoutSizeBytes,
  saveCache: writeCheckoutCache,
  probeSize: probeCheckoutSize,
  trackedFileCount: (root, budgetMs) => {
    const result = probeTrackedFileCount(root, budgetMs);
    return { count: result.count, elapsedMs: result.elapsedMs };
  },
};

export async function cachedCheckoutSizeBytes(
  root: string,
  now: () => number,
  home = homedir(),
): Promise<CheckoutCacheEntry | null> {
  const cacheFile = checkoutCachePath(root, home);
  return attemptOr(() => {
    const value = parseJson(readFileSync(cacheFile, "utf8"));
    const bytes = num(at(value, "bytes"));
    const trackedFileCount = num(at(value, "trackedFileCount"));
    const stamp = num(at(value, "at"));
    if (stamp === undefined) return null;
    const age = now() - stamp;
    if (age < 0 || age >= 60 * 60_000) return null;
    if (bytes === undefined && trackedFileCount === undefined) return null;
    return {
      ...(bytes === undefined ? {} : { bytes }),
      ...(trackedFileCount === undefined ? {} : { trackedFileCount }),
      at: stamp,
    };
  }, null);
}

async function probeAndCacheTrackedFileCount(
  root: string,
  deps: CheckoutPolicyDeps,
): Promise<TrackedFileCountResult> {
  const result = deps.trackedFileCount(root, TRACKED_FILE_COUNT_TIMEOUT_MS);
  if (result.count !== null) {
    const entry: CheckoutCacheEntry = {
      trackedFileCount: result.count,
      at: deps.now(),
    };
    await attempt(() => {
      deps.saveCache(root, entry);
    });
  }
  return result;
}

function checkoutRoot(add: WorkspaceAdd): string | null {
  let path = add.cwd;
  for (let i = 0; i < add.args.length; i++) {
    const repository = add.args[i + 1];
    if (add.args[i] === "-R" && repository === undefined) return null;
    if (add.args[i] === "-R") {
      path = resolve(add.cwd, repository ?? "");
      break;
    }
  }
  return workspaceRoot(path);
}

export async function fullCheckoutReason(
  command: string,
  cwd: string,
  thresholdMb: number,
  deps: CheckoutPolicyDeps = defaultCheckoutPolicyDeps,
): Promise<string | null> {
  const unknownReason = `storage-headroom: refusing a full-checkout jj workspace because its size is unknown; retry after a bounded size probe succeeds. ${SPARSE_WORKSPACE_ADVICE}`;
  const parsed = parseShell(command, cwd);
  if (parsed === undefined) {
    return /\bjj\s+workspace\s+add\b/u.test(command) ? unknownReason : null;
  }
  for (const c of parsed.commands) {
    const add = workspaceAdd(c);
    if (
      add === null ||
      add.args.some((arg) => arg === "--help" || arg === "-h") ||
      add.args.some(
        (arg, i) => arg === "--sparse-patterns" && add.args[i + 1] === "empty",
      )
    )
      continue;
    const root = checkoutRoot(add);
    if (root === null) return unknownReason;
    const cached = await deps.cachedSize(root, deps.now);
    if (
      cached?.trackedFileCount !== undefined &&
      cached.trackedFileCount <= SMALL_CHECKOUT_FILE_LIMIT
    )
      continue;

    const countProbe =
      cached?.trackedFileCount === undefined
        ? await probeAndCacheTrackedFileCount(root, deps)
        : { count: cached.trackedFileCount, elapsedMs: 0 };
    const trackedFileCount = countProbe.count ?? undefined;
    const countTimedOut =
      trackedFileCount === undefined &&
      countProbe.elapsedMs >= TRACKED_FILE_COUNT_TIMEOUT_MS;
    if (
      trackedFileCount !== undefined &&
      trackedFileCount <= SMALL_CHECKOUT_FILE_LIMIT
    )
      continue;

    const bytes = cached?.bytes ?? undefined;
    const sizeProbe =
      bytes === undefined
        ? deps.probeSize(root, CHECKOUT_SIZE_TIMEOUT_MS)
        : { bytes, elapsedMs: 0 };
    const sizeTimedOut =
      bytes === undefined && sizeProbe.elapsedMs >= CHECKOUT_SIZE_TIMEOUT_MS;
    if (sizeProbe.bytes === null) {
      const timedOut = [
        ...(countTimedOut ? ["tracked-file count (2 s)"] : []),
        ...(sizeTimedOut ? ["checkout byte size (5 s)"] : []),
      ];
      return timedOut.length > 0
        ? `${unknownReason} Timed out: ${timedOut.join(" and ")}.`
        : unknownReason;
    }
    if (bytes === undefined) {
      const entry: CheckoutCacheEntry = {
        ...(trackedFileCount === undefined ? {} : { trackedFileCount }),
        bytes: sizeProbe.bytes,
        at: deps.now(),
      };
      await attempt(() => {
        deps.saveCache(root, entry);
      });
    }
    const measuredBytes = sizeProbe.bytes;
    const mb = measuredBytes / 1_000_000;
    if (mb > thresholdMb) {
      return (
        `storage-headroom: refusing a full-checkout jj workspace; this repo is ${mb.toFixed(1)} MB ` +
        `(> ${thresholdMb} MB threshold). Use ` +
        "`jj workspace add --sparse-patterns empty <dir>`, then `jj sparse set --add <paths>`."
      );
    }
  }
  return null;
}

function isOnlyWorkspaceAddHelp(command: string, cwd: string): boolean {
  const parsed = parseShell(command, cwd);
  if (parsed === undefined || parsed.commands.length !== 1) return false;
  const add = workspaceAdd(parsed.commands[0]!);
  return (
    add !== null && add.args.some((arg) => arg === "--help" || arg === "-h")
  );
}

function isRecoveryOrRead(command: string, cwd: string): boolean {
  const parsed = parseShell(command, cwd);
  if (parsed === undefined || parsed.commands.length === 0) return false;
  const commands = parsed.commands.filter(
    (c) => effectiveCommand(c) !== undefined,
  );
  if (commands.length === 0) return false;
  return (
    commands.length === parsed.commands.length &&
    commands.every((c) => {
      const eff = effectiveCommand(c);
      if (
        eff === undefined ||
        c.words[0] !== eff.name ||
        c.redirects.some((r) => r.op !== "<" && r.op !== "<<" && r.op !== "<<<")
      )
        return false;
      const [sub = "", third = ""] = eff.args;
      if (eff.name === "cargo" && sub === "clean")
        return cargoCleanInProject(c);
      // Ticket write scope is not visible in this command line. Dispatch state is small, and
      // every spawned worker still passes through its own storage gate.
      if (
        eff.name === "agx" &&
        ["run", "resume", "grade", "ack", "stats"].includes(sub)
      )
        return true;
      if (eff.name === "disk-reclaim" || eff.name === "storage-headroom")
        return true;
      if (eff.name === "mise" && sub === "run")
        return third.startsWith("reclaim");
      if (eff.name === "m") return sub.startsWith("reclaim");
      if (eff.name === "jj")
        return (
          (sub === "workspace" && (third === "forget" || third === "list")) ||
          sub === "abandon" ||
          sub === "st" ||
          sub === "log"
        );
      return READ_ONLY.has(eff.name);
    })
  );
}

// --- Measuring --------------------------------------------------------------------------------

async function freeBytes(path: string): Promise<number | null> {
  return (await space(path))?.free ?? null;
}

async function space(
  path: string,
): Promise<{ free: number; total: number } | null> {
  const cacheDir = join(
    homedir(),
    ".cache",
    "claude-hooks",
    "storage-headroom",
  );
  const cacheFile = join(
    cacheDir,
    `${createHash("sha1").update(path).digest("hex")}.statfs.json`,
  );
  const cached = await attemptOr(() => {
    const value = parseJson(readFileSync(cacheFile, "utf8"));
    const free = num(at(value, "free"));
    const total = num(at(value, "total"));
    const atMs = num(at(value, "at"));
    const age = Temporal.Now.instant().epochMilliseconds - (atMs ?? 0);
    return free !== undefined &&
      total !== undefined &&
      atMs !== undefined &&
      age >= 0 &&
      age <= 2_000
      ? { free, total }
      : null;
  }, null);
  if (cached !== null) return cached;

  const measuredSpace = await attemptOr(() => {
    const s = statfsSync(path);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  }, null);
  if (measuredSpace === null) return null;
  await attempt(() => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      cacheFile,
      JSON.stringify({
        ...measuredSpace,
        at: Temporal.Now.instant().epochMilliseconds,
      }),
    );
  });
  return measuredSpace;
}

// The hook only queues the bounded systemd recovery unit. A PreToolUse call must never wait for
// multi-minute cache cleanup, and this service also runs from a timer while an agent is idle.
async function requestRecovery(): Promise<string> {
  // A fixture config must not start the real host service during hook tests.
  if (process.env.STORAGE_HEADROOM_CONFIG !== undefined) return "";
  const stamp = join(
    homedir(),
    ".local/state/wsl-capacity-recover/last-request",
  );
  // First request, or an unavailable stamp: still attempt to queue recovery.
  const mtimeMs = await attemptOr(() => statSync(stamp).mtimeMs, null);
  if (
    mtimeMs !== null &&
    Temporal.Now.instant().epochMilliseconds - mtimeMs < 60_000
  )
    return " Automatic recovery was recently queued.";
  // The drive may already be critically low. systemd still gets a chance below.
  await attempt(() => {
    mkdirSync(dirname(stamp), { recursive: true });
    writeFileSync(stamp, `${Temporal.Now.instant().epochMilliseconds}\n`);
  });
  // bounded: GNU timeout caps this non-blocking systemd recovery request at three seconds.
  const result = Bun.spawnSync(
    [
      "timeout",
      "3s",
      "systemctl",
      "--user",
      "--no-block",
      "start",
      "wsl-capacity-recover.service",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  return result.exitCode === 0
    ? " Automatic recovery was queued."
    : " Automatic recovery could not be queued; inspect wsl-capacity-recover.service.";
}

function gib(n: number | null): string {
  return n === null ? "unmeasured" : `${(n / GiB).toFixed(1)} GiB`;
}

type Size = { bytes: number; incremental: number; at: number };

// A cache file as a Size; null when it is not one (a stale or corrupt file just re-measures).
function parseSize(v: unknown): Size | null {
  const bytes = num(at(v, "bytes"));
  const incremental = num(at(v, "incremental"));
  const stamp = num(at(v, "at"));
  if (bytes === undefined || incremental === undefined || stamp === undefined)
    return null;
  return { bytes, incremental, at: stamp };
}

// Cached per artifact path: a 100 GiB tree takes seconds to walk, and agents launch builds many
// times an hour.
async function measured(
  path: string,
  withIncremental: boolean,
  m: Config["measure"],
): Promise<Size | null> {
  const cacheDir = join(
    homedir(),
    ".cache",
    "claude-hooks",
    "storage-headroom",
  );
  const cacheFile = join(
    cacheDir,
    `${createHash("sha1").update(path).digest("hex")}.json`,
  );
  // no or unreadable cache: measure
  const cached = await attemptOr(
    () => parseSize(parseJson(readFileSync(cacheFile, "utf8"))),
    null,
  );
  if (
    cached !== null &&
    Temporal.Now.instant().epochMilliseconds - cached.at <
      m.cache_minutes * 60_000
  )
    return cached;
  const bytes = duBytes(path, m);
  if (bytes === null) return null;
  const incremental = withIncremental
    ? ["debug", "release"]
        .map((p) => join(path, p, "incremental"))
        .filter((p) => existsSync(p))
        .reduce((sum, p) => sum + (duBytes(p, m) ?? 0), 0)
    : 0;
  const size: Size = {
    bytes,
    incremental,
    at: Temporal.Now.instant().epochMilliseconds,
  };
  // an unwritable cache only costs a re-measure next time
  await attempt(() => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(size));
  });
  return size;
}

// `du -sk` (KiB) is the spelling GNU and BSD du share; -b is GNU-only.
function duBytes(path: string, m: Config["measure"]): number | null {
  const r = Bun.spawnSync(["du", "-sk", path], {
    timeout: m.du_timeout_seconds * 1000,
    stdout: "pipe",
    stderr: "ignore",
  });
  if (r.exitCode !== 0 && r.stdout.length === 0) return null;
  const kib = Number(r.stdout.toString().split(/\s/u)[0]);
  return Number.isFinite(kib) && kib > 0 ? kib * 1024 : null;
}

// --- Locating an artifact ---------------------------------------------------------------------

const expand = (p: string) =>
  p.replace(/^~(?=\/|$)/u, homedir()).replaceAll(/^["']|["']$/gu, "");

// The target dir cargo will use: CARGO_TARGET_DIR (command text, then env), else the workspace
// root's .cargo/config.toml `target-dir`, else <workspace root>/target. The start dir honours a
// leading `cd <dir>` and `--manifest-path`, the two ways an agent points cargo elsewhere.
function cargoTargetDir(command: string, cwd: string): string | null {
  const envDir =
    /\bCARGO_TARGET_DIR=(\S+)/u.exec(command)?.[1] ??
    process.env.CARGO_TARGET_DIR;
  let start = cwd;
  const cd = /(?:^|[;&|(]\s*)cd\s+(\S+)/u.exec(command)?.[1];
  if (cd !== undefined) start = resolve(cwd, expand(cd));
  const manifest = /--manifest-path[=\s]+(\S+)/u.exec(command)?.[1];
  if (manifest !== undefined) start = dirname(resolve(start, expand(manifest)));
  if (envDir !== undefined) return resolve(start, expand(envDir));

  let dir: string | null = null;
  for (let d = start; ; d = dirname(d)) {
    const toml = join(d, "Cargo.toml");
    // The nearest package is the start; an enclosing [workspace] root replaces it.
    if (existsSync(toml) && (dir === null || isWorkspace(toml))) dir = d;
    if (dirname(d) === d) break;
  }
  if (dir === null) return null;
  const config = join(dir, ".cargo", "config.toml");
  if (existsSync(config)) {
    const td = /^\s*target-dir\s*=\s*"([^"]+)"/mu.exec(
      readFileSync(config, "utf8"),
    )?.[1];
    if (td !== undefined) return resolve(dir, expand(td));
  }
  return join(dir, "target");
}

function isWorkspace(toml: string): boolean {
  return /^\s*\[workspace\]/mu.test(readFileSync(toml, "utf8"));
}

function locate(b: Budget, command: string, cwd: string): string | null {
  return b.locate === "cargo-target"
    ? cargoTargetDir(command, cwd)
    : expand(b.path ?? "");
}

// Drive thresholds fire only once the whole drive is nearly full; one build tree can grow far
// faster than that. Measured 2026-09-22: polysearch-rs/target reached 104 GiB (59 GiB of it
// target/debug/incremental) after one day of parallel agent builds across worktrees, while the
// drive gate stayed quiet until C: had under 60 GiB left. A target over its deny budget blocks
// another build; cleanup remains a separate operation because another session may be using it.
async function budgetStatus(
  b: Budget,
  command: string,
  cwd: string,
  m: Config["measure"],
): Promise<{ warning?: string; denial?: string } | null> {
  const path = locate(b, command, cwd);
  if (path === null || !existsSync(path)) return null;
  const size = await measured(path, b.incremental === true, m);
  if (size === null) {
    const message =
      `storage-headroom: ${b.name} ${path} could not be sized within ${m.du_timeout_seconds}s — ` +
      `check it (du -sh ${path}) before building.`;
    return b.deny_gib === undefined
      ? { warning: message }
      : {
          denial: `${message} Another build is refused until its size is known.`,
        };
  }
  const incr =
    size.incremental > 0 ? ` (incremental ${gib(size.incremental)})` : "";
  if (b.deny_gib !== undefined && size.bytes >= b.deny_gib * GiB) {
    return {
      denial:
        `storage-headroom: refusing another build: ${b.name} ${path} is ${gib(size.bytes)}${incr}, ` +
        `over the ${gib(b.deny_gib * GiB)} limit. ${b.advice}`,
    };
  }
  if (size.bytes < b.warn_gib * GiB) return null;
  return {
    warning:
      `storage-headroom: ${b.name} ${path} is ${gib(size.bytes)}${incr}, over the ` +
      `${gib(b.warn_gib * GiB)} ${b.name} budget. Review before adding to it: ${b.advice}`,
  };
}

async function collectBudgetStatus(
  budgets: Budget[],
  hit: { command: string } | null,
  command: string | undefined,
  cwd: string,
  measure: Config["measure"],
): Promise<{ denials: string[]; warnings: string[] }> {
  const denials: string[] = [];
  const warnings: string[] = [];
  if (hit === null || command === undefined) return { denials, warnings };
  for (const budget of budgets) {
    if (!budget.launchers.includes(hit.command)) continue;
    const status = await budgetStatus(budget, command, cwd, measure);
    if (status?.denial !== undefined) denials.push(status.denial);
    if (status?.warning !== undefined) warnings.push(status.warning);
  }
  return { denials, warnings };
}

// --- Decision ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const payload = readStdinJson();
  if (payload === undefined) {
    process.stderr.write("storage-headroom: invalid JSON payload\n");
    process.exitCode = 1;
    return;
  }
  const toolName = strAt(payload, "tool_name") ?? "unknown";
  // Codex canonicalizes exec_command, shell, and its code-mode exec wrapper to Bash. Every
  // other tool is outside this disk-write gate unless it is one of the explicit file writers.
  if (
    toolName !== "Bash" &&
    !["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)
  ) {
    return;
  }
  const fileInput = obj(at(payload, "tool_input"));
  const filePath = strAt(fileInput, "file_path");
  const fileContent =
    strAt(fileInput, "content") ?? strAt(fileInput, "new_string");
  const scratchpadRoot = resolve("/tmp", `claude-${process.getuid?.() ?? ""}`);
  const fileTarget = filePath === undefined ? "" : resolve(filePath);
  const fileBytes =
    fileContent === undefined ? Infinity : Buffer.byteLength(fileContent);
  const smallScratchpadWrite =
    (toolName === "Write" || toolName === "Edit") &&
    fileTarget.startsWith(`${scratchpadRoot}/`) &&
    fileBytes <= MAX_SCRATCHPAD_WRITE_BYTES;
  const command =
    toolName === "Bash" ? strAt(payload, "tool_input", "command") : undefined;
  const cwd = strAt(payload, "cwd") ?? process.cwd();
  if (command !== undefined && isOnlyWorkspaceAddHelp(command, cwd)) return;
  // Cleanup and explicit inspection commands remain available even if the declaration is broken.
  if (command !== undefined && isRecoveryOrRead(command, cwd)) return;

  const { config, errors } = await loadConfig();
  if (config === null) {
    // BATCHED(config fields): validate() collects every error before this point, so one denial
    // lists them all.
    decidePre(
      "deny",
      `storage-headroom: config ${CONFIG_PATH} is invalid, so the storage gate cannot judge any ` +
        `tool call — refusing rather than guessing: ${errors.join("; ")}.`,
    );
  }

  if (command !== undefined) {
    const reason = await fullCheckoutReason(
      command,
      cwd,
      config.sparse_required_above_mb,
    );
    // SINGLE-AXIS: a non-sparse workspace add exceeds the checkout-size limit or its size is unknown.
    if (reason !== null) decidePre("deny", reason);
  }

  const hit =
    command === undefined ? null : matchLauncher(command, config.launcher);

  const drives = await Promise.all(
    Object.values(config.drive).map(async (d) => {
      const sp = await space(d.path);
      const total = sp?.total ?? null;
      return Object.assign({}, d, {
        free: sp?.free ?? null,
        denyAt: effective(d.deny_gib, d.deny_pct, total),
        warnAt:
          d.warn_gib === undefined || d.warn_pct === undefined
            ? undefined
            : effective(d.warn_gib, d.warn_pct, total),
      });
    }),
  );
  const low = drives.filter((d) => d.free !== null && d.free < d.denyAt);
  const warningLine = drives.filter(
    (d) => d.free !== null && d.free < (d.warnAt ?? d.denyAt),
  );
  const wsl =
    process.platform === "linux" &&
    existsSync("/proc/sys/kernel/osrelease") &&
    readFileSync("/proc/sys/kernel/osrelease", "utf8")
      .toLowerCase()
      .includes("microsoft");
  const hostUnreadable =
    wsl &&
    config.drive.host !== undefined &&
    (await freeBytes(config.drive.host.path)) === null;
  if (low.length > 0 && smallScratchpadWrite) {
    decidePre(
      "allow",
      `storage-headroom: allowing ${toolName} to write ${fileBytes} bytes under the session scratchpad (${scratchpadRoot}); limit ${MAX_SCRATCHPAD_WRITE_BYTES} bytes.`,
    );
  }
  if ((low.length > 0 || hostUnreadable) && hit === null) {
    denyLowSpace(drives, config.drive);
  }
  if (hit !== null && (warningLine.length > 0 || hostUnreadable)) {
    const hostDrive = config.drive.host;
    const hostLow =
      hostDrive !== undefined &&
      drives.some(
        (d) =>
          d.label === hostDrive.label && d.free !== null && d.free < d.denyAt,
      );
    const recovery = hostLow ? await requestRecovery() : "";
    // BATCHED(drives): every drive is measured before this point and all of them are in the one
    // reason below, so a caller short on both learns it from a single denial.
    denyLowSpace(
      drives,
      config.drive,
      `${hit.label} denied at its warn line.${hostUnreadable ? ` Host C could not be measured.${recovery}` : ""}`,
    );
  }

  const warnings: string[] = [];
  for (const d of drives) {
    if (
      hit === null &&
      d.warnAt !== undefined &&
      d.free !== null &&
      d.free < d.warnAt
    ) {
      const others = drives
        .filter((o) => o !== d)
        .map((o) => `${o.label} free ${gib(o.free)}`)
        .join(", ");
      warnings.push(
        `storage-headroom: WARNING ${d.label} free ${gib(d.free)} (< ${gib(d.warnAt)}); ` +
          `${others}${others !== "" ? "; " : ""}run disk-reclaim plan.`,
      );
    }
  }
  const budgetDenials: string[] = [];
  const budgetStatusResults = await collectBudgetStatus(
    config.budget,
    hit,
    command,
    cwd,
    config.measure,
  );
  budgetDenials.push(...budgetStatusResults.denials);
  warnings.push(...budgetStatusResults.warnings);
  if (budgetDenials.length > 0) {
    // BATCHED(budgets): all matching artifact budgets are measured before this denial.
    decidePre("deny", budgetDenials.join("; "));
  }
  if (warnings.length > 0) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: warnings.join("\n"),
        },
      })}\n`,
    );
  }
}

const ALLOWLIST =
  "Allowlist: cleanup: disk-reclaim, storage-headroom, mise run reclaim*, m reclaim*, jj workspace forget, jj abandon; read-only: df, du, dust, ls, cat, head, tail, rr, jj st, jj log, jj workspace list.";

function denyLowSpace(
  drives: Array<{
    label: string;
    free: number | null;
    denyAt: number;
    warnAt?: number | undefined;
  }>,
  configured: Record<string, Drive>,
  note = "",
): never {
  const first =
    "free space: disk-reclaim plan, then disk-reclaim run --tier blind --yes";
  const measuredDrives =
    drives.length > 0
      ? drives
          .map((d) => `${d.label} ${gib(d.free)} (deny line ${gib(d.denyAt)})`)
          .join(", ")
      : Object.values(configured)
          .map((d) => `${d.label} unmeasured (deny line ${d.deny_gib} GiB)`)
          .join(", ");
  // BATCHED(drives): the denial details include every measured drive in one message.
  decidePre(
    "deny",
    `${first}\n${measuredDrives}\n${ALLOWLIST}${note === "" ? "" : `\n${note}`}`,
  );
}

if (import.meta.main) await main();
