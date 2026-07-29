#!/usr/bin/env bun
// Stop hook — footing-splice guard.
//
// WARNS (never blocks) when the assistant's final text this turn COMPARES two
// research-measurement-shaped numbers without stating the measurement conditions that make
// them comparable.
//
// Why this exists (2026-07-29, independent review by gpt-5.6-sol):
// the day's postmortem blamed "not opening the canon". That diagnosis was incomplete. Four of
// the six symptoms the reviewer listed were conflations made WITH citations in hand —
// transcript price read as model price, activation marginal read as truth-table bias, a
// fully-connected v2 smoke's branching ratio read as fixed32's, a composite-change difference
// attributed to STE alone. A citation-presence check (detect-uncited-diagnosis.ts) cannot see
// any of those: every one of them cited a source.
//
// What fails is P8 FOOTING — 数値は比較軸が一致した土俵だけで差として読む — which the
// supervisor holds as a rule and violated repeatedly in one day. This hook makes the rule
// mechanical: if you put two measured numbers side by side, name the conditions.
//
// Safety (mirrors the sibling Stop hooks):
//   0. FAIL OPEN     — any error -> exit 0.
//   1. LOOP GUARD    — stop_hook_active -> exit 0.
//   2. CONTEXT GATE  — the turn must be >= MIN_LINES lines.
//   3. TURN-SCOPED   — only this turn's assistant text.
//   4. CODE-STRIPPED — fences, inline spans and > blockquotes removed, so a QUOTED table of
//                      numbers neither fires nor satisfies. Conditions must be stated in the
//                      supervisor's own prose.
//
// The trigger is deliberately narrow: an explicit comparison marker AND at least two numbers
// carrying >= MIN_DECIMALS decimal places (the shape of a bpc/ratio measurement, not a count,
// a line number or a date). Bare counts never fire.
//
// WARN-mode contract: NEVER exits 2.

import { readStdinJson, readTranscript, stripCode, turnText } from "./lib.ts";

// REPO GATE — firedancer only. The satisfier vocabulary below (docs/, theory/, soks/,
// 土俵, 正本, fan-in …) is this repository's layout and research idiom. Firing anywhere
// else would produce a warning nobody can satisfy, so this hook no-ops outside the repo.
// Mirrors detect-unanchored-registration.ts's REPO GATE.
const REPO_ROOT = "/home/fuyu/Workspace/firedancer";

const MIN_LINES = 8;
const MIN_DECIMALS = 3;
const MIN_MEASUREMENTS = 2;

// Comparison markers — the assertion that two numbers stand in a relation.
const COMPARISON_TOKENS: Array<{ name: string; re: RegExp }> = [
  { name: "差", re: /差(?:は|が|を|＝|=)/ },
  { name: "対", re: /\d\s*対\s*\d/ },
  { name: "倍", re: /\d\s*倍/ },
  { name: "より良い/悪い", re: /より(?:良|悪|大き|小さ|速|遅)/ },
  { name: "上回る/下回る", re: /(?:上回|下回)/ },
  { name: "勝つ/負ける", re: /(?:に勝っ|に負け)/ },
  { name: "vs", re: /\bvs\.?\b/i },
  { name: "並ぶ/一致", re: /(?:に並|と一致)/ },
];

// Measurement-shaped number: >= MIN_DECIMALS decimals. Excludes line numbers, counts, dates.
const MEASUREMENT_RE = new RegExp(`\\d+\\.\\d{${MIN_DECIMALS},}`, "g");

// Condition tokens — any ONE anywhere in the message satisfies. Naming the footing once is
// enough; this hook does not try to bind conditions to specific numbers.
const CONDITION_PATTERNS: RegExp[] = [
  /N\s*=/,
  /2\^\d/,
  /\bseed\b/i,
  /種\s*\d/,
  /\blr\s*=/i,
  /学習率/,
  /\bepoch/i,
  /エポック/,
  /土俵/,
  /同じ条件/,
  /測定の条件/,
  /条件が(?:揃|一致)/,
  /揃って(?:い|お)/,
  /D\s*=\s*\d/,
  /\bK\s*=\s*\d/,
  /fan-?in/i,
  /\bH\s*=\s*\d/,
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

  if (turn.split("\n").length < MIN_LINES) return 0;

  const stripped = stripCode(turn, { blockquotes: true });

  const cmp = COMPARISON_TOKENS.find((c) => c.re.test(stripped));
  if (!cmp) return 0;

  const measurements = stripped.match(MEASUREMENT_RE) ?? [];
  if (measurements.length < MIN_MEASUREMENTS) return 0;

  const stated = CONDITION_PATTERNS.some((re) => re.test(stripped));
  if (stated) return 0;

  const systemMessage = [
    `Footing splice: this turn compares measured numbers ("${cmp.name}", e.g. ${measurements.slice(0, 2).join(" / ")}) with no measurement conditions stated.`,
    "P8: read numbers as a difference only on a matched footing. State N, seed, lr, depth, fan-in — or say plainly which axes do NOT match.",
    "On 2026-07-29 a whole day's causal chain rested on a branching ratio measured at N=1024 on a different machine, which an audit five days earlier had explicitly forbidden transferring.",
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
