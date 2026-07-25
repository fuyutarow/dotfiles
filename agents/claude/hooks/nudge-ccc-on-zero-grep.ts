#!/usr/bin/env bun
// PostToolUse hook (matcher: Grep|Bash) — nudge toward ccc semantic search on a zero-hit search.
//
// WHY Bash is covered too (measured 2026-07-25, firedancer audit transcript): an agent doing an
// evidence-location audit ran EVERY search through Bash — `grep -n ... file`, `find -iname`, `ls`.
// It reached "not in the ledger" twice (once empty output, once ugrep's "No matches found") and
// this hook never fired, because the matcher was `Grep` alone. Covering only the Grep TOOL leaves
// the actual pathway wide open: `Bash(grep ...)` bypasses the whole gate.
//
// TWO triggers, because zero-hit alone misses the dangerous half (measured 2026-07-25):
//
//   T1 ZERO-HIT   — the search returned nothing. Classic "0 hits → 不在" pathway.
//   T2 SEARCH-RUN — N searches have run in this ccc project this session with ZERO `ccc`
//                   invocations. This is the case a zero-hit trigger CANNOT see: grep FOUND
//                   something, the executor was satisfied and stopped, and the thing it was
//                   really looking for sits under a different name. Session census, measured
//                   in this repo: 215 Bash calls, 85 carrying a search verb, 3 running ccc.
//                   Nothing in that spread was ever surfaced, because none of it was 0-hit.
//
// Both require the search to run inside a ccc-registered project — walk up from the search
// path looking for `.cocoindex_code/settings.yml`, stopping at $HOME or the fs root.
//
// Re-firing: T1 fires once per (session, project). T2 fires every SEARCH_STRIDE searches
// while the ccc count is still zero, so a long session that never reaches for semantic
// search keeps being told — that is the "徹底的に" the operator asked for. A `ccc` call
// resets nothing and silences T2 permanently for that (session, project): the point is to
// get semantic search USED, not to nag someone already using it.
//
// Detection is grounded against the installed Claude Code CLI's actual Grep tool
// implementation (PostToolUse `tool_response` is the tool's raw `{data}` payload, not
// the rendered tool_result text), not guessed from the public hooks doc alone:
//   - mode "files_with_matches" (default): {mode,filenames,numFiles,totalFiles,...} —
//     zero-hit <=> numFiles===0.
//   - mode "count": {mode,filenames,content,numMatches,...} — zero-hit <=> numMatches===0.
//   - mode "content": {mode,numFiles:0,filenames:[],content,numLines,...} — numFiles is
//     HARDCODED to 0 in this mode regardless of hit count, so it is NOT a valid zero-hit
//     signal here; the real signal is an empty content string (numLines===0).
// A stringified "No matches found" substring check is kept as a defensive catch-all on
// top of the structured checks, per spec — never the sole basis for a mode it would
// misfire on.
//
// Safety:
//   0. FAIL OPEN   — any error, or any uncertainty in detection -> exit 0, no output.
//   1. NEVER BLOCK — only ever emits additionalContext JSON and exits 0.
//   2. ONCE ONLY   — per (session_id, project) sentinel; never re-fires for the pair.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readStdinJson } from "./lib.ts";

const MESSAGE_PREFIX =
  "0 hits ≠ 不在. This project is ccc-indexed — before concluding absence, locating evidence for an audit, or implementing something new, run the semantic battery (driving-cocoindex): cd ";
const MESSAGE_SUFFIX =
  " && ccc search '<paraphrase>' --limit 8 --refresh, with ≥3 paraphrases (JA/EN). Literal grep stays correct for literal tokens (CC3).";

// Zero-hit detection over the Grep tool's raw response payload. Mode-aware on purpose
// (see header) — falls through to `false` (= not confidently zero, fail open) whenever
// the shape doesn't match anything recognized.
function isZeroHitGrep(resp: any): boolean {
  if (resp == null) return false;

  // Defensive catch-all: some future/alternate shape may carry the literal message.
  try {
    const asText = typeof resp === "string" ? resp : JSON.stringify(resp);
    if (/no matches found/i.test(asText)) return true;
  } catch {
    /* fall through to structured checks */
  }

  if (typeof resp !== "object") return false;

  const mode = resp.mode ?? "files_with_matches";

  if (mode === "content") {
    if (typeof resp.content === "string") return resp.content === "";
    if (typeof resp.numLines === "number") return resp.numLines === 0;
    return false;
  }

  if (mode === "count") {
    if (typeof resp.numMatches === "number") return resp.numMatches === 0;
    if (typeof resp.matches === "number") return resp.matches === 0;
    if (typeof resp.numFiles === "number") return resp.numFiles === 0;
    return false;
  }

  // files_with_matches (default / unrecognized mode falls back here too)
  if (typeof resp.numFiles === "number") return resp.numFiles === 0;
  if (Array.isArray(resp.filenames)) return resp.filenames.length === 0;
  return false;
}

// --- Bash-borne searches -------------------------------------------------------------
// A search verb in COMMAND position. Anchored to start-of-string or a shell separator so
// `--include=*.grep` or `foogrep` can't trip it.
const SEARCH_VERB =
  /(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*(sudo\s+|command\s+|time\s+)*(grep|egrep|fgrep|rg|ripgrep|ag|ack|ugrep)\b/;
// `find` only counts as a search when it filters by name/path — a bare `find dir` is a listing.
const FIND_SEARCH =
  /(^|[|;&(]|&&|\|\|)\s*(sudo\s+)*find\b[^|;&]*\s-(i?name|i?path|i?regex)\b/;

// ugrep (the house `grep` alias) prints this INSTEAD of staying silent on a zero hit.
// Matched per-line and anchored, never as a free substring: output that merely CONTAINS
// the phrase (a hit on that literal text, a log line, a test name) is a hit, not a miss.
// Caught live 2026-07-25 — the substring form fired on this hook's own test output.
const NO_MATCH_LINE = /^\s*no matches found\.?\s*$/i;

function isBashSearch(command: unknown): boolean {
  if (typeof command !== "string" || command === "") return false;
  return SEARCH_VERB.test(command) || FIND_SEARCH.test(command);
}

// Strip the output produced by the command's own `echo` banners, so a compound
// `echo "=== X ===" && grep pat file` is still recognized as a zero-hit search. Without
// this, banner text alone makes stdout non-empty and the gate misses the real pathway
// (exactly the shape observed in the 2026-07-25 transcript).
function stripEchoBanners(command: string, stdout: string): string {
  const banners = new Set<string>();
  for (const m of command.matchAll(
    /\becho\s+(?:-[a-zA-Z]+\s+)*(["'])(.*?)\1/g,
  )) {
    const text = m[2];
    for (const line of text.split("\\n")) {
      const t = line.trim();
      if (t !== "") banners.add(t);
    }
  }
  if (banners.size === 0) return stdout;
  return stdout
    .split("\n")
    .filter((line) => !banners.has(line.trim()))
    .join("\n");
}

// Zero-hit over a Bash search: once the command's own echo banners are removed, every
// remaining line must be either blank or ugrep's standalone "No matches found".
// Anything else -> false (fail open). Never fires when the command errored out, since a
// failed command says nothing about absence.
function isZeroHitBashSearch(command: string, resp: any): boolean {
  if (resp == null) return false;
  const stdout =
    typeof resp === "string"
      ? resp
      : typeof resp.stdout === "string"
        ? resp.stdout
        : "";
  if (typeof resp === "object" && typeof resp.stdout !== "string") return false;

  // A real error (bad flag, missing file, permission) is not evidence of absence.
  const stderr = typeof resp?.stderr === "string" ? resp.stderr : "";
  if (stderr.trim() !== "" && !NO_MATCH_LINE.test(stderr.trim())) return false;
  if (typeof resp?.interrupted === "boolean" && resp.interrupted) return false;

  return stripEchoBanners(command, stdout)
    .split("\n")
    .every((line) => line.trim() === "" || NO_MATCH_LINE.test(line));
}

// Resolve the Grep call's effective search root: tool_input.path (resolved against the
// session cwd if relative), else the payload's cwd field, else process.cwd().
function resolveStartPath(payload: any): string {
  const base =
    typeof payload?.cwd === "string" && payload.cwd !== ""
      ? payload.cwd
      : process.cwd();
  const raw = payload?.tool_input?.path;
  if (typeof raw === "string" && raw !== "") {
    return isAbsolute(raw) ? raw : resolve(base, raw);
  }
  return base;
}

// Walk up from `startPath` looking for `.cocoindex_code/settings.yml`, stopping once
// $HOME or the filesystem root has been checked. Returns the registered project dir, or
// null if none was found.
function findCcRegisteredProject(startPath: string): string | null {
  let dir: string;
  try {
    dir = statSync(startPath).isDirectory() ? startPath : dirname(startPath);
  } catch {
    dir = startPath; // best-effort: path may not be locally statable
  }
  dir = resolve(dir);
  const home = resolve(process.env.HOME ?? homedir());

  while (true) {
    if (existsSync(join(dir, ".cocoindex_code", "settings.yml"))) {
      return dir;
    }
    if (dir === home) return null;
    const parent = dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

function sentinelPath(sessionId: string, project: string): string {
  const key = createHash("sha256")
    .update(`${sessionId} ${project}`)
    .digest("hex");
  return join(tmpdir(), "nudge-ccc-on-zero-grep", `${key}.sentinel`);
}

// --- T2 bookkeeping: per (session, project) census, one tiny JSON beside the sentinel ---
// Re-nudge every N searches while ccc is still unused. The FIRST nudge comes early because
// most searching happens in short-lived subagents, not in the main loop: hooks do reach
// subagents (measured 2026-07-25 — each arm gets its own session_id, so each starts from a
// fresh census), and an arm that lives for ~10-30 tool calls would die before a stride of 8
// ever fired. One observed arm ran 7 searches, 0 ccc, and was never told anything.
// After the first nudge the stride widens, so a long main-loop session is not spammed.
const FIRST_NUDGE_AT = 3;
const SEARCH_STRIDE = 8;

type Census = { searches: number; ccc: number; lastNudge: number };

const censusPath = (s: string, p: string): string =>
  `${sentinelPath(s, p)}.census`;

function readCensus(p: string): Census {
  try {
    const c = JSON.parse(readFileSync(p, "utf8"));
    return {
      searches: Number(c.searches) || 0,
      ccc: Number(c.ccc) || 0,
      lastNudge: Number(c.lastNudge) || 0,
    };
  } catch {
    return { searches: 0, ccc: 0, lastNudge: 0 };
  }
}

function writeCensus(p: string, c: Census): void {
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(c));
  } catch {
    /* bookkeeping is best-effort — never break the tool call over it */
  }
}

// Did this command actually RUN ccc, as opposed to merely mentioning it in prose, a
// heredoc, or a test fixture? Command position only.
const CCC_RUN = /(^|[|;&(]|&&|\|\|)\s*ccc\s+(search|grep|index|status|init)\b/;

function emit(context: string): void {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: context,
      },
    }),
  );
}

function main(): number {
  const payload = readStdinJson();
  const tool = payload?.tool_name;

  const command =
    typeof payload?.tool_input?.command === "string"
      ? (payload.tool_input.command as string)
      : "";
  const ranCcc = tool === "Bash" && CCC_RUN.test(command);
  let isSearch = false;
  let zeroHit = false;

  if (tool === "Grep") {
    isSearch = true;
    zeroHit = isZeroHitGrep(payload?.tool_response);
  } else if (tool === "Bash") {
    isSearch = isBashSearch(command);
    if (isSearch)
      zeroHit = isZeroHitBashSearch(command, payload?.tool_response);
  }
  if (!isSearch && !ranCcc) return 0;

  const sessionId = payload?.session_id;
  if (typeof sessionId !== "string" || sessionId === "") return 0;

  const project = findCcRegisteredProject(resolveStartPath(payload));
  if (!project) return 0;

  const cpath = censusPath(sessionId, project);
  const census = readCensus(cpath);
  if (ranCcc) census.ccc += 1;
  if (isSearch) census.searches += 1;

  // A ccc call means semantic search is already in play — record it and stay quiet.
  if (ranCcc) {
    writeCensus(cpath, census);
    return 0;
  }

  // T1 — zero hits. Once per (session, project); this is the sharpest single moment.
  const sentinel = sentinelPath(sessionId, project);
  if (zeroHit && !existsSync(sentinel)) {
    mkdirSync(dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "");
    census.lastNudge = census.searches;
    writeCensus(cpath, census);
    emit(`${MESSAGE_PREFIX}${project}${MESSAGE_SUFFIX}`);
    return 0;
  }

  // T2 — searching hard, never reaching for semantic search. The half a zero-hit
  // trigger cannot see: grep FOUND something, so nothing looked wrong.
  const due = census.lastNudge === 0 ? FIRST_NUDGE_AT : SEARCH_STRIDE;
  if (census.ccc === 0 && census.searches - census.lastNudge >= due) {
    census.lastNudge = census.searches;
    writeCensus(cpath, census);
    emit(
      `${census.searches} literal searches in this ccc-indexed project this session, 0 semantic ` +
        `ones. Literal grep is correct for a token you already know (CC3) — but a hit does NOT ` +
        `mean you found the right thing: the implementation you are looking for may exist under ` +
        `a different name, and a successful grep is exactly when that stays invisible. Before ` +
        `concluding 不在, citing evidence for an audit, or writing anything NEW: cd ${project} && ` +
        `ccc search '<paraphrase>' --limit 8 --refresh, ≥3 paraphrases (JA/EN).`,
    );
    return 0;
  }

  writeCensus(cpath, census);
  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // FAIL OPEN
}
process.exit(code);
