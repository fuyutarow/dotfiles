#!/usr/bin/env bun
// Stop hook — uncited-diagnosis guard.
//
// WARNS (never blocks) when the assistant's final text this turn states a DIAGNOSIS about a
// research program — what the central issue is, what the cause is, what to build next, what
// is unresolved — with NO pointer to a canonical source and NO explicit admission that the
// canon does not cover it.
//
// Why this exists (2026-07-29 postmortem, notes/postmortem/正本を開かない-2026-07-29.md):
// eleven same-shape errors in one day, nine of them while answering "what is the critical
// issue" / "what has been hard" / "what should we build". P0 GROUNDING fires before claims
// of novelty/absence/level and before registrations — diagnosis matches none of those words,
// so nothing rang. The sharpest instance: a design canon written that same day, listed at
// docs/INDEX.md line 43, was never opened, and the day was spent re-deriving what it files
// as its fourth of six unresolved items.
//
// This hook mechanises the corrective so it does not depend on the supervisor's compliance.
//
// Safety (mirrors detect-groundless-claim.ts):
//   0. FAIL OPEN     — any error -> exit 0 (never break a turn).
//   1. LOOP GUARD    — stop_hook_active -> exit 0.
//   2. CONTEXT GATE  — the turn must be >= MIN_LINES lines; short replies are exempt.
//   3. TURN-SCOPED   — only this turn's assistant text (lib.turnText).
//   4. CODE-STRIPPED — fences, inline spans and > blockquotes removed first, so a QUOTED
//                      diagnosis never fires and a QUOTED citation never satisfies. This is
//                      deliberate: relaying the canon means citing its path in prose too.
//
// WARN-mode contract: NEVER exits 2. On a hit it prints `{"systemMessage": "..."}` and
// exits 0.

import { readStdinJson, readTranscript, stripCode, turnText } from "./lib.ts";

// REPO GATE — firedancer only. The satisfier vocabulary below (docs/, theory/, soks/,
// 土俵, 正本, fan-in …) is this repository's layout and research idiom. Firing anywhere
// else would produce a warning nobody can satisfy, so this hook no-ops outside the repo.
// Mirrors detect-unanchored-registration.ts's REPO GATE.
const REPO_ROOT = "/home/fuyu/Workspace/firedancer";

const MIN_LINES = 8;

// DIAGNOSIS tokens — assertions about a program's state, cause or direction. These are the
// shapes that carried the nine failures.
const DIAGNOSIS_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: "クリティカルイシュー", re: /クリティカル\s*イシュー/ },
  { name: "中心の問題/中心のイシュー", re: /中心の(?:問題|イシュー|課題)/ },
  { name: "本当の問題/本当の原因", re: /本当の(?:問題|原因|理由)/ },
  { name: "原因は", re: /原因は/ },
  { name: "詰まっている/詰まりは", re: /詰ま(?:っている|りは|り)/ },
  { name: "次に建てる/次に作る", re: /次に(?:建て|作(?:る|り))/ },
  { name: "何を難しがって", re: /難しがっ/ },
  { name: "未解決は/残る問い", re: /(?:未解決は|残る問い|開いている問い)/ },
  { name: "ブレイクスルーは", re: /ブレイクスルー(?:は|の形|になる)/ },
  { name: "突破口", re: /突破口/ },
  { name: "アーキテクチャの提案", re: /アーキテクチャ(?:の)?(?:提案|は)/ },
];

// path:line citation — same extension set as the sibling hook.
const PATH_LINE_RE =
  /[\w./-]+\.(?:md|ts|tsx|js|jsx|py|jl|rs|go|rb|sh|jsonl|toml):\d+/;

// Canonical-source pointers. Any ONE satisfies. A bare path counts: naming docs/D2607_32
// without a line number still proves the canon was opened.
const CANON_PATTERNS: RegExp[] = [
  PATH_LINE_RE,
  /docs\/[\w-]+/,
  /theory\/[\w-]+/,
  /notes\/(?:consults|postmortem|brainstorms|audits)\//,
  /soks\/[\w-]+/,
  /\bRESULTS\.md\b/,
  /\bSTATUS\.md\b/,
  /\bRESEARCH-PROGRAM\.md\b/,
  /\bCLAUDE\.md\b/,
  /正本/,
  /ccc\s+search/i,
];

// Explicit "the canon does not cover this" admissions. Also satisfy — the corrective allows
// saying so, it only forbids silently improvising.
const NO_CANON_PATTERNS: RegExp[] = [
  /正本(?:に|には)(?:無|な)い/,
  /正本(?:に|には)記載(?:が)?(?:無|な)い/,
  /台帳(?:に|には)(?:無|な)い/,
  /未登録/,
  /照合(?:の)?結果[\s\S]{0,20}0\s*件/,
];

function main(): number {
  const payload = readStdinJson();
  if (payload?.stop_hook_active) return 0;
  const cwd = payload?.cwd;
  if (typeof cwd !== "string" || !cwd.startsWith(REPO_ROOT)) return 0;

  const transcript = payload?.transcript_path;
  if (typeof transcript !== "string" || transcript === "") return 0;

  const entries = readTranscript(transcript);
  const turn = turnText(entries);
  if (turn === "") return 0;

  // CONTEXT GATE — short conversational replies are exempt.
  if (turn.split("\n").length < MIN_LINES) return 0;

  const stripped = stripCode(turn, { blockquotes: true });

  const hit = DIAGNOSIS_TOKENS.find((d) => d.re.test(stripped));
  if (!hit) return 0;

  const cited = CANON_PATTERNS.some((re) => re.test(stripped));
  if (cited) return 0;

  const admitted = NO_CANON_PATTERNS.some((re) => re.test(stripped));
  if (admitted) return 0;

  const systemMessage = [
    `Uncited diagnosis: "${hit.name}" appears in this turn with no canonical source and no admission that the canon lacks one.`,
    "Open docs/INDEX.md and docs/着想の台帳.md first, then cite what you found (docs/…, theory/…, notes/consults/…, RESULTS.md, a file:line) — or state plainly that 正本に無い and route it to the principal or an executor.",
    "Do not synthesise a diagnosis from context. That is the shape that failed eleven times on 2026-07-29.",
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
