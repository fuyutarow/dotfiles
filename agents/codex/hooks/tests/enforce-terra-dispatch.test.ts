import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const hook = join(import.meta.dir, "..", "enforce-terra-dispatch.ts");
const resourceMessage = (message: string) =>
  `RESOURCE-CLASS(NONCOMPUTE): hook fixture performs no numerical work\n${message}`;

function run(payload: unknown) {
  const result = spawnSync(process.execPath, [hook], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
  });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function decision(stdout: string) {
  return JSON.parse(stdout).hookSpecificOutput;
}

const pre = (tool_input: unknown) => ({ tool_name: "Agent", tool_input });

describe("Codex Agent Terra guard", () => {
  test("omitted model injects Terra and preserves every other argument", () => {
    const input = {
      message: resourceMessage("inspect"),
      effort: "high",
      metadata: { task: 1 },
    };
    const result = run(pre(input));
    expect(result.code).toBe(0);
    expect(decision(result.stdout)).toMatchObject({
      permissionDecision: "allow",
      updatedInput: { ...input, model: "gpt-5.6-terra" },
    });
  });

  test("explicit Terra passes silently", () => {
    const result = run(
      pre({ message: resourceMessage("inspect"), model: "gpt-5.6-terra" }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  test.each(["gpt-5.6-sol", "gpt-4.1", "terra", ""])(
    "other explicit model %p is denied",
    (model) => {
      const result = run(pre({ message: resourceMessage("inspect"), model }));
      expect(result.code).toBe(0);
      expect(decision(result.stdout).permissionDecision).toBe("deny");
    },
  );

  test.each([
    "not json",
    {},
    { tool_name: "Agent" },
    pre(null),
    pre([]),
    pre({ message: resourceMessage("inspect"), model: null }),
    pre({
      message: resourceMessage("inspect"),
      model: { name: "gpt-5.6-terra" },
    }),
    { tool_name: "spawn_agent", tool_input: {} },
  ])("malformed or unverifiable payload exits 2", (payload) => {
    const result = run(payload);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("dispatch-contract:");
  });

  test("missing resource declaration is denied", () => {
    const result = run(pre({ message: "inspect", model: "gpt-5.6-terra" }));
    expect(result.code).toBe(0);
    expect(decision(result.stdout).permissionDecision).toBe("deny");
    expect(decision(result.stdout).permissionDecisionReason).toContain(
      "RESOURCE-CLASS(NONCOMPUTE)",
    );
  });

  test("one absolute resource envelope declaration passes", () => {
    const result = run(
      pre({
        message:
          "RESOURCE-ENVELOPE(/tmp/job.resource.json): agent-resource-run only\nrun it",
        model: "gpt-5.6-terra",
      }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("duplicate resource declarations are denied", () => {
    const declaration =
      "RESOURCE-CLASS(NONCOMPUTE): fixture does no numerical work";
    const result = run(
      pre({
        message: `${declaration}\n${declaration}\ninspect`,
        model: "gpt-5.6-terra",
      }),
    );
    expect(decision(result.stdout).permissionDecision).toBe("deny");
  });
});
