#!/usr/bin/env bun
// SessionStart hook — renames this session's herdr tab to the name `claude agents --json`
// and `/list-agents` show for it (e.g. "firedancer-fe"), instead of herdr's default numeric
// tab label ("1", "2", ...). A CUSTOM hook living BESIDE herdr's own vendored integration
// (herdr-agent-state.sh), never inside it — that file is overwritten on every
// `herdr integration` update, per its own header comment.
//
// WRITES the shared cache file (~/.cache/claude/statusline-agent-names.json) that
// ../statusline-command.ts's `agentName()` reads, warming it in the same format — but never
// reads it itself; see the note on agentName() below for why that asymmetry is the fix, not
// an oversight.
//
// Fires on startup/resume/compact (see settings.json's matcher for this hook). Renaming to
// the same value twice is a no-op in herdr, so repeat firings are harmless. Runs only inside
// a herdr pane (HERDR_ENV/HERDR_SOCKET_PATH/HERDR_TAB_ID all present); anything else exits
// silently — this is cosmetic, never worth failing a session start over.
//
// SHORT TAB, FULL SIDEBAR. The desktop tab bar renders the tab's real name, so the actual
// `tab rename` below now sends only its trailing `-`-segment ("firedancer-dc" -> "dc") to keep
// that strip compact. The untruncated name still needs to reach the sidebar though, so it also
// goes out as a separate `$fullname` pane-metadata token (herdr/config.toml's
// `rows_by_agent.claude` reads that token instead of the "tab" token). Two channels, one each.
//
// RETRIES: unlike the statusline, which gets a fresh chance every render, this hook fires
// once per session start and then goes quiet. Caught live 2026-08-28: restarting with
// `claude -c` raced `claude agents --json`'s own self-registration, so the single lookup
// missed and the tab was left unrenamed for the rest of the session. Retrying a few times
// within this one firing closes that race instead of relying on the next resume/compact.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
const LOOKUP_RETRIES = 3;
const LOOKUP_RETRY_DELAY_MS = 500;

// Prefer the env var Claude Code exports for its own binary — hooks may run with a narrow
// PATH (see hooks/lib.ts's findExe comment) — falling back to a bare PATH lookup.
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH || "claude";
const HERDR_BIN = process.env.HERDR_BIN_PATH || "herdr";

type Entry = { name?: string; at: number };

// Outcome of one `attemptLookup` call: `done: true` means agentName should return `name`
// right away (found, or gave up after exhausting retries); `done: false` means try again.
// `name` sits on the `done: true` branch as a required (non-optional) field so returning an
// explicit `undefined` here never trips exactOptionalPropertyTypes the way an optional `name?`
// slot would.
type LookupOutcome = { done: true; name: string | undefined } | { done: false };

function buildEntryMap(
  list: Array<{ sessionId?: string; name?: string }>,
  now: number,
): Record<string, Entry> {
  const next: Record<string, Entry> = {};
  for (const a of list) {
    if (!a.sessionId) continue;
    // exactOptionalPropertyTypes: omit `name` entirely when absent rather than
    // assigning an explicit `undefined` into the optional slot (JSON.stringify would
    // drop it either way, so this changes nothing on disk). Key order matches the
    // pre-refactor literal (`{ name: a.name, at: now }`) so entries that carry a name
    // still serialize byte-identically to what this hook wrote before the refactor.
    next[a.sessionId] =
      a.name !== undefined ? { name: a.name, at: now } : { at: now };
  }
  return next;
}

function persistFoundCache(next: Record<string, Entry>): void {
  try {
    mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
    writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
  } catch {
    // cache write failed (e.g. read-only fs) -> value below still returned, just not persisted
  }
}

// One retry attempt of the `claude agents --json` lookup, pulled out of agentName's loop so
// that loop doesn't add a second layer of nesting on top of this function's own try/catch.
// Any sleep this attempt needs happens in here, before returning, so the delay lands at the
// exact point it did when this was still inline in the loop body.
async function attemptLookup(
  sid: string,
  attempt: number,
): Promise<LookupOutcome> {
  try {
    const out = execFileSync(CLAUDE_BIN, ["agents", "--json"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 3000,
    });
    const list: Array<{ sessionId?: string; name?: string }> = JSON.parse(out);
    const now = Date.now();
    const next = buildEntryMap(list, now);
    if (sid in next) {
      persistFoundCache(next);
      return { done: true, name: next[sid]?.name };
    }
    // Not in the list yet: retry rather than accept a possibly-racy miss, since this hook
    // gets no next render to fall back on.
    if (attempt < LOOKUP_RETRIES) {
      await Bun.sleep(LOOKUP_RETRY_DELAY_MS);
      return { done: false };
    }
    next[sid] = { at: now }; // exhausted retries -> cache the miss, short TTL, done above
    try {
      mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
      writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
    } catch {
      // cache write failed -> nothing to persist, we're returning undefined anyway
    }
    return { done: false };
  } catch {
    if (attempt === LOOKUP_RETRIES) {
      return { done: true, name: undefined }; // `claude` missing/slow/errored
    }
    await Bun.sleep(LOOKUP_RETRY_DELAY_MS);
    return { done: false };
  }
}

// DELIBERATELY DOES NOT READ THE CACHE — only writes it. The cache is keyed by session id,
// but a session's NAME is not stable under that key: restarting with `claude -c` keeps the
// session id and mints a fresh suffix (firedancer-72 -> firedancer-dd, observed 2026-08-30).
// The statusline re-renders constantly, so a live session's cache entry is always inside its
// 5-minute positive TTL — meaning a cache-reading lookup here would return the PRE-restart
// name every single time, not occasionally. This hook then froze that stale name into the tab
// label until the next session start, while the statusline moved on at its next refetch: the
// sidebar and the status row disagreed, which is exactly the bug. This runs ONCE per session
// start, so paying the full ~0.5-0.75s `claude agents --json` for a correct answer is trivially
// the right trade; the cache exists to keep the STATUSLINE cheap, not this.
async function agentName(sid: string): Promise<string | undefined> {
  for (let attempt = 1; attempt <= LOOKUP_RETRIES; attempt++) {
    const result = await attemptLookup(sid, attempt);
    if (result.done) return result.name;
  }
  return undefined;
}

// Bonus, not required: statusline-command.ts re-reports $fullname on every render anyway
// (the same belt-and-suspenders reasoning as the tab rename above — see its own header
// note), so a failure here just means the sidebar's full name fills in a render later
// instead of immediately.
function reportPaneMetadata(paneId: string, name: string): void {
  try {
    execFileSync(
      HERDR_BIN,
      [
        "pane",
        "report-metadata",
        "--source",
        "dotfiles:herdr-tab-name",
        paneId,
        "--token",
        `fullname=${name}`,
      ],
      { stdio: ["ignore", "ignore", "ignore"], timeout: 3000 },
    );
  } catch {
    // metadata is a bonus for the sidebar label -> the tab rename above already landed
  }
}

try {
  if (process.env.HERDR_ENV !== "1") process.exit(0);
  const tabId = process.env.HERDR_TAB_ID;
  if (!tabId) process.exit(0);

  const payload = readStdinJson();
  const sid: string | undefined =
    typeof payload?.session_id === "string" && payload.session_id
      ? payload.session_id
      : undefined;
  if (!sid) process.exit(0);

  const name = await agentName(sid);
  if (!name) process.exit(0);

  const shortName = name.split("-").pop() || name;
  execFileSync(HERDR_BIN, ["tab", "rename", tabId, shortName], {
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 3000,
  });

  const paneId = process.env.HERDR_PANE_ID;
  if (paneId) reportPaneMetadata(paneId, name);
} catch {
  // cosmetic hook -> never fail a session start over this
}
process.exit(0);
