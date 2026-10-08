import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeTree } from "../../src/lib/remove-tree.ts";
import { protectedReason } from "../../src/lib/protected.ts";

test("tool install roots and bin symlink destinations are protected", () => {
  const home = mkdtempSync(join(tmpdir(), "reclaim-protected-home-"));
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(home, { recursive: true, force: true });
  });
  const target = join(home, ".bun/install/global/node_modules");
  mkdirSync(target, { recursive: true });
  expect(protectedReason(target, { home })).toBe("tool installation root");
});

test("process cwd protects its containing candidate, not candidate descendants", () => {
  const root = mkdtempSync(join(tmpdir(), "reclaim-protected-cwd-"));
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const procDir = join(root, "proc");
  const processDir = join(procDir, "123");
  const cwd = join(root, "runner-cwd");
  const child = join(cwd, "workspace");
  mkdirSync(processDir, { recursive: true });
  mkdirSync(child, { recursive: true });
  symlinkSync("/bin/sh", join(processDir, "exe"));
  symlinkSync(cwd, join(processDir, "cwd"));

  expect(protectedReason(cwd, { home: root, procDir })).toBe(
    "contains a running process cwd",
  );
  expect(protectedReason(child, { home: root, procDir })).toBeNull();
});

test("removeTree emits throttled progress to its stderr writer on a fake TTY", () => {
  const root = mkdtempSync(join(tmpdir(), "reclaim-progress-"));
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const tree = join(root, "tree");
  const procDir = join(root, "proc");
  mkdirSync(procDir);
  mkdirSync(tree);
  writeFileSync(join(tree, "entry"), "fixture");
  const stderr: string[] = [];
  const result = removeTree(tree, {
    uid: process.getuid?.() ?? 0,
    owner: () => ({ uid: process.getuid?.() ?? 0, name: "fixture" }),
    immutable: () => false,
    protection: { procDir },
    progress: {
      entries: 2,
      bytes: 4096,
      tty: true,
      write: (line) => {
        stderr.push(line);
      },
    },
  });
  expect(result.ok).toBe(true);
  expect(stderr.join("")).toContain("\r[reclaim]");
  expect(stderr.join("")).toContain("2/2 entries · 100%");
});
