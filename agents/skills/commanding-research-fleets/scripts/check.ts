// THIS IS NOT A SEMANTIC CHECK. It is a structural floor over commanding-research-fleets: file
// presence, frontmatter shape, and a handful of greppable content counts (checklist has eight
// items, operating rules has eight, LAW candidates has nine, etc.). It cannot judge whether any
// rule is TRUE, whether the sibling cuts are accurate, or whether the description actually wins
// its trigger races — those are the semantic lenses (`tests/forge-verification-ledger.md`).
//
// Usage: bun scripts/check.ts <skill-dir>   (defaults to this script's own parent dir)
//
// Exit 0 = all structural checks pass. Exit 1 = at least one FAILed. Exit 2 = environment/CLI
// FATAL (bad flag, missing SKILL.md never reaches here — see below). Prose-debt-style WARNs (if
// any are added later) never fail the process — they are measurement, not a gate (forging-skills
// architecture.md §5).

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
// Bare specifier, not pinned inline: this tree is NOT zero-dep. It is symlinked (never
// mirrored/copied) into ~/.claude/skills by `mise run link:skills`, so the repo-root graduation
// project (package.json + bun.lock) governs it — Bun resolves through the symlink to this
// file's realpath and finds that root from any cwd (BG3).
import { cli } from "cleye";

// writing-bun-scripts F8: raw process.argv needs a Cleye boundary. This positional-only CLI had
// none (measured 2026-09-12, script-check.ts's F8 check) — masked until now by an unrelated
// script-check.ts parsing quirk: its executableCode() scanner mis-tokenizes the shebang line's
// slashes as a regex literal and swallows the next source line with it, which happened to be
// this exact `process.argv[2]` read. Removing the (unused, BG1) shebang unmasked the real F8 gap.
let prototypeFlagSeen = false;
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    prototypeFlagSeen = true;
  }
}

let failed = false;
function fail(msg: string): void {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg: string): void {
  console.log(`ok: ${msg}`);
}

function reportDescriptionLabel(raw: string, label: string, re: RegExp): void {
  if (!re.test(raw)) fail(`description missing ${label}`);
  else ok(`description carries ${label}`);
}

function checkFrontmatter(skillMd: string): void {
  const fmMatch = /^---\n([\s\S]*?)\n---/u.exec(skillMd);
  if (fmMatch === null) {
    fail("no YAML frontmatter block found");
    return;
  }
  const fm = fmMatch[1] ?? "";
  if (!/^name:\s*commanding-research-fleets\s*$/mu.test(fm))
    fail("frontmatter name: must be exactly 'commanding-research-fleets'");
  else ok("frontmatter name matches dir");
  const descMatch = /^description:\s*>-\n([\s\S]*)$/mu.exec(fm);
  if (descMatch === null) {
    fail(
      "description: must use block scalar '>-' — a plain scalar breaks on any 'X: ' inside",
    );
    return;
  }
  const raw = (descMatch[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .trim();
  ok(
    `description block-scalar found, ~${raw.length} chars (cap 1500, hard 1024 API-deploy)`,
  );
  if (raw.length > 1500)
    fail(`description ~${raw.length} chars exceeds the 1500 house ceiling`);
  if (raw.length > 1024)
    console.warn(
      `WARN: description ~${raw.length} chars exceeds the 1024 platform hard cap for API deployment (Claude Code's own listing cap differs — operating-the-harness owns that number)`,
    );
  if (!/English skill; respond in the user's language/u.test(raw))
    fail("description must end with the language directive, verbatim");
  const labels = [
    ["Director/PI/Researcher role names", /Director.*PI.*Researcher/u],
    ["a DECISIVE or PURPOSE cut label", /(DECISIVE|CARDINALITY|PURPOSE):/u],
  ] as const;
  for (const [label, re] of labels) reportDescriptionLabel(raw, label, re);
}

function countTableRows(source: string, headerRe: RegExp): number {
  const idx = source.search(headerRe);
  if (idx === -1) return -1;
  const rest = source.slice(idx).split("\n");
  let count = 0;
  // rows start at index 2 (0=header, 1=separator)
  for (let i = 2; i < rest.length; i++) {
    const line = rest[i];
    if (line === undefined || !line.startsWith("|")) break;
    count++;
  }
  return count;
}

// 2026-09-12: mirrors operating-the-harness/scripts/scope-check.ts's main()/catch convention —
// cli()'s and rejectPrototypeFlag's thrown Errors (incl. --__proto__, cleye-corpus.test.ts's
// third per-entry assertion) must land as a clean `FATAL: <message>` + exit 2, not an uncaught
// stack trace + exit 1. Before this, every check below ran at module top level, so the same
// thrown Error was unhandled (measured: `bun check.ts --__proto__` -> stack trace, exit 1).
function main(): number {
  const parsed = cli(
    {
      name: "check.ts",
      parameters: ["[skill-dir]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (prototypeFlagSeen) {
    console.error("FATAL: unknown option '--__proto__'");
    return 2;
  }
  if (parsed._.length > 1) {
    console.error(`FATAL: unexpected argument '${parsed._[1]}'`);
    return 2;
  }
  const dir =
    parsed._[0] ?? join(dirname(new URL(import.meta.url).pathname), "..");
  const skillMdPath = join(dir, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    console.error(`FAIL: no SKILL.md at ${skillMdPath}`);
    return 1;
  }
  const skillMd = readFileSync(skillMdPath, "utf8");

  // --- frontmatter shape -----------------------------------------------------------------
  checkFrontmatter(skillMd);

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
  for (const stray of [
    "README.md",
    "CHANGELOG.md",
    "INSTALL.md",
    "QUICK_REFERENCE.md",
  ]) {
    if (existsSync(join(dir, stray)))
      fail(
        `stray ${stray} present — a skill's only readers are the model and the interpreter`,
      );
  }

  // --- content counts (greppable, per architecture.md §5) -------------------------------------
  const checklist = readFileSync(join(dir, "SKILL.md"), "utf8");
  const checklistRows = countTableRows(
    checklist,
    /\| # \| Check \| Artifact \|/u,
  );
  if (checklistRows !== 8)
    fail(`launch checklist has ${checklistRows} rows, expected exactly 8`);
  else ok("launch checklist has exactly 8 rows");

  const opRulesRows = countTableRows(
    checklist,
    /\| # \| Rule \|\n\|---\|---\|\n\| 1 \| A frozen plan/u,
  );
  if (opRulesRows !== 8)
    fail(`operating rules has ${opRulesRows} rows, expected exactly 8`);
  else ok("operating rules has exactly 8 rows");

  const vocabAndLaw = readFileSync(
    join(dir, "references/vocabulary-and-law.md"),
    "utf8",
  );
  const stuckRows = countTableRows(
    vocabAndLaw,
    /\| # \| Prompt \(verbatim\) \|/u,
  );
  if (stuckRows !== 5)
    fail(`stuck-question prompts has ${stuckRows} rows, expected exactly 5`);
  else ok("stuck-question prompts has exactly 5 rows");

  const lawCandidateRows = countTableRows(
    vocabAndLaw,
    /\| # \| Candidate rule \|/u,
  );
  if (lawCandidateRows !== 9)
    fail(
      `LAW-candidate table has ${lawCandidateRows} rows, expected exactly 9`,
    );
  else ok("LAW-candidate table has exactly 9 rows");

  // LAW candidates must never read as binding — the file must keep saying so.
  if (!/NOT yet binding/u.test(vocabAndLaw))
    fail(
      "vocabulary-and-law.md must keep the LAW candidates marked NOT yet binding",
    );
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
      fail(
        `sibling cut names '${sib}', which does not exist under ${skillsRoot}`,
      );
  }
  ok("all named siblings exist on disk");

  return failed ? 1 : 0;
}

const result = await Promise.try(main).then(
  (code) => ({ ok: true as const, code }),
  (error: unknown) => ({ ok: false as const, error }),
);
if (!result.ok) {
  process.stderr.write(
    `FATAL: ${result.error instanceof Error ? result.error.message : String(result.error)}\n`,
  );
  process.exitCode = 2;
} else {
  process.exitCode = result.code;
}
