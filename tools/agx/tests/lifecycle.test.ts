import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cpuSeconds,
  declaredFiles,
  fileFingerprint,
  processTreeCpu,
  StallObserver,
  workspaceRoot,
} from "../src/lifecycle.ts";
import { parseTicket } from "../src/ticket.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const scratch = (): string => {
  const root = mkdtempSync(join(tmpdir(), "agx-lifecycle-"));
  roots.push(root);
  return root;
};

test("stall_s is optional, accepts positive seconds, and rejects zero/negative/fractional values", () => {
  expect(parseTicket("+++\nschema = 1\nwrites = []\n+++\nwork").kind).toBe(
    "ticket",
  );
  expect(
    parseTicket("+++\nschema = 1\nwrites = []\nstall_s = 1\n+++\nwork"),
  ).toMatchObject({ kind: "ticket", ticket: { stall_s: 1 } });
  for (const seconds of [0, -1, 0.5])
    expect(
      parseTicket(
        `+++\nschema = 1\nwrites = []\nstall_s = ${seconds}\n+++\nwork`,
      ).kind,
    ).toBe("invalid");
});

test("CPU time parser handles BSD centiseconds and Linux day/hour clocks", () => {
  expect(cpuSeconds("2:03.45")).toBe(123.45);
  expect(cpuSeconds("01:02:03")).toBe(3723);
  expect(cpuSeconds("2-01:02:03")).toBe(176523);
});

test("canceled filesystem and CPU samples return unavailable without delaying exit", async () => {
  const root = scratch();
  writeFileSync(join(root, "note.txt"), "existing");
  const stopped = new AbortController();
  stopped.abort();
  expect(
    await declaredFiles(root, ["**"], { signal: stopped.signal }),
  ).toBeUndefined();
  expect(await processTreeCpu(process.pid, stopped.signal)).toBeUndefined();
});

test("snapshots prune tool-owned trees and stay within a declared prefix", async () => {
  const root = scratch();
  mkdirSync(join(root, "notes"));
  mkdirSync(join(root, "notes", "node_modules"));
  mkdirSync(join(root, "elsewhere"));
  writeFileSync(join(root, "notes", "own.txt"), "own");
  writeFileSync(join(root, "notes", "node_modules", "other.txt"), "other");
  writeFileSync(join(root, "elsewhere", "unrelated.txt"), "other");
  expect([
    ...((await declaredFiles(root, ["notes/**"]))?.keys() ?? []),
  ]).toEqual(["notes/own.txt"]);
});

test("one active input resets the stall window; missing CPU observation cannot stall", () => {
  const observer = new StallObserver(0);
  const processes = [{ pid: 1, ppid: 0, pgid: 1, cpu_s: 0 }];
  const files = new Map([["a.txt", { mtime_ms: 1, size: 1 }]]);
  expect(observer.observe(0, processes, files, "0").flat_s).toBe(0);
  expect(observer.observe(1000, processes, files, "0").flat_s).toBe(1);
  expect(
    observer.observe(
      1100,
      [{ ...processes[0], pid: 1, ppid: 0, pgid: 1, cpu_s: 1 }],
      files,
      "0",
    ).flat_s,
  ).toBe(0);
  expect(observer.observe(1200, processes, files, "1").flat_s).toBe(0);
  files.set("a.txt", { mtime_ms: 2, size: 1 });
  expect(observer.observe(1300, processes, files, "1").flat_s).toBe(0);
  expect(observer.observe(2400, undefined, files, "1")).toEqual({ flat_s: 0 });
  expect(observer.observe(4000, processes, files, "1").flat_s).toBe(0);
});

test("CPU accumulated by an exited child remains in the observed high-water total", () => {
  const observer = new StallObserver(0);
  observer.observe(
    0,
    [
      { pid: 1, ppid: 0, pgid: 1, cpu_s: 1 },
      { pid: 2, ppid: 1, pgid: 1, cpu_s: 5 },
    ],
    new Map(),
    "",
  );
  expect(
    observer.observe(
      1000,
      [{ pid: 1, ppid: 0, pgid: 1, cpu_s: 2 }],
      new Map(),
      "",
    ).inputs?.cpu_s,
  ).toBe(7);
});

test("declared file snapshots include existing ignored/hidden files and resolve from a workspace root", async () => {
  const root = scratch();
  mkdirSync(join(root, ".jj"));
  mkdirSync(join(root, "subdir"));
  mkdirSync(join(root, ".notes"));
  writeFileSync(join(root, ".notes", "note.txt"), "existing");
  expect(workspaceRoot(join(root, "subdir"))).toBe(root);
  const before = await declaredFiles(root, [".notes/**"]);
  expect([...(before?.keys() ?? [])]).toEqual([".notes/note.txt"]);
  expect(before?.get(".notes/note.txt")?.size).toBe(8);
  writeFileSync(join(root, ".notes", "note.txt"), "new content");
  expect(
    fileFingerprint((await declaredFiles(root, [".notes/**"])) ?? new Map()),
  ).not.toBe(fileFingerprint(before ?? new Map()));
});

test("process tree CPU inspection includes a child in a separate process group", async () => {
  const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(1500);"], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
    timeout: 3000,
  });
  const processes = await processTreeCpu(process.pid);
  if (processes !== undefined)
    expect(processes.map((p) => p.pid)).toContain(child.pid);
  await child.exited;
});
