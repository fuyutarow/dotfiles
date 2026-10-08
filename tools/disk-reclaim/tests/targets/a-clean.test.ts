import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { createCleanTarget } from "../../src/targets/clean.ts";
import { run } from "../../src/engine.ts";
import { processBusy } from "../../src/lib/busy.ts";
import { z } from "../../../shared/src/zod.ts";

const config = {
  repo_roots: [],
  repos: [],
  scratch_roots: [],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: ["sshd"],
};
const context = {
  mode: "plan" as const,
  explicit: false,
  config,
  log: () => {},
};

describe("clean target", () => {
  test("shared exact-name pgrep probe reports busy, idle, and missing pgrep like the shell", () => {
    let argv: string[] = [];
    const fake = (exitCode: number) =>
      new Proxy(Bun.spawnSync, {
        apply: (_target, _thisArg, args: unknown[]) => {
          const parsed = z.array(z.string()).safeParse(args[0]);
          expect(parsed.success).toBe(true);
          if (!parsed.success) return { exitCode };
          argv = parsed.data;
          return { exitCode };
        },
      });
    expect(processBusy("julia", fake(0))).toBe(true);
    expect(argv).toEqual([
      "pgrep",
      "-u",
      String(process.getuid?.() ?? 0),
      "-x",
      "julia",
    ]);
    expect(processBusy("uv", fake(1))).toBe(false);
    expect(processBusy("uv", fake(1))).toBe(false);
  });

  test("plans every existing regenerable package cache and ignores absent caches", () => {
    const home = tempRoot("reclaim-clean-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const relative = [
      ".bun/install/cache",
      ".npm/_cacache",
      ".pnpm-store",
      ".cache/uv",
      ".cache/pip",
      ".cargo/registry/src",
      ".cargo/registry/cache",
      ".cargo/git/checkouts",
      ".julia/compiled",
      ".julia/scratchspaces",
    ];
    for (const path of relative) {
      const cache = join(home, path);
      mkdirSync(cache, { recursive: true });
      writeFileSync(join(cache, "fixture"), "cache");
    }
    const target = createCleanTarget(
      () => home,
      () => false,
    );
    expect(target.available(context)).toMatchObject({ available: true });
    expect(target.plan(context).map((candidate) => candidate.path)).toEqual(
      relative.map((path) => join(home, path)),
    );
    expect(
      target
        .plan(context)
        .every((candidate) => candidate.action.kind === "delete"),
    ).toBe(true);
  });

  test("default home resolution uses HOME", () => {
    const previous = process.env.HOME;
    const fixtureHome = tempRoot("reclaim-clean-home-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
      rmSync(fixtureHome, { recursive: true, force: true });
    });
    process.env.HOME = fixtureHome;
    mkdirSync(join(fixtureHome, ".cache/uv"), { recursive: true });
    expect(
      createCleanTarget()
        .plan(context)
        .map((candidate) => candidate.path),
    ).toEqual([join(fixtureHome, ".cache/uv")]);
  });

  test("a selected cache is actually deleted through the target action", async () => {
    const home = tempRoot("reclaim-clean-delete-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const cache = join(home, ".npm/_cacache");
    const procDir = join(home, "proc");
    mkdirSync(procDir);
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "fixture"), "cache");
    const target = createCleanTarget(() => home);
    const candidate = target.plan(context)[0];
    expect(candidate?.path).toBe(cache);
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    expect(
      await target.act(candidate, { ...context, mode: "run", procDir }),
    ).toMatchObject({ ok: true });
    expect(existsSync(cache)).toBe(false);
  });

  test("uv and Julia caches are kept with exact busy reasons", () => {
    const home = tempRoot("reclaim-clean-busy-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    for (const relative of [
      ".cache/uv",
      ".julia/compiled",
      ".julia/scratchspaces",
    ])
      mkdirSync(join(home, relative), { recursive: true });
    const probes: string[] = [];
    const target = createCleanTarget(
      () => home,
      (comm) => {
        probes.push(comm);
        return true;
      },
    );
    const candidates = target.plan(context);
    expect(probes).toEqual(["uv", "julia", "julia"]);
    expect(candidates.map(({ verdict, reason }) => [verdict, reason])).toEqual([
      ["KEEP", "busy: uv"],
      ["KEEP", "busy: julia"],
      ["KEEP", "busy: julia"],
    ]);
  });

  test("Julia cleanup never selects protected directories or the .julia root", () => {
    const home = tempRoot("reclaim-clean-julia-scope-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const julia = join(home, ".julia");
    for (const relative of [
      "compiled",
      "scratchspaces",
      "environments",
      "config",
      "registries",
      "packages",
      "artifacts",
      "logs",
      "prefs",
    ])
      mkdirSync(join(julia, relative), { recursive: true });
    const target = createCleanTarget(
      () => home,
      () => false,
    );
    expect(target.plan(context).map((candidate) => candidate.path)).toEqual([
      join(julia, "compiled"),
      join(julia, "scratchspaces"),
    ]);
  });

  test("a Bun cache is kept when the process probe finds a running bun process", () => {
    const home = tempRoot("reclaim-clean-bun-busy-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const cache = join(home, ".bun/install/cache");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "package"), "fixture");
    const probed: string[] = [];
    const target = createCleanTarget(
      () => home,
      (name) => {
        probed.push(name);
        return name === "bun";
      },
    );
    expect(probed).toEqual([]);
    expect(target.plan(context)[0]).toMatchObject({
      path: cache,
      verdict: "KEEP",
      reason: "busy: bun",
    });
    expect(probed).toEqual(["bun"]);
  });

  test("Cargo registry and git caches are kept while same-uid Rust tools run", () => {
    const home = tempRoot("reclaim-clean-cargo-busy-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const relative = [
      ".cargo/registry/src",
      ".cargo/registry/cache",
      ".cargo/git/checkouts",
    ];
    for (const path of relative)
      mkdirSync(join(home, path), { recursive: true });
    for (const liveComm of ["cargo", "rustc", "rust-analyzer"]) {
      const probed: string[] = [];
      const target = createCleanTarget(
        () => home,
        (comm) => {
          probed.push(comm);
          return comm === liveComm;
        },
      );
      expect(
        target
          .plan(context)
          .map(({ path, verdict, reason }) => [path, verdict, reason]),
      ).toEqual(
        relative.map((path) => [join(home, path), "KEEP", "busy: cargo"]),
      );
      const busyChecks = ["cargo", "rustc", "rust-analyzer"].slice(
        0,
        ["cargo", "rustc", "rust-analyzer"].indexOf(liveComm) + 1,
      );
      expect(probed).toEqual(relative.flatMap(() => busyChecks));
    }
  });

  test("uses Bun's cache gc for an idle Bun cache", async () => {
    const home = tempRoot("reclaim-clean-bun-gc-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const procDir = join(home, "proc");
    mkdirSync(procDir);
    const cache = join(home, ".bun/install/cache");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "package"), "fixture");
    const calls: string[] = [];
    const target = createCleanTarget(
      () => home,
      () => false,
      (gcHome) => {
        calls.push(gcHome);
        rmSync(cache, { recursive: true, force: true });
        return true;
      },
    );
    const candidate = target.plan(context)[0];
    expect(candidate?.path).toBe(cache);
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    expect(
      await target.act(candidate, { ...context, mode: "run", procDir }),
    ).toMatchObject({ ok: true });
    expect(calls).toEqual([home]);
    expect(existsSync(cache)).toBe(false);
  });

  test("a cache becoming busy after preview is kept during the engine's locked recheck", async () => {
    const home = tempRoot("reclaim-clean-recheck-");
    const state = join(home, "state");
    const cache = join(home, ".cache/uv");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "fixture"), "keep");
    let calls = 0;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const target = createCleanTarget(
      () => home,
      () => ++calls > 1,
    );
    const result = await run([target], {
      context: { ...context, mode: "run" },
      headroom: { drives: [] },
      yes: true,
      state,
    });
    expect(result.exit).toBe(0);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(existsSync(cache)).toBe(true);
    expect(result.plan?.targets[0]?.candidates[0]).toMatchObject({
      verdict: "KEEP",
      reason: "busy: uv",
    });
  });
});
