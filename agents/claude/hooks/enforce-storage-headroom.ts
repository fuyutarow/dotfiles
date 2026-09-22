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
// FAIL CLOSED on hook errors (register with run.sh --fail-closed, matcher "Bash").
// Authored in the firedancer session 2026-09-21 (host C: at 96%), installed here by the dotfiles
// owner the same night; config split out 2026-09-22.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { decidePre, readStdinJson } from "./lib.ts";

const GiB = 1024 ** 3;
const CONFIG_PATH =
  process.env.STORAGE_HEADROOM_CONFIG ??
  join(import.meta.dir, "storage-headroom.toml");

// --- Config: shape and validation -------------------------------------------------------------

type Drive = {
  label: string;
  path: string;
  deny_gib: number;
  warn_gib?: number;
};
type Launcher = { command: string; subcommands?: string[] };
type Budget = {
  name: string;
  launchers: string[];
  locate: "path" | "cargo-target";
  path?: string;
  warn_gib: number;
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
// Every error is collected, not the first one — a fixed typo should not reveal the next.
function validate(raw: any): { config: Config | null; errors: string[] } {
  const errors: string[] = [];
  const isObj = (v: unknown): v is Record<string, any> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  const num = (v: unknown, at: string) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      errors.push(
        `${at}: expected a non-negative number, got ${JSON.stringify(v)}`,
      );
    }
  };
  const str = (v: unknown, at: string) => {
    if (typeof v !== "string" || v === "")
      errors.push(`${at}: expected a non-empty string`);
  };
  const strs = (v: unknown, at: string) => {
    if (
      !Array.isArray(v) ||
      v.length === 0 ||
      v.some((s) => typeof s !== "string" || s === "")
    ) {
      errors.push(`${at}: expected a non-empty array of non-empty strings`);
    }
  };
  const only = (o: Record<string, unknown>, keys: string[], at: string) => {
    for (const k of Object.keys(o))
      if (!keys.includes(k)) errors.push(`${at}: unknown key '${k}'`);
  };

  if (!isObj(raw))
    return { config: null, errors: ["top level: expected a table"] };
  only(
    raw,
    ["schema", "drive", "deny", "launcher", "budget", "measure"],
    "top level",
  );
  if (raw.schema !== 1)
    errors.push(`schema: expected 1, got ${JSON.stringify(raw.schema)}`);

  if (!isObj(raw.drive) || Object.keys(raw.drive).length === 0) {
    errors.push("drive: expected at least one [drive.<name>] table");
  } else {
    const drive = (at: string, d: unknown) => {
      if (!isObj(d)) return void errors.push(`${at}: expected a table`);
      only(d, ["label", "path", "deny_gib", "warn_gib"], at);
      str(d.label, `${at}.label`);
      str(d.path, `${at}.path`);
      num(d.deny_gib, `${at}.deny_gib`);
      if (d.warn_gib !== undefined) num(d.warn_gib, `${at}.warn_gib`);
    };
    for (const [name, d] of Object.entries(raw.drive))
      drive(`drive.${name}`, d);
  }

  if (!isObj(raw.deny)) errors.push("deny: expected a [deny] table");
  else {
    only(raw.deny, ["advice"], "deny");
    str(raw.deny.advice, "deny.advice");
  }

  const launchers: unknown = raw.launcher;
  if (!Array.isArray(launchers) || launchers.length === 0) {
    errors.push("launcher: expected at least one [[launcher]]");
  } else {
    launchers.forEach((l, i) => {
      const at = `launcher[${i}]`;
      if (!isObj(l)) return void errors.push(`${at}: expected a table`);
      only(l, ["command", "subcommands"], at);
      str(l.command, `${at}.command`);
      if (
        typeof l.command === "string" &&
        !/^[A-Za-z0-9._-]+$/.test(l.command)
      ) {
        errors.push(`${at}.command: '${l.command}' is not a bare command name`);
      }
      if (l.subcommands !== undefined) strs(l.subcommands, `${at}.subcommands`);
    });
  }

  const budgets: unknown = raw.budget ?? [];
  if (!Array.isArray(budgets))
    errors.push("budget: expected [[budget]] tables");
  else {
    const known = new Set(
      Array.isArray(launchers) ? launchers.map((l: any) => l?.command) : [],
    );
    budgets.forEach((b, i) => {
      const at = `budget[${i}]`;
      if (!isObj(b)) return void errors.push(`${at}: expected a table`);
      only(
        b,
        [
          "name",
          "launchers",
          "locate",
          "path",
          "warn_gib",
          "incremental",
          "advice",
        ],
        at,
      );
      str(b.name, `${at}.name`);
      strs(b.launchers, `${at}.launchers`);
      for (const l of Array.isArray(b.launchers) ? b.launchers : []) {
        if (!known.has(l))
          errors.push(`${at}.launchers: '${l}' is not a [[launcher]] command`);
      }
      if (b.locate !== "path" && b.locate !== "cargo-target") {
        errors.push(`${at}.locate: expected "path" or "cargo-target"`);
      }
      if (b.locate === "path") str(b.path, `${at}.path`);
      num(b.warn_gib, `${at}.warn_gib`);
      if (b.incremental !== undefined && typeof b.incremental !== "boolean") {
        errors.push(`${at}.incremental: expected true or false`);
      }
      str(b.advice, `${at}.advice`);
    });
  }

  if (!isObj(raw.measure)) errors.push("measure: expected a [measure] table");
  else {
    only(raw.measure, ["du_timeout_seconds", "cache_minutes"], "measure");
    num(raw.measure.du_timeout_seconds, "measure.du_timeout_seconds");
    num(raw.measure.cache_minutes, "measure.cache_minutes");
  }

  return errors.length > 0
    ? { config: null, errors }
    : { config: { ...raw, budget: budgets } as Config, errors };
}

function loadConfig(): { config: Config | null; errors: string[] } {
  let text: string;
  try {
    text = readFileSync(CONFIG_PATH, "utf8");
  } catch (e) {
    return {
      config: null,
      errors: [`cannot read ${CONFIG_PATH}: ${(e as Error).message}`],
    };
  }
  try {
    return validate(Bun.TOML.parse(text));
  } catch (e) {
    return {
      config: null,
      errors: [`${CONFIG_PATH} is not valid TOML: ${(e as Error).message}`],
    };
  }
}

// --- Launch matching --------------------------------------------------------------------------

const POS = String.raw`(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*`;
const PREFIX = String.raw`(?:(?:sudo|command|time|nice|exec|timeout\s+\S+)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|[A-Za-z_]\w*=\S+\s+)*`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Every launcher takes PREFIX: `RUSTFLAGS=-C... cargo build` and `env X=1 julia` are the
// common spellings, and a gate that misses them is decoration (caught by the test suite on
// install, 2026-09-22 — the first draft applied PREFIX to only three of the five).
function matchLauncher(
  command: string,
  launchers: Launcher[],
): { command: string; label: string } | null {
  for (const l of launchers) {
    const sub = l.subcommands
      ? String.raw`\s+(${l.subcommands.map(esc).join("|")})\b`
      : "";
    const m = new RegExp(
      `${POS}${PREFIX}(?:\\S*\\/)?${esc(l.command)}\\b${sub}`,
    ).exec(command);
    if (m)
      return {
        command: l.command,
        label: l.subcommands ? `${l.command} ${m[2]}` : l.command,
      };
  }
  return null;
}

// --- Measuring --------------------------------------------------------------------------------

function freeBytes(path: string): number | null {
  try {
    const s = statfsSync(path);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function gib(n: number | null): string {
  return n === null ? "unmeasured" : `${(n / GiB).toFixed(1)} GiB`;
}

type Size = { bytes: number; incremental: number; at: number };

// Cached per artifact path: a 100 GiB tree takes seconds to walk, and agents launch builds many
// times an hour.
function measured(
  path: string,
  withIncremental: boolean,
  m: Config["measure"],
): Size | null {
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
  try {
    const c = JSON.parse(readFileSync(cacheFile, "utf8")) as Size;
    if (Date.now() - c.at < m.cache_minutes * 60_000) return c;
  } catch {
    /* no or unreadable cache: measure */
  }
  const bytes = duBytes(path, m);
  if (bytes === null) return null;
  const incremental = withIncremental
    ? ["debug", "release"]
        .map((p) => join(path, p, "incremental"))
        .filter((p) => existsSync(p))
        .reduce((sum, p) => sum + (duBytes(p, m) ?? 0), 0)
    : 0;
  const size: Size = { bytes, incremental, at: Date.now() };
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(size));
  } catch {
    /* an unwritable cache only costs a re-measure next time */
  }
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
  const kib = Number(r.stdout.toString().split(/\s/)[0]);
  return Number.isFinite(kib) && kib > 0 ? kib * 1024 : null;
}

// --- Locating an artifact ---------------------------------------------------------------------

const expand = (p: string) =>
  p.replace(/^~(?=\/|$)/, homedir()).replace(/^["']|["']$/g, "");

// The target dir cargo will use: CARGO_TARGET_DIR (command text, then env), else the workspace
// root's .cargo/config.toml `target-dir`, else <workspace root>/target. The start dir honours a
// leading `cd <dir>` and `--manifest-path`, the two ways an agent points cargo elsewhere.
function cargoTargetDir(command: string, cwd: string): string | null {
  const envDir =
    /\bCARGO_TARGET_DIR=(\S+)/.exec(command)?.[1] ??
    process.env.CARGO_TARGET_DIR;
  let start = cwd;
  const cd = /(?:^|[;&|(]\s*)cd\s+(\S+)/.exec(command)?.[1];
  if (cd !== undefined) start = resolve(cwd, expand(cd));
  const manifest = /--manifest-path[=\s]+(\S+)/.exec(command)?.[1];
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
    const td = /^\s*target-dir\s*=\s*"([^"]+)"/m.exec(
      readFileSync(config, "utf8"),
    )?.[1];
    if (td !== undefined) return resolve(dir, expand(td));
  }
  return join(dir, "target");
}

function isWorkspace(toml: string): boolean {
  return /^\s*\[workspace\]/m.test(readFileSync(toml, "utf8"));
}

function locate(b: Budget, command: string, cwd: string): string | null {
  return b.locate === "cargo-target"
    ? cargoTargetDir(command, cwd)
    : expand(b.path ?? "");
}

// Drive thresholds fire only once the whole drive is nearly full; one build tree can grow far
// faster than that. Measured 2026-09-22: polysearch-rs/target reached 104 GiB (59 GiB of it
// target/debug/incremental) after one day of parallel agent builds across worktrees, while the
// drive gate stayed quiet until C: had under 60 GiB left. Warn only: deciding what to delete in
// a tree another session may be using is not this gate's call.
function budgetWarning(
  b: Budget,
  command: string,
  cwd: string,
  m: Config["measure"],
): string | null {
  const path = locate(b, command, cwd);
  if (path === null || !existsSync(path)) return null;
  const size = measured(path, b.incremental === true, m);
  if (size === null) {
    return (
      `storage-headroom: ${b.name} ${path} could not be sized within ${m.du_timeout_seconds}s — ` +
      `a tree that slow to walk is usually very large; check it (du -sh ${path}) before building.`
    );
  }
  if (size.bytes < b.warn_gib * GiB) return null;
  const incr =
    size.incremental > 0 ? ` (incremental ${gib(size.incremental)})` : "";
  return (
    `storage-headroom: ${b.name} ${path} is ${gib(size.bytes)}${incr}, over the ` +
    `${gib(b.warn_gib * GiB)} ${b.name} budget. Review before adding to it: ${b.advice}`
  );
}

// --- Decision ---------------------------------------------------------------------------------

function main(): void {
  const payload = readStdinJson();
  if (payload?.tool_name !== "Bash") return;
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || command === "") return;
  if (/\bSTORAGE_ASSERT_OVERRIDE=1\b/.test(command)) return;

  const { config, errors } = loadConfig();
  if (config === null) {
    // BATCHED(config fields): validate() collects every error before this point, so one denial
    // lists them all.
    decidePre(
      "deny",
      `storage-headroom: config ${CONFIG_PATH} is invalid, so the storage gate cannot judge any ` +
        `launch — refusing rather than guessing: ${errors.join("; ")}. Fix it with the Edit tool; ` +
        `STORAGE_ASSERT_OVERRIDE=1 in the command text passes a command meanwhile.`,
    );
  }

  const hit = matchLauncher(command, config.launcher);
  if (!hit) return;

  const drives = Object.values(config.drive).map((d) => ({
    ...d,
    free: freeBytes(d.path),
  }));
  const low = drives.filter(
    (d) => d.free !== null && d.free < d.deny_gib * GiB,
  );
  if (low.length > 0) {
    // BATCHED(drives): every drive is measured before this point and all of them are in the one
    // reason below, so a caller short on both learns it from a single denial.
    decidePre(
      "deny",
      `storage-headroom: refusing to launch ${hit.label} — ` +
        drives
          .map(
            (d) =>
              `${d.label} free ${gib(d.free)} (deny below ${gib(d.deny_gib * GiB)})`,
          )
          .join(", ") +
        `. ${config.deny.advice}`,
    );
  }

  const warnings: string[] = [];
  for (const d of drives) {
    if (
      d.warn_gib !== undefined &&
      d.free !== null &&
      d.free < d.warn_gib * GiB
    ) {
      const others = drives
        .filter((o) => o !== d)
        .map((o) => `${o.label} free ${gib(o.free)}`)
        .join(", ");
      warnings.push(
        `storage-headroom: WARNING ${d.label} free ${gib(d.free)} (< ${gib(d.warn_gib * GiB)})` +
          `${others ? `; ${others}` : ""}. Launching ${hit.label} anyway — reclaim before it drops ` +
          `below ${gib(d.deny_gib * GiB)}.`,
      );
    }
  }
  const cwd = typeof payload?.cwd === "string" ? payload.cwd : process.cwd();
  for (const b of config.budget) {
    if (!b.launchers.includes(hit.command)) continue;
    const w = budgetWarning(b, command, cwd, config.measure);
    if (w !== null) warnings.push(w);
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

main();
