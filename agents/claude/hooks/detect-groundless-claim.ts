#!/usr/bin/env bun
// Stop hook — groundless-claim guard.
//
// WARNS (never blocks) when the assistant's final text this turn makes a
// grounding-required claim ("達成", "実証", "世界初", …) with NO verification
// denominator attached (分母 / 照合 / file:line / git show|log|diff / URL / 監査 / …).
// This mechanizes acting-as-director P0/P6 — 規律は散文としては存在するが執行系が無い —
// by making "cite your denominator" a mechanical nudge instead of a norm nobody enforces.
//
// Safety (mirrors detect-audit-theater.ts):
//   0. FAIL OPEN     — any error -> exit 0 (never break a turn).
//   1. LOOP GUARD    — stop_hook_active -> exit 0 (avoids re-firing on the forced stop).
//   2. CONTEXT GATE  — the turn must be >= MIN_LINES lines; short conversational replies
//                      (a quick "ok", a one-line answer) are exempt by construction.
//   3. TURN-SCOPED   — only this turn's assistant text (lib.turnText).
//   4. CODE-STRIPPED — fences, inline spans, and > blockquotes removed first, so a
//                      QUOTED claim/denominator example never fires or satisfies.
//
// WARN-mode contract: this hook NEVER exits 2. On a hit it prints
// `{"systemMessage": "..."}` to stdout and exits 0 — a nudge the harness surfaces to the
// user, not a block that feeds back into the transcript.

import { readStdinJson, readTranscript, stripCode, turnText } from "./lib.ts";

const MIN_LINES = 8;

// CLAIM tokens — grounding-required assertions that demand a denominator. Regex list is
// fixed by spec; do not extend beyond what's named there.
const CLAIM_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: "達成", re: /達成/ },
  { name: "決着", re: /決着/ },
  { name: "確定", re: /確定/ },
  { name: "実証", re: /実証/ },
  { name: "合格", re: /合格/ },
  { name: "新規性", re: /新規性/ },
  { name: "前例がない", re: /前例が(?:ない|無い)/ },
  {
    name: "存在しない/見つからなかった",
    re: /(?:存在しない|見つからなかった)/,
  },
  { name: "frontier", re: /\bfrontier\b/i },
  { name: "初の", re: /初の/ },
  { name: "世界初", re: /世界初/ },
  { name: "全て…済み", re: /全て[\s\S]{0,30}済(?:み|んだ)/ },
];

// path:line citation regex — extended (per spec's explicit allowance) beyond the example
// extensions for robustness in this TS/JS-heavy repo; the TOKEN LISTS above/below are not
// extended, only this pattern's file-extension alternation.
const PATH_LINE_RE = /[\w./-]+\.(?:md|ts|tsx|js|jsx|py|jl|rs|go|rb|sh):\d+/;

// DENOMINATOR tokens — any ONE of these in the same (code-stripped) message satisfies.
const DENOMINATOR_PATTERNS: RegExp[] = [
  /分母/,
  /照合/,
  /ccc\s+search/i,
  /ccc\s+grep/i,
  /\brecall\b/i,
  /正本/,
  /git\s+(?:show|log|diff)\b/i,
  /https?:\/\/\S+/,
  /検証手段/,
  /監査/,
  PATH_LINE_RE,
];

function main(): number {
  const payload = readStdinJson();
  if (payload?.stop_hook_active) return 0;
  const transcript = payload?.transcript_path;
  if (typeof transcript !== "string" || transcript === "") return 0;

  const entries = readTranscript(transcript);
  const turn = turnText(entries);
  if (turn === "") return 0;

  // CONTEXT GATE — short conversational replies are exempt.
  if (turn.split("\n").length < MIN_LINES) return 0;

  const stripped = stripCode(turn, { blockquotes: true });

  const claimHit = CLAIM_TOKENS.find((c) => c.re.test(stripped));
  if (!claimHit) return 0;

  const hasDenominator = DENOMINATOR_PATTERNS.some((re) => re.test(stripped));
  if (hasDenominator) return 0;

  const systemMessage = [
    `Groundless claim: "${claimHit.name}" appears in this turn's answer with no verification denominator attached.`,
    "Cite the 分母: what was checked against what (照合/正本), a file:line, git show/log/diff, a URL, or name the 検証手段/監査 — or soften the claim.",
  ].join("\n");

  process.stdout.write(JSON.stringify({ systemMessage }));
  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // FAIL OPEN
}
process.exit(code);
