import { afterAll, expect, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const ROOT = resolve(import.meta.dir, "../..");
const PRESET = join(ROOT, "presets/textlint");
const scratch = await mkdtemp(join(tmpdir(), "preset-textlint-"));
const files = (
  await readFile(join(import.meta.dir, "fixtures/textlint/files.txt"), "utf8")
)
  .trim()
  .split("\n");
const Profile = z.looseObject({
  rules: z.looseObject({ prh: z.object({ rulePaths: z.array(z.string()) }) }),
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const child = Bun.spawn(
    [process.execPath, join(ROOT, "presets/src/cli.ts"), ...args],
    {
      cwd: scratch,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("textlint applies all inventory assets to an empty repo and detects drift", async () => {
  const repo = await mkdtemp(join(scratch, "repo-"));
  expect(await readdir(repo)).toEqual([]);
  const listed = await run("list");
  expect(listed.exit).toBe(0);
  expect(listed.stdout).toContain("textlint\t");
  expect((await run("diff", "textlint", "--to", repo)).exit).toBe(1);
  const applied = await run("apply", "textlint", "--to", repo);
  expect(applied.exit).toBe(0);
  expect(applied.stderr).toBe("");
  expect((await readdir(repo)).toSorted()).toEqual(files.toSorted());
  for (const file of files) {
    const source = file === ".textlintrc.json" ? "textlintrc.json" : file;
    expect(await readFile(join(repo, file))).toEqual(
      await readFile(join(PRESET, source)),
    );
    // The wrapper's legacy asset path must resolve to the sole maintained source.
    expect(
      await realpath(join(ROOT, "agents/skills/linting-prose/assets", source)),
    ).toBe(await realpath(join(PRESET, source)));
    if (!file.endsWith(".json")) continue;
    const profile = jsonOf(Profile).safeParse(
      await readFile(join(repo, file), "utf8"),
    );
    if (!profile.success) expect.unreachable(profile.error.message);
    for (const dictionary of profile.data.rules.prh.rulePaths)
      expect(await Bun.file(join(repo, dictionary)).exists()).toBe(true);
  }
  expect(await run("diff", "textlint", "--to", repo)).toEqual({
    stdout: "preset: textlint is up to date\n",
    stderr: "",
    exit: 0,
  });
  await writeFile(join(repo, "prh-house.yml"), "version: 1\nrules: []\n");
  const drift = await run("diff", "textlint", "--to", repo);
  expect(drift.exit).toBe(1);
  expect(drift.stdout).toContain("--- prh-house.yml (target)");
  expect((await run("apply", "textlint", "--to", repo)).exit).toBe(0);
  expect((await run("diff", "textlint", "--to", repo)).exit).toBe(0);
}, 60_000);
