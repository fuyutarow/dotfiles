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
//   5 Sys: CPU <pct>% · RAM <pct>% (<used>/<total>G) · VRAM <pct>% (<used>/<total>G) · Disk ..
//     (host load; ALWAYS present, and every reading in it is a value or `<label> n/a (<why>)` —
//     CPU/RAM come from /proc on Linux and from os.cpus()/vm_stat on macOS, see cpuPct()/ramFrac();
//     CPU needs a prior render to diff against, so its very first render reads n/a; VRAM is
//     read from a cache that a background sampler fills (see SAMPLE_ENV), so a render never waits
//     for nvidia-smi: the first one reads `n/a (sampling in progress)`, a newer sample that has
//     not landed shows the last good one, marked `stale <N>s` from 60 s on; a Mac without nvidia-smi
//     has no VRAM segment at all, see vramGated(); see the EXPLICIT-ABSENCE law below)
//   6 Job: ... (conditional: only while a job is admitted, an orphan lives, or the scan failed)
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

import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmdirSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createConnection } from "node:net";
import { cpus, totalmem } from "node:os";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { z } from "zod";
import {
  clockHM,
  localFromEpochSec,
  nowEpochSec,
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

// Read a JSON file and validate it. undefined = no usable file (missing, not JSON, or the wrong
// shape) — the caller treats that as "expired" or reports its own n/a; it is never an assertion.
function readJson<S extends z.ZodType>(
  path: string,
  schema: S,
): z.output<S> | undefined {
  const parsed = fromThrowable((): unknown =>
    JSON.parse(readFileSync(path, "utf8")),
  )();
  if (parsed.isErr()) return undefined;
  const checked = schema.safeParse(parsed.value);
  return checked.success ? checked.data : undefined;
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

// EXPLICIT-ABSENCE law (owner ruling 2026-10-03: 「implicit display は本当によくない」). A value
// the bar could not take is printed as `<label> n/a (<why>)`, never left off the row: a missing
// segment reads as "there is nothing to show", which is a claim, and for a failed probe it is a
// false one (2026-10-03: a loaded host made nvidia-smi miss its 2 s bound, the miss was cached as
// "no GPU", and VRAM vanished while the card was fine). Absence stays silent ONLY where it means
// the thing does not exist (not a repo -> no branch; no model-scoped weekly cap -> no segment).
// rc:? above is the older instance of the same rule.
const NA_COLOR = `${ESC}[38;5;178m`; // amber, same as rc:? — "unverified", not "bad"
function naSegment(label: string, why: string): string {
  return `${label} ${NA_COLOR}n/a${RST} ${DIM}(${why})${RST}`;
}
// What execFileSync's thrown error carries, parsed rather than probed with `in`/`typeof`. Each
// field is read on its own (.catch): an error object that lacks or mangles one still yields the
// others, and the all-missing case falls through to the generic "<tool> failed" below.
const ExecErrorSchema = z.object({
  code: z.string().optional().catch(undefined),
  status: z.number().nullish().catch(undefined),
  signal: z.string().nullish().catch(undefined),
  stderr: z.string().optional().catch(undefined),
});
function execError(e: unknown): z.output<typeof ExecErrorSchema> {
  const parsed = ExecErrorSchema.safeParse(e);
  return parsed.success ? parsed.data : {};
}
// Why a bounded subprocess call failed, in the few words that tell a human what to fix: the tool
// is not installed, it hit its bound, it ran and exited non-zero, or a signal killed it.
function failWhy(
  e: unknown,
  tool: string,
  timeoutMs: number = ENRICHMENT_TIMEOUT_MS,
): string {
  const x = execError(e);
  if (x.code === "ENOENT") return `no ${tool}`;
  if (x.code === "ETIMEDOUT") return `${tool} timeout ${timeoutMs}ms`;
  if (typeof x.status === "number") return `${tool} exit ${x.status}`;
  // Killed by a signal (an OOM kill under load has status null): name it.
  if (x.signal) return `${tool} killed by ${x.signal}`;
  if (x.code) return `${tool} ${x.code}`;
  return `${tool} failed`;
}

// RENDER BUDGET (Tiger: bound the whole, not only each part). Every child below has its own
// bound (2 s, claude agents 3 s), but they run one after another: ps + git + nvidia-smi +
// claude agents hanging together is 9 s, longer than the 5 s statusLine.refreshInterval, so
// renders overlap and the bar itself piles load onto the host whose load made the children
// hang. All children share ONE deadline: each gets min(its own bound, what is left), and once
// nothing is left a child is not started — its segment prints n/a with that reason. Chosen as
// 4 s so the slowest possible render (budget + the 200 ms herdr push) ends inside one interval.
// performance.now(): monotonic, immune to a clock step, and defined on a bun without Temporal
// (the floor check at the bottom must still get to print its message).
const RENDER_BUDGET_MS = 4000;
const RENDER_T0 = performance.now();
interface ExecFailure {
  why: string; // the n/a reason, from failWhy
  stderr: string; // trimmed; "" when the child printed none or never started
  ran: boolean; // false: never started (budget spent) — says nothing about the tool, so never cache it
}
// Run one child inside the render budget. stderr is captured (not discarded) so a caller can
// tell git's "not a git repository" from its other fatal errors.
function execBounded(
  tool: string,
  file: string,
  args: string[],
  ownBoundMs: number,
  env?: NodeJS.ProcessEnv,
): Result<string, ExecFailure> {
  const left = RENDER_BUDGET_MS - (performance.now() - RENDER_T0);
  if (left <= 0) {
    return err({
      why: `${tool} not run, render budget ${RENDER_BUDGET_MS}ms spent`,
      stderr: "",
      ran: false,
    });
  }
  return execWithin(
    tool,
    file,
    args,
    Math.min(ownBoundMs, Math.ceil(left)),
    env,
  );
}
// One child under ONE bound, with no render budget in the way: the render path goes through
// execBounded above; the background GPU sampler (not a render) calls this directly.
function execWithin(
  tool: string,
  file: string,
  args: string[],
  boundMs: number,
  env?: NodeJS.ProcessEnv,
): Result<string, ExecFailure> {
  return fromThrowable(
    () =>
      execFileSync(file, args, {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: boundMs,
        ...(env ? { env } : {}),
      }),
    (e): ExecFailure => ({
      why: failWhy(e, tool, boundMs),
      stderr: (execError(e).stderr ?? "").trim(),
      ran: true,
    }),
  )();
}

// Write a cache file so no reader ever sees half of it: the whole file goes to a private temp
// name and is renamed into place (atomic on one filesystem). A plain writeFileSync truncates
// first, and these files are read by every other session on the host every 5 s — a reader landing
// in the gap got invalid JSON, which reads as "no cache" (a false n/a, or an nvidia-smi spawn
// nobody needed). Best-effort like every cache write: a failure leaves the old file and no temp.
function writeCache(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  fromThrowable(() => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, path);
  })().mapErr(() => fromThrowable(() => unlinkSync(tmp))());
}

const pad2 = (n: number) => String(n).padStart(2, "0");

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
  return fromThrowable(
    (): unknown => JSON.parse(readFileSync(`${HOME}/.claude.json`, "utf8")),
    () => "~/.claude.json unreadable",
  )();
}
const AccountSchema = z.object({
  oauthAccount: maybe(z.object({ emailAddress: maybe(z.string()) })),
});
function account(cj: unknown): Result<string | undefined, string> {
  const parsed = AccountSchema.safeParse(cj);
  if (!parsed.success)
    return err("~/.claude.json has an unexpected account shape");
  // `||` not `??`: an empty string is not an account either, and must drop the segment.
  return ok(parsed.data.oauthAccount?.emailAddress || undefined);
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
    if (l.kind !== "weekly_scoped" || l.percent == null) continue;
    const name = l.scope?.model?.display_name;
    if (!name) continue;
    // Instant.from demands an offset/`Z` (Date guessed local time for a bare one); a string it
    // rejects drops just the reset countdown, like an unparseable one always has.
    const resetsAt = l.resets_at;
    const epochMs = resetsAt
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
  // Cleanup runs on return AND on throw, same as the prior try/finally: the fd closes once this
  // block ends, in either case.
  using _fd = { [Symbol.dispose]: () => closeSync(opened.value) };
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
  if (!exe) return undefined;
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
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH || "claude";

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
    if (!a.sessionId) continue;
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
    hit != null &&
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
  const listResult = fromThrowable((): unknown =>
    JSON.parse(outResult.value),
  )().map((v) => AgentListSchema.safeParse(v));
  if (listResult.isErr() || !listResult.value.success)
    return err("claude agents output unparsable");
  const now = Temporal.Now.instant().epochMilliseconds;
  const next = agentNameEntries(listResult.value.data, now);
  if (!(sid in next)) next[sid] = { at: now }; // not listed yet -> cache the miss too
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
  if (process.env.HERDR_ENV !== "1" || !socketPath || !paneId) return;

  const stamp = Temporal.Now.instant().epochMilliseconds;
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
    ?.replace(/\.resource\.json$/, "");
  return name === "" ? undefined : name;
}
// ps's `etime`, "[[dd-]hh:]mm:ss" on both procps and BSD ps, in seconds. A bare number is taken as
// seconds (etimes' shape), so a recorded etimes line still reads. undefined: not that shape.
function etimeSecs(etime: string): number | undefined {
  const m = etime.match(/^(?:(?:(\d+)-)?(\d+):)?(?:(\d+):)?(\d+)$/);
  if (!m) return undefined;
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
    const m = line.match(/^\s*(\d+)\s+([\d:-]+)\s+(\S.*)$/);
    if (!m) continue;
    const [, ppid, etime, args] = m;
    // All three are non-optional capture groups, so a successful match always has them;
    // this guard exists only for noUncheckedIndexedAccess, never actually taken.
    if (ppid === undefined || etime === undefined || args === undefined)
      continue;
    const name = admittedName(args.split(/\s+/));
    const secs = etimeSecs(etime);
    if (name != null && secs !== undefined) jobs.push({ name, secs });
    else if (ppid === "1" && args.includes("/scratchpad/")) orphans++;
  }
  return { jobs, orphans };
}
// Shared shape for a "used/total" memory-style reading (RAM, VRAM): both the fraction string
// AND the percentage, since render() needs the percentage to threshold-color the segment the
// same way every other percentage in this file is colored (pctFmt) — a plain fraction alone
// cannot drive that.
const MemReadingSchema = z.object({
  frac: z.string(), // e.g. "16.2/54.9G"
  pct: z.number(), // used/total*100, unrounded — pctFmt() rounds at render time
  // Set only when this is the last GOOD sample served because the fresh one failed (VRAM only):
  // how old it is and why the fresh one failed. render() prints it, so an old number is never
  // shown as if it were current.
  stale: z.object({ secs: z.number(), why: z.string() }).optional(),
});
type MemReading = z.output<typeof MemReadingSchema>;
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
// nvidia-smi is ~170 ms of a ~200 ms render (measured 2026-10-01) and its answer is host-wide, so
// one sample is shared by every session for GPU_SAMPLE_TTL_MS. That is what lets settings.json run
// the bar every 5 s (statusLine.refreshInterval) — the cadence a Remote Control connect needs to
// show up promptly, since the bridge attaches after the command's own render.
const GPU_CACHE = `${HOME}/.cache/claude/statusline-gpu.json`;
const GPU_SAMPLE_TTL_MS = 5_000;
// The sampler's bound. Measured 2026-10-05 under load average 22-26 (24 samples): nvidia-smi
// p50 2.6 s, p90 5.6 s, max 12.6 s, 15 of 24 over the old 2 s bound. Above the
// worst seen, so a slow answer is an answer; below "hung", so a dead driver is still named.
// STATUSLINE_GPU_SAMPLE_TIMEOUT_MS lets the tests exercise the timeout without waiting it out.
const GPU_SAMPLE_TIMEOUT_MS = z.coerce
  .number()
  .int()
  .min(100)
  .max(120_000)
  .catch(20_000)
  .parse(process.env.STATUSLINE_GPU_SAMPLE_TIMEOUT_MS);
// A last-good sample older than this is a claim about a moment too far back to still be useful;
// beyond it the reading becomes n/a instead of a stale number.
const GPU_STALE_MAX_MS = 30 * 60_000;
// A last-good sample younger than this is shown without the `stale` marker (see memSegment).
const STALE_SHOW_S = 60;
// `reading`: the newest sample, set when it succeeded. `why`: set when it failed — a failure is
// cached for the TTL like a success, so a hung nvidia-smi costs one bounded render per 5 s, not
// every render. `good`: the newest SUCCESSFUL sample, kept across failures. The pre-2026-10-03
// shape wrote `reading: null` for ANY failure ("no GPU"), which is how a timeout under load made
// VRAM disappear; that shape carries no `why`, so it is simply treated as expired.
const GpuCacheSchema = z.object({
  at: z.number().optional(),
  reading: MemReadingSchema.nullish(), // `null` is the pre-fix "no GPU" marker
  why: z.string().optional(),
  good: z.object({ at: z.number(), reading: MemReadingSchema }).optional(),
});
type GpuCache = z.output<typeof GpuCacheSchema>;
// A timestamp is "within" a window only if it is not in the future: a clock stepped backwards
// (WSL2 time sync after sleep) must not keep an old entry fresh for hours or print a negative age.
function within(at: number, now: number, windowMs: number): boolean {
  return now - at >= 0 && now - at < windowMs;
}
// SAMPLING IS OFF THE RENDER PATH (Tiger ledger O4, 2026-10-05). The bar used to run nvidia-smi
// inside the render under a 2 s bound. Under load (load average 26 on 12 cores, plus the per-job
// nvidia-smi pollers of agent-resource-run) nvidia-smi takes 2-10 s, so a bound shorter than its
// service time failed nearly every attempt, and VRAM sat 264 s stale: an attempt-deadline below the
// service time is starvation, not a timeout. Now the render only READS the cache and, when it has
// expired, makes sure one sampler is running; the sampler is this same file started with
// SAMPLE_ENV set, gets GPU_SAMPLE_TIMEOUT_MS (above the worst latency measured), and writes the cache.
// The render never waits for it.
// An environment variable, not argv: this file has no command line of its own (its input is the
// stdin payload), so the mode is an internal channel between the render and the process it starts.
const SAMPLE_ENV = "STATUSLINE_SAMPLE_GPU";
// What a reading is marked with while the newest attempt has not finished (or there is none yet).
const SAMPLING_WHY = "sampling in progress";
// ONE nvidia-smi in flight host-wide (Tiger ledger O3). The lock is a directory because mkdir is
// atomic (EEXIST for every loser) and needs no flags or libraries. The render that wins it hands
// it to the sampler it starts (the sampler releases it when it ends), so while a sampler runs no
// other session starts a second one — at 40 sessions that is the difference between one process and
// a herd feeding the load that made nvidia-smi slow. Its owner is not recorded: a lock older than
// GPU_LOCK_STALE_MS (the sample bound + start-up margin) is a crashed sampler's, and is broken.
const GPU_LOCK = `${HOME}/.cache/claude/statusline-gpu.lock`;
const GPU_LOCK_STALE_MS = GPU_SAMPLE_TIMEOUT_MS + 15_000;
interface GpuLock {
  release(): void;
}
function acquireGpuLock(): Result<GpuLock, string> {
  const take = (): boolean =>
    fromThrowable(() => {
      mkdirSync(dirname(GPU_LOCK), { recursive: true });
      mkdirSync(GPU_LOCK);
    })().isOk();
  const lock: GpuLock = {
    release: () => {
      fromThrowable(() => rmdirSync(GPU_LOCK))();
    },
  };
  if (take()) return ok(lock);
  const held = fromThrowable(() => statSync(GPU_LOCK).mtimeMs)();
  const now = Temporal.Now.instant().epochMilliseconds;
  if (held.isOk() && !within(held.value, now, GPU_LOCK_STALE_MS)) {
    lock.release();
    if (take()) return ok(lock);
  }
  return err("another sampler holds the lock");
}
// Render side: make sure a sampler is in flight, and return at once. Ok = one is running or was
// just started; err = it could not be started (the reason is shown beside the reading).
function ensureSampler(): Result<void, string> {
  const lock = acquireGpuLock();
  if (lock.isErr()) return ok(undefined); // one is already in flight: that is the goal
  const started = fromThrowable(
    () => {
      const child = spawn(process.execPath, [import.meta.path], {
        stdio: "ignore",
        env: { ...process.env, [SAMPLE_ENV]: "1" },
      });
      child.once("error", () => lock.value.release());
      child.unref(); // the render exits without waiting; the child is bounded by its own timeout
    },
    (e): string => `sampler not started (${failWhy(e, "bun")})`,
  )();
  if (started.isErr()) lock.value.release();
  return started;
}
// Sampler side (`STATUSLINE_SAMPLE_GPU=1 bun statusline-command.ts`): take ONE sample under the long bound
// and record it. `good` is the previous last-good sample, carried over a failure so a transient
// miss can still be shown (marked stale) instead of turning into n/a. Returns the exit code; the
// caller exits AFTER this returns, so the lock is released by `using` first. Refuses to run
// without the lock: ensureSampler starts it and hands the lock over.
function runSampler(): number {
  if (!existsSync(GPU_LOCK)) {
    process.stderr.write(
      `statusline: ${SAMPLE_ENV} is set by the statusline, which holds ${GPU_LOCK}; refusing to run without it\n`,
    );
    return 2;
  }
  using _held: Disposable = {
    [Symbol.dispose]: () => {
      fromThrowable(() => rmdirSync(GPU_LOCK))();
    },
  };
  const good = readJson(GPU_CACHE, GpuCacheSchema)?.good;
  const sampled = sampleVram();
  // Stamped AFTER the sample returns, so the TTL runs from when the answer exists.
  const at = Temporal.Now.instant().epochMilliseconds;
  writeCache(
    GPU_CACHE,
    sampled.isOk()
      ? { at, reading: sampled.value, good: { at, reading: sampled.value } }
      : { at, why: sampled.error.why, good }, // JSON drops an undefined `good`
  );
  return 0;
}
// A Mac with no nvidia-smi has no discrete VRAM to read: Apple silicon's GPU shares the RAM the
// row already shows. That is "does not exist", which the EXPLICIT-ABSENCE law keeps silent. On
// Linux a missing nvidia-smi stays n/a — there it is a broken GPU box, not a GPU-less one.
function vramGated(): Result<MemReading, string> | undefined {
  const vram = vramFrac();
  const absent =
    process.platform === "darwin" &&
    vram.isErr() &&
    vram.error === "no nvidia-smi";
  return absent ? undefined : vram;
}
function vramFrac(): Result<MemReading, string> {
  // A missing tool needs no sampler to be known, and a Mac without one has no VRAM row (vramGated).
  if (Bun.which("nvidia-smi") === null) return err("no nvidia-smi");
  // A file that is missing or fails GpuCacheSchema is an empty cache. Read BEFORE taking `now`: the
  // sampler is another process and may land a sample at any moment, and an entry stamped a few ms
  // after a `now` taken first reads as "from the future" (within() rejects it, as it must for a
  // stepped-back clock) — the reading would vanish for exactly one render (seen live, 2026-10-05).
  const cached: GpuCache = readJson(GPU_CACHE, GpuCacheSchema) ?? {};
  const now = Temporal.Now.instant().epochMilliseconds;
  // Fresh = an entry that says something (a reading, or why there is none) and is inside the TTL.
  // The pre-2026-10-03 `{reading: null}` says neither, so it counts as expired.
  const fresh =
    cached.at !== undefined &&
    within(cached.at, now, GPU_SAMPLE_TTL_MS) &&
    (cached.reading != null || cached.why !== undefined);
  if (fresh && cached.reading) return ok(cached.reading);
  // Expired: refresh in the background and answer from what is cached NOW. A cached miss inside
  // the TTL is served as-is, without starting another sampler (one attempt per TTL, not per render).
  const started = fresh ? ok(undefined) : ensureSampler();
  const why = started.isErr() ? started.error : (cached.why ?? SAMPLING_WHY);
  // A last-good sample is still better than nothing, provided its age and the reason the newer
  // one is missing are printed beside it (memSegment marks it from STALE_SHOW_S on); otherwise
  // the reading is plainly n/a.
  const good = cached.good;
  if (good !== undefined && within(good.at, now, GPU_STALE_MAX_MS)) {
    const secs = Math.round((now - good.at) / 1000);
    return ok({ ...good.reading, stale: { secs, why } });
  }
  return err(why);
}
// `nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits`: the first GPU's
// line, "<used MiB>, <total MiB>". Whole numbers only — an empty field must not read as 0.
const MiB = z.string().trim().regex(/^\d+$/).transform(Number);
const NvidiaSmiSchema = z
  .string()
  .transform((out) => (out.split("\n")[0] ?? "").split(","))
  .pipe(z.tuple([MiB, MiB]));
// Runs in the sampler, under GPU_SAMPLE_TIMEOUT_MS — never inside a render.
function sampleVram(): Result<MemReading, ExecFailure> {
  return execWithin(
    "nvidia-smi",
    "nvidia-smi",
    ["--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
    GPU_SAMPLE_TIMEOUT_MS,
  ).andThen((out) => {
    const unparsable: ExecFailure = {
      why: "nvidia-smi output unparsable",
      stderr: "",
      ran: true,
    };
    const parsed = NvidiaSmiSchema.safeParse(out);
    if (!parsed.success) return err(unparsable);
    const [used, total] = parsed.data;
    const reading = memReading(used / 1024, total / 1024);
    return reading ? ok(reading) : err(unparsable);
  });
}

// Host RAM, Linux only (reads /proc/meminfo — instant, no subprocess). MemAvailable (not
// MemFree) is what "used" is measured against: it already accounts for reclaimable page cache,
// which MemFree does not, so MemFree would read as chronically "almost full" on a healthy box.
// macOS host RAM: `vm_stat` (a few ms, no privileges) for the page counts, os.totalmem() for the
// size. "Used" is Activity Monitor's Memory Used — app memory (anonymous minus purgeable pages) +
// wired + compressed — NOT total minus "Pages free": macOS keeps free pages near zero by caching
// files, so that would read as chronically full, the same trap MemFree is on Linux. Not `top -l 1`:
// its PhysMem "used" counts that file cache too, and it costs a full process-table pass.
const VmStatPage = z.string().regex(/^\d+$/).transform(Number);
function macRam(): Result<MemReading, string> {
  return execBounded("vm_stat", "vm_stat", [], ENRICHMENT_TIMEOUT_MS)
    .mapErr((f) => f.why)
    .andThen((raw) => {
      const size = raw.match(/page size of (\d+) bytes/)?.[1];
      const pages = (label: string): number | undefined => {
        const line = raw.split("\n").find((l) => l.startsWith(`${label}:`));
        const v = VmStatPage.safeParse(
          line?.split(/\s+/).pop()?.replace(/\.$/, ""),
        );
        return v.success ? v.data : undefined;
      };
      const wired = pages("Pages wired down");
      const compressed = pages("Pages occupied by compressor");
      const anonymous = pages("Anonymous pages");
      const purgeable = pages("Pages purgeable");
      if (
        size === undefined ||
        wired === undefined ||
        compressed === undefined ||
        anonymous === undefined ||
        purgeable === undefined
      )
        return err("vm_stat output unparsable");
      const usedBytes =
        (wired + compressed + Math.max(0, anonymous - purgeable)) *
        Number(size);
      const GiB = 1024 ** 3;
      const reading = memReading(usedBytes / GiB, totalmem() / GiB);
      return reading ? ok(reading) : err("vm_stat output unparsable");
    });
}
// macOS has no /proc: see macRam().
function ramFrac(): Result<MemReading, string> {
  if (process.platform === "darwin") return macRam();
  return fromThrowable(
    () => readFileSync("/proc/meminfo", "utf8"),
    () => "no /proc/meminfo",
  )().andThen((raw) => {
    let totalKb: number | undefined;
    let availKb: number | undefined;
    for (const line of raw.split("\n")) {
      if (line.startsWith("MemTotal:")) totalKb = Number(line.split(/\s+/)[1]);
      else if (line.startsWith("MemAvailable:"))
        availKb = Number(line.split(/\s+/)[1]);
      if (totalKb != null && availKb != null) break;
    }
    if (totalKb == null || availKb == null)
      return err("meminfo lacks MemTotal/MemAvailable");
    const usedKb = totalKb - availKb;
    const reading = memReading(usedKb / 1024 / 1024, totalKb / 1024 / 1024);
    return reading ? ok(reading) : err("meminfo unparsable");
  });
}

// One /proc/stat snapshot alone cannot give a CPU percentage — its counters are cumulative
// jiffies since boot, so a percentage needs the DELTA between two snapshots. Each statusline
// render is a fresh process (see this file's header note), so that second snapshot has to be
// the previous render's, kept on disk — same shape as AGENT_NAME_CACHE / RC_PROBE_CACHE above.
const CPU_CACHE = `${HOME}/.cache/claude/statusline-cpu.json`;
const CpuSampleSchema = z.object({
  total: z.number(),
  idle: z.number(),
  at: z.number().optional(), // epoch ms the sample was taken; only the cached baseline carries it
});
type CpuSample = z.output<typeof CpuSampleSchema>;
const CPU_BASELINE_MIN_MS = 2_000;
const CPU_BASELINE_MAX_MS = 60_000;
// Aggregate "cpu  ..." line (not a per-core "cpu0 ..." line): user+nice+system+idle+iowait+
// irq+softirq+steal[+guest+guest_nice]. idle time is idle+iowait; total is the sum of every
// field. On macOS (no /proc) the same cumulative counters come from os.cpus() — libuv's
// host_processor_info, per-core ms since boot — summed over cores: no subprocess, and the same
// two-sample delta. Not `top -l 2`: its first sample is the since-boot average, so a real
// percentage costs a second sample ~1 s later (measured 1.9 s), most of ENRICHMENT_TIMEOUT_MS.
// The units differ (jiffies vs ms) but a host only ever diffs against its own kind.
function macCpuSample(): Result<CpuSample, string> {
  const cores = cpus();
  if (cores.length === 0) return err("os.cpus() returned no cores");
  let total = 0;
  let idle = 0;
  for (const { times } of cores) {
    total += times.user + times.nice + times.sys + times.idle + times.irq;
    idle += times.idle;
  }
  return total > 0 ? ok({ total, idle }) : err("os.cpus() counters are zero");
}
function readCpuSample(): Result<CpuSample, string> {
  if (process.platform === "darwin") return macCpuSample();
  return fromThrowable(
    () => readFileSync("/proc/stat", "utf8"),
    () => "no /proc/stat",
  )().andThen((raw) => {
    const line = raw.split("\n").find((l) => l.startsWith("cpu "));
    if (!line) return err("/proc/stat has no cpu line");
    const fields = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    return Number.isFinite(idle) && total > 0
      ? ok({ total, idle })
      : err("/proc/stat cpu line unparsable");
  });
}
function cpuPct(): Result<number, string> {
  const sampled = readCpuSample();
  if (sampled.isErr()) return err(sampled.error); // no /proc (mac) / malformed line
  const sample = sampled.value;
  const now = Temporal.Now.instant().epochMilliseconds;
  const prev = readJson(CPU_CACHE, CpuSampleSchema); // undefined: no usable baseline file
  // Best-effort write of THIS render's sample for the NEXT render to diff against, unconditional
  // on whether this render itself can show a value — same "write regardless, return what we
  // have" shape as agentName()'s cache-miss path above. EXCEPT a baseline younger than
  // CPU_BASELINE_MIN_MS is kept: the file is shared by every session, so overwriting it each
  // render shrank the window to the gap since ANOTHER session's render (a few ms -> a coarse 0%
  // or 100%).
  const keep =
    prev?.at !== undefined && within(prev.at, now, CPU_BASELINE_MIN_MS);
  if (!keep) {
    writeCache(CPU_CACHE, { ...sample, at: now });
  }
  if (prev === undefined) return err("no earlier sample to diff against"); // first render on this host
  // A baseline with no timestamp (pre-2026-10-03 file), from the future (clock stepped back) or
  // older than CPU_BASELINE_MAX_MS would be an average over some other period than "now".
  if (prev.at === undefined || !within(prev.at, now, CPU_BASELINE_MAX_MS))
    return err("no earlier sample from the last 60s");
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  // dTotal<=0 means no jiffies elapsed between two renders (or a counter reset) -> a division
  // here would be by ~0 or negative, not a real rate; say so rather than show a bogus number.
  if (dTotal <= 0) return err("no ticks since the last sample");
  return ok(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)));
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
  const nameResult =
    sid != null
      ? agentName(sid, data.session_name || undefined)
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

  // No `?? 0`: a payload that carries no token count is "unknown", not "zero tokens".
  const ctxTok =
    data.context_window?.total_input_tokens ??
    data.context_window?.current_usage?.input_tokens;
  const tokenLabel = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
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
        ?.replace(/^fatal: /, "")
        .slice(0, 60)
    : undefined;
  const branchWhy =
    branchResult.isErr() && !notRepo
      ? gitReason || branchResult.error.why
      : undefined;

  const scan = scanOutOfHarness();
  const { jobs, orphans } = scan;
  // Sys-row readings — always computed now, not gated on a job being admitted (see vramFrac()'s
  // own header note for why paying nvidia-smi every render is fine).
  const cpu = cpuPct();
  const ram = ramFrac();
  const vram = vramGated();
  const disks = diskReadings();

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
  const { pct, col } = pctFmt(rl5);
  let seg = `5h ${ESC}[${col}m${pct}%${RST}`;
  if (rl5Reset != null) seg += ` ${DIM}${reset5(rl5Reset)}${RST}`;
  return seg;
}
// Rate row, 7d window: same shape as rl5Segment.
function rl7Segment(rl7: number, rl7Reset: number | undefined): string {
  const { pct, col } = pctFmt(rl7);
  let seg = `7d ${ESC}[${col}m${pct}%${RST}`;
  if (rl7Reset != null) seg += ` ${DIM}${reset7(rl7Reset)}${RST}`;
  return seg;
}
// Rate row, per-model weekly cap (e.g. "Fable 100% ⟳reset") — same reset7 shape as the 7d
// segment, since this window is also day-scale.
function rlModelSegment(m: ModelLimit): string {
  const { pct, col } = pctFmt(m.pct);
  let seg = `${m.name} ${ESC}[${col}m${pct}%${RST}`;
  if (m.resetEpoch != null) seg += ` ${DIM}${reset7(m.resetEpoch)}${RST}`;
  return seg;
}
// Ctx segment: "Ctx: <tokens> NN%". One builder for the bar's agent row and the snapshot.
function ctxSegment(df: Pick<Dataframe, "ctx" | "ctxPct">): string {
  const label = `${ESC}[38;5;66mCtx:${RST}`;
  const na = `${NA_COLOR}n/a${RST}`;
  // Neither figure in the payload (before the first API response): one n/a, not two.
  if (df.ctx === undefined && df.ctxPct == null) return `${label} ${na}`;
  let seg = `${label} ${df.ctx ?? na}`;
  // No MID here on purpose — see render()'s header note: this is one fact (context usage)
  // shown two ways, not two sibling facts, so a bare space separates them, not the middot.
  if (df.ctxPct != null) {
    const { pct, col } = pctFmt(df.ctxPct);
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
  if (df.rl5 == null && df.rl7 == null && df.rlModel.length === 0)
    return `${label} ${NA_COLOR}n/a${RST} ${DIM}(no rate_limits in the payload)${RST}`;
  const parts: string[] = [];
  parts.push(
    df.rl5 != null
      ? rl5Segment(df.rl5, df.rl5Reset)
      : `5h ${NA_COLOR}n/a${RST}`,
  );
  parts.push(
    df.rl7 != null
      ? rl7Segment(df.rl7, df.rl7Reset)
      : `7d ${NA_COLOR}n/a${RST}`,
  );
  for (const m of df.rlModel) parts.push(rlModelSegment(m));
  if (df.modelCapsWhy) parts.push(naSegment("model caps", df.modelCapsWhy));
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
// Sys row: "CPU NN% · RAM NN% (X.X/Y.YG) · VRAM NN% (X.X/Y.YG) · Disk …" — each reading a value
// or `n/a (<why>)` — host resource usage, always its own row like Job (never folded into Rate, which is API budget, not host load). All three
// percentages share the same green/yellow/red pctFmt threshold as every other percentage in
// this file; the fraction rides alongside each, dimmed, as supporting detail — same
// percent-then-dim-detail shape rl5Segment/rl7Segment already use for their reset countdowns.
function memSegment(label: string, m: MemReading): string {
  const { pct, col } = pctFmt(m.pct);
  let seg = `${label} ${ESC}[${col}m${pct}%${RST} ${DIM}(${m.frac})${RST}`;
  // A number old enough to mislead is never shown as a current one: amber `stale`, its age, and why.
  // Under STALE_SHOW_S it is not marked (owner ruling 2026-10-05): with the bar refreshing every 5 s
  // and one session sampling for all, a reading tens of seconds old is the normal case, and the
  // marker there was noise that buried the cases that matter.
  if (m.stale && m.stale.secs >= STALE_SHOW_S)
    seg += ` ${NA_COLOR}stale ${m.stale.secs}s${RST} ${DIM}(${m.stale.why})${RST}`;
  return seg;
}
// Disks: WHICH filesystems and at what free space they turn yellow/red are not decided here —
// they are read from agents/hooks/storage-headroom.toml ([drive.*]: path, deny_gib, warn_gib),
// the same file the storage gate enforces, so the bar and the gate can never disagree about a
// threshold. statfs is a syscall (no subprocess), cheap enough for every render. A drive whose
// path does not exist here (/mnt/c on macOS) is skipped, as the gate skips it.
const STORAGE_CONFIG = join(
  import.meta.dir,
  "..",
  "hooks",
  "storage-headroom.toml",
);
interface DiskReading {
  kind: "reading"; // discriminant: DiskEntry is told apart by this tag, not by probing for a key
  label: string; // "Disk C:", "Disk WSL", or "Disk <path>" — see diskLabel
  usedG: number;
  totalG: number;
  freeG: number;
  col: string; // green / yellow (below warn_gib) / red (below deny_gib)
}
// "Disk C:" (a Windows drive under WSL, /mnt/<letter>), "Disk WSL" (the WSL guest root), or
// "Disk <path>" elsewhere — a bare "C:" or "/" beside CPU/RAM/VRAM did not say what it was.
const IS_WSL = fromThrowable(() =>
  /microsoft/i.test(readFileSync("/proc/version", "utf8")),
)().unwrapOr(false);
function diskLabel(path: string): string {
  const m = path.match(/^\/mnt\/([a-z])$/); // String.match: this file imports child_process (BG floor F4)
  if (m?.[1]) return `Disk ${m[1].toUpperCase()}:`;
  if (path === "/" && IS_WSL) return "Disk WSL";
  return `Disk ${path}`;
}
// A drive that statfs could not read, shown as `<label> n/a (<why>)`.
interface DiskMiss {
  kind: "miss";
  label: string;
  why: string;
}
type DiskEntry = DiskReading | DiskMiss;
// err = the drive list itself could not be read, so WHICH disks to show is unknown.
// Only the keys this file reads; the gate's own keys (label, stop_gib, ...) are not its business.
const StorageConfigSchema = z.object({
  drive: z
    .record(
      z.string(),
      z.object({
        path: z.string().optional(),
        deny_gib: z.number().optional(),
        warn_gib: z.number().optional(),
      }),
    )
    .optional(),
});
function diskReadings(): Result<DiskEntry[], string> {
  const raw = fromThrowable(
    (): unknown => Bun.TOML.parse(readFileSync(STORAGE_CONFIG, "utf8")),
    () => "storage-headroom.toml unreadable",
  )();
  if (raw.isErr()) return err(raw.error);
  const parsed = StorageConfigSchema.safeParse(raw.value);
  if (!parsed.success)
    return err("storage-headroom.toml has an unexpected shape");
  const drives = Object.values(parsed.data.drive ?? {});
  // The config says WHICH disks to show: an empty list is the config failing to say, not "no disks".
  if (drives.length === 0) return err("no [drive.*] in storage-headroom.toml");
  const out: DiskEntry[] = [];
  for (const d of drives) {
    if (d.path === undefined) {
      out.push({
        kind: "miss",
        label: "Disk",
        why: "drive entry has no path",
      });
      continue;
    }
    const path = d.path;
    const st = fromThrowable(
      () => statfsSync(path),
      (e): string => execError(e).code ?? "statfs failed",
    )();
    // ENOENT off WSL: this OS has no such drive (/mnt/c on macOS) — nothing to show. Under WSL
    // /mnt/c is the host drive the storage gate exists to protect, so a missing mount is a drive
    // that could not be read, like any other failure: shown as n/a.
    if (st.isErr() && st.error === "ENOENT" && !IS_WSL) continue;
    if (st.isErr()) {
      out.push({ kind: "miss", label: diskLabel(path), why: st.error });
      continue;
    }
    const { bsize, blocks, bfree, bavail } = st.value;
    const usedG = ((blocks - bfree) * bsize) / 1024 ** 3;
    const freeG = (bavail * bsize) / 1024 ** 3;
    const totalG = usedG + freeG; // df's Use% denominator (reserved blocks excluded)
    let col = "38;5;71";
    if (d.warn_gib !== undefined && freeG < d.warn_gib) col = "38;5;178";
    if (d.deny_gib !== undefined && freeG < d.deny_gib) col = "38;5;167";
    out.push({
      kind: "reading",
      label: diskLabel(path),
      usedG,
      totalG,
      freeG,
      col,
    });
  }
  return ok(out);
}
function diskSegment(d: DiskEntry): string {
  if (d.kind === "miss") return naSegment(d.label, d.why);
  const pct = Math.round((d.usedG / d.totalG) * 100);
  return `${d.label} ${ESC}[${d.col}m${pct}%${RST} ${DIM}(${Math.round(d.usedG)}/${Math.round(d.totalG)}G)${RST}`;
}
// Every reading is a Result: ok renders the value, err renders `<label> n/a (<why>)` — see the
// EXPLICIT-ABSENCE law at the top. The row therefore always carries CPU, RAM and VRAM.
function sysSegment(
  cpu: Result<number, string>,
  ram: Result<MemReading, string>,
  vram: Result<MemReading, string> | undefined,
  disks: Result<DiskEntry[], string>,
): string {
  const parts: string[] = [
    cpu.match(
      (v) => {
        const { pct, col } = pctFmt(v);
        return `CPU ${ESC}[${col}m${pct}%${RST}`;
      },
      (why) => naSegment("CPU", why),
    ),
    ram.match(
      (m) => memSegment("RAM", m),
      (why) => naSegment("RAM", why),
    ),
    ...(vram === undefined
      ? []
      : [
          vram.match(
            (m) => memSegment("VRAM", m),
            (why) => naSegment("VRAM", why),
          ),
        ]),
    ...disks.match(
      (ds) => ds.map(diskSegment),
      (why) => [naSegment("Disk", why)],
    ),
  ];
  return parts.join(` ${DIM}${MID}${RST} `);
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
    `${ESC}[36m${p.stamp}${RST}|${ESC}[32m${p.cwd}${RST}`
  );
}
function render(df: Dataframe): string {
  const join = (t: string, seg: string) => (t ? t + SEP : "") + seg;

  const line1 = coloredHead(promptParts(df.cwd));

  let identityLine = "";
  if (df.email != null)
    identityLine = join(identityLine, `${ESC}[38;5;103m${df.email}${RST}`);
  else if (df.accountWhy)
    identityLine = join(identityLine, naSegment("account", df.accountWhy));
  if (df.sid != null)
    identityLine = join(
      identityLine,
      `${ESC}[38;5;103mSession:${RST} ${DIM}${df.sid}${RST}`,
    );

  let agentLine = "";
  if (df.sessionName != null)
    agentLine = join(agentLine, `${ESC}[38;5;214m${df.sessionName}${RST}`);
  else if (df.sessionNameWhy)
    agentLine = join(agentLine, naSegment("name", df.sessionNameWhy));
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

  agentLine = join(agentLine, ctxSegment(df));

  const rateLine = rateRow(df);

  let repoLine = "";
  if (df.branch)
    repoLine = join(repoLine, `${ESC}[38;5;96m${BR} ${df.branch}${RST}`);
  else if (df.branchWhy)
    repoLine = join(repoLine, `${BR} ${naSegment("branch", df.branchWhy)}`);
  repoLine = join(
    repoLine,
    df.add === undefined || df.del === undefined
      ? naSegment("diff", "payload has no cost block")
      : `${ESC}[38;5;178m(+${df.add},-${df.del})${RST}`,
  );
  if (df.wt) repoLine = join(repoLine, `${ESC}[38;5;140mwt: ${df.wt}${RST}`);

  // Always present: every reading in it is either a value or an explicit n/a.
  const sysLine = `${ESC}[38;5;74mSys:${RST} ${sysSegment(df.cpuPct, df.ram, df.vram, df.disks)}`;

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

  return [
    join(line1, repoLine),
    identityLine,
    agentLine,
    rateLine,
    sysLine,
    jobLine,
  ]
    .flatMap((r) => (r ? [r] : [])) // drops undefined and "" without an `r is string` guard
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
// Sampler mode: take one GPU sample and exit. It never reads stdin and never renders.
if (process.env[SAMPLE_ENV] === "1") process.exit(runSampler());
const raw = await Bun.stdin.text();
// unknown -> StatusInput at the trust boundary: parsed with StatusInputSchema, never cast. A
// payload that is not JSON, or has a field of the wrong type, renders line 1 plus the first
// reason — the whole bar saying "the input is wrong" beats a bar built from half-trusted values.
const json = fromThrowable((): unknown => JSON.parse(raw))();
if (json.isErr()) {
  process.stdout.write(`${coloredHead(promptParts(process.env.PWD ?? ""))}\n`);
  process.stdout.write(`${DIM}Model: ? | invalid statusline JSON${RST}`);
  process.exit(0);
}
const payload = StatusInputSchema.safeParse(json.value);
if (!payload.success) {
  const issue = payload.error.issues[0];
  const where = (issue?.path ?? []).map(String).join(".") || "(root)";
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
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const sysColored = sysSegment(df.cpuPct, df.ram, df.vram, df.disks);
const sysPlain = sysColored.replace(ANSI, "");
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
const sid = (payload.data.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "_");
if (sid !== "") {
  const rows = [ctxSegment(df), rateRow(df)]; // neither is ever empty: a value or an explicit n/a
  writeCache(`${HOME}/.cache/claude/statusline-session/${sid}.json`, {
    at: Temporal.Now.instant().epochMilliseconds,
    rows: rows.map((ansi) => ({ line: ansi.replace(ANSI, ""), ansi })),
  });
}
