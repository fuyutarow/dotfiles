import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../hooks/zod.ts";
import { probeModels } from "../scripts/probe-models.ts";
import { asRecord, runClaude, toRelay } from "../scripts/run-claude.ts";

const ErrorEnvelope = z.object({ exit_code: z.number(), error: z.string() });

function parseErrorEnvelope(stdout: string): z.output<typeof ErrorEnvelope> {
  return jsonOf(ErrorEnvelope).parse(stdout);
}

const fixture = resolve(import.meta.dir, "fake-claude.ts");
const runnerScript = resolve(import.meta.dir, "../scripts/run-claude.ts");
const probeScript = resolve(import.meta.dir, "../scripts/probe-models.ts");

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
  const target = await mkdtemp(join(tmpdir(), "driving-claude-test-"));
  return fn(target).then(
    async (value) => {
      await rm(target, { recursive: true, force: true });
      return value;
    },
    async (error: unknown) => {
      await rm(target, { recursive: true, force: true });
      throw error;
    },
  );
}

describe("driving-claude runner", () => {
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

describe("driving-claude argv boundary", () => {
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
