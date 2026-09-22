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
// deny with the measured numbers. Host between 30 and 60 GiB → allow but print a warning line
// to stderr (visible in the tool result) so the pressure is seen at every launch.
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

import { statfsSync } from "node:fs";
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
  if (host !== null && host < HOST_WARN) {
    process.stderr.write(
      `storage-headroom: WARNING host C: free ${gib(host)} (< 60 GiB); guest / free ${gib(guest)}. ` +
        `Launching ${hit[1]} anyway — reclaim before it drops below ${gib(HOST_DENY)}.\n`,
    );
  }
}

main();
