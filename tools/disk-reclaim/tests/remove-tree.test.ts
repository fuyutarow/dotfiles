import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { removeTree } from "../src/lib/remove-tree.ts";
import { deleteTree } from "../src/targets/tree.ts";
import {
  hasForegroundWaiter,
  registerForegroundWaiter,
  waitForLock,
} from "../src/receipt.ts";
import { tempRoot } from "./fixtures/temp.ts";

function fixture() {
  const root = tempRoot("reclaim-tree-signal-");
  const tree = join(root, "payload");
  const procDir = join(root, "proc");
  mkdirSync(tree);
  mkdirSync(procDir);
  for (let i = 0; i < 400; i += 1) writeFileSync(join(tree, `file-${i}`), "x");
  return {
    root,
    tree,
    procDir,
    [Symbol.dispose]: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const uid = process.getuid?.() ?? 0;
const options = {
  uid,
  immutable: () => false,
  protection: { processes: { openPaths: () => ({ open: [], unknown: [] }) } },
  measureFilesystem: false,
};
const candidate = (path: string) => ({
  id: path,
  path,
  verdict: "RECLAIM" as const,
  reason: "test",
  checks: [],
  bytes: 400,
  bytes_kind: "freed_now" as const,
  action: { kind: "delete" as const, argv: [path] },
  result: null,
});
const context = (procDir: string) => ({
  mode: "run" as const,
  procDir,
  progress: false,
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
});

test("abort during the walk stops within one slice and deleteTree reports failure", async () => {
  using f = fixture();
  const controller = new AbortController();
  let visits = 0;
  const result = await removeTree(f.tree, {
    ...options,
    signal: controller.signal,
    owner: () => {
      visits += 1;
      if (visits === 140) controller.abort();
      return { uid, name: "owner" };
    },
  });
  expect(result.ok).toBe(false);
  expect(visits).toBeLessThanOrEqual(141);
  expect(result.entries_removed).toBe(0);
  expect(readdirSync(f.tree)).toHaveLength(400);
  const action = await deleteTree(candidate(f.tree), {
    ...context(f.procDir),
    signal: controller.signal,
  });
  expect(action.ok).toBe(false);
  expect(action.error).toContain("cancelled");
});

test("foreground waiter is served during the walk and removal is incomplete", async () => {
  using f = fixture();
  let waiting = false;
  let served = false;
  let visits = 0;
  const result = await removeTree(f.tree, {
    ...options,
    owner: () => {
      visits += 1;
      if (visits === 140) waiting = true;
      return { uid, name: "owner" };
    },
    yieldForegroundLock: (completed) => {
      expect(completed).toBe(0);
      if (!waiting) return false;
      served = true;
      expect(existsSync(f.tree)).toBe(true);
      return true;
    },
  });
  expect(served).toBe(true);
  expect(visits).toBeLessThan(400);
  expect(result.ok).toBe(false);
  expect(result.entries_removed).toBe(0);
  expect(readdirSync(f.tree)).toHaveLength(400);
});

test("deleteTree propagates a signal aborted during its walk", async () => {
  using f = fixture();
  const controller = new AbortController();
  const result = await deleteTree(candidate(f.tree), {
    ...context(f.procDir),
    signal: controller.signal,
    yieldForegroundLock: () => {
      controller.abort();
      return false;
    },
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain("cancelled");
  expect(readdirSync(f.tree)).toHaveLength(400);
});

test("deleteTree releases the reclaim lock to a registered waiter mid-walk", async () => {
  using f = fixture();
  const state = join(f.root, "state");
  const held = await waitForLock("background", state, () => {}, 2);
  expect(held.release).not.toBeNull();
  let unregister: (() => Promise<void>) | undefined;
  let waiter: ReturnType<typeof waitForLock> | undefined;
  let acquired = false;
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      held.release?.();
      await unregister?.();
    },
  };
  const result = await deleteTree(candidate(f.tree), {
    ...context(f.procDir),
    yieldForegroundLock: async (completed) => {
      expect(completed).toBe(0);
      if (waiter === undefined) {
        unregister = await registerForegroundWaiter(state);
        waiter = waitForLock("foreground", state, () => {}, 2);
        return false;
      }
      expect(await hasForegroundWaiter(state)).toBe(true);
      held.release?.();
      const lock = await waiter;
      acquired = lock.release !== null;
      expect(existsSync(f.tree)).toBe(true);
      lock.release?.();
      return true;
    },
  });
  expect(acquired).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.error).toContain("yielded");
  expect(readdirSync(f.tree)).toHaveLength(400);
});

test("uninterrupted tree is removed", async () => {
  using f = fixture();
  const result = await removeTree(f.tree, options);
  expect(result.ok).toBe(true);
  expect(result.entries_removed).toBe(401);
  expect(existsSync(f.tree)).toBe(false);
});

test("protected and foreign-owned paths remain", async () => {
  using f = fixture();
  const protectedResult = await removeTree(f.tree, {
    ...options,
    protection: { ...options.protection, protectedPaths: [f.tree] },
  });
  expect(protectedResult.ok).toBe(false);
  const foreignResult = await removeTree(f.tree, {
    ...options,
    owner: (path) => ({
      uid: path === f.tree ? uid : uid + 1,
      name: "foreign",
    }),
  });
  expect(foreignResult.ok).toBe(false);
  expect(foreignResult.refused.length).toBeGreaterThan(0);
  expect(readdirSync(f.tree)).toHaveLength(400);
});
