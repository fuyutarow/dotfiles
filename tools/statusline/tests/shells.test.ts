import { afterAll, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  statSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanShells, shellLines } from "../src/shells.ts";
import { render } from "../src/format.ts";
import { ok } from "neverthrow";

const root = mkdtempSync(join(tmpdir(), "shells-fixture-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
const uid = process.getuid?.() ?? 0;
const cwd = "/project";
const sid = "abc-123";
const tasks = join(root, `claude-${uid}`, "-project", sid, "tasks");
const proc = join(root, "proc");
mkdirSync(tasks, { recursive: true });
mkdirSync(proc, { recursive: true });
const output = join(tasks, "running.output");
writeFileSync(output, "");
writeFileSync(join(tasks, "finished.output"), "");
for (const pid of ["10", "11"]) {
  mkdirSync(join(proc, pid, "fd"), { recursive: true });
  mkdirSync(join(proc, pid, "fdinfo"));
  symlinkSync(output, join(proc, pid, "fd", "1"));
  writeFileSync(join(proc, pid, "fdinfo", "1"), "flags:\t0100001\n");
}
const options = {
  proc,
  temp: root,
  uid,
  now: statSync(output).birthtimeMs + 90_000,
};

test("one row per writing task, not per holder; finished tasks absent", async () => {
  const scan = await scanShells(cwd, sid, options);
  expect(scan).toEqual({
    kind: "known",
    rows: [{ id: "running", seconds: 90 }],
  });
  expect(shellLines(scan)).toBe("shell 1m30s running");
  const frame = {
    cwd,
    model: "?",
    wfOn: false,
    rc: "off" as const,
    rlModel: [],
    vram: undefined,
    disks: ok([]),
    cpuPct: ok(0),
    ram: ok({ frac: "0/1G", pct: 0 }),
    shells: scan,
  };
  expect(render(frame, { layout: "block" })).toContain("shell 1m30s running");
});
test("read-only holders do not create running rows", async () => {
  writeFileSync(join(proc, "10", "fdinfo", "1"), "flags:\t0100000\n");
  writeFileSync(join(proc, "11", "fdinfo", "1"), "flags:\t0100000\n");
  const scan = await scanShells(cwd, sid, options);
  expect(scan).toEqual({ kind: "known", rows: [] });
  expect(shellLines(scan)).toBe("");
});
test("unreadable source remains unknown", async () => {
  const scan = await scanShells(cwd, sid, {
    ...options,
    proc: join(root, "missing"),
  });
  expect(shellLines(scan)).toBe("shells: unknown");
});
