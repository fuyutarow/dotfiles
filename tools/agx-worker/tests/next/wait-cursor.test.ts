import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordCursor } from "../../src/next/store.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
const started = {
  kind: "started",
  id: "idle",
  at: "2026-10-17T00:00:00Z",
  ticket: "wait-cursor",
  writes: [],
  cwd: tmpdir(),
  workspace: tmpdir(),
  row: "terra-high",
  dispatcher_session: null,
  vendor_session: null,
  pid: process.pid,
};
const ended = {
  kind: "ended",
  id: "idle",
  at: "2026-10-17T00:01:00Z",
  exit: 0,
  report_path: null,
  vendor_session: null,
  verify: [],
};
const line = (value: object) => `${JSON.stringify(value)}\n`;

test("wait cursor reads only appended bytes across N appends, including partial UTF-8", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "agx-wait-cursor-"));
  roots.push(root);
  const path = join(root, "records.jsonl");
  await fs.writeFile(path, line(started));
  const observers: (() => { position: number; length: number }[])[] = [];
  const reads = () => observers.flatMap((observe) => observe());
  const clear = () => {
    observers.length = 0;
  };
  const originalOpen = fs.open;
  const opened = spyOn(fs, "open").mockImplementation(async (...args) => {
    const file = await originalOpen(...args);
    const observed = spyOn(file, "read");
    observers.push(() =>
      observed.mock.calls.flatMap(([options]) =>
        options !== undefined &&
        typeof options.position === "number" &&
        options.length !== undefined
          ? [{ position: options.position, length: options.length }]
          : [],
      ),
    );
    return file;
  });
  const cursor = recordCursor(root);
  expect((await cursor.read())[0]?.state).toBe("running");
  clear();
  await cursor.read();
  expect(reads()).toEqual([]);
  let position = Buffer.byteLength(line(started));
  // N counts progress records, each split across two byte-appending writes.
  const n = 20;
  for (let i = 0; i < n; i++) {
    const bytes = Buffer.from(
      line({ kind: "progress", id: "idle", at: "now", path: `日本語-${i}` }),
    );
    const split = bytes.indexOf(Buffer.from("本")) + 1;
    for (const part of [bytes.subarray(0, split), bytes.subarray(split)]) {
      await fs.appendFile(path, part);
      clear();
      await cursor.read();
      expect(reads()).toEqual([{ position, length: part.length }]);
      position += part.length;
    }
  }
  await fs.appendFile(path, line(ended));
  clear();
  expect((await cursor.read())[0]?.state).toBe("ended");
  expect(reads()).toEqual([
    { position, length: Buffer.byteLength(line(ended)) },
  ]);
  opened.mockRestore();
  await fs.rename(path, join(root, "old.jsonl"));
  await fs.writeFile(path, line(started));
  expect((await cursor.read())[0]?.state).toBe("running");
  await fs.writeFile(path, "");
  expect(await cursor.read()).toEqual([]);
  expect((await fs.readdir(root)).toSorted()).toEqual([
    "old.jsonl",
    "records.jsonl",
  ]);
});

test("wait returns promptly after terminal record following N appends", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "agx-wait-notify-"));
  roots.push(root);
  const path = join(root, "records.jsonl");
  await fs.writeFile(path, line(started));
  const child = Bun.spawn(
    [
      process.execPath,
      "tools/agx-worker/src/next/cli.ts",
      "ls",
      "--wait",
      "idle",
      "--json",
    ],
    {
      env: {
        ...process.env,
        AGX_NEXT_STATE_DIR: root,
        AGX_WAIT_POLL_MS: "60000",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10000,
    },
  );
  // Allow startup; the 60s fallback cannot satisfy this test's 10s deadline.
  await Bun.sleep(500);
  for (let i = 0; i < 20; i++) {
    await fs.appendFile(
      path,
      line({ kind: "progress", id: "idle", at: "now", path: `${i}` }),
    );
    await Bun.sleep(10);
  }
  const before = performance.now();
  await fs.appendFile(path, line(ended));
  expect(await child.exited).toBe(0);
  expect(performance.now() - before).toBeLessThan(1000);
  expect(await new Response(child.stdout).text()).toContain('"state":"ended"');
});

test("unavailable watchers use a fallback no faster than five seconds", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "agx-wait-fallback-"));
  roots.push(root);
  const path = join(root, "records.jsonl");
  await fs.writeFile(path, line(started));
  const preload = join(root, "no-watch.ts");
  const waiting = join(root, "fallback-waiting");
  await fs.writeFile(
    preload,
    `import { mock } from "bun:test";
const fs = await import("node:fs");
mock.module("node:fs", () => ({ ...fs, watch: () => { throw new Error("no watch"); } }));
const files = await import("node:fs/promises");
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  const timer = originalTimeout(callback, delay, ...args);
  if (delay === 5000) void files.writeFile(${JSON.stringify(waiting)}, "waiting");
  return timer;
};
`,
  );
  const before = performance.now();
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      preload,
      "tools/agx-worker/src/next/cli.ts",
      "ls",
      "--wait",
      "idle",
      "--json",
    ],
    {
      env: { ...process.env, AGX_NEXT_STATE_DIR: root, AGX_WAIT_POLL_MS: "1" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 9000,
    },
  );
  const deadline = performance.now() + 4000;
  while (!(await Bun.file(waiting).exists()) && performance.now() < deadline)
    await Bun.sleep(10);
  expect(await Bun.file(waiting).exists()).toBe(true);
  await fs.appendFile(path, line(ended));
  expect(await child.exited).toBe(0);
  expect(performance.now() - before).toBeGreaterThanOrEqual(5000);
  expect(performance.now() - before).toBeLessThan(7500);
}, 10000);
