import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = join(import.meta.dir, "../..");
const FIXTURES = join(import.meta.dir, "fixtures");
const OXLINT_SCRATCH = await mkdtemp(join(tmpdir(), "preset-oxlint-"));
afterAll(async () => {
  await rm(OXLINT_SCRATCH, { recursive: true, force: true });
});
const ShowConfig = z.looseObject({
  compilerOptions: z.record(z.string(), z.unknown()),
});
const OxReport = z.looseObject({
  diagnostics: z.array(
    z.looseObject({
      message: z.string(),
      code: z.string().optional(),
      rule_id: z.string().optional(),
    }),
  ),
  number_of_files: z.number(),
});

async function showConfig(path: string): Promise<Record<string, unknown>> {
  const result = Bun.spawn(
    ["bunx", "--bun", "tsgo", "--showConfig", "-p", path],
    { cwd: ROOT, timeout: 60_000, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, exitCode] = await Promise.all([
    new Response(result.stdout).text(),
    result.exited,
  ]);
  expect(exitCode).toBe(0);
  const parsed = jsonOf(ShowConfig).safeParse(stdout);
  if (!parsed.success)
    return expect.unreachable(`tsgo --showConfig: ${parsed.error.message}`);
  return parsed.data.compilerOptions;
}

async function typecheck(path: string): Promise<number> {
  const result = Bun.spawn(["bunx", "--bun", "tsgo", "--noEmit", "-p", path], {
    cwd: ROOT,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.exited;
}

describe("TypeScript preset", () => {
  test("dotfiles root config cannot weaken any strictness flag from the preset", async () => {
    const preset = await showConfig(
      join(ROOT, "presets/typescript/tsconfig.json"),
    );
    const dotfiles = await showConfig(join(ROOT, "tsconfig.json"));
    const strictFlags = [
      "strict",
      "noImplicitAny",
      "strictNullChecks",
      "strictFunctionTypes",
      "strictBindCallApply",
      "strictPropertyInitialization",
      "noImplicitThis",
      "useUnknownInCatchVariables",
      "alwaysStrict",
      "exactOptionalPropertyTypes",
      "noUncheckedIndexedAccess",
      "noUnusedLocals",
      "noUnusedParameters",
      "noImplicitReturns",
      "noFallthroughCasesInSwitch",
      "noImplicitOverride",
      "noUncheckedSideEffectImports",
      "allowUnusedLabels",
      "allowUnreachableCode",
      "noPropertyAccessFromIndexSignature",
    ];
    for (const flag of strictFlags) {
      const presetValue = preset[flag];
      const rootValue = dotfiles[flag];
      expect(rootValue).toBe(presetValue);
    }
    expect(dotfiles).toMatchObject(preset);
  });

  test("good fixture passes tsgo", async () => {
    expect(await typecheck(join(FIXTURES, "ts/good/tsconfig.json"))).toBe(0);
  });

  test("bad fixture rejects unchecked index access", async () => {
    expect(await typecheck(join(FIXTURES, "ts/bad/tsconfig.json"))).not.toBe(0);
  });
});

describe("oxlint preset", () => {
  const rules = [
    ["no-explicit-any", "typescript/no-explicit-any"],
    ["no-throwing-parse", "eslint-js/no-restricted-syntax"],
  ] as const;
  for (const [name, rule] of rules) {
    test(`${name}: bad fails and good passes`, async () => {
      const run = async (which: "good" | "bad") => {
        const file = join(FIXTURES, `oxlint/${which}/${name}.ts`);
        const scratchFile = join(OXLINT_SCRATCH, `${which}-${name}.ts`);
        await writeFile(scratchFile, await readFile(file, "utf8"));
        const result = Bun.spawn(
          [
            "bunx",
            "--bun",
            "oxlint",
            "-c",
            join(ROOT, ".oxlintrc.json"),
            "--format",
            "json",
            scratchFile,
          ],
          { cwd: ROOT, timeout: 60_000, stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(result.stdout).text(),
          new Response(result.stderr).text(),
          result.exited,
        ]);
        const report = jsonOf(OxReport).safeParse(stdout);
        if (!report.success)
          return expect.unreachable(
            `oxlint gave no JSON report (exit ${exitCode}): ${stderr}`,
          );
        expect(report.data.number_of_files).toBe(1);
        return { exit: exitCode, diagnostics: report.data.diagnostics };
      };
      expect((await run("good")).exit).toBe(0);
      const bad = await run("bad");
      expect(bad.exit).not.toBe(0);
      if (name === "no-explicit-any")
        expect(
          bad.diagnostics.some((item) => JSON.stringify(item).includes(rule)),
        ).toBe(true);
      else
        expect(
          bad.diagnostics.some((item) =>
            item.message.includes("throwing `.parse"),
          ),
        ).toBe(true);
    }, 60_000);
  }
});
