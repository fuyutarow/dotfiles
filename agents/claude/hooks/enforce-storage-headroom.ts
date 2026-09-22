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
// What it gates: commands that start experiments or builds — systemd-run, polysearch run,
// julia, cargo build/test/run/bench/install, agent-resource-run. Read-only commands, cleanup
// (rm, cargo clean, du, df) and git are never blocked — cleanup must stay possible when full.
//
// Thresholds (bytes free): host C: via /mnt/c ≥ 30 GiB, guest / ≥ 40 GiB. Below either →
// deny with the measured numbers. Host between 30 and 60 GiB → allow with a warning in
// `additionalContext` so the pressure is seen at every launch (stderr would reach no one).
// Per-language artifact budget: a cargo launch also sizes the target dir it writes into and
// warns above STORAGE_CARGO_TARGET_WARN_GIB (default 30) — see the section at the bottom.
// Override for a deliberate cleanup that itself needs to launch a build: put
// STORAGE_ASSERT_OVERRIDE=1 in the command text (it stays visible in the transcript).
//
// FAIL CLOSED on hook errors (register with run.sh --fail-closed, matcher "Bash").
//
// Thresholds are overridable through STORAGE_HOST_DENY_GIB / STORAGE_HOST_WARN_GIB /
// STORAGE_GUEST_DENY_GIB — for the test suite, which must see the gate go red without waiting
// for a real drive to fill. Authored in the firedancer session 2026-09-21 (host C: at 96%),
// installed here by the dotfiles owner the same night; house reclaim levers are `mise run
// reclaim` (guest) and `mise run reclaim:vhdx` / `reclaim:host` (the only ones that return
// space to C:). On a host with no /mnt/c (macOS) the host half is skipped, the guest half stays.

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
const gibEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw === undefined ? Number.NaN : Number(raw);
  return (Number.isFinite(n) && n >= 0 ? n : fallback) * GiB;
};
const HOST_DENY = gibEnv("STORAGE_HOST_DENY_GIB", 30);
const HOST_WARN = gibEnv("STORAGE_HOST_WARN_GIB", 60);
const GUEST_DENY = gibEnv("STORAGE_GUEST_DENY_GIB", 40);

const POS = String.raw`(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*`;
const PREFIX = String.raw`(?:(?:sudo|command|time|nice|exec|timeout\s+\S+)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+|[A-Za-z_]\w*=\S+\s+)*`;
const launcher = (name: string, sub = "") =>
  new RegExp(`${POS}${PREFIX}(?:\\S*\\/)?${name}\\b${sub}`);

// Every launcher takes PREFIX: `RUSTFLAGS=-C... cargo build` and `env X=1 julia` are the
// common spellings, and a gate that misses them is decoration (caught by the test suite on
// install, 2026-09-22 — the first draft applied PREFIX to only three of the five).
const LAUNCHERS: Array<[RegExp, string]> = [
  [launcher("systemd-run"), "systemd-run"],
  [launcher("agent-resource-run"), "agent-resource-run"],
  [launcher("polysearch", String.raw`\s+run\b`), "polysearch run"],
  [launcher("julia"), "julia"],
  [
    launcher("cargo", String.raw`\s+(?:build|test|run|bench|install)\b`),
    "cargo build/test/run",
  ],
];

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

function main(): void {
  const payload = readStdinJson();
  if (payload?.tool_name !== "Bash") return;
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || command === "") return;
  if (/\bSTORAGE_ASSERT_OVERRIDE=1\b/.test(command)) return;

  const hit = LAUNCHERS.find(([re]) => re.test(command));
  if (!hit) return;

  const host = freeBytes("/mnt/c");
  const guest = freeBytes("/");
  const hostLow = host !== null && host < HOST_DENY;
  const guestLow = guest !== null && guest < GUEST_DENY;

  if (hostLow || guestLow) {
    // BATCHED(host, guest): both drives are measured before this point and both numbers are in
    // the one reason below, so a caller short on both learns it from a single denial.
    decidePre(
      "deny",
      `storage-headroom: refusing to launch ${hit[1]} — host C: (WSL vhdx) free ${gib(host)} ` +
        `(deny below ${gib(HOST_DENY)}), guest / free ${gib(guest)} (deny below ${gib(GUEST_DENY)}). ` +
        `A full host drive takes down WSL and Windows together. Reclaim first (unreferenced ` +
        `.jls/.bin dumps under archives/*/artifacts, Rust target/ dirs, ~/.julia/compiled of old ` +
        `versions; \`mise run reclaim\` for the blind tier), then have the human compact the vhdx ` +
        `(\`mise run reclaim:vhdx\` prints the elevated procedure) — deleting inside WSL does not ` +
        `return space to the host until that step. STORAGE_ASSERT_OVERRIDE=1 in the command text ` +
        `bypasses this gate for a cleanup that must build.`,
    );
    // decidePre() is `never` (it exits) — no `return` here, or typecheck reports unreachable code.
  }
  const warnings: string[] = [];
  if (host !== null && host < HOST_WARN) {
    warnings.push(
      `storage-headroom: WARNING host C: free ${gib(host)} (< ${gib(HOST_WARN)}); guest / free ${gib(guest)}. ` +
        `Launching ${hit[1]} anyway — reclaim before it drops below ${gib(HOST_DENY)}.`,
    );
  }
  if (hit[1].startsWith("cargo")) {
    const w = cargoTargetWarning(command, payload?.cwd);
    if (w !== null) warnings.push(w);
  }
  // The warn channel is exit 0 + JSON additionalContext: on PreToolUse, stderr with exit 0 never
  // reaches the model. Until 2026-09-22 the host warning went to stderr, and measured that night
  // at 57 GiB free, every cargo launch printed it to nobody.
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

// --- Per-language artifact budget: cargo target/ ----------------------------------------------
//
// Drive thresholds fire only once the whole drive is nearly full; one build tree can grow far
// faster than that. Measured 2026-09-22: polysearch-rs/target reached 104 GiB (59 GiB of it
// target/debug/incremental) after one day of parallel agent builds across worktrees, while the
// drive gate stayed quiet until C: had under 60 GiB left. So a cargo launch also measures the
// target dir it will write into and, above the budget, says so with the review steps. Warn only:
// deciding what to delete in a build tree another session may be using is not this gate's call.
//
// Measuring is `du`, bounded, and cached per target dir (a 100 GiB tree takes seconds to walk,
// and agents launch cargo many times an hour).
const CARGO_WARN = gibEnv("STORAGE_CARGO_TARGET_WARN_GIB", 30);
const CACHE_MIN = Number(process.env.STORAGE_CARGO_CACHE_MIN ?? 20);
const DU_MS = 20_000;

function cargoTargetWarning(command: string, cwd: unknown): string | null {
  const target = cargoTargetDir(
    command,
    typeof cwd === "string" ? cwd : process.cwd(),
  );
  if (target === null || !existsSync(target)) return null;
  const size = measured(target);
  if (size === null) {
    return (
      `storage-headroom: cargo target ${target} could not be sized within ${DU_MS / 1000}s — ` +
      `a tree that slow to walk is usually very large; check it (du -sh ${target}) before building.`
    );
  }
  if (size.bytes < CARGO_WARN) return null;
  const incr =
    size.incremental > 0 ? ` (incremental ${gib(size.incremental)})` : "";
  return (
    `storage-headroom: cargo target ${target} is ${gib(size.bytes)}${incr}, over the ` +
    `${gib(CARGO_WARN)} cargo budget. Review before adding to it: \`cargo clean\` when no build is ` +
    `running in this tree; otherwise stale session dirs under target/*/incremental can go (the next ` +
    `build recompiles those crates). For agent/worktree builds set CARGO_INCREMENTAL=0 — incremental ` +
    `sessions are per-build and pile up — and share one CARGO_TARGET_DIR across worktrees.`
  );
}

// The target dir cargo will use: CARGO_TARGET_DIR (command text, then env), else the workspace
// root's .cargo/config.toml `target-dir`, else <workspace root>/target. The start dir honours a
// leading `cd <dir>` and `--manifest-path`, the two ways an agent points cargo elsewhere.
function cargoTargetDir(command: string, cwd: string): string | null {
  const home = homedir();
  const expand = (p: string) =>
    p.replace(/^~(?=\/|$)/, home).replace(/^["']|["']$/g, "");
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

type Size = { bytes: number; incremental: number; at: number };

function measured(target: string): Size | null {
  const cacheDir = join(
    homedir(),
    ".cache",
    "claude-hooks",
    "storage-headroom",
  );
  const cacheFile = join(
    cacheDir,
    `${createHash("sha1").update(target).digest("hex")}.json`,
  );
  try {
    const c = JSON.parse(readFileSync(cacheFile, "utf8")) as Size;
    if (Date.now() - c.at < CACHE_MIN * 60_000) return c;
  } catch {
    /* no or unreadable cache: measure */
  }
  const bytes = duBytes(target);
  if (bytes === null) return null;
  const incremental = ["debug", "release"]
    .map((p) => join(target, p, "incremental"))
    .filter((p) => existsSync(p))
    .reduce((sum, p) => sum + (duBytes(p) ?? 0), 0);
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
function duBytes(path: string): number | null {
  const r = Bun.spawnSync(["du", "-sk", path], {
    timeout: DU_MS,
    stdout: "pipe",
    stderr: "ignore",
  });
  if (r.exitCode !== 0 && r.stdout.length === 0) return null;
  const kib = Number(r.stdout.toString().split(/\s/)[0]);
  return Number.isFinite(kib) && kib > 0 ? kib * 1024 : null;
}

main();
