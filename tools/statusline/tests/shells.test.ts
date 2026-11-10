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
import {
  commandFromWrapper,
  compactCommand,
  scanShells,
  shellLines,
} from "../src/shells.ts";
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
  expect(shellLines(scan)).toBe("sh_running 1m30s");
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
  expect(render(frame, { layout: "block" })).toContain("sh_running 1m30s");
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
  expect(shellLines(scan)).toBe("shells: unknown (/proc unreadable: ENOENT)");
});
test("every unknown names its cause", async () => {
  expect(await scanShells(undefined, sid, options)).toEqual({
    kind: "unknown",
    reason: "session cwd unknown",
  });
  expect(await scanShells(cwd, undefined, options)).toEqual({
    kind: "unknown",
    reason: "session id unknown",
  });
  expect(shellLines(await scanShells(cwd, "../x", options))).toBe(
    "shells: unknown (session id has characters outside [a-zA-Z0-9-])",
  );
});
// The task directory is never listed, so its size cannot hide a running shell.
test("a tasks directory over the old 2048-entry cap still shows its running shell", async () => {
  const bigRoot = join(root, "big");
  const bigTasks = join(bigRoot, `claude-${uid}`, "-project", sid, "tasks");
  mkdirSync(bigTasks, { recursive: true });
  for (let i = 0; i < 3000; i += 1)
    writeFileSync(join(bigTasks, `done-${i}.output`), "");
  const held = join(bigTasks, "running.output");
  writeFileSync(held, "");
  const bigProc = join(bigRoot, "proc");
  mkdirSync(join(bigProc, "50", "fd"), { recursive: true });
  mkdirSync(join(bigProc, "50", "fdinfo"));
  symlinkSync(held, join(bigProc, "50", "fd", "1"));
  writeFileSync(join(bigProc, "50", "fdinfo", "1"), "flags:\t0100001\n");
  const scan = await scanShells(cwd, sid, {
    proc: bigProc,
    temp: bigRoot,
    uid,
    now: statSync(held).birthtimeMs + 90_000,
  });
  expect(scan.kind).toBe("known");
  expect(shellLines(scan)).toBe("sh_running 1m30s");
});
test("a /proc listing over the cap is unknown with its reason", async () => {
  const hugeProc = join(root, "proc-huge");
  mkdirSync(hugeProc, { recursive: true });
  for (let pid = 1; pid <= 8193; pid += 1)
    writeFileSync(join(hugeProc, String(pid)), "");
  expect(
    shellLines(await scanShells(cwd, sid, { ...options, proc: hugeProc })),
  ).toBe("shells: unknown (/proc has more than 8192 entries)");
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

const wrapperArgv = (command: string) =>
  `/usr/bin/zsh -c source /home/fuyu/.claude/shell-snapshots/snapshot-zsh-1-x.sh 2>/dev/null || true && setopt NO_EXTENDED_GLOB NO_BARE_GLOB_QUAL 2>/dev/null || true && eval '${command}' < /dev/null && pwd -P >| /tmp/claude-1000/-home-fuyu-dotfiles/cwd-1.txt`;
const dispatch =
  "bun /tmp/claude-1000/-home-fuyu-dotfiles/2c05f20d-6268-446b-96dd-bb19296924e5/scratchpad/dispatch-when-calm.ts /home/fuyu/dotfiles/.agents/tickets/mise-gc-task-dotfiles-1110.md";

test("wrapper argv yields the user's command; the wrapper text is stripped", () => {
  expect(commandFromWrapper(wrapperArgv(dispatch))).toBe(dispatch);
  expect(commandFromWrapper(wrapperArgv("echo 'it'\\''s'"))).toBe(
    "echo 'it's'",
  );
  expect(commandFromWrapper("/usr/bin/zsh -c sleep 100")).toBeUndefined();
  expect(
    commandFromWrapper(
      "/usr/bin/zsh -c source /home/x/shell-snapshots/s.sh && eval 'sleep 1'",
    ),
  ).toBeUndefined();
});

test("a readable wrapper labels its row; a plain holder keeps the task id", async () => {
  const cmdProc = join(root, "proc-cmd");
  mkdirSync(join(cmdProc, "40", "fd"), { recursive: true });
  mkdirSync(join(cmdProc, "40", "fdinfo"));
  symlinkSync(output, join(cmdProc, "40", "fd", "1"));
  writeFileSync(join(cmdProc, "40", "fdinfo", "1"), "flags:\t0100001\n");
  writeFileSync(join(cmdProc, "40", "cmdline"), wrapperArgv(dispatch));
  mkdirSync(join(cmdProc, "41", "fd"), { recursive: true });
  mkdirSync(join(cmdProc, "41", "fdinfo"));
  symlinkSync(output, join(cmdProc, "41", "fd", "1"));
  writeFileSync(join(cmdProc, "41", "fdinfo", "1"), "flags:\t0100001\n");
  writeFileSync(join(cmdProc, "41", "cmdline"), "sleep\u0000100\u0000");
  const scan = await scanShells(cwd, sid, { ...options, proc: cmdProc });
  expect(scan).toEqual({
    kind: "known",
    rows: [
      {
        id: "running",
        seconds: 90,
        command: dispatch,
      },
    ],
  });
  expect(shellLines(scan, 200)).toBe(
    "sh_running 1m30s bun dispatch-when-calm.ts mise-gc-task-dotfiles-1110.md",
  );
});

test("compaction shortens paths, cuts at whole tokens, and never inside one", () => {
  const long =
    "bun /a/b/dispatch-when-calm.ts /home/fuyu/x/mise-gc-task-dotfiles-1110.md";
  expect(compactCommand(long, 200)).toBe(
    "bun dispatch-when-calm.ts mise-gc-task-dotfiles-1110.md",
  );
  expect(compactCommand(long, 40)).toBe("bun dispatch-when-calm.ts …");
  expect(compactCommand(long, 20)).toBe("bun …");
  expect(compactCommand(long, 3)).toBeUndefined();
  expect(compactCommand("'/x/y/a.md'", 40)).toBe("'a.md'");
  expect(compactCommand("cd /", 40)).toBe("cd /");
  const shortTokens = [
    "bun",
    "dispatch-when-calm.ts",
    "mise-gc-task-dotfiles-1110.md",
  ];
  for (const budget of [4, 10, 25, 33, 60]) {
    const label = compactCommand(long, budget);
    if (label === undefined) continue;
    expect(Array.from(label).length).toBeLessThanOrEqual(budget);
    // Whatever survives is a whole-token prefix of the shortened command.
    const kept = label.replace(/ …$/u, "");
    expect(
      shortTokens.some(
        (_, k) => shortTokens.slice(0, k + 1).join(" ") === kept,
      ),
    ).toBe(true);
  }
});

test("task prefixes distinguish identical commands and command budgets include the prefix", () => {
  const scan = {
    kind: "known" as const,
    rows: [
      { id: "aaa", seconds: 120, command: dispatch },
      { id: "bbb", seconds: 5, command: dispatch },
      { id: "ccc", seconds: 9, command: "sleep 100" },
      { id: "ddd", seconds: 9 },
    ],
  };
  const wide = shellLines(scan, 200).split("\n");
  expect(wide).toEqual([
    "sh_aaa 2m00s bun dispatch-when-calm.ts mise-gc-task-dotfiles-1110.md",
    "sh_bbb 0m05s bun dispatch-when-calm.ts mise-gc-task-dotfiles-1110.md",
    "sh_ccc 0m09s sleep 100",
    "sh_ddd 0m09s",
  ]);
  const narrow = shellLines(scan, 60).split("\n");
  expect(narrow[0]).toBe("sh_aaa 2m00s bun dispatch-when-calm.ts …");
  expect(narrow[2]).toBe("sh_ccc 0m09s sleep 100");
  for (const line of narrow)
    expect(Array.from(line).length).toBeLessThanOrEqual(60);
  expect(shellLines(scan, 15).split("\n")[0]).toBe("sh_aaa 2m00s");
});
