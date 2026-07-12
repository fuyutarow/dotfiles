#!/usr/bin/env bun
// Stop hook — audit-theater guard.
//
// BLOCKS (exit 2) when the assistant's own prose-audit / style-review report uses
// self-justifying or unbounded gate language — the "監査完了 / PASS / 核は stable /
// 私の起因でない" performance the linting-prose skill forbids. The skill states the
// criterion; this hook makes it actually FAIL instead of "be careful".
//
// Safety:
//   0. FAIL OPEN     — any error -> exit 0 (never break a turn).
//   1. LOOP GUARD    — stop_hook_active -> exit 0 (force-stop cap is 8 consecutive blocks).
//   2. CONTEXT GATE  — only audit/review turns: the user asked for a prose/style/skill
//                      review, OR the assistant invoked linting-prose.
//   3. TURN-SCOPED   — only this turn's assistant text.
//   4. CODE-STRIPPED — fences, inline spans, and > blockquotes removed first, so a
//                      QUOTED bad example never fires.
// Detection: specific phrases fire directly; PASS/GREEN fire only when the text carries
// NO "what was checked / what is unchecked" clause (the skill's bounded-PASS rule).

import {
  lastUserText,
  readStdinJson,
  readTranscript,
  stripCode,
  turnText,
} from "./lib.ts";

function main(): number {
  const payload = readStdinJson();
  if (payload?.stop_hook_active) return 0;
  const transcript = payload?.transcript_path;
  if (typeof transcript !== "string" || transcript === "") return 0;

  const entries = readTranscript(transcript);
  const turn = turnText(entries);
  if (turn === "") return 0;

  const user = lastUserText(entries);
  const ctx =
    /prose audit|prose review|文体|style (review|rewrite)|skill ?review|skill ?レビュー|レビュー|audit|監査/i.test(
      user,
    ) ||
    // old skill names kept as back-compat alternates: older transcripts may still carry them
    /linting-prose|grounding-prose|auditing-audience-facing-prose/.test(turn);
  if (!ctx) return 0;

  const stripped = stripCode(turn, { blockquotes: true });

  let hit = /監査完了|核は stable|私の起因でない|好例|gate を通過/.test(
    stripped,
  );
  if (!hit && /\b(PASS|GREEN)\b/.test(stripped)) {
    hit =
      !/検査|チェック|scan|checked|未検査|not checked|未確認|remains|残/i.test(
        stripped,
      );
  }
  if (!hit) return 0;

  console.error(
    [
      "Your audit report used self-justifying or unbounded gate language.",
      "Rewrite with: target / violation / cited evidence / replacement / unchecked risk.",
      "Do not say PASS, GREEN, 監査完了, 好例, 核, 本体, or 私の起因でない unless bounded to an exact check.",
    ].join("\n"),
  );
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // FAIL OPEN
}
process.exit(code);
