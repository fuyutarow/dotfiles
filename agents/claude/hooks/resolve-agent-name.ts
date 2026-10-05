// AGENT_NAME_SESSION_ID=<session_id> bun resolve-agent-name.ts  ->  prints the addressable
// name (e.g. "firedancer-fe") to stdout, or nothing on any failure. Exit code is always 0 —
// the caller (hooks/quote-command.ts) treats empty output as "name unavailable" and falls back.
// The input rides the ENVIRONMENT, not argv: a hook is zero-dep (writing-bun-scripts BG3), and
// BG1 says a zero-dep tree that needs argv parsing must graduate first — zero-dep is never
// permission to hand-parse process.argv. An env var needs no parser.
//
// A THIRD copy of the same cache-and-fetch logic already in statusline-command.ts's
// agentName() and hooks/herdr-tab-name.ts's agentName() — deliberately not imported from
// either: both are already shipped/tested and this file has a different call shape (one sync
// input, no retry loop — /quote is a manual one-shot invocation, so paying the plain
// ~0.5-0.75s `claude agents --json` cost on an outright cache miss is fine, no race to guard
// against the way SessionStart has). Shares the SAME cache file, so whichever of the three
// warms it first still helps the others.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { attempt, attemptOr } from "../../hooks/attempt.ts";
import { arr, at, parseJson, strAt } from "../../hooks/narrow.ts";

const HOME = process.env.HOME ?? "";
const AGENT_NAME_CACHE = `${HOME}/.cache/claude/statusline-agent-names.json`;
// 30s for both a hit and a miss — was 5min on a hit until 2026-09-02, when a stale hit right
// after `/rename` (the exact moment someone is watching) turned out to matter more than the
// rare extra `claude agents --json` call it now costs. See statusline-command.ts's agentName()
// for the fuller writeup — same cache file, same fix, kept in sync deliberately.
const AGENT_NAME_TTL_MS = 30_000;
const CLAUDE_BIN = process.env.CLAUDE_CODE_EXECPATH ?? "claude";

type Entry = { name?: string; at: number };

type Agent = { sessionId?: string | undefined; name?: string | undefined };

// `claude agents --json` output as a list of agents, read field by field. Output that is not a
// Malformed output is an error value; the caller treats it like a failed lookup.
function agentsOf(
  parsed: unknown,
): { ok: true; value: Agent[] } | { ok: false; error: string } {
  const list = arr(parsed);
  if (list === undefined) {
    return { ok: false, error: "claude agents --json did not print a list" };
  }
  const agents: Agent[] = [];
  for (const a of list) {
    if (a === null || a === undefined) {
      return { ok: false, error: "claude agents --json listed a null agent" };
    }
    agents.push({ sessionId: strAt(a, "sessionId"), name: strAt(a, "name") });
  }
  return { ok: true, value: agents };
}

function buildEntries(
  list: Agent[],
  sid: string,
  now: number,
): Record<string, Entry> {
  const next: Record<string, Entry> = {};
  for (const a of list) {
    if (a.sessionId === undefined || a.sessionId === "") continue;
    // exactOptionalPropertyTypes: omit `name` entirely when absent rather than
    // assigning an explicit `undefined` into the optional slot (JSON.stringify would
    // drop it either way). name-then-at keeps the on-disk key order this file has
    // always written (herdr-tab-name.ts likewise), so a refactor leaves no byte-diff.
    next[a.sessionId] =
      a.name !== undefined ? { name: a.name, at: now } : { at: now };
  }
  if (!Object.hasOwn(next, sid)) next[sid] = { at: now };
  return next;
}

async function agentName(sid: string): Promise<string | undefined> {
  // missing / corrupt cache file -> treat as empty and refetch below
  const cache = await attemptOr(
    (): unknown => parseJson(readFileSync(AGENT_NAME_CACHE, "utf8")),
    {},
  );
  const hit = at(cache, sid);
  const hitAt = at(hit, "at");
  if (
    typeof hitAt === "number" &&
    Temporal.Now.instant().epochMilliseconds - hitAt < AGENT_NAME_TTL_MS
  )
    return strAt(hit, "name");

  const fetched = await attempt(() => {
    const out = execFileSync(CLAUDE_BIN, ["agents", "--json"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 3000,
    });
    const listed = agentsOf(parseJson(out));
    if (!listed.ok) return null;
    const now = Temporal.Now.instant().epochMilliseconds;
    return buildEntries(listed.value, sid, now);
  });
  if (!fetched.ok || fetched.value === null) return undefined; // `claude` missing/slow/errored -> caller falls back
  const next = fetched.value;
  // cache write failed (e.g. read-only fs) -> value below still returned, just not persisted
  await attemptOr(() => {
    mkdirSync(`${HOME}/.cache/claude`, { recursive: true });
    writeFileSync(AGENT_NAME_CACHE, JSON.stringify(next));
  }, undefined);
  return next[sid]?.name;
}

const sid = process.env.AGENT_NAME_SESSION_ID;
if (sid !== undefined && sid !== "") {
  const name = await agentName(sid);
  if (name !== undefined && name !== "") process.stdout.write(name);
}
