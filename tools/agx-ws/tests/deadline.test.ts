import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";

const deadline = join(import.meta.dir, "../src/deadline.ts");
const ws = join(import.meta.dir, "../src/ws.ts");

async function run(cmd: string[], cwd: string, env = process.env) {
  const signal = AbortSignal.timeout(8_000);
  const child = Bun.spawn(cmd, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });
  const [out, err, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(signal.aborted, out + err).toBe(false);
  return { out, err, code };
}

test("whole-command deadline stays alive at a non-subprocess await after the final step", async () => {
  const result = await run(
    [
      process.execPath,
      "-e",
      `import {runAddCommand, enterStep} from ${JSON.stringify(deadline)};
await runAddCommand(async () => {
  enterStep("after final step");
  await new Promise(() => {});
});`,
    ],
    tmpdir(),
    { ...stateTestEnv(), WS_ADD_TIMEOUT_MS: "50" },
  );
  expect(result.code).toBe(124);
  expect(result.out).toBe("");
  expect(result.err).toContain(
    "whole-command deadline exceeded after 50ms in step: after final step",
  );
});

test("successful command flushes both pipes and exits despite a leftover referenced handle", async () => {
  const result = await run(
    [
      process.execPath,
      "-e",
      `import {runAddCommand} from ${JSON.stringify(deadline)};
await runAddCommand(async () => {
  setInterval(() => {}, 10000);
  process.stdout.write("o".repeat(262144));
  process.stderr.write("e".repeat(262144));
});`,
    ],
    tmpdir(),
    { ...stateTestEnv(), WS_ADD_TIMEOUT_MS: "2000" },
  );
  expect(result.code).toBe(0);
  expect(result.out).toBe("o".repeat(262144));
  expect(result.err).toBe("e".repeat(262144));
});

test.each(["readiness", "lock"])(
  "agx ws add whole-command deadline identifies %s on stderr",
  async (stage) => {
    const root = await mkdtemp(join(tmpdir(), "ws-command-deadline-"));
    const checked = await attempt(async () => {
      const repo = join(root, "repo");
      const bin = join(root, "bin");
      await mkdir(bin);
      await Bun.write(
        join(bin, "stat"),
        '#!/usr/bin/env bun\nprocess.stdout.write("ext4\\n");\n',
      );
      await chmod(join(bin, "stat"), 0o755);
      const env = {
        ...stateTestEnv(),
        PATH: `${bin}:${process.env.PATH}`,
        JJ_USER: "test",
        JJ_EMAIL: "test@example.com",
        RIP_GRAVEYARD: join(root, "graveyard"),
        AGX_STATE_DIR: join(root, "state"),
      };
      const init = await run(["jj", "git", "init", repo], root, env);
      expect(init.code, init.err).toBe(0);
      await Bun.write(join(repo, ".ws.toml"), 'ready = ["exec sleep 30"]\n');
      const committed = await run(["jj", "commit", "-m", "base"], repo, env);
      expect(committed.code, committed.err).toBe(0);
      if (stage === "lock") {
        await mkdir(`${repo}.ws.lock`);
        await Bun.write(
          join(`${repo}.ws.lock`, "owner.json"),
          JSON.stringify({
            pid: process.pid,
            host: hostname(),
            what: "deadline fixture",
            since: Temporal.Now.instant().toString(),
          }),
        );
      }
      const result = await run(
        [process.execPath, ws, "add", "deadline", "--repo", repo],
        repo,
        {
          ...env,
          WS_ADD_TIMEOUT_MS: "2000",
        },
      );
      expect(result.code, result.err).toBe(124);
      expect(result.out).toBe("");
      expect(result.err).toContain(
        "whole-command deadline exceeded after 2000ms in step:",
      );
      expect(result.err).toContain(
        stage === "lock"
          ? "acquire workspace store lock"
          : "sh -c exec sleep 30",
      );
    });
    await rm(root, { recursive: true, force: true });
    expect(checked.ok, checked.ok ? undefined : String(checked.error)).toBe(
      true,
    );
  },
  20_000,
);

test.each(["0", "-1", "NaN", "Infinity", "2147483648"])(
  "invalid whole-command deadline %s fails before work",
  async (timeout) => {
    const result = await run(
      [process.execPath, ws, "add", "deadline"],
      tmpdir(),
      {
        ...stateTestEnv(),
        WS_ADD_TIMEOUT_MS: timeout,
      },
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain(
      "WS_ADD_TIMEOUT_MS must be a positive integer",
    );
  },
);

// The shared preload still injects retired configuration; isolate refusal tests.
function stateTestEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.AGX_NEXT_STATE_DIR;
  return env;
}
