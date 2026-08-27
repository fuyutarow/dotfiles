#!/usr/bin/env bun
// SessionStart hook — renames this session's herdr tab to the name `claude agents --json`
// and `/list-agents` show for it (e.g. "firedancer-fe"), instead of herdr's default numeric
// tab label ("1", "2", ...). A CUSTOM hook living BESIDE herdr's own vendored integration
// (herdr-agent-state.sh), never inside it — that file is overwritten on every
// `herdr integration` update, per its own header comment.
//
// Shares its cache file (~/.cache/claude/statusline-agent-names.json) and TTL with
// ../statusline-command.ts's `agentName()` — same format, same source of truth, so whichever
// of the two runs first warms the cache for the other. Duplicated rather than imported: the
// two scripts run from unrelated invocation paths (statusLine vs SessionStart) and neither
// wants a cross-directory dependency for ~20 lines of caching logic.
//
// Fires on startup/resume/compact (see settings.json's matcher for this hook). Renaming to
// the same value twice is a no-op in herdr, so repeat firings are harmless. Runs only inside
// a herdr pane (HERDR_ENV/HERDR_SOCKET_PATH/HERDR_TAB_ID all present); anything else exits
// silently — this is cosmetic, never worth failing a session start over.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
const AGENT_NAME_TTL_MS = 5 * 60_000; // mirrors statusline-command.ts's agentName()

// Prefer the env var Claude Code exports for its own binary — hooks may run with a narrow
// PATH (see hooks/lib.ts's findExe comment) — falling back to a bare PATH lookup.
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH || "claude";
const HERDR_BIN = process.env.HERDR_BIN_PATH || "herdr";

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
    return undefined; // `claude` missing/slow/errored -> skip renaming this run
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

  const name = agentName(sid);
  if (!name) process.exit(0);

  execFileSync(HERDR_BIN, ["tab", "rename", tabId, name], {
    stdio: ["ignore", "ignore", "ignore"],
    timeout: 3000,
  });
} catch {
  // cosmetic hook -> never fail a session start over this
}
process.exit(0);
