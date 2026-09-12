// PreToolUse gate — every executor runs on Sonnet.
// matcher: Agent|Task|Workflow   (settings.json: run.sh --fail-closed)
//
// Policy:
//   - Agent/Task: omitted model -> inject model:'sonnet'; only an explicit Sonnet passes.
//                 Forks and every other model are denied.
//   - Every dispatch declares exactly one resource class. NONCOMPUTE excludes numerical
//                 experiments, benchmarks, resident services, parallel tests, and nested
//                 fanout. Compute work points to an absolute admitted envelope and may run
//                 commands only through agent-resource-run.
//   - Workflow: every agent() call has exactly one literal model:'sonnet'. Named/child/
//               unreadable workflows are denied because they cannot be inspected.
//   - The role binding lives in orchestrating-agents/references/model-roster.md; this hook
//     enforces it without a bypass.
//   - Workflow effort: a literal effort:'low' needs a same-call declaration:
//                 A LITERAL effort:'low' on an agent() call also needs a same-call
//                 declaration (see orchestrating-agents/SKILL.md, "Durable role topology"):
//                   LOW-EFFORT(<stage>): <why this stage is not intelligence-sensitive>
//                 Two non-empty fields required. medium/high/xhigh/max and an ABSENT effort
//                 key all pass with no declaration — absence inherits the session default,
//                 which is normal and never denied.
//
// The verifier blanks strings/templates/comments length-preservingly, then walks agent()
// call spans by paren depth; model values are matched against the ORIGINAL source, so a
// "model:'sonnet'" inside a prompt string cannot fake a pass.
//
// DIAGNOSTICS — batched, not first-error-wins. The three per-call axes (model, effort,
// resource) are INDEPENDENT: none of them consumes another's output, so there is nothing to
// "recover" into and every violation in a script is collected and emitted in ONE deny,
// grouped by the agent() call that owns it. A caller therefore sees the whole fix list once
// instead of being denied N times in a row. Two borrowings from compiler diagnostics:
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
import { decidePre, readStdinJson } from "./lib.ts";

const SONNET = /(?:^|[-_])sonnet(?:$|[-_])/i;

// ---------------------------------------------------------------------------
// Batched diagnostics
// ---------------------------------------------------------------------------

// "shape" is script-level (the capability was not called directly); the rest are per-call.
type Axis = "shape" | "syntax" | "model" | "effort" | "resource";
type Finding = { line: number; axis: Axis; detail: string };

// Report order for the HOW TO FIX block: unsound-model first, then unparseable, then axes.
const AXIS_ORDER: Axis[] = ["shape", "syntax", "model", "effort", "resource"];

// A flood costs the reader more than it informs. Cap the listing and SAY it was capped.
const MAX_REPORTED_LINES = 20;

const AXIS_HINT: Record<Axis, string> = {
  shape:
    "shape    — every executor must be a direct, inspectable agent(prompt, {model:'sonnet'}) call. " +
    "Remove aliases, computed access, and child workflow() calls, and inline the child's agents.",
  syntax:
    "syntax   — this agent( span never closes, so nothing about it can be verified. " +
    "Fix the parentheses first; its other axes were NOT checked.",
  model:
    "model    — exactly one literal {model:'sonnet'} property, top-level in the options object " +
    "(no nesting, no spread, no computed key).",
  effort:
    "effort   — omit effort to inherit the session default, or declare inside the SAME agent() call " +
    "(a prompt string or a comment both count): " +
    '"LOW-EFFORT(<stage>): <why this stage is not intelligence-sensitive>" (two non-empty fields).',
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

  // BATCHED(shape, syntax, model, effort, resource): none of these consumes another's output,
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

// LOW-EFFORT(<stage>): <reason>
// Two fields, not three — modeled on hasEscalationDeclaration() above. Both the stage
// (inside the parens) and the reason (after the colon) must be non-empty; a bare marker
// is not a declaration. Searched line-by-line against whatever text is handed in — callers
// pass the ORIGINAL (un-blanked) text of a single agent() call span, so a declaration
// living in a prompt string or a comment counts, but one outside that span does not.
function hasLowEffortDeclaration(text: string): boolean {
  for (const line of text.split("\n")) {
    const m = /LOW-EFFORT\s*\(([^)]*)\)\s*:(.*)$/i.exec(line);
    if (m === null) continue;
    const stage = m[1];
    const reason = m[2];
    if (stage === undefined || reason === undefined) continue;
    if (stage.trim() !== "" && reason.trim() !== "") return true;
  }
  return false;
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
  const q = st === "s1" ? "'" : st === "s2" ? '"' : "`";
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
  const chars = [...s];
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

function directWorkflowModel(
  src: string,
  blanked: string,
  start: number,
  end: number,
): boolean {
  const args = directSegments(blanked, start, end);
  if (args === null || args.length !== 2) return false;

  const options = args[1];
  if (options === undefined) return false;
  if (blanked[options.start] !== "{") return false;
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
  )
    return false;

  const properties = directSegments(blanked, options.start + 1, close - 1);
  if (properties === null) return false;
  let models = 0;
  let sonnetLiteral = false;
  for (const property of properties) {
    const text = blanked.slice(property.start, property.end);
    // Spread and computed keys can overwrite a preceding literal model at runtime.
    if (text.startsWith("...") || text.startsWith("[")) return false;
    const key = /^model\s*:\s*/.exec(text);
    if (key === null) continue;
    models++;
    const valueStart = property.start + key[0].length;
    sonnetLiteral = /^(['"])sonnet\1/.test(src.slice(valueStart));
  }
  return models === 1 && sonnetLiteral;
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
    const span = blanked.slice(open, i);
    const originalSpan = src.slice(open, i);

    if (!directWorkflowModel(src, blanked, open, i - 1)) {
      findings.push({ line, axis: "model", detail: "missing model:'sonnet'" });
    }

    const resource = resourceDeclarationResult(originalSpan);
    if (!resource.ok) {
      findings.push({
        line,
        axis: "resource",
        detail: shortResourceReason(resource.reason),
      });
    }

    // A literal effort:'low' on this call needs a same-span LOW-EFFORT(<stage>): <reason>
    // declaration (see orchestrating-agents/SKILL.md, "Durable role topology"). FAIL-OPEN
    // BY DESIGN: if the effort value is not a quoted literal — a variable, a computed
    // expression, a template interpolation — this loop does not evaluate it and the call
    // passes with no declaration. This gate targets careless literals, not obfuscation.
    const ere = /\beffort\s*:\s*/g;
    const low = [...span.matchAll(ere)].some((em) => {
      const vpos = open + em.index + em[0].length;
      return /^['"`]low['"`]/.test(src.slice(vpos, vpos + 5));
    });
    if (low && !hasLowEffortDeclaration(originalSpan)) {
      findings.push({
        line,
        axis: "effort",
        detail:
          "literal effort:'low' with no LOW-EFFORT declaration in this call",
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

function main(): void {
  const payload = readStdinJson();
  const tool: string = payload?.tool_name ?? "";
  const ti = payload?.tool_input;

  if (tool === "Agent" || tool === "Task") {
    if (ti === null || typeof ti !== "object" || Array.isArray(ti)) {
      // FATAL: with no object there is no prompt and no model key, so no axis can be located.
      decidePre(
        "deny",
        "dispatch-contract: Agent/Task input is malformed and cannot be verified.",
      );
    }
    const problems: string[] = [];

    if (ti.subagent_type === "fork") {
      problems.push(
        "subagent_type 'fork' is not allowed — dispatch an Agent or Task on Sonnet",
      );
    }

    const prompt =
      typeof ti.prompt === "string"
        ? ti.prompt
        : typeof ti.message === "string"
          ? ti.message
          : null;
    const resourceProblem = promptResourceProblem(prompt);
    if (resourceProblem !== null) problems.push(resourceProblem);

    // An ABSENT model is not a violation — it is injected below. Only an explicit one is judged.
    if (
      "model" in ti &&
      (typeof ti.model !== "string" || !SONNET.test(ti.model))
    ) {
      problems.push(
        `model '${String(ti.model)}' is not allowed — every executor runs on Sonnet; ` +
          "re-issue with model:'sonnet' or omit model",
      );
    }

    // BATCHED(fork, resource, model): subagent shape, resource class and model are independent
    // of one another, so a caller violating two of them is told both at once, not denied twice.
    if (problems.length > 0) {
      decidePre(
        "deny",
        problems.length === 1
          ? `dispatch-contract: ${problems[0]}.`
          : `dispatch-contract: ${problems.length} violations — fix them all, then re-invoke.\n` +
              problems.map((p) => `  - ${p}`).join("\n"),
      );
    }

    if (!("model" in ti)) {
      decidePre("allow", "dispatch-contract: injected model:'sonnet'", {
        updatedInput: { ...ti, model: "sonnet" },
      });
    }
    return;
  }

  if (tool !== "Workflow") return;

  if (ti === null || typeof ti !== "object" || Array.isArray(ti)) {
    // FATAL: with no object there is no script to scan, so no per-call axis exists yet.
    decidePre(
      "deny",
      "dispatch-contract: Workflow input is malformed and cannot be verified.",
    );
  }

  let src: string | null = typeof ti.script === "string" ? ti.script : null;
  if (src === null && ti.scriptPath) {
    try {
      src = readFileSync(ti.scriptPath, "utf8");
    } catch (e) {
      // FATAL: the script never loaded, so there are no agent() calls to collect findings from.
      decidePre(
        "deny",
        `dispatch-contract: cannot read scriptPath '${ti.scriptPath}' ` +
          `(${e instanceof Error ? e.message : String(e)}) — agent models unverified.`,
      );
    }
  }
  if (src === null) {
    // FATAL: a named workflow has no inspectable source, so every axis is unknowable here.
    decidePre(
      "deny",
      `dispatch-contract: named workflow '${ti.name ?? "?"}' — script not inspectable, ` +
        `agent models unverified. Inline an inspectable script with agent() calls on Sonnet.`,
    );
  }

  checkWorkflowScript(src);
}

try {
  main();
  process.exit(0);
} catch (e) {
  // FAIL CLOSED — an unverifiable dispatch is denied.
  decidePre(
    "deny",
    `dispatch-contract: hook error while verifying ` +
      `(${e instanceof Error ? e.message : String(e)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-dispatch-contract.ts, or re-issue the call so it satisfies ` +
      `the contract on BOTH axes: model:'sonnet' (executor) and no undeclared effort:'low' (effort).`,
  );
}
