#!/usr/bin/env bun
// THIS IS NOT A SEMANTIC CHECK. It is a structural floor over commanding-research-fleets: file
// presence, frontmatter shape, and a handful of greppable content counts (checklist has six
// items, operating rules has seven, LAW candidates has nine, etc.). It cannot judge whether any
// rule is TRUE, whether the sibling cuts are accurate, or whether the description actually wins
// its trigger races — those are the semantic lenses (`tests/forge-verification-ledger.md`).
//
// Usage: bun scripts/check.ts <skill-dir>   (defaults to this script's own parent dir)
//
// Exit 0 = all structural checks pass. Exit 1 = at least one FAILed. Prose-debt-style WARNs (if
// any are added later) never fail the process — they are measurement, not a gate (forging-skills
// architecture.md §5).

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const dir = process.argv[2] ?? join(dirname(new URL(import.meta.url).pathname), "..");
const skillMdPath = join(dir, "SKILL.md");

let failed = false;
function fail(msg: string): void {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg: string): void {
  console.log(`ok: ${msg}`);
}

if (!existsSync(skillMdPath)) {
  console.error(`FAIL: no SKILL.md at ${skillMdPath}`);
  process.exit(1);
}
const skillMd = readFileSync(skillMdPath, "utf8");

// --- frontmatter shape -----------------------------------------------------------------
const fmMatch = /^---\n([\s\S]*?)\n---/.exec(skillMd);
if (!fmMatch) {
  fail("no YAML frontmatter block found");
} else {
  const fm = fmMatch[1];
  if (!/^name:\s*commanding-research-fleets\s*$/m.test(fm)) {
    fail("frontmatter name: must be exactly 'commanding-research-fleets'");
  } else {
    ok("frontmatter name matches dir");
  }
  const descMatch = /^description:\s*>-\n([\s\S]*)$/m.exec(fm);
  if (!descMatch) {
    fail("description: must use block scalar '>-' — a plain scalar breaks on any 'X: ' inside");
  } else {
    // Reconstruct the folded scalar length roughly: join continuation lines with spaces.
    const raw = descMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .join(" ")
      .trim();
    ok(`description block-scalar found, ~${raw.length} chars (cap 1500, hard 1024 API-deploy)`);
    if (raw.length > 1500) fail(`description ~${raw.length} chars exceeds the 1500 house ceiling`);
    if (raw.length > 1024)
      console.warn(
        `WARN: description ~${raw.length} chars exceeds the 1024 platform hard cap for API deployment (Claude Code's own listing cap differs — operating-the-harness owns that number)`,
      );
    if (!/English skill; respond in the user's language/.test(raw))
      fail("description must end with the language directive, verbatim");
    for (const [label, re] of [
      ["Director/PI/Researcher role names", /Director.*PI.*Researcher/],
      ["Workflow-native clause", /Workflow-native:/],
      ["a DECISIVE or PURPOSE cut label", /(DECISIVE|CARDINALITY|PURPOSE):/],
    ] as const) {
      if (!re.test(raw)) fail(`description missing ${label}`);
      else ok(`description carries ${label}`);
    }
  }
}

// --- required files (mirrors the SKILL.md header one-liner; kept here too so `bun
// scripts/check.ts` alone is a complete floor run without needing the shell fragment) --------
for (const f of [
  "references/charters.md",
  "references/researcher-types.md",
  "references/launch-and-order.md",
  "references/vocabulary-and-law.md",
  "tests/triggers.md",
  "tests/forge-verification-ledger.md",
]) {
  if (existsSync(join(dir, f))) ok(`${f} present`);
  else fail(`missing ${f}`);
}

// --- no README/CHANGELOG/etc (architecture.md §1's exclusion rule) --------------------------
for (const stray of ["README.md", "CHANGELOG.md", "INSTALL.md", "QUICK_REFERENCE.md"]) {
  if (existsSync(join(dir, stray))) fail(`stray ${stray} present — a skill's only readers are the model and the interpreter`);
}

// --- content counts (greppable, per architecture.md §5) -------------------------------------
function countTableRows(source: string, headerRe: RegExp): number {
  const idx = source.search(headerRe);
  if (idx === -1) return -1;
  const rest = source.slice(idx).split("\n");
  let count = 0;
  // rows start at index 2 (0=header, 1=separator)
  for (let i = 2; i < rest.length; i++) {
    const line = rest[i];
    if (!line.startsWith("|")) break;
    count++;
  }
  return count;
}

const checklist = readFileSync(join(dir, "SKILL.md"), "utf8");
const checklistRows = countTableRows(checklist, /\| # \| Check \| Artifact \|/);
if (checklistRows !== 6) fail(`launch checklist has ${checklistRows} rows, expected exactly 6`);
else ok("launch checklist has exactly 6 rows");

const opRulesRows = countTableRows(checklist, /\| # \| Rule \|\n\|---\|---\|\n\| 1 \| A frozen plan/);
if (opRulesRows !== 7) fail(`operating rules has ${opRulesRows} rows, expected exactly 7`);
else ok("operating rules has exactly 7 rows");

const vocabAndLaw = readFileSync(join(dir, "references/vocabulary-and-law.md"), "utf8");
const stuckRows = countTableRows(vocabAndLaw, /\| # \| Prompt \(verbatim\) \|/);
if (stuckRows !== 5) fail(`stuck-question prompts has ${stuckRows} rows, expected exactly 5`);
else ok("stuck-question prompts has exactly 5 rows");

const lawCandidateRows = countTableRows(vocabAndLaw, /\| # \| Candidate rule \|/);
if (lawCandidateRows !== 9) fail(`LAW-candidate table has ${lawCandidateRows} rows, expected exactly 9`);
else ok("LAW-candidate table has exactly 9 rows");

// LAW candidates must never read as binding — the file must keep saying so.
if (!/NOT yet binding/.test(vocabAndLaw))
  fail("vocabulary-and-law.md must keep the LAW candidates marked NOT yet binding");
else ok("LAW candidates explicitly marked not-yet-binding");

// --- sibling names actually exist on disk (catches a typo'd sibling cut) --------------------
const skillsRoot = join(dir, "..");
for (const sib of [
  "orchestrating-agents",
  "supervising-research-programmes",
  "directing-research-sections",
  "codifying-doctrine",
  "operating-the-harness",
  "auditing-research-processes",
  "forging-skills",
]) {
  if (!existsSync(join(skillsRoot, sib)))
    fail(`sibling cut names '${sib}', which does not exist under ${skillsRoot}`);
}
ok("all named siblings exist on disk");

process.exit(failed ? 1 : 0);
