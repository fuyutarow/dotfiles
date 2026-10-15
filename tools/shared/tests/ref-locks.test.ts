import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownerlessRefLocks, REF_LOCK_STALE_MS } from "../src/ref-locks.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; lock: string } {
  const root = mkdtempSync(join(tmpdir(), "ref-locks-test-"));
  roots.push(root);
  mkdirSync(join(root, ".git", "refs", "heads"), { recursive: true });
  const lock = join(root, ".git", "packed-refs.lock");
  writeFileSync(lock, "fixture\n");
  const oldSeconds =
    (Temporal.Now.instant().epochMilliseconds - REF_LOCK_STALE_MS - 10_000) /
    1_000;
  utimesSync(lock, oldSeconds, oldSeconds);
  return { root, lock };
}

describe("ownerlessRefLocks", () => {
  test("resolves a worktree's shared ref directory", () => {
    const { root, lock } = fixture();
    const worktree = join(root, "sibling");
    const gitDir = join(root, ".git", "worktrees", "sibling");
    mkdirSync(worktree);
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(
      join(worktree, ".git"),
      "gitdir: ../.git/worktrees/sibling\n",
    );
    writeFileSync(join(gitDir, "commondir"), "../..\n");
    expect(ownerlessRefLocks(worktree).map((entry) => entry.path)).toEqual([
      lock,
    ]);
  });

  test("does not report a fresh lock without an open holder", () => {
    const { root, lock } = fixture();
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    utimesSync(lock, nowMs / 1_000, nowMs / 1_000);
    expect(ownerlessRefLocks(root, { nowMs })).toEqual([]);
  });

  test("reports an old packed-refs lock with no open holder", () => {
    const { root, lock } = fixture();
    const locks = ownerlessRefLocks(root);
    expect(locks.map((entry) => entry.path)).toEqual([lock]);
    expect(locks[0]?.ageMs).toBeGreaterThan(REF_LOCK_STALE_MS);
  });

  test("does not report an old lock while a process holds it open", async () => {
    const { root, lock } = fixture();
    const ready = join(root, "holder-ready");
    const holder = Bun.spawn(
      [
        "sh",
        "-c",
        'exec 9< "$1"; : > "$2"; sleep 10',
        "ref-lock-holder",
        lock,
        ready,
      ],
      {
        stdout: "ignore",
        stderr: "ignore",
        timeout: 5_000,
        killSignal: "SIGTERM",
      },
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await Bun.file(ready).exists()) break;
      await Bun.sleep(10);
    }
    expect(await Bun.file(ready).exists()).toBe(true);
    expect(ownerlessRefLocks(root)).toEqual([]);
    holder.kill("SIGTERM");
    await holder.exited;
  });
});
