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
// FAIL CLOSED: any error (bad payload, fs error) -> deny. run.sh also denies when bun
// itself is missing.

import { readFileSync } from "node:fs";
import {
  RESOURCE_DECLARATION_HELP,
  resourceDeclarationResult,
} from "../../resource-control/lib/dispatch-declaration.ts";
import { decidePre, readStdinJson } from "./lib.ts";

const SONNET = /(?:^|[-_])sonnet(?:$|[-_])/i;
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
    if (m[1].trim() !== "" && m[2].trim() !== "") return true;
  }
  return false;
}

// Blank string/template/comment interiors, preserving length and newlines, so that
// (a) brackets inside them cannot break the call-span scan and (b) prompt text cannot
// spoof `agent(` / `model:`.
function blank(s: string): string {
  const chars = [...s];
  let st: "code" | "s1" | "s2" | "tpl" | "line" | "block" = "code";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const n = chars[i + 1];
    if (st === "code") {
      if (c === "'") st = "s1";
      else if (c === '"') st = "s2";
      else if (c === "`") st = "tpl";
      else if (c === "/" && n === "/") {
        st = "line";
        chars[i] = " ";
      } else if (c === "/" && n === "*") {
        st = "block";
        chars[i] = " ";
      }
    } else if (st === "s1" || st === "s2" || st === "tpl") {
      const q = st === "s1" ? "'" : st === "s2" ? '"' : "`";
      if (c === "\\") {
        chars[i] = " ";
        if (n !== undefined && n !== "\n") {
          chars[i + 1] = " ";
          i++;
        }
      } else if (c === q) st = "code";
      else if (c !== "\n") chars[i] = " ";
    } else if (st === "line") {
      if (c === "\n") st = "code";
      else chars[i] = " ";
    } else {
      // block comment
      if (c === "*" && n === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        st = "code";
      } else if (c !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

type Span = { start: number; end: number };

function trimSpan(src: string, start: number, end: number): Span {
  while (start < end && /\s/.test(src[start])) start++;
  while (end > start && /\s/.test(src[end - 1])) end--;
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
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) return null;
      depth--;
    } else if (c === "," && depth === 0) {
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

function checkWorkflowScript(src: string): void {
  const blanked = blank(src);

  if (/\bworkflow\s*\(/.test(blanked)) {
    decidePre(
      "deny",
      "dispatch-contract: script calls workflow() and its child agents cannot be verified. " +
        "Inline every executor as an inspectable agent() call with model:'sonnet'.",
    );
  }

  // A quoted computed key is blanked with ordinary strings, so inspect the original source
  // only where the corresponding bracket is executable code rather than a comment/string.
  const computedAgent = /\[\s*(['"])agent\1\s*\]/g;
  let computed: RegExpExecArray | null;
  while ((computed = computedAgent.exec(src)) !== null) {
    if (blanked[computed.index] !== "[") continue;
    decidePre(
      "deny",
      "dispatch-contract: Workflow agent capability must be a direct, inspectable " +
        "agent(prompt, {model:'sonnet'}) call; computed access is denied.",
    );
  }

  // The capability must be called directly so its options can be verified. Any other
  // executable reference (assignment, property access, bind/call, etc.) could evade this gate.
  const agentRef = /\bagent\b/g;
  let ref: RegExpExecArray | null;
  while ((ref = agentRef.exec(blanked)) !== null) {
    if (/^\s*\(/.test(blanked.slice(ref.index + ref[0].length))) continue;
    decidePre(
      "deny",
      "dispatch-contract: Workflow agent capability must be a direct, inspectable " +
        "agent(prompt, {model:'sonnet'}) call; aliases and indirection are denied.",
    );
  }

  const bad: number[] = [];
  const badEffort: number[] = [];
  const badResource: number[] = [];
  const re = /\bagent\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blanked)) !== null) {
    const open = m.index + m[0].length;
    let depth = 1;
    let i = open;
    while (i < blanked.length && depth > 0) {
      if (blanked[i] === "(") depth++;
      else if (blanked[i] === ")") depth--;
      i++;
    }
    if (depth !== 0) {
      bad.push(src.slice(0, m.index).split("\n").length);
      continue;
    }
    const span = blanked.slice(open, i);
    const originalSpan = src.slice(open, i);
    if (!directWorkflowModel(src, blanked, open, i - 1))
      bad.push(src.slice(0, m.index).split("\n").length);
    if (!resourceDeclarationResult(originalSpan).ok) {
      badResource.push(src.slice(0, m.index).split("\n").length);
    }

    // A literal effort:'low' on this call needs a same-span LOW-EFFORT(<stage>): <reason>
    // declaration (see orchestrating-agents/SKILL.md, "Durable role topology"). FAIL-OPEN
    // BY DESIGN: if the effort value is not a quoted literal — a variable, a computed
    // expression, a template interpolation — this loop does not evaluate it and the call
    // passes with no declaration. This gate targets careless literals, not obfuscation.
    let low = false;
    const ere = /\beffort\s*:\s*/g;
    let em: RegExpExecArray | null;
    while ((em = ere.exec(span)) !== null) {
      const vpos = open + em.index + em[0].length;
      if (/^['"`]low['"`]/.test(src.slice(vpos, vpos + 5))) {
        low = true;
        break;
      }
    }
    if (low && !hasLowEffortDeclaration(originalSpan)) {
      badEffort.push(src.slice(0, m.index).split("\n").length);
    }
  }

  if (bad.length > 0) {
    decidePre(
      "deny",
      `dispatch-contract: agent() call(s) missing model:'sonnet' at line(s) ` +
        `${[...new Set(bad)].join(", ")}. Every agent() in a Workflow script MUST have ` +
        `exactly one literal {model:'sonnet'} property. Fix the script and re-invoke.`,
    );
  }

  if (badEffort.length > 0) {
    decidePre(
      "deny",
      `dispatch-contract: agent() call(s) pass a literal effort:'low' without a ` +
        `declaration at line(s) ${[...new Set(badEffort)].join(", ")}. Dropping effort ` +
        `below the model's documented default needs a declaration inside that SAME ` +
        `agent() call (a prompt string or a comment both count): ` +
        `"LOW-EFFORT(<stage>): <why this stage is not intelligence-sensitive>" ` +
        `(two non-empty fields). Omit effort to inherit the session default, or add the ` +
        `declaration and re-invoke.`,
    );
  }

  if (badResource.length > 0) {
    decidePre(
      "deny",
      `dispatch-contract: agent() call(s) lack exactly one valid same-call resource ` +
        `declaration at line(s) ${[...new Set(badResource)].join(", ")}. Require ` +
        `${RESOURCE_DECLARATION_HELP}.`,
    );
  }
}

function main(): void {
  const payload = readStdinJson();
  const tool: string = payload?.tool_name ?? "";
  const ti = payload?.tool_input;

  if (tool === "Agent" || tool === "Task") {
    if (ti === null || typeof ti !== "object" || Array.isArray(ti)) {
      decidePre(
        "deny",
        "dispatch-contract: Agent/Task input is malformed and cannot be verified.",
      );
    }
    if (ti.subagent_type === "fork") {
      decidePre(
        "deny",
        "dispatch-contract: fork is not allowed; dispatch an Agent or Task on Sonnet.",
      );
    }
    const prompt =
      typeof ti.prompt === "string"
        ? ti.prompt
        : typeof ti.message === "string"
          ? ti.message
          : null;
    if (prompt === null) {
      decidePre(
        "deny",
        `dispatch-contract: Agent/Task has no inspectable prompt; require ${RESOURCE_DECLARATION_HELP}.`,
      );
    }
    const resource = resourceDeclarationResult(prompt);
    if (!resource.ok) {
      decidePre("deny", `dispatch-contract: ${resource.reason}.`);
    }
    if (!("model" in ti)) {
      decidePre("allow", "dispatch-contract: injected model:'sonnet'", {
        updatedInput: { ...ti, model: "sonnet" },
      });
    }
    if (typeof ti.model !== "string" || !SONNET.test(ti.model)) {
      decidePre(
        "deny",
        `dispatch-contract: model '${String(ti.model)}' is not allowed — every executor runs on Sonnet. ` +
          "Re-issue this call with model:'sonnet' or omit model.",
      );
    }
    return;
  }

  if (tool !== "Workflow") return;

  if (ti === null || typeof ti !== "object" || Array.isArray(ti)) {
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
      decidePre(
        "deny",
        `dispatch-contract: cannot read scriptPath '${ti.scriptPath}' ` +
          `(${e instanceof Error ? e.message : String(e)}) — agent models unverified.`,
      );
    }
  }
  if (src === null) {
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
