import { expect, test } from "bun:test";
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  collectProcesses,
  summarizeProcessFailures,
} from "../../src/lib/procs.ts";
import { procFixture } from "../fixtures/procs.ts";
import { tempRoot } from "../fixtures/temp.ts";
import { TerminalProgress } from "../../../shared/src/terminal-progress.ts";

test("40 EACCES fds yield one expected summary on TTY and pipes; verbose keeps detail", () => {
  const root = tempRoot("reclaim-diagnostics-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const denied = Array.from({ length: 40 }, (_, i) => `fd/${i + 10}`);
  const fixture = procFixture(root, "systemd", denied);
  for (const fd of denied) symlinkSync("/elsewhere", join(fixture.base, fd));
  for (const tty of [false, true]) {
    const lines: string[] = [];
    const progress = new TerminalProgress({
      tty,
      write: (text) => {
        lines.push(text);
      },
    });
    let verbose: string[] = [];
    const snapshot = collectProcesses({
      procRoot: fixture.procRoot,
      fs: fixture.fs,
      diagnostics: (summary, details) => {
        progress.message(summary);
        verbose = details;
      },
    });
    expect(lines).toHaveLength(tty ? 1 : 0);
    if (tty) {
      expect(lines[0]).toContain("40 fds (40 probes) in 1 processes");
      expect(lines[0]).toContain("expected, not a probe problem");
      expect(lines[0]).toContain("no effect on targets");
    }
    expect(verbose).toHaveLength(40);
    expect(snapshot.openPaths(root).unknown).toHaveLength(0);
    expect(summarizeProcessFailures(verbose)).toHaveLength(1);
    progress.finish();
  }
});

test("expected permission classification matches complete process names", () => {
  const summary = summarizeProcessFailures([
    "pid 1 fd/3: EACCES [comm=systemd-helper state=S uid_line=Uid: 1000]",
  ]);
  expect(summary).toHaveLength(1);
  expect(summary[0]).not.toContain("expected");
});
