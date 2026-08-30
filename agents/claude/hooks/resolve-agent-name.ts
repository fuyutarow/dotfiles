#!/usr/bin/env bun
// CLI: bun resolve-agent-name.ts <session_id>  ->  prints the addressable name (e.g.
// "firedancer-fe") to stdout, or nothing on any failure. Exit code is always 0 — callers
// (agents/commands/mycopy.md) treat empty output as "name unavailable" and fall back.
//
// A THIRD copy of the same cache-and-fetch logic already in statusline-command.ts's
// agentName() and hooks/herdr-tab-name.ts's agentName() — deliberately not imported from
// either: both are already shipped/tested and this file has a different call shape (sync CLI
// arg, no retry loop — /mycopy is a manual one-shot invocation, so paying the plain
// ~0.5-0.75s `claude agents --json` cost on an outright cache miss is fine, no race to guard
// against the way SessionStart has). Shares the SAME cache file, so whichever of the three
// warms it first still helps the others.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HOME = process.env.HOME ?? "";
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
const AGENT_NAME_POSITIVE_TTL_MS = 5 * 60_000;
const AGENT_NAME_NEGATIVE_TTL_MS = 30_000;
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
  if (hit != null) {
    const ttl =
      hit.name != null
        ? AGENT_NAME_POSITIVE_TTL_MS
        : AGENT_NAME_NEGATIVE_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.name;
  }

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
    if (!(sid in next)) next[sid] = { at: now };
    try {
      mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
      writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
    } catch {
      // cache write failed (e.g. read-only fs) -> value below still returned, just not persisted
    }
    return next[sid]?.name;
  } catch {
    return undefined; // `claude` missing/slow/errored -> caller falls back
  }
}

const sid = process.argv[2];
if (sid) {
  const name = agentName(sid);
  if (name) process.stdout.write(name);
}
