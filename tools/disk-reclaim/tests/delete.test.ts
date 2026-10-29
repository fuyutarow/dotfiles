import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig, run } from "../src/engine.ts";
import { deleteApproved } from "../src/delete.ts";
import { hasForegroundWaiter, readReceipts } from "../src/receipt.ts";
import { removeTree } from "../src/lib/remove-tree.ts";
import { createLivenessSnapshot } from "../src/liveness/facts.ts";
import { ReceiptV2 } from "../src/model.ts";
import { createBuildsTarget } from "../src/targets/builds.ts";
import type { Target } from "../src/targets/index.ts";
import { procFixture } from "./fixtures/procs.ts";
import { tempRoot } from "./fixtures/temp.ts";
import { World } from "./jj/fixture.ts";

const fixtures: string[] = [];
function restoreDirectories(path: string): void {
  if (!lstatSync(path).isDirectory()) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) restoreDirectories(join(path, entry));
}
function fixture() {
  const path = tempRoot("disk-reclaim-delete-");
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
  const outside = tempRoot("disk-reclaim-outside-");
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

test("configured delete-root globs match whole segments and allow descendants", async () => {
  const f = fixture();
  const runs = join(f.path, "runs");
  const oracle = join(runs, "a", "launcher", "b", "oracle");
  mkdirSync(oracle, { recursive: true });
  writeFileSync(join(oracle, "snapshot.bin"), "temporary fixture");
  for (const path of [
    join(runs, "a", "oracle"),
    join(runs, "a"),
    join(runs, "a", "launcher"),
    join(runs, "a", "launcher", "b"),
    join(runs, "a", "x", "launcher", "b", "oracle"),
    join(runs, "a", "launcher", "b", "oraclex"),
  ])
    mkdirSync(path, { recursive: true });

  const config = {
    ...f.config,
    delete_roots: [join(runs, "*", "launcher", "*", "oracle")],
  };
  for (const path of [oracle, join(oracle, "snapshot.bin")]) {
    const result = await deleteApproved([path], {
      config,
      yes: false,
      state: f.state,
      procRoot: f.procRoot,
    });
    expect(
      result.rows[0]?.checks.find((check) => check.name === "configured-root"),
    ).toMatchObject({ ok: true });
  }
  for (const path of [
    join(runs, "a", "oracle"),
    join(runs, "a"),
    join(runs, "a", "launcher"),
    join(runs, "a", "launcher", "b"),
    join(runs, "a", "x", "launcher", "b", "oracle"),
    join(runs, "a", "launcher", "b", "oraclex"),
  ]) {
    const result = await deleteApproved([path], {
      config,
      yes: false,
      state: f.state,
      procRoot: f.procRoot,
    });
    expect(
      result.rows[0]?.checks.find((check) => check.name === "configured-root"),
    ).toMatchObject({ ok: false });
  }
  expect(existsSync(join(oracle, "snapshot.bin"))).toBe(true);
});

test("single-star delete roots still match descendants but not the wildcard parent", async () => {
  const f = fixture();
  const workspace = join(f.path, "Workspace");
  const nested = join(workspace, "r", "x");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, "data"), "temporary fixture");
  const config = { ...f.config, delete_roots: [join(workspace, "*")] };

  for (const [path, allowed] of [
    [nested, true],
    [workspace, false],
  ] as const) {
    const result = await deleteApproved([path], {
      config,
      yes: false,
      state: f.state,
      procRoot: f.procRoot,
    });
    expect(
      result.rows[0]?.checks.find((check) => check.name === "configured-root"),
    ).toMatchObject({ ok: allowed });
  }
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

test("delete registers a foreground waiter and acquires the lock after builds yields", async () => {
  const f = fixture();
  const home = join(f.path, "build-home");
  const scanCacheDir = join(f.path, "scan-cache");
  mkdirSync(home);
  mkdirSync(scanCacheDir);
  const payloads = [
    join(home, "a", "node_modules"),
    join(home, "b", "dist"),
    join(home, "c", "build"),
  ];
  for (const [index, path] of payloads.entries()) {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "artifact"), "x".repeat(index + 1));
  }
  const deleteTarget = join(f.path, "delete-target");
  mkdirSync(deleteTarget);
  writeFileSync(join(deleteTarget, "data"), "safe to remove");
  const config = {
    ...f.config,
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [f.path],
    ignore_unreadable_procs: [],
    protected: [],
  };
  const firstAct = Promise.withResolvers<void>();
  const continueFirst = Promise.withResolvers<void>();
  const acted: string[] = [];
  const logs: string[] = [];
  const deleteLogs: string[] = [];
  let laterTargetStarted = false;
  const baseTarget = createBuildsTarget(() => home);
  const builds: Target = {
    ...baseTarget,
    act: async (candidate, context) => {
      acted.push(candidate.path ?? "");
      if (acted.length === 1) {
        firstAct.resolve();
        await continueFirst.promise;
      }
      return baseTarget.act(candidate, context);
    },
  };
  const later: Target = {
    name: "later",
    tier: "blind",
    available: (context) => {
      if (context.mode === "run") laterTargetStarted = true;
      return { available: true, skip_reason: null };
    },
    plan: () => [],
    act: () => ({ ok: true, bytes_freed: 0, error: null }),
  };
  const background = run([builds, later], {
    context: {
      mode: "plan",
      scanCacheDir,
      procDir: f.procRoot,
      config,
      log: (line) => {
        logs.push(line);
      },
    },
    headroom: { drives: [] },
    state: f.state,
    yes: true,
    captureLiveness: (currentConfig) =>
      createLivenessSnapshot(currentConfig, {
        home,
        procs: { procRoot: f.procRoot },
      }),
  });
  let foreground:
    | Promise<Awaited<ReturnType<typeof deleteApproved>>>
    | undefined;
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      continueFirst.resolve();
      if (foreground !== undefined) await foreground;
      await background;
    },
  };
  await firstAct.promise;
  const deleteOperation = deleteApproved([deleteTarget], {
    config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
    graveyard: join(f.path, "graveyard"),
    log: (line) => {
      deleteLogs.push(line);
    },
  });
  foreground = deleteOperation;
  const waiterDeadline = performance.now() + 2_000;
  while (
    !(await hasForegroundWaiter(f.state)) &&
    performance.now() < waiterDeadline
  )
    await Bun.sleep(5);
  expect(await hasForegroundWaiter(f.state)).toBe(true);
  continueFirst.resolve();
  const [backgroundResult, deleteResult] = await Promise.all([
    background,
    deleteOperation,
  ]);
  expect(backgroundResult.exit).toBe(0);
  expect(deleteResult.exit).toBe(0);
  expect(existsSync(deleteTarget)).toBe(false);
  expect(acted).toHaveLength(1);
  expect(acted[0]).toBe(payloads[0]);
  expect(payloads.slice(1).every((path) => existsSync(path))).toBe(true);
  expect(laterTargetStarted).toBe(false);
  expect(
    logs.some((line) =>
      line.includes(
        "builds yielded after 1 payload actions for a foreground capacity waiter",
      ),
    ),
  ).toBe(true);
  expect(
    deleteLogs.some((line) => line.includes("waits for the reclaim lock")),
  ).toBe(true);
  expect(await hasForegroundWaiter(f.state)).toBe(false);
});

test("removes arena-like read-only trees, files, non-searchable dirs, and symlinks without following them", async () => {
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
  const result = await removeTree(target, {
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

test("removeTree repairs deep same-uid directories with restricted modes", async () => {
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
    const result = await removeTree(target, {
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

test("unknown immutable status refuses the subtree", async () => {
  const f = fixture();
  const target = join(f.path, "unknown-attributes");
  mkdirSync(target);
  writeFileSync(join(target, "data"), "keep");
  const result = await removeTree(target, {
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

test("traversal refuses a nested repo store without deleting the tree", async () => {
  const f = fixture();
  const target = join(f.path, "nested-store");
  const protectedDir = join(target, "keep-repo");
  mkdirSync(join(protectedDir, ".git"), { recursive: true });
  writeFileSync(join(protectedDir, "data"), "repo data");
  writeFileSync(join(target, "remove-me"), "safe sibling");
  const result = await removeTree(target, {
    uid: process.getuid?.() ?? 0,
    protection: { procDir: f.procRoot },
    immutable: () => false,
  });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.refused)).toContain(protectedDir);
  expect(JSON.stringify(result.refused)).toContain("repo store holder");
  expect(existsSync(join(protectedDir, "data"))).toBe(true);
  expect(existsSync(join(target, "remove-me"))).toBe(true);
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
  expect(existsSync(join(target, "sibling"))).toBe(true);
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
  const workspace = join(f.path, "workspace");
  const w = new World();
  using cleanup = new DisposableStack();
  const previousPath = process.env["PATH"];
  cleanup.defer(() => {
    process.env["PATH"] = previousPath;
    w.dispose();
  });
  w.add("candidate", workspace);
  const bin = join(f.path, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "agx"),
    `#!${process.execPath}\nprocess.stdout.write("[]");\n`,
  );
  chmodSync(join(bin, "agx"), 0o755);
  process.env["PATH"] = `${bin}:${previousPath}`;
  const result = await deleteApproved([workspace], {
    config: f.config,
    yes: true,
    state: f.state,
    procRoot: f.procRoot,
  });
  expect(result.exit).toBe(2);
  expect(result.lines.join("\n")).toContain("jj workspace forget first");
});
