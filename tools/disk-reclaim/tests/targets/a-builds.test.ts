import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { run } from "../../src/engine.ts";
import { createLivenessSnapshot } from "../../src/liveness/facts.ts";
import { createBuildsTarget } from "../../src/targets/builds.ts";
import { treeCandidate } from "../../src/targets/tree.ts";

const cacheRoot = tempRoot("reclaim-builds-cache-");
afterAll(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

const context = (repoRoots: string[], procDir: string) => ({
  mode: "plan" as const,
  scanCacheDir: cacheRoot,
  explicit: false,
  procDir,
  config: {
    repo_roots: repoRoots,
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: ["sshd"],
  },
  log: () => {},
});

describe("builds target", () => {
  test("discovery count stays fixed as the engine acts on more build directories", async () => {
    const runWithCandidates = async (candidateCount: number) => {
      const temp = tempRoot("reclaim-builds-run-");
      using cleanup = new DisposableStack();
      cleanup.defer(() => {
        rmSync(temp, { recursive: true, force: true });
      });
      const home = join(temp, "home");
      const state = join(temp, "state");
      const procDir = join(temp, "proc");
      mkdirSync(home);
      mkdirSync(procDir);
      const payloads = Array.from({ length: candidateCount }, (_, index) =>
        join(home, `project-${index}`, "dist"),
      );
      for (const [index, path] of payloads.entries()) {
        mkdirSync(path, { recursive: true });
        writeFileSync(join(path, "artifact"), "x".repeat(index + 1));
      }
      const logs: string[] = [];
      let scans = 0;
      const baseContext = {
        ...context([], procDir),
        scanCacheDir: join(temp, "cache"),
      };
      const target = createBuildsTarget(
        () => home,
        () => {
          scans += 1;
          return payloads;
        },
      );
      const result = await run([target], {
        context: {
          ...baseContext,
          log: (line) => {
            logs.push(line);
          },
        },
        headroom: { drives: [] },
        state,
        yes: true,
        captureLiveness: (config) =>
          createLivenessSnapshot(config, {
            home,
            procs: { procRoot: procDir },
          }),
      });
      expect(result.exit).toBe(0);
      expect(payloads.every((path) => !existsSync(path))).toBe(true);
      expect(logs.some((line) => line.includes("builds yielded"))).toBe(false);
      return scans;
    };

    const oneCandidateScans = await runWithCandidates(1);
    const threeCandidateScans = await runWithCandidates(3);
    expect(oneCandidateScans).toBe(threeCandidateScans);
    expect(threeCandidateScans).toBeLessThan(1 + 3);
  });

  test("recheck skips removed and newly protected candidates", async () => {
    const home = tempRoot("reclaim-builds-recheck-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const procDir = join(home, "proc");
    const removed = join(home, "a", "dist");
    const protectedPath = join(home, "b", "node_modules");
    mkdirSync(procDir);
    mkdirSync(removed, { recursive: true });
    mkdirSync(protectedPath, { recursive: true });
    const target = createBuildsTarget(
      () => home,
      () => [removed, protectedPath],
    );
    const ctx = context([], procDir);
    const candidates = await target.plan(ctx);
    const missing = candidates.find((candidate) => candidate.path === removed);
    const protectedCandidate = candidates.find(
      (candidate) => candidate.path === protectedPath,
    );
    expect(missing).toBeDefined();
    expect(protectedCandidate).toBeDefined();
    if (missing === undefined || protectedCandidate === undefined) return;
    rmSync(removed, { recursive: true });
    expect(await target.recheck(missing, ctx)).toBeNull();
    const fresh = await target.recheck(protectedCandidate, {
      ...ctx,
      config: { ...ctx.config, repo_roots: [join(home, "b")] },
    });
    expect(fresh).toMatchObject({
      verdict: "KEEP",
      reason: "protected: project environment or dependencies belong to repo",
    });
  });

  test("preserves old kondo roots and age semantics while excluding Rust targets", async () => {
    const home = tempRoot("reclaim-builds-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const project = join(home, "project");
    const procDir = join(home, "proc");
    mkdirSync(procDir);
    const target = join(project, "target");
    const dist = join(project, "dist");
    mkdirSync(target, { recursive: true });
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(target, "artifact"), "rust");
    writeFileSync(join(dist, "artifact"), "build");
    expect(
      (
        await createBuildsTarget(() => home).plan(context([project], procDir))
      ).map((candidate) => candidate.path),
    ).toEqual([dist]);
  });

  test("keeps project virtualenv and dependencies in the blind tier", async () => {
    const home = tempRoot("reclaim-builds-repo-");
    const oldHome = process.env.HOME;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
      rmSync(home, { recursive: true, force: true });
    });
    process.env.HOME = home;
    const project = join(home, "repo");
    const procDir = join(home, "proc");
    mkdirSync(procDir);
    const venv = join(project, ".venv");
    const modules = join(project, "node_modules");
    mkdirSync(venv, { recursive: true });
    mkdirSync(modules, { recursive: true });
    const candidates = await createBuildsTarget(() => home).plan(
      context([project], procDir),
    );
    expect(
      candidates.map(({ path, verdict, reason }) => [path, verdict, reason]),
    ).toEqual([
      [
        venv,
        "KEEP",
        "protected: project environment or dependencies belong to repo",
      ],
      [
        modules,
        "KEEP",
        "protected: project environment or dependencies belong to repo",
      ],
    ]);
  });

  test("keeps a global Bun node_modules tree reached through the Bun bin symlink", async () => {
    const home = tempRoot("reclaim-builds-bun-");
    const oldHome = process.env.HOME;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
      rmSync(home, { recursive: true, force: true });
    });
    process.env.HOME = home;
    const global = join(home, ".bun/install/global/node_modules");
    const procDir = join(home, "proc");
    mkdirSync(procDir);
    const bin = join(home, ".bun/bin");
    mkdirSync(global, { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(global, "agent-tool"), "fixture");
    const link = join(bin, "agent-tool-link");
    symlinkSync(join(global, "agent-tool"), link);
    const candidate = (
      await createBuildsTarget(() => home).plan(context([], procDir))
    )[0];
    expect(candidate).toMatchObject({
      path: global,
      verdict: "KEEP",
      reason: "protected: tool installation root",
    });
  });
});

describe("bounded build sizing", () => {
  test("a build directory over the entry bound is a lower-bound estimate that is not cached", async () => {
    const home = tempRoot("reclaim-builds-bound-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const modules = join(home, "node_modules");
    mkdirSync(modules);
    for (let n = 0; n < 400; n += 1) writeFileSync(join(modules, `f${n}`), "x");
    const small = join(home, "tiny");
    mkdirSync(small);
    writeFileSync(join(small, "f"), "x");
    const ctx = context([], home);
    const bounded = await treeCandidate(modules, "regenerable", ctx, 100);
    expect(bounded.bytes_kind).toBe("estimate");
    const whole = await treeCandidate(small, "regenerable", ctx, 100);
    expect(whole.bytes_kind).toBe("freed_now");
    // The partial size was not stored as the tree's size.
    const unbounded = await treeCandidate(modules, "regenerable", ctx);
    expect(unbounded.bytes_kind).toBe("freed_now");
    expect(unbounded.bytes ?? 0).toBeGreaterThan(bounded.bytes ?? 0);
  });
});
