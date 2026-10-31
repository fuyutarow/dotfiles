// PreToolUse gate — refuse tool calls that may write when storage headroom is gone.
//
// Why a hook and not prose: 2026-09-21 23:50 JST the Windows host drive that holds the WSL2
// vhdx sat at 96% (46 GB free of 931 GB) while inside WSL `df /` still showed 483 GB free —
// the guest never sees the host pressure, and every experiment kept writing state dumps
// (58.7 GB of unreferenced .jls/.bin under archives/runs-2026-09-21/artifacts alone) and Rust
// build output (example-search-rs/target 62 GB). A full host drive takes down WSL and Windows
// together, so the assert has to sit in front of the commands that CREATE bytes, not in a
// CLAUDE.md sentence the model can forget under pressure.
//
// CONFIG vs MECHANISM. Everything that says WHAT is guarded lives in the declaration
// agents/hooks/storage-headroom.toml: the drives and their deny/warn sizes, the launcher commands, the per-language
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
// Authored in the example-repo session 2026-09-21 (host C: at 96%), installed here by the dotfiles
// owner the same night; config split out 2026-09-22.

import { createHash } from "node:crypto";
import {
  loadStorageHeadroom,
  nonNegative,
  nonEmptyString,
  storageLine as effective,
  type Drive,
} from "@dotfiles/shared/src/storage-headroom.ts";
import { readReclaimPlanCache } from "@dotfiles/shared/src/reclaim-plan-cache.ts";
import {
  access,
  mkdir,
  readFile,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  attempt,
  attemptOr,
  errorMessage,
} from "@dotfiles/shared/src/attempt.ts";
import {
  type ShellCommand,
  effective as effectiveCommand,
  parseShell,
} from "@dotfiles/shared/src/shell-syntax.ts";
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
} from "@dotfiles/shared/src/narrow.ts";

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

const GiB = 1024 ** 3;
// Shared with statusline; configuration migration belongs to capacity-unify.
export const TMP_INODE_WARN_PCT = 85;
export const TMP_INODE_DENY_PCT = 95;
const MAX_SCRATCHPAD_WRITE_BYTES = 64 * 1024;
const CONFIG_PATH =
  process.env["STORAGE_HEADROOM_CONFIG"] ??
  resolve(import.meta.dir, "../../../agents/hooks/storage-headroom.toml");

// --- Config: shape and validation -------------------------------------------------------------

export type Launcher = {
  command: string;
  subcommands?: string[];
  tasks?: string[];
};
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

function optionalNonNegative(
  v: unknown,
  where: string,
  errors: string[],
): number | undefined {
  return v === undefined ? undefined : nonNegative(v, where, errors);
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
  const read = await attempt(() => readFile(CONFIG_PATH, "utf8"));
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
export function matchLauncher(
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
        label: [l.command, m.groups?.["sub"], m.groups?.["task"]]
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

async function cargoCleanInProject(c: ShellCommand): Promise<boolean> {
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
    (await exists(join(c.cwd, "Cargo.toml"))) ||
    (manifestPath !== undefined &&
      (await exists(join(dirname(resolve(c.cwd, manifestPath)), "Cargo.toml"))))
  );
}

export async function isRecoveryOrRead(
  command: string,
  cwd: string,
): Promise<boolean> {
  const parsed = parseShell(command, cwd);
  if (parsed === undefined || parsed.commands.length === 0) return false;
  const commands = parsed.commands.filter(
    (c) => effectiveCommand(c) !== undefined,
  );
  if (commands.length === 0) return false;
  return (
    commands.length === parsed.commands.length &&
    (
      await Promise.all(
        commands.map(async (c) => {
          const eff = effectiveCommand(c);
          if (
            eff === undefined ||
            c.words[0] !== eff.name ||
            c.redirects.some(
              (r) => r.op !== "<" && r.op !== "<<" && r.op !== "<<<",
            )
          )
            return false;
          const [sub = "", third = ""] = eff.args;
          if (eff.name === "cargo" && sub === "clean")
            return cargoCleanInProject(c);
          // The released worker commands write bounded records and remain available for recovery.
          if (
            eff.name === "agx" &&
            sub === "worker" &&
            ["run", "check", "ls", "judge", "stats"].includes(third)
          )
            return true;
          if (eff.name === "disk-reclaim" || eff.name === "storage-headroom")
            return true;
          if (eff.name === "mise" && sub === "run")
            return third.startsWith("reclaim");
          if (eff.name === "m") return sub.startsWith("reclaim");
          if (eff.name === "jj")
            return (
              (sub === "workspace" &&
                (third === "forget" || third === "list")) ||
              sub === "abandon" ||
              sub === "st" ||
              sub === "log"
            );
          return READ_ONLY.has(eff.name);
        }),
      )
    ).every(Boolean)
  );
}

// --- Measuring --------------------------------------------------------------------------------

async function freeBytes(path: string): Promise<number | null> {
  return (await space(path))?.free ?? null;
}

function nowMs(): number {
  const injected = Number(process.env["STORAGE_HEADROOM_NOW_MS"]);
  return Number.isFinite(injected)
    ? injected
    : Temporal.Now.instant().epochMilliseconds;
}

type Space = {
  free: number;
  total: number;
  type?: number | undefined;
  files?: number | undefined;
  ffree?: number | undefined;
};

function inodeUse(sp: Space | null): number | null {
  if (
    sp === null ||
    ![0x01021994, 0x858458f6].includes(sp.type ?? 0) ||
    sp.files === undefined ||
    sp.ffree === undefined ||
    sp.files <= 0
  )
    return null;
  return (100 * (sp.files - sp.ffree)) / sp.files;
}

async function space(path: string): Promise<Space | null> {
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
  const cached = await attemptOr(async () => {
    const value = parseJson(await readFile(cacheFile, "utf8"));
    const free = num(at(value, "free"));
    const total = num(at(value, "total"));
    const atMs = num(at(value, "at"));
    const age = nowMs() - (atMs ?? 0);
    return free !== undefined &&
      total !== undefined &&
      atMs !== undefined &&
      age >= 0 &&
      age <= 2_000
      ? {
          free,
          total,
          type: num(at(value, "type")),
          files: num(at(value, "files")),
          ffree: num(at(value, "ffree")),
        }
      : null;
  }, null);
  if (cached !== null) return cached;

  const measuredSpace = await attemptOr(async () => {
    const s = await statfs(path);
    return {
      free: s.bavail * s.bsize,
      total: s.blocks * s.bsize,
      type: s.type,
      files: s.files,
      ffree: s.ffree,
    };
  }, null);
  if (measuredSpace === null) return null;
  await attempt(async () => {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
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
  if (process.env["STORAGE_HEADROOM_CONFIG"] !== undefined) return "";
  const stamp = join(
    homedir(),
    ".local/state/wsl-capacity-recover/last-request",
  );
  // First request, or an unavailable stamp: still attempt to queue recovery.
  const mtimeMs = await attemptOr(
    async () => (await stat(stamp)).mtimeMs,
    null,
  );
  if (
    mtimeMs !== null &&
    Temporal.Now.instant().epochMilliseconds - mtimeMs < 60_000
  )
    return " Automatic recovery was recently queued.";
  // The drive may already be critically low. systemd still gets a chance below.
  await attempt(async () => {
    await mkdir(dirname(stamp), { recursive: true });
    await writeFile(stamp, `${Temporal.Now.instant().epochMilliseconds}\n`);
  });
  // bounded: GNU timeout caps this non-blocking systemd recovery request at three seconds.
  const result = Bun.spawn(
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
  return (await result.exited) === 0
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
    async () => parseSize(parseJson(await readFile(cacheFile, "utf8"))),
    null,
  );
  if (
    cached !== null &&
    Temporal.Now.instant().epochMilliseconds - cached.at <
      m.cache_minutes * 60_000
  )
    return cached;
  const bytes = await duBytes(path, m);
  if (bytes === null) return null;
  let incremental = 0;
  if (withIncremental) {
    for (const part of ["debug", "release"]) {
      const p = join(path, part, "incremental");
      incremental += (await exists(p)) ? ((await duBytes(p, m)) ?? 0) : 0;
    }
  }
  const size: Size = {
    bytes,
    incremental,
    at: Temporal.Now.instant().epochMilliseconds,
  };
  // an unwritable cache only costs a re-measure next time
  await attempt(async () => {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(size));
  });
  return size;
}

// `du -sk` (KiB) is the spelling GNU and BSD du share; -b is GNU-only.
async function duBytes(
  path: string,
  m: Config["measure"],
): Promise<number | null> {
  const r = Bun.spawn(["du", "-sk", path], {
    timeout: m.du_timeout_seconds * 1000,
    stdout: "pipe",
    stderr: "ignore",
  });
  const [output, exitCode] = await Promise.all([
    new Response(r.stdout).text(),
    r.exited,
  ]);
  if (exitCode !== 0 && output.length === 0) return null;
  const kib = Number(output.split(/\s/u)[0]);
  return Number.isFinite(kib) && kib > 0 ? kib * 1024 : null;
}

// --- Locating an artifact ---------------------------------------------------------------------

const expand = (p: string) =>
  p.replace(/^~(?=\/|$)/u, homedir()).replaceAll(/^["']|["']$/gu, "");

// The target dir cargo will use: CARGO_TARGET_DIR (command text, then env), else the workspace
// root's .cargo/config.toml `target-dir`, else <workspace root>/target. The start dir honours a
// leading `cd <dir>` and `--manifest-path`, the two ways an agent points cargo elsewhere.
async function cargoTargetDir(
  command: string,
  cwd: string,
): Promise<string | null> {
  const envDir =
    /\bCARGO_TARGET_DIR=(\S+)/u.exec(command)?.[1] ??
    process.env["CARGO_TARGET_DIR"];
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
    if ((await exists(toml)) && (dir === null || (await isWorkspace(toml))))
      dir = d;
    if (dirname(d) === d) break;
  }
  if (dir === null) return null;
  const config = join(dir, ".cargo", "config.toml");
  if (await exists(config)) {
    const td = /^\s*target-dir\s*=\s*"([^"]+)"/mu.exec(
      await readFile(config, "utf8"),
    )?.[1];
    if (td !== undefined) return resolve(dir, expand(td));
  }
  return join(dir, "target");
}

async function isWorkspace(toml: string): Promise<boolean> {
  return /^\s*\[workspace\]/mu.test(await readFile(toml, "utf8"));
}

async function locate(
  b: Budget,
  command: string,
  cwd: string,
): Promise<string | null> {
  return b.locate === "cargo-target"
    ? cargoTargetDir(command, cwd)
    : expand(b.path ?? "");
}

// Drive thresholds fire only once the whole drive is nearly full; one build tree can grow far
// faster than that. Measured 2026-09-22: example-search-rs/target reached 104 GiB (59 GiB of it
// target/debug/incremental) after one day of parallel agent builds across worktrees, while the
// drive gate stayed quiet until C: had under 60 GiB left. A target over its deny budget blocks
// another build; cleanup remains a separate operation because another session may be using it.
async function budgetStatus(
  b: Budget,
  command: string,
  cwd: string,
  m: Config["measure"],
): Promise<{ warning?: string; denial?: string } | null> {
  const path = await locate(b, command, cwd);
  if (path === null || !(await exists(path))) return null;
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

export type Verdict =
  | { decision: "allow"; reason?: string }
  | { decision: "warn"; additionalContext: string }
  | { decision: "deny"; reason: string; additionalContext?: string };

/** Decide storage policy without reading hook stdin, printing an envelope, or exiting. */
export async function decide(payload: unknown): Promise<Verdict> {
  const toolName = strAt(payload, "tool_name") ?? "unknown";
  // Codex canonicalizes exec_command, shell, and its code-mode exec wrapper to Bash. Every
  // other tool is outside this disk-write gate unless it is one of the explicit file writers.
  if (
    toolName !== "Bash" &&
    !["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)
  ) {
    return { decision: "allow" };
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
  // Cleanup and explicit inspection commands remain available even if the declaration is broken.
  if (command !== undefined && (await isRecoveryOrRead(command, cwd)))
    return { decision: "allow" };

  const { config, errors } = await loadConfig();
  if (config === null) {
    // BATCHED(config fields): validate() collects every error before this point, so one denial
    // lists them all.
    return {
      decision: "deny",
      reason:
        `storage-headroom: config ${CONFIG_PATH} is invalid, so the storage gate cannot judge any ` +
        `tool call — refusing rather than guessing: ${errors.join("; ")}.`,
    };
  }

  const hit =
    command === undefined ? null : matchLauncher(command, config.launcher);

  const drives = await Promise.all(
    Object.values(config.drive).map(async (d) => {
      const sp = await space(d.path);
      const total = sp?.total ?? null;
      return Object.assign({}, d, {
        inodeUsed: inodeUse(sp),
        free: sp?.free ?? null,
        denyAt: effective(d.deny_gib, d.deny_pct, total),
        warnAt:
          d.warn_gib === undefined || d.warn_pct === undefined
            ? undefined
            : effective(d.warn_gib, d.warn_pct, total),
      });
    }),
  );
  // /tmp is guarded even when the byte-only declaration predates inode protection.
  if (
    !Object.values(config.drive).some((d) => d.path === "/tmp") &&
    (process.env["STORAGE_HEADROOM_CONFIG"] === undefined ||
      process.env["TMPDIR"] !== undefined)
  ) {
    const sp = await space(
      process.env["STORAGE_HEADROOM_CONFIG"] === undefined
        ? "/tmp"
        : (process.env["TMPDIR"] ?? dirname(CONFIG_PATH)),
    );
    if (inodeUse(sp) !== null)
      drives.push({
        label: "tmp /tmp",
        path: "/tmp",
        deny_gib: 0,
        deny_pct: 0,
        free: sp?.free ?? null,
        denyAt: 0,
        warnAt: undefined,
        inodeUsed: inodeUse(sp),
      });
  }
  const inodeWarnings = drives
    .filter((d) => d.inodeUsed !== null && d.inodeUsed >= TMP_INODE_WARN_PCT)
    .map(
      (d) =>
        `${d.label}: ${d.inodeUsed?.toFixed(1)}% inodes used (warn ${TMP_INODE_WARN_PCT}%, deny ${TMP_INODE_DENY_PCT}%); run disk-reclaim plan.`,
    );
  const inodeDeny = drives.some(
    (d) => d.inodeUsed !== null && d.inodeUsed >= TMP_INODE_DENY_PCT,
  );
  const low = drives.filter((d) => d.free !== null && d.free < d.denyAt);
  const warningLine = drives.filter(
    (d) => d.free !== null && d.free < (d.warnAt ?? d.denyAt),
  );
  const wsl =
    process.platform === "linux" &&
    (await exists("/proc/sys/kernel/osrelease")) &&
    (await readFile("/proc/sys/kernel/osrelease", "utf8"))
      .toLowerCase()
      .includes("microsoft");
  const hostUnreadable =
    wsl &&
    config.drive["host"] !== undefined &&
    (await freeBytes(config.drive["host"].path)) === null;
  if (low.length > 0 && smallScratchpadWrite && !inodeDeny) {
    return {
      decision: "allow",
      reason: `storage-headroom: allowing ${toolName} to write ${fileBytes} bytes under the session scratchpad (${scratchpadRoot}); limit ${MAX_SCRATCHPAD_WRITE_BYTES} bytes.`,
    };
  }
  if ((low.length > 0 || hostUnreadable || inodeDeny) && hit === null) {
    return denyLowSpace(drives, config.drive, inodeWarnings.join("\n"));
  }
  const warnings: string[] = [...inodeWarnings];
  for (const d of drives) {
    if (d.warnAt !== undefined && d.free !== null && d.free < d.warnAt) {
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
    // BATCHED(drives, budgets): include byte and inode warnings with all artifact denials.
    return {
      decision: "deny",
      reason: [...budgetDenials, ...warnings].join("; "),
    };
  }
  if (hit !== null && (warningLine.length > 0 || hostUnreadable || inodeDeny)) {
    const hostDrive = config.drive["host"];
    const hostLow =
      hostDrive !== undefined &&
      drives.some(
        (d) =>
          d.label === hostDrive.label && d.free !== null && d.free < d.denyAt,
      );
    const recovery = hostLow ? await requestRecovery() : "";
    // BATCHED(drives, budgets): both kinds of warning share the denial that stops the launcher.
    return denyLowSpace(
      drives,
      config.drive,
      `${hit.label} denied at its warn line.${hostUnreadable ? ` Host C could not be measured.${recovery}` : ""}`,
      warnings.join("\n"),
    );
  }
  if (warnings.length > 0)
    return { decision: "warn", additionalContext: warnings.join("\n") };
  return { decision: "allow" };
}

const ALLOWLIST =
  "Allowlist: cleanup: disk-reclaim, storage-headroom, mise run reclaim*, m reclaim*, jj workspace forget, jj abandon; read-only: df, du, dust, ls, cat, head, tail, rr, jj st, jj log, jj workspace list.";

async function denyLowSpace(
  drives: Array<{
    label: string;
    free: number | null;
    denyAt: number;
    warnAt?: number | undefined;
  }>,
  configured: Record<string, Drive>,
  note = "",
  additionalContext = "",
): Promise<Verdict> {
  const first = "free space: disk-reclaim run --tier blind --yes";
  const candidates = await readReclaimPlanCache(
    process.env["HOME"] ?? homedir(),
  );
  const reclaimAdvice =
    candidates.length > 0
      ? `Cached safe reclaim candidates: ${candidates
          .map(
            (c) => `${c.name} ${Math.round(c.bytes)} bytes (${gib(c.bytes)})`,
          )
          .join(", ")}.`
      : "Cached safe reclaim candidates unavailable or stale; refresh with disk-reclaim plan.";
  const driveLines = drives.map((drive) => {
    let free = "unmeasured";
    if (drive.free !== null)
      free = `${Math.round(drive.free)} bytes (${gib(drive.free)})`;
    return `${drive.label} free ${free} (deny line ${Math.round(drive.denyAt)} bytes (${gib(drive.denyAt)}))`;
  });
  const measuredDrives =
    drives.length > 0
      ? driveLines.join(", ")
      : Object.values(configured)
          .map((d) => `${d.label} unmeasured (deny line ${d.deny_gib} GiB)`)
          .join(", ");
  // BATCHED(drives): the denial details include every measured drive in one message.
  return {
    decision: "deny",
    reason: `${first}\n${measuredDrives}\n${reclaimAdvice}\n${ALLOWLIST}${note === "" ? "" : `\n${note}`}`,
    ...(additionalContext === "" ? {} : { additionalContext }),
  };
}
