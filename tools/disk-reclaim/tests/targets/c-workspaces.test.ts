import {
  afterAll,
  afterEach,
  describe,
  expect,
  test as bunTest,
} from "bun:test";
import assert from "node:assert/strict";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Candidate, ReceiptAction } from "../../src/model.ts";
import { openPathsUnder } from "../../src/jj/proc.ts";
import { createWorkspacesTarget } from "../../src/targets/workspaces.ts";
import { World } from "../jj/fixture.ts";
import { collectProcesses } from "../../src/lib/procs.ts";
import { procFixture } from "../fixtures/procs.ts";
import { treeBytes } from "../../src/targets/tree.ts";
import { loadConfig } from "../../src/engine.ts";
import { runProtection } from "../../src/jj/run-guard.ts";
import { directoryProtection, removeTree } from "../../src/lib/remove-tree.ts";

type Recovery = NonNullable<ReceiptAction["recovery"]>;
// Each case runs several real jj children, each bounded at twenty seconds by World.
// Keep the case bounded without applying a five-second budget to the whole chain.
const test = (
  name: string,
  run: () => void | Promise<void>,
  timeout = 60_000,
) => {
  bunTest(name, run, timeout);
};
// Each test owns its process fixture. The busy-cwd case adds one real child process.
const probe = (dir: string) => {
  const w = worlds.find((world) => dir.startsWith(`${world.root}/`));
  assert.ok(w !== undefined, `no process fixture for ${dir}`);
  return openPathsUnder(dir, process.getuid?.() ?? 0, {
    procRoot: join(w.root, "proc"),
    ignoreUnreadableProcs: ["sshd"],
  });
};
const target = createWorkspacesTarget({ openPaths: probe });
const worlds: World[] = [];
const originalPath = process.env.PATH;
const world = (files?: Record<string, string>) => {
  const w = new World(files);
  mkdirSync(join(w.root, "proc"));
  worlds.push(w);
  const bin = join(w.root, "bin");
  mkdirSync(bin);
  w.write(w.root, "runs.json", "[]");
  w.write(
    bin,
    "agx",
    `#!${process.execPath}\nprocess.stdout.write(await Bun.file(${JSON.stringify(join(w.root, "runs.json"))}).text());\n`,
  );
  chmodSync(join(bin, "agx"), 0o755);
  process.env.PATH = `${bin}:${originalPath}`;
  return w;
};
afterEach(() => {
  process.env.PATH = originalPath;
  for (const w of worlds.splice(0)) w.dispose();
});
afterAll(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
const plan = (w: World, mode: "plan" | "run" = "plan", extra = {}) =>
  target.plan({
    ...w.context(mode, extra),
    scanCacheDir: join(w.root, "scan-state"),
  });
const only = (candidates: Candidate[], path: string) => {
  const found = candidates.find((c) => c.path === path);
  assert.ok(
    found !== undefined,
    `no candidate for ${path}: ${JSON.stringify(candidates.map((c) => c.path))}`,
  );
  return found;
};
const failed = (c: Candidate) =>
  c.checks.filter((k) => k.ok !== true).map((k) => k.name);

describe("workspaces target", () => {
  test("sparse example-repo workspace with only tool caches is reclaimable", async () => {
    const caches = [
      ".rumdl_cache",
      ".ruff_cache",
      ".pytest_cache",
      ".mypy_cache",
      "node_modules/.cache",
    ];
    const w = world({ ".gitignore": `${caches.join("/\n")}/\n` });
    const ws = w.add("example-repo-sparse");
    w.jj(ws, "sparse", "set", "--clear", "--add", "a");
    for (const cache of caches) w.write(ws, `${cache}/entry`, "regenerable");
    const declared = loadConfig();
    assert.ok(declared.config !== null);
    const previous = only(
      await plan(w, "plan", {
        regenerable_ignored: ["target", "node_modules"],
      }),
      ws,
    );
    expect(previous.verdict).toBe("ASK");
    expect(previous.reason).toContain(".rumdl_cache");
    expect(failed(previous)).toEqual(["ignored files are regenerable"]);
    const row = only(
      await plan(w, "plan", {
        regenerable_ignored: declared.config.regenerable_ignored,
      }),
      ws,
    );
    expect(row.verdict, row.reason).toBe("RECLAIM");
    const restricted = only(
      await plan(w, "plan", {
        regenerable_ignored: ["target", "node_modules"],
      }),
      ws,
    );
    expect(restricted.verdict).toBe("ASK");
    expect(restricted.reason).toContain(".rumdl_cache");
    w.write(ws, ".env", "precious");
    const foreign = only(
      await plan(w, "plan", {
        regenerable_ignored: declared.config.regenerable_ignored,
      }),
      ws,
    );
    expect(foreign.verdict).toBe("ASK");
    expect(foreign.reason).toContain(".env");
  });

  test("r99-shaped workspaces ignore expected systemd EACCES and show bytes for every verdict", async () => {
    const w = world();
    const firstPath = w.add("dotfiles-arm-ref_u5");
    const paths = [firstPath, w.add("dotfiles-arm-sw_v1")];
    const proc = procFixture(w.root, "systemd", ["exe", "fd/3"]);
    const ctx = { ...w.context("plan"), procDir: proc.procRoot };
    let snapshot = collectProcesses(proc);
    const checked = createWorkspacesTarget({
      openPaths: (path) => snapshot.openPaths(path),
    });
    expect(snapshot.openPaths(w.root).unknown).toEqual([]);
    const rows = await checked.plan(ctx);
    for (const path of paths) {
      const row = only(rows, path);
      expect(row.verdict).toBe("RECLAIM");
      expect(row.checks.find((check) => check.name === "not in use")?.ok).toBe(
        true,
      );
      expect(row.bytes).toBe(await treeBytes(path));
      expect(row.bytes).toBeGreaterThan(0);
    }
    // An unexpected unreadable process remains ASK, with allocated bytes shown.
    writeFileSync(join(proc.base, "comm"), "python\n");
    snapshot = collectProcesses(proc);
    const unknown = await checked.plan(ctx);
    for (const path of paths) {
      expect(only(unknown, path).verdict).toBe("ASK");
      expect(only(unknown, path).bytes).toBe(await treeBytes(path));
    }
    // Readable positive use still wins over the expected permission exception.
    writeFileSync(join(proc.base, "comm"), "systemd\n");
    unlinkSync(join(proc.base, "cwd"));
    symlinkSync(firstPath, join(proc.base, "cwd"));
    snapshot = collectProcesses(proc);
    const busy = only(await checked.plan(ctx), firstPath);
    expect(busy.verdict).toBe("KEEP");
    expect(busy.bytes).toBe(await treeBytes(firstPath));
  }, 30_000);

  test("a pushed, clean workspace is RECLAIM; run records recovery, forgets, then deletes", async () => {
    const w = world();
    const ws = w.add("ws1");
    const wc = w.commitId('"ws1"@');
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("RECLAIM");
    expect(candidate.action.kind).toBe("jj-forget+delete");
    expect(candidate.reason).toContain("no fetch in the op log");

    const recovery: Recovery[] = [];
    const ctx = w.context("run", {}, recovery);
    const rerun = only(await target.plan(ctx), ws);
    expect(rerun.verdict).toBe("RECLAIM");
    const result = await target.act(rerun, ctx);
    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(existsSync(ws)).toBe(false);
    expect(w.workspaceNames()).toEqual(["default"]);
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatchObject({
      repo: w.repo,
      workspace: "ws1",
      commit_id: wc,
    });
    expect(recovery[0]?.op_id).toMatch(/^[0-9a-f]+$/u);
  }, 30_000);

  test("a Rust target is delegated to the rust owner before workspace deletion", async () => {
    const w = world({ ".gitignore": "target/\n" });
    const ws = w.add("ws1");
    w.write(ws, "target/debug/x", "fixture");
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("KEEP");
    expect(candidate.reason).toContain("owned by rust target");
    expect(existsSync(ws)).toBe(true);
  });

  test("default and the store-holding repo are never candidates", async () => {
    const w = world();
    expect(await plan(w)).toEqual([]);
    const ws = w.add("ws1");
    const paths = (await plan(w)).map((c) => c.path);
    expect(paths).toEqual([ws]);
  }, 30_000);

  test("an unpushed commit is ASK and nothing is touched", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.write(ws, "work.txt", "wip");
    w.jj(ws, "commit", "-m", "wip");
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("ASK");
    expect(failed(candidate)).toContain(
      "every non-empty commit is on a remote",
    );
    expect(existsSync(ws)).toBe(true);
  });

  test("a commit that was pushed becomes RECLAIM", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.write(ws, "work.txt", "done");
    w.jj(ws, "commit", "-m", "done");
    w.jj(ws, "bookmark", "create", "topic", "-r", "@-");
    w.jj(ws, "git", "push", "-b", "topic");
    expect(only(await plan(w), ws).verdict).toBe("RECLAIM");
  }, 30_000);

  test("an empty commit with a description counts as content", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.jj(ws, "describe", "-m", "verify: scratch, do not push");
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("ASK");
    expect(failed(candidate)).toContain(
      "every non-empty commit is on a remote",
    );
  });

  test("a conflicted working-copy commit is KEEP", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.jj(ws, "new", "main", "-m", "c1");
    w.write(ws, "a", "one\n");
    w.jj(ws, "new", "main", "-m", "c2");
    w.write(ws, "a", "two\n");
    w.jj(
      ws,
      "new",
      "description(substring:c1)",
      "description(substring:c2)",
      "-m",
      "merge",
    );
    const candidate = only(await plan(w), ws);
    assert.ok(candidate.verdict === "KEEP", candidate.reason);
    expect(failed(candidate)).toContain("no conflicts");
  }, 30_000);

  test("a local bookmark ahead of the remote is ASK", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.write(ws, "b", "b");
    w.jj(ws, "commit", "-m", "ahead");
    w.jj(ws, "bookmark", "create", "feat", "-r", "@-");
    expect(w.jj(ws, "bookmark", "list", "--all-remotes")).toContain("@git:");
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("ASK");
    expect(failed(candidate)).toContain("no unpushed local bookmarks");
  });

  test("an ignored .env is ASK and an ignored Rust target stays rust-owned", async () => {
    const w = world({ ".gitignore": ".env\ntarget/\n" });
    const clean = w.add("clean");
    w.write(clean, "target/debug/obj", "o");
    const secret = w.add("secret");
    w.write(secret, "target/debug/obj", "o");
    w.write(secret, ".env", "TOKEN=1");
    const candidates = await plan(w);
    expect(only(candidates, clean).verdict).toBe("KEEP");
    const ask = only(candidates, secret);
    expect(ask.verdict).toBe("ASK");
    expect(failed(ask)).toContain("ignored files are regenerable");
    expect(ask.reason).toContain(".env");
  });

  test("a tracked file edited after the last snapshot is ASK in plan", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.write(ws, "a", "edited\n");
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("ASK");
    expect(failed(candidate)).toContain("fresh working copy");
  }, 30_000);

  test("run snapshots: an unrecorded new file makes the working copy non-empty, so ASK", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.write(ws, "notes.txt", "mine");
    const candidate = only(await plan(w, "run"), ws);
    expect(candidate.verdict).toBe("ASK");
    expect(existsSync(ws)).toBe(true);
  });

  test("a listed workspace whose directory is gone is forget-only, 0 bytes", async () => {
    const w = world();
    const ws = w.add("ws1");
    const wc = w.commitId('"ws1"@');
    rmSync(ws, { recursive: true });
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("RECLAIM");
    expect(candidate.action.kind).toBe("jj-forget");
    expect(candidate.bytes).toBe(0);
    const recovery: Recovery[] = [];
    const ctx = w.context("run", {}, recovery);
    const result = await target.act(candidate, ctx);
    expect(result).toEqual({ ok: true, bytes_freed: 0, error: null });
    expect(w.workspaceNames()).toEqual(["default"]);
    expect(recovery[0]?.commit_id).toBe(wc);
  });

  test("owner preflight failure refuses before forgetting the workspace", async () => {
    const w = world();
    const ws = w.add("ws1");
    const refusing = createWorkspacesTarget({
      openPaths: probe,
      owner: () => ({
        uid: (process.getuid?.() ?? 0) + 1,
        name: "different-owner",
      }),
    });
    const candidate = only(await refusing.plan(w.context("plan")), ws);
    expect(candidate.verdict).toBe("RECLAIM");
    const recovery: Recovery[] = [];
    const result = await refusing.act(
      candidate,
      w.context("run", {}, recovery),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("workspace deletion preflight failed");
    expect(w.workspaceNames()).toContain("ws1");
    expect(existsSync(ws)).toBe(true);
    expect(recovery).toHaveLength(0);
  });

  test("an orphan directory (forgotten but still on disk) is ASK", async () => {
    const w = world();
    const ws = w.add("ws1");
    w.jj(w.repo, "workspace", "forget", "ws1");
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("ASK");
    expect(candidate.reason).toContain("orphan");
    expect(existsSync(ws)).toBe(true);
  });

  test("an orphan whose store is missing is ASK", async () => {
    const w = world();
    const dir = join(w.root, "stray");
    mkdirSync(join(dir, ".jj"), { recursive: true });
    writeFileSync(join(dir, ".jj", "repo"), "../../nowhere/.jj/repo");
    const candidate = only(await plan(w), dir);
    expect(candidate.verdict).toBe("ASK");
    expect(candidate.reason).toContain(
      "store this workspace points at is missing",
    );
  });

  test("a process with its cwd inside the workspace makes it KEEP", async () => {
    const w = world();
    const ws = w.add("ws1");
    const proc = join(w.root, "proc", "9999999");
    mkdirSync(join(proc, "fd"), { recursive: true });
    writeFileSync(join(proc, "environ"), "");
    symlinkSync("/usr/bin/sleep", join(proc, "exe"));
    symlinkSync(ws, join(proc, "cwd"));
    const candidate = only(await plan(w), ws);
    expect(candidate.verdict).toBe("KEEP");
    expect(failed(candidate)).toContain("not in use");
    expect(candidate.reason).toContain("pid 9999999");
    rmSync(proc, { recursive: true, force: true });
    expect(only(await plan(w), ws).verdict).toBe("RECLAIM");
  });

  test("a workspace under a scratch root ASKs until its session is known dead", async () => {
    const w = world();
    const ws = w.add("ws1");
    expect(
      only(await plan(w, "plan", { scratch_roots: [w.root] }), ws).verdict,
    ).toBe("ASK");
    const dead = createWorkspacesTarget({
      openPaths: probe,
      sessionDead: () => true,
    });
    expect(
      only(await dead.plan(w.context("plan", { scratch_roots: [w.root] })), ws)
        .verdict,
    ).toBe("RECLAIM");
  });

  test("act refuses without a recovery record and never forgets default", async () => {
    const w = world();
    const ws = w.add("ws1");
    const candidate = only(await plan(w), ws);
    const bare = { ...w.context("run"), recordRecovery: undefined };
    expect((await target.act(candidate, bare)).ok).toBe(false);
    expect(existsSync(ws)).toBe(true);
    const forged = {
      ...candidate,
      action: {
        ...candidate.action,
        argv: ["jj", "-R", w.repo, "workspace", "forget", "default"],
      },
    };
    expect((await target.act(forged, w.context("run"))).ok).toBe(false);
    expect(w.workspaceNames()).toContain("default");
  });
});

for (const state of [
  "unjudged",
  "accepted-pending",
  "accepted-landed",
  "rejected",
  "running",
]) {
  test(`SEP-WS-FORGET-UNJUDGED-1023: disk reclamation ${state}`, async () => {
    const w = world();
    const path = w.add("guarded");
    const pending = w.commitId("@", path);
    const candidate = only(await plan(w), path);
    expect(candidate.verdict, candidate.reason).toBe("RECLAIM");
    const main = w.commitId("main");
    let decision: string | undefined;
    if (state.startsWith("accepted")) decision = "accept";
    if (state === "rejected") decision = "reject";
    w.write(
      w.root,
      "runs.json",
      JSON.stringify([
        {
          id: "latest",
          workspace: path,
          state: state === "running" ? "running" : "ended",
          judgment: decision === undefined ? null : { decision },
          end_commit: state === "accepted-pending" ? pending : main,
        },
      ]),
    );
    const allowed = state === "accepted-landed" || state === "rejected";
    expect((await runProtection(w.repo, path)) === null).toBe(allowed);
    const refreshed = only(await plan(w), path);
    expect(refreshed.verdict).toBe(allowed ? "RECLAIM" : "ASK");
    // Act on the old eligible plan to prove the effect boundary refreshes owner facts.
    const result = await target.act(candidate, w.context("run"));
    expect(result.ok, result.error ?? "").toBe(allowed);
    expect(existsSync(path)).toBe(!allowed);
    expect(w.workspaceNames().includes("guarded")).toBe(!allowed);
  });
}

test("forgotten unjudged workspace is protected from direct recursive deletion", async () => {
  const w = world();
  const path = w.add("forgotten");
  w.jj(w.repo, "workspace", "forget", "forgotten");
  w.write(
    w.root,
    "runs.json",
    JSON.stringify([
      { id: "unjudged", workspace: path, state: "ended", judgment: null },
    ]),
  );
  expect(await directoryProtection(path)).toContain("unjudged");
  const result = await removeTree(path, {
    uid: process.getuid?.() ?? 0,
    immutable: () => false,
    progress: false,
  });
  expect(result.ok).toBe(false);
  expect(existsSync(join(path, "a"))).toBe(true);
});

test("unavailable or malformed run inventory never authorizes workspace deletion", async () => {
  const w = world();
  const path = w.add("unknown-owner");
  const candidate = only(await plan(w), path);
  expect(candidate.verdict).toBe("RECLAIM");
  for (const body of [
    "process.exitCode = 1;",
    'process.stdout.write("not-json");',
  ]) {
    w.write(join(w.root, "bin"), "agx", `#!${process.execPath}\n${body}\n`);
    expect(await runProtection(w.repo, path)).toContain("run inventory");
    const result = await target.act(candidate, w.context("run"));
    expect(result.ok).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(w.workspaceNames()).toContain("unknown-owner");
  }
});
