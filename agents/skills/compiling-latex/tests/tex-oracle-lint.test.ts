// tex-oracle lint — teeth and boundary tests. Run: bun test agents/skills/compiling-latex/tests
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const skill = join(import.meta.dir, "..");
const oracle = join(skill, "scripts/tex-oracle.ts");
const contract = join(skill, "assets/NOTATION.md");
const dirty = join(import.meta.dir, "fixtures/lint/dirty/main.tex");
const clean = join(import.meta.dir, "fixtures/lint/clean/main.tex");
const scratch = mkdtempSync(join(tmpdir(), "tex-oracle-lint-"));

async function run(
  ...args: string[]
): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", oracle, ...args], {
    cwd: skill,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

function contractFile(name: string, text: string): string {
  const path = join(scratch, name);
  writeFileSync(path, text);
  return path;
}

describe("lint against the shipped NOTATION.md template", () => {
  test("dirty fixture: every rule hits exactly once, exit 1", async () => {
    const { code, out } = await run("lint", dirty, "--contract", contract);
    const ruleCount = Number(out.match(/\((\d+) rules, 3 files\)/u)?.[1]);
    const ids = [...out.matchAll(/^\S+:\d+:\d+: \[(R\d+)\]/gmu)]
      .map((m) => m[1])
      .toSorted((a, b) => (a ?? "").localeCompare(b ?? ""));
    const expected = Array.from(
      { length: ruleCount },
      (_, i) => `R${i + 1}`,
    ).toSorted((a, b) => a.localeCompare(b));
    expect(code).toBe(1);
    expect(ruleCount).toBeGreaterThan(0);
    expect(ids).toEqual(expected);
  });

  test("dirty fixture: hits in \\input files carry their own file:line", async () => {
    const { out } = await run("lint", dirty, "--contract", contract);
    expect(out).toContain("dirty/notation.tex:1:1: [R1]");
    expect(out).toContain("dirty/sections/body.tex:12:23: [R");
  });

  test("comments: \\% is text, \\\\% starts a comment, a commented \\input is not followed", async () => {
    const { out } = await run("lint", dirty, "--contract", contract);
    expect(out).toContain("dirty/main.tex:14:16: [R9]");
    expect(out).not.toContain("dirty/main.tex:15:");
    expect(out).not.toContain("dirty/main.tex:9:");
  });

  test("clean fixture: exit 0", async () => {
    const { code, out } = await run("lint", clean, "--contract", contract);
    expect(out).toContain("LINT CLEAN");
    expect(code).toBe(0);
  });
});

describe("contract grammar errors exit 2", () => {
  const cases: [string, string, string][] = [
    ["no block", "# x\n", "found 0"],
    [
      "two blocks",
      "```forbidden\na\tb\n```\n```forbidden\nc\td\n```\n",
      "found 2",
    ],
    ["unclosed", "```forbidden\na\tb\n", "never closed"],
    ["empty block", "```forbidden\n\n```\n", "no rules"],
    ["no tab", "```forbidden\nnotab\n```\n", "<regex><TAB><reason>"],
    ["empty reason", "```forbidden\na\t  \n```\n", "<regex><TAB><reason>"],
    ["bad regex", "```forbidden\n(\tunbalanced\n```\n", "bad regex"],
  ];
  for (const [name, text, message] of cases) {
    test(name, async () => {
      const { code, err } = await run(
        "lint",
        clean,
        "--contract",
        contractFile(`${name.replaceAll(" ", "-")}.md`, text),
      );
      expect(code).toBe(2);
      expect(err).toContain(message);
    });
  }
});

describe("CLI boundary exits 2", () => {
  test("missing --contract", async () => {
    expect((await run("lint", clean)).code).toBe(2);
  });
  test("--contract with no value", async () => {
    expect((await run("lint", clean, "--contract")).code).toBe(2);
  });
  test("extra positional", async () => {
    expect(
      (await run("lint", clean, "extra", "--contract", contract)).code,
    ).toBe(2);
  });
  test("unknown flag", async () => {
    expect(
      (await run("lint", clean, "--contract", contract, "--bogus")).code,
    ).toBe(2);
  });
  test("--__proto__", async () => {
    expect(
      (await run("lint", clean, "--contract", contract, "--__proto__", "x"))
        .code,
    ).toBe(2);
  });
  test("contract file missing", async () => {
    expect(
      (await run("lint", clean, "--contract", join(scratch, "nope.md"))).code,
    ).toBe(2);
  });
  test("\\input target missing", async () => {
    const main = contractFile("main.tex", "\\input{gone}\n");
    const { code, err } = await run("lint", main, "--contract", contract);
    expect(code).toBe(2);
    expect(err).toContain("missing input file");
  });
});
