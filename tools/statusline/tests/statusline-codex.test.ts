import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedStatuslineEnv } from "./helpers.ts";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true })),
  );
});

test("statusline --codex defaults to PWD and reports a missing interactive session once", async () => {
  const home = await mkdtemp(join(tmpdir(), "statusline-codex-home-"));
  homes.push(home);
  const sessions = join(home, ".codex", "sessions");
  await mkdir(sessions, { recursive: true });
  const script = join(import.meta.dir, "..", "src", "statusline.ts");
  const result = Bun.spawnSync([process.execPath, script, "--codex"], {
    cwd: home,
    env: isolatedStatuslineEnv({
      HOME: home,
      PATH: process.env["PATH"] ?? "",
      PWD: "/fixture/codex",
    }),
  });
  const output = result.stdout.toString();
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe("");
  expect(output).toContain("Codex: no interactive session for /fixture/codex");
  expect(output.startsWith("\u001B[2m")).toBe(true);
  expect(output.split("\n")).toHaveLength(1);

  const threadResult = Bun.spawnSync(
    [process.execPath, script, "--codex", "--thread", "missing-thread-id"],
    {
      cwd: home,
      env: isolatedStatuslineEnv({
        HOME: home,
        PATH: process.env["PATH"] ?? "",
        PWD: "/fixture/codex",
      }),
    },
  );
  const threadError = threadResult.stderr.toString();
  expect(threadResult.exitCode).toBe(2);
  expect(threadResult.stdout.toString()).toBe("");
  expect(threadError).toContain("missing-thread-id");
  expect(threadError.split("\n")).toHaveLength(2);
});
