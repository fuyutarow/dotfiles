#!/usr/bin/env bun
// SessionStart hook — renames this session's herdr tab to the name `claude agents --json`
// and `/list-agents` show for it (e.g. "firedancer-fe"), instead of herdr's default numeric
// tab label ("1", "2", ...). A CUSTOM hook living BESIDE herdr's own vendored integration
// (herdr-agent-state.sh), never inside it — that file is overwritten on every
// `herdr integration` update, per its own header comment.
//
// Shares its cache file (~/.cache/claude/statusline-agent-names.json) and TTLs with
// ../statusline-command.ts's `agentName()` — same format, same source of truth, so whichever
// of the two runs first warms the cache for the other. Duplicated rather than imported: the
// two scripts run from unrelated invocation paths (statusLine vs SessionStart) and neither
// wants a cross-directory dependency for ~20 lines of caching logic.
//
// Fires on startup/resume/compact (see settings.json's matcher for this hook). Renaming to
// the same value twice is a no-op in herdr, so repeat firings are harmless. Runs only inside
// a herdr pane (HERDR_ENV/HERDR_SOCKET_PATH/HERDR_TAB_ID all present); anything else exits
// silently — this is cosmetic, never worth failing a session start over.
//
// RETRIES: unlike the statusline, which gets a fresh chance every render, this hook fires
// once per session start and then goes quiet. Caught live 2026-08-28: restarting with
// `claude -c` raced `claude agents --json`'s own self-registration, so the single lookup
// missed and the tab was left unrenamed for the rest of the session. Retrying a few times
// within this one firing closes that race instead of relying on the next resume/compact.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
// Mirrors statusline-command.ts's agentName(): a HIT is trusted for 5 minutes, a MISS only
// for 30s, so a lookup that raced registration self-heals soon rather than sticking for 5 min.
const AGENT_NAME_POSITIVE_TTL_MS = 5 * 60_000;
const AGENT_NAME_NEGATIVE_TTL_MS = 30_000;
const LOOKUP_RETRIES = 3;
const LOOKUP_RETRY_DELAY_MS = 500;

// Prefer the env var Claude Code exports for its own binary — hooks may run with a narrow
// PATH (see hooks/lib.ts's findExe comment) — falling back to a bare PATH lookup.
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH || "claude";
const HERDR_BIN = process.env.HERDR_BIN_PATH || "herdr";

async function agentName(sid: string): Promise<string | undefined> {
  type Entry = { name?: string; at: number };
  let cache: Record<string, Entry> = {};
  try {
    cache = JSON.parse(readFileSync(AGENT_NAME_CACHE, "utf8"));
  } catch {
    // missing / corrupt cache file -> treat as empty and refetch below
  }
  const hit = cache[sid];
  if (hit != null) {
    const ttl =
      hit.name != null
        ? AGENT_NAME_POSITIVE_TTL_MS
        : AGENT_NAME_NEGATIVE_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.name;
  }

  for (let attempt = 1; attempt <= LOOKUP_RETRIES; attempt++) {
    try {
      const out = execFileSync(CLAUDE_BIN, ["agents", "--json"], {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
        timeout: 3000,
      });
      const list: Array<{ sessionId?: string; name?: string }> =
        JSON.parse(out);
      const now = Date.now();
      const next: Record<string, Entry> = {};
      for (const a of list)
        if (a.sessionId) next[a.sessionId] = { name: a.name, at: now };
      if (sid in next) {
        try {
          mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
          writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
        } catch {
          // cache write failed (e.g. read-only fs) -> value below still returned, just not persisted
        }
        return next[sid]?.name;
      }
      // Not in the list yet: retry rather than accept a possibly-racy miss, since this hook
      // gets no next render to fall back on.
      if (attempt < LOOKUP_RETRIES) {
        await Bun.sleep(LOOKUP_RETRY_DELAY_MS);
        continue;
      }
      next[sid] = { at: now }; // exhausted retries -> cache the miss, short TTL, done above
      try {
        mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
        writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
      } catch {
        // cache write failed -> nothing to persist, we're returning undefined anyway
      }
    } catch {
      if (attempt === LOOKUP_RETRIES) return undefined; // `claude` missing/slow/errored
      await Bun.sleep(LOOKUP_RETRY_DELAY_MS);
    }
  }
  return undefined;
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

  execFileSync(HERDR_BIN, ["tab", "rename", tabId, name], {
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 3000,
  });
} catch {
  // cosmetic hook -> never fail a session start over this
}
process.exit(0);
