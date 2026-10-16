import {
  afterAll,
  afterEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { asRecord, runClaude, toRelay } from "../src/workers/run-claude.ts";
import { decodedJson } from "./decode.ts";
import { AGX_WORKER_ENV } from "../../shared/src/worker-env.ts";
import { createTempTracker } from "./temp.ts";

const tempDirs = createTempTracker();
const registerTempDir = tempDirs.register;
afterAll(tempDirs.assertRemoved);

const ErrorEnvelope = z.object({ exit_code: z.number(), error: z.string() });
// Positive fake-binary probes need startup room; the explicit 20ms timeout case stays unchanged.
setDefaultTimeout(20_000);

function parseErrorEnvelope(stdout: string): z.output<typeof ErrorEnvelope> {
  return decodedJson(ErrorEnvelope, stdout);
}

const fixture = resolve(import.meta.dir, "fake-claude.ts");
const runnerScript = resolve(import.meta.dir, "../src/workers/run-claude.ts");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function scratch(prefix: string): Promise<string> {
  const root = registerTempDir(
    await mkdtemp(join(tmpdir(), `agx-test-${process.pid}-${prefix}`)),
  );
  roots.push(root);
  return root;
}

function runCli(
  script: string,
  args: string[],
): { exitCode: number; stderr: string; stdout: string } {
  const result = Bun.spawnSync([process.execPath, script, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

async function withTarget<T>(fn: (target: string) => Promise<T>): Promise<T> {
  const target = await scratch("run-claude-target-");
  return Promise.try(() => fn(target)).then(
    async (value) => {
      await rm(target, { recursive: true, force: true });
      return value;
    },
    async (error: unknown) => {
      await rm(target, { recursive: true, force: true });
      return expect.unreachable(`withTarget callback failed: ${String(error)}`);
    },
  );
}

function restoreEnvironment(
  previous: Record<string, string | undefined>,
): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withEnvironment<T>(
  values: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  return Promise.try(fn).finally(() => {
    restoreEnvironment(previous);
  });
}

describe("tools/agx dispatchner", () => {
  test("Claude reads EOF from stdin while its prompt remains in argv", async () => {
    await withTarget(async (target) => {
      const prompt = "Reply exactly OK";
      const run = await runClaude({
        target,
        prompt,
        model: "sonnet",
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: 5_000,
        safeMode: true,
        bare: false,
        claudeBin: fixture,
      });
      expect(run.exitCode).toBe(0);
      expect(readFileSync(join(target, "fake-claude-stdin.log"), "utf8")).toBe(
        "",
      );
      const argv = decodedJson(
        z.array(z.string()),
        readFileSync(join(target, "fake-claude-argv.log"), "utf8").trim(),
      );
      expect(argv.slice(0, 2)).toEqual(["-p", prompt]);
    });
  });

  test("passes sandbox settings to Claude for scoped shell execution", async () => {
    await withTarget(async (target) => {
      const settings = JSON.stringify({
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          failIfUnavailable: true,
        },
      });
      const run = await runClaude({
        target,
        prompt: "Reply exactly OK",
        model: "sonnet",
        permissionMode: "acceptEdits",
        maxTurns: 1,
        timeoutMs: 5_000,
        safeMode: true,
        bare: false,
        claudeBin: fixture,
        settings,
        allowedTools: "Bash",
      });
      expect(run.exitCode).toBe(0);
      const argv = decodedJson(
        z.array(z.string()),
        readFileSync(join(target, "fake-claude-argv.log"), "utf8").trim(),
      );
      const settingIndex = argv.indexOf("--settings");
      expect(settingIndex).toBeGreaterThan(-1);
      const setting = argv[settingIndex + 1];
      if (setting === undefined)
        expect.unreachable("--settings requires a value");
      expect(
        decodedJson(
          z.object({
            sandbox: z.object({
              enabled: z.boolean(),
              autoAllowBashIfSandboxed: z.boolean(),
              allowUnsandboxedCommands: z.boolean(),
              failIfUnavailable: z.boolean(),
            }),
          }),
          setting,
        ),
      ).toEqual({
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          failIfUnavailable: true,
        },
      });
      expect(argv).toContain("--allowed-tools");
      expect(argv[argv.indexOf("--allowed-tools") + 1]).toBe("Bash");
    });
  });

  test("returns a bounded parsed Claude envelope", async () => {
    const run = await withTarget((target) =>
      runClaude({
        target,
        prompt: "Reply exactly OK",
        model: "sonnet",
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: 5_000,
        safeMode: true,
        bare: false,
        claudeBin: fixture,
      }),
    );

    expect(run.exitCode).toBe(0);
    expect(asRecord(run.claude) !== undefined).toBe(true);
    expect(asRecord(run.claude)?.result).toBe("OK");
  });

  test("kills a child that exceeds its explicit timeout", async () => {
    const run = await withTarget((target) =>
      runClaude({
        target,
        prompt: "Reply exactly OK",
        model: "wait",
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: 20,
        safeMode: true,
        bare: false,
        claudeBin: fixture,
      }),
    );

    expect(run.timedOut).toBe(true);
    expect(run.exitCode).toBe(124);
  });

  test("relays normal JSON output even when optional schema fields are absent", () => {
    const relay = toRelay({
      exitCode: 0,
      timedOut: false,
      stdout: '{"result":"OK","usage":{"input_tokens":1}}',
      stderr: "",
      claude: { result: "OK", usage: { input_tokens: 1 } },
      parseError: undefined,
    });

    expect(relay.result).toBe("OK");
    expect(relay.structured_output).toBeUndefined();
  });
});

describe("tools/agx argv boundary", () => {
  test("run-claude rejects --__proto__", () => {
    const result = runCli(runnerScript, ["--__proto__"]);
    expect(result.exitCode).toBe(2);
    expect(parseErrorEnvelope(result.stdout).error).toContain(
      "Unknown option '--__proto__'",
    );
    expect(result.stderr).toBe("");
  });

  test("run-claude rejects every String flag with no value", () => {
    for (const flag of [
      "--target",
      "--prompt-file",
      "--model",
      "--permission-mode",
      "--allowed-tools",
      "--json-schema-file",
      "--claude-bin",
    ]) {
      const args = [flag];
      const result = runCli(runnerScript, args);
      expect(result.exitCode).toBe(2);
      const envelope = parseErrorEnvelope(result.stdout);
      expect(envelope.exit_code).toBe(2);
      expect(envelope.error).toContain(`${flag} requires a value`);
      expect(result.stderr).toBe("");
    }
  });
});

describe("tools/agx dispatchner: --progress-file", () => {
  test("streams what claude is doing into the progress file; the result event is the answer", async () => {
    const dir = await scratch("run-claude-progress-");
    const progressFile = join(dir, "p.progress.json");
    const run = await withTarget((target) =>
      runClaude({
        target,
        prompt: "Reply exactly OK",
        model: "sonnet",
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: 5_000,
        safeMode: true,
        bare: false,
        claudeBin: fixture,
        progressFile,
      }),
    );
    expect(run.exitCode).toBe(0);
    expect(asRecord(run.claude)?.result).toBe("OK");
    expect(toRelay(run).session_id).toBe("fixture-session");
    const progress = decodedJson(
      z.object({
        last: z.string(),
        commands: z.number(),
        files: z.number(),
        cost_usd: z.number(),
      }),
      await Bun.file(progressFile).text(),
    );
    expect(progress).toEqual({
      last: "“done”",
      commands: 1,
      files: 1,
      cost_usd: 0,
    });
    await rm(dir, { recursive: true, force: true });
  });
});

describe("tools/agx dispatchner: session persistence and --resume", () => {
  const argvOf = async (extra: Record<string, unknown>): Promise<string[]> => {
    const dir = await scratch("run-claude-argv-");
    const log = join(dir, "fake-claude-argv.log");
    const run = await runClaude({
      target: dir,
      prompt: "Reply exactly OK",
      model: "sonnet",
      permissionMode: "plan",
      maxTurns: 1,
      timeoutMs: 5_000,
      safeMode: true,
      bare: false,
      claudeBin: fixture,
      ...extra,
    });
    expect(run.exitCode).toBe(0);
    const argv = decodedJson(
      z.array(z.string()),
      readFileSync(log, "utf8").trim(),
    );
    await rm(dir, { recursive: true, force: true });
    return argv;
  };

  test("by default a session is not persisted (probes and direct callers)", async () => {
    const argv = await argvOf({});
    expect(argv).toContain("--no-session-persistence");
    expect(argv).not.toContain("--resume");
  });

  test("marks the Claude child as an agx worker", async () => {
    const dir = await scratch("run-claude-env-");
    const supplied = {
      AGX_DISPATCHER_SESSION: "dispatcher-session-fixture",
      ANTHROPIC_API_KEY: "anthropic-auth-fixture",
      ANTHROPIC_AUTH_TOKEN: "anthropic-token-fixture",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-oauth-fixture",
      OPENAI_API_KEY: "openai-auth-fixture",
      CODEX_API_KEY: "codex-auth-fixture",
      TASK_CONTINUATION_SLOT: "/coordinator/.agent-state/continuations/ACTIVE",
      CLAUDE_CODE_SESSION_ID: "coordinator-claude-session",
      CODEX_SESSION_ID: "coordinator-codex-session",
      AGX_TEST_SETTING: "agx-namespace-fixture",
    };
    const run = await withEnvironment(supplied, () =>
      runClaude({
        target: dir,
        prompt: "Reply exactly OK",
        model: "sonnet",
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: 5_000,
        safeMode: true,
        bare: false,
        claudeBin: fixture,
      }),
    );
    expect(run.exitCode).toBe(0);
    const childEnv = decodedJson(
      z.record(z.string(), z.string()),
      readFileSync(join(dir, "fake-claude-env.log"), "utf8").trim(),
    );
    expect(childEnv.PATH).toBe(process.env.PATH);
    expect(childEnv.HOME).toBe(process.env.HOME);
    if (process.env.LANG !== undefined)
      expect(childEnv.LANG).toBe(process.env.LANG);
    if (process.env.TZ !== undefined) expect(childEnv.TZ).toBe(process.env.TZ);
    expect(childEnv.AGX_DISPATCHER_SESSION).toBe("dispatcher-session-fixture");
    expect(childEnv.ANTHROPIC_API_KEY).toBe("anthropic-auth-fixture");
    expect(childEnv.ANTHROPIC_AUTH_TOKEN).toBe("anthropic-token-fixture");
    expect(childEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe("claude-oauth-fixture");
    expect(childEnv.OPENAI_API_KEY).toBe("openai-auth-fixture");
    expect(childEnv.CODEX_API_KEY).toBe("codex-auth-fixture");
    expect(childEnv[AGX_WORKER_ENV]).toBe("1");
    expect(childEnv.AGX_TEST_SETTING).toBe("agx-namespace-fixture");
    expect(childEnv.TASK_CONTINUATION_SLOT).toBeUndefined();
    expect(childEnv.CLAUDE_CODE_SESSION_ID).toBeUndefined();
    expect(childEnv.CODEX_SESSION_ID).toBeUndefined();
    expect(childEnv.AGX_TEST_UNLISTED).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });

  test("persistSession keeps the session on disk: no --no-session-persistence", async () => {
    const argv = await argvOf({ persistSession: true });
    expect(argv).not.toContain("--no-session-persistence");
  });

  test("resume passes --resume <session> and implies persistence", async () => {
    const argv = await argvOf({ resume: "sess-abc" });
    expect(
      argv.slice(argv.indexOf("--resume"), argv.indexOf("--resume") + 2),
    ).toEqual(["--resume", "sess-abc"]);
    expect(argv).not.toContain("--no-session-persistence");
  });

  test("the CLI takes --resume and --persist-session", () => {
    const result = runCli(runnerScript, ["--resume"]);
    expect(result.exitCode).toBe(2);
    expect(parseErrorEnvelope(result.stdout).error).toContain(
      "--resume requires a value",
    );
  });
});
