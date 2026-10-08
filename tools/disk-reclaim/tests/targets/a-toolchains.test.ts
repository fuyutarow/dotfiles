import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import {
  liveExecutables,
  readStore,
  releasesToRemove,
  STORES,
  type VersionStore,
} from "../../src/lib/version-stores.ts";
import { createToolchainsTarget } from "../../src/targets/toolchains.ts";

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
const contextFor = (home: string) => {
  const procDir = join(home, "proc");
  mkdirSync(procDir, { recursive: true });
  return { ...context, procDir };
};
const NOW = 2_000_000_000;
const OLD = NOW - 10 * 86400;
const names = (releases: readonly { name: string }[]) =>
  releases.map((release) => release.name);

function versionHome(store: VersionStore): string {
  const home = tempRoot("reclaim-version-store-");
  mkdirSync(join(home, store.dir), { recursive: true });
  mkdirSync(join(home, store.pointer, ".."), { recursive: true });
  for (const version of ["1.0", "2.0"]) {
    const path = join(home, store.dir, version);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "bin"), "fixture");
    utimesSync(path, OLD, OLD);
  }
  symlinkSync(join(home, store.dir, "2.0"), join(home, store.pointer));
  return home;
}

describe("toolchains target and version stores", () => {
  test("selects superseded old releases while preserving current, recent, and live releases", () => {
    const store = STORES[0];
    expect(store).toBeDefined();
    if (store === undefined) return;
    const home = versionHome(store);
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const dir = join(home, store.dir);
    utimesSync(join(dir, "1.0"), NOW - 3600, NOW - 3600);
    mkdirSync(join(dir, "0.9"));
    utimesSync(join(dir, "0.9"), OLD, OLD);
    const found = readStore(home, store);
    expect(found.current).toBe("2.0");
    expect(
      names(
        releasesToRemove(found.releases, {
          current: found.current,
          live: [join(dir, "0.9")],
          nowSec: NOW,
          keepDays: 2,
        }),
      ),
    ).toEqual([]);
    expect(
      names(
        releasesToRemove(found.releases, {
          current: found.current,
          live: [],
          nowSec: NOW,
          keepDays: 2,
        }),
      ),
    ).toEqual(["0.9"]);
  });

  test("matches a current pointer resolving inside a release directory", () => {
    const home = tempRoot("reclaim-version-pointer-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const store: VersionStore = {
      name: "fixture",
      dir: "releases",
      pointer: "current",
    };
    mkdirSync(join(home, "releases/2.0/bin"), { recursive: true });
    symlinkSync(join(home, "releases/2.0/bin"), join(home, "current"));
    expect(readStore(home, store).current).toBe("2.0");
  });

  test("missing pointer or process evidence keeps all releases", () => {
    const store = STORES[0];
    expect(store).toBeDefined();
    if (store === undefined) return;
    const home = versionHome(store);
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    rmSync(join(home, store.pointer));
    const found = readStore(home, store);
    expect(found.current).toBeUndefined();
    expect(
      releasesToRemove(found.releases, {
        current: found.current,
        live: [],
        nowSec: NOW,
        keepDays: 0,
      }),
    ).toEqual([]);
    expect(
      releasesToRemove(found.releases, {
        current: "2.0",
        live: undefined,
        nowSec: NOW,
        keepDays: 0,
      }),
    ).toEqual([]);
  });

  test("reads executable paths from fixture proc and strips the deleted suffix; missing proc is unknown", () => {
    const proc = tempRoot("reclaim-version-proc-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(proc, { recursive: true, force: true });
    });
    mkdirSync(join(proc, "42"));
    symlinkSync("/opt/tool/1.0 (deleted)", join(proc, "42/exe"));
    mkdirSync(join(proc, "self"));
    expect(liveExecutables(proc)).toEqual(["/opt/tool/1.0"]);
    expect(liveExecutables(join(proc, "missing"))).toBeUndefined();
  });

  test("toolchains plans old VS Code versions except the newest and recent versions", () => {
    const home = tempRoot("reclaim-toolchains-servers-");
    const keepDays = process.env.KEEP_DAYS;
    process.env.KEEP_DAYS = "2";
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      if (keepDays === undefined) delete process.env.KEEP_DAYS;
      else process.env.KEEP_DAYS = keepDays;
      rmSync(home, { recursive: true, force: true });
    });
    const servers = join(home, ".vscode-server/cli/servers");
    const old = join(servers, "Stable-oldfixture");
    const newest = join(servers, "Stable-newfixture");
    const recent = join(servers, "Stable-recentfixture");
    for (const path of [old, newest, recent])
      mkdirSync(path, { recursive: true });
    const oldSec =
      Temporal.Now.instant().epochMilliseconds / 1000 - 100 * 86400;
    const recentSec = Temporal.Now.instant().epochMilliseconds / 1000 - 86400;
    utimesSync(old, oldSec, oldSec);
    utimesSync(recent, recentSec, recentSec);
    const planned = createToolchainsTarget(() => home)
      .plan(contextFor(home))
      .map((candidate) => candidate.path);
    expect(planned).toContain(old);
    expect(planned).not.toContain(newest);
    expect(planned).not.toContain(recent);
  });

  test("rustup pin files and the discovered default toolchain are explicit KEEP candidates", () => {
    const home = tempRoot("reclaim-toolchains-pins-");
    const projects = join(home, "Workspace/project");
    const rustupDir = join(home, ".rustup/toolchains");
    const defaultPath = join(rustupDir, "stable-x86_64-unknown-linux-gnu");
    const pinnedPath = join(rustupDir, "nightly-x86_64-unknown-linux-gnu");
    const removablePath = join(rustupDir, "1.80.0-x86_64-unknown-linux-gnu");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    mkdirSync(projects, { recursive: true });
    mkdirSync(defaultPath, { recursive: true });
    mkdirSync(pinnedPath, { recursive: true });
    mkdirSync(removablePath, { recursive: true });
    writeFileSync(
      join(projects, "rust-toolchain.toml"),
      '[toolchain]\nchannel = "nightly"\n',
    );
    const target = createToolchainsTarget(() => home, {
      available: () => true,
      defaultToolchain: () => "stable-x86_64-unknown-linux-gnu",
    });
    const rustup = target
      .plan(contextFor(home))
      .filter((candidate) => candidate.path?.startsWith(rustupDir) === true);
    expect(
      rustup
        .toSorted((left, right) =>
          (left.path ?? "").localeCompare(right.path ?? ""),
        )
        .map(({ path, verdict, reason }) => [path, verdict, reason]),
    ).toEqual([
      [removablePath, "RECLAIM", "non-default rustup toolchain is not pinned"],
      [pinnedPath, "KEEP", "pinned rustup toolchain"],
      [defaultPath, "KEEP", "default rustup toolchain"],
    ]);
  });

  test("a selected superseded release is actually deleted through the target action", async () => {
    const store = STORES[0];
    expect(store).toBeDefined();
    if (store === undefined) return;
    const home = versionHome(store);
    const procDir = join(home, "proc");
    mkdirSync(procDir);
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(home, { recursive: true, force: true });
    });
    const target = createToolchainsTarget(() => home);
    const oldRelease = join(home, store.dir, "1.0");
    const oldSec =
      Temporal.Now.instant().epochMilliseconds / 1000 - 100 * 86400;
    utimesSync(oldRelease, oldSec, oldSec);
    const candidate = target
      .plan(contextFor(home))
      .find((item) => item.path === oldRelease);
    expect(candidate).toBeDefined();
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    expect(
      await target.act(candidate, {
        ...contextFor(home),
        mode: "run",
        procDir,
      }),
    ).toMatchObject({ ok: true });
    expect(existsSync(oldRelease)).toBe(false);
  });
});
