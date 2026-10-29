import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { applyToolChangesets } from "../land-changesets.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  lintToolChangesets,
  recordLandReleaseCandidate,
  toolDiffEntries,
  toolChangesetProblems,
  type ToolDiffEntry,
} from "../lint-tool-changesets.ts";

const tool = "agx";
const packagePath = `tools/${tool}/package.json`;
const changelogPath = `tools/${tool}/CHANGELOG.md`;
const changePath = `tools/${tool}/.changes/fix-worker-release.md`;
const packageAt = (version: string): string =>
  JSON.stringify({ name: tool, version });
const validChange =
  "---\nbump: patch\n---\n\nFix worker release instructions\n";

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

const jj = async (cwd: string, args: string[]): Promise<string> => {
  const result = await runProcess(
    [
      "jj",
      "--config",
      "user.name=Fixture",
      "--config",
      "user.email=fixture@example.test",
      ...args,
    ],
    { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 15_000 },
  );
  expect(result.stderr).not.toContain("Error:");
  expect(result.exitCode).toBe(0);
  return result.stdout.trim();
};

test("alpha releases after the fork do not count as worker edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "versionguard-fork-"));
  temporary.push(root);
  const main = join(root, "main");
  const worker = join(root, "worker");
  await mkdir(main);
  await jj(root, ["git", "init", "--colocate", main]);
  await mkdir(join(main, `tools/${tool}/.changes`), { recursive: true });
  const originalChangelog = "# Changelog\n\n- Original release\n";
  await writeFile(join(main, packagePath), packageAt("4.7.0"));
  await writeFile(join(main, changelogPath), originalChangelog);
  await jj(main, ["commit", "-m", "seed tool"]);
  await jj(main, ["bookmark", "set", "alpha", "-r", "@-"]);
  await jj(main, [
    "workspace",
    "add",
    "--name",
    "worker",
    "--revision",
    "alpha",
    worker,
  ]);

  await writeFile(join(main, packagePath), packageAt("4.8.0"));
  await writeFile(
    join(main, changelogPath),
    "# Changelog\n\n- Land-generated release\n",
  );
  await jj(main, ["commit", "-m", "land another ticket"]);
  await jj(main, ["bookmark", "set", "alpha", "-r", "@-"]);

  await mkdir(join(worker, `tools/${tool}/.changes`), { recursive: true });
  await writeFile(join(worker, changePath), validChange);
  expect(await lintToolChangesets(worker)).toEqual([]);

  await writeFile(join(worker, packagePath), packageAt("4.7.1"));
  expect((await lintToolChangesets(worker))?.join("\n")).toContain(
    "package version changed",
  );
  await writeFile(join(worker, packagePath), packageAt("4.7.0"));
  await writeFile(
    join(worker, changelogPath),
    `${originalChangelog}\n- Hand edit\n`,
  );
  expect((await lintToolChangesets(worker))?.join("\n")).toContain(
    "CHANGELOG.md is written by land",
  );
}, 30_000);

function lint(
  entries: ToolDiffEntry[],
  files: Record<string, string>,
  baseFiles: Record<string, string> = {},
): string[] {
  return toolChangesetProblems(entries, {
    current: (path) => files[path],
    base: (path) => baseFiles[path],
  });
}

test("a correctly shaped slug changeset passes", () => {
  expect(
    lint([{ path: changePath, status: "A" }], { [changePath]: validChange }),
  ).toEqual([]);
});

test("a manually changed tool version fails with the generator command", () => {
  const problems = lint(
    [{ path: packagePath, status: "M" }],
    { [packagePath]: packageAt("4.8.0") },
    { [packagePath]: packageAt("4.7.0") },
  );

  expect(problems.join("\n")).toContain(
    "tools/agx/package.json: package version changed in the workspace diff",
  );
  expect(problems.join("\n")).toContain("mise run changeset -- agx patch");
  expect(problems.join("\n")).toContain('"Describe the user-visible change"');
});

test("a hand-edited changelog fails and points to a changeset", () => {
  const problems = lint([{ path: changelogPath, status: "M" }], {
    [changelogPath]: "# Changelog\n",
  });

  expect(problems.join("\n")).toContain("CHANGELOG.md is written by land");
  expect(problems.join("\n")).toContain("mise run changeset -- agx patch");
});

test("version-named and malformed changesets fail", () => {
  const versionPath = `tools/${tool}/.changes/1.4.2.md`;
  const malformedPath = `tools/${tool}/.changes/bad-shape.md`;
  const problems = lint(
    [
      { path: versionPath, status: "A" },
      { path: malformedPath, status: "A" },
    ],
    {
      [versionPath]: validChange,
      [malformedPath]: "---\nbump: patch\n---\n\n- already a bullet\n",
    },
  );

  expect(problems.join("\n")).toContain("filename must be a descriptive slug");
  expect(problems.join("\n")).toContain("entry must be plain text");
});

test("unrelated manifest edits and deleted changesets pass", () => {
  const deletedPath = `tools/${tool}/.changes/old-entry.md`;
  expect(
    lint(
      [
        { path: packagePath, status: "M" },
        { path: deletedPath, status: "D" },
      ],
      {
        [packagePath]:
          '{"name":"agx","version":"4.7.0","description":"updated"}',
      },
      { [packagePath]: packageAt("4.7.0") },
    ),
  ).toEqual([]);
});

test("the alpha-to-workspace fixture diff identifies adds, edits, and deletes", () => {
  expect(
    toolDiffEntries(
      new Map([
        [packagePath, packageAt("4.7.0")],
        [`tools/${tool}/.changes/old-entry.md`, validChange],
      ]),
      new Map([
        [packagePath, packageAt("4.8.0")],
        [`tools/${tool}/.changes/new-entry.md`, validChange],
      ]),
    ),
  ).toEqual([
    { status: "A", path: `tools/${tool}/.changes/new-entry.md` },
    { status: "D", path: `tools/${tool}/.changes/old-entry.md` },
    { status: "M", path: packagePath },
  ]);
});

test("the old release environment flag cannot skip the guard", async () => {
  const result = await runProcess(["bun", "scripts/lint-tool-changesets.ts"], {
    cwd: `${import.meta.dir}/../..`,
    env: { ...process.env, LAND_RELEASE_COMMIT: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  expect([0, 1, 2]).toContain(result.exitCode);
  expect(result.stdout + result.stderr).toContain("tool changesets:");
});

async function runProcess(
  argv: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
    timeout?: number;
  },
) {
  const child = Bun.spawn(argv, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 15_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("guard accepts the same layout variants as alpha's changeset parser", () => {
  for (const content of [
    "bump: minor\nNo delimiters or blank line\n",
    "---\nbump: major\n---\nNo blank line\n",
  ])
    expect(
      lint([{ path: changePath, status: "A" }], { [changePath]: content }),
    ).toEqual([]);
});

test("invalid descriptive slugs are rejected", () => {
  const path = "tools/agx/.changes/Bad_slug.md";
  expect(
    lint([{ path, status: "A" }], { [path]: validChange }).join("\n"),
  ).toContain("lowercase letters, numbers, and hyphens");
});

test("missing alpha fails closed instead of passing", async () => {
  const root = await mkdtemp(join(tmpdir(), "versionguard-no-alpha-"));
  temporary.push(root);
  await jj(root, ["git", "init", "--colocate", "."]);
  expect(await lintToolChangesets(root)).toBeUndefined();
});

test("repo guidance delegates tool release outputs to land", async () => {
  const [readme, skill] = await Promise.all([
    readFile(join(import.meta.dir, "../../README.md"), "utf8"),
    readFile(
      join(import.meta.dir, "../../agents/skills/writing-bun-scripts/SKILL.md"),
      "utf8",
    ),
  ]);
  expect(readme).toContain(
    'mise run changeset -- <tool> <patch|minor|major> "<entry>"',
  );
  expect(readme).toContain("Tickets do not edit");
  expect(readme).toContain("At land,");
  expect(skill).toContain("`land` writes those release outputs.");
});

async function releaseFixture(workerChangelog = false) {
  const root = await mkdtemp(join(tmpdir(), "versionguard-release-sequence-"));
  temporary.push(root);
  await jj(root, ["git", "init", "--colocate", "."]);
  await mkdir(join(root, "tools/agx/.changes"), { recursive: true });
  await writeFile(join(root, packagePath), packageAt("4.7.0"));
  await writeFile(
    join(root, changelogPath),
    "# Changelog\n\n- Original release\n",
  );
  await jj(root, ["commit", "-m", "seed release inputs"]);
  await jj(root, ["bookmark", "set", "alpha", "-r", "@-"]);
  const base = await jj(root, [
    "log",
    "--no-graph",
    "-r",
    "alpha",
    "-T",
    "commit_id",
  ]);
  await writeFile(join(root, changePath), validChange);
  if (workerChangelog)
    await writeFile(
      join(root, changelogPath),
      "# Changelog\n\n- Worker edit\n",
    );
  const candidate = await jj(root, [
    "log",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  ]);
  return { root, base, candidate, date: "2026-10-17" };
}

test("release followed by the commit gate accepts only reproducible land outputs", async () => {
  const { root, base, candidate, date } = await releaseFixture();
  const released = await applyToolChangesets(root, date);
  expect(released.isOk()).toBe(true);
  expect((await lintToolChangesets(root))?.join("\n")).toContain(
    "CHANGELOG.md is written by land",
  );
  await recordLandReleaseCandidate(root, base, candidate, date);
  // The commit wrapper snapshots the released tree before invoking its gates.
  await jj(root, ["status"]);
  expect(await lintToolChangesets(root)).toEqual([]);
  expect(await readFile(join(root, packagePath), "utf8")).toContain(
    '"version": "4.7.1"',
  );
  await writeFile(
    join(root, changelogPath),
    "# Changelog\n\n- Tampered after release\n",
  );
  expect((await lintToolChangesets(root))?.join("\n")).toContain(
    "differs from the release reproduced",
  );
}, 30_000);

test("a worker changelog edit still fails after release even with a candidate record", async () => {
  const { root, base, candidate, date } = await releaseFixture(true);
  await recordLandReleaseCandidate(root, base, candidate, date);
  expect((await applyToolChangesets(root, date)).isOk()).toBe(true);
  await jj(root, ["status"]);
  expect((await lintToolChangesets(root))?.join("\n")).toContain(
    "CHANGELOG.md is written by land",
  );
}, 30_000);

test("a forged release record cannot change the fork point", async () => {
  const { root, candidate, date } = await releaseFixture();
  await recordLandReleaseCandidate(root, candidate, candidate, date);
  expect(await lintToolChangesets(root)).toBeUndefined();
}, 30_000);
