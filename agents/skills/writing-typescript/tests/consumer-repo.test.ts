// The canonical presets/typescript and presets/typescript files are the house setup another repo adopts
// (firedancer, 2026-10-06). It must not drift from dotfiles itself: the same pins, the same strict
// compilerOptions, and — rendered through the repo's own render-oxlintrc --repo — the same rules.
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodedJson } from "../../../hooks/tests/decode.ts";
import { z } from "../../../hooks/zod.ts";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const FIXTURE = join(ROOT, "presets", "typescript");
const LOCAL_EXAMPLE = join(ROOT, "presets", "typescript", "local.example.toml");
const Pkg = z.looseObject({
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
});
const ShowConfig = z.looseObject({
  compilerOptions: z.record(z.string(), z.unknown()),
});
const Rc = z.looseObject({ rules: z.record(z.string(), z.unknown()) });
const read = (path: string): Promise<string> => readFile(path, "utf8");

async function run(cmd: string[], cwd = ROOT) {
  const proc = Bun.spawn(cmd, {
    cwd,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/** dotfiles' version of exactly the packages the fixture pins (a package dotfiles lacks reads undefined). */
const houseVersions = (
  fixture: Record<string, string>,
  house: Record<string, string>,
): Record<string, string | undefined> =>
  Object.fromEntries(Object.keys(fixture).map((name) => [name, house[name]]));

/** The compilerOptions tsgo actually applies for `dir/tsconfig.json` (comments and defaults resolved). */
async function effective(dir: string): Promise<Record<string, unknown>> {
  const r = await run([
    "bunx",
    "--bun",
    "tsgo",
    "--showConfig",
    "-p",
    join(dir, "tsconfig.json"),
  ]);
  expect(r.exitCode).toBe(0);
  return decodedJson(ShowConfig, r.stdout).compilerOptions;
}

describe("consumer-repo fixture", () => {
  test("every pinned package has exactly the dotfiles version", async () => {
    const [oursText, theirsText] = await Promise.all([
      read(join(ROOT, "package.json")),
      read(join(FIXTURE, "package.json")),
    ]);
    const ours = decodedJson(Pkg, oursText);
    const theirs = decodedJson(Pkg, theirsText);
    expect(houseVersions(theirs.dependencies, ours.dependencies)).toEqual(
      theirs.dependencies,
    );
    expect(houseVersions(theirs.devDependencies, ours.devDependencies)).toEqual(
      theirs.devDependencies,
    );
  });

  test("tsconfig applies the same compilerOptions as dotfiles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "consumer-tsconfig-"));
    const applied = await run([
      "bun",
      join(ROOT, "presets", "src", "cli.ts"),
      "apply",
      "typescript",
      "--to",
      dir,
    ]);
    expect(applied.exitCode).toBe(0);
    await writeFile(join(dir, "x.ts"), "export const x = 1;\n"); // tsgo wants one input
    expect(await effective(dir)).toEqual(await effective(ROOT));
  });

  test("the oxlint preset renders dotfiles' house rules and seeds local ignores", async () => {
    const dir = await mkdtemp(join(tmpdir(), "consumer-oxlint-"));
    const r = await run([
      "bun",
      join(ROOT, "presets", "src", "cli.ts"),
      "apply",
      "typescript",
      "--to",
      dir,
    ]);
    expect(r.exitCode).toBe(0);
    expect(await read(join(dir, "oxlint-policy.local.toml"))).toBe(
      await read(LOCAL_EXAMPLE),
    );
    const [oursText, theirsText] = await Promise.all([
      read(join(ROOT, ".oxlintrc.json")),
      read(join(dir, ".oxlintrc.json")),
    ]);
    const ours = decodedJson(Rc, oursText);
    const theirs = decodedJson(Rc, theirsText);
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

  test("the mise tasks parse and name the gates the SKILL.md section promises", async () => {
    const Tasks = z.looseObject({
      tasks: z.record(z.string(), z.looseObject({ run: z.string() })),
    });
    const parsed = Tasks.safeParse(
      Bun.TOML.parse(await read(join(FIXTURE, "mise-tasks.toml"))),
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
    const theirs = await import("../../../../presets/typescript/zod.ts");
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

// lint:ts must fail CLOSED (Tiger ledger, 2026-10-06). In a jj secondary workspace there is no Git
// index: `git diff --cached` exits 129, the old body read that as "no staged .ts files" and exited 0
// — a gate reporting a pass it never checked (measured on firedancer-ts, Vast).
describe("consumer-repo lint:ts", () => {
  const Tasks = z.looseObject({
    tasks: z.record(z.string(), z.looseObject({ run: z.string() })),
  });
  const body = async (): Promise<string> => {
    const tasks = decodedJson(
      Tasks,
      JSON.stringify(
        Bun.TOML.parse(await read(join(FIXTURE, "mise-tasks.toml"))),
      ),
    ).tasks;
    return tasks["lint:ts"]?.run ?? "";
  };
  const runIn = async (dir: string) => run(["sh", "-c", await body()], dir);

  test("outside a Git checkout it refuses and says why, never 'no staged files'", async () => {
    const r = await runIn(await mkdtemp(join(tmpdir(), "lint-ts-nogit-")));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("cannot read the Git index");
    expect(r.stdout).not.toContain("no staged .ts files");
  });

  test("in a Git checkout with nothing staged it passes, saying so", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lint-ts-git-"));
    expect((await run(["git", "init", "-q"], dir)).exitCode).toBe(0);
    const r = await runIn(dir);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("no staged .ts files");
  });
});
