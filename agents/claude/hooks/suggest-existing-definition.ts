// PostToolUse (Write|Edit|MultiEdit) — the moment a NEW function or type is written, check whether
// the repository already has one that does the same thing, and say so to the model.
//
// WHY A HOOK. Re-implementation happens when nobody searched, not when the search was poor:
// builders wrote kernels that already existed (firedancer, 2026-10-01). `rr exists`
// answers the question well, but only if asked; this asks for them at the one moment it matters.
//
// What it does: finds definitions in the inserted text that were not in the replaced text (Write:
// the whole file is new text), describes each by its doc comment + signature + first body lines,
// and runs the definition search (agents/retrieval-control/definitions.ts) excluding itself. Only a
// STRONG match (the same function, by the reranker's log-odds) is reported — a "maybe" would be
// noise on every edit. At most two new definitions per edit are checked.
//
// Channel: additionalContext (the model reads it; the edit already happened, so it is advice: use
// the existing one, or say why not). Fail-open: no ccc project, no catalog, no reranker, a timeout —
// any of these exits 0 silently. Never a gate.

import { relative } from "node:path";
import {
  findDefinitions,
  isTest,
  type Definition,
} from "../../retrieval-control/definitions.ts";
import { findRegisteredProject } from "../../retrieval-control/ccc-index.ts";
import { attempt } from "../../hooks/attempt.ts";
import { readStdinJson } from "./lib.ts";

const MAX_CHECKS = 2;
// Log-odds, per judge. Local: the duplicate probe scored 8.0, the unrelated helper 6.3. Jev: p>=0.97.
const HOOK_MIN = { local: 7.5, jev: 3.5 } as const;
const BUDGET_MS = 8_000; // the catalog is read as is (no rebuild inside an edit); recall + rerank ~1-3 s

// Definition headers by language: name in group 1. Line-start anchored so calls do not match.
// Top-level definitions only (no indentation): a closure or helper inside a function or a test
// body is local scaffolding, and flagging it was noise (2026-10-01: test helpers `card`/`want`
// "looked like" HostSnapshot and decideAdmission). Rust methods sit one level inside `impl`, so
// up to four spaces count there.
const HEADERS: Record<string, RegExp[]> = {
  jl: [
    /^function\s+(?:[\w.]+\.)?([\p{L}_][\p{L}\p{N}_!]*)\s*[({]/gmu,
    /^([\p{L}_][\p{L}\p{N}_!]*)\(.*\)\s*(?:where\s.*)?=(?!=)/gmu,
  ],
  py: [/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm],
  ts: [
    /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/gm,
    /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/gm,
  ],
  rs: [
    /^ {0,4}(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*[(<]/gm,
  ],
};
HEADERS.tsx = HEADERS.ts ?? [];
HEADERS.js = HEADERS.ts ?? [];
HEADERS.mjs = HEADERS.ts ?? [];

type NewDef = { name: string; text: string };

export function definitionsIn(text: string, ext: string): NewDef[] {
  const lines = text.split("\n");
  const out: NewDef[] = [];
  for (const re of HEADERS[ext] ?? []) {
    for (const m of text.matchAll(re)) {
      const name = m[1] ?? "";
      const line = text.slice(0, m.index).split("\n").length - 1;
      // The comment/docstring above, the header, and the first lines of the body: what a reader
      // would use to say what this does.
      const above = lines.slice(Math.max(0, line - 8), line).join("\n");
      const head = lines.slice(line, line + 12).join("\n");
      out.push({ name, text: `${above}\n${head}`.trim().slice(0, 900) });
    }
  }
  return out;
}

function insertedAndReplaced(input: Record<string, unknown>): {
  added: string;
  removed: string;
} {
  if (typeof input.content === "string")
    return { added: input.content, removed: "" };
  const edits = Array.isArray(input.edits)
    ? (input.edits as Record<string, unknown>[])
    : [input];
  return {
    added: edits
      .map((e) => (typeof e.new_string === "string" ? e.new_string : ""))
      .join("\n"),
    removed: edits
      .map((e) => (typeof e.old_string === "string" ? e.old_string : ""))
      .join("\n"),
  };
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  if (payload?.hook_event_name !== "PostToolUse") return;
  const input = (payload.tool_input ?? {}) as Record<string, unknown>;
  const file = typeof input.file_path === "string" ? input.file_path : "";
  const ext = file.split(".").at(-1) ?? "";
  // A test file defines fixtures and helpers by design; reusing them is not the point.
  if (!HEADERS[ext] || isTest({ file })) return;
  const project = findRegisteredProject(
    file.slice(0, file.lastIndexOf("/")) || ".",
  );
  if (!project) return;

  const { added, removed } = insertedAndReplaced(input);
  const before = new Set(definitionsIn(removed, ext).map((d) => d.name));
  const fresh = definitionsIn(added, ext)
    .filter((d) => !before.has(d.name))
    .slice(0, MAX_CHECKS);
  if (fresh.length === 0) return;

  const rel = relative(project, file);
  const findings: string[] = [];
  // One budget for the whole check: past it, say nothing rather than stall the edit.
  const deadline = Temporal.Now.instant().epochMilliseconds + BUDGET_MS;
  for (const d of fresh) {
    if (Temporal.Now.instant().epochMilliseconds > deadline) break;
    // Its own file is skipped: the catalog may already hold the new text, and sibling helpers
    // written in the same edit are related by construction, not duplicates.
    const self = (x: Definition) => x.file === rel;
    const a = await findDefinitions(project, d.text, 3, self, false);
    const top = a.cards[0];
    // Stricter than the route's "strong": here the query is the new CODE, not a described need, and
    // the judge loosens on code-vs-code (2026-10-01: an argv helper "looked like" a directory
    // lister at local 6.3). A wrong interruption costs more than a missed one inside an edit.
    if (!top || !a.reranked || top.score < HOOK_MIN[a.judge === "jev" ? "jev" : "local"]) continue;
    findings.push(
      `- new \`${d.name}\` looks like existing \`${top.name}\` (${top.file}:${top.start}, ${a.judge} score ${top.score.toFixed(1)}): ` +
        `${top.signature.slice(0, 140)}`,
    );
  }
  if (findings.length === 0) return;
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "existing-definition check (rr exists): the definition you just wrote may duplicate one " +
          "that already exists.\n" +
          findings.join("\n") +
          "\nRead it. If it does what you need, use it and remove the new one; if not, keep yours and say in one " +
          "line what differs.",
      },
    }),
  );
}

// The whole hook is bounded: a cold reranker or a busy daemon must not hold an edit hostage.
// Guarded so the tests can import definitionsIn without reading stdin.
if (import.meta.main) {
  await Promise.race([attempt(main), Bun.sleep(BUDGET_MS + 4_000)]);
  process.exit(0);
}
