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
    });
    expect(run.exitCode).toBe(0);
    expect(
      decodedJson(
        z.object({ [AGX_WORKER_ENV]: z.string() }),
        readFileSync(join(dir, "fake-claude-env.log"), "utf8").trim(),
      ),
    ).toEqual({ [AGX_WORKER_ENV]: "1" });
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
