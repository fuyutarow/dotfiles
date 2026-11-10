import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { fromThrowable } from "neverthrow";
import { runChild, runChildCaptured } from "../src/child.ts";

function pidFile(): string {
  return join(mkdtempSync(join(tmpdir(), "rr-child-")), "pid");
}

function alive(pid: number): boolean {
  return fromThrowable(() => process.kill(pid, 0))().isOk();
}

function recordedPid(file: string): number {
  const pid = Number(readFileSync(file, "utf8").trim());
  expect(Number.isInteger(pid)).toBe(true);
  return pid;
}

describe("runChildCaptured deadline", () => {
  test("a child that prints its results and exits before the deadline is not a timeout", async () => {
    const result = await runChildCaptured(
      ["sh", "-c", "printf '%s\\n' hit; exit 0"],
      5_000,
      false,
    );
    expect(result).toEqual({
      exitCode: 0,
      stdout: "hit\n",
      stderr: "",
      timedOut: false,
    });
  });

  test("a child that prints results and then lingers is stopped at the deadline, keeping its output", async () => {
    const startedAt = performance.now();
    const result = await runChildCaptured(
      ["sh", "-c", "printf '%s\\n' hit; exec sleep 30"],
      400,
      false,
      process.cwd(),
      false,
    );
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
    expect(result.stdout).toBe("hit\n");
    expect(performance.now() - startedAt).toBeLessThan(3_000);
  });

  test("a wrapper's backend is stopped with it and does not hold rr past the deadline", async () => {
    // The ccc shape: the wrapper waits on a backend that owns stdout and answers late.
    const file = pidFile();
    const startedAt = performance.now();
    const result = await runChildCaptured(
      [
        "sh",
        "-c",
        `sh -c 'sleep 8; printf "%s\\n" late-hit' & echo $! > "$1"; wait`,
        "wrapper",
        file,
      ],
      400,
      false,
      process.cwd(),
      false,
    );
    expect(result.timedOut).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(result.stdout).toBe("");
    expect(alive(recordedPid(file))).toBe(false);
  });

  test("a child that ignores SIGTERM is killed after the grace period, never hanging the caller", async () => {
    const startedAt = performance.now();
    const result = await runChildCaptured(
      ["sh", "-c", "trap '' TERM; while :; do sleep 1; done"],
      300,
      false,
      process.cwd(),
      false,
    );
    expect(result.timedOut).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(4_000);
  });

  test("a child hanging before any result is a timeout with empty output", async () => {
    const result = await runChildCaptured(
      ["sleep", "30"],
      300,
      false,
      process.cwd(),
      false,
    );
    expect(result).toMatchObject({ exitCode: 124, stdout: "", timedOut: true });
  });
});

describe("runChild deadline", () => {
  test("a wrapper's backend is stopped with it and the timeout is reported", async () => {
    const file = pidFile();
    const startedAt = performance.now();
    const code = await runChild(
      ["sh", "-c", `sh -c 'sleep 8' & echo $! > "$1"; wait`, "wrapper", file],
      400,
    );
    expect(code).toBe(124);
    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(alive(recordedPid(file))).toBe(false);
  });

  test("a child that finishes in time keeps its own exit status", async () => {
    expect(await runChild(["sh", "-c", "exit 3"], 5_000)).toBe(3);
  });
});
