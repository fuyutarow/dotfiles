#!/usr/bin/env bun
// Claude Code statusLine — two lines, bun/TypeScript. mac & WSL.
// Source of truth: ~/dotfiles/agents/claude/statusline-command.ts
//   -> symlinked to ~/.claude/statusline-command.ts by scripts/link-dots.sh
//   invoked as: bun ~/.claude/statusline-command.ts   (bun is the house Node runtime,
//   present on both OSes via Brewfile). If bun is somehow absent the bar goes blank —
//   the one regression vs the old POSIX-sh version, accepted because bun is the house
//   standard; the docs officially bless a JS/TS statusline (stdin JSON -> stdout).
//   line 1: PS1 mirror   user@host:MM-DD HH:MM|cwd    (mirrors .zshrc PROMPT)
//   line 2: Model | Eff | Ctx: <k>·<pct>% | Rate: 5h/7d | [wt] | <branch> | (+add,-del)
//   Eff:  live /effort level (.effort.level) + ✦ when extended thinking on; hidden when
//         the model has no reasoning-effort param (field absent). ultracode -> xhigh.
//   Ctx%: context_window.used_percentage, colored green <70 / yellow <90 / red >=90.
//   Rate: rate_limits 5h & 7d used_percentage (Pro/Max, after 1st API resp), same colors.
//         Each window shows its reset from .resets_at (Unix epoch s) as ⟳<clock>(remaining):
//           5h -> ⟳HH:MM(<h>h<mm>m)          same-window, so time-of-day only
//           7d -> ⟳MM-DD HH:MM(<d>d<hh>h)     multi-day horizon, so date + time
//         (7d falls back to <h>h<mm>m remaining inside its final day.) A window's reset is
//         omitted when its .resets_at is absent; each window is independently optional.
//   wt:   worktree.name — shown only in --worktree sessions.
//   Fit:  line 2 stays on one row when the pane is wide; when it would overflow $COLUMNS
//         the Rate/wt/branch/diff tail wraps to a 3rd row. Width is measured in BYTES of
//         the SGR-stripped string — multibyte glyphs over-count, biasing us to wrap a hair
//         early (safe, never truncates). Claude Code exports COLUMNS (v2.1.153+); unset ->
//         assume wide, stay one row.
// Zero runtime deps on purpose: this file is executed standalone as `bun <path>` with no
// package.json / node_modules beside it, so nothing importable (zod, ts-pattern) resolves.
// Static safety comes from the all-optional StatusInput shape + native `!= null` narrowing.
// Input: JSON via stdin from Claude Code.

import { hostname as osHostname, userInfo } from "node:os";
import { execFileSync } from "node:child_process";

interface RateWindow {
  used_percentage?: number;
  resets_at?: number; // Unix epoch seconds
}
interface StatusInput {
  cwd?: string;
  workspace?: { current_dir?: string };
  model?: { display_name?: string; id?: string };
  context_window?: {
    total_input_tokens?: number;
    current_usage?: { input_tokens?: number };
    used_percentage?: number;
  };
  cost?: { total_lines_added?: number; total_lines_removed?: number };
  effort?: { level?: string };
  rate_limits?: { five_hour?: RateWindow; seven_day?: RateWindow };
  thinking?: { enabled?: boolean };
  worktree?: { name?: string };
}

const HOME = process.env.HOME ?? "";

// --- ANSI / glyph constants (literals so segment assembly stays readable) ---
const ESC = "\x1b";
const RST = `${ESC}[0m`;
const DIM = `${ESC}[2m`;
const SEP = ` ${DIM}|${RST} `;
const SPARK = "✦"; // extended-thinking marker
const MID = "·"; //   meter middot
const BR = "⎇"; //    git branch glyph
const RSET = "⟳"; //  rate-limit reset marker

const pad2 = (n: number) => String(n).padStart(2, "0");

// zsh %~ : leading $HOME -> ~
function shorten(p: string): string {
  if (p === HOME) return "~";
  if (HOME && p.startsWith(`${HOME}/`)) return `~${p.slice(HOME.length)}`;
  return p;
}

// line 1: env-derived PS1 mirror. Needs no JSON, so it always renders.
function line1(cwd: string): string {
  const user = userInfo().username;
  const host = osHostname().split(".")[0];
  const d = new Date();
  const dt = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return (
    `${ESC}[35m${user}${RST}@${ESC}[33m${host}${RST}:` +
    `${ESC}[36m${dt}${RST}|${ESC}[32m${shorten(cwd)}${RST}`
  );
}

// --- read stdin JSON (graceful: render line 1 + hint if it is missing/invalid) ---
const raw = await Bun.stdin.text();
let data: StatusInput;
try {
  data = JSON.parse(raw); // any -> StatusInput at the trust boundary (no `as` cast)
} catch {
  process.stdout.write(`${line1(process.env.PWD ?? "")}\n`);
  process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
  process.exit(0);
}

// --- extract fields (same fallbacks as the jq pass in the old sh version) ---
// || (not ??) here: an empty cwd string must ALSO fall through to PWD, matching the old
// sh's `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
const cwd = data.cwd || data.workspace?.current_dir || process.env.PWD || "";
let model = data.model?.display_name ?? "";
const modelId = data.model?.id ?? "";
const ctxTok =
  data.context_window?.total_input_tokens ??
  data.context_window?.current_usage?.input_tokens ??
  0;
const add = data.cost?.total_lines_added ?? 0;
const del = data.cost?.total_lines_removed ?? 0;
const effort = data.effort?.level; // string | undefined
const ctxPct = data.context_window?.used_percentage; // number | undefined
const rl5 = data.rate_limits?.five_hour?.used_percentage;
const rl7 = data.rate_limits?.seven_day?.used_percentage;
const thinking = data.thinking?.enabled === true;
const wt = data.worktree?.name; // string | undefined
const rl5Reset = data.rate_limits?.five_hour?.resets_at;
const rl7Reset = data.rate_limits?.seven_day?.resets_at;

// model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a version,
// else derive "Family X.Y" from the id (claude-opus-4-8[1m] -> Opus 4.8).
if (!/[0-9]/.test(model)) {
  const base = modelId.replace(/^claude-/, "").split("[")[0];
  const dash = base.indexOf("-");
  const fam = dash === -1 ? base : base.slice(0, dash);
  const ver = (dash === -1 ? "" : base.slice(dash + 1)).replace(/-/g, ".");
  if (fam) {
    const famCap = fam.charAt(0).toUpperCase() + fam.slice(1);
    model = ver ? `${famCap} ${ver}` : famCap;
  }
}
if (!model) model = "?";
// Trim the verbose extended-context tag: "Opus 4.8 (1M context)" -> "Opus 4.8 (1M)".
if (model.endsWith(" context)"))
  model = `${model.slice(0, -" context)".length)})`;

// Ctx: live context tokens -> 100800 -> "100.8k"
const ctx = ctxTok >= 1000 ? `${(ctxTok / 1000).toFixed(1)}k` : String(ctxTok);

// git branch from cwd (segment omitted if not a repo)
let branch: string | undefined;
try {
  branch = execFileSync(
    "git",
    ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
    {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    },
  ).trim();
} catch {
  branch = undefined;
}

// Usage-percent -> rounded int + threshold color (green <70 / yellow <90 / red >=90).
function pctColor(i: number): string {
  if (i >= 90) return "38;5;167";
  if (i >= 70) return "38;5;178";
  return "38;5;71";
}
function pctFmt(p: number): { pct: number; col: string } {
  const pct = Math.round(p);
  return { pct, col: pctColor(pct) };
}

const nowSec = () => Math.floor(Date.now() / 1000);

// 5h reset: epoch s -> "⟳HH:MM(<h>h<mm>m)" — local clock + time remaining.
function reset5(epoch: number): string {
  const d = new Date(epoch * 1000);
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const s = Math.max(0, epoch - nowSec());
  const rem = `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`;
  return `${RSET}${clock}(${rem})`;
}

// 7d reset: epoch s -> "⟳MM-DD HH:MM(<d>d<hh>h)" — date + local clock + time remaining.
// The 7d horizon spans days, so it carries a date (unlike 5h) and counts down in days+hours;
// inside the final day it drops to the 5h-style hours+minutes.
function reset7(epoch: number): string {
  const d = new Date(epoch * 1000);
  const clock =
    `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const s = Math.max(0, epoch - nowSec());
  const rem =
    s >= 86400
      ? `${Math.floor(s / 86400)}d${pad2(Math.floor((s % 86400) / 3600))}h`
      : `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`;
  return `${RSET}${clock}(${rem})`;
}

// HEAD = identity: Model [| Eff ✦] | Ctx [· pct%]
let head = `${ESC}[38;5;30mModel:${RST} ${model}`;
if (effort) {
  head += `${SEP}${ESC}[38;5;209mEff:${RST} ${effort}`;
  if (thinking) head += `${ESC}[38;5;222m${SPARK}${RST}`;
}
head += `${SEP}${ESC}[38;5;66mCtx:${RST} ${ctx}`;
if (ctxPct != null) {
  const { pct, col } = pctFmt(ctxPct);
  head += ` ${DIM}${MID}${RST} ${ESC}[${col}m${pct}%${RST}`;
}

// TAIL = limits/repo: [Rate 5h·7d] [| wt] [| branch] | (+add,-del)
let tail = "";
if (rl5 != null || rl7 != null) {
  tail = `${ESC}[38;5;108mRate:${RST}`;
  if (rl5 != null) {
    const { pct, col } = pctFmt(rl5);
    tail += ` 5h ${ESC}[${col}m${pct}%${RST}`;
    if (rl5Reset != null) tail += ` ${DIM}${reset5(rl5Reset)}${RST}`;
  }
  if (rl7 != null) {
    const { pct, col } = pctFmt(rl7);
    tail += ` ${DIM}${MID}${RST} 7d ${ESC}[${col}m${pct}%${RST}`;
    if (rl7Reset != null) tail += ` ${DIM}${reset7(rl7Reset)}${RST}`;
  }
}
const join = (t: string, seg: string) => (t ? t + SEP : "") + seg;
if (wt) tail = join(tail, `${ESC}[38;5;140mwt: ${wt}${RST}`);
if (branch) tail = join(tail, `${ESC}[38;5;96m${BR} ${branch}${RST}`);
tail = join(tail, `${ESC}[38;5;178m(+${add},-${del})${RST}`);

// Visible width = strip SGR escapes, count BYTES (multibyte glyphs over-count, biasing us
// to wrap a hair early — safe, never truncates). Reserve ~2 cols for Claude Code's indent.
const vlen = (s: string): number =>
  Buffer.byteLength(s.replace(/\x1b\[[0-9;]*m/g, ""), "utf8");
const cols = Number(process.env.COLUMNS);
const usable = (Number.isFinite(cols) && cols > 0 ? cols : 999) - 2;

// --- render: one row if head + " | " + tail fits $COLUMNS, else wrap tail to row 3 ---
const out2 =
  vlen(head) + 3 + vlen(tail) <= usable
    ? head + SEP + tail
    : `${head}\n${tail}`;
process.stdout.write(`${line1(cwd)}\n${out2}`);
