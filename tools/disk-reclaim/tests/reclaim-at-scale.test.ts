import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { deleteApproved } from "../src/delete.ts";
import { loadConfig, run, type EngineOptions } from "../src/engine.ts";
import { removeTree } from "../src/lib/remove-tree.ts";
import type { LivenessSnapshot } from "../src/liveness/facts.ts";
import { purgeCandidates, purgeRip } from "../src/targets/purge.ts";
import { createTmpfsTarget } from "../src/targets/tmpfs.ts";
import type { Context } from "../src/targets/index.ts";
import { procFixture } from "./fixtures/procs.ts";
import {
  SCALE_ENTRY_CAP,
  SCALE_BATCH_ENTRIES,
  withScaleRoot,
} from "./fixtures/scale.ts";
import { tempRoot } from "./fixtures/temp.ts";

// Explicit runs include fixture creation and cleanup in the wall-clock bounds.
// Never more than 50k payload entries coexist; cumulative workloads are 100k and 1M.
const TMPFS_BOUND_MS = 240_000;
const GRAVEYARD_BOUND_MS = 300_000;
const scaleTest = test.skipIf(process.env.RECLAIM_SCALE !== "1");
const dirs: string[] = [];
const root = (prefix: string): string => {
  const path = tempRoot(prefix);
  dirs.push(path);
  return path;
};
function restore(path: string): void {
  if (!lstatSync(path).isDirectory()) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) restore(join(path, entry));
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    if (existsSync(dir)) restore(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});
const old = Temporal.Now.instant().epochMilliseconds / 1000 - 48 * 3600;
const quietLiveness: LivenessSnapshot = {
  facts: () => {
    expect.unreachable("liveness facts are not read for tmpfs candidates");
  },
  openPaths: () => ({ open: [], unknown: [] }),
  refresh: () => quietLiveness,
};
const config = () => {
  const loaded = loadConfig();
  if (loaded.config === null)
    return expect.unreachable(loaded.error ?? "config unavailable");
  return { ...loaded.config, repo_roots: [], repos: [], scratch_roots: [] };
};
function repoStoreTree(path: string): void {
  mkdirSync(join(path, "repo", ".git", "objects"), { recursive: true });
  mkdirSync(join(path, "repo", ".jj", "repo", "store"), { recursive: true });
  writeFileSync(join(path, "repo", ".git", "objects", "pack"), "x");
  writeFileSync(join(path, "repo", "src.ts"), "x");
}

test("delete of a graveyard subtree succeeds, repo stores included, with live and uid checks applied", async () => {
  const base = root("reclaim-grave-delete-");
  const graveyard = join(base, "graveyard");
  const subtree = join(graveyard, "home", "fuyu");
  mkdirSync(subtree, { recursive: true });
  repoStoreTree(subtree);
  const procs = procFixture(base);
  const options = {
    config: { ...config(), delete_roots: [] },
    graveyard,
    state: join(base, "state"),
    procRoot: procs.procRoot,
  };
  const plan = await deleteApproved([subtree], { ...options, yes: false });
  expect(plan.rows[0]?.allowed).toBe(true);
  expect(plan.lines.join("\n")).toContain("ok:configured-root");
  expect(plan.lines.join("\n")).toContain("ok:repo-store");
  // A foreign uid is still refused inside the graveyard.
  const foreign = await removeTree(subtree, {
    uid: process.getuid?.() ?? 0,
    graveyard: true,
    owner: () => ({ uid: (process.getuid?.() ?? 0) + 1, name: "foreign" }),
    protection: { processes: quietLiveness },
  });
  expect(foreign.refused[0]?.reason).toBe("entry is owned by another uid");
  expect(existsSync(subtree)).toBe(true);
  unlinkSync(join(procs.base, "cwd"));
  symlinkSync(subtree, join(procs.base, "cwd"));
  const busy = await deleteApproved([subtree], { ...options, yes: true });
  expect(busy.exit).not.toBe(0);
  expect(existsSync(subtree)).toBe(true);
  unlinkSync(join(procs.base, "cwd"));
  symlinkSync("/elsewhere", join(procs.base, "cwd"));
  const done = await deleteApproved([subtree], { ...options, yes: true });
  expect(done.exit).toBe(0);
  expect(existsSync(subtree)).toBe(false);
  // The graveyard itself and paths outside it are not opened up.
  const outside = join(base, "elsewhere");
  mkdirSync(outside);
  const refused = await deleteApproved([graveyard, outside], {
    ...options,
    yes: false,
  });
  expect(refused.rows.map((row) => row.allowed)).toEqual([false, false]);
});

test("a graveyard entry holding .git and .jj is purged; outside a graveyard it is still refused", async () => {
  const base = root("reclaim-grave-store-");
  const grave = join(base, "grave");
  mkdirSync(grave);
  repoStoreTree(grave);
  const kept = join(base, "live");
  mkdirSync(kept);
  repoStoreTree(kept);
  const uid = process.getuid?.() ?? 0;
  // The stage's quiet process snapshot keeps the host's /proc (unreadable entries read as
  // "process paths are unknown") out of the store and uid rules under test.
  const protection = { processes: quietLiveness };
  const refused = await removeTree(kept, { uid, protection });
  expect(refused.refused.map((item) => item.reason)).toContain(
    "repo store holder",
  );
  const removed = await removeTree(grave, { uid, graveyard: true, protection });
  expect(removed.ok).toBe(true);
  expect(removed.entries_removed).toBeGreaterThan(5);
  expect(existsSync(grave)).toBe(false);
});

test("rip-expire handles equally old subtrees in path order and can be limited to one subtree", async () => {
  const base = root("reclaim-expire-order-");
  const graveyard = join(base, "graveyard");
  for (const [name, files] of [
    ["home", 20],
    ["tmp", 3],
  ] as const) {
    mkdirSync(join(graveyard, name), { recursive: true });
    for (let n = 0; n < files; n += 1)
      writeFileSync(join(graveyard, name, `f${n}`), "x".repeat(8192));
    if (name === "tmp") repoStoreTree(join(graveyard, name));
    utimesSync(join(graveyard, name), old, old);
  }
  const acted: string[] = [];
  const target = {
    ...purgeRip,
    act: (candidate: Parameters<typeof purgeRip.act>[0], ctx: Context) => {
      acted.push(candidate.id);
      return purgeRip.act(candidate, ctx);
    },
  };
  const state = join(base, "state");
  const procDir = join(base, "proc");
  mkdirSync(procDir);
  const process_ = { ...process.env, RIP_GRAVEYARD: graveyard };
  const candidates = await purgeCandidates(process_, base, {
    config: config(),
    only: join(graveyard, "tmp"),
  });
  expect(candidates.map((item) => item.path)).toEqual([join(graveyard, "tmp")]);
  const previous = process.env.RIP_GRAVEYARD;
  process.env.RIP_GRAVEYARD = graveyard;
  const result = await run([target], {
    context: {
      mode: "plan",
      explicit: true,
      config: config(),
      procDir,
      scanCacheDir: join(base, "cache"),
      log: () => {},
    },
    headroom: { drives: [] },
    state,
    yes: true,
    captureLiveness: () => quietLiveness,
  } satisfies EngineOptions).finally(() => {
    if (previous === undefined) delete process.env.RIP_GRAVEYARD;
    else process.env.RIP_GRAVEYARD = previous;
  });
  expect(result.exit).toBe(0);
  expect(acted.map((id) => id.split(": ")[1])).toEqual(["home", "tmp"]);
  expect(existsSync(join(graveyard, "home"))).toBe(false);
});

scaleTest(
  "100k tmpfs candidates in bounded batches: constant mount and liveness measurements per stage",
  async () => {
    const started = performance.now();
    let reclaimed = 0;
    let measurements = 0;
    for (let batch = 0; batch < 2; batch += 1) {
      const batchResult = await withScaleRoot("tmpfs-", async (base) => {
        const mount = join(base, "mnt");
        mkdirSync(mount);
        for (let n = 0; n < SCALE_BATCH_ENTRIES; n += 1) {
          const dir = join(mount, `cand-${n}`);
          mkdirSync(dir);
          utimesSync(dir, old, old);
        }
        let statfsCalls = 0;
        let snapshots = 0;
        const logs: string[] = [];
        const target = createTmpfsTarget({
          mounts: () => [{ path: mount, type: "tmpfs" }],
          statfs: () => {
            statfsCalls += 1;
            return {
              type: 0x01021994n,
              files: 1_048_576n,
              ffree: 900_000n,
              blocks: 100n,
              bfree: 50n,
              bsize: 4096n,
            };
          },
          isOpen: () => false,
          scanMaxEntries: 1_000,
        });
        const procDir = join(base, "proc");
        mkdirSync(procDir);
        const result = await run([target], {
          context: {
            mode: "plan",
            explicit: true,
            config: config(),
            procDir,
            scanCacheDir: join(base, "cache"),
            log: (line) => {
              logs.push(line);
            },
          },
          headroom: { drives: [] },
          state: join(base, "state"),
          yes: true,
          captureLiveness: () => {
            snapshots += 1;
            return quietLiveness;
          },
        } satisfies EngineOptions);
        expect(result.exit, logs.slice(-5).join("\n")).toBe(0);
        expect(readdirSync(mount)).toEqual([]);
        // Preview, under-lock preview, action-stage plan, completion: one read each.
        expect(statfsCalls).toBe(4);
        expect(snapshots).toBeGreaterThan(0);
        expect(snapshots).toBeLessThanOrEqual(4);
        expect(logs.filter((line) => line.startsWith("[tmpfs] "))).toHaveLength(
          2,
        );
        expect(logs.join("\n")).toContain(
          `from ${SCALE_BATCH_ENTRIES} candidates`,
        );
        process.stderr.write(
          `[scale] tmpfs batch ${batch + 1}: ${SCALE_BATCH_ENTRIES} candidates, ${statfsCalls} mount measurements, ${snapshots} liveness snapshots\n`,
        );
        return statfsCalls;
      });
      expect(
        batchResult.isOk(),
        batchResult.isErr() ? batchResult.error.message : "",
      ).toBe(true);
      if (batchResult.isErr()) return;
      reclaimed += SCALE_BATCH_ENTRIES;
      measurements += batchResult.value;
    }
    const elapsed = performance.now() - started;
    expect(reclaimed).toBe(100_000);
    process.stderr.write(
      `[scale] tmpfs: ${reclaimed} candidates, ${measurements} mount measurements, ${Math.round(elapsed)} ms / ${TMPFS_BOUND_MS} ms bound (setup and cleanup included)\n`,
    );
    expect(elapsed).toBeLessThan(TMPFS_BOUND_MS);
  },
  360_000,
);

scaleTest(
  "1M graveyard files in bounded batches are purged within the stated bound",
  async () => {
    const started = performance.now();
    let filesRemoved = 0;
    let entriesRemoved = 0;
    let bytesRemoved = 0;
    while (filesRemoved < 1_000_000) {
      const count = Math.min(SCALE_BATCH_ENTRIES, 1_000_000 - filesRemoved);
      const batchResult = await withScaleRoot("graveyard-", async (base) => {
        const grave = join(base, "grave");
        mkdirSync(grave);
        for (let f = 0; f < count; f += 1)
          writeFileSync(join(grave, `f${f}`), "");
        // Root plus 50k files and run metadata remain below the 100k-entry cap.
        expect(count + 2).toBeLessThan(SCALE_ENTRY_CAP);
        const result = await removeTree(grave, {
          uid: process.getuid?.() ?? 0,
          graveyard: true,
          progress: false,
          protection: { processes: quietLiveness },
        });
        expect(result.ok).toBe(true);
        expect(result.entries_removed).toBe(count + 1);
        expect(existsSync(grave)).toBe(false);
        return { entries: result.entries_removed, bytes: result.bytes_freed };
      });
      expect(
        batchResult.isOk(),
        batchResult.isErr() ? batchResult.error.message : "",
      ).toBe(true);
      if (batchResult.isErr()) return;
      filesRemoved += count;
      entriesRemoved += batchResult.value.entries;
      bytesRemoved += batchResult.value.bytes;
    }
    const elapsed = performance.now() - started;
    process.stderr.write(
      `[scale] graveyard: ${filesRemoved} files, ${entriesRemoved} entries, ${bytesRemoved} bytes; ${Math.round(elapsed)} ms / ${GRAVEYARD_BOUND_MS} ms bound (setup and cleanup included)\n`,
    );
    expect(filesRemoved).toBe(1_000_000);
    expect(elapsed).toBeLessThan(GRAVEYARD_BOUND_MS);
  },
  420_000,
);

test("tmpfs acts small-first and --only limits removal to a named subtree", async () => {
  const base = root("reclaim-tmpfs-order-");
  const mount = join(base, "mnt");
  const large = join(mount, "a-large");
  const small = join(mount, "z-small");
  for (const [dir, count] of [
    [large, 10],
    [small, 1],
  ] as const) {
    mkdirSync(dir, { recursive: true });
    for (let n = 0; n < count; n += 1) {
      const file = join(dir, `f${n}`);
      writeFileSync(file, "x".repeat(8192));
      utimesSync(file, old, old);
    }
    utimesSync(dir, old, old);
  }
  const procDir = join(base, "proc");
  mkdirSync(procDir);
  const acted: string[] = [];
  const target = createTmpfsTarget({
    mounts: () => [{ path: mount, type: "tmpfs" }],
    statfs: () => ({
      type: 0x01021994n,
      files: 1000n,
      ffree: 900n,
      blocks: 100n,
      bfree: 50n,
      bsize: 4096n,
    }),
    isOpen: () => false,
  });
  const wrapped = {
    ...target,
    act: (candidate: Parameters<typeof target.act>[0], ctx: Context) => {
      acted.push(candidate.path ?? "");
      return target.act(candidate, ctx);
    },
  };
  const context: Context = {
    mode: "plan",
    explicit: true,
    config: config(),
    procDir,
    scanCacheDir: join(base, "cache"),
    log: () => {},
  };
  expect(
    (await target.plan({ ...context, only: small }))
      .filter((c) => c.verdict === "RECLAIM")
      .map((c) => c.path),
  ).toEqual([small]);
  const result = await run([wrapped], {
    context,
    headroom: { drives: [] },
    state: join(base, "state"),
    yes: true,
    captureLiveness: () => quietLiveness,
  });
  expect(result.exit).toBe(0);
  expect(acted).toEqual([small, large]);
});

test("ownership conflicts distinguish siblings, prefixes, identical paths, and nested owners", async () => {
  const base = root("reclaim-owners-");
  const procDir = join(base, "proc");
  mkdirSync(procDir);
  const paths = [
    ["/fixture/a", "/fixture/a/one", "/fixture/c"],
    ["/fixture/ab", "/fixture/a/two", "/fixture/c"],
    ["/fixture/a/one/deep", "/fixture/d"],
  ];
  const targets = paths.map((items, index) => ({
    name: `owner-${index}`,
    tier: "blind" as const,
    available: () => ({ available: true, skip_reason: null }),
    plan: () =>
      items.map((path) => ({
        id: path,
        path,
        verdict: "RECLAIM" as const,
        reason: "fixture",
        checks: [],
        bytes: 0,
        bytes_kind: "estimate" as const,
        action: { kind: "delete" as const, argv: [] },
        result: null,
      })),
    act: () => {
      expect.unreachable("plan must never act");
    },
  }));
  const { plan } = await import("../src/engine.ts");
  const result = await plan(targets, {
    context: { mode: "plan", config: config(), procDir, log: () => {} },
    headroom: { drives: [] },
    captureLiveness: () => quietLiveness,
  });
  expect(result.exit).toBe(0);
  (result.plan?.targets ?? []).forEach((target, index) => {
    for (const candidate of target.candidates) {
      const path = candidate.path ?? "";
      const owners = paths.flatMap((items, other) =>
        other !== index &&
        items.some(
          (item) =>
            path === item ||
            path.startsWith(`${item}/`) ||
            item.startsWith(`${path}/`),
        )
          ? [`owner-${other}`]
          : [],
      );
      expect(candidate.verdict).toBe(owners.length > 0 ? "ASK" : "RECLAIM");
      if (owners.length > 0)
        expect(candidate.reason).toBe(
          `ownership conflict: ${[target.name, ...owners].toSorted().join(", ")}`,
        );
    }
  });
});

test("tmpfs --only preserves symlink and protected ancestors and purges a graveyard descendant", async () => {
  const base = root("reclaim-tmpfs-scope-");
  const mount = join(base, "mnt");
  const graveyard = join(mount, "graveyard");
  const selected = join(graveyard, "home");
  mkdirSync(selected, { recursive: true });
  repoStoreTree(selected);
  const other = join(graveyard, "tmp");
  mkdirSync(other);
  const outside = join(base, "outside");
  mkdirSync(join(outside, "child"), { recursive: true });
  symlinkSync(outside, join(mount, "escape"));
  mkdirSync(join(mount, "claude-active", "child"), { recursive: true });
  const procDir = join(base, "proc");
  mkdirSync(procDir);
  const target = createTmpfsTarget({
    mounts: () => [{ path: mount, type: "tmpfs" }],
    statfs: () => ({
      type: 0x01021994n,
      files: 1000n,
      ffree: 900n,
      blocks: 100n,
      bfree: 50n,
      bsize: 4096n,
    }),
    isOpen: () => false,
    ripGraveyard: () => graveyard,
  });
  const context: Context = {
    mode: "plan",
    config: config(),
    procDir,
    log: () => {},
    scanCacheDir: join(base, "cache"),
  };
  for (const only of [
    join(mount, "escape", "child"),
    join(mount, "claude-active", "child"),
  ]) {
    const payloads = (await target.plan({ ...context, only })).filter(
      (row) => !row.id.startsWith("tmpfs-usage:"),
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.verdict).toBe("KEEP");
  }
  const result = await run([target], {
    context: { ...context, only: selected },
    headroom: { drives: [] },
    state: join(base, "state"),
    yes: true,
    captureLiveness: () => quietLiveness,
  });
  expect(result.exit).toBe(0);
  expect(existsSync(selected)).toBe(false);
  expect(existsSync(other)).toBe(true);
  expect(existsSync(join(outside, "child"))).toBe(true);
});

test("rip-expire --only never follows an intermediate graveyard symlink", async () => {
  const base = root("reclaim-expire-symlink-");
  const graveyard = join(base, "graveyard");
  const outside = join(base, "outside");
  mkdirSync(graveyard);
  mkdirSync(join(outside, "child"), { recursive: true });
  symlinkSync(outside, join(graveyard, "escape"));
  expect(
    await purgeCandidates({ RIP_GRAVEYARD: graveyard }, base, {
      config: config(),
      ripOnly: true,
      only: join(graveyard, "escape", "child"),
    }),
  ).toEqual([]);
  expect(existsSync(join(outside, "child"))).toBe(true);
});
