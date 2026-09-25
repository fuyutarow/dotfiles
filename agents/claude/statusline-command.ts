// Claude Code statusLine — bun/TypeScript. mac & WSL.
// Source of truth: ~/dotfiles/agents/claude/statusline-command.ts
//   -> symlinked to ~/.claude/statusline-command.ts by scripts/link-dots.sh
//   invoked as: bun ~/.claude/statusline-command.ts   (bun is the house Node runtime,
//   present on both OSes via Brewfile). If bun is somehow absent the bar goes blank —
//   the one regression vs the old POSIX-sh version, accepted because bun is the house
//   standard; the docs officially bless a JS/TS statusline (stdin JSON -> stdout).
//
// SHAPE (2026-09-12): dataframe / viewer, separated on request after three same-day row-layout
// changes each cost a 70-100+ line diff dominated by comment churn — the row grouping and the
// value computation used to live in the same pass, so re-grouping meant re-writing prose too.
//   buildDataframe(): stdin -> Dataframe. Every value this file can possibly show, already
//                     computed (subprocess calls, cache lookups, formatting) — NO ANSI, NO row
//                     grouping, NO knowledge that rows exist at all.
//   render(df):       Dataframe -> row strings. ALL styling and ALL row grouping. Changing
//                     which fields share a row is a small edit here and NOWHERE else.
// Everything else (herdr reporting, the subprocess helpers) is unchanged in substance from
// before this split; they just got called from a different top-level shape.
//
// Current row grouping (change this by editing render(), not this comment — see the module
// docstring on render() for the box the design lives inside; e.g. the Session-uuid MUST stay
// last on whatever row it's in, that constraint is enforced/documented on `render`, not here):
//   1 user@host:MM-DD HH:MM|cwd | <branch> | (+add,-del) [| wt]  (PS1 mirror + repo)
//   2 <email> | Session: <uuid>                       (identity strings)
//   3 <name> | Model | Effort[+WF] | 🔗|rc:off|rc:? | Ctx: <k> <pct>%  (agent + config +
//     budget-now; Remote Control on / off / probe unverified — see rcState())
//   4 Rate: 5h..% ⟳...(...) · 7d..% ⟳...(...) [· <Model>..% ⟳...(...)]  (budget-over-time)
//   5 Sys: CPU <pct>% · RAM <pct>% (<used>/<total>G) [· VRAM <pct>% (<used>/<total>G)]  (host
//     load; CPU/RAM are Linux-only for now — read from /proc, see cpuPct()/ramFrac() — and CPU
//     needs a prior render to diff against, so it's absent on the very first render of a
//     session; conditional row, appears once any one reading is available)
//   6 Job: ... (conditional)                          (background work)
//
// TIGER-STYLE (practicing-tiger-style, explicit request 2026-09-12): every subprocess call in
// buildDataframe() is now bounded. Two calls — the `git rev-parse` branch lookup and the `ps
// -eo` process-table scan — used to have NO timeout, unlike every other call here (agentName:
// 3000ms, herdrSend: 200ms, vramFrac: 2000ms). A stale NFS-mounted repo, a held git index.lock,
// or `ps` delayed by extreme scheduling pressure (this host has run 40+ concurrent Claude
// sessions plus several 100%-CPU experiments at once, observed live) would hang either call
// synchronously and freeze the whole render, not just its own segment. Both now share
// ENRICHMENT_TIMEOUT_MS, reusing vramFrac's existing 2000ms rather than inventing a new number
// for an equivalent risk; handling is identical to every other bounded call — catch, omit, no
// visible error. Named, not silently closed: this script still has no dedicated test suite —
// verification here is the manual stdin invocations recorded in the commit, not an automated net.
//
// BG3 dependencies (writing-bun-scripts floor), not a standalone zero-dep script: this file
// lives inside the dotfiles repo tree, so even invoked via its ~/.claude symlink, Bun resolves
// imports on the file's REALPATH and finds the repo-root node_modules -- confirmed live
// 2026-09-16 (`bun ~/.claude/<probe>.ts` importing neverthrow resolved, exactly like any linked
// skill script; agents/skills/writing-bun-scripts/tests/forge-verification-ledger.md documents
// the same mechanism for the `~/.claude/skills/<skill>` symlinks). Every fallible sync call
// below goes through neverthrow's fromThrowable() rather than try/catch, per that same floor;
// .oxlintrc.json's ban override was extended from scripts/*.ts to agents/claude/*.ts to enforce
// it here too (agents/claude/hooks/*.ts stays exempt -- those run before `mise run deps` has
// necessarily restored node_modules, this file never does).
// Static safety comes from the all-optional StatusInput shape + native `!= null` narrowing.
// Input: JSON via stdin from Claude Code.

import { hostname as osHostname, userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { fromThrowable } from "neverthrow";

interface RateWindow {
  used_percentage?: number;
  resets_at?: number; // Unix epoch seconds
}
interface StatusInput {
  cwd?: string;
  session_id?: string;
  // stdin also carries a `session_name` field. Deliberately NOT read: it can independently hold
  // an AI-generated conversation title instead of the real cross-session-addressable name
  // (caught live 2026-08-28 — one session showed its title here while `claude agents --json`
  // still had the real name "firedancer-1d"). See buildDataframe()'s sessionName lookup instead.
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

// Every value this file can show, already computed — the sole output of buildDataframe() and
// sole input to render(). No ANSI codes, no row grouping, no ordering: a value here says
// nothing about where or whether it appears on screen.
// Optional fields carry explicit `| undefined`, not just `?:` — with exactOptionalPropertyTypes
// this is deliberate, not a widening-to-dodge-the-checker: undefined here is a real, distinct
// state render() branches on (its `!= null` checks decide whether a segment shows at all), and
// buildDataframe() assembles this object as one literal rather than conditionally spreading each
// of the ~11 optional keys in and out.
interface Dataframe {
  cwd: string;
  sid?: string | undefined;
  sessionName?: string | undefined;
  email?: string | undefined;
  model: string;
  effort?: string | undefined;
  wfOn: boolean;
  /** Remote Control: on / off / unknown — see rcState(). */
  rc: RcState;
  ctx: string;
  ctxPct?: number | undefined;
  rl5?: number | undefined;
  rl5Reset?: number | undefined;
  rl7?: number | undefined;
  rl7Reset?: number | undefined;
  rlModel: ModelLimit[];
  branch?: string | undefined;
  add: number;
  del: number;
  wt?: string | undefined;
  jobs: Admitted[];
  orphans: number;
  vram?: MemReading | undefined;
  cpuPct?: number | undefined;
  ram?: MemReading | undefined;
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
// enrichment" subprocess call in buildDataframe() that is not already governed by its own
// specific number (agentName's 3000ms for `claude agents --json`, herdrSend's 200ms socket timer).
const ENRICHMENT_TIMEOUT_MS = 2000;

const pad2 = (n: number) => String(n).padStart(2, "0");

// zsh %~ : leading $HOME -> ~
function shorten(p: string): string {
  if (p === HOME) return "~";
  if (HOME && p.startsWith(`${HOME}/`)) return `~${p.slice(HOME.length)}`;
  return p;
}

// Which Claude account this CLI is authenticated as, AND the per-model weekly caps below —
// one parse of ~/.claude.json serves both, the same file `claude` itself writes on login and
// keeps refreshing (via `cachedUsageUtilization`) whenever it fetches usage data.
// Cost measured 2026-08-24: 0.64 ms read + 0.91 ms parse for a 129 KB file, against the
// 8.8 ms this script already spends on its one `ps -eo` pass. Not worth caching.
interface ClaudeJson {
  oauthAccount?: { emailAddress?: string };
  cachedUsageUtilization?: {
    utilization?: {
      limits?: Array<{
        kind?: string;
        percent?: number;
        resets_at?: string | null;
        scope?: { model?: { display_name?: string } } | null;
      }>;
    };
  };
}
function readClaudeJson(): ClaudeJson {
  return fromThrowable((): ClaudeJson =>
    JSON.parse(readFileSync(`${HOME}/.claude.json`, "utf8")),
  )().unwrapOr({}); // unreadable / not JSON / logged out -> every reader below just sees absence
}
function account(cj: ClaudeJson): string | undefined {
  // `||` not `??`: an empty string is not an account either, and must drop the segment.
  return cj.oauthAccount?.emailAddress || undefined;
}

// Fable (and any other model with its own weekly ceiling — the CLI's own "You've hit your Opus
// limit" message confirms Opus gets one too) draws down the SAME five_hour/seven_day pool above
// but ALSO gets its own dedicated weekly cap layered on top — confirmed live 2026-09-16 against
// the account's own /usage screen ("Current week (Fable)"). This is NOT in the statusline's own
// stdin JSON at all (checked against the documented schema: `rate_limits` carries only
// five_hour/seven_day/spend_limit) — it lives only in this cache, under the generic
// `weekly_scoped` kind with a `scope.model.display_name`, because that is the same field
// Claude Code's own /usage view reads. Can be stale between whatever triggers Claude Code to
// refetch it; same trust level as account() just above, which reads the same file with no
// staleness check either.
interface ModelLimit {
  name: string;
  pct: number;
  resetEpoch: number | undefined;
}
function modelWeeklyLimits(cj: ClaudeJson): ModelLimit[] {
  const limits = cj.cachedUsageUtilization?.utilization?.limits ?? [];
  const out: ModelLimit[] = [];
  for (const l of limits) {
    if (l.kind !== "weekly_scoped" || l.percent == null) continue;
    const name = l.scope?.model?.display_name;
    if (!name) continue;
    const epochMs = l.resets_at ? new Date(l.resets_at).getTime() : NaN;
    out.push({
      name,
      pct: l.percent,
      resetEpoch: Number.isFinite(epochMs)
        ? Math.floor(epochMs / 1000)
        : undefined,
    });
  }
  return out;
}

// Is `ultracode: true` set in the CLI's OWN live settings file — not this repo's committed
// agents/claude/settings.json, which only seeds it. The CLI rewrites ~/.claude/settings.json
// itself on interactive /model or /effort changes (confirmed 2026-09-05: a live effort choice
// showed up here as modelSettings.<model>.effortLevel, not as this repo's flat `effortLevel`
// key), so this file — not the repo source — is the only place that reflects what is ACTUALLY
// configured right now. Cheap like account() just above: same file class, smaller payload.
function ultracodeConfigured(): boolean {
  return fromThrowable((): { ultracode?: boolean } =>
    JSON.parse(readFileSync(`${HOME}/.claude/settings.json`, "utf8")),
  )()
    .map((s) => s.ultracode === true)
    .unwrapOr(false); // unreadable / not JSON -> treat as not configured, segment reads "off"
}

// `name` — the actual field `claude agents --json` returns per session (confirmed live
// 2026-08-28), and what `/list-agents` addresses it by. NOT a label this file invented: it
// defaults to the auto-generated "firedancer-fe" form (docs call that default value the
// "default display name"; sessions.md), and tracks `--name`/`/rename` after that. Not on stdin
// (see StatusInput's own note — `session_name` is a DIFFERENT, independently-tracked field) —
// resolved by shelling out to `claude agents --json` and matching our own session_id, then
// cached. One cache file, keyed by session_id, shared by every session on this machine —
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
/**
 * Remote Control state — the SOLE probe for both surfaces (row 3 and herdr's $rc token), and
 * deliberately THREE-valued, because "not connected" and "cannot tell" must not render alike:
 *
 *   on       $CLAUDE_CODE_BRIDGE_SESSION_ID is set. Claude Code writes it into its own
 *            process.env when the bridge handle attaches and deletes it when it detaches
 *            (read from the 2.1.278 bundle: `if(i!==void 0)process.env.…=i;else delete …`), so
 *            every child — this statusline included — sees the live value.
 *   off      unset, AND the running CLI binary still contains that exact write. Only then does
 *            absence mean "disconnected".
 *   unknown  unset, and the probe itself is unverified: the binary no longer contains the
 *            write (renamed/removed upstream), or it cannot be located or read. Without this
 *            state a silent upstream rename would read as "off" forever — the failure the user
 *            named on 2026-09-22 ("null と off の違い").
 *
 * The binary check is a one-time scan per CLI build (path+size+mtime key, ~230 MB read once),
 * cached in RC_PROBE_CACHE; every other render is a small JSON read.
 */
type RcState = "on" | "off" | "unknown";
const RC_PROBE_CACHE = `${HOME}/.cache/claude/statusline-rc-probe.json`;
const RC_NEEDLE = "process.env.CLAUDE_CODE_BRIDGE_SESSION_ID=";

/** Stream `fd` in 8 MB chunks; a tail carry catches a match straddling two chunks. */
function scanFd(fd: number, pat: Buffer): boolean | undefined {
  const chunk = 8 << 20;
  const buf = Buffer.alloc(chunk + pat.length);
  let carry = 0;
  for (;;) {
    const read = fromThrowable(() => readSync(fd, buf, carry, chunk, null))();
    if (read.isErr()) return undefined;
    if (read.value <= 0) return false;
    const end = carry + read.value;
    if (buf.subarray(0, end).indexOf(pat) !== -1) return true;
    carry = Math.min(pat.length - 1, end);
    buf.copy(buf, 0, end - carry, end);
  }
}

/** true/false = scanned; undefined = could not scan (missing, unreadable). */
function binaryContains(path: string, needle: string): boolean | undefined {
  const opened = fromThrowable(() => openSync(path, "r"))();
  if (opened.isErr()) return undefined;
  try {
    return scanFd(opened.value, Buffer.from(needle));
  } finally {
    closeSync(opened.value);
  }
}

/**
 * Keyed by path+size+mtime, and a MAP rather than one slot: sessions on two CLI builds render
 * side by side after an auto-update, and a single slot would make them evict each other and
 * re-scan ~230 MB on every render.
 */
function rcProbeValid(): boolean | undefined {
  const exe = process.env.CLAUDE_CODE_EXECPATH;
  if (!exe) return undefined;
  const st = fromThrowable(() => statSync(exe))();
  if (st.isErr()) return undefined;
  const key = `${exe}\u0000${st.value.size}\u0000${st.value.mtimeMs}`;
  const cache = fromThrowable(
    () =>
      JSON.parse(readFileSync(RC_PROBE_CACHE, "utf8")) as Record<
        string,
        unknown
      >,
  )().unwrapOr({} as Record<string, unknown>);
  const hit = cache[key];
  if (typeof hit === "boolean") return hit;
  const valid = binaryContains(exe, RC_NEEDLE);
  if (valid === undefined) return undefined;
  // The cache is an optimization; a failed write leaves the answer above standing.
  fromThrowable(() => {
    mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
    writeFileSync(RC_PROBE_CACHE, JSON.stringify({ ...cache, [key]: valid }));
  })();
  return valid;
}

function rcState(): RcState {
  if ((process.env.CLAUDE_CODE_BRIDGE_SESSION_ID ?? "") !== "") return "on";
  return rcProbeValid() === true ? "off" : "unknown";
}

/** Plain text for herdr's $rc token — same three states, no ANSI (herdr styles its own rows). */
const RC_TOKEN: Record<RcState, string> = {
  on: "🔗",
  off: "rc:off",
  unknown: "rc:?",
};

const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
const AGENT_NAME_TTL_MS = 30_000;
// statusLine commands can run with a narrower PATH than an interactive shell; prefer the env
// var Claude Code exports for its own binary over a bare PATH lookup.
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH || "claude";

type AgentNameEntry = { name?: string; at: number };
// Cache-miss refresh: fold `claude agents --json`'s list into the sid->name map, keeping only
// entries that carry a sessionId. Extracted out of agentName() only to keep its try/for nesting
// under max-depth; the exactOptionalPropertyTypes name-omission below is unchanged.
function agentNameEntries(
  list: Array<{ sessionId?: string; name?: string }>,
  now: number,
): Record<string, AgentNameEntry> {
  const next: Record<string, AgentNameEntry> = {};
  for (const a of list) {
    if (!a.sessionId) continue;
    // exactOptionalPropertyTypes: omit `name` rather than set it to explicit undefined.
    next[a.sessionId] = {
      at: now,
      ...(a.name !== undefined ? { name: a.name } : {}),
    };
  }
  return next;
}
function agentName(sid: string): string | undefined {
  // missing / corrupt cache file -> treat as empty and refetch below
  const cache: Record<string, AgentNameEntry> = fromThrowable(
    (): Record<string, AgentNameEntry> =>
      JSON.parse(readFileSync(AGENT_NAME_CACHE, "utf8")),
  )().unwrapOr({});
  const hit = cache[sid];
  if (hit != null && Date.now() - hit.at < AGENT_NAME_TTL_MS) return hit.name;

  // Cache miss or stale: pay the ~0.5-0.75s (measured 2026-08-28) `claude agents --json` cost.
  const outResult = fromThrowable(() =>
    execFileSync(CLAUDE_BIN, ["agents", "--json"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 3000,
    }),
  )();
  if (outResult.isErr()) return undefined; // `claude` missing/slow/errored -> segment just disappears this render
  const listResult = fromThrowable(
    (): Array<{ sessionId?: string; name?: string }> =>
      JSON.parse(outResult.value),
  )();
  if (listResult.isErr()) return undefined; // malformed JSON -> same as a missing `claude`
  const now = Date.now();
  const next = agentNameEntries(listResult.value, now);
  if (!(sid in next)) next[sid] = { at: now }; // not listed yet -> cache the miss too
  // best-effort write, result discarded on purpose: cache write failed (e.g. read-only fs) ->
  // value below still returned, just not persisted.
  fromThrowable(() => {
    mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
    writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
  })();
  return next[sid]?.name;
}

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
//                         mirrors this statusline's own effort readout ("xhigh" or "xhigh+WF"
//                         when dynamic-workflow orchestration is engaged) into the row, added
//                         2026-09-03 on request, placed between $model and $rc. $rc is a
//                         one-glyph Remote Control indicator, placed right of $effort in that
//                         same row (2026-09-03, on request) — 🔗 while
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
    const socketResult = fromThrowable(() => {
      const socket = createConnection(socketPath, () => {
        socket.write(`${JSON.stringify(req)}\n`, () => {
          clearTimeout(timer);
          socket.end();
          finish();
        });
      });
      return socket;
    })();
    if (socketResult.isErr()) {
      clearTimeout(timer);
      finish();
      return;
    }
    socketResult.value.on("error", () => {
      clearTimeout(timer);
      finish();
    });
  });
}

async function reportToHerdr(
  m: string,
  sessionName?: string,
  effortDisplay?: string, // plain-text "xhigh" / "xhigh+WF"
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
  tokens.rc = RC_TOKEN[rcState()];
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

// --- Out-of-harness work: work running OUTSIDE the harness, the window Claude Code itself
// cannot draw. A child started with setsid/nohup is reparented to PID 1, so the background-task
// tracker never sees it: no TUI row, no TaskOutput, no exit notification, and it outlives the
// session (even the project) that spawned it. ONE `ps` pass answers both halves below. ---
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
  if (i === 1) {
    const first = tok[0];
    // i === 1 means tok has at least 2 elements, so tok[0] is always defined here;
    // the check is only for noUncheckedIndexedAccess, not a reachable runtime case.
    if (first === undefined || !RUNTIME.has(first.split("/").pop() ?? ""))
      return undefined;
  }
  if (tok[i + 1] !== "--manifest") return undefined;
  const name = (tok[i + 2] ?? "")
    .split("/")
    .pop()
    ?.replace(/\.resource\.json$/, "");
  return name === "" ? undefined : name;
}
// Reparented to init AND still pointing at a Claude scratchpad: a driver (or a leaked helper)
// that outlived its session. Counted, never judged — deciding which orphan is "real work" is
// exactly the guess this segment exists to stop us making.
function scanOutOfHarness(): { jobs: Admitted[]; orphans: number } {
  // Tiger-Style bound (see the top-of-file note): a `ps` snapshot of the WHOLE process table
  // has no reason to be instant on a heavily loaded host, and this call used to have no
  // timeout at all.
  const rawResult = fromThrowable(() =>
    execFileSync("ps", ["-eo", "ppid=,etimes=,args="], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: ENRICHMENT_TIMEOUT_MS,
    }),
  )();
  if (rawResult.isErr()) return { jobs: [], orphans: 0 }; // no ps / timed out -> segment silently disappears
  const raw = rawResult.value;
  const jobs: Admitted[] = [];
  let orphans = 0;
  for (const line of raw.split("\n")) {
    // .match(), not RegExp.prototype.exec(): this file imports node:child_process, and the
    // writing-bun-scripts floor (F4) fails any such file that also carries the token `exec(`.
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S.*)$/);
    if (!m) continue;
    const [, ppid, etimes, args] = m;
    // All three are non-optional capture groups, so a successful match always has them;
    // this guard exists only for noUncheckedIndexedAccess, never actually taken.
    if (ppid === undefined || etimes === undefined || args === undefined)
      continue;
    const name = admittedName(args.split(/\s+/));
    if (name != null) jobs.push({ name, secs: Number(etimes) });
    else if (ppid === "1" && args.includes("/scratchpad/")) orphans++;
  }
  return { jobs, orphans };
}
// Shared shape for a "used/total" memory-style reading (RAM, VRAM): both the fraction string
// AND the percentage, since render() needs the percentage to threshold-color the segment the
// same way every other percentage in this file is colored (pctFmt) — a plain fraction alone
// cannot drive that.
interface MemReading {
  frac: string; // e.g. "16.2/54.9G"
  pct: number; // used/total*100, unrounded — pctFmt() rounds at render time
}
function memReading(usedG: number, totalG: number): MemReading | undefined {
  if (!Number.isFinite(usedG) || !Number.isFinite(totalG) || totalG <= 0)
    return undefined;
  return {
    frac: `${usedG.toFixed(1)}/${totalG.toFixed(1)}G`,
    pct: (usedG / totalG) * 100,
  };
}

// Called on EVERY render now (Sys row, below), not just while a job is admitted — the one
// subprocess call among the three Sys readings, bounded like every other enrichment here.
function vramFrac(): MemReading | undefined {
  return fromThrowable((): MemReading | undefined => {
    const out = execFileSync(
      "nvidia-smi",
      ["--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
      {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
        timeout: ENRICHMENT_TIMEOUT_MS,
      },
    );
    const [usedRaw, totalRaw] = (out.split("\n")[0] ?? "")
      .split(",")
      .map((s) => Number(s.trim()));
    // A short/malformed csv line leaves these missing; NaN fails isFinite below exactly like
    // Number("") already would, so this default changes no observable behavior.
    const used = usedRaw ?? NaN;
    const total = totalRaw ?? NaN;
    return memReading(used / 1024, total / 1024);
  })().unwrapOr(undefined); // no GPU / no driver -> just omit the reading
}

// Host RAM, Linux only (reads /proc/meminfo — instant, no subprocess). MemAvailable (not
// MemFree) is what "used" is measured against: it already accounts for reclaimable page cache,
// which MemFree does not, so MemFree would read as chronically "almost full" on a healthy box.
// macOS has no /proc; this simply returns undefined there (sysctl+vm_stat parsing is real work
// and untestable from this host, so it is left as a follow-up rather than shipped unverified —
// see the module docstring's row-5 note).
function ramFrac(): MemReading | undefined {
  return fromThrowable((): MemReading | undefined => {
    const raw = readFileSync("/proc/meminfo", "utf8");
    let totalKb: number | undefined;
    let availKb: number | undefined;
    for (const line of raw.split("\n")) {
      if (line.startsWith("MemTotal:")) totalKb = Number(line.split(/\s+/)[1]);
      else if (line.startsWith("MemAvailable:"))
        availKb = Number(line.split(/\s+/)[1]);
      if (totalKb != null && availKb != null) break;
    }
    if (totalKb == null || availKb == null) return undefined;
    const usedKb = totalKb - availKb;
    return memReading(usedKb / 1024 / 1024, totalKb / 1024 / 1024);
  })().unwrapOr(undefined); // no /proc (mac) / malformed -> just omit the reading
}

// One /proc/stat snapshot alone cannot give a CPU percentage — its counters are cumulative
// jiffies since boot, so a percentage needs the DELTA between two snapshots. Each statusline
// render is a fresh process (see this file's header note), so that second snapshot has to be
// the previous render's, kept on disk — same shape as AGENT_NAME_CACHE / RC_PROBE_CACHE above.
const CPU_CACHE = `${HOME}/.cache/claude/statusline-cpu.json`;
interface CpuSample {
  total: number;
  idle: number;
}
// Aggregate "cpu  ..." line (not a per-core "cpu0 ..." line): user+nice+system+idle+iowait+
// irq+softirq+steal[+guest+guest_nice]. idle time is idle+iowait; total is the sum of every
// field. Linux only, like ramFrac() above — no /proc on mac.
function readCpuSample(): CpuSample | undefined {
  return fromThrowable((): CpuSample | undefined => {
    const raw = readFileSync("/proc/stat", "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("cpu "));
    if (!line) return undefined;
    const fields = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    return Number.isFinite(idle) && total > 0 ? { total, idle } : undefined;
  })().unwrapOr(undefined);
}
function cpuPct(): number | undefined {
  const sample = readCpuSample();
  if (!sample) return undefined; // no /proc (mac) / malformed line -> no reading this render
  const cacheResult = fromThrowable((): CpuSample =>
    JSON.parse(readFileSync(CPU_CACHE, "utf8")),
  )();
  // Best-effort write of THIS render's sample for the NEXT render to diff against, unconditional
  // on whether this render itself can show a value — same "write regardless, return what we
  // have" shape as agentName()'s cache-miss path above.
  fromThrowable(() => {
    mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
    writeFileSync(CPU_CACHE, JSON.stringify(sample));
  })();
  if (cacheResult.isErr()) return undefined; // first render this session -> nothing to diff against yet
  const prev = cacheResult.value;
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  // dTotal<=0 means no jiffies elapsed between two renders (or a counter reset) -> a division
  // here would be by ~0 or negative, not a real rate; omit rather than show a bogus number.
  if (dTotal <= 0) return undefined;
  return Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100));
}
// elapsed: <h>h<mm>m past an hour, else <m>m<ss>s — same shape as the rate-limit countdowns.
const dur = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`
    : `${Math.floor(s / 60)}m${pad2(s % 60)}s`;

// --- buildDataframe: stdin -> every displayable value, already computed. No ANSI, no rows. ---
async function buildDataframe(data: StatusInput): Promise<Dataframe> {
  // || (not ??): an empty cwd string must ALSO fall through to PWD, matching the old sh's
  // `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
  const cwd = data.cwd || data.workspace?.current_dir || process.env.PWD || "";
  const sid = data.session_id || undefined; // "" is not an id either
  const sessionName = sid != null ? agentName(sid) : undefined;
  const cj = readClaudeJson();
  const email = account(cj);
  const rlModel = modelWeeklyLimits(cj);

  let model = data.model?.display_name ?? "";
  const modelId = data.model?.id ?? "";
  // model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a version,
  // else derive "Family X.Y" from the id (claude-opus-4-8[1m] -> Opus 4.8).
  if (!/[0-9]/.test(model)) {
    // String.split always returns at least one element, so this is never actually undefined;
    // the fallback is only to satisfy noUncheckedIndexedAccess.
    const base = modelId.replace(/^claude-/, "").split("[")[0] ?? "";
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

  const effort = data.effort?.level; // string | undefined
  // "Dynamic workflow" (ultracode's auto multi-agent orchestration) is armed ONLY while BOTH
  // hold: the setting says so, and the live effort actually running is xhigh — ultracode forces
  // xhigh whenever it genuinely engages, and a higher-precedence effort lever (env var, an
  // interactive /effort choice, a per-model modelSettings entry the CLI itself writes back —
  // see ultracodeConfigured()'s note) can silently push effort off xhigh and turn orchestration
  // OFF even though `ultracode: true` still sits in settings. Reading the live value here (not
  // the setting alone) is what makes this catch that silent case instead of lying about it.
  const wfOn = ultracodeConfigured() && effort === "xhigh";
  // Plain-text form for herdr only ("xhigh" vs "xhigh+WF") — render() does its OWN combining
  // (with its own +WF color) from the raw `effort`/`wfOn` pair below; a dataframe field must
  // hold one raw fact, not a pre-styled/pre-joined display string, or a future render() change
  // duplicates work already done here (caught live 2026-09-12: the first cut of this split
  // stored the combined string AND re-appended "+WF" in render(), rendering "xhigh+WF+WF").
  const wfSuffix = wfOn ? "+WF" : "";
  // Remote Control, read the SAME way reportToHerdr() reads it for the sidebar's $rc token, so
  // the two surfaces can never disagree. $CLAUDE_CODE_BRIDGE_SESSION_ID is injected into every
  // child Claude Code spawns and is LIVE: verified 2026-09-22 in one session — set while
  // /remote-control was active, absent in a fresh spawn after it dropped, set again on
  // reconnect. So a render reads the current state, not a launch-time snapshot (the claude
  // process's own /proc environ never carries it at all).
  const rc = rcState();
  const effortDisplay = effort ? `${effort}${wfSuffix}` : effort;

  await reportToHerdr(model, sessionName, effortDisplay);

  const ctxTok =
    data.context_window?.total_input_tokens ??
    data.context_window?.current_usage?.input_tokens ??
    0;
  const ctx =
    ctxTok >= 1000 ? `${(ctxTok / 1000).toFixed(1)}k` : String(ctxTok);

  // git branch from cwd (omitted if not a repo, or if the lookup hangs/times out — see the
  // top-of-file Tiger-Style note for why this call is bounded).
  const branchResult = fromThrowable(() =>
    execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: ENRICHMENT_TIMEOUT_MS,
    }).trim(),
  )();
  const branch = branchResult.isOk() ? branchResult.value : undefined;

  const { jobs, orphans } = scanOutOfHarness();
  // Sys-row readings — always computed now, not gated on a job being admitted (see vramFrac()'s
  // own header note for why paying nvidia-smi every render is fine).
  const cpu = cpuPct();
  const ram = ramFrac();
  const vram = vramFrac();

  return {
    cwd,
    sid,
    sessionName,
    email,
    model,
    effort,
    wfOn,
    rc,
    ctx,
    ctxPct: data.context_window?.used_percentage,
    rl5: data.rate_limits?.five_hour?.used_percentage,
    rl5Reset: data.rate_limits?.five_hour?.resets_at,
    rl7: data.rate_limits?.seven_day?.used_percentage,
    rl7Reset: data.rate_limits?.seven_day?.resets_at,
    rlModel,
    branch,
    add: data.cost?.total_lines_added ?? 0,
    del: data.cost?.total_lines_removed ?? 0,
    wt: data.worktree?.name,
    jobs,
    orphans,
    vram,
    cpuPct: cpu,
    ram,
  };
}

// --- render: Dataframe -> row strings. ALL styling and ALL row grouping lives here — this is
// the ONLY function a future "move field X to a different row" request should touch.
//
// Current grouping (see the top-of-file note for the full list): line 1 is the PS1 mirror
// PLUS repo state (branch + diff + worktree) again — folded back in 2026-09-12, on request,
// after a same-day round trip that briefly split them onto separate rows. KNOWN, ACCEPTED
// DIVERGENCE: this makes line 1 no longer a byte-for-byte mirror of .zshrc's real PROMPT (which
// carries no git info at all — confirmed against zsh/zshrc's own `PROMPT=` line), only of its
// user@host:date|cwd portion. If that divergence ever needs to close instead, the fix is adding
// git info to the REAL PROMPT in zsh/zshrc, not reverting this — see the conversation that
// requested this cut. Line 2 pairs email with the Session uuid (both are copy/reference
// identity strings, not live state); the uuid MUST stay LAST on whatever row it appears on —
// tmux/tmux.conf sets `word-separators ' \t'`, so a row ending in the raw uuid is a one-gesture
// `claude --resume <id>` double-click copy, which breaks if the row wraps before reaching the
// uuid on a narrow pane. Keeping this row short (just email ahead of it) is what keeps that
// risk small; if a future change puts more before the uuid and this starts biting in practice,
// give Session its own row back rather than reintroducing width-fitting logic (deliberately
// absent from this whole file: every row here is an unconditional `join()` of present pieces,
// never a width-driven merge across rows).
// Line 3 pairs the agent's addressable name with its live Model/Effort AND the current Ctx
// reading — "what's running, right now, and how full its context is". Between the Ctx token
// count and its own percentage there is deliberately NO middot (MID, below): that glyph means
// "these are two different sibling values", and a raw count next to its own derived percentage
// is one fact shown twice, not two facts — a bare space reads as one unit. Line 4 is Rate,
// where the two values ARE independent siblings (the 5h window vs the 7d window), so they keep
// the middot between them — same role MID plays between Sys's CPU/RAM/VRAM readings below (each
// an independent host-resource sibling, unlike Ctx's count+percent pair). Line 5 (conditional)
// is Sys — host CPU/RAM/VRAM, distinct from Rate's API budget — and Line 6 (conditional) is Job;
// each is always its own row so neither can ever be silently dropped by a missing sibling value.
// Rate row, 5h-window half: "5h NN% [⟳reset]" — extracted out of render() only to keep its
// nesting under max-depth; the formatting itself is unchanged from the inline version.
function rl5Segment(rl5: number, rl5Reset: number | undefined): string {
  const { pct, col } = pctFmt(rl5);
  let seg = ` 5h ${ESC}[${col}m${pct}%${RST}`;
  if (rl5Reset != null) seg += ` ${DIM}${reset5(rl5Reset)}${RST}`;
  return seg;
}
// Rate row, 7d-window half: same shape as rl5Segment, plus the leading middot that marks the
// 5h/7d pair as independent siblings (see render()'s header note on MID).
function rl7Segment(rl7: number, rl7Reset: number | undefined): string {
  const { pct, col } = pctFmt(rl7);
  let seg = ` ${DIM}${MID}${RST} 7d ${ESC}[${col}m${pct}%${RST}`;
  if (rl7Reset != null) seg += ` ${DIM}${reset7(rl7Reset)}${RST}`;
  return seg;
}
// Rate row, per-model weekly-cap half (e.g. "· Fable 100% ⟳reset") — same reset7 shape as the
// 7d segment above since this window is also day-scale, plus the same leading middot marking it
// as an independent sibling value (see render()'s header note on MID).
function rlModelSegment(m: ModelLimit): string {
  const { pct, col } = pctFmt(m.pct);
  let seg = ` ${DIM}${MID}${RST} ${m.name} ${ESC}[${col}m${pct}%${RST}`;
  if (m.resetEpoch != null) seg += ` ${DIM}${reset7(m.resetEpoch)}${RST}`;
  return seg;
}
// Job row, admitted-work half: "<name>[+N] <elapsed> [det×N]" — extracted out of render() only
// to keep its nesting under max-depth; formatting unchanged from the inline version. VRAM used
// to ride this segment (only while a job was admitted); it now lives unconditionally on the Sys
// row instead, so it is not repeated here.
function admittedJobSegment(jobs: Admitted[], orphans: number): string {
  const first = jobs[0];
  const more = jobs.length > 1 ? `${DIM}+${jobs.length - 1}${RST}` : "";
  // Guaranteed by the length check above; only noUncheckedIndexedAccess can't see that.
  let seg =
    first !== undefined ? ` ${first.name}${more} ${dur(first.secs)}` : "";
  if (orphans > 0) seg += ` ${DIM}det×${orphans}${RST}`;
  return seg;
}
// Sys row: "CPU NN% · RAM NN% (X.X/Y.YG) [· VRAM NN% (X.X/Y.YG)]" — host resource usage, always
// its own row like Job (never folded into Rate, which is API budget, not host load). All three
// percentages share the same green/yellow/red pctFmt threshold as every other percentage in
// this file; the fraction rides alongside each, dimmed, as supporting detail — same
// percent-then-dim-detail shape rl5Segment/rl7Segment already use for their reset countdowns.
function memSegment(label: string, m: MemReading): string {
  const { pct, col } = pctFmt(m.pct);
  return `${label} ${ESC}[${col}m${pct}%${RST} ${DIM}(${m.frac})${RST}`;
}
function sysSegment(
  cpu: number | undefined,
  ram: MemReading | undefined,
  vram: MemReading | undefined,
): string {
  const parts: string[] = [];
  if (cpu != null) {
    const { pct, col } = pctFmt(cpu);
    parts.push(`CPU ${ESC}[${col}m${pct}%${RST}`);
  }
  if (ram != null) parts.push(memSegment("RAM", ram));
  if (vram != null) parts.push(memSegment("VRAM", vram));
  return parts.join(` ${DIM}${MID}${RST} `);
}
function render(df: Dataframe): string {
  const join = (t: string, seg: string) => (t ? t + SEP : "") + seg;

  const user = userInfo().username;
  const host = osHostname().split(".")[0];
  const d = new Date();
  const dt = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const line1 =
    `${ESC}[35m${user}${RST}@${ESC}[33m${host}${RST}:` +
    `${ESC}[36m${dt}${RST}|${ESC}[32m${shorten(df.cwd)}${RST}`;

  let identityLine = "";
  if (df.email != null)
    identityLine = join(identityLine, `${ESC}[38;5;103m${df.email}${RST}`);
  if (df.sid != null)
    identityLine = join(
      identityLine,
      `${ESC}[38;5;103mSession:${RST} ${DIM}${df.sid}${RST}`,
    );

  let agentLine = "";
  if (df.sessionName != null)
    agentLine = join(agentLine, `${ESC}[38;5;214m${df.sessionName}${RST}`);
  agentLine = join(agentLine, `${ESC}[38;5;30m${df.model}${RST}`);
  if (df.effort) {
    agentLine += `${SEP}${ESC}[38;5;209m${df.effort}${RST}`;
    // Tailwind violet-500 (#8b5cf6), matched 2026-09-11 against Claude Code's own /effort
    // slider "ultracode" label. truecolor (38;2;r;g;b), not the 256-palette used elsewhere in
    // this file: the palette's nearest steps (ANSI 93/129/135/141) were all visibly off.
    if (df.wfOn) agentLine += `${ESC}[38;2;139;92;246m+WF${RST}`;
  }
  // Always rendered, one distinct form per state (see rcState()): an absent segment would make
  // "disconnected" and "probe broken" look identical, which is the ambiguity this exists to
  // remove. 🔗 stays unstyled — an emoji does not reliably repaint under an fg override.
  if (df.rc === "on") agentLine += `${SEP}🔗`;
  else if (df.rc === "off") agentLine += `${SEP}${DIM}rc:off${RST}`;
  else agentLine += `${SEP}${ESC}[38;5;178mrc:?${RST}`;

  let ctxSeg = `${ESC}[38;5;66mCtx:${RST} ${df.ctx}`;
  if (df.ctxPct != null) {
    const { pct, col } = pctFmt(df.ctxPct);
    // No MID here on purpose — see render()'s header note: this is one fact (context usage)
    // shown two ways, not two sibling facts, so a bare space separates them, not the middot.
    ctxSeg += ` ${ESC}[${col}m${pct}%${RST}`;
  }
  agentLine = join(agentLine, ctxSeg);

  let rateLine = "";
  if (df.rl5 != null || df.rl7 != null || df.rlModel.length > 0) {
    rateLine = `${ESC}[38;5;108mRate:${RST}`;
    if (df.rl5 != null) rateLine += rl5Segment(df.rl5, df.rl5Reset);
    if (df.rl7 != null) rateLine += rl7Segment(df.rl7, df.rl7Reset);
    for (const m of df.rlModel) rateLine += rlModelSegment(m);
  }

  let repoLine = "";
  if (df.branch)
    repoLine = join(repoLine, `${ESC}[38;5;96m${BR} ${df.branch}${RST}`);
  repoLine = join(repoLine, `${ESC}[38;5;178m(+${df.add},-${df.del})${RST}`);
  if (df.wt) repoLine = join(repoLine, `${ESC}[38;5;140mwt: ${df.wt}${RST}`);

  let sysLine = "";
  const sysSeg = sysSegment(df.cpuPct, df.ram, df.vram);
  if (sysSeg) sysLine = `${ESC}[38;5;74mSys:${RST} ${sysSeg}`;

  let jobLine: string | undefined;
  if (df.jobs.length > 0 || df.orphans > 0) {
    jobLine = `${ESC}[38;5;173mJob:${RST}`;
    if (df.jobs.length > 0) {
      jobLine += admittedJobSegment(df.jobs, df.orphans);
    } else {
      // Detached processes alive with nothing admitted: waiting, wedged, or leaked — all three
      // are states the harness reports as "idle", which is the failure this segment answers.
      jobLine += ` ${DIM}—${RST} ${ESC}[38;5;167mdet×${df.orphans}${RST}`;
    }
  }

  return [
    join(line1, repoLine),
    identityLine,
    agentLine,
    rateLine,
    sysLine,
    jobLine,
  ]
    .filter((r): r is string => r != null && r !== "")
    .join("\n");
}

// --- entry: read stdin JSON, build the dataframe, render, write. Graceful: an invalid/missing
// JSON payload still renders line 1 (from $PWD, no dataframe needed) plus a hint. ---
const raw = await Bun.stdin.text();
// any -> StatusInput at the trust boundary (no `as` cast).
const parseResult = fromThrowable((): StatusInput => JSON.parse(raw))();
if (parseResult.isErr()) {
  const cwd = process.env.PWD ?? "";
  const user = userInfo().username;
  const host = osHostname().split(".")[0];
  const d = new Date();
  const dt = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  process.stdout.write(
    `${ESC}[35m${user}${RST}@${ESC}[33m${host}${RST}:${ESC}[36m${dt}${RST}|${ESC}[32m${shorten(cwd)}${RST}\n`,
  );
  process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
  process.exit(0);
}

const df = await buildDataframe(parseResult.value);
process.stdout.write(render(df));
