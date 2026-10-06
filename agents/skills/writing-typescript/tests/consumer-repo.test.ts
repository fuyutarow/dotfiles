// The consumer-repo fixture (assets/consumer-repo) is the house TypeScript setup another repo copies
// (firedancer, 2026-10-06). It must not drift from dotfiles itself: the same pins, the same strict
// compilerOptions, and — rendered through the repo's own render-oxlintrc --repo — the same rules.
import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodedJson } from "../../../hooks/tests/decode.ts";
import { z } from "../../../hooks/zod.ts";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const FIXTURE = join(import.meta.dir, "..", "assets", "consumer-repo");
const Pkg = z.looseObject({
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
});
const ShowConfig = z.looseObject({
  compilerOptions: z.record(z.string(), z.unknown()),
});
const Rc = z.looseObject({ rules: z.record(z.string(), z.unknown()) });
const read = (path: string): string => readFileSync(path, "utf8");

/** dotfiles' version of exactly the packages the fixture pins (a package dotfiles lacks reads undefined). */
const houseVersions = (
  fixture: Record<string, string>,
  house: Record<string, string>,
): Record<string, string | undefined> =>
  Object.fromEntries(Object.keys(fixture).map((name) => [name, house[name]]));

/** The compilerOptions tsgo actually applies for `dir/tsconfig.json` (comments and defaults resolved). */
function effective(dir: string): Record<string, unknown> {
  const r = Bun.spawnSync(
    ["bunx", "--bun", "tsgo", "--showConfig", "-p", join(dir, "tsconfig.json")],
    {
      cwd: ROOT,
      timeout: 60_000,
    },
  );
  return decodedJson(ShowConfig, r.stdout.toString()).compilerOptions;
}

describe("consumer-repo fixture", () => {
  test("every pinned package has exactly the dotfiles version", () => {
    const ours = decodedJson(Pkg, read(join(ROOT, "package.json")));
    const theirs = decodedJson(Pkg, read(join(FIXTURE, "package.json")));
    expect(houseVersions(theirs.dependencies, ours.dependencies)).toEqual(
      theirs.dependencies,
    );
    expect(houseVersions(theirs.devDependencies, ours.devDependencies)).toEqual(
      theirs.devDependencies,
    );
  });

  test("tsconfig applies the same compilerOptions as dotfiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "consumer-tsconfig-"));
    cpSync(join(FIXTURE, "tsconfig.json"), join(dir, "tsconfig.json"));
    writeFileSync(join(dir, "x.ts"), "export const x = 1;\n"); // tsgo wants one input
    expect(effective(dir)).toEqual(effective(ROOT));
  });

  test("rendered through render-oxlintrc --repo, the rules are dotfiles' rules", () => {
    const dir = mkdtempSync(join(tmpdir(), "consumer-oxlint-"));
    cpSync(
      join(FIXTURE, "oxlint-policy.local.toml"),
      join(dir, "oxlint-policy.local.toml"),
    );
    const r = Bun.spawnSync(
      [
        "bun",
        join(ROOT, "scripts", "render-oxlintrc.ts"),
        "--repo",
        dir,
        "--write",
      ],
      {
        timeout: 30_000,
      },
    );
    expect(r.exitCode).toBe(0);
    const ours = decodedJson(Rc, read(join(ROOT, ".oxlintrc.json")));
    const theirs = decodedJson(Rc, read(join(dir, ".oxlintrc.json")));
    // The house rules are dotfiles' own; only the dotfiles-scoped ones (the zod import
    // restriction: oxlint-policy.toml scope = "dotfiles") stay behind in dotfiles.
    const { "eslint/no-restricted-imports": ourImports, ...ourRest } =
      ours.rules;
    const { "eslint/no-restricted-imports": theirImports, ...theirRest } =
      theirs.rules;
    expect(theirRest).toEqual(ourRest);
    expect(JSON.stringify(ourImports)).toContain('"name":"zod"');
    expect(JSON.stringify(theirImports)).not.toContain('"name":"zod"');
  });

  test("the mise tasks parse and name the gates the SKILL.md section promises", () => {
    const Tasks = z.looseObject({
      tasks: z.record(z.string(), z.looseObject({ run: z.string() })),
    });
    const parsed = Tasks.safeParse(
      Bun.TOML.parse(read(join(FIXTURE, "mise-tasks.toml"))),
    );
    expect(parsed.success).toBe(true);
    const tasks = parsed.success ? parsed.data.tasks : {};
    expect(Object.keys(tasks).toSorted()).toEqual(
      [
        "lint:oxlint-policy",
        "lint:ts",
        "lint:ts:all",
        "oxlint:render",
        "typecheck",
      ].toSorted(),
    );
    expect(tasks["lint:ts"]?.run).toContain("git diff --cached");
  });
});

describe("consumer-repo zod.ts", () => {
  test("decodes JSON exactly like dotfiles' agents/hooks/zod.ts", async () => {
    const theirs = await import("../assets/consumer-repo/zod.ts");
    const ours = await import("../../../hooks/zod.ts");
    for (const text of ['{"a":1}', "[1,2]", "{", "", "null"]) {
      const a = theirs.jsonOf(theirs.z.unknown()).safeParse(text);
      const b = ours.jsonOf(ours.z.unknown()).safeParse(text);
      expect([text, a.success, a.data]).toEqual([text, b.success, b.data]);
    }
    const bad = theirs.jsonOf(theirs.z.number()).safeParse("{");
    expect(bad.success ? "" : (bad.error.issues[0]?.code ?? "")).toBe(
      "invalid_format",
    );
  });
});
