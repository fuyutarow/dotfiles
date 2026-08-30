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
  type Entry = { name?: string; at: number };
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
