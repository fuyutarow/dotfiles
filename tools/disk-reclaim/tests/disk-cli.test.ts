import { jsonOf, jsonText, z } from "@dotfiles/shared/src/zod.ts";
import { describe, expect, spyOn, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rename,
  symlink,
  utimes,
  lstat,
  open,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { runProbe } from "../src/disk-probe.ts";
import { planPaths } from "../src/disk-path-plan.ts";
import { movePaths } from "../src/disk-move.ts";
import type { Candidate, Config } from "../src/model.ts";
import type { Context, Target } from "../src/targets/index.ts";
import { createToolchainsTarget } from "../src/targets/toolchains.ts";
import { toolchainsWorker } from "../src/disk-toolchains-worker.ts";

const cli = join(import.meta.dir, "../src/disk.ts");

for (const [scenario, reason] of [
  ["ownership", "entry is owned by another uid"],
  ["filesystem", "filesystem boundary (st_dev differs)"],
  ["nested-protected", "protected: tool installation root"],
  ["policy", "cannot load graveyard age policy"],
] as const) {
  test(`purge entry reports ${scenario} refusal from the old planner and executor`, async () => {
    const { main } = await import("../src/disk.ts");
    const { purgeCandidates, createPurgeTarget } =
      await import("../src/targets/purge.ts");
    const { removeTree } = await import("../src/lib/remove-tree.ts");
    const { purgeAction } = await import("../src/disk-purge-action.ts");
    const root = await mkdtemp(join(tmpdir(), "disk-purge-refusal-"));
    const grave = join(root, "grave");
    const path = join(grave, "payload");
    const nested = join(path, "nested");
    await mkdir(nested, { recursive: true });
    const now = Temporal.Now.instant().epochMilliseconds;
    await writeFile(
      join(grave, ".record"),
      `${Temporal.Instant.fromEpochMilliseconds(now - 30 * 86400_000).toString()}\t/source\t${path}\n`,
    );
    const plan = () =>
      purgeCandidates(
        { RIP_GRAVEYARD: grave, XDG_DATA_HOME: join(root, "xdg") },
        root,
        {
          now,
          only: path,
          availableBytes: () => 100 * 1024 ** 3,
          policyPath:
            scenario === "policy"
              ? join(root, "missing.toml")
              : join(import.meta.dir, "../reclaim.toml"),
        },
      );
    let runs = 0;
    const oldTarget = createPurgeTarget({
      writable: () => {},
      remove: async (entry, options) => {
        runs++;
        return removeTree(entry, {
          ...options,
          dryRun: true,
          progress: false,
          measureFilesystem: false,
          owner: (item) => ({
            uid:
              scenario === "ownership" && item === nested
                ? 999999
                : (process.getuid?.() ?? 0),
            name: "fixture",
          }),
          device: (item) =>
            scenario === "filesystem" && item === nested ? 2 : 1,
          immutable: () => false,
          protection: {
            home: root,
            brewPrefix: null,
            repoRoots: [],
            protectedPaths: scenario === "nested-protected" ? [nested] : [],
            processes: { openPaths: () => ({ open: [], unknown: [] }) },
          },
        });
      },
    });
    const target: Target = { ...oldTarget, plan };
    const deps = {
      guard: (): string | null => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        if (action === undefined)
          return {
            out: JSON.stringify(
              (await plan()).map((candidate) => ({
                candidate,
                fingerprint: "same",
              })),
            ),
            err: "",
            exit: 0,
            timedOut: false,
          };
        const parsed = jsonOf(
          z.object({
            id: z.string(),
            path: z.string(),
            fingerprint: z.string(),
          }),
        ).safeParse(action);
        if (!parsed.success)
          return { out: "", err: "invalid action", exit: 1, timedOut: false };
        const result = await purgeAction(parsed.data, {
          target,
          context: { ...cleanContext, log: () => {} },
          identity: () => Promise.resolve("same"),
          protection: () => null,
          device: () => Promise.resolve(1),
          measure: () => Promise.resolve(cleanObservation(100)),
          fail: () => process.exit(99),
        });
        return {
          out: JSON.stringify(result),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    let output = "";
    const stdout = spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        output += String(chunk);
        return true;
      },
    );
    const previous = process.exitCode;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      stdout.mockRestore();
      process.exitCode = previous ?? 0;
    });
    await main(
      ["free", "targets", "purge", "--only", path, "--no-progress"],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      deps,
    );
    const result = jsonOf(
      z.object({
        items: z.array(
          z.object({
            path: z.string().nullable(),
            verdict: z.string(),
            reason: z.string(),
            effect: z.string(),
            detail: z.unknown(),
          }),
        ),
      }),
    ).safeParse(output);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const row = result.data.items.find((item) =>
      scenario === "policy" ? item.path === null : item.path === path,
    );
    expect(row?.verdict).toBe(scenario === "policy" ? "ask" : "keep");
    expect(row?.reason).toContain(reason);
    expect(row?.effect).toBe("none");
    if (scenario !== "policy")
      expect(row?.detail).toMatchObject({ refused: [{ reason }] });
    expect(runs).toBe(scenario === "policy" ? 0 : 1);
    expect(existsSync(nested)).toBe(true);
  });
}

test("purge requires explicit target selection", async () => {
  const result = await runProbe(
    [process.execPath, cli, "free", "targets", "--no-progress"],
    10000,
    process.env,
  );
  expect(result.exit).toBe(2);
  expect(result.out).toBe("");
});

for (const scenario of [
  "recent",
  "unknown-burial",
  "record",
  "protected",
  "changed",
  "positive",
  "zero",
  "undo",
  "pressure-without-deny",
  "pressure-deny",
] as const) {
  test(`purge entry preserves ${scenario}`, async () => {
    const { main } = await import("../src/disk.ts");
    const { purgeCandidates, purge } = await import("../src/targets/purge.ts");
    const { cleanAction } = await import("../src/disk-clean-action.ts");
    const root = await mkdtemp(join(tmpdir(), "disk-purge-fixture-"));
    const grave = join(root, "grave");
    const path = join(grave, "payload");
    await mkdir(path, { recursive: true });
    const now = Temporal.Now.instant().epochMilliseconds;
    let age = 30 * 86400_000;
    if (scenario.startsWith("pressure-")) age = 30 * 60_000;
    if (scenario === "recent" || scenario === "record" || scenario === "undo")
      age = 60_000;
    if (scenario !== "unknown-burial")
      await writeFile(
        join(grave, ".record"),
        `${Temporal.Instant.fromEpochMilliseconds(now - age).toString()}\t/source\t${path}\n`,
      );
    const env = { RIP_GRAVEYARD: grave, XDG_DATA_HOME: join(root, "xdg") };
    const plan = () =>
      purgeCandidates(env, root, {
        now,
        availableBytes: () => 100 * 1024 ** 3,
        policyPath: join(import.meta.dir, "../reclaim.toml"),
        underPressure: scenario === "undo" || scenario.startsWith("pressure-"),
        headroom: {
          drives: [
            {
              label: "fixture",
              path: root,
              free: 1,
              total: 100,
              deny_line: 10,
              warn_line: null,
              stop_line: null,
              state: scenario === "pressure-without-deny" ? "ok" : "deny",
            },
          ],
        },
      });
    const target: Target = {
      ...purge,
      plan,
      act: () => {
        actions++;
        return { ok: true, bytes_freed: 1000, error: null };
      },
    };
    let actions = 0;
    let measurements = 0;
    const deps = {
      guard: (): string | null => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        if (action === undefined)
          return {
            out: JSON.stringify(
              (await plan()).map((candidate) => ({
                candidate,
                fingerprint: "same",
              })),
            ),
            err: "",
            exit: 0,
            timedOut: false,
          };
        const parsed = jsonOf(
          z.object({
            id: z.string(),
            path: z.string(),
            fingerprint: z.string(),
          }),
        ).safeParse(action);
        if (!parsed.success)
          return { out: "", err: "invalid action", exit: 1, timedOut: false };
        const value = await cleanAction(parsed.data, {
          target,
          context: cleanContext,
          identity: () =>
            Promise.resolve(scenario === "changed" ? "changed" : "same"),
          protection: () =>
            scenario === "protected" ? "configured protected path" : null,
          device: () => Promise.resolve(1),
          measure: () =>
            Promise.resolve(
              cleanObservation(
                measurements++ === 0 || scenario === "zero" ? 100 : 110,
              ),
            ),
          fail: () => process.exit(99),
          completedReason: "purge removal completed",
        });
        return {
          out: JSON.stringify(value),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    let output = "";
    const stdout = spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        output += String(chunk);
        return true;
      },
    );
    const previousExit = process.exitCode;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      stdout.mockRestore();
      process.exitCode = previousExit ?? 0;
    });
    await main(
      [
        "free",
        "targets",
        "purge",
        "--no-progress",
        ...(scenario === "undo" || scenario.startsWith("pressure-")
          ? ["--under-pressure"]
          : []),
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      deps,
    );
    const result = jsonText.safeParse(output);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const schema = z.object({
      items: z.array(
        z.object({
          path: z.string().nullable(),
          verdict: z.string(),
          reason: z.string(),
          effect: z.string(),
        }),
      ),
    });
    const parsed = schema.safeParse(result.data);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const selected = parsed.data.items.find(
      (item) =>
        item.path === (scenario === "record" ? join(grave, ".record") : path),
    );
    const expected = {
      recent: "keep",
      "unknown-burial": "keep",
      record: "keep",
      protected: "keep",
      changed: "changed",
      positive: "completed",
      zero: "partial",
      undo: "keep",
      "pressure-without-deny": "keep",
      "pressure-deny": "completed",
    };
    expect(selected?.verdict).toBe(expected[scenario]);
    expect(selected?.effect).toBe(
      scenario === "positive" ||
        scenario === "zero" ||
        scenario === "pressure-deny"
        ? "unlink"
        : "none",
    );
    if (scenario === "record")
      expect(selected?.reason).toContain("required to restore");
    if (scenario === "unknown-burial")
      expect(selected?.reason).toContain("burial");
    if (scenario === "protected")
      expect(selected?.reason).toContain("protected");
    expect(existsSync(path)).toBe(true);
    expect(actions).toBe(
      scenario === "positive" ||
        scenario === "zero" ||
        scenario === "pressure-deny"
        ? 1
        : 0,
    );
  });
}

test("purge worker guard and lock refuse before planning", async () => {
  const { freeClean } = await import("../src/disk-clean.ts");
  let calls = 0;
  const deps = {
    guard: (): string | null => "worker refused",
    lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
    probe: () => {
      calls++;
      return Promise.resolve({ out: "", err: "", exit: 0, timedOut: false });
    },
    receipt: () =>
      Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
  };
  expect(
    (
      await freeClean(
        10000,
        performance.now(),
        false,
        deps,
        undefined,
        false,
        "purge",
      )
    ).exit,
  ).toBe(1);
  expect(
    (
      await freeClean(
        10000,
        performance.now(),
        false,
        { ...deps, guard: () => null },
        undefined,
        false,
        "purge",
      )
    ).exit,
  ).toBe(3);
  expect(calls).toBe(0);
});

test("purge plan with approval never calls its action adapter", async () => {
  const { main } = await import("../src/disk.ts");
  let calls = 0;
  const deps = {
    guard: (): string | null => null,
    lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
    probe: () => {
      calls++;
      return Promise.resolve({ out: "", err: "", exit: 0, timedOut: false });
    },
    receipt: () =>
      Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
  };
  const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
  const previousExit = process.exitCode;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    process.exitCode = previousExit ?? 0;
  });
  await main(
    [
      "plan",
      "targets",
      "--target",
      "purge",
      "--approve",
      "fixture",
      "--no-progress",
    ],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    deps,
  );
  expect(calls).toBe(0);
});

test.each([
  ["young", "younger than 60 minutes", "keep"],
  ["open", "open by a process", "keep"],
  ["unknown", "process-use status unavailable", "ask"],
  ["foreign", "owned by another user", "keep"],
  ["protected", "protected session or system directory", "keep"],
  ["configured", "configured protected path", "keep"],
  ["graveyard", "graveyard requires recorded burial", "keep"],
  ["nested-graveyard", "contains a graveyard", "keep"],
  ["limit", "tree safety scan limit exceeded", "ask"],
  ["time", "tree safety scan limit exceeded", "ask"],
  ["depth", "tree safety scan limit exceeded", "ask"],
  ["idle", "tmpfs removal completed", "completed"],
  ["zero", "no measured increase", "partial"],
  ["changed", "fingerprint changed", "changed"],
] as const)("tmpfs adapter preserves %s", async (scenario, reason, verdict) => {
  const { createTmpfsTarget } = await import("../src/targets/tmpfs.ts");
  const { freeClean } = await import("../src/disk-clean.ts");
  const { cleanAction } = await import("../src/disk-clean-action.ts");
  const root = await mkdtemp(join(tmpdir(), "disk-tmpfs-fixture-"));
  let name = "candidate";
  if (scenario === "protected") name = "claude-session";
  if (scenario === "graveyard") name = "graveyard";
  const path = join(root, name);
  await mkdir(path);
  if (scenario === "limit") await mkdir(join(path, "child"));
  if (scenario === "nested-graveyard") await mkdir(join(path, "graveyard"));
  if (scenario === "limit") await utimes(join(path, "child"), 1, 1);
  if (scenario === "depth") {
    let nested = path;
    for (let i = 0; i < 66; i++) {
      nested = join(nested, "d");
      await mkdir(nested);
    }
  }
  if (scenario !== "young") await utimes(path, 1, 1);
  if (scenario === "depth") {
    let nested = path;
    for (let i = 0; i < 66; i++) {
      nested = join(nested, "d");
      await utimes(nested, 1, 1);
    }
  }
  const fs = {
    type: 0x01021994n,
    files: 100n,
    ffree: 50n,
    blocks: 100n,
    bfree: 50n,
    bsize: 4096n,
  };
  const target = createTmpfsTarget({
    mounts: () => [{ path: root, type: "tmpfs" }],
    statfs: () => fs,
    uid: () =>
      scenario === "foreign"
        ? (process.getuid?.() ?? 0) + 1
        : (process.getuid?.() ?? 0),
    now: () => Temporal.Now.instant().epochMilliseconds,
    isOpen: () => {
      if (scenario === "open") return true;
      if (scenario === "unknown") return null;
      return false;
    },
    ...(scenario === "limit" ? { scanMaxEntries: 1 } : {}),
    ...(scenario === "time" ? { scanMaxMs: 0 } : {}),
  });
  const context = (): Context => ({
    ...cleanContext,
    targetName: "tmpfs",
    config: {
      ...cleanContext.config,
      protected: scenario === "configured" ? [path] : [],
    },
  });
  let actions = 0;
  let measurements = 0;
  const deps = {
    guard: (): string | null => null,
    lock: (_ms: number) =>
      Promise.resolve({ release: () => {}, exit: 0, error: null }),
    receipt: (_items: unknown[]) =>
      Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
    probe: async (action: string | undefined) => {
      if (action === undefined) {
        const rows = (await target.plan(context())).filter(
          (row) => !row.id.startsWith("tmpfs-usage:"),
        );
        return {
          out: JSON.stringify(
            rows.map((candidate) => ({ candidate, fingerprint: "same" })),
          ),
          err: "",
          exit: 0,
          timedOut: false,
        };
      }
      const parsed = jsonOf(
        z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
      ).safeParse(action);
      if (!parsed.success)
        return { out: "", err: "invalid request", exit: 1, timedOut: false };
      const value = await cleanAction(parsed.data, {
        target: {
          ...target,
          act: () => {
            actions++;
            return { ok: true, bytes_freed: 123, error: null };
          },
        },
        context: context(),
        identity: () =>
          Promise.resolve(scenario === "changed" ? "changed" : "same"),
        protection: () => null,
        device: () => Promise.resolve(1),
        measure: () =>
          Promise.resolve(
            cleanObservation(
              measurements++ === 0 || scenario === "zero" ? 100 : 110,
            ),
          ),
        fail: () => process.exit(99),
        completedReason: "tmpfs removal completed",
      });
      return { out: JSON.stringify(value), err: "", exit: 0, timedOut: false };
    },
  };
  const result = await freeClean(
    10000,
    performance.now(),
    false,
    deps,
    undefined,
    false,
    "tmpfs",
  );
  const item = result.items.find((row) => row.path === path);
  expect(item?.verdict).toBe(verdict);
  expect(item?.reason).toContain(reason);
  expect(item?.effect).toBe(
    scenario === "idle" || scenario === "zero" ? "unlink" : "none",
  );
  expect(actions).toBe(scenario === "idle" || scenario === "zero" ? 1 : 0);
  expect(result.exit).toBe(scenario === "idle" ? 0 : 1);
});

test("tmpfs plan-only and guard, lock, and lost worker refuse effects", async () => {
  const { freeClean } = await import("../src/disk-clean.ts");
  let calls = 0;
  const deps = {
    guard: (): string | null => null,
    lock: (_ms: number) =>
      Promise.resolve({ release: () => {}, exit: 0, error: null }),
    receipt: (_items: unknown[]) =>
      Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
    probe: () => {
      calls++;
      return Promise.resolve({
        out: "",
        err: "lost",
        exit: null,
        timedOut: true,
      });
    },
  };
  const denied = await freeClean(
    10000,
    performance.now(),
    false,
    { ...deps, guard: () => "worker guard" },
    undefined,
    false,
    "tmpfs",
  );
  expect(denied.exit).toBe(1);
  const busy = await freeClean(
    10000,
    performance.now(),
    false,
    {
      ...deps,
      lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
    },
    undefined,
    false,
    "tmpfs",
  );
  expect(busy.exit).toBe(3);
  expect(calls).toBe(0);
  const lost = await freeClean(
    10000,
    performance.now(),
    false,
    deps,
    undefined,
    false,
    "tmpfs",
  );
  expect(lost.exit).toBe(4);
  expect(calls).toBe(1);
  const home = await mkdtemp(join(tmpdir(), "disk-tmpfs-plan-"));
  const planned = await run(
    ["plan", "targets", "--target", "tmpfs", "--no-progress"],
    "",
    { ...process.env, HOME: home },
  );
  expect(planned.exit).toBe(4);
  expect(jsonText.safeParse(planned.out).data).toMatchObject({
    outcome: "unknown",
    items: [{ target: "tmpfs", verdict: "unknown" }],
  });
  const invalid = await run(
    ["plan", "targets", "--target", "tmpfs", "--yes"],
    "",
    { ...process.env, HOME: home },
  );
  expect(invalid.exit).toBe(2);
});
const tmpfsProbe: typeof runProbe = () =>
  Promise.resolve({ out: "tmpfs\n", err: "", exit: 0, timedOut: false });
const cleanIdentity = () => Promise.resolve("same");
const fakeTree = (path: string, reason: string): Promise<Candidate> =>
  Promise.resolve({
    id: path,
    path,
    verdict: "RECLAIM",
    reason,
    checks: [],
    bytes: 123,
    bytes_kind: "freed_now",
    action: { kind: "delete", argv: [path] },
    result: null,
  });
const fakeKeep = async (path: string, reason: string): Promise<Candidate> => ({
  ...(await fakeTree(path, reason)),
  verdict: "KEEP",
  action: { kind: "delete", argv: [] },
});
const cleanContext: Context = {
  mode: "run",
  explicit: true,
  targetName: "clean",
  log: () => {},
  config: {
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: [],
    regenerable_caches: [
      { path: "~/.cache/sccache", class: "REGENERABLE", process: "sccache" },
      { path: "~/.cache/Homebrew", class: "REGENERABLE", process: "brew" },
    ],
  },
};
async function run(
  args: string[],
  input = "",
  env: NodeJS.ProcessEnv = process.env,
) {
  const p = Bun.spawn([process.execPath, cli, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  await p.stdin.write(input);
  await p.stdin.end();
  const [out, err, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { out, err, exit };
}
describe("disk parser and effect firewall", () => {
  test("move records burial and refuses unsafe items using injected probes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "disk-move-fixture-"));
    const graveyard = join(dir, "graveyard");
    await mkdir(graveyard);
    const good = join(dir, "good");
    const live = join(dir, "live");
    const unknown = join(dir, "unknown");
    for (const path of [good, live, unknown]) await writeFile(path, "payload");
    const previous = {
      graveyard: process.env["GRAVEYARD"],
      state: process.env["RECLAIM_STATE_DIR"],
    };
    process.env["GRAVEYARD"] = graveyard;
    process.env["RECLAIM_STATE_DIR"] = join(dir, "state");
    const probe: typeof runProbe = async (argv, _timeout, env) => {
      if (argv[0] === "stat")
        return { out: "apfs\n", err: "", exit: 0, timedOut: false };
      if (argv[0] === "rip") {
        const destination = join(graveyard, "buried");
        await rename(good, destination);
        await writeFile(
          join(graveyard, ".record"),
          `${Temporal.Now.instant().toString()}\t${good}\t${destination}\n`,
        );
        return { out: "", err: "", exit: 0, timedOut: false };
      }
      const path = env?.["DISK_MOVE_PATH"];
      let verdict = "safe";
      let reason = "safe";
      if (path === live) {
        verdict = "deny";
        reason = "live process";
      }
      if (path === unknown) {
        verdict = "unknown";
        reason = "owner unknown";
      }
      return {
        out: JSON.stringify({ verdict, reason }),
        err: "",
        exit: 0,
        timedOut: false,
      };
    };
    using _env = {
      [Symbol.dispose]: () => {
        if (previous.graveyard === undefined) delete process.env["GRAVEYARD"];
        else process.env["GRAVEYARD"] = previous.graveyard;
        if (previous.state === undefined)
          delete process.env["RECLAIM_STATE_DIR"];
        else process.env["RECLAIM_STATE_DIR"] = previous.state;
      },
    };
    const result = await movePaths(
      [good, live, unknown],
      10000,
      performance.now(),
      false,
      probe,
    );
    expect(result.items.map((item) => item.verdict)).toEqual([
      "completed",
      "deny",
      "unknown",
    ]);
    expect(result.items[0]?.effect).toBe("move");
    expect(result.receipt).not.toBeNull();
    expect(await readFile(live, "utf8")).toBe("payload");
    expect(await readFile(unknown, "utf8")).toBe("payload");
    expect(await readFile(join(graveyard, "buried"), "utf8")).toBe("payload");
    const rejected = await movePaths(
      [live],
      10000,
      performance.now(),
      false,
      tmpfsProbe,
    );
    expect(rejected.items[0]).toMatchObject({
      verdict: "deny",
      effect: "none",
      reason: "graveyard is on tmpfs",
    });
    expect(await readFile(live, "utf8")).toBe("payload");
  });
  test("root and verb help and version", async () => {
    for (const args of [
      [],
      ["--help"],
      ["plan", "--help"],
      ["move", "-h"],
      ["free", "--help"],
      ["inspect", "--help"],
      ["--version"],
    ])
      expect((await run(args)).exit).toBe(0);
  });
  test("every mode returns unknown without touching paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "disk-firewall-"));
    const file = join(dir, "payload");
    await writeFile(file, "keep");
    const record = JSON.stringify({
      target: "tmpfs",
      host: "local",
      path: file,
      bytes_allocated: 1,
      regen: true,
      holders: [],
      verdict: "safe",
      reason: "test",
      fingerprint: null,
    });
    const cases: [string[], string?][] = [
      [["plan", "targets"]],
      [["plan", "workspace-gc"]],
      [["move", "workspace-gc"]],
      [["free", "targets", "system"]],
      [["free", "records"], record],
      [["free", "paths", file]],
      [["free", "graveyard", "--amount", "1MB"]],
      [["free", "capacity", "--path", dir, "--min-available", "1KB"]],
      [["inspect", "targets"]],
      [["inspect", "wsl"]],
    ];
    for (const [args, input] of cases) {
      const result = await run(args, input);
      expect(result.exit).toBe(4);
      expect(jsonText.safeParse(result.out).data).toMatchObject({
        schema: "disk.result/1",
        command: args[0],
        mode: args[1],
        outcome: "unknown",
        ...(args[1] === "records" ? {} : { items: [] }),
      });
      expect(await readFile(file, "utf8")).toBe("keep");
    }
  });
  test("records retain refusals and never act while the adapter is unavailable", async () => {
    const fingerprint = { dev: 1, ino: 2, size: 3, mtime: 4 };
    const base = {
      target: "clean",
      host: "local",
      path: "/fixture",
      bytes_allocated: 3,
      regen: true,
      holders: [],
      verdict: "safe",
      reason: "fixture",
      fingerprint,
    };
    const input = [
      base,
      { ...base, path: "/keep", verdict: "keep" },
      { ...base, path: "/deny", verdict: "deny" },
      { ...base, path: "/ask", verdict: "ask", owner_item: "docs" },
      { ...base, path: "C:\\fixture", fingerprint: null },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n");
    const result = await run(["free", "records", "--no-progress"], input);
    expect(result.exit).toBe(4);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      outcome: "unknown",
      items: [
        { verdict: "unknown", effect: "none" },
        { verdict: "keep", effect: "none" },
        { verdict: "deny", effect: "none" },
        { verdict: "ask", effect: "none" },
        { verdict: "deny", effect: "none" },
      ],
      counts: { selected: 5, refused: 4, unknown: 1, completed: 0 },
    });
    const approved = await run(
      ["free", "records", "--approve", "docs", "--no-progress"],
      input,
    );
    expect(approved.exit).toBe(4);
    expect(jsonText.safeParse(approved.out).data).toMatchObject({
      items: [
        { verdict: "unknown" },
        { verdict: "keep" },
        { verdict: "deny" },
        { verdict: "unknown" },
        { verdict: "deny" },
      ],
    });
  });
  test("move paths reports each unverified burial without effects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "disk-move-"));
    const paths = [join(dir, "one"), join(dir, "two")];
    for (const path of paths) await writeFile(path, "keep");
    const result = await run(["move", "paths", ...paths, "--no-progress"], "", {
      ...process.env,
      HOME: dir,
      GRAVEYARD: join(dir, "missing"),
      RECLAIM_STATE_DIR: join(dir, "state"),
    });
    expect(result.exit).toBe(4);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      outcome: "unknown",
      items: paths.map((path) => ({
        path,
        verdict: "unknown",
        effect: "none",
      })),
      counts: { selected: 2, completed: 0, refused: 0, failed: 0, unknown: 2 },
    });
    for (const path of paths) expect(await readFile(path, "utf8")).toBe("keep");
  });
  test("receipt inspection reads only the selected state and preserves errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "disk-receipts-"));
    const env = { ...process.env, RECLAIM_STATE_DIR: dir };
    const path = join(dir, "log.jsonl");
    const receipt = {
      name: "fixture",
      command: ["fixture"],
      host: "fixture",
      pid: 1,
      started: "a",
      ended: "b",
      exit: 0,
      free_before: 1,
      free_after: 2,
      output: null,
    };
    const content = `${JSON.stringify(receipt)}\n`;
    await writeFile(path, content);
    const result = await run(["inspect", "receipts"], "", env);
    expect(result.exit).toBe(0);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      outcome: "completed",
      detail: { receipts: [receipt], errors: [] },
    });
    expect(result.err).toMatch(/elapsed \d+ms \/ deadline 120000ms/u);
    expect(await readFile(path, "utf8")).toBe(content);
    await writeFile(path, "not-json\n");
    const bad = await run(["inspect", "receipts", "--no-progress"], "", env);
    expect(bad.exit).toBe(4);
    expect(jsonText.safeParse(bad.out).data).toMatchObject({
      outcome: "unknown",
      detail: { receipts: [] },
    });
    expect(bad.err).not.toBe("");
    expect(await readFile(path, "utf8")).toBe("not-json\n");
  });
  test("capacity probes do not write the hook cache and time out", async () => {
    const home = await mkdtemp(join(tmpdir(), "disk-capacity-"));
    const env = { ...process.env, HOME: home };
    const cache = join(home, ".cache", "claude-hooks", "storage-headroom");
    const inspected = await run(
      ["inspect", "capacity", "--path", home, "--no-progress"],
      "",
      env,
    );
    expect(inspected.exit).toBe(0);
    expect(jsonText.safeParse(inspected.out).data).toMatchObject({
      outcome: "completed",
      observations: { before: { source: "statfs" } },
    });
    const planned = await run(
      [
        "plan",
        "capacity",
        "--path",
        home,
        "--min-available",
        "1GB",
        "--no-progress",
      ],
      "",
      env,
    );
    expect(planned.exit).toBe(4);
    expect(jsonText.safeParse(planned.out).data).toMatchObject({
      outcome: "unknown",
      observations: { before: { source: "statfs" } },
    });
    expect(existsSync(cache)).toBe(false);
    const timed = await run(
      [
        "inspect",
        "capacity",
        "--path",
        home,
        "--within",
        "1ms",
        "--no-progress",
      ],
      "",
      env,
    );
    expect(timed.exit).toBe(4);
    expect(jsonText.safeParse(timed.out).data).toMatchObject({
      outcome: "unknown",
    });
    expect(existsSync(cache)).toBe(false);
  });
  test("deadline kills and observes a running child", async () => {
    const result = await runProbe(
      [
        process.execPath,
        "-e",
        "console.log(process.pid); setInterval(() => {}, 1000)",
      ],
      300,
    );
    expect(result.timedOut).toBe(true);
    expect(result.exit).not.toBe(0);
    const pid = Number(result.out.trim());
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });
  test("invalid combinations fail before results", async () => {
    const cases = [
      ["plan", "paths", "/x", "--yes"],
      ["free", "records"],
      ["free", "targets", "tmpfs", "--tier", "blind"],
      ["plan", "targets", "--all", "--target", "tmpfs"],
      ["plan", "targets", "--target", "tmpfs", "--target", "tmpfs"],
      ["free", "paths", "relative"],
      ["free", "graveyard", "--amount", "0GB"],
      ["inspect", "wsl", "--within", "0s"],
      ["free", "targets", "clean", "--only", "/x"],
      ["free", "targets", "tmpfs", "--under-pressure"],
      ["inspect", "receipts", "--last", "1", "--last", "2"],
      ["plan", "paths", "--", "--help"],
      ["plan", "paths", "/x", "--__proto__"],
      ["plan", "paths", "/x", "--constructor"],
    ];
    for (const args of cases) {
      const result = await run(args);
      expect(result.exit).toBe(2);
      expect(result.out).toBe("");
      expect(result.err).not.toBe("");
    }
    expect((await run(["free", "records"], "{}\n")).exit).toBe(2);
  });
  test("Cleye boundary preserves terminated paths and quoted probe paths", async () => {
    const home = await mkdtemp(join(tmpdir(), "disk path 'quoted'-"));
    const env = { ...process.env, HOME: home };
    const result = await run(
      ["inspect", "capacity", "--path", home, "--no-progress"],
      "",
      env,
    );
    expect(result.exit).toBe(0);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      scope: { path: home },
      outcome: "completed",
    });
  });
  test("path plan preserves checks and refuses unknown or mismatched results without effects", async () => {
    const signal = new AbortController().signal;
    const rows = [
      {
        path: "/safe",
        bytes: 20,
        allowed: true,
        checks: [{ name: "root", ok: true, detail: "allowed" }],
      },
      {
        path: "/held",
        bytes: null,
        allowed: false,
        checks: [
          { name: "undo", ok: false, detail: "undo window" },
          { name: "process", ok: false, detail: "unknown process" },
        ],
      },
      {
        path: "/unknown",
        bytes: null,
        allowed: false,
        checks: [{ name: "process", ok: false, detail: "unknown process" }],
      },
    ];
    let calls = 0;
    const result = await planPaths(
      ["/safe", "/held", "/unknown"],
      100,
      signal,
      (paths, timeout) => {
        calls++;
        expect(paths).toEqual(["/safe", "/held", "/unknown"]);
        expect(timeout).toBe(100);
        return Promise.resolve({ out: JSON.stringify(rows), error: null });
      },
    );
    expect(calls).toBe(1);
    expect(result.items.map((item) => item.verdict)).toEqual([
      "safe",
      "keep",
      "unknown",
    ]);
    expect(result.items.every((item) => item.effect === "none")).toBe(true);
    expect(result.items[1]?.detail.checks).toEqual(rows[1]?.checks);
    const mismatch = await planPaths(["/other"], 100, signal, () =>
      Promise.resolve({ out: JSON.stringify(rows), error: null }),
    );
    expect(mismatch.error).not.toBeNull();
    const timed = await planPaths(["/safe"], 1, signal, () =>
      Promise.resolve({ out: "", error: "deadline exceeded" }),
    );
    expect(timed.items).toEqual([]);
    expect(timed.error).toBe("deadline exceeded");
  });
  test("path plan retains each legacy refusal and never upgrades an incomplete size", async () => {
    const checks: [string, string][] = [
      ["configured-root", "outside configured roots"],
      ["protected-root", "filesystem root and HOME are protected"],
      ["no-symlink-escape", "symlink path refused"],
      ["repo-store", "repo root protection: repo store holder"],
      ["jj-workspace", "listed workspace"],
      ["no-live-process", "pid 3 has cwd under target"],
      ["graveyard-undo-window", "undo window: recorded burial is too recent"],
      ["graveyard-undo-window", "unknown burial"],
    ];
    const rows = checks.map(([name, detail], index) => ({
      path: `/item${index}`,
      bytes: null,
      allowed: false,
      checks: [{ name, ok: false, detail }],
    }));
    rows.push({ path: "/incomplete", bytes: null, allowed: true, checks: [] });
    const result = await planPaths(
      rows.map((row) => row.path),
      100,
      new AbortController().signal,
      () => Promise.resolve({ out: JSON.stringify(rows), error: null }),
    );
    expect(
      result.items.slice(0, 7).every((item) => item.verdict === "keep"),
    ).toBe(true);
    expect(result.items[7]?.verdict).toBe("unknown");
    expect(result.items[8]?.verdict).toBe("unknown");
    expect(result.items.map((item) => item.detail.checks)).toEqual(
      rows.map((row) => row.checks),
    );
  });
  test("plan-only targets are refused without effects, including in mixed selections", async () => {
    const home = await mkdtemp(join(tmpdir(), "disk-plan-only-"));
    const file = join(home, "payload");
    await writeFile(file, "keep");
    const env = {
      ...process.env,
      HOME: home,
      RECLAIM_STATE_DIR: join(home, "state"),
    };
    for (const target of ["vhdx", "audit"]) {
      const result = await run(
        ["free", "targets", target, "--no-progress"],
        "",
        env,
      );
      expect(result.exit).toBe(1);
      expect(jsonText.safeParse(result.out).data).toMatchObject({
        outcome: "partial",
        items: [{ target, verdict: "deny", effect: "none" }],
        counts: {
          selected: 1,
          completed: 0,
          refused: 1,
          failed: 0,
          unknown: 0,
        },
        observations: { delta_available_bytes: null },
      });
      expect(await readFile(file, "utf8")).toBe("keep");
      expect(existsSync(join(home, "state"))).toBe(false);
    }
    const mixed = await run(
      ["free", "targets", "audit", "clean", "--no-progress"],
      "",
      env,
    );
    expect(mixed.exit).toBe(4);
    expect(jsonText.safeParse(mixed.out).data).toMatchObject({
      outcome: "unknown",
      items: [
        { target: "audit", verdict: "deny" },
        { target: "clean", verdict: "unknown" },
      ],
      counts: { selected: 2, completed: 0, refused: 1, failed: 0, unknown: 1 },
    });
    expect(await readFile(file, "utf8")).toBe("keep");
    expect(existsSync(join(home, "state"))).toBe(false);
  });
  test("stdin wait reports elapsed time and respects its deadline", async () => {
    const p = Bun.spawn(
      [process.execPath, cli, "free", "records", "--within", "50ms"],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [out, err, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    expect(exit).toBe(4);
    expect(err).toMatch(
      /waiting for input; elapsed \d+ms \/ deadline 50ms; last stage: parsing/u,
    );
    expect(jsonText.safeParse(out).data).toMatchObject({ outcome: "unknown" });
  });
});

test("mise-configs adapter keeps guards and reports measured bulk result", async () => {
  const { freeMiseConfigs } = await import("../src/disk-mise-configs.ts");
  const { createMiseConfigsTarget } =
    await import("../src/targets/mise-configs.ts");
  const candidate = {
    id: "mise-configs:prune",
    path: null,
    verdict: "RECLAIM" as const,
    reason: "one dead record",
    checks: [],
    bytes: null,
    bytes_kind: "estimate" as const,
    action: { kind: "command" as const, argv: ["mise", "prune", "--configs"] },
    result: null,
  };
  let acts = 0;
  let released = 0;
  let fingerprints = ["identity", "identity"];
  let free = [100, 105];
  const target = {
    ...createMiseConfigsTarget(),
    available: () => ({ available: true, skip_reason: null }),
    plan: () => [candidate],
    act: () => {
      acts++;
      return { ok: true, bytes_freed: null, error: null };
    },
  };
  const deps = {
    target,
    guard: (): string | null => null,
    lock: (_ms: number) =>
      Promise.resolve({
        release: () => {
          released++;
        },
        exit: 0,
        error: null,
      }),
    fingerprint: () => Promise.resolve(fingerprints.shift() ?? "identity"),
    measure: () =>
      Promise.resolve({
        time: "fixture",
        source: "statfs",
        mount: null,
        filesystem: null,
        available_bytes: free.shift() ?? 100,
        free_inodes: 10,
        error: null,
      }),
    receipt: () =>
      Promise.resolve({
        id: "fixture",
        path: "/fixture/receipt",
        delivery_error: null,
      }),
  };
  const runAdapter = () =>
    freeMiseConfigs(10000, performance.now(), false, deps);
  const success = await runAdapter();
  expect(success.exit).toBe(0);
  expect(success.item).toMatchObject({
    verdict: "completed",
    effect: "unlink",
    fingerprint: "identity",
  });
  expect(success.after?.available_bytes).toBe(105);
  expect(success.before?.available_bytes).toBe(100);
  expect(success.receipt?.id).toBe("fixture");
  expect(acts).toBe(1);
  expect(released).toBe(1);
  fingerprints = ["first", "changed"];
  const changed = await runAdapter();
  expect(changed.item).toMatchObject({ verdict: "changed", effect: "none" });
  expect(changed.exit).toBe(1);
  expect(acts).toBe(1);
  const busy = await freeMiseConfigs(10000, performance.now(), false, {
    ...deps,
    lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
  });
  expect(busy.exit).toBe(3);
  expect(acts).toBe(1);
  const unavailable = await freeMiseConfigs(10000, performance.now(), false, {
    ...deps,
    target: {
      ...target,
      available: () => ({
        available: false,
        skip_reason: "mise binary is unavailable",
      }),
    },
  });
  expect(unavailable.exit).toBe(4);
  expect(unavailable.item.reason).toContain("unavailable");
  const denied = await freeMiseConfigs(10000, performance.now(), false, {
    ...deps,
    guard: () => "worker guard",
  });
  expect(denied.item).toMatchObject({ verdict: "deny", effect: "none" });
  expect(acts).toBe(1);
  fingerprints = ["identity", "identity"];
  let measurements = 0;
  const missing = await freeMiseConfigs(10000, performance.now(), false, {
    ...deps,
    measure: () => {
      measurements++;
      if (measurements === 2)
        return new Promise((_resolve, reject) => {
          reject(new Error("statfs unavailable"));
        });
      return Promise.resolve({
        time: "fixture",
        source: "statfs",
        mount: null,
        filesystem: null,
        available_bytes: 100,
        free_inodes: 10,
        error: null,
      });
    },
  });
  expect(missing.exit).toBe(4);
  expect(missing.item.verdict).toBe("unknown");
  fingerprints = ["identity", "identity"];
  free = [100, 100];
  const zero = await runAdapter();
  expect(zero.exit).toBe(0);
  expect(zero.after?.available_bytes).toBe(zero.before?.available_bytes);
  fingerprints = ["identity", "identity"];
  const receiptFailure = await freeMiseConfigs(
    10000,
    performance.now(),
    false,
    {
      ...deps,
      receipt: () =>
        new Promise((_resolve, reject) => {
          reject(new Error("disk full"));
        }),
    },
  );
  expect(receiptFailure.exit).toBe(4);
  expect(receiptFailure.item.reason).toContain("receipt unavailable");
});

const cleanCandidate = (
  path: string,
  verdict: "RECLAIM" | "KEEP",
  reason: string,
) => ({
  id: path,
  path,
  verdict,
  reason,
  checks: [],
  bytes: 1024,
  bytes_kind: "freed_now",
  action: { kind: "delete", argv: [path] },
  result: null,
});
const cleanObservation = (n: number) => ({
  time: "fixture",
  source: "statfs",
  mount: null,
  filesystem: null,
  available_bytes: n,
  free_inodes: 10,
  error: null,
});
test("clean adapter preserves refusals, identity, lock, and measured results", async () => {
  const { freeClean } = await import("../src/disk-clean.ts");
  const rows = [
    {
      candidate: cleanCandidate("/fixture/uv", "KEEP", "busy: uv"),
      fingerprint: "1",
    },
    {
      candidate: cleanCandidate("/fixture/julia", "KEEP", "busy: julia"),
      fingerprint: "2",
    },
    {
      candidate: cleanCandidate("/fixture/cargo", "KEEP", "busy: cargo"),
      fingerprint: "3",
    },
    {
      candidate: cleanCandidate("/fixture/bun", "KEEP", "busy: bun"),
      fingerprint: "4",
    },
    {
      candidate: cleanCandidate("/fixture/protected", "RECLAIM", "cache"),
      fingerprint: "5",
    },
    {
      candidate: cleanCandidate("/fixture/changed", "RECLAIM", "cache"),
      fingerprint: "6",
    },
    {
      candidate: cleanCandidate("/fixture/safe", "RECLAIM", "cache"),
      fingerprint: "7",
    },
  ];
  let actions = 0;
  let released = 0;
  let delta = 10;
  const deps = {
    guard: (): string | null => null,
    lock: (_ms: number) =>
      Promise.resolve({
        release: () => {
          released++;
        },
        exit: 0,
        error: null,
      }),
    receipt: (_items: unknown[]) =>
      Promise.resolve({
        id: "receipt",
        path: "/fixture/receipt",
        delivery_error: null,
      }),
    probe: (action: string | undefined) => {
      if (action === undefined)
        return Promise.resolve({
          out: JSON.stringify(rows),
          err: "",
          exit: 0,
          timedOut: false,
        });
      actions++;
      let result = {
        verdict: "completed",
        reason: "done",
        effect: "unlink",
        before: cleanObservation(100),
        after: cleanObservation(100 + delta),
      };
      if (action.includes("/fixture/protected"))
        result = {
          verdict: "keep",
          reason: "protected: tool installation root",
          effect: "none",
          before: cleanObservation(100),
          after: cleanObservation(100),
        };
      else if (action.includes("/fixture/changed"))
        result = {
          verdict: "changed",
          reason: "fingerprint changed",
          effect: "none",
          before: cleanObservation(100),
          after: cleanObservation(100),
        };
      return Promise.resolve({
        out: JSON.stringify(result),
        err: "",
        exit: 0,
        timedOut: false,
      });
    },
  };
  const runClean = () => freeClean(10000, performance.now(), false, deps);
  const result = await runClean();
  expect(result.exit).toBe(1);
  expect(result.items.map((item) => item.verdict)).toEqual([
    "keep",
    "keep",
    "keep",
    "keep",
    "keep",
    "changed",
    "completed",
  ]);
  expect(result.items[4]?.reason).toContain("protected");
  expect(result.items[6]?.after?.available_bytes).toBe(110);
  expect(actions).toBe(3);
  expect(released).toBe(1);
  delta = 0;
  expect((await runClean()).items[6]?.verdict).toBe("partial");
  const denied = await freeClean(10000, performance.now(), false, {
    ...deps,
    guard: () => "worker guard",
  });
  expect(denied.exit).toBe(1);
  const locked = await freeClean(10000, performance.now(), false, {
    ...deps,
    lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
  });
  expect(locked.exit).toBe(3);
  const lost = await freeClean(10000, performance.now(), false, {
    ...deps,
    probe: (action) =>
      action === undefined
        ? deps.probe(action)
        : Promise.resolve({ out: "", err: "", exit: null, timedOut: true }),
  });
  expect(lost.exit).toBe(4);
  expect(lost.items[4]?.verdict).toBe("unknown");
});

test("clean revalidation retains busy, protected and changed refusals", async () => {
  const { revalidateClean } = await import("../src/disk-clean-safety.ts");
  const { Candidate } = await import("../src/model.ts");
  const request = {
    id: "/fixture/cache",
    path: "/fixture/cache",
    fingerprint: "same",
  };
  const safe = Candidate.safeParse(
    cleanCandidate(request.path, "RECLAIM", "cache"),
  );
  expect(safe.success).toBe(true);
  if (!safe.success) return;
  for (const reason of [
    "busy: uv",
    "busy: bun",
    "busy: julia",
    "busy: cargo",
    "busy: brew",
    "busy: sccache",
  ]) {
    const busy = { ...safe.data, verdict: "KEEP" as const, reason };
    expect(
      await revalidateClean([busy], request, cleanIdentity, () => null),
    ).toMatchObject({ verdict: "keep", reason });
  }
  expect(
    await revalidateClean(
      [safe.data],
      request,
      cleanIdentity,
      () => "tool installation root",
    ),
  ).toMatchObject({
    verdict: "keep",
    reason: "protected: tool installation root",
  });
  expect(
    await revalidateClean(
      [safe.data],
      request,
      cleanIdentity,
      () => "process paths are unknown",
    ),
  ).toMatchObject({ verdict: "unknown" });
  expect(
    await revalidateClean(
      [safe.data],
      request,
      () => Promise.resolve("changed"),
      () => null,
    ),
  ).toMatchObject({ verdict: "changed" });
  expect(
    await revalidateClean([safe.data], request, cleanIdentity, () => null),
  ).toMatchObject({ verdict: "safe" });
});

test("clean entry connects legacy cache refusals and safety revalidation", async () => {
  const { createCleanTarget } = await import("../src/targets/clean.ts");
  const { freeClean } = await import("../src/disk-clean.ts");
  const { cleanAction } = await import("../src/disk-clean-action.ts");
  const home = "/fixture";
  const relative = [
    ".cache/uv",
    ".bun/install/cache",
    ".julia/compiled",
    ".julia/scratchspaces",
    ".cargo/registry/src",
    ".cargo/registry/cache",
    ".cargo/git/checkouts",
    ".cache/sccache",
    ".cache/Homebrew",
    ".cache/pip",
    ".npm/_cacache",
  ];
  const paths = new Set(relative.map((p) => `${home}/${p}`));
  const target = createCleanTarget(
    () => home,
    () => true,
    () => false,
    { exists: (p) => paths.has(String(p)), tree: fakeTree, keep: fakeKeep },
  );
  const initial = await target.plan(cleanContext);
  let actionCalls = 0;
  let receiptCalls = 0;
  const deps = {
    guard: (): string | null => null,
    lock: (_ms: number) =>
      Promise.resolve({ release: () => {}, exit: 0, error: null }),
    receipt: (_items: unknown[]) => {
      receiptCalls++;
      return Promise.resolve({
        id: "r",
        path: "/fixture/receipt",
        delivery_error: null,
      });
    },
    probe: async (action: string | undefined) => {
      if (action === undefined)
        return {
          out: JSON.stringify(
            initial.map((candidate) => ({
              candidate,
              fingerprint: "original",
            })),
          ),
          err: "",
          exit: 0,
          timedOut: false,
        };
      actionCalls++;
      const parsed = jsonOf(
        z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
      ).safeParse(action);
      expect(parsed.success).toBe(true);
      if (!parsed.success)
        return { out: "", err: "invalid", exit: 1, timedOut: false };
      const request = parsed.data;
      const checked = await cleanAction(request, {
        target: {
          ...target,
          act: () => {
            expect.unreachable("refused item must never act");
          },
        },
        context: cleanContext,
        identity: () =>
          Promise.resolve(
            request.path.endsWith("_cacache") ? "changed" : "original",
          ),
        protection: (path) =>
          path.endsWith("/pip") ? "tool installation root" : null,
        device: () => Promise.resolve(1),
        measure: () => Promise.resolve(cleanObservation(100)),
        fail: () => process.exit(99),
      });
      return {
        out: JSON.stringify(checked),
        err: "",
        exit: 0,
        timedOut: false,
      };
    },
  };
  const result = await freeClean(10000, performance.now(), false, deps);
  expect(result.exit).toBe(1);
  for (const candidate of initial.filter((c) => c.verdict === "KEEP"))
    expect(result.items.find((i) => i.path === candidate.path)).toMatchObject({
      verdict: "keep",
      reason: candidate.reason,
      effect: "none",
    });
  expect(
    result.items.find((i) => i.path === `${home}/.cache/pip`),
  ).toMatchObject({
    verdict: "keep",
    reason: "protected: tool installation root",
    effect: "none",
  });
  expect(
    result.items.find((i) => i.path === `${home}/.npm/_cacache`),
  ).toMatchObject({
    verdict: "changed",
    reason: "fingerprint changed",
    effect: "none",
  });
  expect(actionCalls).toBe(2);
  expect(receiptCalls).toBe(1);
  for (const name of ["cargo", "rustc", "rust-analyzer"]) {
    const rustTarget = createCleanTarget(
      () => home,
      (comm) => comm === name,
      () => false,
      { exists: (p) => paths.has(String(p)), tree: fakeTree, keep: fakeKeep },
    );
    const cargo = (await rustTarget.plan(cleanContext)).filter(
      (c) => c.path?.includes("/.cargo/") === true,
    );
    expect(cargo).toHaveLength(3);
    expect(
      cargo.every((c) => c.verdict === "KEEP" && c.reason === "busy: cargo"),
    ).toBe(true);
  }
});

test("clean cache becoming busy after plan is kept before action", async () => {
  const { createCleanTarget } = await import("../src/targets/clean.ts");
  const { cleanAction } = await import("../src/disk-clean-action.ts");
  const path = "/fixture/.cache/uv";
  let busy = false;
  let acts = 0;
  const target = createCleanTarget(
    () => "/fixture",
    () => busy,
    () => false,
    { exists: (p) => String(p) === path, tree: fakeTree, keep: fakeKeep },
  );
  const before = (await target.plan(cleanContext))[0];
  expect(before?.verdict).toBe("RECLAIM");
  busy = true;
  const result = await cleanAction(
    { id: path, path, fingerprint: "same" },
    {
      target: {
        ...target,
        act: () => {
          acts++;
          return { ok: true, bytes_freed: 1, error: null };
        },
      },
      context: cleanContext,
      identity: cleanIdentity,
      protection: () => null,
      device: () => Promise.resolve(1),
      measure: () => Promise.resolve(cleanObservation(1)),
      fail: () => process.exit(99),
    },
  );
  expect(result).toMatchObject({
    verdict: "keep",
    reason: "busy: uv",
    effect: "none",
  });
  expect(acts).toBe(0);
});

test("Bun cache child is killed on deadline and its termination is awaited", async () => {
  const { cleanBunProbe } = await import("../src/disk-clean-bun.ts");
  const deadline = new AbortController();
  let killed = false;
  const childExit = Promise.withResolvers<number>();
  const spawn = new Proxy(Bun.spawn, {
    apply: (_target, _thisArg, args: unknown[]) => {
      const argv = z.array(z.string()).safeParse(args[0]);
      expect(argv.data).toEqual(["bun", "pm", "cache", "rm"]);
      const options = z
        .object({
          signal: z.instanceof(AbortSignal),
          killSignal: z.literal("SIGKILL"),
          env: z.object({ HOME: z.literal("/fixture") }),
        })
        .safeParse(args[1]);
      expect(options.success).toBe(true);
      if (options.success)
        options.data.signal.addEventListener("abort", () => {
          killed = true;
        });
      return {
        stdout: new Response("").body,
        stderr: new Response("").body,
        exited: childExit.promise,
      };
    },
  });
  let settled = false;
  const resultPromise = cleanBunProbe(
    "/fixture",
    1000,
    (argv, timeout, env, signal) =>
      runProbe(argv, timeout, env, signal, {
        spawn,
        deadline: () => deadline.signal,
      }),
  ).then((result) => {
    settled = true;
    return result;
  });
  deadline.abort();
  expect(killed).toBe(true);
  await Promise.resolve();
  expect(settled).toBe(false);
  childExit.resolve(137);
  expect(await resultPromise).toMatchObject({ exit: 137, timedOut: true });
});

test("clean approval, lock and worker refusals cannot call an action", async () => {
  const { freeClean } = await import("../src/disk-clean.ts");
  const row = {
    candidate: {
      ...cleanCandidate("/fixture/needs-approval", "KEEP", "approval required"),
      verdict: "ASK",
    },
    fingerprint: "same",
  };
  let probes = 0;
  let actions = 0;
  let locks = 0;
  const deps = {
    guard: (): string | null => null,
    lock: (_ms: number) => {
      locks++;
      return Promise.resolve({ release: () => {}, exit: 0, error: null });
    },
    receipt: (_items: unknown[]) =>
      Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
    probe: (action: string | undefined) => {
      probes++;
      if (action !== undefined) actions++;
      return Promise.resolve({
        out: JSON.stringify([row]),
        err: "",
        exit: 0,
        timedOut: false,
      });
    },
  };
  const ask = await freeClean(10000, performance.now(), false, deps);
  expect(ask.exit).toBe(1);
  expect(ask.items).toMatchObject([
    {
      path: "/fixture/needs-approval",
      verdict: "ask",
      reason: "approval required",
      effect: "none",
    },
  ]);
  expect(actions).toBe(0);
  const before = probes;
  const busy = await freeClean(10000, performance.now(), false, {
    ...deps,
    lock: () =>
      Promise.resolve({
        release: null,
        exit: 3,
        error: "lock holder: fixture",
      }),
  });
  expect(busy).toMatchObject({
    exit: 3,
    error: "lock holder: fixture",
    items: [],
  });
  expect(probes).toBe(before);
  const denied = await freeClean(10000, performance.now(), false, {
    ...deps,
    guard: () => "worker guard",
  });
  expect(denied).toMatchObject({ exit: 1, error: "worker guard", items: [] });
  expect(locks).toBe(1);
  expect(probes).toBe(before);
});

test("clean plan-only request cannot act even with approval", async () => {
  const home = "/fixture/unused";
  const result = await run(
    [
      "plan",
      "targets",
      "--target",
      "clean",
      "--approve",
      "/fixture/cache",
      "--no-progress",
    ],
    "",
    { ...process.env, HOME: home, RECLAIM_STATE_DIR: `${home}/state` },
  );
  expect(result.exit).toBe(0);
  expect(jsonText.safeParse(result.out).data).toMatchObject({
    outcome: "completed",
    items: [],
    receipt: null,
  });
  const invalid = await run(
    ["plan", "targets", "--target", "clean", "--yes"],
    "",
    { ...process.env, HOME: home },
  );
  expect(invalid.exit).toBe(2);
});

test("rust entry preserves legacy refusals and reports measured per-item removal", async () => {
  const { createRustTarget } = await import("../src/targets/rust.ts");
  const { freeClean } = await import("../src/disk-clean.ts");
  const { cleanAction } = await import("../src/disk-clean-action.ts");
  for (const scenario of [
    "manifest",
    "busy",
    "unknown",
    "session",
    "idle",
    "zero",
    "changed",
  ] as const) {
    const root = await mkdtemp(join(tmpdir(), "disk-rust-fixture-"));
    const project = join(root, "project");
    const path = join(project, "target");
    const proc = join(root, "proc");
    await mkdir(path, { recursive: true });
    if (scenario !== "manifest")
      await writeFile(join(project, "Cargo.toml"), "[package]");
    if (scenario !== "unknown") await mkdir(proc);
    if (scenario === "busy" || scenario === "session") {
      const base = join(proc, "10");
      await mkdir(join(base, "fd"), { recursive: true });
      const name = scenario === "busy" ? "cargo" : "editor";
      await writeFile(join(base, "comm"), name);
      await writeFile(
        join(base, "stat"),
        `10 (${name}) S ${Array.from({ length: 18 }, () => "0").join(" ")} 123\n`,
      );
      await writeFile(join(base, "environ"), "");
      await writeFile(join(base, "maps"), "");
      await symlink(`/usr/bin/${name}`, join(base, "exe"));
      await symlink(project, join(base, "cwd"));
    }
    const context: Context = {
      ...cleanContext,
      targetName: "rust",
      procDir: proc,
    };
    const target = createRustTarget(() => root);
    let actions = 0;
    let measures = 0;
    const deps = {
      guard: (): string | null => null,
      lock: (_ms: number) =>
        Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: (_items: unknown[]) =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        if (action === undefined) {
          const rows = await target.plan(context);
          return {
            out: JSON.stringify(
              rows.map((candidate) => ({ candidate, fingerprint: "same" })),
            ),
            err: "",
            exit: 0,
            timedOut: false,
          };
        }
        const parsed = jsonOf(
          z.object({
            id: z.string(),
            path: z.string(),
            fingerprint: z.string(),
          }),
        ).safeParse(action);
        if (!parsed.success)
          return { out: "", err: "invalid request", exit: 1, timedOut: false };
        const request = parsed.data;
        const value = await cleanAction(request, {
          target: {
            ...target,
            act: () => {
              actions++;
              return { ok: true, bytes_freed: 123, error: null };
            },
          },
          context,
          identity: () =>
            Promise.resolve(scenario === "changed" ? "changed" : "same"),
          protection: () => null,
          device: () => Promise.resolve(1),
          measure: () =>
            Promise.resolve(
              cleanObservation(
                measures++ === 0 || scenario === "zero" ? 100 : 110,
              ),
            ),
          fail: () => process.exit(99),
        });
        return {
          out: JSON.stringify(value),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    const result = await freeClean(
      10000,
      performance.now(),
      false,
      deps,
      undefined,
      false,
      "rust",
    );
    const item = result.items.find((row) => row.path === path);
    if (scenario === "idle") {
      expect(result.exit).toBe(0);
      expect(item).toMatchObject({
        target: "rust",
        verdict: "completed",
        effect: "unlink",
        after: { available_bytes: 110 },
      });
      expect(actions).toBe(1);
    } else if (scenario === "zero") {
      expect(result.exit).toBe(1);
      expect(item).toMatchObject({
        verdict: "partial",
        reason: "no measured increase in available space",
        effect: "unlink",
      });
      expect(actions).toBe(1);
    } else {
      expect(result.exit).toBe(1);
      const reason = {
        manifest: "Cargo.toml is missing",
        busy: "live Rust build process",
        unknown: "process state is unreadable",
        session: "live process cwd",
        changed: "fingerprint changed",
      }[scenario];
      expect(item?.reason).toContain(reason);
      const expected = {
        manifest: "ask",
        busy: "keep",
        unknown: "ask",
        session: "ask",
        changed: "changed",
      }[scenario];
      expect(item?.verdict).toBe(expected);
      expect(item?.effect).toBe("none");
      expect(actions).toBe(0);
    }
  }
});

test("rust plan-only requests cannot invoke an action", async () => {
  const home = await mkdtemp(join(tmpdir(), "disk-rust-plan-"));
  const result = await run(
    [
      "plan",
      "targets",
      "--target",
      "rust",
      "--approve",
      "/fixture/target",
      "--no-progress",
    ],
    "",
    { ...process.env, HOME: home, RECLAIM_STATE_DIR: join(home, "state") },
  );
  expect(result.exit).toBe(0);
  expect(jsonText.safeParse(result.out).data).toMatchObject({
    outcome: "completed",
    items: [],
    receipt: null,
  });
  expect(existsSync(join(home, "state"))).toBe(false);
});
const toolchainCandidate = (
  path: string,
  verdict: "KEEP" | "RECLAIM",
  reason: string,
): Candidate => ({
  id: path,
  path,
  verdict,
  reason,
  checks: [],
  bytes: 1024,
  bytes_kind: "freed_now",
  action: { kind: "delete", argv: verdict === "KEEP" ? [] : [path] },
  result: null,
});
test("toolchains adapter preserves selected rows and requires measured results", async () => {
  const { freeToolchains } = await import("../src/disk-toolchains.ts");
  const candidates = [
    {
      candidate: toolchainCandidate(
        "/fixture/current",
        "KEEP",
        "default rustup toolchain",
      ),
      fingerprint: null,
    },
    {
      candidate: toolchainCandidate(
        "/fixture/pinned",
        "KEEP",
        "pinned rustup toolchain",
      ),
      fingerprint: null,
    },
    {
      candidate: toolchainCandidate(
        "/fixture/old",
        "RECLAIM",
        "superseded release",
      ),
      fingerprint: "identity",
    },
  ];
  const requests: string[] = [];
  let unlocked = false;
  let measures = 0;
  const deps = {
    guard: () => null,
    lock: () =>
      Promise.resolve({
        release: () => {
          unlocked = true;
        },
        exit: 0,
        error: null,
      }),
    probe: (_argv: string[], _timeout: number, env?: NodeJS.ProcessEnv) => {
      const isPlan = env?.["DISK_TOOLCHAINS_REQUEST"] === "{}";
      requests.push(isPlan ? "plan" : "/fixture/old");
      const out = isPlan
        ? candidates
        : {
            verdict: "completed",
            reason: "removed",
            effect: "unlink",
            detail: { ok: true, bytes_freed: 1024, error: null },
            same_filesystem: true,
          };
      return Promise.resolve({
        out: JSON.stringify(out),
        err: "",
        exit: 0,
        timedOut: false,
      });
    },
    measure: () => {
      measures++;
      return Promise.resolve({
        time: "now",
        source: "statfs",
        mount: null,
        filesystem: null,
        available_bytes: 100,
        free_inodes: 10,
        error: null,
      });
    },
    receipt: () =>
      Promise.resolve({
        id: "receipt",
        path: "/fixture/receipt",
        delivery_error: null,
      }),
  };
  const result = await freeToolchains(10000, performance.now(), false, deps);
  expect(requests).toEqual(["plan", "/fixture/old"]);
  expect(result.items.map((item) => item.verdict)).toEqual([
    "keep",
    "keep",
    "completed",
  ]);
  expect(result.items[2]?.detail).toMatchObject({
    before: { available_bytes: 100 },
    after: { available_bytes: 100 },
  });
  expect(result.exit).toBe(1);
  expect(result.receipt?.id).toBe("receipt");
  expect(unlocked).toBe(true);

  expect(measures).toBe(2);
  let attempts = 0;
  const missingAfter = await freeToolchains(10000, performance.now(), false, {
    ...deps,
    measure: () => {
      attempts++;
      if (attempts === 1) return deps.measure();
      return new Promise((_resolve, reject) => {
        reject(new Error("statfs unavailable"));
      });
    },
  });
  expect(missingAfter.exit).toBe(4);
  expect(missingAfter.items[2]).toMatchObject({
    verdict: "unknown",
    effect: "unlink",
  });
  const missingReceipt = await freeToolchains(10000, performance.now(), false, {
    ...deps,
    receipt: () =>
      new Promise((_resolve, reject) => {
        reject(new Error("receipt unavailable"));
      }),
  });
  expect(missingReceipt.exit).toBe(4);
  expect(missingReceipt.items[2]).toMatchObject({
    verdict: "unknown",
    effect: "unlink",
  });
  const denied = await freeToolchains(10000, performance.now(), false, {
    ...deps,
    guard: () => "worker guard",
  });
  expect(denied.items[0]).toMatchObject({ verdict: "deny", effect: "none" });
  const busy = await freeToolchains(10000, performance.now(), false, {
    ...deps,
    lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
  });
  expect(busy.exit).toBe(3);
});

test("toolchain worker rechecks refusals and identity before invoking action", async () => {
  const config: Config = {
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: ["sshd"],
  };
  const path = "/fixture/version";
  let rows: Candidate[] = [];
  let actions = 0;
  let protection: string | null = null;
  const target: Target = {
    name: "toolchains",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: () => Promise.resolve(rows),
    act: () => {
      actions++;
      return Promise.resolve({ ok: true, bytes_freed: 100, error: null });
    },
  };
  const injected = {
    config,
    target,
    fingerprint: () => Promise.resolve("identity"),
    protection: () => protection,
  };
  for (const reason of [
    "default rustup toolchain",
    "pinned rustup toolchain",
  ]) {
    rows = [toolchainCandidate(path, "KEEP", reason)];
    expect(
      await toolchainsWorker({ path, fingerprint: "identity" }, injected),
    ).toMatchObject({ verdict: "changed", effect: "none" });
  }
  rows = [];
  expect(
    await toolchainsWorker({ path, fingerprint: "identity" }, injected),
  ).toMatchObject({ verdict: "changed", effect: "none" });
  rows = [toolchainCandidate(path, "RECLAIM", "old")];
  protection = "process paths are unknown";
  expect(
    await toolchainsWorker({ path, fingerprint: "identity" }, injected),
  ).toMatchObject({ verdict: "unknown", effect: "none" });
  protection = null;
  expect(
    await toolchainsWorker({ path, fingerprint: "changed" }, injected),
  ).toMatchObject({ verdict: "changed", effect: "none" });
  expect(actions).toBe(0);
  expect(
    await toolchainsWorker({ path, fingerprint: "identity" }, injected),
  ).toMatchObject({ verdict: "completed", effect: "unlink" });
  expect(actions).toBe(1);
});

test("real toolchains planner exposes retained versions through the disk adapter", async () => {
  const home = await mkdtemp(join(tmpdir(), "disk-toolchain-parity-"));
  const proc = join(home, "proc");
  const rust = join(home, ".rustup/toolchains");
  const releases = join(home, ".codex/packages/standalone/releases");
  const servers = join(home, ".vscode-server/cli/servers");
  const now = 2_000_000_000;
  const old = now - 10 * 86400;
  for (const path of [
    join(proc, "123"),
    join(home, "Workspace/project"),
    ...["stable", "nightly"].map((name) => join(rust, name)),
    ...["current", "recent", "live", "old"].map((name) => join(releases, name)),
    ...["Stable-live", "Stable-new"].map((name) => join(servers, name)),
  ])
    await mkdir(path, { recursive: true });
  await writeFile(
    join(home, "Workspace/project/rust-toolchain.toml"),
    '[toolchain]\nchannel = "nightly"\n',
  );
  await symlink(
    join(releases, "current"),
    join(home, ".codex/packages/standalone/current"),
  );
  await symlink(join(releases, "live/bin"), join(proc, "123/exe"));
  for (const path of [
    join(releases, "current"),
    join(releases, "live"),
    join(releases, "old"),
    join(servers, "Stable-live"),
  ])
    await utimes(path, old, old);
  for (const path of [join(releases, "recent"), join(servers, "Stable-new")])
    await utimes(path, now - 3600, now - 3600);
  const original = createToolchainsTarget(
    () => home,
    { available: () => true, defaultToolchain: () => "stable" },
    (hash) => (hash === "live" ? 0 : 1),
    {
      includeRefusals: true,
      nowSec: () => now,
      projects: join(home, "Workspace"),
      keepDays: 2,
    },
  );
  const actions: string[] = [];
  let procDir = proc;
  const target: Target = {
    ...original,
    plan: (ctx) => original.plan({ ...ctx, procDir }),
    act: (candidate) => {
      actions.push(candidate.path ?? "");
      return Promise.resolve({ ok: true, bytes_freed: 1, error: null });
    },
  };
  const config: Config = {
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: ["sshd"],
  };
  const injected = {
    config,
    target,
    fingerprint: () => Promise.resolve("fingerprint"),
    protection: () => null,
  };
  const Request = z.object({
    path: z.string().optional(),
    fingerprint: z.string().optional(),
  });
  let crossFilesystem = false;
  const deps = {
    guard: () => null,
    lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
    probe: async (
      _argv: string[],
      _timeout: number,
      env?: NodeJS.ProcessEnv,
    ) => {
      const request = jsonOf(Request).safeParse(
        env?.["DISK_TOOLCHAINS_REQUEST"] ?? "{}",
      );
      if (!request.success)
        return { out: "", err: "bad request", exit: 1, timedOut: false };
      const workerResult = await toolchainsWorker(
        {
          ...(request.data.path === undefined
            ? {}
            : { path: request.data.path }),
          ...(request.data.fingerprint === undefined
            ? {}
            : { fingerprint: request.data.fingerprint }),
        },
        injected,
      );
      const out =
        crossFilesystem &&
        request.data.path !== undefined &&
        !Array.isArray(workerResult)
          ? { ...workerResult, same_filesystem: false }
          : workerResult;
      return { out: JSON.stringify(out), err: "", exit: 0, timedOut: false };
    },
    measure: () =>
      Promise.resolve({
        time: "fixture",
        source: "statfs",
        mount: null,
        filesystem: null,
        available_bytes: 10,
        free_inodes: 10,
        error: null,
      }),
    receipt: () =>
      Promise.resolve({
        id: "receipt",
        path: "/fixture/receipt",
        delivery_error: null,
      }),
  };
  const { main } = await import("../src/disk.ts");
  const Entry = z.object({
    items: z.array(
      z.object({
        path: z.string().nullable(),
        verdict: z.string(),
        reason: z.string(),
        effect: z.string(),
        detail: z.unknown(),
      }),
    ),
    outcome: z.string(),
    counts: z.object({ completed: z.number(), refused: z.number() }),
    receipt: z.unknown(),
    observations: z.object({ before: z.unknown(), after: z.unknown() }),
  });
  const invoke = async () => {
    let output = "";
    const exitCode = process.exitCode;
    await main(
      ["free", "targets", "toolchains", "--no-progress"],
      deps,
      (text) => {
        output += text;
      },
    );
    const actualExit = process.exitCode;
    process.exitCode = exitCode ?? 0;
    const parsed = jsonOf(Entry).safeParse(output);
    expect(parsed.success).toBe(true);
    if (!parsed.success)
      return {
        items: [],
        outcome: "invalid",
        exit: actualExit,
        counts: { completed: 0, refused: 0 },
        receipt: null,
        observations: { before: null, after: null },
      };
    return { ...parsed.data, exit: actualExit };
  };
  const result = await invoke();
  const row = (path: string) => result.items.find((item) => item.path === path);
  expect(row(join(rust, "stable"))).toMatchObject({
    verdict: "keep",
    reason: "default rustup toolchain",
    effect: "none",
  });
  expect(row(join(rust, "nightly"))).toMatchObject({
    verdict: "keep",
    reason: "pinned rustup toolchain",
    effect: "none",
  });
  expect(row(join(releases, "current"))).toMatchObject({
    verdict: "keep",
    reason: "current codex release",
    effect: "none",
  });
  expect(row(join(releases, "recent"))).toMatchObject({
    verdict: "keep",
    reason: "recent codex release",
    effect: "none",
  });
  expect(row(join(releases, "live"))).toMatchObject({
    verdict: "keep",
    reason: "codex release in use",
    effect: "none",
  });
  expect(row(join(servers, "Stable-live"))).toMatchObject({
    verdict: "keep",
    reason: "VS Code server in use",
    effect: "none",
  });
  expect(row(join(releases, "old"))).toMatchObject({
    verdict: "completed",
    effect: "unlink",
    detail: { before: { source: "statfs" }, after: { source: "statfs" } },
  });
  expect(result.exit).toBe(1);
  expect(result.counts.completed).toBe(1);
  expect(result.receipt).toMatchObject({ id: "receipt" });
  expect(actions).toEqual([join(releases, "old")]);
  procDir = join(home, "missing-proc");
  actions.length = 0;
  const unknown = await invoke();
  expect(
    unknown.items.find((item) => item.path === join(releases, "old")),
  ).toMatchObject({
    verdict: "keep",
    reason: "codex release process use unknown",
    effect: "none",
  });
  expect(actions).toEqual([]);
  procDir = proc;
  crossFilesystem = true;
  const cross = await invoke();
  expect(
    cross.items.find((item) => item.path === join(releases, "old")),
  ).toMatchObject({
    verdict: "unknown",
    reason: "candidate filesystem measurement unavailable",
    effect: "unlink",
  });
  expect(cross.outcome).toBe("unknown");
  expect(cross.exit).toBe(4);
  expect(cross.observations).toEqual({ before: null, after: null });
});

async function runBuildsEntry(
  deps: Parameters<typeof import("../src/disk-builds.ts").freeBuilds>[3],
) {
  const { main } = await import("../src/disk.ts");
  let output = "";
  const stdout = spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  const previousExit = process.exitCode;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    stdout.mockRestore();
    process.exitCode = previousExit ?? 0;
  });
  process.exitCode = 0;
  await main(
    [
      "free",
      "targets",
      "builds",
      "--approve",
      "/fixture/project/dist",
      "--no-progress",
    ],
    undefined,
    undefined,
    deps,
  );
  return { exit: process.exitCode, output: jsonText.safeParse(output).data };
}

for (const [label, reason] of [
  ["protected", "tool installation root"],
  ["in-use", "contains a running process cwd"],
  ["foreign target", "owned by rust target"],
  ["clean target", "owned by clean target"],
  ["unknown process evidence", "process paths are unknown"],
] as const) {
  test(`builds entry retains legacy ${label} refusal`, async () => {
    const { createBuildsTarget } = await import("../src/targets/builds.ts");
    const path = "/fixture/project/dist";
    const target = createBuildsTarget(
      () => "/fixture",
      () => [path],
      {
        includeOwned: true,
        protection: () => reason,
        tree: fakeTree,
        stat: () => Promise.resolve({ dev: 1, isDirectory: () => true }),
      },
    );
    const rows = await target.plan({ ...cleanContext, targetName: "builds" });
    let actions = 0;
    const result = await runBuildsEntry({
      guard: () => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: (action) => {
        if (action !== undefined) actions++;
        return Promise.resolve({
          out: JSON.stringify(
            rows.map((candidate) => ({ candidate, fingerprint: "same" })),
          ),
          err: "",
          exit: 0,
          timedOut: false,
        });
      },
    });
    expect(result.exit).toBe(1);
    expect(result.output).toMatchObject({
      items: [
        {
          path,
          verdict: reason === "process paths are unknown" ? "ask" : "keep",
          reason: `protected: ${reason}`,
          effect: "none",
        },
      ],
    });
    expect(actions).toBe(0);
  });
}

test("builds entry revalidates the real planner and reports a measured removal", async () => {
  const { createBuildsTarget } = await import("../src/targets/builds.ts");
  const { freeBuilds } = await import("../src/disk-builds.ts");
  const { buildsAction } = await import("../src/disk-builds-action.ts");
  const path = "/fixture/project/dist";
  let reason: string | null = null;
  let fingerprint = "same";
  let actions = 0;
  let available = 100;
  let delta = 10;
  let changeOnAction: string | null = null;
  const ctx = { ...cleanContext, targetName: "builds" };
  const target = {
    ...createBuildsTarget(
      () => "/fixture",
      () => [path],
      {
        includeOwned: true,
        protection: () => reason,
        tree: fakeTree,
        stat: () => Promise.resolve({ dev: 1, isDirectory: () => true }),
      },
    ),
    act: () => {
      actions++;
      available += delta;
      return Promise.resolve({ ok: true, bytes_freed: 10, error: null });
    },
  };
  const deps = {
    guard: (): string | null => null,
    lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
    receipt: () =>
      Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
    probe: async (action: string | undefined) => {
      if (action === undefined)
        return {
          out: JSON.stringify(
            (await target.plan(ctx)).map((candidate) => ({
              candidate,
              fingerprint: "same",
            })),
          ),
          err: "",
          exit: 0,
          timedOut: false,
        };
      reason = changeOnAction;
      const parsed = jsonOf(
        z.object({ id: z.string(), path: z.string(), fingerprint: z.string() }),
      ).safeParse(action);
      if (!parsed.success) expect.unreachable("invalid fixture action");
      const result = await buildsAction(parsed.data, {
        target,
        context: ctx,
        identity: () => Promise.resolve(fingerprint),
        device: () => Promise.resolve(1),
        measure: () => Promise.resolve(cleanObservation(available)),
        fail: () => expect.unreachable("unexpected failure"),
      });
      return { out: JSON.stringify(result), err: "", exit: 0, timedOut: false };
    },
  };
  const result = await runBuildsEntry(deps);
  expect(result.exit).toBe(0);
  expect(result.output).toMatchObject({
    items: [
      {
        path,
        verdict: "completed",
        effect: "unlink",
        before: { available_bytes: 100 },
        after: { available_bytes: 110 },
      },
    ],
  });
  expect(actions).toBe(1);
  delta = 0;
  const shortfall = await freeBuilds(10000, performance.now(), false, deps);
  expect(shortfall.exit).toBe(1);
  expect(shortfall.items[0]).toMatchObject({
    verdict: "partial",
    reason: "no measured increase in available space",
  });
  expect(actions).toBe(2);
  fingerprint = "changed";
  expect(
    (await freeBuilds(10000, performance.now(), false, deps)).items[0],
  ).toMatchObject({ verdict: "changed", effect: "none" });
  expect(actions).toBe(2);
  fingerprint = "same";
  changeOnAction = "contains a running process cwd";
  expect(
    (await freeBuilds(10000, performance.now(), false, deps)).items[0],
  ).toMatchObject({ verdict: "keep", effect: "none" });
  expect(actions).toBe(2);
  const guarded = await freeBuilds(10000, performance.now(), false, {
    ...deps,
    guard: () => "worker guard",
  });
  expect(guarded).toMatchObject({ exit: 1, error: "worker guard", items: [] });
  const locked = await freeBuilds(10000, performance.now(), false, {
    ...deps,
    lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
  });
  expect(locked).toMatchObject({ exit: 3, error: "busy", items: [] });
  expect(actions).toBe(2);
});

test("builds planning and unavailable targets never act", async () => {
  const home = "/fixture/unused-builds";
  const env = {
    ...process.env,
    HOME: home,
    RECLAIM_STATE_DIR: `${home}/state`,
  };
  const plan = await run(
    ["plan", "targets", "--target", "builds", "--no-progress"],
    "",
    env,
  );
  expect(plan.exit).toBe(0);
  expect(jsonText.safeParse(plan.out).data).toMatchObject({
    outcome: "completed",
    items: [],
    receipt: null,
  });
  const invalid = await run(
    ["plan", "targets", "--target", "builds", "--yes"],
    "",
    env,
  );
  expect(invalid.exit).toBe(2);
  const other = await run(
    ["free", "targets", "system", "--no-progress"],
    "",
    env,
  );
  expect(other.exit).toBe(4);
  expect(jsonText.safeParse(other.out).data).toMatchObject({
    outcome: "unknown",
  });
});

test.each(["live", "unknown", "nested-jj", "nested-git", "dead"] as const)(
  "scratch entry preserves %s and measures removal",
  async (state) => {
    const { createScratchTarget } = await import("../src/targets/scratch.ts");
    const { scratchAction } = await import("../src/disk-scratch-action.ts");
    const { main } = await import("../src/disk.ts");
    const root = await mkdtemp(join(tmpdir(), "disk-scratch-parity-"));
    const path = join(
      root,
      "project",
      "123e4567-e89b-42d3-a456-426614174000",
      "scratchpad",
    );
    await mkdir(path, { recursive: true });
    if (state === "nested-jj") {
      await mkdir(join(path, "nested/.jj"), { recursive: true });
      await writeFile(join(path, "nested/.jj/repo"), "fixture");
    }
    if (state === "nested-git")
      await mkdir(join(path, "nested/.git"), { recursive: true });
    let actions = 0;
    let available = 100;
    let delta = 10;
    const target = createScratchTarget({
      bytes: () => Promise.resolve(10),
      getFacts: (ref) => ({
        sessions: { ok: true, value: [] },
        procStarttime: () => ({ ok: false, error: "absent" }),
        environSessionIds: {
          ok: true,
          value: state === "live" ? [ref.uuid] : [],
        },
        openPaths: { ok: true, value: [] },
        transcript: {
          ok: true,
          value:
            state === "unknown"
              ? { exists: false }
              : { exists: true, mtimeMs: 1 },
        },
        now: 100_000_000,
        graceHours: 24,
      }),
      remove: () => {
        actions++;
        available += delta;
        return {
          ok: true,
          statfs_bytes_freed: 10,
          bytes_freed: 10,
          entries_removed: 1,
          refused: [],
          errors: [],
        };
      },
    });
    const ctx: Context = {
      ...cleanContext,
      targetName: "scratch",
      config: { ...cleanContext.config, scratch_roots: [root] },
    };
    const deps = {
      guard: (): string | null => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        if (action === undefined)
          return {
            out: JSON.stringify(
              (await target.plan(ctx)).map((candidate) => ({
                candidate,
                fingerprint: "same",
              })),
            ),
            err: "",
            exit: 0,
            timedOut: false,
          };
        const parsed = jsonOf(
          z.object({
            id: z.string(),
            path: z.string(),
            fingerprint: z.string(),
          }),
        ).safeParse(action);
        if (!parsed.success) expect.unreachable("invalid fixture action");
        const result = await scratchAction(parsed.data, {
          target,
          context: ctx,
          identity: () => Promise.resolve("same"),
          device: () => Promise.resolve(1),
          measure: () => Promise.resolve(cleanObservation(available)),
          fail: () => expect.unreachable("unexpected failure"),
        });
        return {
          out: JSON.stringify(result),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    let output = "";
    const stdout = spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        output += String(chunk);
        return true;
      },
    );
    const previous = process.exitCode;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      stdout.mockRestore();
      process.exitCode = previous ?? 0;
    });
    process.exitCode = 0;
    await main(
      ["free", "targets", "scratch", "--approve", path, "--no-progress"],
      undefined,
      undefined,
      undefined,
      deps,
    );
    const parsed = jsonOf(
      z.looseObject({ items: z.array(z.looseObject({ reason: z.string() })) }),
    ).safeParse(output);
    if (!parsed.success) expect.unreachable("invalid disk result");
    const result = parsed.data;
    let expected = "keep";
    if (state === "dead") expected = "completed";
    else if (state === "unknown") expected = "ask";
    expect(result).toMatchObject({
      items: [
        {
          path,
          verdict: expected,
          effect: state === "dead" ? "unlink" : "none",
        },
      ],
    });
    if (state.startsWith("nested"))
      expect(result.items[0]?.reason).toBe("delegated: jj workspace");
    if (state === "live")
      expect(result.items[0]?.reason).toContain(
        "same-uid process carries CLAUDE_CODE_SESSION_ID",
      );
    if (state === "unknown")
      expect(result.items[0]?.reason).toContain("transcript is missing");
    if (state === "dead")
      expect(result.items[0]).toMatchObject({
        before: { available_bytes: 100 },
        after: { available_bytes: 110 },
      });
    expect(process.exitCode).toBe(state === "dead" ? 0 : 1);
    expect(actions).toBe(state === "dead" ? 1 : 0);
    if (state === "dead") {
      const { freeScratch } = await import("../src/disk-scratch.ts");
      delta = 0;
      const shortfall = await freeScratch(
        10000,
        performance.now(),
        false,
        deps,
      );
      expect(shortfall).toMatchObject({
        exit: 1,
        items: [
          {
            verdict: "partial",
            reason: "no measured increase in available space",
          },
        ],
      });
      const request = { id: path, path, fingerprint: "same" };
      const actionDeps = {
        target,
        context: ctx,
        identity: () => Promise.resolve("changed"),
        device: () => Promise.resolve(1),
        measure: () => Promise.resolve(cleanObservation(available)),
        fail: () => expect.unreachable("unexpected failure"),
      };
      expect(await scratchAction(request, actionDeps)).toMatchObject({
        verdict: "changed",
        effect: "none",
      });
      await mkdir(join(path, "new/.git"), { recursive: true });
      expect(
        await scratchAction(request, {
          ...actionDeps,
          identity: () => Promise.resolve("same"),
        }),
      ).toMatchObject({
        verdict: "keep",
        reason: "delegated: jj workspace",
        effect: "none",
      });
      expect(
        (
          await freeScratch(10000, performance.now(), false, {
            ...deps,
            guard: () => "worker guard",
          })
        ).exit,
      ).toBe(1);
      expect(
        (
          await freeScratch(10000, performance.now(), false, {
            ...deps,
            lock: () =>
              Promise.resolve({ release: null, exit: 3, error: "busy" }),
          })
        ).exit,
      ).toBe(3);
      expect(
        (
          await freeScratch(10000, performance.now(), false, {
            ...deps,
            probe: () =>
              Promise.resolve({ out: "", err: "", exit: null, timedOut: true }),
          })
        ).exit,
      ).toBe(4);
      expect(actions).toBe(2);
    }
  },
);

test("scratch plan rejects action authority without touching the fixture", async () => {
  const home = await mkdtemp(join(tmpdir(), "disk-scratch-plan-"));
  const path = join(home, "payload");
  await writeFile(path, "keep");
  const result = await run(
    ["plan", "targets", "--target", "scratch", "--yes"],
    "",
    { ...process.env, HOME: home, RECLAIM_STATE_DIR: join(home, "state") },
  );
  expect(result.exit).toBe(2);
  expect(await readFile(path, "utf8")).toBe("keep");
});

for (const scenario of [
  "registered",
  "fresh",
  "open",
  "unknown",
  "remove",
  "scan",
  "changed",
  "revalidation",
  "zero",
  "guard",
  "lock",
  "lost",
] as const) {
  test(`ccc-index-db entry preserves ${scenario}`, async () => {
    const { createCccIndexDbTarget } =
      await import("../src/targets/ccc-index-db.ts");
    const { cccIndexDbAction } =
      await import("../src/disk-ccc-index-db-action.ts");
    const { loadCollectionPolicy } = await import("../src/policy.ts");
    const { err } = await import("neverthrow");
    const { main } = await import("../src/disk.ts");
    const root = await mkdtemp(join(tmpdir(), "disk-ccc-fixture-"));
    const home = join(root, "home");
    const db = join(root, "db");
    const path = join(db, "project", "cocoindex.db");
    await mkdir(join(db, "project"), { recursive: true });
    await writeFile(path, "fixture");
    await utimes(path, 1, 1);
    const policy = join(root, "policy.toml");
    await writeFile(
      policy,
      'graveyard_min_age_hours = 24\ngraveyard_pressure_undo_minutes = 10\n[collection_policy.class_rules.ownerless_cache]\ndefault_owner = "dotfiles"\nttl_days = 14\n[collection_policy.class_rules.deregistered_index_db]\nttl_days = 3\n',
    );
    const now = scenario === "fresh" ? 2_000 : 10 * 86400_000;
    const liveness: NonNullable<Context["liveness"]> = {
      facts: () => expect.unreachable("no session probe"),
      openPaths: () => ({
        open: scenario === "open" ? [{ path, pid: 1, via: "fd" }] : [],
        unknown: scenario === "unknown" ? ["unreadable reader"] : [],
      }),
      refresh: () => liveness,
    };
    const context: Context = {
      ...cleanContext,
      targetName: "ccc-index-db",
      liveness,
    };
    let actions = 0;
    let available = 100;
    let revalidating = false;
    const target: Target = {
      ...createCccIndexDbTarget({
        home: () => home,
        dbRoot: () => db,
        ...(scenario === "scan"
          ? {
              discoverArtifacts: () =>
                Promise.resolve(err(new Error("fixture scan failed"))),
            }
          : {}),
        isRegisteredRoot: () =>
          scenario === "registered" ||
          (scenario === "revalidation" && revalidating),
        loadPolicy: () => loadCollectionPolicy(policy),
        now: () => now,
      }),
      act: () => {
        actions++;
        if (scenario !== "zero") available += 10;
        return Promise.resolve({ ok: true, bytes_freed: 1000, error: null });
      },
    };
    const deps = {
      guard: () => (scenario === "guard" ? "worker guard" : null),
      lock: () =>
        Promise.resolve(
          scenario === "lock"
            ? { release: null, exit: 3, error: "busy" }
            : { release: () => {}, exit: 0, error: null },
        ),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        let error: string | undefined;
        if (action === undefined) {
          const rows = await target.plan({
            ...context,
            reportPlanError: (message) => {
              error = message;
            },
          });
          return {
            out: JSON.stringify(
              rows.map((candidate) => ({ candidate, fingerprint: "same" })),
            ),
            err: error ?? "",
            exit: error === undefined ? 0 : 4,
            timedOut: false,
          };
        }
        revalidating = true;
        if (scenario === "lost")
          return { out: "", err: "lost child", exit: 1, timedOut: false };
        const request = jsonOf(
          z.object({
            id: z.string(),
            path: z.string(),
            fingerprint: z.string(),
          }),
        ).safeParse(action);
        if (!request.success) expect.unreachable("invalid fixture action");
        const result = await cccIndexDbAction(request.data, {
          target,
          context,
          identity: () =>
            Promise.resolve(scenario === "changed" ? "changed" : "same"),
          device: () => Promise.resolve(1),
          measure: () => Promise.resolve(cleanObservation(available)),
          fail: () => expect.unreachable("unexpected failure"),
        });
        return {
          out: JSON.stringify(result),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    let output = "";
    const previous = process.exitCode;
    const stdout = spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        output += String(chunk);
        return true;
      },
    );
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      stdout.mockRestore();
      process.exitCode = previous ?? 0;
    });
    process.exitCode = 0;
    await main(
      ["free", "targets", "ccc-index-db", "--approve", path, "--no-progress"],
      undefined,
      undefined,
      undefined,
      undefined,
      deps,
    );
    const result = jsonText.safeParse(output).data;
    if (scenario === "scan" || scenario === "guard" || scenario === "lock") {
      const exits = { scan: 4, guard: 1, lock: 3 };
      expect(process.exitCode).toBe(exits[scenario]);
      expect(result).toMatchObject({ items: [] });
      if (scenario === "scan")
        expect(JSON.stringify(result)).toContain("ccc index DB scan failed");
    } else {
      const expected = {
        registered: ["keep", "registered retrieval root"],
        fresh: ["keep", "touched within"],
        open: ["keep", "live reader"],
        unknown: ["ask", "could not establish reader"],
        remove: ["completed", "index artifact removal completed"],
        changed: ["changed", "fingerprint changed"],
        revalidation: ["keep", "registered retrieval root"],
        zero: ["partial", "no measured increase"],
        lost: ["unknown", "child failed"],
      } as const;
      const [verdict, reason] = expected[scenario];
      expect(result).toMatchObject({
        items: [
          {
            path,
            verdict,
            effect: ["remove", "zero", "lost"].includes(scenario)
              ? "unlink"
              : "none",
          },
        ],
      });
      expect(JSON.stringify(result)).toContain(reason);
      if (scenario === "remove")
        expect(result).toMatchObject({
          items: [
            {
              before: { source: "statfs", available_bytes: 100 },
              after: { source: "statfs", available_bytes: 110 },
            },
          ],
        });
      let expectedExit = 1;
      if (scenario === "remove") expectedExit = 0;
      if (scenario === "lost") expectedExit = 4;
      expect(process.exitCode).toBe(expectedExit);
    }
    expect(actions).toBe(scenario === "remove" || scenario === "zero" ? 1 : 0);
  });
}

test.each([
  "mise-configs",
  "clean",
  "rust",
  "toolchains",
  "builds",
  "tmpfs",
  "scratch",
  "ccc-index-db",
] as const)(
  "plan entry uses %s planning without action",
  async (targetName) => {
    const { main } = await import("../src/disk.ts");
    const candidates: Candidate[] = [
      await fakeTree("/fixture/reclaim", "eligible fixture"),
      await fakeKeep("/fixture/keep", "retained fixture"),
    ];
    let plans = 0;
    let actions = 0;
    const fixtureTarget: Target = {
      name: "mise-configs",
      tier: "blind",
      available: () => ({ available: true, skip_reason: null }),
      plan: () => {
        plans++;
        return Promise.resolve(candidates);
      },
      act: () => {
        actions++;
        expect.unreachable("action called");
      },
    };
    const probe = (action: string | undefined) => {
      if (action !== undefined) {
        const request = jsonOf(z.object({ preview: z.boolean() })).safeParse(
          action,
        );
        if (!request.success || !request.data.preview) {
          actions++;
          expect.unreachable("action called");
        }
        return Promise.resolve({
          out: JSON.stringify({
            verdict: "safe",
            reason: "eligible fixture",
            effect: "none",
            same_filesystem: true,
          }),
          err: "",
          exit: 0,
          timedOut: false,
        });
      }
      plans++;
      return Promise.resolve({
        out: JSON.stringify(
          candidates.map((candidate) => ({
            candidate,
            fingerprint: "identity",
          })),
        ),
        err: "",
        exit: 0,
        timedOut: false,
      });
    };
    let output = "";
    const previous = process.exitCode;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      process.exitCode = previous ?? 0;
    });
    process.exitCode = 0;
    await main(
      ["plan", "targets", targetName, "--no-progress"],
      undefined,
      (text) => {
        output += text;
      },
      undefined,
      undefined,
      undefined,
      { probe, miseTarget: fixtureTarget },
    );
    expect(process.exitCode).toBe(0);
    expect(jsonText.safeParse(output).data).toMatchObject({
      outcome: "completed",
      receipt: null,
      counts: { selected: 2, completed: 0, refused: 1, unknown: 0 },
      items: [
        {
          target: targetName,
          path: "/fixture/reclaim",
          verdict: "safe",
          reason: "eligible fixture",
          effect: "none",
        },
        {
          target: targetName,
          path: "/fixture/keep",
          verdict: "keep",
          reason: "retained fixture",
          effect: "none",
        },
      ],
    });
    expect(plans).toBe(1);
    expect(actions).toBe(0);
  },
);

test.each([
  "clean",
  "rust",
  "tmpfs",
  "toolchains",
  "builds",
  "scratch",
  "ccc-index-db",
] as const)("%s plan entry shares the action refusal", async (targetName) => {
  const { main } = await import("../src/disk.ts");
  const { cleanAction, cleanPreflight } =
    await import("../src/disk-clean-action.ts");
  const { buildsAction, buildsPreflight } =
    await import("../src/disk-builds-action.ts");
  const { scratchAction, scratchPreflight } =
    await import("../src/disk-scratch-action.ts");
  const { cccIndexDbAction, cccIndexDbPreflight } =
    await import("../src/disk-ccc-index-db-action.ts");
  const path = "/fixture/protected";
  const eligible = await fakeTree(path, "eligible fixture");
  const kept = await fakeKeep(path, "protected fixture");
  let actions = 0;
  const target = {
    name: targetName,
    tier: "blind" as const,
    fastFirst: true as const,
    available: () => ({ available: true as const, skip_reason: null }),
    plan: () =>
      Promise.resolve([
        targetName === "scratch" || targetName === "ccc-index-db"
          ? kept
          : eligible,
      ]),
    recheck: () => Promise.resolve(kept),
    act: () => {
      actions++;
      expect.unreachable("action must not run");
    },
  };
  const deps = {
    target,
    context: cleanContext,
    identity: () => Promise.resolve("same"),
    protection: () => "fixture protection",
    device: () => Promise.resolve(1),
    measure: () => Promise.resolve(cleanObservation(100)),
    fail: (message: string): never => {
      expect.unreachable(message);
    },
  };
  const request = { id: path, path, fingerprint: "same" };
  const toolDeps = {
    config: cleanContext.config,
    target,
    fingerprint: deps.identity,
    protection: deps.protection,
  };
  const check = async (preview: boolean) => {
    if (targetName === "toolchains")
      return toolchainsWorker({ ...request, preview }, toolDeps);
    if (targetName === "builds")
      return preview
        ? buildsPreflight(request, deps)
        : buildsAction(request, deps);
    if (targetName === "scratch")
      return preview
        ? scratchPreflight(request, deps)
        : scratchAction(request, deps);
    if (targetName === "ccc-index-db")
      return preview
        ? cccIndexDbPreflight(request, deps)
        : cccIndexDbAction(request, deps);
    return preview ? cleanPreflight(request, deps) : cleanAction(request, deps);
  };
  const probe = async (action: string | undefined) => ({
    out: JSON.stringify(
      action === undefined
        ? [{ candidate: eligible, fingerprint: "same" }]
        : await check(true),
    ),
    err: "",
    exit: 0,
    timedOut: false,
  });
  let output = "";
  const previous = process.exitCode;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    process.exitCode = previous ?? 0;
  });
  process.exitCode = 0;
  await main(
    ["plan", "targets", targetName, "--no-progress"],
    undefined,
    (text) => {
      output += text;
    },
    undefined,
    undefined,
    undefined,
    { probe },
  );
  const acted = await check(false);
  let reason = "protected fixture";
  if (targetName === "toolchains") reason = "fixture protection";
  else if (["clean", "rust", "tmpfs"].includes(targetName))
    reason = "protected: fixture protection";
  expect(acted).toMatchObject({ verdict: "keep", reason, effect: "none" });
  expect(jsonText.safeParse(output).data).toMatchObject({
    items: [{ verdict: "keep", reason, effect: "none" }],
  });
  expect(process.exitCode).toBe(0);
  expect(actions).toBe(0);
});

test("real clean plan preflight leaves a reclaimable cache untouched", async () => {
  const home = await mkdtemp(join(tmpdir(), "disk-clean-real-plan-"));
  const path = join(home, ".npm/_cacache");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "payload"), "keep");
  const result = await run(["plan", "targets", "clean", "--no-progress"], "", {
    ...process.env,
    HOME: home,
    RECLAIM_STATE_DIR: join(home, "state"),
  });
  expect([0, 4]).toContain(result.exit);
  expect(jsonText.safeParse(result.out).data).toMatchObject({
    items: [{ path, effect: "none" }],
    receipt: null,
  });
  expect(await readFile(join(path, "payload"), "utf8")).toBe("keep");
  expect(existsSync(join(home, "state"))).toBe(false);
});

test("real mise-configs plan revalidates dead records without pruning", async () => {
  const home = await mkdtemp(join(tmpdir(), "disk-mise-real-plan-"));
  const state = join(home, "mise");
  await mkdir(join(state, "tracked-configs"), { recursive: true });
  const record = join(state, "tracked-configs", "dead");
  await symlink(join(home, "missing.toml"), record);
  const result = await run(
    ["plan", "targets", "mise-configs", "--no-progress"],
    "",
    {
      ...process.env,
      HOME: home,
      MISE_STATE_DIR: state,
      RECLAIM_STATE_DIR: join(home, "reclaim"),
    },
  );
  expect(result.exit).toBe(0);
  expect(jsonText.safeParse(result.out).data).toMatchObject({
    items: [
      {
        verdict: "safe",
        reason: "1 dead tracked, trusted, or ignored config records",
        effect: "none",
      },
    ],
    receipt: null,
  });
  expect(existsSync(join(home, "reclaim"))).toBe(false);
  expect(await (await import("node:fs/promises")).readlink(record)).toBe(
    join(home, "missing.toml"),
  );
});

const ripMeasurement = () =>
  Promise.resolve({
    time: "fixture",
    source: "statfs",
    mount: null,
    filesystem: null,
    available_bytes: 100,
    free_inodes: 10,
    error: null,
  });
const ripFingerprint = async (path: string) => {
  const s = await lstat(path);
  return `${s.dev}:${s.ino}:${s.mtimeMs}:${s.size}`;
};
for (const refusal of [
  "unknown",
  "undo",
  "young",
  "record",
  "order",
  "cap",
  "positive",
] as const)
  test(`rip-expire through disk retains ${refusal} refusal and reports ordered actions`, async () => {
    const { createRipExpiryTarget } =
      await import("../src/targets/rip-expire.ts");
    const { runRipExpiry } = await import("../src/disk-rip-expire-run.ts");
    const { main } = await import("../src/disk.ts");
    const root = await mkdtemp(join(tmpdir(), "disk-rip-parity-"));
    const now = Temporal.Now.instant().epochMilliseconds;
    const paths = {
      unknown: join(root, "unknown"),
      undo: join(root, "undo"),
      young: join(root, "young"),
      old: join(root, "old"),
      older: join(root, "older"),
    };
    for (const path of Object.values(paths)) await writeFile(path, "fixture");
    if (refusal === "cap") {
      const retained = await open(paths.undo, "w");
      await retained.truncate(9 * 1024 ** 3);
      await retained.close();
      const oldest = await open(paths.older, "w");
      await oldest.truncate(2 * 1024 ** 3);
      await oldest.close();
    }
    await writeFile(
      join(root, ".record"),
      [
        [paths.undo, now],
        [paths.young, now - 60 * 60_000],
        [paths.old, now - (refusal === "cap" ? 80 * 60_000 : 10 * 86400_000)],
        [
          paths.older,
          now - (refusal === "cap" ? 100 * 60_000 : 20 * 86400_000),
        ],
      ]
        .map(
          ([path, time]) =>
            `${Temporal.Instant.fromEpochMilliseconds(Number(time)).toString()}\t/original\t${path}`,
        )
        .join("\n"),
    );
    const actions: string[] = [];
    const expiry = createRipExpiryTarget({
      policyPath: resolve(import.meta.dir, "../reclaim.toml"),
      availableBytes: () => 1000 * 1024 ** 3,
      remove: (path) => {
        actions.push(path);
        return Promise.resolve({
          ok: true,
          entries_removed: 1,
          bytes_freed: 7,
          statfs_bytes_freed: 0,
          errors: [],
          refused: [],
        });
      },
    });
    const target = {
      ...expiry.target,
      plan: (ctx: Parameters<typeof expiry.target.plan>[0]) =>
        expiry.candidates({ RIP_GRAVEYARD: root }, root, { context: ctx, now }),
    };
    const deps = {
      guard: () => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      probe: async () => {
        const ctx = {
          mode: "run" as const,
          config: {
            repo_roots: [],
            repos: [],
            scratch_roots: [],
            delete_roots: [],
            regenerable_ignored: [],
            session_grace_hours: 24,
            ignore_unreadable_procs: [],
          },
          log: () => {},
        };
        const result = await runRipExpiry({
          target,
          context: ctx,
          fingerprint: ripFingerprint,
          measure: ripMeasurement,
          stopOnError: false,
        });
        return {
          out: JSON.stringify(result),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
      receipt: () =>
        Promise.resolve({
          id: "fixture",
          path: "/fixture",
          delivery_error: null,
        }),
    };
    let output = "";
    await main(
      ["free", "targets", "rip-expire", "--no-progress"],
      undefined,
      (text) => {
        output += text;
      },
      undefined,
      undefined,
      deps,
    );
    const parsed = jsonOf(
      z.object({
        outcome: z.string(),
        items: z.array(
          z.object({
            path: z.string().nullable(),
            reason: z.string(),
            verdict: z.string(),
            effect: z.string(),
            logical_bytes: z.number().nullable(),
          }),
        ),
        observations: z.object({
          delta_available_bytes: z.number().nullable(),
        }),
      }),
    ).safeParse(output);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const result = parsed.data;
    expect(result.outcome).toBe("partial");
    const expected = {
      unknown: [paths.unknown, "burial time unknown"],
      undo: [paths.undo, "undo window"],
      young: [paths.young, "within its size limit"],
      record: [
        join(root, ".record"),
        "required to restore kept graveyard entries",
      ],
    };
    if (
      refusal === "unknown" ||
      refusal === "undo" ||
      refusal === "young" ||
      refusal === "record"
    ) {
      const [path, reason] = expected[refusal];
      expect(result.items.find((item) => item.path === path)).toMatchObject({
        verdict: "keep",
      });
      expect(result.items.find((item) => item.path === path)?.reason).toContain(
        reason,
      );
    }
    if (refusal === "cap") {
      expect(actions).toEqual([paths.older]);
      expect(
        result.items.find((item) => item.path === paths.old),
      ).toMatchObject({
        verdict: "keep",
        reason: "graveyard is within its size limit",
        effect: "none",
      });
    } else {
      expect(actions).toEqual([paths.older, paths.old]);
      expect(
        result.items.find((item) => item.path === paths.old),
      ).toMatchObject({
        verdict: "completed",
        effect: "unlink",
        logical_bytes: 7,
      });
    }
    expect(result.observations.delta_available_bytes).toBe(0);
    process.exitCode = 0;
  });

test("rip-expire refuses worker guard and busy lock before running the worker", async () => {
  const { freeRipExpiry } = await import("../src/disk-rip-expire.ts");
  let probes = 0;
  const deps = {
    guard: (): string | null => "worker guard",
    lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
    probe: () => {
      probes++;
      return Promise.resolve({ out: "", err: "", exit: 0, timedOut: false });
    },
    receipt: () =>
      Promise.resolve({
        id: "fixture",
        path: "/fixture",
        delivery_error: null,
      }),
  };
  const denied = await freeRipExpiry(
    1000,
    performance.now(),
    false,
    undefined,
    false,
    undefined,
    deps,
  );
  expect(denied.exit).toBe(1);
  expect(denied.error).toBe("worker guard");
  const busy = await freeRipExpiry(
    1000,
    performance.now(),
    false,
    undefined,
    false,
    undefined,
    { ...deps, guard: () => null },
  );
  expect(busy.exit).toBe(3);
  expect(probes).toBe(0);
});

test.each([
  ["in-use", "not in use", "keep"],
  ["dirty", "fresh working copy", "ask"],
  ["conflict", "no conflicts", "keep"],
  ["unpushed", "every non-empty commit is on a remote", "ask"],
  ["untracked", "ignored files are regenerable", "ask"],
  ["clean", "workspaces cleanup completed", "completed"],
] as const)(
  "workspaces entry preserves %s",
  async (scenario, reason, verdict) => {
    const { createWorkspacesTarget } =
      await import("../src/targets/workspaces.ts");
    const { workspacesAction } =
      await import("../src/disk-workspaces-action.ts");
    const { main } = await import("../src/disk.ts");
    const { chmod } = await import("node:fs/promises");
    const root = await mkdtemp(join(tmpdir(), "disk-workspaces-parity-"));
    const path = join(root, "ws");
    const store = join(root, "store");
    const bin = join(root, "bin");
    const proc = join(root, "proc");
    await mkdir(join(path, ".jj"), { recursive: true });
    await writeFile(join(path, ".jj/repo"), "fixture");
    await mkdir(store);
    await mkdir(bin);
    await mkdir(proc);
    if (scenario === "untracked")
      await writeFile(join(path, ".env"), "valuable");
    await writeFile(
      join(bin, "agx"),
      `#!${process.execPath}\nprocess.stdout.write('[]');\n`,
    );
    await writeFile(
      join(bin, "jj"),
      `#!${process.execPath}\nconst a = process.argv.slice(2); const rev = a[a.indexOf('-r') + 1] ?? ''; if (a.includes('status') && ${scenario === "dirty"}) process.stderr.write('warning: fixture'); if (a.includes('log') && ${scenario === "conflict"} && rev.includes('conflicts()')) process.stdout.write('conflict\\n'); if (a.includes('log') && ${scenario === "unpushed"} && rev.includes('empty()')) process.stdout.write('unpublished\\n');\n`,
    );
    await chmod(join(bin, "jj"), 0o755);
    await chmod(join(bin, "agx"), 0o755);
    const oldPath = process.env["PATH"];
    process.env["PATH"] = `${bin}:${oldPath}`;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      process.env["PATH"] = oldPath;
    });
    const target = createWorkspacesTarget({
      runProtection: () => Promise.resolve(null),
      jj: (args) => {
        const rev = args[args.indexOf("-r") + 1] ?? "";
        const hit =
          (scenario === "conflict" && rev.includes("conflicts()")) ||
          (scenario === "unpushed" && rev.includes("empty()"));
        return {
          ok: true,
          stdout: hit ? "fixture\n" : "",
          stderr:
            scenario === "dirty" && args.includes("status")
              ? "warning: fixture"
              : "",
        };
      },
      discover: () => ({ stores: [store], workspaces: [] }),
      list: () => ({
        store,
        listed: [{ name: "ws", root: path }],
        error: null,
      }),
      openPaths: () => ({
        open: scenario === "in-use" ? [{ pid: 10, via: "cwd", path }] : [],
        unknown: [],
      }),
    });
    let actions = 0;
    const fixtureTarget = {
      ...target,
      act: () => {
        actions++;
        return Promise.resolve({ ok: true, bytes_freed: 10, error: null });
      },
    };
    const ctx: Context = {
      ...cleanContext,
      mode: "run",
      procDir: proc,
      targetName: "workspaces",
      config: { ...cleanContext.config, repo_roots: [] },
    };
    let available = 100;
    const deps = {
      guard: (): string | null => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        let value: unknown;
        if (action === undefined)
          value = (await target.plan(ctx)).map((candidate) => ({
            candidate,
            fingerprint: "same",
          }));
        else {
          const request = jsonOf(
            z.object({
              id: z.string(),
              path: z.string(),
              fingerprint: z.string(),
            }),
          ).safeParse(action);
          if (!request.success) expect.unreachable("invalid fixture action");
          value = await workspacesAction(request.data, {
            target: fixtureTarget,
            context: ctx,
            identity: () => Promise.resolve("same"),
            device: () => Promise.resolve(1),
            measure: () => Promise.resolve(cleanObservation((available += 10))),
            fail: () => expect.unreachable("unexpected failure"),
          });
        }
        return {
          out: JSON.stringify(value),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    let output = "";
    const stdout = spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        output += String(chunk);
        return true;
      },
    );
    const previous = process.exitCode;
    cleanup.defer(() => {
      stdout.mockRestore();
      process.exitCode = previous ?? 0;
    });
    process.exitCode = 0;
    await main(
      ["free", "targets", "workspaces", "--approve", path, "--no-progress"],
      undefined,
      undefined,
      undefined,
      undefined,
      deps,
    );
    const parsed = jsonOf(
      z.object({
        items: z.array(
          z.object({
            path: z.string(),
            verdict: z.string(),
            reason: z.string(),
          }),
        ),
      }),
    ).safeParse(output);
    if (!parsed.success) expect.unreachable("invalid result");
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0]).toMatchObject({ path, verdict });
    expect(parsed.data.items[0]?.reason).toContain(reason);
    expect(process.exitCode).toBe(scenario === "clean" ? 0 : 1);
    expect(actions).toBe(scenario === "clean" ? 1 : 0);
    expect(existsSync(path)).toBe(true);
  },
  30000,
);

test("workspaces adapter refuses guards, changed identity, and unmeasured success", async () => {
  const { freeWorkspaces } = await import("../src/disk-workspaces.ts");
  const { workspacesAction } = await import("../src/disk-workspaces-action.ts");
  const candidate: Candidate = {
    id: "ws",
    path: "/fixture/ws",
    verdict: "RECLAIM" as const,
    reason: "safe",
    checks: [],
    bytes: 10,
    bytes_kind: "estimate" as const,
    action: { kind: "jj-forget+delete", argv: [] },
    result: null,
  };
  let actions = 0;
  let identity = "same";
  const target: Target = {
    name: "workspaces",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: () => Promise.resolve([candidate]),
    act: () => {
      actions++;
      return Promise.resolve({ ok: true, bytes_freed: 10, error: null });
    },
  };
  const deps = {
    guard: (): string | null => null,
    lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
    receipt: () =>
      Promise.resolve({ id: "r", path: "/r", delivery_error: null }),
    probe: async (action: string | undefined) => {
      const request =
        action === undefined
          ? null
          : jsonOf(
              z.object({
                id: z.string(),
                path: z.string(),
                fingerprint: z.string(),
              }),
            ).safeParse(action);
      if (request !== null && !request.success)
        expect.unreachable("invalid fixture action");
      const value =
        request === null
          ? [{ candidate, fingerprint: "same" }]
          : await workspacesAction(request.data, {
              target,
              context: cleanContext,
              identity: () => Promise.resolve(identity),
              device: () => Promise.resolve(1),
              measure: () => Promise.resolve(cleanObservation(100)),
              fail: () => expect.unreachable("unexpected failure"),
            });
      return { out: JSON.stringify(value), err: "", exit: 0, timedOut: false };
    },
  };
  expect(
    (
      await freeWorkspaces(10000, performance.now(), false, {
        ...deps,
        guard: () => "guard",
      })
    ).exit,
  ).toBe(1);
  expect(
    (
      await freeWorkspaces(10000, performance.now(), false, {
        ...deps,
        lock: () => Promise.resolve({ release: null, exit: 3, error: "busy" }),
      })
    ).exit,
  ).toBe(3);
  identity = "changed";
  expect(
    (await freeWorkspaces(10000, performance.now(), false, deps)).items[0],
  ).toMatchObject({ verdict: "changed", effect: "none" });
  expect(actions).toBe(0);
  identity = "same";
  expect(
    (await freeWorkspaces(10000, performance.now(), false, deps)).items[0],
  ).toMatchObject({
    verdict: "partial",
    reason: "no measured increase in available space",
  });
  expect(actions).toBe(1);
});

test("workspaces plan never invokes the action adapter", async () => {
  const { main } = await import("../src/disk.ts");
  let calls = 0;
  const deps = {
    guard: (): string | null => null,
    lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
    receipt: () =>
      Promise.resolve({ id: "r", path: "/r", delivery_error: null }),
    probe: () => {
      calls++;
      return Promise.resolve({ out: "[]", err: "", exit: 0, timedOut: false });
    },
  };
  const output = spyOn(process.stdout, "write").mockImplementation(() => true);
  const previous = process.exitCode;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    output.mockRestore();
    process.exitCode = previous ?? 0;
  });
  await main(
    ["plan", "targets", "--target", "workspaces", "--no-progress"],
    undefined,
    undefined,
    undefined,
    undefined,
    deps,
  );
  expect(process.exitCode).toBe(4);
  expect(calls).toBe(0);
});

test.each([
  ["approval", null, false, "ask", "owner approval required"],
  [
    "protected",
    "tool installation root",
    true,
    "keep",
    "protected: tool installation root",
  ],
  [
    "unknown",
    "process paths are unknown",
    true,
    "ask",
    "protected: process paths are unknown",
  ],
  [
    "live",
    "contains a running process cwd",
    true,
    "keep",
    "protected: contains a running process cwd",
  ],
  ["eligible", null, true, "completed", "judgment cleanup completed"],
] as const)(
  "judgment entry preserves %s",
  async (_label, reason, approved, verdict, expectedReason) => {
    const { judgmentCandidates, judgment } =
      await import("../src/targets/judgment.ts");
    const { judgmentAction } = await import("../src/disk-judgment-action.ts");
    const { main } = await import("../src/disk.ts");
    const root = await mkdtemp(join(tmpdir(), "disk-judgment-parity-"));
    const rustup = join(root, "rustup");
    const path = join(rustup, "toolchains/stable/share/doc/rust/html");
    await mkdir(path, { recursive: true });
    const ctx = { ...cleanContext, targetName: "judgment" };
    let actions = 0;
    let available = 100;
    let delta = 10;
    const target: Target = {
      ...judgment,
      plan: () =>
        judgmentCandidates({ RUSTUP_HOME: rustup }, root, {
          reason: () => reason,
        }),
      act: () => {
        actions++;
        available += delta;
        return Promise.resolve({ ok: true, bytes_freed: 10, error: null });
      },
    };
    const deps = {
      guard: (): string | null => null,
      lock: () => Promise.resolve({ release: () => {}, exit: 0, error: null }),
      receipt: () =>
        Promise.resolve({ id: "r", path: "/fixture/r", delivery_error: null }),
      probe: async (action: string | undefined) => {
        if (action === undefined)
          return {
            out: JSON.stringify(
              (await target.plan(ctx)).map((candidate) => ({
                candidate,
                fingerprint: "same",
              })),
            ),
            err: "",
            exit: 0,
            timedOut: false,
          };
        const parsed = jsonOf(
          z.object({
            id: z.string(),
            path: z.string(),
            fingerprint: z.string(),
          }),
        ).safeParse(action);
        if (!parsed.success) expect.unreachable("invalid action");
        const result = await judgmentAction(parsed.data, {
          target,
          context: ctx,
          identity: () => Promise.resolve("same"),
          device: () => Promise.resolve(1),
          measure: () => Promise.resolve(cleanObservation(available)),
          fail: () => expect.unreachable("measurement failed"),
        });
        return {
          out: JSON.stringify(result),
          err: "",
          exit: 0,
          timedOut: false,
        };
      },
    };
    let output = "";
    const stdout = spyOn(process.stdout, "write").mockImplementation(
      (chunk) => {
        output += String(chunk);
        return true;
      },
    );
    const previous = process.exitCode;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      stdout.mockRestore();
      process.exitCode = previous ?? 0;
    });
    process.exitCode = 0;
    await main(
      [
        "free",
        "targets",
        "judgment",
        ...(approved ? ["--approve", path] : []),
        "--no-progress",
      ],
      undefined,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(jsonText.safeParse(output).data).toMatchObject({
      items: [
        {
          path,
          verdict,
          reason: expectedReason,
          effect: approved && reason === null ? "unlink" : "none",
        },
      ],
    });
    expect(process.exitCode).toBe(verdict === "completed" ? 0 : 1);
    expect(actions).toBe(verdict === "completed" ? 1 : 0);
    if (verdict === "completed") {
      expect(jsonText.safeParse(output).data).toMatchObject({
        items: [
          { before: { available_bytes: 100 }, after: { available_bytes: 110 } },
        ],
      });
      const { freeJudgment } = await import("../src/disk-judgment.ts");
      expect(
        (
          await freeJudgment(
            10000,
            performance.now(),
            false,
            { ...deps, guard: () => "worker guard" },
            undefined,
            false,
            [path],
          )
        ).exit,
      ).toBe(1);
      expect(
        (
          await freeJudgment(
            10000,
            performance.now(),
            false,
            {
              ...deps,
              lock: () =>
                Promise.resolve({ release: null, exit: 3, error: "busy" }),
            },
            undefined,
            false,
            [path],
          )
        ).exit,
      ).toBe(3);
      expect(actions).toBe(1);
      const changed = await judgmentAction(
        { id: path, path, fingerprint: "old" },
        {
          target,
          context: ctx,
          identity: () => Promise.resolve("new"),
          device: () => Promise.resolve(1),
          measure: () => Promise.resolve(cleanObservation(available)),
          fail: () => expect.unreachable("measurement failed"),
        },
      );
      expect(changed).toMatchObject({ verdict: "changed", effect: "none" });
      expect(actions).toBe(1);
      delta = 0;
      expect(
        await freeJudgment(
          10000,
          performance.now(),
          false,
          deps,
          undefined,
          false,
          [path],
        ),
      ).toMatchObject({
        exit: 1,
        items: [
          {
            verdict: "partial",
            reason: "no measured increase in available space",
          },
        ],
      });
      expect(actions).toBe(2);
    }
  },
);

test("judgment plan rejects action flag before probing", async () => {
  const result = await run([
    "plan",
    "targets",
    "--target",
    "judgment",
    "--yes",
    "--no-progress",
  ]);
  expect(result.exit).toBe(2);
});
