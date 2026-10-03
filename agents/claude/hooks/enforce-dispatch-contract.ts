// PreToolUse gate — every dispatch names one of exactly two model+effort pairs, explicitly,
// and the Opus pair is escalation-only.
// matcher: Agent|Task|Workflow   (settings.json: run.sh --fail-closed)
//
// ALLOWED PAIRS (the only two — nothing is implicit, nothing is injected):
//   (subagent_type "sonnet-high", model "sonnet",  effort "high")
//   (subagent_type "opus-medium", model "opus",    effort "medium")
//
// Policy:
//   - Agent/Task: subagent_type must be present and be exactly "sonnet-high" or
//                 "opus-medium"; model must be present and name the same family as the
//                 chosen type (an alias like "sonnet"/"opus", or a full model id matching
//                 that family). Missing subagent_type, any other subagent_type (fork,
//                 Explore, general-purpose, Plan, claude-code-guide, …), missing model, or a
//                 model/type mismatch are all denied. Effort is not a parameter of this
//                 tool — it comes from the agent definition's frontmatter
//                 (agents/claude/agents/sonnet-high.md, opus-medium.md), which is what
//                 subagent_type is really selecting.
//   - Every dispatch declares exactly one resource class. NONCOMPUTE excludes numerical
//                 experiments, benchmarks, resident services, parallel tests, and nested
//                 fanout. Compute work points to an absolute admitted envelope and may run
//                 commands only through agent-resource-run.
//   - Workflow: every agent() call names its pair explicitly, either by a literal
//               agentType:'sonnet-high' | 'opus-medium' (agent() then runs that agent
//               definition, whose frontmatter carries model AND effort; a model/effort written
//               beside it must state the same pair) or by exactly one top-level literal model:
//               AND effort: forming one of the two allowed pairs. Omitting the choice is a
//               violation, not an inheritance.
//               Named/child/unreadable workflows are denied because they cannot be
//               inspected.
//   - ESCALATION: sonnet-high is the default (2026-10-01: Sonnet 5.5 high scores within a few
//                 points of Opus 5.5 medium at lower cost per task). An opus-medium dispatch —
//                 Agent/Task subagent_type "opus-medium" or a Workflow agent() on the opus pair —
//                 must carry exactly one `ESCALATE(OPUS): <reason>` line in its prompt (Workflow:
//                 inside the same agent() call), the reason naming why Sonnet is not enough.
//   - The role binding lives in orchestrating-agents/references/model-roster.md; this hook
//     enforces it without a bypass. There is no low-effort escape hatch: 'low' is simply not
//     an allowed value, so no declaration mechanism exists for it any more.
//
// The verifier blanks strings/templates/comments length-preservingly, then walks agent()
// call spans by paren depth; model/effort values are matched against the ORIGINAL source, so
// a "model:'sonnet'" inside a prompt string cannot fake a pass.
//
// DIAGNOSTICS — batched, not first-error-wins. The per-call axes (model, effort, resource)
// are INDEPENDENT: none of them consumes another's output, so there is nothing to "recover"
// into and every violation in a script is collected and emitted in ONE deny, grouped by the
// agent() call that owns it. A caller therefore sees the whole fix list once instead of
// being denied N times in a row. Two borrowings from compiler diagnostics:
//   - POISONING: an agent() span whose parens never close cannot be parsed, so its other
//     axes are NOT reported — a cascade off one syntax error is noise, not information.
//   - CAP: at most MAX_REPORTED_LINES lines are listed, and the remainder is stated out
//     loud rather than silently dropped.
// Findings that make the verification MODEL itself unsound (indirect dispatch, child
// workflows) are reported in the same batch and additionally flagged, because calls reached
// through them were never scanned.
//
// FAIL CLOSED: any error (bad payload, fs error) -> deny. run.sh also denies when bun
// itself is missing.

import { readFileSync } from "node:fs";
import {
  RESOURCE_DECLARATION_HELP,
  resourceDeclarationResult,
} from "../../resource-control/lib/dispatch-declaration.ts";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { at, obj, strAt } from "../../hooks/narrow.ts";
import { decidePre, readStdinJson } from "./lib.ts";

const SONNET = /(?:^|[-_])sonnet(?:$|[-_])/i;
const OPUS = /(?:^|[-_])opus(?:$|[-_])/i;

// The Agent/Task tool has no `effort` parameter — effort comes from the chosen agent
// definition's frontmatter (sonnet-high.md / opus-medium.md), so subagent_type IS the
// effort selector for that tool. model still has to name the matching family, so a caller
// cannot dispatch subagent_type:"sonnet-high" with model:"opus" and get away with it.
const AGENT_TYPE_FAMILY: Record<string, RegExp> = {
  "sonnet-high": SONNET,
  "opus-medium": OPUS,
};
const AGENT_PAIR_HELP =
  'subagent_type:"sonnet-high", model:"sonnet" or subagent_type:"opus-medium", model:"opus"';
// Which of the two to pick — the part a caller cannot infer from "not allowed" alone. Printed
// once per deny, wherever the diagnostic leaves the choice open.
const CHOOSE_PAIR =
  "Default to sonnet-high: implementation from a clear spec, bug fixes, tests, terminal work, " +
  "bulk coding. Use opus-medium only as an escalation, with an ESCALATE(OPUS) line: ambiguous " +
  "spec, multi-repo or large refactor, design judgment, factual accuracy, or sonnet-high " +
  "already stuck on this task.";

// Opus is escalation-only: exactly one ESCALATE(OPUS) line whose reason says why Sonnet is not
// enough. Matched on the ORIGINAL text (a prompt string is where it lives), like the resource
// declaration. A reason under MIN_ESCALATION_REASON non-space characters is a placeholder.
const ESCALATION_TOKEN = /ESCALATE\(OPUS\):[ \t]*([^\n]*)/g;
const MIN_ESCALATION_REASON = 12;
const ESCALATION_HELP =
  "one line `ESCALATE(OPUS): <why Sonnet 5.5 high is not enough — ambiguous spec, " +
  "multi-repo or large refactor, design judgment, factual accuracy, or sonnet-high already " +
  "stuck on this task>`";
function escalationProblem(
  text: string | null,
  sonnetFix: string,
): string | null {
  if (text === null) {
    return `opus-medium is escalation-only, but there is no inspectable prompt to carry ${ESCALATION_HELP} — ${sonnetFix}`;
  }
  const hits = [...text.matchAll(ESCALATION_TOKEN)];
  if (hits.length === 0) {
    return `opus-medium is escalation-only — add ${ESCALATION_HELP} to the prompt, or ${sonnetFix} (the default)`;
  }
  if (hits.length > 1) {
    return `found ${hits.length} ESCALATE(OPUS) lines, need exactly 1 — keep one ${ESCALATION_HELP}`;
  }
  const reason = (hits[0]?.[1] ?? "").replace(/\s/g, "");
  if (reason.length < MIN_ESCALATION_REASON) {
    return `ESCALATE(OPUS) reason is empty or a placeholder (under ${MIN_ESCALATION_REASON} characters) — state why Sonnet is not enough, or ${sonnetFix}`;
  }
  return null;
}
const TYPE_FOR_FAMILY = { sonnet: "sonnet-high", opus: "opus-medium" } as const;
function familyOf(model: string): "sonnet" | "opus" | null {
  if (SONNET.test(model)) return "sonnet";
  if (OPUS.test(model)) return "opus";
  return null;
}

// Workflow scripts pass model/effort as literals directly, so the pair is checked in full.
const WORKFLOW_ALLOWED_EFFORT: Record<string, string> = {
  sonnet: "high",
  opus: "medium",
};
const MODEL_FOR_EFFORT: Record<string, string> = {
  high: "sonnet",
  medium: "opus",
};
const WORKFLOW_PAIR_HELP =
  "model:'sonnet' with effort:'high', or model:'opus' with effort:'medium'";
// The same two pairs by name: Workflow agent() takes agentType and then runs that agent
// definition (sonnet-high.md / opus-medium.md), whose frontmatter carries model AND effort —
// so a literal agentType alone is an explicit, complete choice, exactly like subagent_type on
// the Agent tool.
const WORKFLOW_AGENT_TYPES: Record<string, { model: string; effort: string }> =
  {
    "sonnet-high": { model: "sonnet", effort: "high" },
    "opus-medium": { model: "opus", effort: "medium" },
  };
const WORKFLOW_CHOICE_HELP =
  "agentType:'sonnet-high' or agentType:'opus-medium', or the literal pair " +
  WORKFLOW_PAIR_HELP;

// ---------------------------------------------------------------------------
// Batched diagnostics
// ---------------------------------------------------------------------------

// "shape" is script-level (the capability was not called directly); the rest are per-call.
type Axis = "shape" | "syntax" | "model" | "effort" | "escalation" | "resource";
type Finding = { line: number; axis: Axis; detail: string };

// Report order for the HOW TO FIX block: unsound-model first, then unparseable, then axes.
const AXIS_ORDER: Axis[] = [
  "shape",
  "syntax",
  "model",
  "effort",
  "escalation",
  "resource",
];

// A flood costs the reader more than it informs. Cap the listing and SAY it was capped.
const MAX_REPORTED_LINES = 20;

const AXIS_HINT: Record<Axis, string> = {
  shape:
    "shape    — every executor must be a direct, inspectable agent(prompt, {…}) call naming its " +
    `pair with literal values (${WORKFLOW_CHOICE_HELP}). ` +
    "Remove aliases, computed access, and child workflow() calls, and inline the child's agents.",
  syntax:
    "syntax   — this agent( span never closes, so nothing about it can be verified. " +
    "Fix the parentheses first; its other axes were NOT checked.",
  model:
    "model    — name the pair: agentType:'sonnet-high' or agentType:'opus-medium' alone, OR " +
    "exactly one literal model: property, top-level in the options object " +
    `(no nesting, no spread, no computed key), naming the same family as effort: ${WORKFLOW_PAIR_HELP}. ` +
    CHOOSE_PAIR,
  effort:
    "effort   — exactly one literal effort: property, top-level in the options object " +
    `(no nesting, no spread, no computed key), paired with model as one of: ${WORKFLOW_PAIR_HELP}. ` +
    "No default applies: an omitted effort is a violation, and 'low' is not an allowed value.",
  escalation:
    `escalation — the opus pair is escalation-only: put ${ESCALATION_HELP} inside the SAME ` +
    "agent() call (its prompt), or switch the call to agentType:'sonnet-high'.",
  resource: `resource — ${RESOURCE_DECLARATION_HELP}, inside the SAME agent() call.`,
};

function lineAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === "\n") line++;
  return line;
}

// dispatch-declaration.ts appends the full HELP text to every reason. That belongs in the
// HOW TO FIX block once, not on every finding line, so strip it back to the distinguishing part.
function shortResourceReason(reason: string): string {
  const short = reason
    .replace(/;?\s*require\s+exactly one[\s\S]*$/i, "")
    .replace(/^resource declaration is /i, "")
    .replace(/^resource envelope /i, "envelope ")
    .replace(
      /^found (\d+) resource declaration token\(s\)$/i,
      "found $1 token(s), need exactly 1",
    )
    .trim();
  return `resource declaration: ${short === "" ? "invalid" : short}`;
}

// ONE deny carrying every finding, grouped by the agent() call that owns it — a caller fixes
// the whole list in a single pass instead of being denied once per axis.
function denyFindings(findings: Finding[], totalCalls: number): void {
  if (findings.length === 0) return;

  const byLine = new Map<number, string[]>();
  for (const f of findings) {
    byLine.set(f.line, [...(byLine.get(f.line) ?? []), f.detail]);
  }
  const lines = [...byLine.keys()].sort((a, b) => a - b);
  const shown = lines.slice(0, MAX_REPORTED_LINES);

  const body = shown.map(
    (line) => `  line ${line}: ${[...new Set(byLine.get(line))].join("; ")}`,
  );
  if (lines.length > shown.length) {
    body.push(
      `  …and ${lines.length - shown.length} more line(s) with findings, not listed ` +
        `(cap ${MAX_REPORTED_LINES}). Fix these first and re-invoke to see the rest.`,
    );
  }

  const axes = new Set(findings.map((f) => f.axis));
  if (axes.has("shape")) {
    body.push(
      "  NOTE: dispatch reached through the indirection above was never scanned, " +
        "so the list may be incomplete.",
    );
  }

  const scope =
    lines.length === 1 ? "1 line violates" : `${lines.length} lines violate`;
  const scanned =
    totalCalls === 1
      ? "1 direct agent() call"
      : `${totalCalls} direct agent() calls`;

  // BATCHED(shape, syntax, model, effort, escalation, resource): none of these consumes another's output,
  // so all of them are collected across the whole script and reported in this one decision.
  decidePre(
    "deny",
    `dispatch-contract: ${scope} the dispatch contract in this Workflow script ` +
      `(${scanned} scanned). Every finding is listed below — fix them all, then re-invoke.\n` +
      body.join("\n") +
      "\nHOW TO FIX\n" +
      AXIS_ORDER.filter((a) => axes.has(a))
        .map((a) => `  ${AXIS_HINT[a]}`)
        .join("\n"),
  );
}

type LexState = "code" | "s1" | "s2" | "tpl" | "line" | "block";

// Handle one "code" character: detects the start of a string/template/comment.
function blankCodeChar(
  chars: string[],
  i: number,
  c: string | undefined,
  n: string | undefined,
): LexState {
  if (c === "'") return "s1";
  if (c === '"') return "s2";
  if (c === "`") return "tpl";
  if (c === "/" && n === "/") {
    chars[i] = " ";
    return "line";
  }
  if (c === "/" && n === "*") {
    chars[i] = " ";
    return "block";
  }
  return "code";
}

// Handle one character inside a quoted string/template literal. An escape blanks the
// backslash and (unless it precedes a newline) the escaped character too — the caller
// advances its index by the returned `skip`, matching the original inline `i++`.
function blankQuotedChar(
  chars: string[],
  i: number,
  c: string | undefined,
  n: string | undefined,
  st: "s1" | "s2" | "tpl",
): { st: LexState; skip: number } {
  let q: string;
  if (st === "s1") q = "'";
  else if (st === "s2") q = '"';
  else q = "`";
  if (c === "\\") {
    chars[i] = " ";
    if (n !== undefined && n !== "\n") {
      chars[i + 1] = " ";
      return { st, skip: 1 };
    }
    return { st, skip: 0 };
  }
  if (c === q) return { st: "code", skip: 0 };
  if (c !== "\n") chars[i] = " ";
  return { st, skip: 0 };
}

// Handle one character inside a line comment.
function blankLineChar(
  chars: string[],
  i: number,
  c: string | undefined,
): LexState {
  if (c === "\n") return "code";
  chars[i] = " ";
  return "line";
}

// Handle one character inside a block comment. `*/` blanks both characters and closes it —
// the caller advances its index by the returned `skip`, matching the original inline `i++`.
function blankBlockChar(
  chars: string[],
  i: number,
  c: string | undefined,
  n: string | undefined,
): { st: LexState; skip: number } {
  if (c === "*" && n === "/") {
    chars[i] = " ";
    chars[i + 1] = " ";
    return { st: "code", skip: 1 };
  }
  if (c !== "\n") chars[i] = " ";
  return { st: "block", skip: 0 };
}

// Blank string/template/comment interiors, preserving length and newlines, so that
// (a) brackets inside them cannot break the call-span scan and (b) prompt text cannot
// spoof `agent(` / `model:`.
function blank(s: string): string {
  const chars = Array.from(s);
  let st: LexState = "code";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const n = chars[i + 1];
    if (st === "code") {
      st = blankCodeChar(chars, i, c, n);
    } else if (st === "s1" || st === "s2" || st === "tpl") {
      const result = blankQuotedChar(chars, i, c, n, st);
      st = result.st;
      i += result.skip;
    } else if (st === "line") {
      st = blankLineChar(chars, i, c);
    } else {
      // block comment
      const result = blankBlockChar(chars, i, c, n);
      st = result.st;
      i += result.skip;
    }
  }
  return chars.join("");
}

type Span = { start: number; end: number };

function trimSpan(src: string, start: number, end: number): Span {
  while (start < end) {
    const c = src[start];
    if (c === undefined || !/\s/.test(c)) break;
    start++;
  }
  while (end > start) {
    const c = src[end - 1];
    if (c === undefined || !/\s/.test(c)) break;
    end--;
  }
  return { start, end };
}

// Split a blanked source range on commas that are direct children of that range.
// Strings and comments are already blanked, so their punctuation cannot affect nesting.
function directSegments(
  src: string,
  start: number,
  end: number,
): Span[] | null {
  const spans: Span[] = [];
  let segmentStart = start;
  let depth = 0;
  for (let i = start; i < end; i++) {
    const c = src[i];
    // An unmatched close bracket ends the scan immediately; check it before the main
    // classification below so the check itself never nests inside that if/else-if chain.
    if ((c === ")" || c === "}" || c === "]") && depth === 0) return null;
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      spans.push(trimSpan(src, segmentStart, i));
      segmentStart = i + 1;
    }
  }
  if (depth !== 0) return null;
  spans.push(trimSpan(src, segmentStart, end));
  return spans;
}

// One agent() call's top-level {model:…, effort:…} shape, extracted from the OPTIONS object.
// `unsound` means a spread or computed key was seen among the properties, so NEITHER model
// nor effort can be trusted even if a literal with the right name also appears — either could
// be overwritten at runtime. Values are captured as `null` when the property exists but its
// value is not a simple quoted-string literal (a variable, a computed expression, a template
// interpolation): that is reported the same as "malformed", not silently ignored.
type CallShape = {
  unsound: boolean;
  modelValues: (string | null)[];
  effortValues: (string | null)[];
  agentTypeValues: (string | null)[];
};

function literalValue(src: string, valueStart: number): string | null {
  const m = /^(['"])([^'"]*)\1/.exec(src.slice(valueStart));
  return m === null ? null : (m[2] ?? null);
}

// Parsing failure (no options object, unbalanced braces, trailing junk) is folded into
// `unsound: true` with empty value lists rather than a separate null case — the caller
// treats "can't be trusted" and "can't be found" identically: both mean the pair is denied.
function scanCallOptions(
  src: string,
  blanked: string,
  start: number,
  end: number,
): CallShape {
  const fail: CallShape = {
    unsound: true,
    modelValues: [],
    effortValues: [],
    agentTypeValues: [],
  };
  const args = directSegments(blanked, start, end);
  if (args === null || args.length !== 2) return fail;

  const options = args[1];
  if (options === undefined) return fail;
  if (blanked[options.start] !== "{") return fail;
  let close = options.start + 1;
  let depth = 1;
  while (close < options.end && depth > 0) {
    if (blanked[close] === "{") depth++;
    else if (blanked[close] === "}") depth--;
    close++;
  }
  if (
    depth !== 0 ||
    trimSpan(blanked, close, options.end).start !== options.end
  ) {
    return fail;
  }

  const properties = directSegments(blanked, options.start + 1, close - 1);
  if (properties === null) return fail;

  let unsound = false;
  const modelValues: (string | null)[] = [];
  const effortValues: (string | null)[] = [];
  const agentTypeValues: (string | null)[] = [];
  for (const property of properties) {
    const text = blanked.slice(property.start, property.end);
    // Spread and computed keys can overwrite a preceding literal at runtime.
    if (text.startsWith("...") || text.startsWith("[")) {
      unsound = true;
      continue;
    }
    const modelKey = /^model\s*:\s*/.exec(text);
    if (modelKey !== null) {
      modelValues.push(literalValue(src, property.start + modelKey[0].length));
      continue;
    }
    const agentTypeKey = /^agentType\s*:\s*/.exec(text);
    if (agentTypeKey !== null) {
      agentTypeValues.push(
        literalValue(src, property.start + agentTypeKey[0].length),
      );
      continue;
    }
    const effortKey = /^effort\s*:\s*/.exec(text);
    if (effortKey !== null) {
      effortValues.push(
        literalValue(src, property.start + effortKey[0].length),
      );
    }
  }
  return { unsound, modelValues, effortValues, agentTypeValues };
}

type PropStatus =
  | { kind: "missing" }
  | { kind: "malformed" }
  | { kind: "invalid"; value: string }
  | { kind: "ok"; value: string };

function classifyProp(
  values: (string | null)[],
  allowed: string[],
  unsound: boolean,
): PropStatus {
  if (unsound) return { kind: "malformed" };
  if (values.length === 0) return { kind: "missing" };
  if (values.length > 1) return { kind: "malformed" };
  const v = values[0];
  if (v === null || v === undefined) return { kind: "malformed" };
  if (!allowed.includes(v)) return { kind: "invalid", value: v };
  return { kind: "ok", value: v };
}

// Both model and effort must be present, each a single top-level literal, and the two values
// must form one of the two allowed pairs. Reported as (up to) two findings — one per axis —
// so the HOW TO FIX block still points at the right property, plus a third when both
// individual values are fine but the COMBINATION is not (sonnet+medium, opus+high, …).
function pairFindings(shape: CallShape): { axis: Axis; detail: string }[] {
  if (shape.agentTypeValues.length > 0) return agentTypeFindings(shape);
  const model = classifyProp(
    shape.modelValues,
    ["sonnet", "opus"],
    shape.unsound,
  );
  const effort = classifyProp(
    shape.effortValues,
    ["high", "medium"],
    shape.unsound,
  );
  const out: { axis: Axis; detail: string }[] = [];

  if (model.kind === "missing" && effort.kind === "missing") {
    // One cause (no pair chosen), one finding — the effort half would only repeat it.
    out.push({
      axis: "model",
      detail: `no agentType, model, or effort — add ${WORKFLOW_CHOICE_HELP}`,
    });
    return out;
  }
  if (model.kind === "missing" && effort.kind === "ok") {
    const fit = effort.value === "high" ? "sonnet" : "opus";
    out.push({
      axis: "model",
      detail: `missing model — effort:'${effort.value}' pairs only with model:'${fit}'; add model:'${fit}'`,
    });
    return out;
  }
  if (model.kind === "missing") {
    out.push({
      axis: "model",
      detail: `missing model — ${WORKFLOW_PAIR_HELP}`,
    });
  } else if (model.kind === "malformed") {
    out.push({
      axis: "model",
      detail:
        "model must be exactly one top-level literal 'sonnet' or 'opus' " +
        `(no nesting, spread, or computed key) — ${WORKFLOW_PAIR_HELP}`,
    });
  } else if (model.kind === "invalid") {
    out.push({
      axis: "model",
      detail: `model '${model.value}' is not allowed — only 'sonnet' (with effort:'high') or 'opus' (with effort:'medium')`,
    });
  }

  if (effort.kind === "missing" && model.kind === "ok") {
    const fit = WORKFLOW_ALLOWED_EFFORT[model.value];
    out.push({
      axis: "effort",
      detail: `missing effort — model:'${model.value}' pairs only with effort:'${fit}'; add effort:'${fit}'`,
    });
  } else if (effort.kind === "missing") {
    out.push({
      axis: "effort",
      detail: `missing effort — ${WORKFLOW_PAIR_HELP}`,
    });
  } else if (effort.kind === "malformed") {
    out.push({
      axis: "effort",
      detail:
        "effort must be exactly one top-level literal 'high' or 'medium' " +
        `(no nesting, spread, or computed key) — ${WORKFLOW_PAIR_HELP}`,
    });
  } else if (effort.kind === "invalid") {
    out.push({
      axis: "effort",
      detail: `effort '${effort.value}' is not allowed — only 'high' (with model:'sonnet') or 'medium' (with model:'opus')`,
    });
  }

  if (
    model.kind === "ok" &&
    effort.kind === "ok" &&
    WORKFLOW_ALLOWED_EFFORT[model.value] !== effort.value
  ) {
    out.push({
      axis: "effort",
      detail:
        `model:'${model.value}' with effort:'${effort.value}' is not an allowed pair — ` +
        `keep model:'${model.value}' and set effort:'${WORKFLOW_ALLOWED_EFFORT[model.value]}', ` +
        `or keep effort:'${effort.value}' and set model:'${MODEL_FOR_EFFORT[effort.value]}'`,
    });
  }

  return out;
}

// agentType names the pair; a model/effort written beside it is allowed only when it states
// the same pair (it would override the definition's frontmatter otherwise).
function agentTypeFindings(shape: CallShape): { axis: Axis; detail: string }[] {
  const type = classifyProp(
    shape.agentTypeValues,
    Object.keys(WORKFLOW_AGENT_TYPES),
    shape.unsound,
  );
  if (type.kind === "malformed") {
    return [
      {
        axis: "model",
        detail:
          "agentType must be exactly one top-level literal (no nesting, spread, or computed key) — " +
          WORKFLOW_CHOICE_HELP,
      },
    ];
  }
  if (type.kind !== "ok") {
    const seen = type.kind === "invalid" ? `'${type.value}'` : "missing";
    return [
      {
        axis: "model",
        detail: `agentType ${seen} is not allowed — ${WORKFLOW_CHOICE_HELP}`,
      },
    ];
  }
  const pair = WORKFLOW_AGENT_TYPES[type.value];
  if (pair === undefined) return [];
  const out: { axis: Axis; detail: string }[] = [];
  const model = classifyProp(shape.modelValues, ["sonnet", "opus"], false);
  const effort = classifyProp(shape.effortValues, ["high", "medium"], false);
  if (
    model.kind !== "missing" &&
    !(model.kind === "ok" && model.value === pair.model)
  ) {
    out.push({
      axis: "model",
      detail: `agentType:'${type.value}' runs on model:'${pair.model}' — drop model, or set model:'${pair.model}'`,
    });
  }
  if (
    effort.kind !== "missing" &&
    !(effort.kind === "ok" && effort.value === pair.effort)
  ) {
    out.push({
      axis: "effort",
      detail: `agentType:'${type.value}' runs at effort:'${pair.effort}' — drop effort, or set effort:'${pair.effort}'`,
    });
  }
  return out;
}

// The call resolves to the opus pair: agentType:'opus-medium', or (no agentType) model:'opus'.
function isOpusCall(shape: CallShape): boolean {
  if (shape.agentTypeValues.length > 0) {
    return (
      shape.agentTypeValues.length === 1 &&
      shape.agentTypeValues[0] === "opus-medium"
    );
  }
  return shape.modelValues.length === 1 && shape.modelValues[0] === "opus";
}

// Scan forward from `open` (just past "agent(") to find where this call's parens balance.
// Returns the index right after the matching close paren, plus the depth the scan ended at
// (0 means balanced) — mirrors the original inline scan exactly, including running to the end
// of the string with depth still > 0 when the call is unbalanced.
function scanBalancedParens(
  blanked: string,
  open: number,
): { index: number; depth: number } {
  let depth = 1;
  let i = open;
  while (i < blanked.length && depth > 0) {
    if (blanked[i] === "(") depth++;
    else if (blanked[i] === ")") depth--;
    i++;
  }
  return { index: i, depth };
}

function checkWorkflowScript(src: string): void {
  const blanked = blank(src);
  const findings: Finding[] = [];

  // --- script-level shape: the capability must be reachable for inspection at all --------
  const childWorkflow = /\bworkflow\s*\(/g;
  let child: RegExpExecArray | null;
  while ((child = childWorkflow.exec(blanked)) !== null) {
    findings.push({
      line: lineAt(src, child.index),
      axis: "shape",
      detail:
        "calls workflow(); a child workflow's agents cannot be verified — inline them",
    });
  }

  // A quoted computed key is blanked with ordinary strings, so inspect the original source
  // only where the corresponding bracket is executable code rather than a comment/string.
  const computedAgent = /\[\s*(['"])agent\1\s*\]/g;
  let computed: RegExpExecArray | null;
  while ((computed = computedAgent.exec(src)) !== null) {
    if (blanked[computed.index] !== "[") continue;
    findings.push({
      line: lineAt(src, computed.index),
      axis: "shape",
      detail: "computed access to the agent capability",
    });
  }

  // The capability must be called directly so its options can be verified. Any other
  // executable reference (assignment, property access, bind/call, etc.) could evade this gate.
  const agentRef = /\bagent\b/g;
  let ref: RegExpExecArray | null;
  while ((ref = agentRef.exec(blanked)) !== null) {
    if (/^\s*\(/.test(blanked.slice(ref.index + ref[0].length))) continue;
    findings.push({
      line: lineAt(src, ref.index),
      axis: "shape",
      detail: "agent referenced without calling it (alias or indirection)",
    });
  }

  // --- per-call axes: independent, so all of them are collected -------------------------
  let calls = 0;
  const re = /\bagent\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blanked)) !== null) {
    calls++;
    const line = lineAt(src, m.index);
    const open = m.index + m[0].length;
    const scan = scanBalancedParens(blanked, open);
    const i = scan.index;
    if (scan.depth !== 0) {
      // POISONED: the span has no end, so model/effort/resource cannot be located inside it.
      // Report the real defect once and suppress the three cascade findings it would produce.
      findings.push({
        line,
        axis: "syntax",
        detail: "agent( span is unbalanced and cannot be verified",
      });
      continue;
    }
    const originalSpan = src.slice(open, i);

    // BATCHED(model, effort): each property is checked independently of the other, so a call
    // missing/mismatching both is told about both at once rather than one axis at a time.
    const shape = scanCallOptions(src, blanked, open, i - 1);
    for (const finding of pairFindings(shape)) {
      findings.push({ line, ...finding });
    }
    const escalation = isOpusCall(shape)
      ? escalationProblem(originalSpan, "switch to agentType:'sonnet-high'")
      : null;
    if (escalation !== null) {
      findings.push({ line, axis: "escalation", detail: escalation });
    }

    const resource = resourceDeclarationResult(originalSpan);
    if (!resource.ok) {
      findings.push({
        line,
        axis: "resource",
        detail: shortResourceReason(resource.reason),
      });
    }
  }

  denyFindings(findings, calls);
}

// The resource class must be inspectable in the prompt. Returns the problem message for
// `problems`, or null when there is nothing to report (no prompt, or a prompt with a valid
// declaration).
function promptResourceProblem(prompt: string | null): string | null {
  if (prompt === null) {
    return `no inspectable prompt, so the resource class cannot be verified; require ${RESOURCE_DECLARATION_HELP}`;
  }
  const resource = resourceDeclarationResult(prompt);
  return resource.ok ? null : resource.reason;
}

// A payload `name` as the template literal `${name ?? "?"}` rendered it: a JSON value is a string,
// number, boolean, array (joined by commas) or plain object ("[object Object]"); absent/null is "?".
function displayName(name: unknown): string {
  if (name === undefined || name === null) return "?";
  if (typeof name === "string") return name;
  if (typeof name === "number" || typeof name === "boolean") return `${name}`;
  if (Array.isArray(name)) return name.join(",");
  return "[object Object]";
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  const tool = strAt(payload, "tool_name") ?? "";
  const ti = obj(at(payload, "tool_input"));

  if (tool === "Agent" || tool === "Task") {
    if (ti === undefined) {
      // FATAL: with no object there is no prompt and no model key, so no axis can be located.
      decidePre(
        "deny",
        "dispatch-contract: Agent/Task input is malformed and cannot be verified.",
      );
    }
    const problems: string[] = [];

    // subagent_type must be exactly one of the two allowed names. Nothing is injected any
    // more: fork, Explore, general-purpose, Plan, claude-code-guide, and every other name
    // (including a missing key) are denied identically.
    // subagent_type and model are ONE choice (which pair), so they yield at most one finding:
    // the observed values plus the smallest exact edit when one of them already fixes the pair,
    // and the choice criterion only when both are open. Nothing is injected: fork, Explore,
    // general-purpose, Plan, claude-code-guide, and a missing key are all "not a pair".
    const subagentType = strAt(ti, "subagent_type") ?? null;
    const model = strAt(ti, "model") ?? null;
    const typeFamily =
      subagentType === null ? null : (AGENT_TYPE_FAMILY[subagentType] ?? null);
    const modelFamily = model === null ? null : familyOf(model);
    const shownType = subagentType === null ? "missing" : `'${subagentType}'`;
    const shownModel = model === null ? "missing" : `'${model}'`;

    if (typeFamily !== null && model === null) {
      problems.push(
        `model is missing for subagent_type '${subagentType}' — add model:"${subagentType === "sonnet-high" ? "sonnet" : "opus"}"`,
      );
    } else if (
      typeFamily !== null &&
      model !== null &&
      !typeFamily.test(model)
    ) {
      const fix = subagentType === "sonnet-high" ? "sonnet" : "opus";
      problems.push(
        `model '${model}' does not match subagent_type '${subagentType}' — set model:"${fix}"` +
          (modelFamily === null
            ? ""
            : `, or switch to subagent_type:"${TYPE_FOR_FAMILY[modelFamily]}" if the task needs ${modelFamily}`),
      );
    } else if (typeFamily === null && modelFamily !== null) {
      problems.push(
        (subagentType === null
          ? "subagent_type is missing"
          : `subagent_type '${subagentType}' is not allowed`) +
          ` — set subagent_type:"${TYPE_FOR_FAMILY[modelFamily]}" (matches model '${model}')`,
      );
    } else if (typeFamily === null) {
      problems.push(
        `no allowed dispatch pair (subagent_type ${shownType}, model ${shownModel}) — use exactly one of: ` +
          `${AGENT_PAIR_HELP}. ${CHOOSE_PAIR}`,
      );
    }

    const prompt = strAt(ti, "prompt") ?? strAt(ti, "message") ?? null;
    const opusChosen =
      subagentType === "opus-medium" ||
      (typeFamily === null && modelFamily === "opus");
    const escalation = opusChosen
      ? escalationProblem(
          prompt,
          'dispatch subagent_type:"sonnet-high", model:"sonnet"',
        )
      : null;
    if (escalation !== null) problems.push(escalation);
    const resourceProblem = promptResourceProblem(prompt);
    if (resourceProblem !== null) problems.push(resourceProblem);

    // BATCHED(pair, escalation, resource): the pair, the escalation, and the resource class are independent — a caller violating
    // more than one of them is told about all of them at once, not denied once per axis.
    if (problems.length > 0) {
      decidePre(
        "deny",
        problems.length === 1
          ? `dispatch-contract: ${(problems[0] ?? "").replace(/\.$/, "")}.`
          : `dispatch-contract: ${problems.length} violations — fix them all, then re-invoke.\n` +
              problems.map((p) => `  - ${p}`).join("\n"),
      );
    }
    return;
  }

  if (tool !== "Workflow") return;

  if (ti === undefined) {
    // FATAL: with no object there is no script to scan, so no per-call axis exists yet.
    decidePre(
      "deny",
      "dispatch-contract: Workflow input is malformed and cannot be verified.",
    );
  }

  let src: string | null = strAt(ti, "script") ?? null;
  const scriptPath = strAt(ti, "scriptPath");
  if (src === null && scriptPath) {
    const r = await attempt(() => readFileSync(scriptPath, "utf8"));
    if (!r.ok) {
      // FATAL: the script never loaded, so there are no agent() calls to collect findings from.
      decidePre(
        "deny",
        `dispatch-contract: cannot read scriptPath '${scriptPath}' ` +
          `(${errorMessage(r.error)}) — agent models unverified.`,
      );
    }
    src = r.value;
  }
  if (src === null) {
    // FATAL: a named workflow has no inspectable source, so every axis is unknowable here.
    const workflowName = displayName(at(ti, "name"));
    decidePre(
      "deny",
      `dispatch-contract: named workflow '${workflowName}' — script not inspectable, ` +
        `agent models unverified. Inline an inspectable script with agent() calls on Sonnet.`,
    );
  }

  checkWorkflowScript(src);
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the hook itself failed, so no axis could be evaluated; fail closed with the one fix
  // (report the error) rather than guessing which checks would have fired.
  // FAIL CLOSED — an unverifiable dispatch is denied.
  decidePre(
    "deny",
    `dispatch-contract: hook error while verifying ` +
      `(${errorMessage(r.error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-dispatch-contract.ts, or re-issue the call so it names one ` +
      `of the two allowed pairs explicitly: ${AGENT_PAIR_HELP} (Agent/Task), or ` +
      `${WORKFLOW_PAIR_HELP} (Workflow).`,
  );
}
process.exit(0);
