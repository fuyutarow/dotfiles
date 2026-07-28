#!/usr/bin/env bun
// PreToolUse gate — every spawned agent is pinned to Sonnet (no exceptions).
// matcher: Agent|Task|Workflow   (settings.json: run.sh --fail-closed)
//
// Policy (user directive 2026-07-11; escalation clause added 2026-07-25):
//   - Agent/Task: model omitted        -> allow + inject model:'sonnet' via updatedInput
//                 (an explicit call param beats an agent definition's pinned frontmatter model)
//                 model 'fable'        -> allow ONLY with a declared escalation in the prompt:
//                   ESCALATION(fable): <target> | <why sonnet is insufficient> | <cost estimate>
//                   Three non-empty fields required. The declaration lands in the transcript, so
//                   the escalation is auditable after the fact — that is the whole point of it.
//                 model not sonnet     -> deny (the reason doubles as the fix instruction)
//                 subagent_type 'fork' -> pass (forks inherit the parent model by design)
//
// Why the escalation clause exists: Anthropic's own model guidance (2026-07) makes Opus the
// default and reserves the Fable tier for the highest-capability workloads. The house roster
// mirrors that — Opus directs, Sonnet works, Fable is the named single escalation. Fan-out is
// where cost explodes, so Workflow stays Sonnet-only: an escalation is always ONE named unit.
//
// This hook is the SINGLE home of the policy. `CLAUDE_CODE_SUBAGENT_MODEL` was removed from
// settings.json on 2026-07-25 because it outranks the per-invocation model parameter (docs:
// code.claude.com/docs/en/sub-agents, resolution order), so leaving it set would silently
// override any escalation while this hook reported it allowed.
//
// GOTCHA (measured 2026-07-25): settings.json `env` is read ONCE at session start. Deleting the
// key does not disarm it mid-session — a declared escalation passes this hook and still spawns
// Sonnet, and the subagent truthfully reports itself as Sonnet. Verified by `env | grep`: the
// var was absent from disk and still present in the running process. The escalation tier is
// live only from the NEXT session start. Symptom-index this before blaming the hook.
//   - Workflow:   every agent() call in the script must carry a LITERAL model:'sonnet',
//                 else deny. Unverifiable (named workflow / child workflow() / unreadable
//                 scriptPath) -> ask, deferring to the user.
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
import { decidePre, readStdinJson } from "./lib.ts";

const SONNET = /sonnet/i;
const FABLE = /fable/i;

// ESCALATION(fable): <target> | <why sonnet is insufficient> | <cost estimate>
// All three fields must be non-empty; a bare marker is not a declaration.
function hasEscalationDeclaration(prompt: unknown): boolean {
  if (typeof prompt !== "string") return false;
  for (const line of prompt.split("\n")) {
    const m = /ESCALATION\s*\(\s*fable\s*\)\s*:(.*)$/i.exec(line);
    if (m === null) continue;
    const fields = m[1].split("|").map((f) => f.trim());
    if (fields.length >= 3 && fields.slice(0, 3).every((f) => f !== ""))
      return true;
  }
  return false;
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

function checkWorkflowScript(src: string): void {
  const blanked = blank(src);

  if (/\bworkflow\s*\(/.test(blanked)) {
    decidePre(
      "ask",
      "dispatch-contract: script calls workflow() — child workflow agents cannot be " +
        "verified here. Confirm every agent() in the child also passes model:'sonnet'.",
    );
  }

  const bad: number[] = [];
  const badEffort: number[] = [];
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
    const span = blanked.slice(open, i);
    // Any model: key in the span whose ORIGINAL-source value is a 'sonnet' literal passes.
    let ok = false;
    const kre = /\bmodel\s*:\s*/g;
    let km: RegExpExecArray | null;
    while ((km = kre.exec(span)) !== null) {
      const vpos = open + km.index + km[0].length;
      if (/^['"`]sonnet['"`]/.test(src.slice(vpos, vpos + 8))) {
        ok = true;
        break;
      }
    }
    if (!ok) bad.push(src.slice(0, m.index).split("\n").length);

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
    if (low && !hasLowEffortDeclaration(src.slice(open, i))) {
      badEffort.push(src.slice(0, m.index).split("\n").length);
    }
  }

  if (bad.length > 0) {
    decidePre(
      "deny",
      `dispatch-contract: agent() call(s) missing model:'sonnet' at line(s) ` +
        `${[...new Set(bad)].join(", ")}. Every agent() in a Workflow script MUST pass ` +
        `{model:'sonnet'} literally — fan-out is Sonnet-only, with no escalation clause, ` +
        `because a fleet is exactly where an escalation stops being one named unit. ` +
        `Need the Fable tier? Issue it as a SINGLE Agent call with a declared ESCALATION. ` +
        `Fix the script and re-invoke.`,
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
}

function main(): void {
  const payload = readStdinJson();
  const tool: string = payload?.tool_name ?? "";
  const ti = payload?.tool_input ?? {};

  if (tool === "Agent" || tool === "Task") {
    if (ti.subagent_type === "fork") return; // forks inherit the parent model by design
    const model = ti.model;
    if (model && !SONNET.test(model)) {
      if (FABLE.test(model)) {
        if (hasEscalationDeclaration(ti.prompt)) return; // declared escalation — allowed
        decidePre(
          "deny",
          `dispatch-contract: model '${model}' is the escalation tier and needs a declared ` +
            `escalation. Put this line in the prompt, then re-issue: ` +
            `"ESCALATION(fable): <target> | <why sonnet is insufficient> | <cost estimate>" ` +
            `(three non-empty fields). Undeclared heavy work goes to Sonnet.`,
        );
      }
      decidePre(
        "deny",
        `dispatch-contract: model '${model}' is not allowed — subagents run on Sonnet, and ` +
          `the only escalation tier is Fable (declared, see the hook header). ` +
          `Re-issue this call with model:'sonnet' or omit model.`,
      );
    }
    if (!model) {
      decidePre("allow", "dispatch-contract: injected model:'sonnet'", {
        updatedInput: { ...ti, model: "sonnet" },
      });
    }
    return; // already sonnet
  }

  if (tool !== "Workflow") return;

  let src: string | null = typeof ti.script === "string" ? ti.script : null;
  if (src === null && ti.scriptPath) {
    try {
      src = readFileSync(ti.scriptPath, "utf8");
    } catch (e) {
      decidePre(
        "ask",
        `dispatch-contract: cannot read scriptPath '${ti.scriptPath}' ` +
          `(${e instanceof Error ? e.message : String(e)}) — agent models unverified.`,
      );
    }
  }
  if (src === null) {
    decidePre(
      "ask",
      `dispatch-contract: named workflow '${ti.name ?? "?"}' — script not inspectable, ` +
        `agent models unverified. Confirm its agents run on Sonnet.`,
    );
  }

  checkWorkflowScript(src);
}

try {
  main();
  process.exit(0);
} catch (e) {
  // FAIL CLOSED — the policy is "no exceptions", so an unverifiable call is a denied call.
  decidePre(
    "deny",
    `dispatch-contract: hook error while verifying ` +
      `(${e instanceof Error ? e.message : String(e)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-dispatch-contract.ts, or re-issue the call so it satisfies ` +
      `the contract on BOTH axes: model:'sonnet' (bearer) and no undeclared effort:'low' (effort).`,
  );
}
