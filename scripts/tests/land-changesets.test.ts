import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyToolChangesets } from "../land-changesets.ts";
import { lintChangesets } from "../lint-changesets.ts";

const repo = join(import.meta.dir, "../..");

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "land-changesets-test-"));
  temporary.push(root);
  const tool = join(root, "tools", "sample");
  mkdirSync(join(tool, ".changes"), { recursive: true });
  writeFileSync(
    join(tool, "package.json"),
    '{\n  "name": "sample",\n  "version": "1.2.3"\n}\n',
  );
  writeFileSync(
    join(tool, "CHANGELOG.md"),
    "# Changelog\n\n## 1.2.3 — 2026-10-01\n\n- Existing entry\n",
  );
  return { root, tool, changes: join(tool, ".changes") };
}

test("two changesets produce one highest bump and retain both entries", () => {
  const { root, tool, changes } = fixture();
  writeFileSync(
    join(changes, "one.md"),
    "---\nbump: patch\n---\n\nFix first issue\n",
  );
  writeFileSync(
    join(changes, "two.md"),
    "---\nbump: minor\n---\n\nAdd second feature\n",
  );

  const result = applyToolChangesets(root, "2026-10-14");

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
  expect(readFileSync(join(tool, "package.json"), "utf8")).toContain(
    '"version": "1.3.0"',
  );
  expect(readFileSync(join(tool, "CHANGELOG.md"), "utf8")).toBe(
    "# Changelog\n\n## 1.3.0 — 2026-10-14\n\n- Fix first issue\n- Add second feature\n\n## 1.2.3 — 2026-10-01\n\n- Existing entry\n",
  );
  expect(existsSync(join(changes, "one.md"))).toBe(false);
  expect(existsSync(join(changes, "two.md"))).toBe(false);
});

test("the repo Markdown formatter output parses as one changeset entry", () => {
  const { root, tool, changes } = fixture();
  const change = join(changes, "formatter-roundtrip.md");
  writeFileSync(
    change,
    "---\nbump: patch\n---\n\nKeep user-session dbus and gnupg paths and accept --no-progress for apply\n",
  );
  const formatted = Bun.spawnSync(
    ["rumdl", "fmt", "--config", join(repo, ".rumdl.toml"), change],
    { cwd: repo, stdout: "pipe", stderr: "pipe" },
  );
  expect(
    `${formatted.exitCode}: ${formatted.stderr.toString()}${formatted.stdout.toString()}`,
  ).toStartWith("0:");

  const result = applyToolChangesets(root, "2026-10-14");

  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value.releases).toEqual([
    { tool: "sample", version: "1.2.4", entries: 1 },
  ]);
  expect(readFileSync(join(tool, "CHANGELOG.md"), "utf8")).toContain(
    "- Keep user-session dbus and gnupg paths and accept --no-progress for apply",
  );
});

test("landing without changesets leaves version and changelog unchanged", () => {
  const { root, tool } = fixture();
  const packageBefore = readFileSync(join(tool, "package.json"), "utf8");
  const changelogBefore = readFileSync(join(tool, "CHANGELOG.md"), "utf8");

  const result = applyToolChangesets(root, "2026-10-14");
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value).toEqual({
    paths: [],
    consumedChangesets: [],
    releaseFiles: [],
    releases: [],
  });
  expect(readFileSync(join(tool, "package.json"), "utf8")).toBe(packageBefore);
  expect(readFileSync(join(tool, "CHANGELOG.md"), "utf8")).toBe(
    changelogBefore,
  );
});

test("gate accepts every supported changeset layout", () => {
  const { root, changes } = fixture();
  const layouts = [
    "---\nbump: patch\n---\n\nCanonical layout\n",
    "bump: minor\nNo delimiters or blank line\n",
    "---\nbump: major\n---\nNo blank line\n",
    "bump: patch\n\nBlank line without delimiters\n",
  ];
  layouts.forEach((text, index) => {
    writeFileSync(join(changes, `valid-${index}.md`), text);
  });

  expect(lintChangesets(root)).toEqual([]);
});

test("gate names malformed changesets and gives the generator command", () => {
  const { root, changes } = fixture();
  writeFileSync(
    join(changes, "two-lines.md"),
    "bump: patch\n\nFirst\nSecond\n",
  );
  writeFileSync(join(changes, "unknown-bump.md"), "bump: huge\n\nEntry\n");
  writeFileSync(join(changes, "empty.md"), "bump: minor\n\n\n");

  const problems = lintChangesets(root);
  expect(problems).toHaveLength(3);
  for (const name of ["two-lines.md", "unknown-bump.md", "empty.md"])
    expect(problems.some((problem) => problem.includes(name))).toBe(true);
  for (const problem of problems)
    expect(problem).toContain(
      "mise run changeset -- <tool> <patch|minor|major>",
    );
});

test("land reports a malformed file with its path and generator command", () => {
  const { root, changes } = fixture();
  writeFileSync(join(changes, "bad.md"), "bump: huge\n\nEntry\n");

  const result = applyToolChangesets(root, "2026-10-14");
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toContain("bad.md");
    expect(result.error.message).toContain(
      "bump must be patch, minor, or major",
    );
    expect(result.error.message).toContain("mise run changeset --");
  }
});
