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
    "---\nbump: patch\n---\nFix first issue\n",
  );
  writeFileSync(
    join(changes, "two.md"),
    "---\nbump: minor\n---\nAdd second feature\n",
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
  expect(readFileSync(join(tool, "package.json"), "utf8")).toContain(
    '"version": "1.3.0"',
  );
  expect(readFileSync(join(tool, "CHANGELOG.md"), "utf8")).toBe(
    "# Changelog\n\n## 1.3.0 — 2026-10-14\n\n- Fix first issue\n- Add second feature\n\n## 1.2.3 — 2026-10-01\n\n- Existing entry\n",
  );
  expect(existsSync(join(changes, "one.md"))).toBe(false);
  expect(existsSync(join(changes, "two.md"))).toBe(false);
});

test("landing without changesets leaves version and changelog unchanged", () => {
  const { root, tool } = fixture();
  const packageBefore = readFileSync(join(tool, "package.json"), "utf8");
  const changelogBefore = readFileSync(join(tool, "CHANGELOG.md"), "utf8");

  const result = applyToolChangesets(root, "2026-10-14");
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value).toEqual({ paths: [], releases: [] });
  expect(readFileSync(join(tool, "package.json"), "utf8")).toBe(packageBefore);
  expect(readFileSync(join(tool, "CHANGELOG.md"), "utf8")).toBe(
    changelogBefore,
  );
});
