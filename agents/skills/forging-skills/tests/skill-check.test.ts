// bun test characterizing CURRENT behavior of skill-check.ts (small-trio family:
// skill-check.ts / mise-contract.ts / lint-floor.ts). This file pins the exact
// stdout lines and exit codes as the bracket for the upcoming refactor — a
// behavior-preserving refactor must keep every assertion here green.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHECK = new URL("../scripts/skill-check.ts", import.meta.url).pathname;
// tests/ -> forging-skills/ -> skills/ -> agents/ -> repo root
const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;

async function runCheck(...dirs: string[]): Promise<{
  out: string;
  err: string;
  code: number;
}> {
  // one-shot floor run over tiny fixtures; both output streams are drained while it runs
  const proc = Bun.spawn(["bun", CHECK, ...dirs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    out,
    err,
    code,
  };
}

const tempRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  tempRoots.clear();
});

async function makeSkillDir(name: string, skillMd?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skill-check-"));
  tempRoots.add(root);
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  if (skillMd !== undefined) await writeFile(join(dir, "SKILL.md"), skillMd);
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
  test("rejects --__proto__ before treating it as a skill directory", async () => {
    const { out, err, code } = await runCheck("--__proto__");
    expect(out).toBe("");
    expect(err).toContain("unknown option '--__proto__'");
    expect(code).toBe(2);
  });

  test("missing SKILL.md: FAIL + exit 1", async () => {
    const dir = await makeSkillDir("missing-skill-md");
    const { out, err, code } = await runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: SKILL.md missing\n`);
    expect(err).toBe("");
    expect(code).toBe(1);
  });

  test("bad name + no frontmatter: WARN + two FAILs, exit 1", async () => {
    const dir = await makeSkillDir(
      "Bad_Name_Skill",
      "This fixture skill deliberately has no YAML frontmatter and a\n" +
        "directory name that violates the name grammar, to exercise\n" +
        "skill-check.ts's failure paths.\n",
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: no YAML frontmatter (body loads with empty metadata)\n` +
        `FAIL ${dir}: name 'Bad_Name_Skill' violates ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$\n` +
        `FAIL ${dir}: description: missing or empty\n`,
    );
    expect(code).toBe(1);
  });

  test("valid skill: no output, exit 0", async () => {
    const dir = await makeSkillDir("green-skill", validSkillMd("green-skill"));
    const { out, code } = await runCheck(dir);
    expect(out).toBe("");
    expect(code).toBe(0);
  });

  test("frontmatter name != dir basename: FAIL, exit 1", async () => {
    const dir = await makeSkillDir(
      "mismatch-skill",
      validSkillMd("other-name"),
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: frontmatter name 'other-name' != dir basename 'mismatch-skill'\n`,
    );
    expect(code).toBe(1);
  });

  test("reserved word 'claude' in name: FAIL", async () => {
    const dir = await makeSkillDir(
      "claude-thing",
      validSkillMd("claude-thing"),
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: name 'claude-thing' contains a reserved word (claude/anthropic)\n`,
    );
    expect(code).toBe(1);
  });

  test("consecutive hyphens in name: FAIL", async () => {
    const dir = await makeSkillDir("bad--name", validSkillMd("bad--name"));
    const { out, code } = await runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: name 'bad--name' has consecutive hyphens\n`);
    expect(code).toBe(1);
  });

  test("name exceeds 64 chars: FAIL with observed length", async () => {
    const long = "a".repeat(65);
    const dir = await makeSkillDir(long, validSkillMd(long));
    const { out, code } = await runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: name '${long}' exceeds 64 chars (65)\n`);
    expect(code).toBe(1);
  });

  test("plain-scalar description: WARN (exit 0, description still present)", async () => {
    const dir = await makeSkillDir(
      "plain-desc",
      "---\n" +
        "name: plain-desc\n" +
        "description: This is a plain scalar description without folding markers.\n" +
        "---\n\nBody text.\n",
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: plain-scalar description — any ': ' inside will break YAML parsing ` +
        "(observed 2026-07-02); use >-\n",
    );
    expect(code).toBe(0);
  });

  test("description > 1500 chars: WARN with observed length (exit 0)", async () => {
    const line = "x".repeat(1600);
    const dir = await makeSkillDir(
      "long-desc",
      `---\nname: long-desc\ndescription: >-\n  ${line}\n---\n\nBody text.\n`,
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: description 1600 chars > 1500 ` +
        "(local review threshold; target-host limits owned by operating-the-harness)\n",
    );
    expect(code).toBe(0);
  });

  for (const quote of ['"', "'"]) {
    test(`quoted description with colon-space is valid (${quote})`, async () => {
      const name = "quoted-description";
      const dir = await makeSkillDir(
        name,
        `---\nname: ${name}\ndescription: ${quote}A valid description: scoped work.${quote}\n---\n\nBody text.\n`,
      );
      const { out, code } = await runCheck(dir);
      expect(code).toBe(0);
      expect(out).toBe("");
    });
  }

  test("frontmatter references an unresolvable file: FAIL", async () => {
    const dir = await makeSkillDir(
      "refs-missing",
      validSkillMd("refs-missing", "references:\n  - some-reference\n"),
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: frontmatter references 'some-reference' has no file ` +
        "(references/some-reference.md missing)\n",
    );
    expect(code).toBe(1);
  });

  test("references/*.md present on disk but never mentioned in body: FAIL", async () => {
    const dir = await makeSkillDir("orphan-ref", validSkillMd("orphan-ref"));
    await mkdir(join(dir, "references"), { recursive: true });
    await writeFile(
      join(dir, "references", "orphan.md"),
      "Orphan reference content.\n",
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `FAIL ${dir}: references/orphan.md exists but is never mentioned in SKILL.md\n`,
    );
    expect(code).toBe(1);
  });

  test("SKILL.md body > 500 lines: WARN (exit 0)", async () => {
    const bodyLines = Array.from(
      { length: 501 },
      (_, i) => `Line ${i + 1} of body.`,
    ).join("\n");
    const dir = await makeSkillDir(
      "long-body",
      `---\nname: long-body\ndescription: >-\n  A short valid description.\n---\n\n${bodyLines}\n`,
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(`WARN ${dir}: SKILL.md body 503 lines > 500\n`);
    expect(code).toBe(0);
  });

  test("multiple directories in one invocation: outputs concatenate in argv order", async () => {
    const missing = await makeSkillDir("missing-one");
    const green = await makeSkillDir("green-two", validSkillMd("green-two"));
    const { out, code } = await runCheck(missing, green);
    expect(out).toBe(`FAIL ${missing}: SKILL.md missing\n`);
    expect(code).toBe(1);
  });

  test("no arguments: falls back to process.cwd()", async () => {
    const dir = await makeSkillDir(
      "cwd-default-skill",
      validSkillMd("cwd-default-skill"),
    );
    const proc = Bun.spawn(["bun", CHECK], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(out).toBe("");
    expect(err).toBe("");
    expect(code).toBe(0);
  });

  test("trailing slash on the directory argument is stripped before reporting", async () => {
    const dir = await makeSkillDir("missing-trailing-slash");
    const { out, code } = await runCheck(`${dir}/`);
    expect(out).toBe(`FAIL ${dir}: SKILL.md missing\n`);
    expect(code).toBe(1);
  });

  test("the floor's own two dirs from the CHARACTERIZE brief: exit 0 (prose-debt WARNs now surface real corpus debt)", async () => {
    const wbs = join(REPO_ROOT, "agents/skills/writing-bun-scripts");
    const wmt = join(REPO_ROOT, "agents/skills/wiring-mise-tasks");
    const { out, code } = await runCheck(wbs, wmt);
    // The counts in these lines (12 sentences, 2296 chars, ...) move whenever anyone edits those
    // two skills' prose, so pinning them made this test fail on every unrelated edit. What it
    // characterizes is the SHAPE: exit 0, nothing but WARN/LISTING lines (no FAIL), the
    // technical-communication WARN present for each directory, and one LISTING budget line.
    const lines = out.trimEnd().split("\n");
    expect(lines.every((l) => /^(WARN|LISTING) /u.test(l))).toBe(true);
    for (const dir of [wbs, wmt]) {
      expect(
        lines.some(
          (l) =>
            l.startsWith(`WARN ${dir}: `) &&
            /\d+ prose sentences >120 chars/u.test(l),
        ),
      ).toBe(true);
    }
    const listing = lines.filter((l) => l.startsWith("LISTING "));
    expect(listing).toHaveLength(1);
    expect(listing[0]).toMatch(
      /^LISTING 2 skills, \d+ name\+description chars \(static proxy\)$/u,
    );
    expect(code).toBe(0);
  });
});

describe("skill-check static listing footprint", () => {
  test("counts explicit-only metadata as a static proxy and enforces the exact ceiling", async () => {
    const nameA = "proxy-budget-a";
    const nameB = "proxy-budget-b";
    const a = await makeSkillDir(nameA, validSkillMd(nameA));
    const b = await makeSkillDir(
      nameB,
      validSkillMd(nameB, "disable-model-invocation: true\n"),
    );
    const description =
      "A short valid description for testing purposes, long enough to be " +
      "meaningful but well under any length cap.";
    const expected = nameA.length + nameB.length + 2 * description.length;
    const budget = join(a, "budget.json");
    await writeFile(budget, JSON.stringify({ maxListingChars: expected - 1 }));
    const over = await runCheck("--budget", budget, a, b);
    expect(over.code).toBe(1);
    expect(over.out).toContain(
      `LISTING 2 skills, ${expected} name+description chars (static proxy)`,
    );
    expect(over.out).toContain(
      `FAIL listing budget: ${expected} chars > ${expected - 1}`,
    );
    expect(over.out).not.toContain("charged per turn");

    await writeFile(budget, JSON.stringify({ maxListingChars: expected }));
    const exact = await runCheck("--budget", budget, a, b);
    expect(exact.code).toBe(0);
    expect(exact.out).not.toContain("FAIL");
  });
});

// --- PROSE-DEBT floor (new WARN-tier checks; measurement before enforcement) ---
// Fixtures below stay minimal and isolated per check so a fixture built to exercise one
// check does not accidentally trip another (each assertion checks for absence of the
// other checks' WARN substrings where relevant).
describe("skill-check prose-debt floor", () => {
  const LONG = "A".repeat(130); // 130 chars, unambiguously >120 as a standalone "sentence"

  test("3 long prose sentences: WARN fires with the count", async () => {
    const dir = await makeSkillDir(
      "prose-debt-three",
      `${validSkillMd("prose-debt-three")}\n${LONG}.\n\n${LONG}.\n\n${LONG}.\n`,
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: 3 prose sentences >120 chars (technical-communication debt)\n`,
    );
    expect(code).toBe(0);
  });

  test("2 long prose sentences: below the N>=3 threshold, no WARN", async () => {
    const dir = await makeSkillDir(
      "prose-debt-two",
      `${validSkillMd("prose-debt-two")}\n${LONG}.\n\n${LONG}.\n`,
    );
    const { out, code } = await runCheck(dir);
    expect(out).not.toContain("prose sentences");
    expect(code).toBe(0);
  });

  test("5-line version header: WARN with line count", async () => {
    const dir = await makeSkillDir(
      "version-header-five",
      validSkillMd("version-header-five") +
        "\n> **Version**: v1.0.0 (2026-07-24)\n" +
        "> line two\n" +
        "> line three\n" +
        "> line four\n" +
        "> line five\n",
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: version header 5 lines >3 — history belongs in the ledger\n`,
    );
    expect(code).toBe(0);
  });

  test("3-line version header stays at/under the threshold: no WARN", async () => {
    const dir = await makeSkillDir(
      "version-header-three",
      validSkillMd("version-header-three") +
        "\n> **Version**: v1.0.0 (2026-07-24)\n" +
        "> line two\n" +
        "> line three\n",
    );
    const { out, code } = await runCheck(dir);
    expect(out).not.toContain("version header");
    expect(code).toBe(0);
  });

  test("a 450-char table cell: WARN with the count", async () => {
    const cell = "B".repeat(450);
    const dir = await makeSkillDir(
      "rule-cell-narrative",
      validSkillMd("rule-cell-narrative") +
        `\n| Col A | Col B |\n|---|---|\n| short | ${cell} |\n`,
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe(
      `WARN ${dir}: 1 table cells >400 chars — inline narratives belong in the ledger (pointer + date in the cell)\n`,
    );
    expect(code).toBe(0);
  });

  test("long lines inside a code fence and inside table rows do not count toward prose-sentence-length", async () => {
    const fenceLine = "F".repeat(130);
    const cellLine = "G".repeat(130);
    const dir = await makeSkillDir(
      "fence-table-excluded",
      validSkillMd("fence-table-excluded") +
        "\nIntro paragraph.\n\n" +
        "```text\n" +
        `${fenceLine}\n${fenceLine}\n${fenceLine}\n` +
        "```\n\n" +
        `| Col |\n|---|\n| ${cellLine} |\n| ${cellLine} |\n| ${cellLine} |\n`,
    );
    const { out, code } = await runCheck(dir);
    expect(out).not.toContain("prose sentences");
    expect(out).not.toContain("table cells >400");
    expect(code).toBe(0);
  });

  test("regression: missing SKILL.md still FAILs after the prose-debt floor was added", async () => {
    const dir = await makeSkillDir("prose-debt-regression-missing");
    const { out, code } = await runCheck(dir);
    expect(out).toBe(`FAIL ${dir}: SKILL.md missing\n`);
    expect(code).toBe(1);
  });

  test("regression: a clean minimal skill still exits 0 after the prose-debt floor was added", async () => {
    const dir = await makeSkillDir(
      "prose-debt-regression-clean",
      validSkillMd("prose-debt-regression-clean"),
    );
    const { out, code } = await runCheck(dir);
    expect(out).toBe("");
    expect(code).toBe(0);
  });
});
