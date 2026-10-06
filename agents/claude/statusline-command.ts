// Claude Code statusLine — bun/TypeScript. mac & WSL.
// Source of truth: ~/dotfiles/agents/claude/statusline-command.ts
//   -> symlinked to ~/.claude/statusline-command.ts by scripts/link-dots.ts
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
//   5 Sys: CPU <pct>% · RAM <pct>% (<used>/<total>G) · VRAM <pct>% (<used>/<total>G) · Disk ..
//     (host load; ALWAYS present, and every reading in it is a value or `<label> n/a (<why>)` —
//     read and rendered by host-load.ts (also `s` in a shell). CPU/RAM come from /proc on Linux and
//     from os.cpus()/vm_stat on macOS, see cpuPct()/ramFrac() there;
//     CPU needs a prior render to diff against, so its very first render reads n/a; VRAM is
//     read from a cache that a background sampler fills (see SAMPLE_ENV), so a render never waits
//     for nvidia-smi: the first one reads `n/a (sampling in progress)`, a newer sample that has
//     not landed shows the last good one, marked `stale <N>s` from 60 s on; a Mac without nvidia-smi
//     has no VRAM segment at all, see vramGated(); see the EXPLICIT-ABSENCE law below)
//   6 Job: ... (conditional: only while a job is admitted, an orphan lives, or the scan failed)
//   7 <row> <elapsed> <label> │ <doing>, ONE LINE PER WORKER (no "Run:" head: the row id says it), longest-running first, at most RUN_LINES
//     then `+N more`; `stale×N` on its own line (conditional: workers started by agent-router;
//     the markers are agents/routing-control/state.ts; a marker whose process is gone is
//     counted as stale, never hidden; an unreadable state dir prints n/a with the reason)
//
// EXPLICIT-ABSENCE (2026-10-03): no reading is ever dropped from a row because it could not be
// taken — it prints as n/a with the reason. Silence is reserved for "does not exist" (not a
// repo -> no branch; no admitted job -> no Job row; no drive on this OS -> no disk; a parsed
// config that lacks a field -> no email). Defined at naSegment(); the contract is pinned by
// hooks/tests/statusline-explicit-absence.test.ts.
//
// TIGER-STYLE (practicing-tiger-style, explicit request 2026-09-12): every subprocess call in
// buildDataframe() is bounded. Two calls — the `git rev-parse` branch lookup and the `ps
// -eo` process-table scan — used to have NO timeout, unlike every other call here (agentName:
// 3000ms, herdrSend: 200ms; nvidia-smi is not a render child at all, see SAMPLE_ENV). A stale NFS-mounted repo, a held git index.lock,
// or `ps` delayed by extreme scheduling pressure (this host has run 40+ concurrent Claude
// sessions plus several 100%-CPU experiments at once, observed live) would hang either call
// synchronously and freeze the whole render, not just its own segment. Both now share
// ENRICHMENT_TIMEOUT_MS, reusing the 2000ms nvidia-smi had then rather than inventing a new number
// for an equivalent risk. A call that hits its bound is caught and its segment prints n/a with
// the reason (since 2026-10-03; it used to be omitted without a trace).
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
// Static safety comes from the zod schemas below (every external value is parsed, see ZOD FIRST)
// + native `!= null` narrowing. Input: JSON via stdin from Claude Code.

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { createConnection } from "node:net";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, jsonText, z } from "../hooks/zod.ts";
import {
  activeDir,
  ActiveSchema,
  progressFile,
  ProgressSchema,
} from "../routing-control/state.ts";
import { DIM, ESC, MID, NA_COLOR, RST, naSegment, pctFmt } from "./ansi.ts";
import {
  ENRICHMENT_TIMEOUT_MS,
  execBounded,
  readJson,
  writeCache,
} from "./bounded.ts";
import {
  type DiskEntry,
  type MemReading,
  readHostLoad,
  sysRow,
  sysSegment,
} from "./host-load.ts";
import {
  clockHM,
  localFromEpochSec,
  nowEpochSec,
  pad2,
  promptParts,
  stampMDHM,
  type PromptParts,
} from "./hooks/prompt-stamp.ts";

// ZOD FIRST (writing-typescript, owner call 2026-10-03): every value that enters this file from
// outside — the stdin payload, the cache files under ~/.cache/claude, ~/.claude.json, the storage
// TOML, a failed child process's error object — is parsed with a schema here, and the parsed
// OUTPUT is what the rest of the file uses. A type annotation on JSON.parse() or an `as` cast
// proves nothing, and a hand-written `x is T` guard drifts from the type it guards. The types
// below are z.infer of these schemas, so the schema is the one place a shape is written.
// A file that fails its schema is "no usable file" (a cache is re-sampled) or an explicit n/a
// (~/.claude.json, the TOML, the payload) — never half-trusted.
// A value the source may send as null, or omit, is `undefined` after parsing: one absent state.
const maybe = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? undefined);

const RateWindowSchema = z.object({
  used_percentage: maybe(z.number()),
  resets_at: maybe(z.number()), // Unix epoch seconds
});
const StatusInputSchema = z.object({
  cwd: maybe(z.string()),
  session_id: maybe(z.string()),
  // NOT the displayed name: it can hold an AI-generated title instead of the real
  // cross-session-addressable name (caught live 2026-08-28 — one session showed its title here
  // while `claude agents --json` still had "firedancer-1d"). Read only as a CHANGE SIGNAL: it is
  // the custom title (or AI title) and moves the instant /rename runs, so a new value bypasses
  // the name cache's TTL (see agentName()).
  session_name: maybe(z.string()),
  workspace: maybe(z.object({ current_dir: maybe(z.string()) })),
  model: maybe(
    z.object({ display_name: maybe(z.string()), id: maybe(z.string()) }),
  ),
  context_window: maybe(
    z.object({
      total_input_tokens: maybe(z.number()),
      current_usage: maybe(z.object({ input_tokens: maybe(z.number()) })),
      used_percentage: maybe(z.number()),
    }),
  ),
  cost: maybe(
    z.object({
      total_lines_added: maybe(z.number()),
      total_lines_removed: maybe(z.number()),
    }),
  ),
  effort: maybe(z.object({ level: maybe(z.string()) })),
  rate_limits: maybe(
    z.object({
      five_hour: maybe(RateWindowSchema),
      seven_day: maybe(RateWindowSchema),
    }),
  ),
  worktree: maybe(z.object({ name: maybe(z.string()) })),
});
type StatusInput = z.output<typeof StatusInputSchema>;

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
  sessionName?: string | undefined; // undefined with no sessionNameWhy = not listed yet
  sessionNameWhy?: string | undefined; // `claude agents --json` failed: the name is unknown
  email?: string | undefined;
  model: string;
  effort?: string | undefined;
  wfOn: boolean;
  /** Remote Control: on / off / unknown — see rcState(). */
  rc: RcState;
  ctx?: string | undefined; // undefined = the payload carried no token count (NOT zero tokens)
  ctxPct?: number | undefined;
  rl5?: number | undefined;
  rl5Reset?: number | undefined;
  rl7?: number | undefined;
  rl7Reset?: number | undefined;
  rlModel: ModelLimit[];
  accountWhy?: string | undefined; // ~/.claude.json unreadable / unexpected shape: email unknown
  modelCapsWhy?: string | undefined; // same, for the per-model weekly caps
  branch?: string | undefined; // undefined with no branchWhy = cwd is not a repo (nothing to show)
  branchWhy?: string | undefined; // the lookup itself failed — shown as n/a, never dropped
  add?: number | undefined; // undefined = the payload carried no cost block (NOT zero lines)
  del?: number | undefined;
  wt?: string | undefined;
  jobs: Admitted[];
  orphans: number;
  jobScanWhy?: string | undefined; // the process scan failed: jobs/orphans are unknown, not zero
  // agent-router workers. undefined = agent-router has never run on this machine (no state dir).
  routes?: Result<RouteRun[], string> | undefined;
  // Host readings are Results, not optionals: "could not be taken" carries its reason, and
  // render() prints it. See the EXPLICIT-ABSENCE law below.
  // undefined: this host has no discrete VRAM at all (see vramGated) — silence, not n/a.
  vram: Result<MemReading, string> | undefined;
  disks: Result<DiskEntry[], string>;
  cpuPct: Result<number, string>;
  ram: Result<MemReading, string>;
}

const HOME = process.env.HOME ?? "";

// --- ANSI / glyph constants (literals so segment assembly stays readable) ---
const SEP = ` ${DIM}|${RST} `;
const BR = "⎇"; //    git branch glyph
const RSET = "⟳"; //  rate-limit reset marker

// Which Claude account this CLI is authenticated as, AND the per-model weekly caps below —
// one parse of ~/.claude.json serves both, the same file `claude` itself writes on login and
// keeps refreshing (via `cachedUsageUtilization`) whenever it fetches usage data.
// Cost measured 2026-08-24: 0.64 ms read + 0.91 ms parse for a 129 KB file, against the
// 8.8 ms this script already spends on its one `ps -eo` pass. Not worth caching.
// The file is read once as raw JSON; each reader below validates ONLY the part it uses, so a
// drifted `cachedUsageUtilization` cannot take the account down with it.
// err = the file could not be read or parsed (claude rewrites it constantly, so a read can land
// mid-write), or a part has an unexpected shape: that part is then UNKNOWN, which render() says,
// instead of reading as "no account" / "no cap". A part that is validly absent is the real absence.
function readClaudeJson(): Result<unknown, string> {
  const unreadable = "~/.claude.json unreadable";
  const text = fromThrowable(
    () => readFileSync(`${HOME}/.claude.json`, "utf8"),
    () => unreadable,
  )();
  if (text.isErr()) return err(text.error);
  const parsed = jsonText.safeParse(text.value);
  return parsed.success ? ok(parsed.data) : err(unreadable);
}
const AccountSchema = z.object({
  oauthAccount: maybe(z.object({ emailAddress: maybe(z.string()) })),
});
function account(cj: unknown): Result<string | undefined, string> {
  const parsed = AccountSchema.safeParse(cj);
  if (!parsed.success)
    return err("~/.claude.json has an unexpected account shape");
  // `||` not `??`: an empty string is not an account either, and must drop the segment.
  const email = parsed.data.oauthAccount?.emailAddress;
  return ok(email !== undefined && email !== "" ? email : undefined);
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
const CapsSchema = z.object({
  cachedUsageUtilization: maybe(
    z.object({
      utilization: maybe(
        z.object({
          limits: maybe(
            z.array(
              z.object({
                kind: maybe(z.string()),
                percent: maybe(z.number()),
                resets_at: maybe(z.string()),
                scope: maybe(
                  z.object({
                    model: maybe(z.object({ display_name: maybe(z.string()) })),
                  }),
                ),
              }),
            ),
          ),
        }),
      ),
    }),
  ),
});
function modelWeeklyLimits(cj: unknown): Result<ModelLimit[], string> {
  const parsed = CapsSchema.safeParse(cj);
  if (!parsed.success)
    return err("~/.claude.json has an unexpected usage-limits shape");
  const limits = parsed.data.cachedUsageUtilization?.utilization?.limits ?? [];
  const out: ModelLimit[] = [];
  for (const l of limits) {
    if (
      l.kind !== "weekly_scoped" ||
      l.percent === null ||
      l.percent === undefined
    )
      continue;
    const name = l.scope?.model?.display_name;
    if (name === undefined || name === "") continue;
    // Instant.from demands an offset/`Z` (Date guessed local time for a bare one); a string it
    // rejects drops just the reset countdown, like an unparseable one always has.
    const resetsAt = l.resets_at;
    const epochMs =
      resetsAt !== undefined && resetsAt !== ""
        ? fromThrowable(
            () => Temporal.Instant.from(resetsAt).epochMilliseconds,
          )().unwrapOr(undefined)
        : undefined;
    out.push({
      name,
      pct: l.percent,
      resetEpoch:
        epochMs !== undefined ? Math.floor(epochMs / 1000) : undefined,
    });
  }
  return ok(out);
}

// Is `ultracode: true` set in the CLI's OWN live settings file — not this repo's committed
// agents/claude/settings.json, which only seeds it. The CLI rewrites ~/.claude/settings.json
// itself on interactive /model or /effort changes (confirmed 2026-09-05: a live effort choice
// showed up here as modelSettings.<model>.effortLevel, not as this repo's flat `effortLevel`
// key), so this file — not the repo source — is the only place that reflects what is ACTUALLY
// configured right now. Cheap like account() just above: same file class, smaller payload.
const SettingsSchema = z.object({ ultracode: z.boolean().optional() });
function ultracodeConfigured(): boolean {
  // unreadable / not JSON / wrong shape -> treated as not configured, the segment reads "off"
  return (
    readJson(`${HOME}/.claude/settings.json`, SettingsSchema)?.ultracode ===
    true
  );
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
    const read = readFdChunk(fd, buf, carry, chunk);
    if (read.isErr()) return undefined;
    if (read.value <= 0) return false;
    const end = carry + read.value;
    if (buf.subarray(0, end).indexOf(pat) !== -1) return true;
    carry = Math.min(pat.length - 1, end);
    buf.copy(buf, 0, end - carry, end);
  }
}
function readFdChunk(fd: number, buf: Buffer, offset: number, length: number) {
  return fromThrowable(() => readSync(fd, buf, offset, length, null))();
}

/** true/false = scanned; undefined = could not scan (missing, unreadable). */
function binaryContains(path: string, needle: string): boolean | undefined {
  const opened = fromThrowable(() => openSync(path, "r"))();
  if (opened.isErr()) return undefined;
  // Cleanup runs on return AND on throw, same as the prior try/finally: the fd closes once this
  // block ends, in either case.
  using _fd = {
    [Symbol.dispose]: () => {
      closeSync(opened.value);
    },
  };
  return scanFd(opened.value, Buffer.from(needle));
}

const RcProbeCacheSchema = z.record(z.string(), z.boolean());
/**
 * Keyed by path+size+mtime, and a MAP rather than one slot: sessions on two CLI builds render
 * side by side after an auto-update, and a single slot would make them evict each other and
 * re-scan ~230 MB on every render.
 */
function rcProbeValid(): boolean | undefined {
  const exe = process.env.CLAUDE_CODE_EXECPATH;
  if (exe === undefined || exe === "") return undefined;
  const st = fromThrowable(() => statSync(exe))();
  if (st.isErr()) return undefined;
  const key = `${exe}\u0000${st.value.size}\u0000${st.value.mtimeMs}`;
  // A cache that is not a plain {key: boolean} map is "no cache": one re-scan rewrites it clean.
  const cache = readJson(RC_PROBE_CACHE, RcProbeCacheSchema) ?? {};
  const hit = cache[key];
  if (hit !== undefined) return hit;
  const valid = binaryContains(exe, RC_NEEDLE);
  if (valid === undefined) return undefined;
  // The cache is an optimization; a failed write leaves the answer above standing.
  writeCache(RC_PROBE_CACHE, { ...cache, [key]: valid });
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
const AGENT_LIST_TIMEOUT_MS = 3000; // `claude agents --json`, slower than the 2000ms enrichment bound
// statusLine commands can run with a narrower PATH than an interactive shell; prefer the env
// var Claude Code exports for its own binary over a bare PATH lookup.
const CLAUDE_BIN =
  process.env.CLAUDE_CODE_EXECPATH !== undefined &&
  process.env.CLAUDE_CODE_EXECPATH !== ""
    ? process.env.CLAUDE_CODE_EXECPATH
    : "claude";

// `hint`: the stdin session_name seen when this entry was fetched — a different value now means
// the session was renamed, so the entry is stale regardless of age.
const AgentNameEntrySchema = z.object({
  name: z.string().optional(),
  at: z.number(),
  hint: z.string().optional(),
});
type AgentNameEntry = z.output<typeof AgentNameEntrySchema>;
const AgentNameCacheSchema = z.record(z.string(), AgentNameEntrySchema);
// What `claude agents --json` prints: one object per session.
const AgentListSchema = z.array(
  z.object({ sessionId: maybe(z.string()), name: maybe(z.string()) }),
);
// Cache-miss refresh: fold `claude agents --json`'s list into the sid->name map, keeping only
// entries that carry a sessionId. Extracted out of agentName() only to keep its try/for nesting
// under max-depth; the exactOptionalPropertyTypes name-omission below is unchanged.
function agentNameEntries(
  list: z.output<typeof AgentListSchema>,
  now: number,
): Record<string, AgentNameEntry> {
  const next: Record<string, AgentNameEntry> = {};
  for (const a of list) {
    if (a.sessionId === undefined || a.sessionId === "") continue;
    // exactOptionalPropertyTypes: omit `name` rather than set it to explicit undefined.
    next[a.sessionId] = {
      at: now,
      ...(a.name !== undefined ? { name: a.name } : {}),
    };
  }
  return next;
}
// ok(undefined) = the session is simply not listed (yet): nothing to show. err = the lookup
// failed, so the name is unknown, which render() says instead of dropping the segment.
function agentName(
  sid: string,
  hint?: string,
): Result<string | undefined, string> {
  // missing / corrupt / wrong-shape cache file -> treat as empty and refetch below
  const cache = readJson(AGENT_NAME_CACHE, AgentNameCacheSchema) ?? {};
  const hit = cache[sid];
  // A /rename shows up here first: the stdin session_name moves at once, while the cached name
  // would lag up to the TTL (and the herdr tab with it). Only a KNOWN previous value can differ —
  // an entry with no stored hint is not treated as renamed.
  const renamed =
    hit?.hint !== undefined && hint !== undefined && hit.hint !== hint;
  if (
    hit !== null &&
    hit !== undefined &&
    !renamed &&
    Temporal.Now.instant().epochMilliseconds - hit.at < AGENT_NAME_TTL_MS
  )
    return ok(hit.name);

  // Cache miss or stale: pay the ~0.5-0.75s (measured 2026-08-28) `claude agents --json` cost.
  const outResult = execBounded(
    "claude agents",
    CLAUDE_BIN,
    ["agents", "--json"],
    AGENT_LIST_TIMEOUT_MS,
  );
  if (outResult.isErr()) return err(outResult.error.why); // `claude` missing/slow/errored/over budget
  const listResult = jsonOf(AgentListSchema).safeParse(outResult.value);
  if (!listResult.success) return err("claude agents output unparsable");
  const now = Temporal.Now.instant().epochMilliseconds;
  const next = agentNameEntries(listResult.data, now);
  if (!Object.hasOwn(next, sid)) next[sid] = { at: now }; // not listed yet -> cache the miss too
  // Keep every session's last-seen hint across this whole-file rewrite; record ours.
  for (const [id, entry] of Object.entries(next)) {
    const seen = id === sid ? hint : cache[id]?.hint;
    if (seen !== undefined) entry.hint = seen;
  }
  // best-effort write, result discarded on purpose: cache write failed (e.g. read-only fs) ->
  // value below still returned, just not persisted.
  writeCache(AGENT_NAME_CACHE, next);
  return ok(next[sid]?.name);
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
  if (
    process.env.HERDR_ENV !== "1" ||
    socketPath === undefined ||
    socketPath === "" ||
    paneId === undefined ||
    paneId === ""
  )
    return;

  const stamp = Temporal.Now.instant().epochMilliseconds;
  const tokens: Record<string, string> = { model: m };
  // Rides the SAME request as model — one socket round-trip, not two (see the
  // ONE-REQUEST-PER-CONNECTION note above for why a second request here would risk being
  // dropped anyway).
  if (sessionName !== undefined && sessionName !== "")
    tokens.fullname = sessionName;
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
  if (
    tabId !== undefined &&
    tabId !== "" &&
    sessionName !== undefined &&
    sessionName !== ""
  ) {
    const lastNamePart = sessionName.split("-").pop();
    const shortName =
      lastNamePart !== undefined && lastNamePart !== ""
        ? lastNamePart
        : sessionName;
    await herdrSend(socketPath, {
      id: `dotfiles:statusline-tab:${stamp}`,
      method: "tab.rename",
      params: { tab_id: tabId, label: shortName },
    });
  }
}

// 5h reset: epoch s -> "⟳HH:MM(<h>h<mm>m)" — local clock + time remaining.
function reset5(epoch: number): string {
  const clock = clockHM(localFromEpochSec(epoch));
  const s = Math.max(0, epoch - nowEpochSec());
  const rem = `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`;
  return `${RSET}${clock}(${rem})`;
}

// 7d reset: epoch s -> "⟳MM-DD HH:MM(<d>d<hh>h)" — date + local clock + time remaining.
// The 7d horizon spans days, so it carries a date (unlike 5h) and counts down in days+hours;
// inside the final day it drops to the 5h-style hours+minutes.
function reset7(epoch: number): string {
  const clock = stampMDHM(localFromEpochSec(epoch));
  const s = Math.max(0, epoch - nowEpochSec());
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
    ?.replace(/\.resource\.json$/u, "");
  return name === "" ? undefined : name;
}
// ps's `etime`, "[[dd-]hh:]mm:ss" on both procps and BSD ps, in seconds. A bare number is taken as
// seconds (etimes' shape), so a recorded etimes line still reads. undefined: not that shape.
function etimeSecs(etime: string): number | undefined {
  const m = etime.match(/^(?:(?:(\d+)-)?(\d+):)?(?:(\d+):)?(\d+)$/u);
  if (m === null) return undefined;
  const [, dd, a, b, last] = m;
  if (b === undefined && a === undefined) return Number(last); // "ss" alone: plain seconds
  // "mm:ss" matches a=mm (b unset); "hh:mm:ss" matches a=hh, b=mm.
  const [hh, mm] = b === undefined ? [0, Number(a)] : [Number(a), Number(b)];
  return Number(dd ?? 0) * 86_400 + hh * 3_600 + mm * 60 + Number(last);
}
// Reparented to init AND still pointing at a Claude scratchpad: a driver (or a leaked helper)
// that outlived its session. Counted, never judged — deciding which orphan is "real work" is
// exactly the guess this segment exists to stop us making.
function scanOutOfHarness(): {
  jobs: Admitted[];
  orphans: number;
  failed?: string; // set when `ps` itself failed: jobs/orphans are then unknown, not zero
} {
  // Tiger-Style bound (see the top-of-file note): a `ps` snapshot of the WHOLE process table
  // has no reason to be instant on a heavily loaded host, and this call used to have no
  // timeout at all.
  // `etime`, not `etimes`: etimes (plain seconds) is a procps extension that macOS's BSD ps
  // rejects ("etimes: keyword not found", exit 1), while etime exists in both — one call for
  // both OSes, parsed by etimeSecs().
  const rawResult = execBounded(
    "ps",
    "ps",
    ["-eo", "ppid=,etime=,args="],
    ENRICHMENT_TIMEOUT_MS,
  );
  // no ps / timed out: say so. This used to return an empty scan, which rendered as "no jobs".
  if (rawResult.isErr())
    return { jobs: [], orphans: 0, failed: rawResult.error.why };
  const raw = rawResult.value;
  const jobs: Admitted[] = [];
  let orphans = 0;
  for (const line of raw.split("\n")) {
    // .match(), not RegExp.prototype.exec(): this file imports node:child_process, and the
    // writing-bun-scripts floor (F4) fails any such file that also carries the token `exec(`.
    const m = line.match(/^\s*(\d+)\s+([\d:-]+)\s+(\S.*)$/u);
    if (m === null) continue;
    const [, ppid, etime, args] = m;
    // All three are non-optional capture groups, so a successful match always has them;
    // this guard exists only for noUncheckedIndexedAccess, never actually taken.
    if (ppid === undefined || etime === undefined || args === undefined)
      continue;
    const name = admittedName(args.split(/\s+/u));
    const secs = etimeSecs(etime);
    if (name !== null && name !== undefined && secs !== undefined)
      jobs.push({ name, secs });
    else if (ppid === "1" && args.includes("/scratchpad/")) orphans++;
  }
  return { jobs, orphans };
}
// elapsed: <h>h<mm>m past an hour, else <m>m<ss>s — same shape as the rate-limit countdowns.
const dur = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`
    : `${Math.floor(s / 60)}m${pad2(s % 60)}s`;
function tokenLabel(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function firstNonEmpty(primary: string | undefined, fallback: string): string {
  return primary !== undefined && primary !== "" ? primary : fallback;
}

// --- buildDataframe: stdin -> every displayable value, already computed. No ANSI, no rows. ---
async function buildDataframe(data: StatusInput): Promise<Dataframe> {
  // || (not ??): an empty cwd string must ALSO fall through to PWD, matching the old sh's
  // `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
  const workspaceDir = data.workspace?.current_dir;
  const cwdCandidate = firstNonEmpty(
    data.cwd,
    firstNonEmpty(workspaceDir, process.env.PWD ?? ""),
  );
  const cwd = cwdCandidate;
  const sid =
    data.session_id !== undefined && data.session_id !== ""
      ? data.session_id
      : undefined; // "" is not an id either
  const sessionNameHint =
    data.session_name !== undefined && data.session_name !== ""
      ? data.session_name
      : undefined;
  const nameResult =
    sid !== undefined
      ? agentName(sid, sessionNameHint)
      : ok<string | undefined, string>(undefined);
  const sessionName = nameResult.unwrapOr(undefined);
  const sessionNameWhy = nameResult.isErr() ? nameResult.error : undefined;
  const cjResult = readClaudeJson();
  const accountResult = cjResult.andThen(account);
  const capsResult = cjResult.andThen(modelWeeklyLimits);
  const email = accountResult.unwrapOr(undefined);
  const accountWhy = accountResult.isErr() ? accountResult.error : undefined;
  const rlModel = capsResult.unwrapOr([]);
  const modelCapsWhy = capsResult.isErr() ? capsResult.error : undefined;

  let model = data.model?.display_name ?? "";
  const modelId = data.model?.id ?? "";
  // model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a version,
  // else derive "Family X.Y" from the id (claude-opus-4-8[1m] -> Opus 4.8).
  if (!/[0-9]/u.test(model)) {
    // String.split always returns at least one element, so this is never actually undefined;
    // the fallback is only to satisfy noUncheckedIndexedAccess.
    const base = modelId.replace(/^claude-/u, "").split("[")[0] ?? "";
    const dash = base.indexOf("-");
    const fam = dash === -1 ? base : base.slice(0, dash);
    const ver = (dash === -1 ? "" : base.slice(dash + 1)).replaceAll("-", ".");
    if (fam !== "") {
      const famCap = fam.charAt(0).toUpperCase() + fam.slice(1);
      model = ver !== "" ? `${famCap} ${ver}` : famCap;
    }
  }
  if (model === "") model = "?";
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
  const effortDisplay =
    effort !== undefined && effort !== "" ? `${effort}${wfSuffix}` : effort;

  await reportToHerdr(model, sessionName, effortDisplay);

  // No `?? 0`: a payload that carries no token count is "unknown", not "zero tokens".
  const ctxTok =
    data.context_window?.total_input_tokens ??
    data.context_window?.current_usage?.input_tokens;
  const ctx = ctxTok === undefined ? undefined : tokenLabel(ctxTok);

  // git branch from cwd — see the top-of-file Tiger-Style note for why this call is bounded.
  // Exit 128 is git's code for EVERY fatal error (an empty repo's unknown HEAD, a dubious-
  // ownership refusal, a vanished cwd), so only git's own "not a git repository" sentence — read
  // from stderr, in the C locale — means "nothing to show". Every other failure is shown as n/a
  // with git's reason.
  const branchResult = execBounded(
    "git",
    "git",
    ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
    ENRICHMENT_TIMEOUT_MS,
    { ...process.env, LC_ALL: "C" },
  ).map((out) => out.trim());
  const notRepo =
    branchResult.isErr() &&
    branchResult.error.stderr.includes("not a git repository");
  const branch = branchResult.isOk() ? branchResult.value : undefined;
  // git's own words beat a bare "git exit 128": "fatal: <reason>" -> "<reason>", capped.
  const gitReason = branchResult.isErr()
    ? branchResult.error.stderr
        .split("\n")[0]
        ?.replace(/^fatal: /u, "")
        .slice(0, 60)
    : undefined;
  const branchWhy =
    branchResult.isErr() && !notRepo
      ? firstNonEmpty(gitReason, branchResult.error.why)
      : undefined;

  const scan = scanOutOfHarness();
  const { jobs, orphans } = scan;
  // Sys-row readings (host-load.ts) — always computed now, not gated on a job being admitted.
  const { cpuPct: cpu, ram, vram, disks } = readHostLoad();

  return {
    cwd,
    sid,
    sessionName,
    sessionNameWhy,
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
    accountWhy,
    modelCapsWhy,
    branch,
    branchWhy,
    add: data.cost?.total_lines_added,
    del: data.cost?.total_lines_removed,
    wt: data.worktree?.name,
    jobs,
    orphans,
    jobScanWhy: scan.failed,
    routes: routeRuns(),
    vram,
    disks,
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
// an independent host-resource sibling, unlike Ctx's count+percent pair). Line 5 (always present)
// is Sys — host CPU/RAM/VRAM, distinct from Rate's API budget — and Line 6 (conditional: only
// when a job is admitted, an orphan lives, or the scan failed) is Job; each is always its own row
// so neither can ever be silently dropped by a missing sibling value.
// Rate row, 5h window: "5h NN% [⟳reset]". The three window segments carry no separator of their
// own; rateRow() puts the middot BETWEEN them, so a missing 5h window cannot leave "Rate: · 7d".
function rl5Segment(rl5: number, rl5Reset: number | undefined): string {
  const { text: pct, col } = pctFmt(rl5);
  let seg = `5h ${ESC}[${col}m${pct}%${RST}`;
  if (rl5Reset !== undefined) seg += ` ${DIM}${reset5(rl5Reset)}${RST}`;
  return seg;
}
// Rate row, 7d window: same shape as rl5Segment.
function rl7Segment(rl7: number, rl7Reset: number | undefined): string {
  const { text: pct, col } = pctFmt(rl7);
  let seg = `7d ${ESC}[${col}m${pct}%${RST}`;
  if (rl7Reset !== undefined) seg += ` ${DIM}${reset7(rl7Reset)}${RST}`;
  return seg;
}
// Rate row, per-model weekly cap (e.g. "Fable 100% ⟳reset") — same reset7 shape as the 7d
// segment, since this window is also day-scale.
function rlModelSegment(m: ModelLimit): string {
  const { text: pct, col } = pctFmt(m.pct);
  let seg = `${m.name} ${ESC}[${col}m${pct}%${RST}`;
  if (m.resetEpoch !== undefined) seg += ` ${DIM}${reset7(m.resetEpoch)}${RST}`;
  return seg;
}
// Ctx segment: "Ctx: <tokens> NN%". One builder for the bar's agent row and the snapshot.
function ctxSegment(df: Pick<Dataframe, "ctx" | "ctxPct">): string {
  const label = `${ESC}[38;5;66mCtx:${RST}`;
  const na = `${NA_COLOR}n/a${RST}`;
  // Neither figure in the payload (before the first API response): one n/a, not two.
  if (df.ctx === undefined && df.ctxPct === null) return `${label} ${na}`;
  let seg = `${label} ${df.ctx ?? na}`;
  // No MID here on purpose — see render()'s header note: this is one fact (context usage)
  // shown two ways, not two sibling facts, so a bare space separates them, not the middot.
  if (df.ctxPct !== null && df.ctxPct !== undefined) {
    const { text: pct, col } = pctFmt(df.ctxPct);
    seg += ` ${ESC}[${col}m${pct}%${RST}`;
  } else {
    seg += ` ${na}`;
  }
  return seg;
}
// Rate row: "Rate: 5h NN% ⟳… · 7d NN% ⟳… [· <Model> NN% ⟳…]". A window the payload does not carry
// reads `5h n/a`; a payload with none at all (before the first API response, or an account with
// no rate limits) reads `Rate: n/a (…)`. One builder for the bar and for the snapshot
// log-sys-snapshot.ts attaches.
function rateRow(
  df: Pick<
    Dataframe,
    "rl5" | "rl5Reset" | "rl7" | "rl7Reset" | "rlModel" | "modelCapsWhy"
  >,
): string {
  const label = `${ESC}[38;5;108mRate:${RST}`;
  if (
    (df.rl5 === null || df.rl5 === undefined) &&
    (df.rl7 === null || df.rl7 === undefined) &&
    df.rlModel.length === 0
  )
    return `${label} ${NA_COLOR}n/a${RST} ${DIM}(no rate_limits in the payload)${RST}`;
  const parts: string[] = [
    df.rl5 !== null && df.rl5 !== undefined
      ? rl5Segment(df.rl5, df.rl5Reset)
      : `5h ${NA_COLOR}n/a${RST}`,
    df.rl7 !== null && df.rl7 !== undefined
      ? rl7Segment(df.rl7, df.rl7Reset)
      : `7d ${NA_COLOR}n/a${RST}`,
  ];
  for (const m of df.rlModel) parts.push(rlModelSegment(m));
  if (df.modelCapsWhy !== undefined && df.modelCapsWhy !== "")
    parts.push(naSegment("model caps", df.modelCapsWhy));
  // Independent sibling windows, so the middot (see render()'s header note on MID).
  return `${label} ${parts.join(` ${DIM}${MID}${RST} `)}`;
}
// Job row, admitted-work half: "<name>[+N] <elapsed> [orphan×N]" — extracted out of render() only
// to keep its nesting under max-depth. `orphan` spelled out (it was `det×N`, which named nothing
// a reader could look up): a process reparented to init that still points at a Claude scratchpad.
// VRAM used to ride this segment (only while a job was admitted); it now lives unconditionally
// on the Sys row instead, so it is not repeated here.
function admittedJobSegment(jobs: Admitted[], orphans: number): string {
  const first = jobs[0];
  const more = jobs.length > 1 ? `${DIM}+${jobs.length - 1}${RST}` : "";
  // Guaranteed by the length check above; only noUncheckedIndexedAccess can't see that.
  let seg =
    first !== undefined ? ` ${first.name}${more} ${dur(first.secs)}` : "";
  if (orphans > 0) seg += ` ${DIM}orphan×${orphans}${RST}`;
  return seg;
}
// Run row source: one marker per worker agent-router started (agents/routing-control/state.ts).
// A marker is written at start and removed at exit, so a marker whose process is gone means
// agent-router itself was killed — counted as stale, never dropped (EXPLICIT-ABSENCE).
interface RouteRun {
  choice: string;
  label: string;
  secs: number;
  alive: boolean;
  // what the worker is doing (codex-run progress file); undefined until its first event lands
  doing:
    | { last: string; commands: number; files: number; ageSecs: number }
    | undefined;
}
const readText = fromThrowable((path: string) => readFileSync(path, "utf8"));
function doingOf(runId: string): RouteRun["doing"] {
  const text = readText(progressFile(runId));
  if (text.isErr()) return undefined;
  const parsed = jsonOf(ProgressSchema).safeParse(text.value);
  if (!parsed.success) return undefined;
  const p = parsed.data;
  return {
    last: p.last,
    commands: p.commands,
    files: p.files,
    ageSecs: sinceSecs(p.at).unwrapOr(0),
  };
}
const pidAlive = fromThrowable((pid: number) => process.kill(pid, 0));
const sinceSecs = fromThrowable((iso: string) =>
  Math.max(
    0,
    Math.floor(
      Temporal.Now.instant().since(Temporal.Instant.from(iso)).total("seconds"),
    ),
  ),
);
const listDir = fromThrowable((dir: string) => readdirSync(dir));
function routeRuns(): Result<RouteRun[], string> | undefined {
  const dir = activeDir();
  if (!existsSync(dir)) return undefined;
  const names = listDir(dir);
  if (names.isErr()) return err(`cannot list ${dir}`);
  return ok(
    names.value
      .filter((n) => n.endsWith(".json") && !n.endsWith(".progress.json"))
      .flatMap((n) => {
        const parsed = jsonOf(ActiveSchema).safeParse(
          readFileSync(join(dir, n), "utf8"),
        );
        if (!parsed.success) return [];
        const a = parsed.data;
        return [
          {
            choice: a.choice,
            label: a.label,
            secs: sinceSecs(a.started_at).unwrapOr(0),
            alive: pidAlive(a.pid).isOk(),
            doing: doingOf(a.run_id),
          },
        ];
      }),
  );
}
// Run rows: one line per worker, like Claude Code's own background panel — "<row> <elapsed>
// <label> │ <doing>". No "Run:" head (owner 2026-10-06: 「Run: って labelは不要では？」): the row id
// (luna-high, sonnet-medium) already says what the line is, and the head cost every line 5 columns. Capped at RUN_LINES so a wide fan-out cannot
// push the other rows off screen; the cap is SAID (+N more), never silent. Stale markers get their
// own line.
const RUN_LINES = 6;
// "│ $ bun test x.ts · 12 cmd · 3 files": the worker's latest event, then what it has done so far.
// Older than a minute it says how old (a worker deep in reasoning prints nothing for a while — that
// is shown as age, not hidden). No progress file yet = no event yet, said as such.
function doingText(d: RouteRun["doing"]): string {
  if (d === undefined) return `${DIM}│ no event yet${RST}`;
  const age = d.ageSecs >= 60 ? ` ${DIM}(${dur(d.ageSecs)} ago)${RST}` : "";
  return `${DIM}│${RST} ${d.last}${age} ${DIM}· ${d.commands} cmd · ${d.files} files${RST}`;
}
function routeLines(runs: RouteRun[]): string[] {
  const live = runs.filter((r) => r.alive).toSorted((a, b) => b.secs - a.secs);
  const stale = runs.length - live.length;
  const lines = live
    .slice(0, RUN_LINES)
    .map(
      (r) =>
        `${r.choice} ${dur(r.secs)} ${DIM}${r.label.slice(0, 32)}${RST} ${doingText(r.doing)}`,
    );
  if (live.length > RUN_LINES)
    lines.push(`${DIM}+${live.length - RUN_LINES} more${RST}`);
  if (stale > 0) lines.push(`${ESC}[38;5;167mstale×${stale}${RST}`);
  return lines;
}
// The PS1 head in PS1's own colors (%F{magenta}%n@%F{yellow}%m:%F{cyan}date|%F{green}%~). The
// uncolored shape has one home, hooks/prompt-stamp.ts, shared with the /quote header.
// Its stamp is render time = "as of" for every value on screen. settings.json's
// statusLine.refreshInterval (5s) re-renders an idle pane, so a stamp more than a minute
// behind the clock means a stuck render. Minutes only, like PS1 — seconds were tried and
// rejected as noise (2026-09-27).
function coloredHead(p: PromptParts): string {
  return (
    `${ESC}[35m${p.user}${RST}@${ESC}[33m${p.host}${RST}:` +
    `${ESC}[36m${p.when} ${ESC}[38;5;66m${p.zone}${RST}|${ESC}[32m${p.cwd}${RST}`
  );
}
function render(df: Dataframe): string {
  const joinText = (t: string, seg: string) => (t !== "" ? t + SEP : "") + seg;

  const line1 = coloredHead(promptParts(df.cwd));

  let identityLine = "";
  if (df.email !== null && df.email !== undefined)
    identityLine = joinText(identityLine, `${ESC}[38;5;103m${df.email}${RST}`);
  else if (df.accountWhy !== undefined && df.accountWhy !== "")
    identityLine = joinText(identityLine, naSegment("account", df.accountWhy));
  if (df.sid !== null && df.sid !== undefined)
    identityLine = joinText(
      identityLine,
      `${ESC}[38;5;103mSession:${RST} ${DIM}${df.sid}${RST}`,
    );

  let agentLine = "";
  if (df.sessionName !== null && df.sessionName !== undefined)
    agentLine = joinText(agentLine, `${ESC}[38;5;214m${df.sessionName}${RST}`);
  else if (df.sessionNameWhy !== undefined && df.sessionNameWhy !== "")
    agentLine = joinText(agentLine, naSegment("name", df.sessionNameWhy));
  agentLine = joinText(agentLine, `${ESC}[38;5;30m${df.model}${RST}`);
  if (df.effort !== undefined && df.effort !== "") {
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

  agentLine = joinText(agentLine, ctxSegment(df));

  const rateLine = rateRow(df);

  let repoLine = "";
  if (df.branch !== undefined && df.branch !== "")
    repoLine = joinText(repoLine, `${ESC}[38;5;96m${BR} ${df.branch}${RST}`);
  else if (df.branchWhy !== undefined && df.branchWhy !== "")
    repoLine = joinText(repoLine, `${BR} ${naSegment("branch", df.branchWhy)}`);
  repoLine = joinText(
    repoLine,
    df.add === undefined || df.del === undefined
      ? naSegment("diff", "payload has no cost block")
      : `${ESC}[38;5;178m(+${df.add},-${df.del})${RST}`,
  );
  if (df.wt !== undefined && df.wt !== "")
    repoLine = joinText(repoLine, `${ESC}[38;5;140mwt: ${df.wt}${RST}`);

  // Always present: every reading in it is either a value or an explicit n/a.
  const sysLine = sysRow(df); // the Dataframe carries the HostLoad fields under the same names

  let jobLine: string | undefined;
  if (df.jobScanWhy !== undefined) {
    // The process scan failed, so "no jobs" would be a guess; say the scan failed instead.
    jobLine = `${ESC}[38;5;173mJob:${RST} ${naSegment("scan", df.jobScanWhy)}`;
  } else if (df.jobs.length > 0 || df.orphans > 0) {
    jobLine = `${ESC}[38;5;173mJob:${RST}`;
    if (df.jobs.length > 0) {
      jobLine += admittedJobSegment(df.jobs, df.orphans);
    } else {
      // Orphan processes alive with nothing admitted: waiting, wedged, or leaked — all three
      // are states the harness reports as "idle", which is the failure this segment answers.
      jobLine += ` ${DIM}—${RST} ${ESC}[38;5;167morphan×${df.orphans}${RST}`;
    }
  }

  // Run rows: present while agent-router has workers (or stale markers); n/a when unreadable.
  let runLines: string[] = [];
  if (df.routes !== undefined && df.routes.isErr())
    runLines = [naSegment("agent-router", df.routes.error)];
  else if (df.routes !== undefined) runLines = routeLines(df.routes.value);

  return [
    joinText(line1, repoLine),
    identityLine,
    agentLine,
    rateLine,
    sysLine,
    jobLine,
    ...runLines,
  ]
    .flatMap((r) => (r !== undefined && r !== "" ? [r] : [])) // drops undefined and "" without an `r is string` guard
    .join("\n");
}

// --- entry: read stdin JSON, build the dataframe, render, write. Graceful: an invalid/missing
// JSON payload still renders line 1 (from $PWD, no dataframe needed) plus a hint. ---
// Runtime floor, checked before anything touches Temporal. Which bun runs this is NOT this
// repo's choice — Claude Code inherits the PATH of the directory it was launched from, and mise
// auto_install can re-create an old install there (see mise.toml / doctor's bun-floor). Without
// this line a sub-1.4 bun throws a ReferenceError and the bar goes silently blank; with it the
// bar names the cause.
if (typeof Temporal === "undefined") {
  process.stdout.write(
    `${ESC}[38;5;167mstatusline: bun ${Bun.version} has no Temporal (needs >= 1.4)${RST} ` +
      `${DIM}— which bun: ${Bun.which("bun") ?? "?"} · mise run doctor${RST}`,
  );
  process.exit(0);
}
const raw = await Bun.stdin.text();
// unknown -> StatusInput at the trust boundary: parsed with StatusInputSchema, never cast. A
// payload that is not JSON, or has a field of the wrong type, renders line 1 plus the first
// reason — the whole bar saying "the input is wrong" beats a bar built from half-trusted values.
const json = jsonText.safeParse(raw);
if (!json.success) {
  process.stdout.write(`${coloredHead(promptParts(process.env.PWD ?? ""))}\n`);
  process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
  process.exit(0);
}
const payload = StatusInputSchema.safeParse(json.data);
if (!payload.success) {
  const issue = payload.error.issues[0];
  const path = (issue?.path ?? []).map(String).join(".");
  const where = path !== "" ? path : "(root)";
  process.stdout.write(`${coloredHead(promptParts(process.env.PWD ?? ""))}\n`);
  process.stdout.write(
    `${DIM}Model: ? | invalid statusline payload: ${where}: ${issue?.message ?? "?"}${RST}`,
  );
  process.exit(0);
}

const df = await buildDataframe(payload.data);
process.stdout.write(render(df));

// Hand the plain Sys row to hooks/log-sys-snapshot.ts, which attaches it to the transcript.
// This file stays the ONLY sampler (nvidia-smi, the /proc CPU delta) — the hook just reads the
// latest line, so a tool call never pays for a sample. Host-wide values, so one file serves
// every session. Best-effort: a failed write only means the next hook firing finds it stale.
const SYS_CACHE = `${HOME}/.cache/claude/statusline-sys.json`;
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const sysColored = sysSegment(df.cpuPct, df.ram, df.vram, df.disks);
const sysPlain = sysColored.replaceAll(ANSI, "");
// Never empty: every Sys reading is a value or an explicit n/a (see the EXPLICIT-ABSENCE law).
writeCache(SYS_CACHE, {
  at: Temporal.Now.instant().epochMilliseconds,
  line: `Sys: ${sysPlain}`,
  // Same colors as the bar's Sys row (pctFmt thresholds), for a renderer that keeps ANSI.
  ansi: `${ESC}[38;5;74mSys:${RST} ${sysColored}`,
});

// This session's rows for the snapshot, in display order: Ctx, then Rate. Neither is host-wide —
// each session's payload carries its own context and the rate_limits it last received, so one
// shared file let an idle session's older Rate overwrite a fresh one (observed 2026-10-01: 7d 60%
// then 51% with the same reset). One file per session; the hook reads its own and inserts the
// rows as given.
const sid = (payload.data.session_id ?? "").replaceAll(/[^A-Za-z0-9_-]/gu, "_");
if (sid !== "") {
  const rows = [ctxSegment(df), rateRow(df)]; // neither is ever empty: a value or an explicit n/a
  writeCache(`${HOME}/.cache/claude/statusline-session/${sid}.json`, {
    at: Temporal.Now.instant().epochMilliseconds,
    rows: rows.map((ansi) => ({ line: ansi.replaceAll(ANSI, ""), ansi })),
  });
}
