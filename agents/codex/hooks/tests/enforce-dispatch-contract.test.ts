import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { decodedJson } from "../../../hooks/tests/decode.ts";

const hook = join(import.meta.dir, "..", "enforce-dispatch-contract.ts");
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

const DecisionOutput = z.object({
  hookSpecificOutput: z.object({
    permissionDecision: z.string(),
    permissionDecisionReason: z.string(),
    updatedInput: z.unknown().optional(),
  }),
});

function decision(stdout: string) {
  return decodedJson(DecisionOutput, stdout).hookSpecificOutput;
}

const pre = (tool_input: unknown) => ({ tool_name: "Agent", tool_input });

describe("Codex spawn_agent model+effort guard", () => {
  test("omitted model and reasoning_effort -> deny (nothing is injected)", () => {
    const result = run(pre({ message: resourceMessage("inspect") }));
    expect(result.code).toBe(0);
    const d = decision(result.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.updatedInput).toBeUndefined();
    expect(d.permissionDecisionReason).toContain(
      "no model and no reasoning_effort",
    );
  });

  test.each([
    ["gpt-5.6-terra", "high"],
    ["gpt-6.1-sol", "medium"],
    ["gpt-6.1-sol", "high"],
    ["gpt-6.2-sol", "high"],
    ["gpt-7-sol", "medium"],
    ["gpt-6-luna", "low"],
    ["gpt-6-luna", "ultra"],
  ])("allowed pair %p + %p passes silently", (model, reasoning_effort) => {
    const result = run(
      pre({ message: resourceMessage("inspect"), model, reasoning_effort }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  test.each([
    ["gpt-5.6-terra", "medium", "set reasoning_effort: 'high'"],
    ["gpt-6.1-sol", "low", "set reasoning_effort: 'medium' or 'high'"],
    ["gpt-5.6-sol", "high", "below the sol floor >= 6.1 — use 'gpt-6.1-sol'"],
    ["gpt-6-sol", "high", "below the sol floor >= 6.1 — use 'gpt-6.1-sol'"],
    ["gpt-5.5-terra", "high", "below the terra floor >= 5.6"],
    ["gpt-6-astra", "high", "model 'gpt-6-astra' is not allowed"],
    ["gpt-9-nova", "high", "model 'gpt-9-nova' is not allowed"],
  ])(
    "pair %p + %p is denied with the exact fix",
    (model, reasoning_effort, fix) => {
      const result = run(
        pre({ message: resourceMessage("inspect"), model, reasoning_effort }),
      );
      const d = decision(result.stdout);
      expect(d.permissionDecision).toBe("deny");
      expect(d.permissionDecisionReason).toContain(fix);
    },
  );

  test("model without reasoning_effort names the effort to add", () => {
    const result = run(
      pre({ message: resourceMessage("inspect"), model: "gpt-5.6-terra" }),
    );
    expect(decision(result.stdout).permissionDecisionReason).toContain(
      "reasoning_effort is missing for model 'gpt-5.6-terra' — add reasoning_effort: 'high'",
    );
  });

  test("reasoning_effort without model names the models that fit", () => {
    const result = run(
      pre({ message: resourceMessage("inspect"), reasoning_effort: "medium" }),
    );
    expect(decision(result.stdout).permissionDecisionReason).toContain(
      "add model: 'gpt-6.1-sol' or 'gpt-6-luna'",
    );
  });

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
    pre({
      message: resourceMessage("inspect"),
      model: "gpt-5.6-terra",
      reasoning_effort: 3,
    }),
  ])("malformed or unverifiable payload exits 2", (payload) => {
    const result = run(payload);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("dispatch-contract:");
  });

  test("the generation floor is data: a custom floor file moves what the dispatch gate allows", () => {
    const dir = mkdtempSync(join(tmpdir(), "terra-floor-"));
    const config = join(dir, "model-floor.toml");
    writeFileSync(
      config,
      'schema = 1\n[[family]]\nvendor = "openai"\nfamily = "sol"\nmin = "7"\n',
    );
    const dispatch = (model: string) =>
      spawnSync(process.execPath, [hook], {
        input: JSON.stringify(
          pre({
            message: resourceMessage("inspect"),
            model,
            reasoning_effort: "high",
          }),
        ),
        encoding: "utf8",
        env: { ...process.env, MODEL_FLOOR_CONFIG: config },
      });
    expect(decision(dispatch("gpt-6.1-sol").stdout).permissionDecision).toBe(
      "deny",
    );
    expect(dispatch("gpt-7-sol").stdout).toBe("");
  });

  test("an unreadable floor file fails closed (exit 2), never open", () => {
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify(
        pre({
          message: resourceMessage("inspect"),
          model: "gpt-6.1-sol",
          reasoning_effort: "high",
        }),
      ),
      encoding: "utf8",
      env: {
        ...process.env,
        MODEL_FLOOR_CONFIG: "/nonexistent/model-floor.toml",
      },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot read");
  });

  test("missing resource declaration is denied", () => {
    const result = run(
      pre({
        message: "inspect",
        model: "gpt-5.6-terra",
        reasoning_effort: "high",
      }),
    );
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
        reasoning_effort: "high",
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
        reasoning_effort: "high",
      }),
    );
    expect(decision(result.stdout).permissionDecision).toBe("deny");
  });
});
