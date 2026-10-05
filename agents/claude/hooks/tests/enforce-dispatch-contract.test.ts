import { describe, expect, test } from "bun:test";
import { at, obj, parseJson, strAt } from "../../../hooks/narrow.ts";
import { runHook } from "./helpers.ts";

// enforce-dispatch-contract: a dispatch picks one roster row (agents/models/dispatch-roster.toml).
// Claude rows run as Agent subagents; luna rows run as `codex-run --choice <id>` from Bash, so an
// Agent call naming one is denied with that line; the Workflow tool is denied outright. Every deny
// prints the table.
const HOOK = "enforce-dispatch-contract.ts";
const RESOURCE =
  "RESOURCE-CLASS(NONCOMPUTE): hook fixture performs no numerical work";
const agent = (input: Record<string, unknown>, tool = "Agent") => ({
  tool_name: tool,
  tool_input: { prompt: `${RESOURCE}\nx`, ...input },
});
const decisionOf = (stdout: string) => {
  const output =
    stdout.trim() === ""
      ? undefined
      : at(parseJson(stdout), "hookSpecificOutput");
  return {
    decision: strAt(output, "permissionDecision"),
    reason: strAt(output, "permissionDecisionReason") ?? "",
    output: obj(output),
  };
};
const decide = (payload: unknown) => decisionOf(runHook(HOOK, payload).stdout);

describe("enforce-dispatch-contract: claude rows run as Agent subagents", () => {
  test.each([
    ["sonnet-medium", "sonnet"],
    ["sonnet-high", "sonnet"],
    ["opus-medium", "opus"],
  ])("%s passes, with its family's model or none", (id, family) => {
    expect(
      decide(agent({ subagent_type: id, model: family })).decision,
    ).toBeUndefined();
    expect(decide(agent({ subagent_type: id })).decision).toBeUndefined();
    expect(
      decide(agent({ subagent_type: id }, "Task")).decision,
    ).toBeUndefined();
  });

  test("opus needs no justification line any more", () => {
    expect(
      decide(agent({ subagent_type: "opus-medium", model: "opus" })).decision,
    ).toBeUndefined();
  });

  test("a model of the other family is denied with the fix", () => {
    const d = decide(agent({ subagent_type: "sonnet-high", model: "opus" }));
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain(`set model:"sonnet" or omit it`);
  });
});

describe("enforce-dispatch-contract: luna rows are not subagents", () => {
  test.each([["luna-medium"], ["luna-high"], ["luna-xhigh"], ["luna-max"]])(
    "%s as subagent_type is denied with the codex-run line to run instead",
    (id) => {
      const d = decide(agent({ subagent_type: id }));
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain(
        `codex-run --choice ${id} --sandbox read-only`,
      );
    },
  );
});

describe("enforce-dispatch-contract: anything off the roster is denied with the table", () => {
  test.each([["Explore"], ["general-purpose"], ["fork"], ["claude"]])(
    "subagent_type %s",
    (id) => {
      const d = decide(agent({ subagent_type: id }));
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain(
        `subagent_type '${id}' is not a roster choice`,
      );
      expect(d.reason).toContain("| ● | `luna-high` |");
      expect(d.reason).toContain("`opus-medium`");
    },
  );

  test("a missing subagent_type", () => {
    const d = decide({
      tool_name: "Agent",
      tool_input: { prompt: `${RESOURCE}\nx` },
    });
    expect(d.reason).toContain("subagent_type is missing");
  });
});

describe("enforce-dispatch-contract: the Workflow tool is not used", () => {
  test("any Workflow call is denied, pointing at codex-run and Agent, with the table", () => {
    const d = decide({
      tool_name: "Workflow",
      tool_input: {
        script:
          "export const meta = {name:'x', description:'y'}\nawait agent('hi', {agentType:'sonnet-high'})",
      },
    });
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("the Workflow tool is not used");
    expect(d.reason).toContain("codex-run --choice");
    expect(d.reason).toContain("| ● | `luna-high` |");
  });
});

describe("enforce-dispatch-contract: resource class", () => {
  test("a valid choice without a resource declaration is denied", () => {
    const d = decide({
      tool_name: "Agent",
      tool_input: { prompt: "x", subagent_type: "sonnet-high" },
    });
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("resource declaration");
  });

  test("a bad choice AND a missing resource declaration come back in ONE deny", () => {
    const d = decide({
      tool_name: "Agent",
      tool_input: { prompt: "x", subagent_type: "Explore" },
    });
    expect(d.reason).toContain("2 violations");
    expect(d.reason).toContain("not a roster choice");
    expect(d.reason).toContain("resource declaration");
  });
});

describe("enforce-dispatch-contract: other tools pass untouched", () => {
  test("Bash", () => {
    expect(
      decide({ tool_name: "Bash", tool_input: { command: "ls" } }).decision,
    ).toBeUndefined();
  });
});
