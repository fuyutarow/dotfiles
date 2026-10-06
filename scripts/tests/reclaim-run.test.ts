// bun test for agents/hooks/dir-lock.ts and scripts/reclaim-run.ts: one reclaim at a time across
// sessions, a dead holder never wedges the lock, and every run leaves a receipt. Fixture state
// dirs only (RECLAIM_STATE_DIR); the real ~/.local/state is never touched.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { holderOf, tryAcquire } from "../../agents/hooks/dir-lock.ts";
import { decodedJson } from "../../agents/hooks/tests/decode.ts";
import { Receipt } from "../reclaim-run.ts";

const SCRIPT = join(import.meta.dir, "..", "reclaim-run.ts");
const me = (pid: number, what = "reclaim:test") => ({
  pid,
  host: hostname(),
  what,
  since: "2026-10-06T00:00:00Z",
});

function run(state: string, args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(["bun", SCRIPT, ...args], {
    env: { ...process.env, RECLAIM_STATE_DIR: state, ...env },
    timeout: 30_000,
  });
  return {
    code: r.exitCode,
    out: r.stdout.toString(),
    err: r.stderr.toString(),
  };
}

describe("dir-lock", () => {
  test("one holder at a time; the second sees who holds it", () => {
    const dir = mkdtempSync(join(tmpdir(), "dir-lock-"));
    const lock = join(dir, "lock");
    const a = tryAcquire(lock, me(process.pid, "reclaim:a"));
    expect(a.ok).toBe(true);
    const b = tryAcquire(lock, me(process.pid + 1, "reclaim:b"));
    expect(b.ok).toBe(false);
    expect(b.ok ? undefined : b.holder?.what).toBe("reclaim:a");
    if (a.ok) a.release();
    expect(tryAcquire(lock, me(process.pid)).ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a dead holder's lock is taken over", () => {
    const dir = mkdtempSync(join(tmpdir(), "dir-lock-"));
    const lock = join(dir, "lock");
    mkdirSync(lock);
    // pid 2^22+ is above Linux's pid_max default and macOS's range: never alive.
    writeFileSync(join(lock, "owner.json"), JSON.stringify(me(4_194_999)));
    expect(tryAcquire(lock, me(process.pid)).ok).toBe(true);
    expect(holderOf(lock)?.pid).toBe(process.pid);
    rmSync(dir, { recursive: true, force: true });
  });

  test("release never removes a lock someone else now holds", () => {
    const dir = mkdtempSync(join(tmpdir(), "dir-lock-"));
    const lock = join(dir, "lock");
    const a = tryAcquire(lock, me(process.pid));
    writeFileSync(join(lock, "owner.json"), JSON.stringify(me(process.ppid)));
    if (a.ok) a.release();
    expect(existsSync(lock)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("reclaim-run", () => {
  test("runs the command, passes its exit code, and appends a receipt with its output", () => {
    const state = mkdtempSync(join(tmpdir(), "reclaim-run-"));
    const r = run(state, ["probe", "--", "sh", "-c", "echo freed; exit 3"]);
    expect(r.code).toBe(3);
    expect(r.out).toContain("freed");
    const lines = readFileSync(join(state, "log.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    const receipt = decodedJson(Receipt, lines[0] ?? "");
    expect(receipt.name).toBe("probe");
    expect(receipt.exit).toBe(3);
    expect(receipt.command).toEqual(["sh", "-c", "echo freed; exit 3"]);
    expect(readFileSync(receipt.output ?? "", "utf8")).toContain("freed");
    expect(existsSync(join(state, "lock"))).toBe(false);
    rmSync(state, { recursive: true, force: true });
  });

  test("--interactive records the receipt but keeps no output file", () => {
    const state = mkdtempSync(join(tmpdir(), "reclaim-run-"));
    run(state, ["pick", "--interactive", "--", "true"]);
    const line = readFileSync(join(state, "log.jsonl"), "utf8").trim();
    expect(decodedJson(Receipt, line).output).toBeNull();
    rmSync(state, { recursive: true, force: true });
  });

  test("a busy lock is waited for, then refused naming the holder; the command never runs", () => {
    const state = mkdtempSync(join(tmpdir(), "reclaim-run-"));
    const held = tryAcquire(
      join(state, "lock"),
      me(process.pid, "reclaim:other"),
    );
    const r = run(state, ["clean", "--", "sh", "-c", "echo RAN"], {
      RECLAIM_LOCK_WAIT_S: "0",
    });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain("RAN");
    expect(r.err).toContain("held by reclaim:other");
    expect(existsSync(join(state, "log.jsonl"))).toBe(false);
    if (held.ok) held.release();
    rmSync(state, { recursive: true, force: true });
  });

  test("no command is refused before anything runs (Cleye: exit 1, no receipt)", () => {
    const state = mkdtempSync(join(tmpdir(), "reclaim-run-"));
    expect(run(state, ["x", "--"]).code).not.toBe(0);
    expect(existsSync(join(state, "log.jsonl"))).toBe(false);
    rmSync(state, { recursive: true, force: true });
  });
});
