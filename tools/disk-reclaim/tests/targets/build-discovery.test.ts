import { expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBuilds } from "../../src/targets/build-discovery.ts";
import type { Context } from "../../src/targets/index.ts";
import { tempRoot } from "../fixtures/temp.ts";

function context(cache: string, errors: string[]): Context {
  return {
    mode: "run",
    scanCacheDir: cache,
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: [],
    },
    log: () => {},
    reportPlanError: (message) => {
      errors.push(message);
    },
  };
}

test("one-directory slices make durable progress instead of restarting discovery", async () => {
  const temp = tempRoot("build-discovery-resume-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(temp, { recursive: true, force: true });
  });
  const root = join(temp, "home");
  const cache = join(temp, "cache");
  for (let n = 0; n < 8; n++)
    mkdirSync(join(root, `p${n}`, "dist"), { recursive: true });
  // These files require no per-file stat or traversal and cannot exhaust directory slices.
  for (let n = 0; n < 1000; n++) writeFileSync(join(root, `f${n}`), "x");
  const errors: string[] = [];
  expect(
    await discoverBuilds(root, context(cache, errors), { directories: 1 }),
  ).toEqual([]);
  expect(errors.at(-1)).toContain("pending=8");
  let found: string[] = [];
  for (let n = 0; n < 8; n++) {
    errors.length = 0;
    found = await discoverBuilds(root, context(cache, errors), {
      directories: 1,
    });
    expect(found.length).toBe(n + 1);
  }
  expect(found.toSorted()).toEqual(
    Array.from({ length: 8 }, (_, n) => join(root, `p${n}`, "dist")),
  );
  expect(errors).toEqual([]);
});

test("a cooperative time slice persists its frontier and does not follow directory symlinks", async () => {
  const temp = tempRoot("build-discovery-time-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(temp, { recursive: true, force: true });
  });
  const root = join(temp, "home");
  const cache = join(temp, "cache");
  mkdirSync(join(root, "project", "dist"), { recursive: true });
  mkdirSync(join(temp, "outside", "dist"), { recursive: true });
  symlinkSync(join(temp, "outside"), join(root, "link"));
  let ticks = 0;
  const errors: string[] = [];
  expect(
    await discoverBuilds(root, context(cache, errors), {
      milliseconds: 10,
      now: () => (ticks++ < 2 ? 0 : 20),
    }),
  ).toEqual([]);
  expect(errors.at(-1)).toContain("visited=1 pending=1");
  expect(
    await discoverBuilds(root, context(cache, []), { directories: 1 }),
  ).toEqual([join(root, "project", "dist")]);
  // A new complete cycle rediscovers additions and drops removed candidates.
  rmSync(join(root, "project", "dist"), { recursive: true });
  mkdirSync(join(root, "project", "build"));
  expect(await discoverBuilds(root, context(cache, []))).toEqual([
    join(root, "project", "build"),
  ]);
});
