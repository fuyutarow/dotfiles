// bun test for scripts/reclaim-rust-targets.ts — when a Rust target/ may be cleaned: built longer
// ago than the bar, and no cargo/rustc working inside it; no process evidence keeps everything.
import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCwds,
  lastBuilt,
  targetsToClean,
} from "../reclaim-rust-targets.ts";

const NOW = 2_000_000_000;
const DAY = 86400;

describe("reclaim:rust predicate", () => {
  const targets = [
    { project: "/w/old", builtSec: NOW - 10 * DAY },
    { project: "/w/fresh", builtSec: NOW - DAY },
    { project: "/w/building", builtSec: NOW - 10 * DAY },
  ];

  test("only old and idle projects are cleaned", () => {
    expect(
      targetsToClean(targets, {
        nowSec: NOW,
        keepDays: 7,
        busy: ["/w/building/crates/x"],
      }),
    ).toEqual(["/w/old"]);
  });

  test("a sibling path is not mistaken for a running build (old ≠ old-fork)", () => {
    expect(
      targetsToClean([{ project: "/w/old", builtSec: 0 }], {
        nowSec: NOW,
        keepDays: 7,
        busy: ["/w/old-fork"],
      }),
    ).toEqual(["/w/old"]);
  });

  test("no process evidence (no /proc) keeps every target", () => {
    expect(
      targetsToClean(targets, { nowSec: NOW, keepDays: 7, busy: undefined }),
    ).toEqual([]);
  });
});

describe("reclaim:rust probes", () => {
  test("lastBuilt is the newest of target/ and its direct children", () => {
    const dir = mkdtempSync(join(tmpdir(), "rust-target-"));
    mkdirSync(join(dir, "debug"));
    utimesSync(dir, NOW - 10 * DAY, NOW - 10 * DAY);
    utimesSync(join(dir, "debug"), NOW - DAY, NOW - DAY);
    // the child's mtime was set after the parent's, but setting it does not touch the parent
    utimesSync(dir, NOW - 10 * DAY, NOW - 10 * DAY);
    expect(lastBuilt(dir)).toBe(NOW - DAY);
    expect(lastBuilt(join(dir, "missing"))).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("buildCwds reports only cargo/rustc processes, and is undefined without /proc", () => {
    const proc = mkdtempSync(join(tmpdir(), "fake-proc-"));
    for (const [pid, exe, cwd] of [
      ["10", "/usr/bin/cargo", "/w/a"],
      ["11", "/opt/rust/bin/rustc", "/w/b"],
      ["12", "/usr/bin/zsh", "/w/c"],
    ] as const) {
      mkdirSync(join(proc, pid));
      symlinkSync(exe, join(proc, pid, "exe"));
      symlinkSync(cwd, join(proc, pid, "cwd"));
    }
    expect(buildCwds(proc)?.toSorted((x, y) => x.localeCompare(y))).toEqual([
      "/w/a",
      "/w/b",
    ]);
    expect(buildCwds(join(proc, "missing"))).toBeUndefined();
    rmSync(proc, { recursive: true, force: true });
  });
});
