import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
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
  const refusedFd = join(root, "proc-refused", "21", "fd");
  if (existsSync(refusedFd)) chmodSync(refusedFd, 0o755);
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
// Live cause: /proc/<pid>/fd of a non-dumpable same-UID process (sshd-session,
// ssh-agent) is refused with EACCES; that used to turn the whole scan unknown.
test.skipIf(uid === 0)(
  "refused non-dumpable process is skipped, writer row kept",
  async () => {
    const refusedProc = join(root, "proc-refused");
    mkdirSync(join(refusedProc, "20", "fd"), { recursive: true });
    mkdirSync(join(refusedProc, "20", "fdinfo"));
    symlinkSync(output, join(refusedProc, "20", "fd", "1"));
    writeFileSync(join(refusedProc, "20", "fdinfo", "1"), "flags:\t0100001\n");
    mkdirSync(join(refusedProc, "21", "fd"), { recursive: true });
    chmodSync(join(refusedProc, "21", "fd"), 0o000);
    const scan = await scanShells(cwd, sid, { ...options, proc: refusedProc });
    expect(scan).toEqual({
      kind: "known",
      rows: [{ id: "running", seconds: 90 }],
    });
  },
);
// Over FD_LIMIT (256) descriptors: the process is skipped (documented blind spot),
// the scan stays known, and a holder in a small process still renders.
test("over-cap descriptor list is skipped, other holders still render", async () => {
  const capProc = join(root, "proc-cap");
  mkdirSync(join(capProc, "30", "fd"), { recursive: true });
  for (let fd = 0; fd <= 256; fd += 1)
    symlinkSync("/dev/null", join(capProc, "30", "fd", String(fd)));
  mkdirSync(join(capProc, "31", "fd"), { recursive: true });
  mkdirSync(join(capProc, "31", "fdinfo"));
  symlinkSync(output, join(capProc, "31", "fd", "1"));
  writeFileSync(join(capProc, "31", "fdinfo", "1"), "flags:\t0100001\n");
  const scan = await scanShells(cwd, sid, { ...options, proc: capProc });
  expect(scan).toEqual({
    kind: "known",
    rows: [{ id: "running", seconds: 90 }],
  });
});
