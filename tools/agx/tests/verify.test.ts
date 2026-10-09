import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attempt, attemptOr } from "../../shared/src/attempt.ts";
import { runVerify } from "../src/verify.ts";

// verify.ts: a verify command that hits its bound must leave no process behind, however deep.

const scratch = mkdtempSync(join(tmpdir(), "verify-test-"));
const alive: number[] = [];
afterAll(async () => {
  // a leak from a failing run must not outlive the test; an already-gone pid is the passing case
  for (const pid of alive) await attempt(() => process.kill(pid, "SIGKILL"));
  rmSync(scratch, { recursive: true, force: true });
});

const isAlive = (pid: number): Promise<boolean> =>
  attemptOr(() => process.kill(pid, 0), false);

const pidsIn = (file: string): number[] =>
  readFileSync(file, "utf8").trim().split(/\s+/u).map(Number);

describe("runVerify: a timed-out command's whole process group dies", () => {
  test("a background grandchild and the foreground one do not outlive the bound", async () => {
    const pidFile = join(scratch, "pids");
    const script = join(scratch, "grand.sh");
    // two grandchildren (one backgrounded, one in the foreground) of a shell the verify shell forks
    writeFileSync(
      script,
      `sleep 30 &\necho $! > ${pidFile}\nsleep 30 &\necho $! >> ${pidFile}\nwait\n`,
    );
    // `; true` keeps `sh script` from being exec'd in place of the verify shell
    const [r] = await runVerify([`sh ${script}; true`], scratch, 1);
    expect(r?.timed_out).toBe(true);
    expect(r?.exit).toBe(124);
    const pids = pidsIn(pidFile);
    alive.push(...pids);
    expect(pids).toHaveLength(2);
    // SIGKILL is delivered at once; give the kernel a moment to reap
    await Bun.sleep(300);
    expect(await Promise.all(pids.map((p) => isAlive(p)))).toEqual([
      false,
      false,
    ]);
  });

  test("a command that finishes in time is untouched", async () => {
    const [r] = await runVerify(["echo fine"], scratch, 5);
    expect(r).toMatchObject({ exit: 0, timed_out: false });
    expect(r?.output_tail.trim()).toBe("fine");
  });
});
