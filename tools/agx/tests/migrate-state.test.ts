import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { migrateState } from "../src/migrate-state.ts";

const scratch: string[] = [];
const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), "agx-migration-"));
  scratch.push(base);
  return {
    base,
    previous: join(base, ["agent", "router"].join("-")),
    current: join(base, "agx"),
  };
};
const put = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const marker = (path: string, run_id: string, pid = process.pid) => {
  put(path, JSON.stringify({ run_id, pid }));
};
const cliPath = join(import.meta.dir, "../src/migrate-state.ts");
async function runCli(base: string, args: string[] = []) {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    env: { ...process.env, HOME: base, XDG_STATE_HOME: base },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}
afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("merges all JSONL logs with exact deduplication and timestamp ordering", async () => {
  const { base, previous, current } = fixture();
  const early = JSON.stringify({
    run_id: "same-run",
    at: "2026-10-08T00:00:00Z",
    kind: "run",
  });
  const late = JSON.stringify({
    run_id: "same-run",
    at: "2026-10-09T00:00:00Z",
    kind: "grade",
  });
  for (const name of ["runs.jsonl", "incidents.jsonl", "nested/other.jsonl"]) {
    put(join(previous, name), `${late}\n${early}\n${early}\n`);
    put(join(current, name), `${late}\n`);
  }
  expect(await migrateState(base)).toContain("OK: merged");
  for (const name of ["runs.jsonl", "incidents.jsonl", "nested/other.jsonl"])
    expect(readFileSync(join(current, name), "utf8")).toBe(
      `${early}\n${late}\n`,
    );
  expect(existsSync(previous)).toBe(false);
});

test("copies absent files, skips identical files, and reruns with nothing to do", async () => {
  const { base, previous, current } = fixture();
  for (const name of ["briefs/hash.md", "worker-receipts/dead.json"])
    put(join(previous, name), "same bytes");
  put(join(current, "briefs/hash.md"), "same bytes");
  marker(join(previous, "active/dead.json"), "dead", 2147483647);
  put(join(previous, "active/dead.progress.json"), "{}");
  expect(await migrateState(base)).toContain("OK: merged");
  expect(existsSync(previous)).toBe(false);
  expect(readFileSync(join(current, "worker-receipts/dead.json"), "utf8")).toBe(
    "same bytes",
  );
  expect(existsSync(join(current, "active/dead.json"))).toBe(true);
  expect(await migrateState(base)).toContain("nothing to do");
  expect((await runCli(base)).stdout).toContain("nothing to do");
});

for (const name of [
  `briefs/${"a".repeat(64)}.md`,
  "worker-receipts/dead.json",
  "active/dead.json",
]) {
  test(`conflicting ${name} is a named hard error preserving both files`, async () => {
    const { base, previous, current } = fixture();
    const old = name.startsWith("active/")
      ? JSON.stringify({ run_id: "dead", pid: 2147483647 })
      : "old";
    put(join(previous, name), old);
    put(join(current, name), "new");
    const result = await runCli(base);
    expect(result.exit).toBe(1);
    expect(result.stdout).toContain(
      `conflicting state file ${join(current, name)}`,
    );
    expect(readFileSync(join(previous, name), "utf8")).toBe(old);
    expect(readFileSync(join(current, name), "utf8")).toBe("new");
  });
}

test("live marker exits 3 while unrelated state merges, then completes after pid exits", async () => {
  const { base, previous, current } = fixture();
  const worker = Bun.spawn([process.execPath, "-e", "await Bun.sleep(60000)"], {
    stdout: "ignore",
    stderr: "ignore",
    timeout: 5000,
  });
  await Promise.try(async () => {
    marker(join(previous, "active/live.json"), "live", worker.pid);
    for (const name of [
      "active/live.progress.json",
      "worker-receipts/live.json",
      "worker-receipts/live.last.txt",
      "briefs/live.md",
      "nested/live/output.txt",
    ])
      put(join(previous, name), "private live bytes");
    put(
      join(previous, "worker-receipts/alias.json"),
      JSON.stringify({ run_id: "live" }),
    );
    put(join(previous, "worker-receipts/live-other.json"), "not owned");
    marker(join(previous, "active/dead.json"), "dead", 2147483647);
    put(join(previous, "runs.jsonl"), '{"run_id":"dead"}\n{"run_id":"live"}\n');
    const partial = await runCli(base);
    expect(partial.exit).toBe(3);
    expect(partial.stdout).toContain("live run ids: live");
    expect(partial.stdout).toContain("worker-receipts/live.json");
    expect(existsSync(join(current, "active/dead.json"))).toBe(true);
    expect(existsSync(join(current, "worker-receipts/live-other.json"))).toBe(
      true,
    );
    expect(existsSync(join(current, "worker-receipts/alias.json"))).toBe(false);
    expect(existsSync(join(current, "active/live.json"))).toBe(false);
    expect(readFileSync(join(current, "runs.jsonl"), "utf8")).toBe(
      '{"run_id":"dead"}\n',
    );
    for (const name of [
      "active/live.progress.json",
      "worker-receipts/live.json",
      "worker-receipts/live.last.txt",
      "briefs/live.md",
      "nested/live/output.txt",
    ])
      expect(readFileSync(join(previous, name), "utf8")).toBe(
        "private live bytes",
      );
    worker.kill();
    await worker.exited;
    const complete = await runCli(base);
    expect(complete.exit).toBe(0);
    expect(existsSync(previous)).toBe(false);
    expect(readFileSync(join(current, "runs.jsonl"), "utf8")).toBe(
      '{"run_id":"dead"}\n{"run_id":"live"}\n',
    );
    expect((await runCli(base)).stdout).toContain("nothing to do");
  }).finally(() => {
    worker.kill();
  });
});

test("wait polls every 30 seconds, reports ids, and merges after exit", async () => {
  const { base, previous, current } = fixture();
  const path = join(previous, "active/live.json");
  marker(path, "live");
  const messages: string[] = [];
  const sleeps: number[] = [];
  let elapsed = 0;
  const result = await migrateState(base, {
    wait: true,
    now: () => elapsed,
    report: (text) => {
      messages.push(text);
    },
    sleep: (ms) => {
      sleeps.push(ms);
      elapsed += ms;
      if (sleeps.length === 2) marker(path, "live", 2147483647);
      return Promise.resolve();
    },
  });
  expect(sleeps).toEqual([30000, 30000]);
  expect(messages).toEqual([
    "WAIT: live run ids: live",
    "WAIT: live run ids: live",
  ]);
  expect(result).toContain("OK: merged");
  expect(existsSync(join(current, "active/live.json"))).toBe(true);
});

test("wait cap returns partial and does not oversleep the deadline", async () => {
  const { base, previous } = fixture();
  marker(join(previous, "active/live.json"), "live");
  const sleeps: number[] = [];
  let elapsed = 0;
  const result = await migrateState(base, {
    wait: true,
    waitMaxSeconds: 31,
    now: () => elapsed,
    sleep: (ms) => {
      sleeps.push(ms);
      elapsed += ms;
      return Promise.resolve();
    },
  });
  expect(sleeps).toEqual([30000, 1000]);
  expect(result).toContain("PARTIAL:");
  expect(existsSync(previous)).toBe(true);
  const cliResult = await runCli(base, ["--wait", "--wait-max", "0"]);
  expect(cliResult.exit).toBe(3);
});

test("CLI prints wait ids before a capped wait", async () => {
  const { base, previous } = fixture();
  marker(join(previous, "active/live.json"), "live");
  const result = await runCli(base, ["--wait", "--wait-max", "0.01"]);
  expect(result.exit).toBe(3);
  expect(result.stdout).toContain("WAIT: live run ids: live");
});

test("default wait cap is four hours", async () => {
  const { base, previous } = fixture();
  marker(join(previous, "active/live.json"), "live");
  let elapsed = 0;
  let polls = 0;
  const result = await migrateState(base, {
    wait: true,
    now: () => elapsed,
    sleep: (ms) => {
      elapsed += ms;
      polls++;
      return Promise.resolve();
    },
  });
  expect(elapsed).toBe(14400000);
  expect(polls).toBe(480);
  expect(result).toContain("PARTIAL:");
});

test("refuses corrupt run markers before touching any state", async () => {
  const { base, previous, current } = fixture();
  put(join(previous, "active/broken.json"), "invalid json");
  put(join(previous, "runs.jsonl"), "a\n");
  expect(await migrateState(base)).toContain("unreadable run marker");
  expect(existsSync(current)).toBe(false);
});

for (const name of [
  "runs.jsonl",
  "briefs/hash.md",
  "worker-receipts/dead.json",
]) {
  test(`process crash before rename of ${name} leaves source intact and rerun completes`, async () => {
    const { base, previous, current } = fixture();
    const old = name.endsWith(".jsonl") ? "old\n" : "old";
    put(join(previous, name), old);
    if (name.endsWith(".jsonl")) put(join(current, name), "new\n");
    const before = existsSync(join(current, name))
      ? readFileSync(join(current, name), "utf8")
      : undefined;
    const script = `import { migrateState } from ${JSON.stringify(cliPath)}; await migrateState(${JSON.stringify(base)}, { beforeRename: () => { process.exit(99); } });`;
    const child = Bun.spawn([process.execPath, "-e", script], {
      env: { ...process.env, HOME: base, XDG_STATE_HOME: base },
      stdout: "ignore",
      stderr: "ignore",
      timeout: 5000,
    });
    expect(await child.exited).toBe(99);
    expect(readFileSync(join(previous, name), "utf8")).toBe(old);
    expect(existsSync(join(current, `${name}.agx-migrate.tmp`))).toBe(true);
    if (before === undefined)
      expect(existsSync(join(current, name))).toBe(false);
    else expect(readFileSync(join(current, name), "utf8")).toBe(before);
    expect(await migrateState(base)).toContain("OK: merged");
    expect(existsSync(previous)).toBe(false);
    expect(existsSync(join(current, `${name}.agx-migrate.tmp`))).toBe(false);
    expect(readFileSync(join(current, name), "utf8")).toBe(
      name.endsWith(".jsonl") ? "new\nold\n" : old,
    );
    expect(await migrateState(base)).toContain("nothing to do");
  });
}

test("invalid wait bounds and unexpected flags are refused", async () => {
  const { base, previous } = fixture();
  mkdirSync(previous);
  for (const waitMaxSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(await migrateState(base, { waitMaxSeconds })).toContain(
      "--wait-max",
    );
  expect((await runCli(base, ["--wait-max", "-1"])).exit).toBe(1);
  expect((await runCli(base, ["--unexpected"])).exit).not.toBe(0);
  expect((await runCli(base, ["--__proto__"])).exit).toBe(2);
  expect((await runCli(base, ["unexpected"])).exit).toBe(2);
});

for (const name of [
  "route-capability.json",
  "imported-record.json",
  "stats-cache.json",
  "cache/probe.json",
  "other.json",
]) {
  for (const winner of ["previous", "current", "tie"] as const) {
    test(`mutable ${name} keeps ${winner === "tie" ? "current on tied mtime" : winner}`, async () => {
      const { base, previous, current } = fixture();
      put(join(previous, name), '{"version":1}');
      put(join(current, name), '{"version":2}');
      const oldTime = winner === "previous" ? 2000 : 1000;
      const newTime = winner === "current" ? 2000 : 1000;
      utimesSync(join(previous, name), oldTime, oldTime);
      utimesSync(join(current, name), newTime, newTime);
      expect((await runCli(base)).exit).toBe(0);
      expect(readFileSync(join(current, name), "utf8")).toBe(
        winner === "previous" ? '{"version":1}' : '{"version":2}',
      );
      expect(statSync(join(current, name)).mtimeMs).toBe(
        Math.max(oldTime, newTime) * 1000,
      );
      expect(existsSync(previous)).toBe(false);
      expect(await migrateState(base)).toContain("nothing to do");
    });
  }
}

test("copies an absent singleton cache even when its JSON is unreadable", async () => {
  const { base, previous, current } = fixture();
  put(join(previous, "route-capability.json"), "corrupt cache");
  expect(await migrateState(base)).toContain("OK: merged");
  expect(readFileSync(join(current, "route-capability.json"), "utf8")).toBe(
    "corrupt cache",
  );
});

test("skips old lock files and lock directory contents without touching current locks", async () => {
  const { base, previous, current } = fixture();
  const names = [
    "router.lock",
    "lock.json",
    "probe.lock.json",
    ".lock/owner.json",
  ];
  for (const name of names) put(join(previous, name), "old lock");
  put(join(current, "router.lock"), "current lock");
  expect((await runCli(base)).exit).toBe(0);
  expect(readFileSync(join(current, "router.lock"), "utf8")).toBe(
    "current lock",
  );
  for (const name of names.slice(1))
    expect(existsSync(join(current, name))).toBe(false);
  expect(existsSync(previous)).toBe(false);
});

test("discards unfinished write siblings while leaving current temporary files alone", async () => {
  const { base, previous, current } = fixture();
  const first = "imported-record.json.123.tmp";
  const names = [
    first,
    "briefs/hash.md.123.tmp",
    "active/dead.progress.json.123.tmp",
  ];
  for (const name of names) put(join(previous, name), "old unfinished write");
  put(join(current, first), "current unfinished write");
  expect(await migrateState(base)).toContain("OK: merged");
  expect(readFileSync(join(current, first), "utf8")).toBe(
    "current unfinished write",
  );
  for (const name of names.slice(1))
    expect(existsSync(join(current, name))).toBe(false);
  expect(existsSync(previous)).toBe(false);
});

for (const [old, currentValue, expected] of [
  [9, 4, 9],
  [3, 8, 8],
] as const) {
  test(`counter keeps maximum ${expected} regardless of mtime`, async () => {
    const { base, previous, current } = fixture();
    for (const name of ["run-counter.json", "sequence", "numeric-state.json"]) {
      put(join(previous, name), String(old));
      put(join(current, name), String(currentValue));
      utimesSync(join(previous, name), 1000, 1000);
      utimesSync(join(current, name), 2000, 2000);
    }
    expect((await runCli(base)).exit).toBe(0);
    for (const name of ["run-counter.json", "sequence", "numeric-state.json"])
      expect(readFileSync(join(current, name), "utf8")).toBe(`${expected}\n`);
    expect(existsSync(previous)).toBe(false);
  });
}

test("counter maps take per-key maxima and preserve keys from both directories", async () => {
  const { base, previous, current } = fixture();
  put(
    join(previous, "counters.json"),
    '{"runs":9,"incidents":2,"old-only":4,"__proto__":7}',
  );
  put(join(current, "counters.json"), '{"runs":4,"incidents":8,"new-only":6}');
  expect(await migrateState(base)).toContain("OK: merged");
  expect(readFileSync(join(current, "counters.json"), "utf8")).toBe(
    '{"runs":9,"incidents":8,"old-only":4,"__proto__":7,"new-only":6}\n',
  );
});

test("unreadable counters do not refuse and keep the valid copy", async () => {
  const { base, previous, current } = fixture();
  put(join(previous, "old-counter.json"), "corrupt");
  put(join(current, "old-counter.json"), "12");
  put(join(previous, "new-counter.json"), "8");
  put(join(current, "new-counter.json"), "corrupt");
  expect(await migrateState(base)).toContain("OK: merged");
  expect(readFileSync(join(current, "old-counter.json"), "utf8")).toBe("12\n");
  expect(readFileSync(join(current, "new-counter.json"), "utf8")).toBe("8\n");
});

test("incompatible counter snapshots keep the newer copy with a warning", async () => {
  const { base, previous, current } = fixture();
  put(join(previous, "counter.json"), "9");
  put(join(current, "counter.json"), '{"runs":5}');
  utimesSync(join(previous, "counter.json"), 1000, 1000);
  utimesSync(join(current, "counter.json"), 2000, 2000);
  const messages: string[] = [];
  expect(
    await migrateState(base, {
      report: (message) => {
        messages.push(message);
      },
    }),
  ).toContain("OK: merged");
  expect(messages[0]).toContain("WARN:");
  expect(readFileSync(join(current, "counter.json"), "utf8")).toBe(
    '{"runs":5}',
  );
});

test("retains shared mutable state and locks until live old runs exit", async () => {
  const { base, previous, current } = fixture();
  marker(join(previous, "active/live.json"), "live");
  for (const name of ["route-capability.json", "counter.json", "router.lock"])
    put(join(previous, name), "9");
  expect(await migrateState(base)).toContain("PARTIAL:");
  for (const name of ["route-capability.json", "counter.json", "router.lock"])
    expect(readFileSync(join(previous, name), "utf8")).toBe("9");
  expect(existsSync(join(current, "router.lock"))).toBe(false);
  marker(join(previous, "active/live.json"), "live", 2147483647);
  expect(await migrateState(base)).toContain("OK: merged");
  expect(existsSync(previous)).toBe(false);
});

test("mutable policies preserve strict conflicts for per-run and content-addressed JSON", async () => {
  for (const name of [
    "worker-receipts/cache.json",
    "briefs/counter.json",
    `${"a".repeat(64)}.json`,
    "per-run.json",
  ]) {
    const { base, previous, current } = fixture();
    put(join(previous, name), '{"run_id":"dead","counter":1}');
    put(join(current, name), '{"run_id":"dead","counter":2}');
    expect(await migrateState(base)).toContain(
      `conflicting state file ${join(current, name)}`,
    );
  }
});

test("numeric JSONL and JSONL names containing cache or counter still use append-only union", async () => {
  const { base, previous, current } = fixture();
  for (const name of ["runs.jsonl", "counter.jsonl", "cache.jsonl"]) {
    put(join(previous, name), "9\n");
    put(join(current, name), "4\n");
  }
  expect(await migrateState(base)).toContain("OK: merged");
  for (const name of ["runs.jsonl", "counter.jsonl", "cache.jsonl"])
    expect(readFileSync(join(current, name), "utf8")).toBe("4\n9\n");
});

for (const name of ["route-capability.json", "counter.json"]) {
  test(`mutable ${name} recovers from a process crash before rename`, async () => {
    const { base, previous, current } = fixture();
    put(join(previous, name), "9");
    put(join(current, name), "4");
    utimesSync(join(previous, name), 2000, 2000);
    utimesSync(join(current, name), 1000, 1000);
    const script = `import { migrateState } from ${JSON.stringify(cliPath)}; await migrateState(${JSON.stringify(base)}, { beforeRename: () => { process.exit(99); } });`;
    const child = Bun.spawn([process.execPath, "-e", script], {
      env: { ...process.env, HOME: base, XDG_STATE_HOME: base },
      stdout: "ignore",
      stderr: "ignore",
      timeout: 5000,
    });
    expect(await child.exited).toBe(99);
    expect(readFileSync(join(previous, name), "utf8")).toBe("9");
    expect(readFileSync(join(current, name), "utf8")).toBe("4");
    expect(await migrateState(base)).toContain("OK: merged");
    expect(readFileSync(join(current, name), "utf8").trim()).toBe("9");
    expect(existsSync(join(current, `${name}.agx-migrate.tmp`))).toBe(false);
    expect(await migrateState(base)).toContain("nothing to do");
  });
}
