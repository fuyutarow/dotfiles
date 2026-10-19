import { afterEach, describe, expect, test } from "bun:test";
import {
  probeSandboxResources,
  resourceBriefFallback,
  resetSandboxProbeCacheForTests,
  sandboxResourceFallback,
} from "../src/workers/codex-resource-probe.ts";

afterEach(resetSandboxProbeCacheForTests);

describe("Codex resource sandbox probe", () => {
  test("an envelope falls back when the sandbox blocks the user bus", () => {
    const result = probeSandboxResources(
      "read-only",
      () => false,
      () => true,
      () => false,
    );
    expect(sandboxResourceFallback(result)).toBe("bus");
  });

  test("all resources available in sandbox stays sandboxed", () => {
    const result = probeSandboxResources(
      "read-only",
      () => true,
      () => true,
      () => true,
    );
    expect(sandboxResourceFallback(result)).toBeUndefined();
  });

  test("probe result is cached once per process", () => {
    let calls = 0;
    const run = () => {
      calls += 1;
      return true;
    };
    probeSandboxResources(
      "read-only",
      run,
      () => true,
      () => true,
    );
    probeSandboxResources(
      "workspace-write",
      run,
      () => false,
      () => false,
    );
    expect(calls).toBe(2);
  });

  test("NONCOMPUTE does not invoke the probe", () => {
    let calls = 0;
    const result = resourceBriefFallback(
      "RESOURCE-CLASS(NONCOMPUTE): source edits only",
      "read-only",
      () => {
        calls += 1;
        return {
          sandboxBus: false,
          hostBus: true,
          sandboxGpu: false,
          hostGpu: true,
        };
      },
    );
    expect(result).toBeUndefined();
    expect(calls).toBe(0);
  });
});
