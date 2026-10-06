// bun test for scripts/version-stores.ts — the keep-unless-proven-superseded predicate behind
// reclaim:toolchains' version-store step. Fixtures are throwaway HOME trees and a fake /proc.
import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  liveExecutables,
  readStore,
  releasesToRemove,
  type VersionStore,
} from "../version-stores.ts";

const STORE: VersionStore = {
  name: "tool",
  dir: ".tool/versions",
  pointer: ".local/bin/tool",
};
const NOW = 2_000_000_000;
const OLD = NOW - 10 * 86400;

/** A HOME with release files 1.0 (old) and 2.0 (old), the launcher pointing at 2.0. */
function fixture(): string {
  const home = mkdtempSync(join(tmpdir(), "version-stores-"));
  mkdirSync(join(home, STORE.dir), { recursive: true });
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  for (const v of ["1.0", "2.0"]) {
    const p = join(home, STORE.dir, v);
    writeFileSync(p, "");
    utimesSync(p, OLD, OLD);
  }
  symlinkSync(join(home, STORE.dir, "2.0"), join(home, STORE.pointer));
  return home;
}

const names = (rs: readonly { name: string }[]) => rs.map((r) => r.name);

describe("version stores", () => {
  test("the superseded, idle, old entry is removed; the current one is kept", () => {
    const home = fixture();
    const { releases, current } = readStore(home, STORE);
    expect(current).toBe("2.0");
    expect(
      names(
        releasesToRemove(releases, {
          current,
          live: [],
          nowSec: NOW,
          keepDays: 2,
        }),
      ),
    ).toEqual(["1.0"]);
    rmSync(home, { recursive: true, force: true });
  });

  test("an entry a live process executes is kept (a session started before the update)", () => {
    const home = fixture();
    const { releases, current } = readStore(home, STORE);
    const live = [join(home, STORE.dir, "1.0")];
    expect(
      releasesToRemove(releases, { current, live, nowSec: NOW, keepDays: 2 }),
    ).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  });

  test("an entry touched within KEEP_DAYS is kept", () => {
    const home = fixture();
    utimesSync(join(home, STORE.dir, "1.0"), NOW - 3600, NOW - 3600);
    const { releases, current } = readStore(home, STORE);
    expect(
      releasesToRemove(releases, {
        current,
        live: [],
        nowSec: NOW,
        keepDays: 2,
      }),
    ).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  });

  test("no resolvable pointer, or no process evidence, keeps everything", () => {
    const home = fixture();
    rmSync(join(home, STORE.pointer));
    const { releases, current } = readStore(home, STORE);
    expect(current).toBeUndefined();
    expect(
      releasesToRemove(releases, {
        current,
        live: [],
        nowSec: NOW,
        keepDays: 0,
      }),
    ).toEqual([]);
    expect(
      releasesToRemove(releases, {
        current: "2.0",
        live: undefined,
        nowSec: NOW,
        keepDays: 0,
      }),
    ).toEqual([]);
    rmSync(home, { recursive: true, force: true });
  });

  test("a directory entry is matched by a pointer that resolves INSIDE it (codex's layout)", () => {
    const home = mkdtempSync(join(tmpdir(), "version-stores-"));
    const store: VersionStore = { name: "c", dir: "rel", pointer: "current" };
    mkdirSync(join(home, "rel/0.1/bin"), { recursive: true });
    mkdirSync(join(home, "rel/0.2/bin"), { recursive: true });
    symlinkSync(join(home, "rel/0.2"), join(home, "current"));
    expect(readStore(home, store).current).toBe("0.2");
    rmSync(home, { recursive: true, force: true });
  });

  test("liveExecutables reads /proc/<pid>/exe, strips ' (deleted)', and is undefined without /proc", () => {
    const proc = mkdtempSync(join(tmpdir(), "fake-proc-"));
    mkdirSync(join(proc, "42"));
    symlinkSync("/opt/tool/1.0 (deleted)", join(proc, "42", "exe"));
    mkdirSync(join(proc, "self"));
    expect(liveExecutables(proc)).toEqual(["/opt/tool/1.0"]);
    expect(liveExecutables(join(proc, "missing"))).toBeUndefined();
    rmSync(proc, { recursive: true, force: true });
  });
});
