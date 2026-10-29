import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { jsonOf } from "@dotfiles/shared/src/zod.ts";
import { ReclaimRecord } from "../src/records.ts";
import { cliEnv } from "./fixtures/cli-env.ts";
import { tempRoot } from "./fixtures/temp.ts";

test("explicit plan emits flat JSONL records without a presentation flag", () => {
  const root = tempRoot("reclaim-record-cli-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const env = cliEnv(root);
  const candidate = join(env.HOME, ".cache/pip");
  mkdirSync(candidate, { recursive: true });
  writeFileSync(join(candidate, "cache-entry"), "fixture");
  const result = Bun.spawnSync(
    [
      process.execPath,
      resolve(import.meta.dir, "../src/reclaim.ts"),
      "plan",
      "--target",
      "clean",
    ],
    {
      cwd: root,
      env: {
        ...env,
        RECLAIM_UNIT_PROC_ROOT: join(root, "proc"),
      },
      timeout: 15_000,
    },
  );
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const lines = result.stdout.toString().trim().split("\n");
  expect(lines.length).toBeGreaterThan(0);
  const parsed = lines.map((line) => jsonOf(ReclaimRecord).safeParse(line));
  expect(parsed.every((item) => item.success)).toBe(true);
  const records = parsed.flatMap((item) => (item.success ? [item.data] : []));
  expect(records.some((record) => record.path === candidate)).toBe(true);
  expect(result.stderr.toString()).not.toContain("\u001B");
}, 30_000);
