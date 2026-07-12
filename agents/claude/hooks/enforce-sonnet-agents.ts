#!/usr/bin/env bun
// PreToolUse gate — every spawned agent is pinned to Sonnet (no exceptions).
// matcher: Agent|Task|Workflow   (settings.json: run.sh --fail-closed)
//
// Policy (user directive 2026-07-11):
//   - Agent/Task: model omitted        -> allow + inject model:'sonnet' via updatedInput
//                 (an explicit call param beats an agent definition's pinned frontmatter model)
//                 model not sonnet     -> deny (the reason doubles as the fix instruction)
//                 subagent_type 'fork' -> pass (forks inherit the parent model by design)
//   - Workflow:   every agent() call in the script must carry a LITERAL model:'sonnet',
//                 else deny. Unverifiable (named workflow / child workflow() / unreadable
//                 scriptPath) -> ask, deferring to the user.
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
      "sonnet-agent policy: script calls workflow() — child workflow agents cannot be " +
        "verified here. Confirm every agent() in the child also passes model:'sonnet'.",
    );
  }

  const bad: number[] = [];
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
  }

  if (bad.length > 0) {
    decidePre(
      "deny",
      `sonnet-agent policy: agent() call(s) missing model:'sonnet' at line(s) ` +
        `${[...new Set(bad)].join(", ")}. Every agent() in a Workflow script MUST pass ` +
        `{model:'sonnet'} literally (all subagents run on Sonnet — no exceptions). ` +
        `Fix the script and re-invoke.`,
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
      decidePre(
        "deny",
        `sonnet-agent policy: model '${model}' is not allowed — every subagent runs on ` +
          `Sonnet. Re-issue this call with model:'sonnet' or omit model.`,
      );
    }
    if (!model) {
      decidePre("allow", "sonnet-agent policy: injected model:'sonnet'", {
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
        `sonnet-agent policy: cannot read scriptPath '${ti.scriptPath}' ` +
          `(${e instanceof Error ? e.message : String(e)}) — agent models unverified.`,
      );
    }
  }
  if (src === null) {
    decidePre(
      "ask",
      `sonnet-agent policy: named workflow '${ti.name ?? "?"}' — script not inspectable, ` +
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
    `sonnet-agent policy: hook error while verifying ` +
      `(${e instanceof Error ? e.message : String(e)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-sonnet-agents.ts or re-issue with model:'sonnet'.`,
  );
}
