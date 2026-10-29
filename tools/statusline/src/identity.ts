import { closeSync, openSync, readSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, jsonText, maybe, z } from "./zod.ts";
import { writeFleetSession } from "@dotfiles/shared/src/fleet-session.ts";
import {
  execAsyncRenderBounded,
  execAsyncWithin,
  execBounded,
  readJson,
  readJsonAsync,
  writeCache,
  writeCacheAsync,
} from "./bounded.ts";

const HOME = process.env["HOME"] ?? "";
const fleetUnavailable = (why: string) => ({ na: true as const, why });
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
export async function readClaudeJsonAsync(): Promise<Result<unknown, string>> {
  const text = await Bun.file(`${HOME}/.claude.json`)
    .text()
    .catch(() => null);
  if (text === null) return err("~/.claude.json unreadable");
  const parsed = jsonText.safeParse(text);
  return parsed.success ? ok(parsed.data) : err("~/.claude.json unreadable");
}
const AccountSchema = z.object({
  oauthAccount: maybe(z.object({ emailAddress: maybe(z.string()) })),
});
export function account(cj: unknown): Result<string | undefined, string> {
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
// Is `ultracode: true` set in the CLI's OWN live settings file — not this repo's committed
// agents/claude/settings.json, which only seeds it. The CLI rewrites ~/.claude/settings.json
// itself on interactive /model or /effort changes (confirmed 2026-09-05: a live effort choice
// showed up here as modelSettings.<model>.effortLevel, not as this repo's flat `effortLevel`
// key), so this file — not the repo source — is the only place that reflects what is ACTUALLY
// configured right now. Cheap like account() just above: same file class, smaller payload.
const SettingsSchema = z.object({ ultracode: z.boolean().optional() });
export async function ultracodeConfiguredAsync(): Promise<boolean | undefined> {
  const settings = await readJsonAsync(
    `${HOME}/.claude/settings.json`,
    SettingsSchema,
  );
  return settings === undefined ? undefined : settings.ultracode === true;
}

// `name` — the actual field `claude agents --json` returns per session (confirmed live
// 2026-08-28), and what `/list-agents` addresses it by. NOT a label this file invented: it
// defaults to the auto-generated "example-repo-fe" form (docs call that default value the
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
export type RcState = "on" | "off" | "unknown";
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
  const exe = process.env["CLAUDE_CODE_EXECPATH"];
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

// Sync compatibility probe retained for non-render callers; the renderer uses rcStateAsync.
export function rcState(): RcState {
  if ((process.env["CLAUDE_CODE_BRIDGE_SESSION_ID"] ?? "") !== "") return "on";
  return rcProbeValid() === true ? "off" : "unknown";
}
async function binaryContainsAsync(
  path: string,
  needle: string,
  budgetMs: number,
): Promise<boolean | undefined> {
  const file = Bun.file(path);
  const pattern = Buffer.from(needle);
  const chunkSize = 8 << 20;
  const started = performance.now();
  let carry = Buffer.alloc(0);
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (performance.now() - started >= budgetMs) return undefined;
    const data = await file
      .slice(offset, offset + chunkSize)
      .arrayBuffer()
      .catch(() => new ArrayBuffer(0));
    const joined = Buffer.concat([carry, Buffer.from(data)]);
    if (joined.indexOf(pattern) !== -1) return true;
    carry = joined.subarray(Math.max(0, joined.length - pattern.length + 1));
  }
  return file.size === 0 ? undefined : false;
}
async function rcProbeValidAsync(): Promise<boolean | undefined> {
  const exe = process.env["CLAUDE_CODE_EXECPATH"];
  if (exe === undefined || exe === "") return undefined;
  const st = await stat(exe).catch(() => null);
  if (st === null) return undefined;
  const key = `${exe}\u0000${st.size}\u0000${st.mtimeMs}`;
  const cache = (await readJsonAsync(RC_PROBE_CACHE, RcProbeCacheSchema)) ?? {};
  const hit = cache[key];
  if (hit !== undefined) return hit;
  const valid = await binaryContainsAsync(exe, RC_NEEDLE, 350);
  if (valid === undefined) return undefined;
  await writeCacheAsync(RC_PROBE_CACHE, { ...cache, [key]: valid });
  return valid;
}
export async function rcStateAsync(): Promise<RcState> {
  if ((process.env["CLAUDE_CODE_BRIDGE_SESSION_ID"] ?? "") !== "") return "on";
  return (await rcProbeValidAsync()) === true ? "off" : "unknown";
}

/** Plain text for herdr's $rc token — same three states, no ANSI (herdr styles its own rows). */
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
const AGENT_NAME_TTL_MS = 30_000;
const AGENT_LIST_TIMEOUT_MS = 3000; // `claude agents --json`, slower than the 2000ms enrichment bound
// statusLine commands can run with a narrower PATH than an interactive shell; prefer the env
// var Claude Code exports for its own binary over a bare PATH lookup.
const CLAUDE_BIN =
  process.env["CLAUDE_CODE_EXECPATH"] !== undefined &&
  process.env["CLAUDE_CODE_EXECPATH"] !== ""
    ? process.env["CLAUDE_CODE_EXECPATH"]
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
/** One sampler call resolves all live names, avoiding a process per session. */
export async function readAgentNamesAsync() {
  const result = await execAsyncWithin(
    "claude agents",
    CLAUDE_BIN,
    ["agents", "--json"],
    AGENT_LIST_TIMEOUT_MS,
  );
  if (result.isErr()) return err(result.error.why);
  const parsed = jsonOf(AgentListSchema).safeParse(result.value);
  return parsed.success
    ? ok(parsed.data)
    : err("claude agents output unparsable");
}
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
export function agentName(
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
    850,
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
export async function agentNameAsync(
  sid: string,
  hint?: string,
): Promise<Result<string | undefined, string>> {
  const cache =
    (await readJsonAsync(AGENT_NAME_CACHE, AgentNameCacheSchema)) ?? {};
  const hit = cache[sid];
  const renamed =
    hit?.hint !== undefined && hint !== undefined && hit.hint !== hint;
  if (
    hit !== null &&
    hit !== undefined &&
    !renamed &&
    Temporal.Now.instant().epochMilliseconds - hit.at < AGENT_NAME_TTL_MS
  )
    return ok(hit.name);
  const outResult = await execAsyncRenderBounded(
    "claude agents",
    CLAUDE_BIN,
    ["agents", "--json"],
    AGENT_LIST_TIMEOUT_MS,
  );
  if (outResult.isErr()) return err(outResult.error.why);
  const listResult = jsonOf(AgentListSchema).safeParse(outResult.value);
  if (!listResult.success) return err("claude agents output unparsable");
  const now = Temporal.Now.instant().epochMilliseconds;
  const next = agentNameEntries(listResult.data, now);
  if (!Object.hasOwn(next, sid)) next[sid] = { at: now };
  for (const [id, entry] of Object.entries(next)) {
    const seen = id === sid ? hint : cache[id]?.hint;
    if (seen !== undefined) entry.hint = seen;
  }
  await writeCacheAsync(AGENT_NAME_CACHE, next);
  return ok(next[sid]?.name);
}

// The statusline is the sole writer of the shared fleet handoff. herdr-projector consumes these
// atomic session files and owns the tab and pane metadata surfaces.
export async function reportToHerdr(
  m: string,
  sessionName?: string,
  effortDisplay?: string, // plain-text "xhigh" / "xhigh+WF"
  _rc: RcState = rcState(),
  vendor: "claude" | "codex" = "claude",
  codexSessionId?: string,
  codexCwd?: string,
): Promise<void> {
  const paneId = process.env["HERDR_PANE_ID"];
  const id =
    vendor === "codex" ? codexSessionId : process.env["CLAUDE_CODE_SESSION_ID"];
  if (
    process.env["HERDR_ENV"] !== "1" ||
    paneId === undefined ||
    paneId === "" ||
    id === undefined ||
    id === ""
  )
    return;
  await writeFleetSession({
    schema: 1,
    session_id: id,
    vendor,
    name:
      sessionName !== undefined && sessionName !== ""
        ? sessionName
        : fleetUnavailable("agent name unavailable"),
    model: m !== "" ? m : fleetUnavailable("model unavailable"),
    effort:
      effortDisplay !== undefined && effortDisplay !== ""
        ? effortDisplay
        : fleetUnavailable("effort unavailable"),
    ctx: fleetUnavailable("context unavailable to identity writer"),
    rate: fleetUnavailable("rate limits unavailable to identity writer"),
    cwd: vendor === "codex" ? (codexCwd ?? process.cwd()) : process.cwd(),
    pane_id: paneId ?? null,
    updated_at: Temporal.Now.instant().toString(),
  });
}

/** Clear vendor identity on a pane before its new session has reportable metadata. */
export async function clearHerdrMetadata(): Promise<void> {}
