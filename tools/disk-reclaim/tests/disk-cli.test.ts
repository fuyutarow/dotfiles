import { jsonText } from "../../shared/src/zod.ts";
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { runProbe } from "../src/disk-probe.ts";
import { planPaths } from "../src/disk-path-plan.ts";
import { movePaths } from "../src/disk-move.ts";

const cli = join(import.meta.dir, "../src/disk.ts");
const tmpfsProbe: typeof runProbe = () =>
  Promise.resolve({ out: "tmpfs\n", err: "", exit: 0, timedOut: false });
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
