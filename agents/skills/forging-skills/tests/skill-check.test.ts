// bun test characterizing CURRENT behavior of skill-check.ts (small-trio family:
// skill-check.ts / mise-contract.ts / lint-floor.ts). This file pins the exact
// stdout lines and exit codes as the bracket for the upcoming refactor — a
// behavior-preserving refactor must keep every assertion here green.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHECK = new URL("../scripts/skill-check.ts", import.meta.url).pathname;
// tests/ -> forging-skills/ -> skills/ -> agents/ -> repo root
const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;

function runCheck(...dirs: string[]): {
  out: string;
  err: string;
  code: number;
} {
  // bounded: one-shot floor run over tiny fixtures; maxBuffer caps runaway output
  const proc = Bun.spawnSync(["bun", CHECK, ...dirs], {
    maxBuffer: 1024 * 1024,
  });
  return {
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeSkillDir(name: string, skillMd?: string): string {
  const root = mkdtempSync(join(tmpdir(), "skill-check-"));
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (skillMd !== undefined) writeFileSync(join(dir, "SKILL.md"), skillMd);
  return dir;
}

function validSkillMd(name: string, extra = ""): string {
  return (
    "---\n" +
    `name: ${name}\n` +
    "description: >-\n" +
    "  A short valid description for testing purposes, long enough to be\n" +
    "  meaningful but well under any length cap.\n" +
    `${extra}---\n\nBody text mentioning nothing special.\n`
  );
}

describe("skill-check floor", () => {
  test("rejects --__proto__ before treating it as a skill directory", () => {
    const { out, err, code } = runCheck("--__proto__");
    expect(out).toBe("");
    expect(err).toContain("unknown option '--__proto__'");
    expect(code).toBe(2);
  });

  test("missing SKILL.md: FAIL + exit 1", () => {
    const dir = makeSkillDir("missing-skill-md");
    const { out, err, code } = runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: SKILL.md missing\n`);
    expect(err).toBe("");
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("bad name + no frontmatter: WARN + two FAILs, exit 1", () => {
    const dir = makeSkillDir(
      "Bad_Name_Skill",
      "This fixture skill deliberately has no YAML frontmatter and a\n" +
        "directory name that violates the name grammar, to exercise\n" +
        "skill-check.ts's failure paths.\n",
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: no YAML frontmatter (body loads with empty metadata)\n` +
        `FAIL ${dir}: name 'Bad_Name_Skill' violates ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$\n` +
        `FAIL ${dir}: description: missing or empty\n`,
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("valid skill: no output, exit 0", () => {
    const dir = makeSkillDir("green-skill", validSkillMd("green-skill"));
    const { out, code } = runCheck(dir);
    expect(out).toBe("");
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("frontmatter name != dir basename: FAIL, exit 1", () => {
    const dir = makeSkillDir("mismatch-skill", validSkillMd("other-name"));
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: frontmatter name 'other-name' != dir basename 'mismatch-skill'\n`,
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("reserved word 'claude' in name (not driving-claude): FAIL", () => {
    const dir = makeSkillDir("claude-thing", validSkillMd("claude-thing"));
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: name 'claude-thing' contains a reserved word (claude/anthropic)\n`,
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("driving-claude is the documented exception to the reserved-word rule", () => {
    const dir = makeSkillDir("driving-claude", validSkillMd("driving-claude"));
    const { out, code } = runCheck(dir);
    expect(out).toBe("");
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("consecutive hyphens in name: FAIL", () => {
    const dir = makeSkillDir("bad--name", validSkillMd("bad--name"));
    const { out, code } = runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: name 'bad--name' has consecutive hyphens\n`);
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("name exceeds 64 chars: FAIL with observed length", () => {
    const long = "a".repeat(65);
    const dir = makeSkillDir(long, validSkillMd(long));
    const { out, code } = runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: name '${long}' exceeds 64 chars (65)\n`);
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("plain-scalar description: WARN (exit 0, description still present)", () => {
    const dir = makeSkillDir(
      "plain-desc",
      "---\n" +
        "name: plain-desc\n" +
        "description: This is a plain scalar description without folding markers.\n" +
        "---\n\nBody text.\n",
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: plain-scalar description — any ': ' inside will break YAML parsing ` +
        "(observed 2026-07-02); use >-\n",
    );
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("description > 1500 chars: WARN with observed length (exit 0)", () => {
    const line = "x".repeat(1600);
    const dir = makeSkillDir(
      "long-desc",
      `---\nname: long-desc\ndescription: >-\n  ${line}\n---\n\nBody text.\n`,
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: description 1600 chars > 1500 ` +
        "(platform hard cap 1024 for API skills; listing cap owned by operating-the-harness)\n",
    );
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("frontmatter references an unresolvable file: FAIL", () => {
    const dir = makeSkillDir(
      "refs-missing",
      validSkillMd("refs-missing", "references:\n  - some-reference\n"),
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: frontmatter references 'some-reference' has no file ` +
        "(references/some-reference.md missing)\n",
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("references/*.md present on disk but never mentioned in body: FAIL", () => {
    const dir = makeSkillDir("orphan-ref", validSkillMd("orphan-ref"));
    mkdirSync(join(dir, "references"), { recursive: true });
    writeFileSync(
      join(dir, "references", "orphan.md"),
      "Orphan reference content.\n",
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: references/orphan.md exists but is never mentioned in SKILL.md\n`,
    );
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("SKILL.md body > 500 lines: WARN (exit 0)", () => {
    const bodyLines = Array.from(
      { length: 501 },
      (_, i) => `Line ${i + 1} of body.`,
    ).join("\n");
    const dir = makeSkillDir(
      "long-body",
      `---\nname: long-body\ndescription: >-\n  A short valid description.\n---\n\n${bodyLines}\n`,
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(`WARN ${dir}: SKILL.md body 503 lines > 500\n`);
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("multiple directories in one invocation: outputs concatenate in argv order", () => {
    const missing = makeSkillDir("missing-one");
    const green = makeSkillDir("green-two", validSkillMd("green-two"));
    const { out, code } = runCheck(missing, green);
    expect(out).toBe(`FAIL ${missing}: SKILL.md missing\n`);
    expect(code).toBe(1);
    rmSync(missing, { recursive: true, force: true });
    rmSync(green, { recursive: true, force: true });
  });

  test("no arguments: falls back to process.cwd()", () => {
    const dir = makeSkillDir(
      "cwd-default-skill",
      validSkillMd("cwd-default-skill"),
    );
    const proc = Bun.spawnSync(["bun", CHECK], {
      cwd: dir,
      maxBuffer: 1024 * 1024,
    });
    expect(proc.stdout.toString()).toBe("");
    expect(proc.stderr.toString()).toBe("");
    expect(proc.exitCode).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("trailing slash on the directory argument is stripped before reporting", () => {
    const dir = makeSkillDir("missing-trailing-slash");
    const { out, code } = runCheck(`${dir}/`);
    expect(out).toBe(`FAIL ${dir}: SKILL.md missing\n`);
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("the floor's own two dirs from the CHARACTERIZE brief: exit 0 (prose-debt WARNs now surface real corpus debt)", () => {
    const wbs = join(REPO_ROOT, "agents/skills/writing-bun-scripts");
    const wmt = join(REPO_ROOT, "agents/skills/wiring-mise-tasks");
    const { out, code } = runCheck(wbs, wmt);
    expect(out).toBe(
      `WARN ${wbs}: 12 prose sentences >120 chars (technical-communication debt)\n` +
        `WARN ${wbs}: version header 11 lines >3 — history belongs in the ledger\n` +
        `WARN ${wbs}: 4 table cells >400 chars — inline narratives belong in the ledger (pointer + date in the cell)\n` +
        `WARN ${wmt}: 13 prose sentences >120 chars (technical-communication debt)\n` +
        `WARN ${wmt}: version header 9 lines >3 — history belongs in the ledger\n`,
    );
    expect(code).toBe(0);
  });
});

// --- PROSE-DEBT floor (new WARN-tier checks; measurement before enforcement) ---
// Fixtures below stay minimal and isolated per check so a fixture built to exercise one
// check does not accidentally trip another (each assertion checks for absence of the
// other checks' WARN substrings where relevant).
describe("skill-check prose-debt floor", () => {
  const LONG = "A".repeat(130); // 130 chars, unambiguously >120 as a standalone "sentence"

  test("3 long prose sentences: WARN fires with the count", () => {
    const dir = makeSkillDir(
      "prose-debt-three",
      `${validSkillMd("prose-debt-three")}\n${LONG}.\n\n${LONG}.\n\n${LONG}.\n`,
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: 3 prose sentences >120 chars (technical-communication debt)\n`,
    );
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("2 long prose sentences: below the N>=3 threshold, no WARN", () => {
    const dir = makeSkillDir(
      "prose-debt-two",
      `${validSkillMd("prose-debt-two")}\n${LONG}.\n\n${LONG}.\n`,
    );
    const { out, code } = runCheck(dir);
    expect(out).not.toContain("prose sentences");
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("5-line version header: WARN with line count", () => {
    const dir = makeSkillDir(
      "version-header-five",
      validSkillMd("version-header-five") +
        "\n> **Version**: v1.0.0 (2026-07-24)\n" +
        "> line two\n" +
        "> line three\n" +
        "> line four\n" +
        "> line five\n",
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: version header 5 lines >3 — history belongs in the ledger\n`,
    );
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("3-line version header stays at/under the threshold: no WARN", () => {
    const dir = makeSkillDir(
      "version-header-three",
      validSkillMd("version-header-three") +
        "\n> **Version**: v1.0.0 (2026-07-24)\n" +
        "> line two\n" +
        "> line three\n",
    );
    const { out, code } = runCheck(dir);
    expect(out).not.toContain("version header");
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a 450-char table cell: WARN with the count", () => {
    const cell = "B".repeat(450);
    const dir = makeSkillDir(
      "rule-cell-narrative",
      validSkillMd("rule-cell-narrative") +
        `\n| Col A | Col B |\n|---|---|\n| short | ${cell} |\n`,
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: 1 table cells >400 chars — inline narratives belong in the ledger (pointer + date in the cell)\n`,
    );
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("long lines inside a code fence and inside table rows do not count toward prose-sentence-length", () => {
    const fenceLine = "F".repeat(130);
    const cellLine = "G".repeat(130);
    const dir = makeSkillDir(
      "fence-table-excluded",
      validSkillMd("fence-table-excluded") +
        "\nIntro paragraph.\n\n" +
        "```text\n" +
        `${fenceLine}\n${fenceLine}\n${fenceLine}\n` +
        "```\n\n" +
        `| Col |\n|---|\n| ${cellLine} |\n| ${cellLine} |\n| ${cellLine} |\n`,
    );
    const { out, code } = runCheck(dir);
    expect(out).not.toContain("prose sentences");
    expect(out).not.toContain("table cells >400");
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("regression: missing SKILL.md still FAILs after the prose-debt floor was added", () => {
    const dir = makeSkillDir("prose-debt-regression-missing");
    const { out, code } = runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: SKILL.md missing\n`);
    expect(code).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("regression: a clean minimal skill still exits 0 after the prose-debt floor was added", () => {
    const dir = makeSkillDir(
      "prose-debt-regression-clean",
      validSkillMd("prose-debt-regression-clean"),
    );
    const { out, code } = runCheck(dir);
    expect(out).toBe("");
    expect(code).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
