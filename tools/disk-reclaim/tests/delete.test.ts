import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../src/engine.ts";
import { deleteApproved } from "../src/delete.ts";
import { readReceipts } from "../src/receipt.ts";
import { removeTree } from "../src/lib/remove-tree.ts";
import { ReceiptV2 } from "../src/model.ts";
import { procFixture } from "./fixtures/procs.ts";

const fixtures: string[] = [];
function restoreDirectories(path: string): void {
  if (!lstatSync(path).isDirectory()) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) restoreDirectories(join(path, entry));
}
function fixture() {
  const path = mkdtempSync(join(tmpdir(), "disk-reclaim-delete-"));
  fixtures.push(path);
  const loaded = loadConfig();
  assert.ok(
    loaded.config !== null,
    loaded.error ?? "disk-reclaim config unavailable",
  );
  const config = {
    ...loaded.config,
    scratch_roots: [],
    repo_roots: [],
    delete_roots: [path],
  };
  const procRoot = join(path, "proc");
  mkdirSync(procRoot);
  return { path, config, state: join(path, "state"), procRoot };
}
afterEach(() => {
  for (const path of fixtures.splice(0)) {
    restoreDirectories(path);
    rmSync(path, { recursive: true, force: true });
  }
});

test("refuses relative, root, HOME, repo root, outside-root, and symlink escape targets with named rules", async () => {
  const f = fixture();
  const repo = join(f.path, "repo");
  const outside = mkdtempSync(join(tmpdir(), "disk-reclaim-outside-"));
  fixtures.push(outside);
  const symlink = join(f.path, "escape");
  mkdirSync(repo);
  mkdirSync(join(repo, ".git"));
  writeFileSync(join(repo, "data"), "repo");
  symlinkSync(outside, symlink);
  for (const [path, reason] of [
    ["relative", "absolute"],
    ["/", "protected-root"],
    [homedir(), "protected-root"],
    [repo, "repo-store"],
    [outside, "configured-root"],
    [symlink, "no-symlink-escape"],
  ] as const) {
    const result = await deleteApproved([path], {
      config: f.config,
      yes: true,
      state: f.state,
      procRoot: f.procRoot,
    });
    expect(result.exit).toBe(2);
    expect(result.lines.join("\n")).toContain(reason);
  }
  expect(existsSync(join(repo, "data"))).toBe(true);
});

test("without --yes prints an allowed plan and preserves its target", async () => {
  const f = fixture();
  const target = join(f.path, "candidate");
  mkdirSync(target);
  writeFileSync(join(target, "data"), "safe to remove");
  const result = await deleteApproved([target], {
    config: f.config,
    yes: false,
    state: f.state,
    procRoot: f.procRoot,
  });
  expect(result.exit).toBe(0);
  expect(result.lines.join("\n")).toContain("no-live-process");
  expect(existsSync(target)).toBe(true);
});

test("delete ignores unreadable same-uid processes named in config", async () => {
  const f = fixture();
  const target = join(f.path, "candidate");
  mkdirSync(target);
  writeFileSync(join(target, "data"), "safe to remove");
  const proc = procFixture(f.path, "sshd", ["environ"]);
  const result = await deleteApproved([target], {
    config: f.config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
    procFs: proc.fs,
  });
  expect(result.exit).toBe(0);
  expect(result.lines.join("\n")).toContain("no-live-process");
  expect(existsSync(target)).toBe(false);
});

test("with --yes deletes under the lock and records freed bytes in a v2 receipt", async () => {
  const f = fixture();
  const target = join(f.path, "candidate");
  mkdirSync(target);
  writeFileSync(join(target, "data"), "x".repeat(8192));
  const result = await deleteApproved([target], {
    config: f.config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
  });
  expect(result.exit).toBe(0);
  expect(existsSync(target)).toBe(false);
  const receipt = readReceipts(1, f.state).receipts[0];
  expect(receipt).toMatchObject({ schema: 2, target: "delete", tier: "owner" });
  const parsedReceipt = ReceiptV2.safeParse(receipt);
  assert.ok(parsedReceipt.success);
  expect(parsedReceipt.data.actions[0]).toMatchObject({
    kind: "delete",
    ok: true,
  });
  expect(parsedReceipt.data.actions[0]?.bytes_freed).toBeGreaterThanOrEqual(0);
});

test("removes arena-like read-only trees, files, non-searchable dirs, and symlinks without following them", () => {
  const f = fixture();
  const target = join(f.path, "readonly");
  const outside = join(f.path, "outside");
  mkdirSync(join(target, "locked", "deep"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(
    join(target, "locked", "deep", "snapshot.bin"),
    "x".repeat(8192),
  );
  writeFileSync(join(outside, "keep.txt"), "outside survives");
  symlinkSync(outside, join(target, "research_record"));
  chmodSync(join(target, "locked", "deep", "snapshot.bin"), 0o444);
  chmodSync(join(target, "locked", "deep"), 0o400);
  chmodSync(join(target, "locked"), 0o555);
  chmodSync(target, 0o555);
  const outsideMode = statSync(outside).mode & 0o777;
  const result = removeTree(target, {
    uid: process.getuid?.() ?? 0,
    protection: { procDir: f.procRoot },
    immutable: () => false,
  });
  expect(result.ok).toBe(true);
  expect(result.bytes_freed).toBeGreaterThan(0);
  expect(existsSync(target)).toBe(false);
  expect(existsSync(join(outside, "keep.txt"))).toBe(true);
  expect(statSync(outside).mode & 0o777).toBe(outsideMode);
});

test("removeTree repairs deep same-uid directories with restricted modes", () => {
  const f = fixture();
  for (const mode of [0o000, 0o500, 0o555, 0o600]) {
    const target = join(f.path, `deep-${mode.toString(8)}`);
    const directories: string[] = [];
    let current = target;
    for (let index = 0; index < 12; index += 1) {
      current = join(current, "nested");
      mkdirSync(current, { recursive: true });
      directories.push(current);
    }
    writeFileSync(join(current, "snapshot.bin"), "arena snapshot");
    for (const directory of directories.toReversed())
      chmodSync(directory, mode);
    const result = removeTree(target, {
      uid: process.getuid?.() ?? 0,
      protection: { procDir: f.procRoot },
      immutable: () => false,
    });
    expect(result.ok, `${mode.toString(8)}: ${JSON.stringify(result)}`).toBe(
      true,
    );
    expect(existsSync(target)).toBe(false);
  }
});

test("unknown immutable status refuses the subtree", () => {
  const f = fixture();
  const target = join(f.path, "unknown-attributes");
  mkdirSync(target);
  writeFileSync(join(target, "data"), "keep");
  const result = removeTree(target, {
    uid: process.getuid?.() ?? 0,
    protection: { procDir: f.procRoot },
    immutable: () => null,
  });
  expect(result.ok).toBe(false);
  expect(result.refused[0]).toMatchObject({
    path: target,
    reason: "immutable or append-only status is unknown",
  });
  expect(result.refused[0]?.repair).toContain("chattr");
  expect(existsSync(join(target, "data"))).toBe(true);
});

test("traversal refuses a nested repo store and continues with siblings", () => {
  const f = fixture();
  const target = join(f.path, "nested-store");
  const protectedDir = join(target, "keep-repo");
  mkdirSync(join(protectedDir, ".git"), { recursive: true });
  writeFileSync(join(protectedDir, "data"), "repo data");
  writeFileSync(join(target, "remove-me"), "safe sibling");
  const result = removeTree(target, {
    uid: process.getuid?.() ?? 0,
    protection: { procDir: f.procRoot },
    immutable: () => false,
  });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.refused)).toContain(protectedDir);
  expect(JSON.stringify(result.refused)).toContain("repo store holder");
  expect(existsSync(join(protectedDir, "data"))).toBe(true);
  expect(existsSync(join(target, "remove-me"))).toBe(false);
  expect(existsSync(target)).toBe(true);
});

test("another uid is refused while sibling entries are removed and delete exits 1", async () => {
  const f = fixture();
  const target = join(f.path, "partial");
  mkdirSync(target);
  const foreign = join(target, "foreign");
  writeFileSync(foreign, "protected");
  writeFileSync(join(target, "sibling"), "remove me");
  const uid = process.getuid?.() ?? 0;
  const result = await deleteApproved([target], {
    config: f.config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
    owner: (path) =>
      path === foreign
        ? { uid: uid + 1, name: "other-user" }
        : { uid, name: "tester" },
    immutable: () => false,
  });
  expect(result.exit).toBe(1);
  expect(result.refused[0]).toMatchObject({
    path: foreign,
    owner_uid: uid + 1,
    owner_name: "other-user",
  });
  expect(result.refused[0]?.repair).toContain("sudo chown");
  expect(existsSync(foreign)).toBe(true);
  expect(existsSync(join(target, "sibling"))).toBe(false);
  expect(readReceipts(1, f.state).receipts[0]).toMatchObject({
    schema: 2,
    exit: 1,
    actions: [{ refused: [{ path: foreign }] }],
  });
});

test.skip("nested mount boundary (requires mount capability unavailable in the tmp-dir test harness)", () => {});

test("refuses a target with a same-uid child process cwd inside it", async () => {
  const f = fixture();
  const target = join(f.path, "busy");
  mkdirSync(target);
  const child = Bun.spawn(["sleep", "20"], {
    cwd: target,
    stdout: "ignore",
    stderr: "ignore",
  });
  await Bun.sleep(50);
  const pidDir = join(f.procRoot, String(child.pid));
  mkdirSync(join(pidDir, "fd"), { recursive: true });
  writeFileSync(
    join(pidDir, "status"),
    `Uid:\t${process.getuid?.() ?? 0}\t${process.getuid?.() ?? 0}\t${process.getuid?.() ?? 0}\t${process.getuid?.() ?? 0}\n`,
  );
  symlinkSync(target, join(pidDir, "cwd"));
  const result = await deleteApproved([target], {
    config: f.config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
  });
  child.kill();
  await child.exited;
  expect(result.exit).toBe(2);
  expect(result.lines.join("\n")).toContain("has cwd under target");
});

test("refuses a listed jj workspace and advises forgetting it first", async () => {
  const f = fixture();
  const repo = join(f.path, "jjrepo");
  const workspace = join(f.path, "workspace");
  const init = spawnSync("jj", ["git", "init", "--colocate", repo], {
    encoding: "utf8",
  });
  assert.ok(init.error === undefined, `jj git init failed: ${init.stderr}`);
  expect(init.status).toBe(0);
  const added = spawnSync(
    "jj",
    ["-R", repo, "workspace", "add", "--name", "candidate", workspace],
    { encoding: "utf8" },
  );
  assert.ok(
    added.error === undefined,
    `jj workspace add failed: ${added.stderr}`,
  );
  expect(added.status).toBe(0);
  const result = await deleteApproved([workspace], {
    config: f.config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
  });
  expect(result.exit).toBe(2);
  expect(result.lines.join("\n")).toContain("jj workspace forget first");
});
