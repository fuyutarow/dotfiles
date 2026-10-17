// Consumers own copies of the strict compiler settings, pinned packages and oxlint config.
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodedJson } from "../../../hooks/tests/decode.ts";
import { z } from "../../../hooks/zod.ts";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const FIXTURE = join(ROOT, "presets", "typescript");
const Pkg = z.looseObject({
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
});
const ShowConfig = z.looseObject({
  compilerOptions: z.record(z.string(), z.unknown()),
});
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

  test("the oxlint preset supplies exact config and plugin copies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "consumer-oxlint-"));
    const result = await run([
      process.execPath,
      join(ROOT, "presets/src/cli.ts"),
      "apply",
      "typescript",
      "--to",
      dir,
    ]);
    expect(result.exitCode).toBe(0);
    for (const file of [".oxlintrc.json", "house-plugin.js"])
      expect(await read(join(dir, file))).toBe(await read(join(FIXTURE, file)));
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
