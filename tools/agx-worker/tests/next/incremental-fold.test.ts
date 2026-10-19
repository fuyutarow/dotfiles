import { appendFile } from "node:fs/promises";
import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  append,
  flushRunPublications,
  foldedRuns,
  fullFoldedRuns,
  recordPath,
  type NextEvent,
} from "../../src/next/store.ts";

import { list } from "../../src/next/run.ts";

const previous = process.env.AGX_NEXT_STATE_DIR;
const roots: string[] = [];
afterEach(async () => {
  await flushRunPublications();
  if (previous === undefined) delete process.env.AGX_NEXT_STATE_DIR;
  else process.env.AGX_NEXT_STATE_DIR = previous;
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
  const root = fs.mkdtempSync(join(tmpdir(), "agx-incremental-fold-"));
  roots.push(root);
  process.env.AGX_NEXT_STATE_DIR = root;
  return root;
};
const started = (id: string, pid = 2147483647): NextEvent => ({
  kind: "started",
  id,
  at: "2026-10-15T00:00:00Z",
  ticket: "incremental",
  writes: [],
  cwd: "/tmp",
  workspace: "/tmp",
  row: "terra-medium",
  dispatcher_session: null,
  vendor_session: null,
  pid,
});

test.each([127, 137])(
  "historical verify-failed exit %s is classified in full and cached folds",
  async (exit) => {
    const root = fixture();
    append(started("legacy-verify"));
    append({
      kind: "ended",
      id: "legacy-verify",
      at: "2026-10-15T00:01:00Z",
      exit: 0,
      outcome: "verify-failed",
      report_path: null,
      vendor_session: null,
      verify: [{ cmd: "check", exit, log_path: "check.log" }],
    });
    const kind = exit === 127 ? "unrunnable" : "killed";
    expect((await fullFoldedRuns())[0]?.verify[0]?.kind).toBe(kind);
    expect((await fullFoldedRuns())[0]?.outcome).toBe(`verify-${kind}`);
    expect(await foldedRuns()).toEqual(await fullFoldedRuns());
    expect(fs.existsSync(join(root, "records.fold.json"))).toBe(false);
    expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  },
);

test("seeded random append batches equal a full fold after every batch", async () => {
  fixture();
  let seed = 42;
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) % n;
  };
  const appendRandom = (batch: number) => {
    const id = `run-${random(20)}`;
    const kind = random(4);
    if (kind === 0) append(started(id));
    if (kind === 1)
      append({
        kind: "progress",
        id,
        at: "2026-10-15T00:00:01Z",
        path: `日本語-${batch}`,
      });
    if (kind === 2)
      append({
        kind: "ended",
        id,
        at: "2026-10-15T00:01:00Z",
        exit: random(2),
        report_path: null,
        vendor_session: null,
        verify: [
          {
            cmd: "check",
            exit: 0,
            log_path: "/tmp/check",
            future_field: "preserved",
          },
        ],
        returned: false,
        changed_files: 0,
      });
    if (kind === 3)
      append({
        kind: "judged",
        id,
        at: "2026-10-15T00:02:00Z",
        decision:
          ["accept", "reject", "landed", "ignored"][random(4)] ?? "accept",
        note: `batch-${batch}`,
      });
  };
  for (let batch = 0; batch < 150; batch++) {
    for (let i = 0, n = random(9) + 1; i < n; i++) {
      appendRandom(batch);
    }
    expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  }
}, 15_000);

test("warm fold reads exactly appended record bytes and zero for unchanged history", async () => {
  fixture();
  append(started("run"));
  for (let i = 0; i < 1000; i++)
    append({ kind: "progress", id: "run", at: "now", path: `${i}` });
  await flushRunPublications();
  await foldedRuns();
  const before = fs.statSync(recordPath()).size;
  // Simulate another writer without racing append()'s asynchronous snapshot publisher.
  await appendFile(
    recordPath(),
    `${JSON.stringify({ kind: "judged", id: "run", at: "now", decision: "accept", note: "tail" })}\n`,
  );
  const appended = fs.statSync(recordPath()).size - before;
  const read = spyOn(fs, "readSync");
  const whole = spyOn(fs, "readFileSync");
  const output = spyOn(process.stdout, "write").mockImplementation(() => true);
  expect(await list({ json: true })).toBe(0);
  expect(read.mock.calls).toHaveLength(1);
  expect(read.mock.calls[0]?.[2]?.length).toBe(appended);
  expect(read.mock.calls[0]?.[2]?.position).toBe(before);
  read.mockClear();
  await foldedRuns();
  expect(read.mock.calls).toHaveLength(0);
  expect(whole.mock.calls.some(([path]) => path === recordPath())).toBe(false);
  output.mockRestore();
  whole.mockRestore();
  read.mockRestore();
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
});

test("partial UTF-8 tail is reread, and rotation, truncation, corrupt cache and version changes rebuild", async () => {
  const root = fixture();
  append(started("first"));
  await foldedRuns();
  const tail = Buffer.from(
    JSON.stringify({
      kind: "progress",
      id: "first",
      at: "now",
      path: "日本語",
    }) + "\n",
  );
  const split = tail.indexOf(Buffer.from("本")) + 1;
  fs.appendFileSync(recordPath(), tail.subarray(0, split));
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  expect(fs.existsSync(join(root, "records.fold.json"))).toBe(false);
  fs.appendFileSync(recordPath(), tail.subarray(split));
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  fs.renameSync(recordPath(), join(root, "rotated.jsonl"));
  append(started("rotated"));
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  fs.writeFileSync(recordPath(), "");
  expect(await foldedRuns()).toEqual([]);
  append(started("new"));
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  fs.writeFileSync(join(root, "records.fold.json"), '{"version":999}');
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  fs.writeFileSync(join(root, "records.fold.json"), "broken");
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
});

test("ls --running combines with JSON, all and selector; cached liveness is refreshed", async () => {
  const root = fixture();
  const child = Bun.spawn(
    [process.execPath, "-e", "setInterval(async () => {}, 1000)"],
    { stdout: "ignore", stderr: "ignore" },
  );
  append(started("live", child.pid));
  append(started("orphan"));
  append(started("ended", process.pid));
  append({
    kind: "ended",
    id: "ended",
    at: "2026-10-15T00:01:00Z",
    exit: 0,
    report_path: null,
    vendor_session: null,
    verify: [],
  });
  const ls = (args: string[]) =>
    Bun.spawnSync(
      [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", ...args],
      { env: { ...process.env, AGX_NEXT_STATE_DIR: root } },
    );
  const json = ls(["--running", "--json", "--all"]);
  expect(json.exitCode).toBe(0);
  expect(json.stdout.toString()).toContain('"id":"live"');
  expect(json.stdout.toString()).not.toContain('"id":"orphan"');
  expect(json.stdout.toString()).not.toContain('"id":"ended"');
  const human = ls(["incremental", "--running", "--all"]);
  expect(human.exitCode).toBe(0);
  expect(human.stdout.toString()).toContain("live running");
  expect(human.stdout.toString()).not.toContain("orphan");
  child.kill();
  await child.exited;
  expect(ls(["--running", "--json"]).stdout.toString()).toBe("[]\n");
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
});

test("unwritable snapshot falls back safely and malformed complete tail is rejected", async () => {
  const root = fixture();
  append(started("run"));
  fs.mkdirSync(join(root, "records.fold.json"));
  expect(await foldedRuns()).toEqual(await fullFoldedRuns());
  await flushRunPublications();
  expect(fs.readdirSync(root).some((name) => name.endsWith(".tmp"))).toBe(
    false,
  );
  fs.rmSync(join(root, "records.fold.json"), { recursive: true });
  await foldedRuns();
  fs.appendFileSync(recordPath(), '{"kind":"broken"}\n');
  const result = Bun.spawnSync(
    [process.execPath, "tools/agx-worker/src/next/cli.ts", "ls", "--json"],
    { env: { ...process.env, AGX_NEXT_STATE_DIR: root } },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("invalid record log line");
});
