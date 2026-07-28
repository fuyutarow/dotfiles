#!/usr/bin/env bun
// PostToolUse hook (matcher: Write|Edit) — unanchored-registration guard, firedancer only.
//
// WHY this hook exists (measured 2026-07-25, firedancer): of 16 建造 registrations since
// 2026-07-23, 0 cited a parent-goal ID; of 14 事前登録, 0 cited a theorem ID (57 exist).
// Existing hooks check WHAT gets said (4 Stop guards) or an Agent-tool model (1 PreToolUse);
// none check WHAT gets decided to build next. This one does, for the three registration
// surfaces named by the project's own gate (docs/手置きの台帳.md 発射の関門, 2026-07-24):
// a registration needs to show its lineage, not just its number.
//
// SCOPE — two independent gates, both required:
//   1. REPO GATE   — the write must resolve (via tool_input.file_path, falling back to
//      payload.cwd for a relative path) under /home/fuyu/Workspace/firedancer. Any other
//      repo -> silent no-op; this hook must never interfere with another project.
//   2. PATH GATE   — the resolved path's basename/parent must match one of:
//        **/PREREG*.md        (basename starts with PREREG, ends .md)
//        **/*登録案*.md        (basename contains 登録案, ends .md)
//        firedancer/RESULTS.md (basename RESULTS.md, immediate parent dir named firedancer)
//
// WHAT IS CHECKED — the content of THIS write, not the file's full history. For Write that
// is tool_input.content (Write replaces the whole file); for Edit it is tool_input.new_string
// (the text actually inserted). This is deliberate, not an oversight: reading the full file
// back from disk would make the check for RESULTS.md nearly always pass, since the ledger
// already contains file:line citations and parent-goal IDs SOMEWHERE from past entries —
// that would defeat the point (catching a NEW unanchored entry). It also means a routine
// small edit (typo fix, one-line addendum) can trip the warning; that is exactly why this
// is a WARN, never a BLOCK (spec's own reasoning: stopping minor RESULTS.md edits would
// stall work).
//
//   1. 親目標のID  — one of POC-NORTHSTAR-\d+ / RESOURCE-EFFICIENCY-\d+ / SELF-SCALING-\d+ /
//      ALL-DIGITAL-\d+ / STOP-CERT-\d+ / EXPONENT-\d+ / THROUGHPUT-\d+ / GAMMA-FREE-\d+
//      (正本: docs/目標台帳.md).
//   2. 継承する判定 — at least one `file:line` citation (e.g. RESULTS.md:1511,
//      docs/D2607_18:133).
//   3. 定理の照合   — at least one `T\d+` token, OR an explicit "no theorem applies" —
//      "定理" and ("該当なし" or "no-hit") both present.
//
// Safety:
//   0. FAIL OPEN  — any error, unresolvable path, or unreadable payload -> exit 0, silent.
//   1. NEVER BLOCK — this hook only ever emits a PostToolUse additionalContext/systemMessage
//      warning and exits 0. It never exits 2. Mirrors the existing Stop guards' warn-only
//      contract (detect-groundless-claim.ts) — the reason is explicit in the spec: blocking
//      minor RESULTS.md edits would stall work.
//   2. STATELESS  — no sentinel/dedup; every qualifying write is checked independently. A
//      long multi-edit registration will keep warning until all three are present, which is
//      intended (a Stop-hook-style nudge, not a one-shot notice).

import { isAbsolute, resolve, sep } from "node:path";
import { readStdinJson } from "./lib.ts";

const REPO_ROOT = "/home/fuyu/Workspace/firedancer";

// --- path resolution & gating --------------------------------------------------------

// Resolve tool_input.file_path to an absolute path. Relative paths are resolved against
// payload.cwd (the session's cwd, as documented for tool events); if neither yields an
// absolute path, resolution fails and the caller fails open (never guesses the repo).
function resolveFilePath(payload: any): string | null {
  const fp = payload?.tool_input?.file_path;
  if (typeof fp !== "string" || fp === "") return null;
  if (isAbsolute(fp)) return resolve(fp);
  const cwd = payload?.cwd;
  if (typeof cwd !== "string" || cwd === "") return null;
  return resolve(cwd, fp);
}

function inFiredancerRepo(absPath: string): boolean {
  return absPath === REPO_ROOT || absPath.startsWith(REPO_ROOT + sep);
}

function basename(p: string): string {
  const parts = p.split(sep);
  return parts[parts.length - 1] ?? "";
}

function parentDirName(p: string): string {
  const parts = p.split(sep).filter((s) => s !== "");
  return parts[parts.length - 2] ?? "";
}

// Target-path patterns (spec-literal, do not extend beyond what's named there):
//   **/PREREG*.md, **/*登録案*.md, firedancer/RESULTS.md (parent dir literally "firedancer").
function isRegistrationPath(absPath: string): boolean {
  const base = basename(absPath);
  if (/^PREREG.*\.md$/.test(base)) return true;
  if (/登録案.*\.md$/.test(base)) return true;
  if (base === "RESULTS.md" && parentDirName(absPath) === "firedancer")
    return true;
  return false;
}

// --- content check ---------------------------------------------------------------------

// What was actually WRITTEN by this call, not the file's accumulated history (see header
// comment for why). Write carries the whole new file in .content; Edit carries only the
// inserted/replacement text in .new_string.
function writtenText(payload: any): string {
  const tool = payload?.tool_name;
  const ti = payload?.tool_input ?? {};
  if (tool === "Write" && typeof ti.content === "string") return ti.content;
  if (tool === "Edit" && typeof ti.new_string === "string")
    return ti.new_string;
  return "";
}

const PARENT_GOAL_RE =
  /\b(?:POC-NORTHSTAR|RESOURCE-EFFICIENCY|SELF-SCALING|ALL-DIGITAL|STOP-CERT|EXPONENT|THROUGHPUT|GAMMA-FREE)-\d+\b/;

// file:line citation — anchored to start with a letter so bare numeric ratios/times
// ("3:1", "14:30") don't count; matches both `RESULTS.md:1511` and `docs/D2607_18:133`.
const FILE_LINE_RE = /\b[A-Za-z][\w./-]*:\d+\b/;

const THEOREM_RE = /\bT\d+\b/;
const NO_HIT_RE = /該当なし|no-hit/i;

type CheckName = "親目標のID" | "継承する判定(file:line)" | "定理の照合";

function missingChecks(text: string): CheckName[] {
  const missing: CheckName[] = [];
  if (!PARENT_GOAL_RE.test(text)) missing.push("親目標のID");
  if (!FILE_LINE_RE.test(text)) missing.push("継承する判定(file:line)");
  const theoremOk =
    THEOREM_RE.test(text) || (/定理/.test(text) && NO_HIT_RE.test(text));
  if (!theoremOk) missing.push("定理の照合");
  return missing;
}

const FIX_HINT: Record<CheckName, string> = {
  親目標のID:
    "docs/目標台帳.md の ID を1つ引用せよ(例: POC-NORTHSTAR-001)。8種のいずれか: " +
    "POC-NORTHSTAR-*, RESOURCE-EFFICIENCY-*, SELF-SCALING-*, ALL-DIGITAL-*, STOP-CERT-*, " +
    "EXPONENT-*, THROUGHPUT-*, GAMMA-FREE-*。",
  "継承する判定(file:line)":
    "根拠を file:line 形式で1つ以上引用せよ(例: RESULTS.md:1511, docs/D2607_18:133)。",
  定理の照合:
    "T\\d+ の形で定理IDを1つ以上引用するか(例: T12)、該当なしなら「定理の照合: 該当なし」の" +
    "ように「定理」と「該当なし」(または no-hit)を明示せよ。",
};

function buildMessage(absPath: string, missing: CheckName[]): string {
  const lines = [
    `未接地の登録: ${absPath} への書き込みに次が欠けている(発射の関門, docs/手置きの台帳.md):`,
    ...missing.map((m) => `- ${m}: ${FIX_HINT[m]}`),
    "ブロックはしない。RESULTS.md の軽微な編集を止めると作業が滞るための警告のみ。",
  ];
  return lines.join("\n");
}

function emit(message: string): void {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: message,
      },
      systemMessage: message,
    }),
  );
}

function main(): number {
  const payload = readStdinJson();
  const tool = payload?.tool_name;
  if (tool !== "Write" && tool !== "Edit") return 0;

  const absPath = resolveFilePath(payload);
  if (absPath === null) return 0;
  if (!inFiredancerRepo(absPath)) return 0;
  if (!isRegistrationPath(absPath)) return 0;

  const text = writtenText(payload);
  const missing = missingChecks(text);
  if (missing.length === 0) return 0;

  emit(buildMessage(absPath, missing));
  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // FAIL OPEN
}
process.exit(code);
