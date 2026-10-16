import assert from "node:assert/strict";
import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../../src/engine.ts";
import { measuredTreeBytes } from "../../src/targets/tree.ts";
import { tempRoot } from "../fixtures/temp.ts";

const roots: string[] = [];
function fixtureConfig() {
  const { config } = loadConfig();
  assert.ok(config !== null);
  return config;
}
afterAll(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("unchanged plan roots reuse persisted measurements without a second walk", async () => {
  const root = tempRoot("reclaim-incremental-");
  roots.push(root);
  const path = join(root, "tree");
  mkdirSync(join(path, "nested"), { recursive: true });
  for (let n = 0; n < 300; n++)
    writeFileSync(join(path, "nested", String(n)), "fixture");
  const activity: string[] = [];
  const counters: number[] = [];
  const ctx = {
    mode: "plan" as const,
    config: fixtureConfig(),
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

test("worker subtree cache uses XDG storage when no private cache root is supplied", async () => {
  const root = tempRoot("reclaim-worker-cache-");
  roots.push(root);
  const previousCache = process.env.XDG_CACHE_HOME;
  const previousState = process.env.RECLAIM_STATE_DIR;
  using restore = new DisposableStack();
  restore.defer(() => {
    if (previousCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousCache;
    if (previousState === undefined) delete process.env.RECLAIM_STATE_DIR;
    else process.env.RECLAIM_STATE_DIR = previousState;
  });
  process.env.XDG_CACHE_HOME = join(root, "xdg-cache");
  process.env.RECLAIM_STATE_DIR = join(root, "state");
  const path = join(root, "tree");
  mkdirSync(join(path, "nested"), { recursive: true });
  writeFileSync(join(path, "nested", "entry"), "fixture");
  await measuredTreeBytes(path, {
    mode: "plan",
    config: fixtureConfig(),
    log: () => {},
  });
  expect(
    readdirSync(join(root, "xdg-cache", "disk-reclaim", "scan-cache")),
  ).toHaveLength(2);
  expect(existsSync(join(root, "state", "scan-cache"))).toBe(false);
});
