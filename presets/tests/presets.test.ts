import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { bunVersionError } from "../typescript/require-bun.ts";

const ROOT = join(import.meta.dir, "../..");
const FIXTURES = join(import.meta.dir, "fixtures");
const OXLINT_SCRATCH = await mkdtemp(join(tmpdir(), "preset-oxlint-"));
afterAll(async () => {
  await rm(OXLINT_SCRATCH, { recursive: true, force: true });
});
const ShowConfig = z.looseObject({
  extends: z.string().optional(),
  compilerOptions: z.record(z.string(), z.unknown()).optional(),
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
  const config = await Bun.file(path).text();
  const parsed = ShowConfig.safeParse(Bun.JSONC.parse(config));
  if (!parsed.success)
    return expect.unreachable(`tsconfig: ${parsed.error.message}`);
  const inherited =
    parsed.data.extends === undefined
      ? {}
      : await showConfig(resolve(dirname(path), parsed.data.extends));
  return { ...inherited, ...parsed.data.compilerOptions };
}

async function typecheck(path: string): Promise<number> {
  const result = Bun.spawn(["bun", "check", "--project", path], {
    cwd: ROOT,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  await Promise.all([
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);
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

  test("typecheck refuses Bun below 1.4.3 with a clear message", () => {
    expect(bunVersionError("1.4.2")).toBe(
      "typecheck requires Bun >= 1.4.3 (found 1.4.2)",
    );
    expect(bunVersionError("1.4.3-canary.1")).toBe(
      "typecheck requires Bun >= 1.4.3 (found 1.4.3-canary.1)",
    );
    expect(bunVersionError("1.4.3")).toBeUndefined();
  });

  test("good fixture passes bun check", async () => {
    expect(await typecheck(join(FIXTURES, "ts/good/tsconfig.json"))).toBe(0);
  });

  test("bad fixture rejects unchecked index access", async () => {
    expect(await typecheck(join(FIXTURES, "ts/bad/tsconfig.json"))).not.toBe(0);
  });
});

describe("oxlint preset", () => {
  const rules = [
    ["no-explicit-any", "typescript/no-explicit-any"],
    ["ban-ts-comment", "typescript/ban-ts-comment"],
    ["no-non-null-assertion", "typescript/no-non-null-assertion"],
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
            join(ROOT, "presets/typescript/house.oxlintrc.json"),
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
      if (name === "ban-ts-comment")
        expect(
          bad.diagnostics.filter((item) => JSON.stringify(item).includes(rule)),
        ).toHaveLength(3);
      if (name !== "no-throwing-parse")
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
