import { afterEach, expect, test } from "bun:test";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const started = (id: string, ticket: string, pid: number) => ({
  kind: "started",
  id,
  at: "2026-10-15T10:00:00Z",
  ticket,
  writes: [],
  cwd: tmpdir(),
  workspace: tmpdir(),
  row: "luna-high",
  dispatcher_session: null,
  vendor_session: null,
  pid,
});
const ended = (id: string) => ({
  kind: "ended",
  id,
  at: "2026-10-15T10:05:00Z",
  exit: 0,
  report_path: null,
  vendor_session: null,
  verify: [],
});
const lines = (events: readonly object[]): string =>
  `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;

// Test data lives in the OS temp dir, never in the workspace.
const fixture = (events: readonly object[]): string => {
  const root = mkdtempSync(join(tmpdir(), "agx-ls-wait-"));
  roots.push(root);
  mkdirSync(join(root, "state"));
  writeFileSync(join(root, "state", "records.jsonl"), lines(events));
  return root;
};

const deadPid = (): number => Bun.spawnSync(["true"]).pid;
const spawnWait = async (root: string, ...args: string[]) => {
  const ready = join(root, "ready");
  const preload = join(root, "ready.ts");
  await Bun.write(
    preload,
    `const timeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { Bun.write(${JSON.stringify(ready)}, "ready"); return timeout(...args); };
`,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      preload,
      "tools/agx-worker/src/next/cli.ts",
      "ls",
      "--wait",
      ...args,
    ],
    {
      timeout: 15000,
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        AGX_NEXT_STATE_DIR: join(root, "state"),
        AGX_WAIT_POLL_MS: "50",
      },
    },
  );
  const deadline = performance.now() + 10000;
  while (
    !(await Bun.file(ready).exists()) &&
    child.exitCode === null &&
    performance.now() < deadline
  )
    await Bun.sleep(20);
  return child;
};
const Rows = jsonOf(z.array(z.object({ id: z.string(), state: z.string() })));

test("--wait on a running run returns its row after an ended record is appended", async () => {
  const root = fixture([started("run-live", "live", process.pid)]);
  const child = await spawnWait(root, "run-live", "--json");
  expect(child.exitCode).toBeNull();
  appendFileSync(
    join(root, "state", "records.jsonl"),
    lines([ended("run-live")]),
  );
  expect(await child.exited).toBe(0);
  const rows = Rows.safeParse(await new Response(child.stdout).text());
  expect(rows.success && rows.data).toEqual([
    { id: "run-live", state: "ended" },
  ]);
}, 30_000);

test("--wait on an already-ended run returns at once, in ls format", async () => {
  const root = fixture([started("run-done", "done", 0), ended("run-done")]);
  const child = await spawnWait(root, "run-done");
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toContain(
    "run-done ended tkt_done row=luna-high exit=0",
  );
}, 30_000);

test("--wait on a ticket ignores old ended runs and waits for its running run", async () => {
  const root = fixture([
    started("run-old", "ticket", 0),
    ended("run-old"),
    started("run-old-orphaned", "ticket", deadPid()),
    started("run-live", "ticket", process.pid),
  ]);
  const child = await spawnWait(root, "ticket", "--json");
  expect(child.exitCode).toBeNull();
  appendFileSync(
    join(root, "state", "records.jsonl"),
    lines([ended("run-live")]),
  );
  expect(await child.exited).toBe(0);
  const rows = Rows.safeParse(await new Response(child.stdout).text());
  expect(rows.success && rows.data).toEqual([
    { id: "run-live", state: "ended" },
  ]);
}, 30_000);

test("--wait on a ticket with only old ended runs waits for a new run to end", async () => {
  const root = fixture([started("run-old", "ticket", 0), ended("run-old")]);
  const child = await spawnWait(root, "ticket", "--json");
  expect(child.exitCode).toBeNull();
  appendFileSync(
    join(root, "state", "records.jsonl"),
    lines([started("run-new", "ticket", process.pid), ended("run-new")]),
  );
  expect(await child.exited).toBe(0);
  const rows = Rows.safeParse(await new Response(child.stdout).text());
  expect(rows.success && rows.data).toEqual([
    { id: "run-new", state: "ended" },
  ]);
}, 30_000);

test("--wait returns a run whose process died without an ended record as ended lost", async () => {
  const root = fixture([started("run-gone", "gone", deadPid())]);
  const child = await spawnWait(root, "run-gone", "--json");
  expect(await child.exited).toBe(0);
  const rows = Rows.safeParse(await new Response(child.stdout).text());
  expect(rows.success && rows.data).toEqual([
    { id: "run-gone", state: "ended" },
  ]);
}, 30_000);

test("--wait on an unknown, ambiguous or missing selector fails at once", async () => {
  const root = fixture([
    started("run-a1", "a", process.pid),
    started("run-a2", "b", process.pid),
  ]);
  for (const args of [["nothing"], ["run-a"], []]) {
    const child = await spawnWait(root, ...args);
    expect(await child.exited).toBe(2);
    expect(await new Response(child.stderr).text()).toContain("agx:");
  }
}, 30_000);

test("--wait writes no file", async () => {
  const root = fixture([started("run-done", "done", 0), ended("run-done")]);
  const before = readFileSync(join(root, "state", "records.jsonl"), "utf8");
  await (
    await spawnWait(root, "run-done")
  ).exited;
  expect(readdirSync(join(root, "state"))).toEqual(["records.jsonl"]);
  expect(readFileSync(join(root, "state", "records.jsonl"), "utf8")).toBe(
    before,
  );
}, 30_000);
