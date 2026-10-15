import { access as accessPath } from "node:fs/promises";

import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyToolChangesets } from "../land-changesets.ts";
import { lintChangesets } from "../lint-changesets.ts";

const pathExists = (path: Parameters<typeof accessPath>[0]) =>
  accessPath(path).then(
    () => true,
    () => false,
  );

const repo = join(import.meta.dir, "../..");

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "land-changesets-test-"));
  temporary.push(root);
  const tool = join(root, "tools", "sample");
  await mkdir(join(tool, ".changes"), { recursive: true });
  await writeFile(
    join(tool, "package.json"),
    '{\n  "name": "sample",\n  "version": "1.2.3"\n}\n',
  );
  await writeFile(
    join(tool, "CHANGELOG.md"),
    "# Changelog\n\n## 1.2.3 — 2026-10-01\n\n- Existing entry\n",
  );
  return { root, tool, changes: join(tool, ".changes") };
}

test("two changesets produce one highest bump and retain both entries", async () => {
  const { root, tool, changes } = await fixture();
  await writeFile(
    join(changes, "one.md"),
    "---\nbump: patch\n---\n\nFix first issue\n",
  );
  await writeFile(
    join(changes, "two.md"),
    "---\nbump: minor\n---\n\nAdd second feature\n",
  );

  const result = await applyToolChangesets(root, "2026-10-14");

  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value.releases).toEqual([
    { tool: "sample", version: "1.3.0", entries: 2 },
  ]);
  expect(result.value.paths).toEqual([
    "tools/sample/.changes/one.md",
    "tools/sample/.changes/two.md",
    "tools/sample/CHANGELOG.md",
    "tools/sample/package.json",
  ]);
  expect(result.value.consumedChangesets).toEqual([
    "tools/sample/.changes/one.md",
    "tools/sample/.changes/two.md",
  ]);
  expect(result.value.releaseFiles).toEqual([
    "tools/sample/CHANGELOG.md",
    "tools/sample/package.json",
  ]);
  expect(await readFile(join(tool, "package.json"), "utf8")).toContain(
    '"version": "1.3.0"',
  );
  expect(await readFile(join(tool, "CHANGELOG.md"), "utf8")).toBe(
    "# Changelog\n\n## 1.3.0 — 2026-10-14\n\n- Fix first issue\n- Add second feature\n\n## 1.2.3 — 2026-10-01\n\n- Existing entry\n",
  );
  expect(await pathExists(join(changes, "one.md"))).toBe(false);
  expect(await pathExists(join(changes, "two.md"))).toBe(false);
});

test("the repo Markdown formatter output parses as one changeset entry", async () => {
  const { root, tool, changes } = await fixture();
  const change = join(changes, "formatter-roundtrip.md");
  await writeFile(
    change,
    "---\nbump: patch\n---\n\nKeep user-session dbus and gnupg paths and accept --no-progress for apply\n",
  );
  const formatted = await runProcess(
    [await rumdlBinary(), "fmt", "--config", join(repo, ".rumdl.toml"), change],
    { cwd: repo, stdout: "pipe", stderr: "pipe" },
  );
  expect(
    `${formatted.exitCode}: ${formatted.stderr.toString()}${formatted.stdout.toString()}`,
  ).toStartWith("0:");

  const result = await applyToolChangesets(root, "2026-10-14");

  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value.releases).toEqual([
    { tool: "sample", version: "1.2.4", entries: 1 },
  ]);
  expect(await readFile(join(tool, "CHANGELOG.md"), "utf8")).toContain(
    "- Keep user-session dbus and gnupg paths and accept --no-progress for apply",
  );
});

test("landing without changesets leaves version and changelog unchanged", async () => {
  const { root, tool } = await fixture();
  const packageBefore = await readFile(join(tool, "package.json"), "utf8");
  const changelogBefore = await readFile(join(tool, "CHANGELOG.md"), "utf8");

  const result = await applyToolChangesets(root, "2026-10-14");
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value).toEqual({
    paths: [],
    consumedChangesets: [],
    releaseFiles: [],
    releases: [],
  });
  expect(await readFile(join(tool, "package.json"), "utf8")).toBe(
    packageBefore,
  );
  expect(await readFile(join(tool, "CHANGELOG.md"), "utf8")).toBe(
    changelogBefore,
  );
});

test("gate accepts every supported changeset layout", async () => {
  const { root, changes } = await fixture();
  const layouts = [
    "---\nbump: patch\n---\n\nCanonical layout\n",
    "bump: minor\nNo delimiters or blank line\n",
    "---\nbump: major\n---\nNo blank line\n",
    "bump: patch\n\nBlank line without delimiters\n",
  ];
  for (const [index, text] of layouts.entries()) {
    await writeFile(join(changes, `valid-${index}.md`), text);
  }

  expect(await lintChangesets(root)).toEqual([]);
});

test("gate names malformed changesets and gives the generator command", async () => {
  const { root, changes } = await fixture();
  await writeFile(
    join(changes, "two-lines.md"),
    "bump: patch\n\nFirst\nSecond\n",
  );
  await writeFile(join(changes, "unknown-bump.md"), "bump: huge\n\nEntry\n");
  await writeFile(join(changes, "empty.md"), "bump: minor\n\n\n");

  const problems = await lintChangesets(root);
  expect(problems).toHaveLength(3);
  for (const name of ["two-lines.md", "unknown-bump.md", "empty.md"])
    expect(problems.some((problem) => problem.includes(name))).toBe(true);
  for (const problem of problems)
    expect(problem).toContain(
      "mise run changeset -- <tool> <patch|minor|major>",
    );
});

test("land reports a malformed file with its path and generator command", async () => {
  const { root, changes } = await fixture();
  await writeFile(join(changes, "bad.md"), "bump: huge\n\nEntry\n");

  const result = await applyToolChangesets(root, "2026-10-14");
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toContain("bad.md");
    expect(result.error.message).toContain(
      "bump must be patch, minor, or major",
    );
    expect(result.error.message).toContain("mise run changeset --");
  }
});

// mise.toml pins rumdl, but a bare `bun test` has no mise PATH: ask mise where the pinned binary is.
async function rumdlBinary(): Promise<string> {
  const onPath = Bun.which("rumdl");
  if (onPath !== null) return onPath;
  const located = await runProcess(["mise", "which", "rumdl"], { cwd: repo });
  const path = located.stdout.toString().trim();
  return located.exitCode === 0 && path !== "" ? path : "rumdl";
}

// Drain both pipes while waiting for the bounded subprocess.
async function runProcess(
  argv: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const child = Bun.spawn(argv, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 120_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
    child.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
