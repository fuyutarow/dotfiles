import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { probeModels } from "../src/workers/claude-probe.ts";
import { asRecord, runClaude, toRelay } from "../src/workers/run-claude.ts";
import { decodedJson } from "./decode.ts";
import { AGENT_ROUTER_WORKER_ENV } from "../../shared/src/worker-env.ts";

const ErrorEnvelope = z.object({ exit_code: z.number(), error: z.string() });

function parseErrorEnvelope(stdout: string): z.output<typeof ErrorEnvelope> {
  return decodedJson(ErrorEnvelope, stdout);
}

const fixture = resolve(import.meta.dir, "fake-claude.ts");
const runnerScript = resolve(import.meta.dir, "../src/workers/run-claude.ts");
const probeScript = resolve(import.meta.dir, "../src/workers/claude-probe.ts");

function runCli(
  script: string,
  args: string[],
): { exitCode: number; stderr: string; stdout: string } {
  const result = Bun.spawnSync(["bun", script, ...args]);
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

async function withTarget<T>(fn: (target: string) => Promise<T>): Promise<T> {
  const target = await mkdtemp(join(tmpdir(), "run-claude-test-"));
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

describe("tools/agent-dispatch runner", () => {
  test("returns a bounded parsed Claude envelope", async () => {
    const run = await withTarget((target) =>
      runClaude({
        target,
        prompt: "Reply exactly OK",
        model: "sonnet",
        permissionMode: "plan",
        maxTurns: 1,
        timeoutMs: 1_000,
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

  test("reports probe success only for a parseable result and session", async () => {
    const records = await probeModels(["sonnet", "reject"], {
      claudeBin: fixture,
      maxBudgetUsd: 0.2,
      timeoutMs: 1_000,
    });

    expect(records[0]?.kind).toBe("AVAILABLE");
    expect(records[1]?.kind).toBe("INCONCLUSIVE");
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

describe("tools/agent-dispatch argv boundary", () => {
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

  test("probe-models rejects --__proto__ before resolving Claude", () => {
    const result = runCli(probeScript, ["--__proto__"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown option '--__proto__'");
    expect(result.stdout).toBe("");
  });
});

describe("tools/agent-dispatch runner: --progress-file", () => {
  test("streams what claude is doing into the progress file; the result event is the answer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "run-claude-progress-"));
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

describe("tools/agent-dispatch runner: session persistence and --resume", () => {
  const argvOf = async (extra: Record<string, unknown>): Promise<string[]> => {
    const dir = await mkdtemp(join(tmpdir(), "run-claude-argv-"));
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

  test("marks the Claude child as an agent-dispatch worker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "run-claude-env-"));
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
        z.object({ [AGENT_ROUTER_WORKER_ENV]: z.string() }),
        readFileSync(join(dir, "fake-claude-env.log"), "utf8").trim(),
      ),
    ).toEqual({ [AGENT_ROUTER_WORKER_ENV]: "1" });
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
