import { jsonOf, jsonText, z } from "@dotfiles/shared/src/zod.ts";
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { runProbe } from "../src/disk-probe.ts";
import { planPaths } from "../src/disk-path-plan.ts";
import { movePaths } from "../src/disk-move.ts";
import type { Candidate } from "../src/model.ts";
import type { Context } from "../src/targets/index.ts";

const cli = join(import.meta.dir, "../src/disk.ts");
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
      graveyard: process.env.GRAVEYARD,
      state: process.env.RECLAIM_STATE_DIR,
    };
    process.env.GRAVEYARD = graveyard;
    process.env.RECLAIM_STATE_DIR = join(dir, "state");
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
      const path = env?.DISK_MOVE_PATH;
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
        if (previous.graveyard === undefined) delete process.env.GRAVEYARD;
        else process.env.GRAVEYARD = previous.graveyard;
        if (previous.state === undefined) delete process.env.RECLAIM_STATE_DIR;
        else process.env.RECLAIM_STATE_DIR = previous.state;
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
      [["free", "targets", "tmpfs"]],
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
  expect(result.exit).toBe(4);
  expect(jsonText.safeParse(result.out).data).toMatchObject({
    outcome: "unknown",
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
  const { symlink } = await import("node:fs/promises");
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
  expect(result.exit).toBe(4);
  expect(jsonText.safeParse(result.out).data).toMatchObject({
    outcome: "unknown",
    items: [],
    receipt: null,
  });
  expect(existsSync(join(home, "state"))).toBe(false);
});
