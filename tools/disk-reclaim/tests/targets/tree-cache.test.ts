import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../src/engine.ts";
import { measuredTreeBytes } from "../../src/targets/tree.ts";
import { tempRoot } from "../fixtures/temp.ts";

test("unchanged plan roots reuse persisted measurements without a second walk", async () => {
  const root = tempRoot("reclaim-incremental-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const path = join(root, "tree");
  mkdirSync(join(path, "nested"), { recursive: true });
  for (let n = 0; n < 300; n++)
    writeFileSync(join(path, "nested", String(n)), "fixture");
  const activity: string[] = [];
  const counters: number[] = [];
  const ctx = {
    mode: "plan" as const,
    config: loadConfig().config!,
    scanCacheDir: join(root, "state"),
    log: () => {},
    reportActivity: (_unit: string, task: string) => activity.push(task),
    reportProgress: (_unit: string, _path: string, entries: number) => {
      counters.push(entries);
    },
  };
  const first = await measuredTreeBytes(path, ctx);
  expect(counters.length).toBeGreaterThan(1);
  activity.length = 0;
  counters.length = 0;
  expect(await measuredTreeBytes(path, ctx)).toBe(first);
  expect(activity.some((task) => task.includes("cache hit"))).toBe(true);
  expect(activity.some((task) => task.includes("walking"))).toBe(false);
  expect(counters).toEqual([]);
  writeFileSync(join(path, "new"), "changed".repeat(2000));
  activity.length = 0;
  expect(await measuredTreeBytes(path, ctx)).toBeGreaterThan(first);
  expect(activity.some((task) => task.includes("walking"))).toBe(true);
  // Only the parent, cached nested subtree and new file are visited again.
  expect(counters.at(-1)).toBe(3);
  activity.length = 0;
  await measuredTreeBytes(path, { ...ctx, mode: "run" });
  expect(activity.some((task) => task.includes("cache hit"))).toBe(false);
  expect(activity.some((task) => task.includes("walking"))).toBe(true);
});
