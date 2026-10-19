import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTempTracker } from "./temp.ts";

const tempDirs = createTempTracker();
const registerTempDir = tempDirs.register;

const CLI = join(import.meta.dir, "..", "src", "next", "cli.ts");
const scratch = registerTempDir(
  mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-startup-`)),
);
const state = join(scratch, "unreadable-state");
mkdirSync(state);
chmodSync(state, 0);
afterAll(() => {
  chmodSync(state, 0o700);
  rmSync(scratch, { recursive: true, force: true });
  tempDirs.assertRemoved();
});

function run(args: string[]): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], {
    env: { ...process.env, AGX_NEXT_STATE_DIR: state },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode ?? -1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

test("help and bare invocation do not touch run state", () => {
  const help = run(["--help"]);
  expect(help.code).toBe(0);
  expect(help.out).toContain("agx");
  expect(help.err).toBe("");

  const bare = run([]);
  expect(bare.code).toBe(2);
  expect(bare.out).toBe("");
  chmodSync(state, 0o700);
  expect(readdirSync(state)).toEqual([]);
});
