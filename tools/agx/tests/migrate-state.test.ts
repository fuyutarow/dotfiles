import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
