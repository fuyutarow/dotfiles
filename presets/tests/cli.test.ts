import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPolicy, renderOxlintrc } from "../../scripts/render-oxlintrc.ts";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-manifests-"));
const fixtureRoot = join(scratch, "dotfiles");
const cliPath = join(fixtureRoot, "presets/src/cli.ts");

beforeAll(async () => {
  await mkdir(join(fixtureRoot, "presets"), { recursive: true });
  for (const directory of [
    "src",
    "typescript",
    "python",
    "rust",
    "julia",
    "latex",
  ])
    await cp(
      join(ROOT, "presets", directory),
      join(fixtureRoot, "presets", directory),
      { recursive: true },
    );
  for (const directory of ["agents", "scripts", "node_modules"])
    await symlink(join(ROOT, directory), join(fixtureRoot, directory));
  await mkdir(join(fixtureRoot, "presets/demo"));
  await writeFile(
    join(fixtureRoot, "presets/demo/preset.toml"),
    `name = "demo"
description = "Demo configuration"
files = [{ source = "config.toml", destination = ".config/demo.toml" }]
check = ["bun test presets/demo/tests"]
`,
  );
  await writeFile(
    join(fixtureRoot, "presets/demo/config.toml"),
    "enabled = true\n",
  );
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd: scratch,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

async function target() {
  return mkdtemp(join(scratch, "target-"));
}

describe("manifest preset CLI", () => {
  test("every language applies to an empty repo and immediately has no diff", async () => {
    const languages = ["typescript", "python", "rust", "julia", "latex"];
    const listed = Bun.spawn(
      [process.execPath, join(ROOT, "presets/src/cli.ts"), "list"],
      {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(listed.stdout).text(),
      new Response(listed.stderr).text(),
      listed.exited,
    ]);
    expect(exit).toBe(0);
    expect(stderr).toBe("");
    expect(
      stdout
        .trim()
        .split("\n")
        .map((line) => line.split("\t")[0]),
    ).toEqual(languages);
    for (const language of languages) {
      const repo = await target();
      expect(
        (await run("apply", language, "--to", repo, "--dry-run")).exit,
      ).toBe(0);
      expect((await run("apply", language, "--to", repo)).exit).toBe(0);
      expect((await run("diff", language, "--to", repo)).exit).toBe(0);
    }
  }, 60_000);

  test("a directory-only demo addition lists, applies, and diffs", async () => {
    const listed = await run("list");
    expect(listed.exit).toBe(0);
    expect(
      listed.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t")[0]),
    ).toEqual(["typescript", "python", "rust", "julia", "latex", "demo"]);
    const repo = await target();
    expect(await run("apply", "demo", "--to", repo, "--dry-run")).toEqual({
      exit: 0,
      stderr: "",
      stdout: "preset: would write .config/demo.toml\n",
    });
    expect(await Bun.file(join(repo, ".config/demo.toml")).exists()).toBe(
      false,
    );
    expect((await run("diff", "demo", "--to", repo)).exit).toBe(1);
    expect(await run("apply", "demo", "--to", repo)).toEqual({
      exit: 0,
      stderr: "",
      stdout: "preset: wrote .config/demo.toml\n",
    });
    expect(await readFile(join(repo, ".config/demo.toml"), "utf8")).toBe(
      "enabled = true\n",
    );
    expect(await run("diff", "demo", "--to", repo)).toEqual({
      exit: 0,
      stderr: "",
      stdout: "preset: demo is up to date\n",
    });
    expect((await run("diff", "demo", repo)).exit).toBe(0);
    await writeFile(join(repo, ".config/demo.toml"), "enabled = false\n");
    expect(await run("diff", "demo", "--to", repo)).toEqual({
      exit: 1,
      stderr: "",
      stdout:
        "--- .config/demo.toml (target)\n+++ .config/demo.toml (preset)\n@@ -1 +1 @@\n-enabled = false\n+enabled = true\n",
    });
  });

  test("typescript copies compiler files without policy copies, preserves local ignores, and renders oxlint", async () => {
    const repo = await target();
    expect(await run("apply", "typescript", "--to", repo)).toEqual({
      exit: 0,
      stderr: "",
      stdout:
        "preset: wrote tsconfig.json\npreset: wrote package.json\npreset: wrote zod.ts\npreset: wrote mise-tasks.toml\npreset: wrote .oxlintrc.json\n",
    });
    for (const file of [
      "tsconfig.json",
      "package.json",
      "zod.ts",
      "mise-tasks.toml",
    ])
      expect(await Bun.file(join(repo, file)).bytes()).toEqual(
        await Bun.file(join(ROOT, "presets/typescript", file)).bytes(),
      );
    expect(await Bun.file(join(repo, "oxlint-policy.toml")).exists()).toBe(
      false,
    );
    expect(
      await Bun.file(join(repo, "oxlint-policy.local.toml")).exists(),
    ).toBe(false);
    expect(await run("diff", "typescript", repo)).toEqual({
      exit: 0,
      stderr: "",
      stdout: "preset: typescript is up to date\n",
    });
    const rendered = await readFile(join(repo, ".oxlintrc.json"), "utf8");
    await writeFile(
      join(repo, "oxlint-policy.local.toml"),
      "schema = 1\nignore = []\n",
    );
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    expect(await readFile(join(repo, ".oxlintrc.json"), "utf8")).toBe(rendered);
    await rm(join(repo, "oxlint-policy.local.toml"));
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    expect(await readFile(join(repo, ".oxlintrc.json"), "utf8")).toBe(rendered);
    const local =
      'schema = 1\n[[ignore]]\npattern = "generated/**"\nreason = "Generated fixture"\n';
    await writeFile(join(repo, "oxlint-policy.local.toml"), local);
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    expect(await readFile(join(repo, "oxlint-policy.local.toml"), "utf8")).toBe(
      local,
    );
    const base = await loadPolicy();
    if (!base.ok) expect.unreachable(base.error);
    expect(await readFile(join(repo, ".oxlintrc.json"), "utf8")).toBe(
      renderOxlintrc({
        ...base.value,
        ignore: [
          ...base.value.ignore,
          { pattern: "generated/**", reason: "Generated fixture" },
        ],
        custom: base.value.custom.filter((rule) => rule.scope === "house"),
      }),
    );
    expect((await run("diff", "typescript", "--to", repo)).exit).toBe(0);
  });

  test("typescript reports a stale copy without overwriting or reading it", async () => {
    const repo = await target();
    const stale = join(repo, "oxlint-policy.toml");
    const content = "stale unused policy, deliberately invalid TOML\n";
    await writeFile(stale, content);
    for (const flags of [["--dry-run"], []]) {
      const result = await run("apply", "typescript", "--to", repo, ...flags);
      expect(result.exit).toBe(0);
      expect(result.stdout).toContain("stale oxlint-policy.toml exists");
      expect(await readFile(stale, "utf8")).toBe(content);
    }
    expect((await run("diff", "typescript", repo)).exit).toBe(0);
    expect(
      await Bun.file(join(repo, "oxlint-policy.local.toml")).exists(),
    ).toBe(false);
  });

  test("typescript dry-run seeds nothing and invalid local policy prevents rendering", async () => {
    const repo = await target();
    expect(
      (await run("apply", "typescript", "--to", repo, "--dry-run")).exit,
    ).toBe(0);
    expect(
      await Bun.file(join(repo, "oxlint-policy.local.toml")).exists(),
    ).toBe(false);
    expect(await Bun.file(join(repo, ".oxlintrc.json")).exists()).toBe(false);
    expect(await Bun.file(join(repo, "oxlint-policy.toml")).exists()).toBe(
      false,
    );
    await writeFile(
      join(repo, "oxlint-policy.local.toml"),
      "schema = 1\nrules = {}\n",
    );
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(2);
    expect(await Bun.file(join(repo, ".oxlintrc.json")).exists()).toBe(false);
  });

  test("missing source reports its path and prevents writes", async () => {
    const path = join(fixtureRoot, "presets/demo/config.toml");
    await rm(path);
    const repo = await target();
    const result = await run("apply", "demo", "--to", repo);
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain(`missing source: ${path}`);
    expect(await Bun.file(join(repo, ".config/demo.toml")).exists()).toBe(
      false,
    );
    await writeFile(path, "enabled = true\n");
  });

  for (const args of [
    ["list", "typescript"],
    ["diff", "demo", "--dry-run"],
    ["apply", "unknown"],
    ["apply", "demo"],
    ["diff", "demo", "a", "--to", "b"],
    ["apply", "demo", "a", "--to", "b"],
    ["list", "--__proto__"],
  ]) {
    test(`rejects invalid arguments: ${JSON.stringify(args)}`, async () => {
      expect((await run(...args)).exit).not.toBe(0);
    });
  }
});
