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

const CLI = join(import.meta.dir, "..", "src", "main.ts");
const scratch = mkdtempSync(join(tmpdir(), "agx-startup-"));
const state = join(scratch, "unreadable-state");
mkdirSync(state);
chmodSync(state, 0);
afterAll(() => {
  chmodSync(state, 0o700);
  rmSync(scratch, { recursive: true, force: true });
});

function run(args: string[]): { code: number; out: string; err: string } {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], {
    env: { ...process.env, AGX_STATE_DIR: state },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode ?? -1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

test("root version, help and bare invocation do not touch state", () => {
  const version = run(["--version"]);
  expect(version.code).toBe(0);
  expect(version.out.trim()).toBe("2.5.4");
  expect(version.err).toBe("");

  const help = run(["--help"]);
  expect(help.code).toBe(0);
  expect(help.out).toContain("agx v2.5.4");
  expect(help.err).toBe("");

  const bare = run([]);
  expect(bare.code).toBe(2);
  expect(bare.out).toContain("USAGE:");
  chmodSync(state, 0o700);
  expect(readdirSync(state)).toEqual([]);
});
