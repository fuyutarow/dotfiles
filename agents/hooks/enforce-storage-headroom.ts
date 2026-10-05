// PreToolUse gate (matcher: Bash) — refuse to LAUNCH new work when storage headroom is gone.
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
// load and validate that config, match a command against the launchers, measure free space and
// artifact sizes, and decide. Adding a budget or moving a threshold is a config edit.
// STORAGE_HEADROOM_CONFIG points the hook at another config (the test suite's fixtures).
//
// Decisions: a drive below its deny size → deny with every drive's measured numbers. A drive
// below its warn size, or an artifact over its budget → allow, with the warnings in
// `additionalContext` (on PreToolUse, stderr with exit 0 reaches no one — measured 2026-09-22).
// An invalid config → deny every Bash call with every config error: a silent fallback to
// defaults would disarm the gate. STORAGE_ASSERT_OVERRIDE=1 in the command text bypasses all
// of it, visibly, for a cleanup that must build.
//
// FAIL CLOSED on hook errors (run.sh --fail-closed, matcher "Bash"). VENDOR-NEUTRAL since 2026-09-27:
// wired into Claude Code AND Codex from agents/hooks/hooks.toml (`mise run hooks:wire`). Codex
// canonicalizes its shell tools to tool_name "Bash" + tool_input.command, so this file reads one
// payload shape for both. The 2026-09-26 near-miss that forced it: a Codex session rebuilt 145 GB
// of target/ with C: at 3% free because this gate was registered for Claude only.
// Authored in the firedancer session 2026-09-21 (host C: at 96%), installed here by the dotfiles
// owner the same night; config split out 2026-09-22.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { attempt, attemptOr, errorMessage } from "./attempt.ts";
import { decidePre, readStdinJson } from "./lib.ts";
import { storageLine as effective } from "./storage-line.ts";
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
const CONFIG_PATH =
  process.env.STORAGE_HEADROOM_CONFIG ??
  join(import.meta.dir, "storage-headroom.toml");

// --- Config: shape and validation -------------------------------------------------------------

type Drive = {
  label: string;
  path: string;
  deny_gib: number;
  deny_pct: number;
  warn_gib?: number;
  warn_pct?: number;
  stop_gib?: number;
};
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

function percent(v: unknown, where: string, errors: string[]): number {
  const n = nonNegative(v, where, errors);
  if (n > 100) {
    errors.push(
      `${where}: a percentage of the drive must be within 0..100, got ${n}`,
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

function parseDrive(where: string, d: unknown, errors: string[]): Drive {
  const t = obj(d);
  if (t === undefined) {
    errors.push(`${where}: expected a table`);
    return { label: "", path: "", deny_gib: 0, deny_pct: 0 };
  }
  onlyKeys(
    t,
    [
      "label",
      "path",
      "deny_gib",
      "deny_pct",
      "warn_gib",
      "warn_pct",
      "stop_gib",
    ],
    where,
    errors,
  );
  const label = nonEmptyString(at(t, "label"), `${where}.label`, errors);
  const path = nonEmptyString(at(t, "path"), `${where}.path`, errors);
  const rawDeny = at(t, "deny_gib");
  const deny = nonNegative(rawDeny, `${where}.deny_gib`, errors);
  const warn = optionalNonNegative(
    at(t, "warn_gib"),
    `${where}.warn_gib`,
    errors,
  );
  // Each line is the SMALLER of a size and a share of the drive (see effective()): both are
  // required, so a drive is never judged by an absolute size meant for a much larger disk.
  const denyPct = percent(at(t, "deny_pct"), `${where}.deny_pct`, errors);
  const rawWarnPct = at(t, "warn_pct");
  const warnPct =
    rawWarnPct === undefined
      ? undefined
      : percent(rawWarnPct, `${where}.warn_pct`, errors);
  if ((warn === undefined) !== (warnPct === undefined))
    errors.push(
      `${where}: warn_gib and warn_pct go together (both or neither)`,
    );
  const rawStop = at(t, "stop_gib");
  const stop = optionalNonNegative(rawStop, `${where}.stop_gib`, errors);
  if (
    where === "drive.host" &&
    typeof rawStop === "number" &&
    typeof rawDeny === "number" &&
    rawDeny > 0 &&
    rawStop >= rawDeny
  ) {
    errors.push(`${where}.stop_gib: must be below deny_gib`);
  }
  return {
    label,
    path,
    deny_gib: deny,
    deny_pct: denyPct,
    ...(warn === undefined ? {} : { warn_gib: warn }),
    ...(warnPct === undefined ? {} : { warn_pct: warnPct }),
    ...(stop === undefined ? {} : { stop_gib: stop }),
  };
}

function parseDrives(raw: unknown, errors: string[]): Record<string, Drive> {
  const table = obj(raw);
  if (table === undefined || Object.keys(table).length === 0) {
    errors.push("drive: expected at least one [drive.<name>] table");
    return {};
  }
  if (obj(at(table, "host")) === undefined)
    errors.push("drive.host: required Windows host drive table");
  return Object.fromEntries(
    Object.entries(table).map(([name, d]) => [
      name,
      parseDrive(`drive.${name}`, d, errors),
    ]),
  );
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

function validate(raw: unknown): { config: Config | null; errors: string[] } {
  const errors: string[] = [];
  const top = obj(raw);
  if (top === undefined)
    return { config: null, errors: ["top level: expected a table"] };
  onlyKeys(
    top,
    ["schema", "drive", "deny", "launcher", "budget", "measure"],
    "top level",
    errors,
  );
  if (at(top, "schema") !== 1)
    errors.push(`schema: expected 1, got ${JSON.stringify(at(top, "schema"))}`);

  const drive = parseDrives(at(top, "drive"), errors);
  const deny = parseDeny(at(top, "deny"), errors);
  const rawLaunchers = arr(at(top, "launcher"));
  const launcher = parseLaunchers(rawLaunchers, errors);
  // Budgets name launchers by their raw `command` value, valid or not.
  const known = new Set<unknown>(
    (rawLaunchers ?? []).map((l) => at(l, "command")),
  );
  const budget = parseBudgets(at(top, "budget") ?? [], known, errors);
  const measure = parseMeasure(at(top, "measure"), errors);

  return errors.length > 0
    ? { config: null, errors }
    : { config: { schema: 1, drive, deny, launcher, budget, measure }, errors };
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
  return validate(parsed.value);
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

// --- Measuring --------------------------------------------------------------------------------

async function freeBytes(path: string): Promise<number | null> {
  return (await space(path))?.free ?? null;
}

async function space(
  path: string,
): Promise<{ free: number; total: number } | null> {
  return attemptOr(() => {
    const s = statfsSync(path);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  }, null);
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

// --- Decision ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  const payload = readStdinJson();
  if (strAt(payload, "tool_name") !== "Bash") return;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || command === "") return;
  if (/\bSTORAGE_ASSERT_OVERRIDE=1\b/u.test(command)) return;

  const { config, errors } = await loadConfig();
  if (config === null) {
    // BATCHED(config fields): validate() collects every error before this point, so one denial
    // lists them all.
    decidePre(
      "deny",
      `storage-headroom: config ${CONFIG_PATH} is invalid, so the storage gate cannot judge any ` +
        `launch — refusing rather than guessing: ${errors.join("; ")}. Fix the config; ` +
        `STORAGE_ASSERT_OVERRIDE=1 in the command text passes a command meanwhile.`,
    );
  }

  const hit = matchLauncher(command, config.launcher);
  if (hit === null) return;

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
  if (low.length > 0 || hostUnreadable) {
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
    decidePre(
      "deny",
      `storage-headroom: refusing to launch ${hit.label} — ` +
        drives
          .map(
            (d) =>
              `${d.label} free ${gib(d.free)} (deny below ${gib(d.denyAt)}: the smaller of ${d.deny_gib} GiB and ${d.deny_pct}% of the drive)`,
          )
          .join(", ") +
        `. ${hostUnreadable ? "Host C: could not be measured; refusing new compute until the host is visible. " : ""}${config.deny.advice}${recovery}`,
    );
  }

  const warnings: string[] = [];
  for (const d of drives) {
    if (d.warnAt !== undefined && d.free !== null && d.free < d.warnAt) {
      const others = drives
        .filter((o) => o !== d)
        .map((o) => `${o.label} free ${gib(o.free)}`)
        .join(", ");
      warnings.push(
        `storage-headroom: WARNING ${d.label} free ${gib(d.free)} (< ${gib(d.warnAt)})` +
          `${others !== "" ? `; ${others}` : ""}. Launching ${hit.label} anyway — reclaim before it drops ` +
          `below ${gib(d.denyAt)}.`,
      );
    }
  }
  const cwd = strAt(payload, "cwd") ?? process.cwd();
  const budgetDenials: string[] = [];
  for (const b of config.budget) {
    if (!b.launchers.includes(hit.command)) continue;
    const status = await budgetStatus(b, command, cwd, config.measure);
    if (status?.denial !== undefined) budgetDenials.push(status.denial);
    if (status?.warning !== undefined) warnings.push(status.warning);
  }
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

await main();
