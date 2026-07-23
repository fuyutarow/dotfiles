import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { probeModels } from "../scripts/probe-models.ts";
import { isRecord, runClaude, toRelay } from "../scripts/run-claude.ts";

const fixture = resolve(import.meta.dir, "fake-claude.ts");

async function withTarget<T>(fn: (target: string) => Promise<T>): Promise<T> {
  const target = await mkdtemp(join(tmpdir(), "driving-claude-test-"));
  try {
    return await fn(target);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
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
    expect(isRecord(run.claude)).toBe(true);
    expect(isRecord(run.claude) && run.claude.result).toBe("OK");
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
