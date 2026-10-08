import { afterEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Candidate, ReceiptAction } from "../../src/model.ts";
import { openPathsUnder } from "../../src/jj/proc.ts";
import { createWorkspacesTarget } from "../../src/targets/workspaces.ts";
import { World } from "../jj/fixture.ts";

type Recovery = NonNullable<ReceiptAction["recovery"]>;
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
const world = (files?: Record<string, string>) => {
  const w = new World(files);
  mkdirSync(join(w.root, "proc"));
  worlds.push(w);
  return w;
};
afterEach(() => {
  for (const w of worlds.splice(0)) w.dispose();
});
const plan = (w: World, mode: "plan" | "run" = "plan", extra = {}) =>
  target.plan(w.context(mode, extra));
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
  });

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
