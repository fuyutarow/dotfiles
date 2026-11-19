import { expect, test } from "bun:test";
import {
  judge,
  reachableTasks,
  runReferences,
  type Task,
} from "../lint-test-reach.ts";

const task = (name: string, depends: string[], ...run: string[]): Task => ({
  name,
  depends,
  run,
});

const sources: Record<string, string> = {
  "scripts/test-zsh.ts":
    "await $`${to} 120 zsh zsh/tests/hygiene.test.zsh`.nothrow();",
  "zsh/tests/hygiene.test.zsh":
    'source "$ROOT/zsh/tests/sibling.test.zsh"\n# mentions zsh/tests/mentioned.test.zsh only in a comment\n',
};
const read = (path: string): Promise<string | undefined> =>
  Promise.resolve(sources[path]);

const tasks: Task[] = [
  task("test", ["test:a", "test:zsh", "test:topics"]),
  task("test:a", ["bun:check"], "bun test scripts/tests tools/*/tests"),
  task("test:topics", [], "bun test ./topic/*.test.ts standard-presets"),
  task("test:zsh", [], "bun scripts/test-zsh.ts"),
  task("bun:check", [], "bun scripts/bun-runtime.ts"),
  task("test:doctor", [], "bun test ./scripts/doctor-only.test.ts"),
];

const files = [
  "scripts/tests/a.test.ts",
  "tools/x/tests/b.test.ts",
  "topic/c.test.ts",
  "standard-presets/d.test.ts",
  "zsh/tests/hygiene.test.zsh",
  "zsh/tests/sibling.test.zsh",
];

test("every file a reachable task names, globs, launches or sources is reached", async () => {
  const verdict = await judge({ tasks, files, read }, {});
  expect(verdict).toEqual({ unreached: [], stale: [] });
});

test("a test file no reachable task covers is reported", async () => {
  const verdict = await judge(
    {
      tasks,
      files: [...files, "obsidian/e.test.ts", "scripts/doctor-only.test.ts"],
      read,
    },
    {},
  );
  // doctor-only is reachable only from test:doctor, which `test` does not depend on.
  expect(verdict.unreached.toSorted()).toEqual([
    "obsidian/e.test.ts",
    "scripts/doctor-only.test.ts",
  ]);
});

test("a path merely mentioned in a reached zsh test does not reach it", async () => {
  const verdict = await judge(
    { tasks, files: [...files, "zsh/tests/mentioned.test.zsh"], read },
    {},
  );
  expect(verdict.unreached).toEqual(["zsh/tests/mentioned.test.zsh"]);
});

test("an exception names a file or a glob and carries the unreached file", async () => {
  const extra = ["obsidian/e.test.ts", "archives/skills/x/tests/f.test.ts"];
  const verdict = await judge(
    { tasks, files: [...files, ...extra], read },
    { "obsidian/e.test.ts": "reason", "archives/**": "reason" },
  );
  expect(verdict).toEqual({ unreached: [], stale: [] });
});

test("an exception covering nothing unreached is stale", async () => {
  const verdict = await judge(
    { tasks, files, read },
    {
      "gone/missing.test.ts": "no such file",
      "topic/c.test.ts": "already reached by test:topics",
    },
  );
  expect(verdict.stale.toSorted()).toEqual([
    "gone/missing.test.ts",
    "topic/c.test.ts",
  ]);
});

test("reachableTasks follows depends and ignores tasks outside test", () => {
  expect(
    reachableTasks(tasks)
      .map((entry) => entry.name)
      .toSorted(),
  ).toEqual(["bun:check", "test", "test:a", "test:topics", "test:zsh"]);
});

test("runReferences reads slash tokens and bare Bun filters only", () => {
  const refs = runReferences("bun test ./obsidian/*.test.ts standard-presets");
  expect(refs).toContain("obsidian/*.test.ts");
  expect(refs).toContain("standard-presets");
  expect(runReferences("bun scripts/x.ts && echo hello")).toEqual([
    "scripts/x.ts",
  ]);
});
