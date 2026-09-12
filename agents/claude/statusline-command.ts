#!/usr/bin/env bun
// Claude Code statusLine — bun/TypeScript. mac & WSL.
// Source of truth: ~/dotfiles/agents/claude/statusline-command.ts
//   -> symlinked to ~/.claude/statusline-command.ts by scripts/link-dots.sh
//   invoked as: bun ~/.claude/statusline-command.ts   (bun is the house Node runtime,
//   present on both OSes via Brewfile). If bun is somehow absent the bar goes blank —
//   the one regression vs the old POSIX-sh version, accepted because bun is the house
//   standard; the docs officially bless a JS/TS statusline (stdin JSON -> stdout).
//
// REORGANIZED 2026-09-12 (on request): rows are now grouped by MEANING, one category per
// row, instead of the prior HEAD/TAIL layout that mixed config+budget+background on one row
// and budget+repo on another (Ctx sat next to Model/Effort while Rate — the other budget
// figure — sat next to the git branch). The prior layout also let PS1-mirror row 1 grow
// arbitrarily long (cwd + account email + session name all on one line) — the concrete
// complaint that triggered this pass. Rows, in order:
//   1 identity (PS1 mirror)   user@host:MM-DD HH:MM|cwd — ONLY this; nothing appended, ever
//   2 identity (resume)       Session: <uuid> — unchanged from before this reorg
//   3 identity (account)      <email> · <name> — what row 1 used to carry; omitted if both absent
//   4 config                  Model | Effort[+WF]
//   5 budget                  Ctx: <k>·<pct>% | Rate: 5h..% · 7d..% — Ctx and Rate are BOTH
//                             "how much room is left"; previously torn across two rows
//   6 repo                    <branch> | (+add,-del) [| wt: <name>]
//   7 background (conditional) Job: ... — only rendered when a job or orphan exists
// Every row is now printed unconditionally on its own line: the old byte-width "does HEAD+TAIL
// fit $COLUMNS" wrap logic is GONE. It existed only because two semantically different rows
// were being squeezed onto one line when they'd fit; once every row holds exactly one category,
// nothing needs to conditionally merge with anything else, so there was nothing left for that
// logic to decide. Every row can still overflow $COLUMNS on its own (the terminal wraps it,
// same as line 1's cwd always could) — that was never something this script controlled.
//
//   line 1: PS1 mirror ONLY  user@host:MM-DD HH:MM|cwd
//           Mirrors .zshrc's PROMPT — see zsh/zshrc if this format ever needs to change, and
//           change both together. Account email and session name USED to ride this row (see the
//           2026-09-05 through 2026-09-11 history below); moved to their own row 2026-09-12
//           because a long cwd plus both of those made this row the least readable one in the
//           whole statusline, and it is the one row that gets read on every single glance.
//   line 2: session_id — the FULL uuid, on its own row, labelled like every other segment.
//           NOT truncated: `claude --resume <id>` matches an id EXACTLY and documents no
//           prefix form, so a shortened id stops being a resume handle. The label is free
//           here because tmux/tmux.conf sets `word-separators ' \t'` — a hyphen is not a
//           separator, so its DoubleClick1Pane -> select-word binding grabs the whole uuid
//           and nothing else, label or no label. NOTHING rides after the uuid on this row,
//           by design, both before and after the 2026-09-12 reorg: appending text here would
//           either break that one-gesture double-click copy (if it ever wrapped a narrow pane)
//           or, at best, buy nothing since row 3 exists for exactly that overflow now. Omitted
//           when the field is absent (older CLIs).
//   line 3: <email> · <name> — what used to ride line 1 (see its note above), moved here
//           2026-09-12. Both are STATIC identity, like the uuid on line 2, which is why they
//           sit directly below it rather than back up on line 1: grouping by "how often does
//           this change" (never, this render) is exactly why line 1 (which DOES change: cwd,
//           the clock) shouldn't carry them. Whole row omitted when both are absent.
//     email:  read from ~/.claude.json's `oauthAccount`, and deliberately NOT from
//             ~/.claude/.credentials.json, which holds live OAuth tokens this script has no
//             business opening. Omitted whenever that field is unreadable.
//     name:   the actual field `claude agents --json` returns per session (confirmed live
//             2026-08-28), and what `/list-agents` addresses it by — NOT `session_name` from
//             stdin, which is a DIFFERENT, independently-tracked field that can hold an
//             AI-generated conversation title instead (caught live 2026-08-28: one session
//             showed its title here while `claude agents --json` still had the real name).
//             Not delivered on stdin either way — getting it means shelling out to
//             `claude agents --json` ourselves; see agentName()'s own header note for the full
//             caching story (TTL, cost, the restart-race case) — unchanged by this reorg.
//   line 4: config = Model | Effort[+WF]
//           Neither carries a label (dropped on request 2026-09-05) — each one's old label
//           color moved onto its own value instead, joined by the normal SEP pipe (a same-day
//           KMID "・" divider, then a bare space, were both tried and cut — SEP won for
//           consistency with the rest of the file): "Sonnet 5 | xhigh+WF". A ✦ extended-thinking
//           marker rode here too, same day, until removed — see the "config = " comment further
//           down for why it didn't actually track what its name implied.
//     Eff:  live /effort level (.effort.level); hidden when the model has no reasoning-effort
//           param (field absent). ultracode -> xhigh.
//     +WF:  "dynamic workflow" — ultracode's auto multi-agent orchestration — folded into the
//           effort value (Tailwind violet-500 "+WF" suffix, matching Claude Code's own /effort
//           slider "ultracode" label — picked 2026-09-11, green until then) instead of a
//           separate segment, on request 2026-09-05. Present only while BOTH hold:
//           `ultracode: true` in the CLI's live ~/.claude/settings.json, AND this render's live
//           `.effort.level` actually reads back `xhigh` — ultracode forces xhigh whenever it
//           genuinely engages, and a higher-precedence effort lever (env var, an interactive
//           /effort choice, a per-model modelSettings entry the CLI itself writes back — see
//           ultracodeConfigured()'s note) can silently push effort off xhigh and turn the
//           orchestration OFF even though the setting still reads true. Reading the LIVE value
//           instead of trusting the setting is what makes this catch that silent case: the
//           suffix just disappears (no red "off" marker — absence IS "off").
//   line 5: budget = Ctx: <k>·<pct>% | Rate: 5h..% · 7d..%
//           Ctx and Rate are the SAME kind of fact — "how much of a shared allowance is used up"
//           — and used to sit on different rows (Ctx with Model/Effort, Rate with the git
//           branch) purely because that was how much fit per row under the old width-fitting
//           scheme, not because they meant different things. Merged onto one row 2026-09-12.
//     Ctx%: context_window.used_percentage, colored green <70 / yellow <90 / red >=90.
//     Rate: rate_limits 5h & 7d used_percentage (Pro/Max, after 1st API resp), same colors.
//           Each window shows its reset from .resets_at (Unix epoch s) as ⟳<clock>(remaining):
//             5h -> ⟳HH:MM(<h>h<mm>m)          same-window, so time-of-day only
//             7d -> ⟳MM-DD HH:MM(<d>d<hh>h)     multi-day horizon, so date + time
//           (7d falls back to <h>h<mm>m remaining inside its final day.) A window's reset is
//           omitted when its .resets_at is absent; each window is independently optional.
//   line 6: repo = <branch> | (+add,-del) [| wt: <name>]
//           Everything about the git working state the harness is sitting in, together —
//           branch used to sit on the same row as Rate (a budget fact) for no reason but shared
//           width; now it sits with the diff stat and the worktree name, which are the same
//           category as it (repo state), not with Rate (budget). Omitted entirely (the whole
//           row) only when there is no branch, no worktree, AND the diff is 0/0 — in practice
//           the (+add,-del) segment always renders (it defaults to 0/0 rather than being
//           conditional, unchanged from before this reorg), so this row is effectively always
//           present once inside any git-tracked cwd.
//     wt:   worktree.name — shown only in --worktree sessions.
//   line 7 (conditional): Job: <name><+more> <elapsed> [· <vram>] [det×N]  OR  Job: — det×N
//           Work running OUTSIDE the harness — the window Claude Code itself cannot draw.
//           A child started with setsid/nohup is reparented to PID 1, so the background-task
//           tracker never sees it: no TUI row, no TaskOutput, no exit notification, and it
//           outlives the session (even the project) that spawned it. Rebuilt from the OS:
//             <name> <elapsed> · <vram>  a live `agent-resource-run --manifest` admission —
//                                        the chokepoint every GPU run passes through, so it
//                                        cannot be opted out of by whatever spawned the job
//             det×N                      shells/helpers reparented to init that still point at
//                                        a Claude scratchpad, i.e. runaway drivers and leaks.
//                                        Red when N>0 with NOTHING admitted: invisible
//                                        processes alive, no job actually holding resources.
//           Whole row omitted when both are zero, so ordinary sessions pay nothing. Used to
//           live folded into the config row specifically so it could never "wrap away" on a
//           narrow pane; giving every row its own line 2026-09-12 satisfies that same
//           requirement more directly — a row that is present is simply printed, with nothing
//           upstream of it that could ever cause it to be silently dropped by a width
//           calculation. (There is no such calculation left in this file at all — see the
//           top-of-file note.)
//
// TIGER-STYLE PASS 2026-09-12 (practicing-tiger-style; explicit request, scoped to this file's
// existing risk shape — not a new production-hardening exercise): every OTHER subprocess call
// in this file already bounds its wait (agentName: 3000ms: this file, `execFileSync(CLAUDE_BIN,
// ...)`; herdrSend: 200ms via its own timer; vramFrac: 2000ms) and degrades the same way on
// timeout as on any other failure — catch, treat the value as absent, omit the segment. Two
// calls were the exception: the `git rev-parse` branch lookup and `scanOutOfHarness`'s `ps -eo`
// process-table scan had NO timeout at all. Bound: negative case is a stale NFS-mounted repo, a
// git index.lock held by a concurrent process, or a `ps` invocation delayed by extreme
// scheduling pressure (this host has run 40+ concurrent Claude sessions plus several 100%-CPU
// numerical experiments at once — observed live in this same conversation) — any of which would
// hang THIS call synchronously (execFileSync blocks the whole render) and, because nothing
// downstream of it could run either, freeze the entire statusline for this session indefinitely,
// not just the branch/Job segment. Evidence for the bound value: reused the 2000ms already
// established in this exact file for vramFrac()'s analogous "nice-to-have enrichment, never
// core" subprocess call, rather than inventing a new number for an equivalent risk. Handling:
// identical to every other bounded call here — catch, omit, no visible error. This closes the
// only two unbounded subprocess calls in the file; it does not add a test suite (there was and
// remains none for this script — an accepted, named gap, not a silent one: verification for
// this pass was manual invocation with real and synthetic stdin, shown in the commit).
//
// Zero runtime deps on purpose: this file is executed standalone as `bun <path>` with no
// package.json / node_modules beside it, so nothing importable (zod, ts-pattern) resolves.
// Static safety comes from the all-optional StatusInput shape + native `!= null` narrowing.
// Input: JSON via stdin from Claude Code.

import { hostname as osHostname, userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";

interface RateWindow {
  used_percentage?: number;
  resets_at?: number; // Unix epoch seconds
}
interface StatusInput {
  cwd?: string;
  session_id?: string;
  // NOTE: stdin also carries a `session_name` field. Deliberately NOT read — see the `name`
  // header note above for why it can mismatch the actual cross-session-addressable name.
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
  worktree?: { name?: string };
}

const HOME = process.env.HOME ?? "";

// --- ANSI / glyph constants (literals so segment assembly stays readable) ---
const ESC = "\x1b";
const RST = `${ESC}[0m`;
const DIM = `${ESC}[2m`;
const SEP = ` ${DIM}|${RST} `;
const MID = "·"; //   meter middot
const BR = "⎇"; //    git branch glyph
const RSET = "⟳"; //  rate-limit reset marker
// Tiger-Style bound (see the header note above): the timeout shared by every "nice-to-have
// enrichment" subprocess call in this file that is not already governed by its own specific
// number (agentName's 3000ms for `claude agents --json`, herdrSend's 200ms socket timer).
const ENRICHMENT_TIMEOUT_MS = 2000;

const pad2 = (n: number) => String(n).padStart(2, "0");

// zsh %~ : leading $HOME -> ~
function shorten(p: string): string {
  if (p === HOME) return "~";
  if (HOME && p.startsWith(`${HOME}/`)) return `~${p.slice(HOME.length)}`;
  return p;
}

// Which Claude account this CLI is authenticated as. The statusline input carries no account
// field, so it comes from ~/.claude.json — the same file `claude` itself writes on login.
// Cost measured 2026-08-24: 0.64 ms read + 0.91 ms parse for a 129 KB file, against the
// 8.8 ms this script already spends on its one `ps -eo` pass. Not worth caching.
function account(): string | undefined {
  try {
    const o: { oauthAccount?: { emailAddress?: string } } = JSON.parse(
      readFileSync(`${HOME}/.claude.json`, "utf8"),
    );
    // `||` not `??`: an empty string is not an account either, and must drop the segment.
    return o.oauthAccount?.emailAddress || undefined;
  } catch {
    return undefined; // unreadable / not JSON / logged out -> segment just disappears
  }
}

// Is `ultracode: true` set in the CLI's OWN live settings file — not this repo's committed
// agents/claude/settings.json, which only seeds it. The CLI rewrites ~/.claude/settings.json
// itself on interactive /model or /effort changes (confirmed 2026-09-05: a live effort choice
// showed up here as modelSettings.<model>.effortLevel, not as this repo's flat `effortLevel`
// key), so this file — not the repo source — is the only place that reflects what is ACTUALLY
// configured right now. Cheap like account() just above: same file class, smaller payload.
function ultracodeConfigured(): boolean {
  try {
    const s: { ultracode?: boolean } = JSON.parse(
      readFileSync(`${HOME}/.claude/settings.json`, "utf8"),
    );
    return s.ultracode === true;
  } catch {
    return false; // unreadable / not JSON -> treat as not configured, segment reads "off"
  }
}

// `name` — the actual field `claude agents --json` returns per session (confirmed live
// 2026-08-28), and what `/list-agents` addresses it by. NOT a label this file invented: it
// defaults to the auto-generated "firedancer-fe" form (docs call that default value the
// "default display name"; sessions.md), and tracks `--name`/`/rename` after that. Not on stdin
// (see line 3's header note above — `session_name` is a DIFFERENT, independently-tracked
// field) — resolved by shelling out to `claude agents --json` and matching our own session_id,
// then cached. One cache file, keyed by session_id, shared by every session on this machine —
// whichever renders first warms it for the rest.
//
// NOTE 2026-09-02: Claude Code's own "prompt bar" (the input box's own border) already shows
// this same name live, with no caching of its own — confirmed via sessions.md / cli-reference.md
// / changelog v2.1.75, not gated to `tui: fullscreen`. This segment is not redundant with that:
// its real reason for existing here is feeding reportToHerdr() below.
//
// TTL is 30s for BOTH a hit and a miss — a hit used to be trusted for 5 minutes on the theory
// that renames are rare/deliberate, which is backwards: rare-and-deliberate means a human is
// watching right when it happens, so a 5-minute-stale hit is maximally visible at the worst
// possible moment (caught live 2026-09-02: right after `/rename`, this segment and the herdr
// push it feeds both lagged behind the prompt bar above). 30s keeps the miss-only cost
// (~0.5-0.75s `claude agents --json`) rare enough not to matter, for a 10x smaller worst case.
// A miss keeps 30s for the reason it always had: caught live 2026-08-28, restarting a session
// with `claude -c` can race `claude agents --json`'s own self-registration, so the very first
// lookup right after a restart can miss even though the session is real — 30s lets the next
// render self-heal instead of showing nothing for up to 5 minutes. (herdr-tab-name.ts
// additionally retries within its own SessionStart firing, since it gets no next render.)
//
// TTL only bounds staleness for a pane that actually RE-RENDERS. A pane blocked on a
// long-running subagent (Task tool work) may not redraw its statusline for the whole duration,
// so its on-screen name (and the herdr push) can lag far longer than any TTL here — verified
// live 2026-09-02: a session still showed its pre-rename name after an unrelated subagent had
// been running 28+ minutes. That gap is Claude Code's own render cadence, which no cache TTL
// here can shorten.
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
const AGENT_NAME_TTL_MS = 30_000;
// statusLine commands can run with a narrower PATH than an interactive shell; prefer the env
// var Claude Code exports for its own binary over a bare PATH lookup.
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH || "claude";

function agentName(sid: string): string | undefined {
  type Entry = { name?: string; at: number };
  let cache: Record<string, Entry> = {};
  try {
    cache = JSON.parse(readFileSync(AGENT_NAME_CACHE, "utf8"));
  } catch {
    // missing / corrupt cache file -> treat as empty and refetch below
  }
  const hit = cache[sid];
  if (hit != null && Date.now() - hit.at < AGENT_NAME_TTL_MS) return hit.name;

  // Cache miss or stale: pay the ~0.5-0.75s (measured 2026-08-28) `claude agents --json` cost.
  try {
    const out = execFileSync(CLAUDE_BIN, ["agents", "--json"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 3000,
    });
    const list: Array<{ sessionId?: string; name?: string }> = JSON.parse(out);
    const now = Date.now();
    const next: Record<string, Entry> = {};
    for (const a of list)
      if (a.sessionId) next[a.sessionId] = { name: a.name, at: now };
    if (!(sid in next)) next[sid] = { at: now }; // not listed yet -> cache the miss too
    try {
      mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
      writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
    } catch {
      // cache write failed (e.g. read-only fs) -> value below still returned, just not persisted
    }
    return next[sid]?.name;
  } catch {
    return undefined; // `claude` missing/slow/errored -> segment just disappears this render
  }
}

// line 1: PS1 mirror ONLY — user@host:MM-DD HH:MM|cwd. See the top-of-file 2026-09-12 note for
// why account/name no longer ride here.
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

// line 3: <email> · <name> — see the top-of-file 2026-09-12 note. Undefined when neither field
// resolves, so the caller can omit the whole row rather than print an empty one.
function identityRow(
  acct: string | undefined,
  name: string | undefined,
): string | undefined {
  const parts: string[] = [];
  if (acct != null) parts.push(`${ESC}[38;5;103m${acct}${RST}`);
  if (name != null) parts.push(`${ESC}[38;5;214m${name}${RST}`);
  if (parts.length === 0) return undefined;
  return parts.join(` ${DIM}${MID}${RST} `);
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
const sid = data.session_id || undefined; // "" is not an id either — drop the row, don't print blank
// See agentName's header note for why this is `claude agents --json`'s `name` field, not `session_name`.
const sessionName = sid != null ? agentName(sid) : undefined;
let model = data.model?.display_name ?? "";
const modelId = data.model?.id ?? "";
const ctxTok =
  data.context_window?.total_input_tokens ??
  data.context_window?.current_usage?.input_tokens ??
  0;
const add = data.cost?.total_lines_added ?? 0;
const del = data.cost?.total_lines_removed ?? 0;
const effort = data.effort?.level; // string | undefined
// "Dynamic workflow" (ultracode's auto multi-agent orchestration) is armed ONLY while BOTH
// hold: the setting says so, and the live effort actually running is xhigh — ultracode forces
// xhigh whenever it genuinely engages, and per workflow-and-context.md's gotcha note a
// higher-precedence effort lever can silently push effort off xhigh and turn orchestration OFF
// even though `ultracode: true` still sits in settings. Reading the live value here (not the
// setting alone) is what makes this segment catch that silent case instead of lying about it.
const wfOn = ultracodeConfigured() && effort === "xhigh";
// Folds wfOn into the effort readout itself ("xhigh" vs "xhigh+WF") instead of a separate
// standalone "WF:" segment — on request 2026-09-05, both in this statusline and in the $effort
// token mirrored to herdr below. `effort` is guaranteed "xhigh" whenever wfOn is true (see its
// own condition above), so the suffix is never appended to a non-xhigh value.
const effortDisplay = effort ? `${effort}${wfOn ? "+WF" : ""}` : effort;
const ctxPct = data.context_window?.used_percentage; // number | undefined
const rl5 = data.rate_limits?.five_hour?.used_percentage;
const rl7 = data.rate_limits?.seven_day?.used_percentage;
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

// Best-effort push to herdr over the same JSON-RPC unix socket its own vendored integration
// (hooks/herdr-agent-state.sh) already talks to. A raw socket write, not a subprocess, so
// unlike agentName()'s `claude agents --json` this is cheap enough to do on EVERY render —
// which is the point: it makes the sidebar self-correcting.
//
//   pane.report_metadata  the live model as the $model row token (herdr/config.toml's
//                         [ui.sidebar.agents] rows), so a mid-session model switch (manual
//                         /model, switchModelsOnFlag) shows up. The addressable session name
//                         rides the same request as $fullname, for the sidebar (herdr's
//                         rows_by_agent.claude reads that back, not "tab" — see below). $effort
//                         mirrors this statusline's own effort readout (effortDisplay above:
//                         data.effort?.level, plus "+WF" when dynamic-workflow orchestration is
//                         engaged — e.g. "xhigh" or "xhigh+WF") into the row, added 2026-09-03 on
//                         request, placed between $model and $rc. $rc is a one-glyph Remote
//                         Control indicator, placed
//                         right of $effort in that same row (2026-09-03, on request) — 🔗 while
//                         $CLAUDE_CODE_BRIDGE_SESSION_ID is set (Claude Code v2.1.199+ sets it
//                         only while this session has an active Remote Control connection),
//                         else "". Unlike fullname, $effort and $rc are sent every render even
//                         when empty — fullname is a one-way "eventually known" value so an
//                         absent key is fine, but both of these must actively toggle off (effort
//                         disappears on a mid-session switch to a model with no reasoning-effort
//                         param; rc on disconnect), and omitting the key here would leave a stale
//                         value showing (untested against herdr's own merge-vs-replace semantics
//                         for a dropped key, so don't rely on that).
//   tab.rename            only the trailing `-`-segment of the session name ("firedancer-dc"
//                         -> "dc"), so the desktop tab bar (which shows the tab's real name)
//                         stays compact. The untruncated name lives in $fullname instead.
//
// WHY THE STATUSLINE RENAMES THE TAB, when hooks/herdr-tab-name.ts already does it at
// SessionStart: a once-per-session write has now failed twice, in two different ways, and each
// time left a permanently wrong label until the next session start.
//   1. `claude -c` keeps the session id but mints a new name suffix, so the hook wrote the
//      pre-restart name (fixed separately, by making that hook stop reading the shared cache).
//   2. `claude --fork-session` starts a session that is not yet in `claude agents --json` when
//      SessionStart fires, so the hook's bounded retries expire and it writes nothing at all —
//      observed 2026-08-30: the tab kept herdr's default numeric label while the status row
//      showed the real name.
// Both are the same shape: a single write at one instant cannot survive a value that is either
// wrong or unknowable at that instant. Re-asserting it every render is what actually holds.
// Renaming to the value it already has is a no-op in herdr, so this sends unconditionally
// rather than paying a read round-trip to compare.
//
// COST: a manual `herdr tab rename` on a Claude pane's tab is reverted on the next render.
// That follows from the same rule this whole setup exists to enforce — the tab label IS the
// session's name — but it does mean tab labels are not free-form while a session is live.
//
// Bounded by a 200ms timeout so an unavailable or slow socket never meaningfully delays the
// statusline itself; any failure is silently swallowed like every other segment in this file.
// ONE REQUEST PER CONNECTION, deliberately. Writing two newline-delimited requests down a
// single socket and closing it immediately silently drops everything after the first —
// measured 2026-08-31: the pane token landed, the tab.rename that followed it on the same
// connection did not, while the identical pair on two connections both landed. We never read
// the replies (fire-and-forget is the whole point of doing this every render), so there is no
// point at which waiting would be safe; a connection each is the cheap, correct shape.
function herdrSend(socketPath: string, req: unknown): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, 200);
    try {
      const socket = createConnection(socketPath, () => {
        socket.write(`${JSON.stringify(req)}\n`, () => {
          clearTimeout(timer);
          socket.end();
          finish();
        });
      });
      socket.on("error", () => {
        clearTimeout(timer);
        finish();
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

async function reportToHerdr(
  m: string,
  sessionName?: string,
  effortDisplay?: string, // plain-text "xhigh" / "xhigh+WF" — see effortDisplay above the call site
): Promise<void> {
  const socketPath = process.env.HERDR_SOCKET_PATH;
  const paneId = process.env.HERDR_PANE_ID;
  const tabId = process.env.HERDR_TAB_ID;
  if (process.env.HERDR_ENV !== "1" || !socketPath || !paneId) return;

  const stamp = Date.now();
  const tokens: Record<string, string> = { model: m };
  // Rides the SAME request as model — one socket round-trip, not two (see the
  // ONE-REQUEST-PER-CONNECTION note above for why a second request here would risk being
  // dropped anyway).
  if (sessionName) tokens.fullname = sessionName;
  // Always set, never omitted — see the pane.report_metadata header note above for why
  // $effort and $rc need an active off-toggle instead of an absent key.
  tokens.effort = effortDisplay ?? "";
  tokens.rc = process.env.CLAUDE_CODE_BRIDGE_SESSION_ID ? "🔗" : "";
  await herdrSend(socketPath, {
    id: `dotfiles:statusline-model:${stamp}`,
    method: "pane.report_metadata",
    params: {
      pane_id: paneId,
      source: "dotfiles:statusline-model",
      tokens,
    },
  });
  if (tabId && sessionName) {
    const shortName = sessionName.split("-").pop() || sessionName;
    await herdrSend(socketPath, {
      id: `dotfiles:statusline-tab:${stamp}`,
      method: "tab.rename",
      params: { tab_id: tabId, label: shortName },
    });
  }
}
await reportToHerdr(model, sessionName, effortDisplay);

// Ctx: live context tokens -> 100800 -> "100.8k"
const ctx = ctxTok >= 1000 ? `${(ctxTok / 1000).toFixed(1)}k` : String(ctxTok);

// git branch from cwd (segment omitted if not a repo, or if the lookup hangs/times out — see
// the top-of-file Tiger-Style note for why this call is now bounded).
let branch: string | undefined;
try {
  branch = execFileSync(
    "git",
    ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
    {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: ENRICHMENT_TIMEOUT_MS,
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

// --- Out-of-harness work (see line 7's header note) -------------------------------------
// ONE `ps` pass answers both halves; nvidia-smi is paid for only when something is admitted.
interface Admitted {
  name: string;
  secs: number;
}
// argv[0] itself, or argv[1] under a runtime/wrapper — never a match buried deeper in the
// line. Without that position rule, any shell, pgrep or awk whose COMMAND STRING merely
// mentions agent-resource-run would report itself as a running job.
const RUNTIME = new Set(["bun", "node", "deno", "taskset", "systemd-run"]);
// -> the manifest's job name, or undefined when this line is not an admission.
function admittedName(tok: string[]): string | undefined {
  const i = tok.findIndex(
    (t) => t === "agent-resource-run" || t.endsWith("/agent-resource-run"),
  );
  if (i < 0 || i > 1) return undefined;
  if (i === 1 && !RUNTIME.has(tok[0].split("/").pop() ?? "")) return undefined;
  if (tok[i + 1] !== "--manifest") return undefined;
  const name = (tok[i + 2] ?? "")
    .split("/")
    .pop()
    ?.replace(/\.resource\.json$/, "");
  return name === "" ? undefined : name;
}
function scanOutOfHarness(): { jobs: Admitted[]; orphans: number } {
  let raw: string;
  try {
    // Tiger-Style bound (see the top-of-file note): a `ps` snapshot of the WHOLE process table
    // has no reason to be instant on a heavily loaded host, and this call used to have no
    // timeout at all.
    raw = execFileSync("ps", ["-eo", "ppid=,etimes=,args="], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: ENRICHMENT_TIMEOUT_MS,
    });
  } catch {
    return { jobs: [], orphans: 0 }; // no ps / timed out -> segment silently disappears
  }
  const jobs: Admitted[] = [];
  let orphans = 0;
  for (const line of raw.split("\n")) {
    // .match(), not RegExp.prototype.exec(): this file imports node:child_process, and the
    // writing-bun-scripts floor (F4) fails any such file that also carries the token `exec(`.
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S.*)$/);
    if (!m) continue;
    const [, ppid, etimes, args] = m;
    const name = admittedName(args.split(/\s+/));
    if (name != null) jobs.push({ name, secs: Number(etimes) });
    // Reparented to init AND still pointing at a Claude scratchpad: a driver (or a leaked
    // helper) that outlived its session. Counted, never judged — deciding which orphan is
    // "real work" is exactly the guess this segment exists to stop us making.
    else if (ppid === "1" && args.includes("/scratchpad/")) orphans++;
  }
  return { jobs, orphans };
}
function vramFrac(): string | undefined {
  try {
    const out = execFileSync(
      "nvidia-smi",
      ["--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
      {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
        timeout: ENRICHMENT_TIMEOUT_MS,
      },
    );
    const [used, total] = (out.split("\n")[0] ?? "")
      .split(",")
      .map((s) => Number(s.trim()));
    if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0)
      return undefined;
    return `${(used / 1024).toFixed(1)}/${(total / 1024).toFixed(0)}G`;
  } catch {
    return undefined; // no GPU / no driver -> just omit the fraction
  }
}
// elapsed: <h>h<mm>m past an hour, else <m>m<ss>s — same shape as the rate-limit countdowns.
const dur = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`
    : `${Math.floor(s / 60)}m${pad2(s % 60)}s`;

// line 4: config = Model | Effort[+WF]. See the top-of-file 2026-09-12 note for why this no
// longer also carries Ctx or Job — both moved to their own rows.
let configLine = `${ESC}[38;5;30m${model}${RST}`;
if (effort) {
  configLine += `${SEP}${ESC}[38;5;209m${effort}${RST}`;
  // Tailwind violet-500 (#8b5cf6), matched 2026-09-11 against Claude Code's own /effort
  // slider "ultracode" label (screenshotted) — picked over green to read as "ultracode is
  // on" at a glance. truecolor (38;2;r;g;b), not the 256-palette used elsewhere in this file:
  // the palette's nearest steps (ANSI 93/129/135/141) were all visibly off during the pick.
  if (wfOn) configLine += `${ESC}[38;2;139;92;246m+WF${RST}`;
}

// line 5: budget = Ctx: <k>·<pct>% | Rate: 5h..% · 7d..%. See the top-of-file 2026-09-12 note
// for why Ctx and Rate are merged onto one row now (both are "how much allowance is left").
let budgetLine = `${ESC}[38;5;66mCtx:${RST} ${ctx}`;
if (ctxPct != null) {
  const { pct, col } = pctFmt(ctxPct);
  budgetLine += ` ${DIM}${MID}${RST} ${ESC}[${col}m${pct}%${RST}`;
}
if (rl5 != null || rl7 != null) {
  budgetLine += `${SEP}${ESC}[38;5;108mRate:${RST}`;
  if (rl5 != null) {
    const { pct, col } = pctFmt(rl5);
    budgetLine += ` 5h ${ESC}[${col}m${pct}%${RST}`;
    if (rl5Reset != null) budgetLine += ` ${DIM}${reset5(rl5Reset)}${RST}`;
  }
  if (rl7 != null) {
    const { pct, col } = pctFmt(rl7);
    budgetLine += ` ${DIM}${MID}${RST} 7d ${ESC}[${col}m${pct}%${RST}`;
    if (rl7Reset != null) budgetLine += ` ${DIM}${reset7(rl7Reset)}${RST}`;
  }
}

// line 6: repo = <branch> | (+add,-del) [| wt: <name>]. See the top-of-file 2026-09-12 note
// for why branch no longer rides with Rate (a budget fact, not a repo fact).
const join = (t: string, seg: string) => (t ? t + SEP : "") + seg;
let repoLine = "";
if (branch) repoLine = join(repoLine, `${ESC}[38;5;96m${BR} ${branch}${RST}`);
repoLine = join(repoLine, `${ESC}[38;5;178m(+${add},-${del})${RST}`);
if (wt) repoLine = join(repoLine, `${ESC}[38;5;140mwt: ${wt}${RST}`);

// line 7 (conditional): Job. See the top-of-file 2026-09-12 note for why this is now always
// its own row rather than folded into config specifically to avoid a width-driven wrap.
const { jobs, orphans } = scanOutOfHarness();
let jobLine: string | undefined;
if (jobs.length > 0 || orphans > 0) {
  jobLine = `${ESC}[38;5;173mJob:${RST}`;
  if (jobs.length > 0) {
    const [first] = jobs;
    const more = jobs.length > 1 ? `${DIM}+${jobs.length - 1}${RST}` : "";
    jobLine += ` ${first.name}${more} ${dur(first.secs)}`;
    const vram = vramFrac();
    if (vram != null) jobLine += ` ${DIM}${MID} ${vram}${RST}`;
    if (orphans > 0) jobLine += ` ${DIM}det×${orphans}${RST}`;
  } else {
    // Detached processes alive with nothing admitted: waiting, wedged, or leaked — all three
    // are states the harness reports as "idle", which is the failure this segment answers.
    jobLine += ` ${DIM}—${RST} ${ESC}[38;5;167mdet×${orphans}${RST}`;
  }
}

// --- render: one row per category, in the order documented at the top of this file ---
const acctEmail = account();
const rows = [
  line1(cwd),
  sid != null ? `${ESC}[38;5;103mSession:${RST} ${DIM}${sid}${RST}` : undefined,
  identityRow(acctEmail, sessionName),
  configLine,
  budgetLine,
  repoLine,
  jobLine,
].filter((r): r is string => r != null && r !== "");
process.stdout.write(rows.join("\n"));
