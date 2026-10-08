import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { createBuildsTarget } from "../../src/targets/builds.ts";

const context = (repoRoots: string[], procDir: string) => ({
  mode: "plan" as const,
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
  test("preserves old kondo roots and age semantics while excluding Rust targets", () => {
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
      createBuildsTarget(() => home)
        .plan(context([project], procDir))
        .map((candidate) => candidate.path),
    ).toEqual([dist]);
  });

  test("keeps project virtualenv and dependencies in the blind tier", () => {
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
    const candidates = createBuildsTarget(() => home).plan(
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

  test("keeps a global Bun node_modules tree reached through the Bun bin symlink", () => {
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
    const candidate = createBuildsTarget(() => home).plan(
      context([], procDir),
    )[0];
    expect(candidate).toMatchObject({
      path: global,
      verdict: "KEEP",
      reason: "protected: tool installation root",
    });
  });
});
