import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { at, obj, parseJson, strAt } from "../../../hooks/narrow.ts";
import { ROSTER_PATH } from "../../../models/roster.ts";
import { runHook } from "./helpers.ts";

// enforce-dispatch-contract: a dispatch picks one roster row (agents/models/dispatch-roster.toml).
// Claude rows run as Agent subagents; luna rows run as `agent-router run --choice <id>` from Bash, so an
// Agent call naming one is denied with that line; the Workflow tool is denied outright. Every deny
// prints the table. CONFIG vs IMPLEMENTATION: `enabled = false` switches a row off without
// removing its support, so the suite checks both the live config (luna only, 2026-10-05) and a
// fixture roster with every row switched on.
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

const scratch = mkdtempSync(join(tmpdir(), "dispatch-roster-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const ALL_ON = join(scratch, "all-on.toml");
writeFileSync(
  ALL_ON,
  readFileSync(ROSTER_PATH, "utf8").replaceAll(
    "enabled = false",
    "enabled = true",
  ),
);

// One row with its switch deleted: `enabled` has no implicit default, so this must not load.
const NO_SWITCH = join(scratch, "no-switch.toml");
writeFileSync(
  NO_SWITCH,
  readFileSync(ROSTER_PATH, "utf8").replace(
    'id = "sonnet-high"\nroute = "claude"\nenabled = false\n',
    'id = "sonnet-high"\nroute = "claude"\n',
  ),
);

// A switch this code does not read: strict loading rejects it instead of dropping it silently.
const UNKNOWN_KEY = join(scratch, "unknown-key.toml");
writeFileSync(
  UNKNOWN_KEY,
  readFileSync(ROSTER_PATH, "utf8").replace(
    "schema = 1\n",
    "schema = 1\nallow_claude = true\n",
  ),
);

// live: the committed config. allOn: the same rows, every one enabled.
const decide = (payload: unknown) => decisionOf(runHook(HOOK, payload).stdout);
const decideAllOn = (payload: unknown) =>
  decisionOf(runHook(HOOK, payload, { DISPATCH_ROSTER_PATH: ALL_ON }).stdout);

describe("enforce-dispatch-contract: enabled has no implicit default", () => {
  test("the fixture really dropped the switch", () => {
    expect(readFileSync(NO_SWITCH, "utf8")).not.toBe(
      readFileSync(ROSTER_PATH, "utf8"),
    );
  });

  test("a row without `enabled` fails the roster load, and the hook denies (fail closed)", () => {
    const d = decisionOf(
      runHook(HOOK, agent({ subagent_type: "sonnet-high" }), {
        DISPATCH_ROSTER_PATH: NO_SWITCH,
      }).stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain(
      "cannot read agents/models/dispatch-roster.toml",
    );
    expect(d.reason).toContain("enabled");
  });

  test("an unknown key is rejected, not ignored — the editor would think it took effect", () => {
    const d = decisionOf(
      runHook(HOOK, agent({ subagent_type: "sonnet-high" }), {
        DISPATCH_ROSTER_PATH: UNKNOWN_KEY,
      }).stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("allow_claude");
  });
});

describe("enforce-dispatch-contract: live config is luna only", () => {
  test.each([["sonnet-medium"], ["sonnet-high"], ["opus-medium"]])(
    "%s is denied as disabled, with how to turn it on",
    (id) => {
      const d = decide(agent({ subagent_type: id }));
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain(`'${id}' is disabled in the roster`);
      expect(d.reason).toContain("set `enabled = true`");
      expect(d.reason).toContain("| ● | `luna-high` |");
      expect(d.reason).toContain("No Claude row is enabled in this config");
    },
  );

  test("the table lists only the luna rows", () => {
    const d = decide(agent({ subagent_type: "Explore" }));
    expect(d.reason).not.toContain("| `sonnet-high` |");
    expect(d.reason).toContain(
      "Disabled in this config: `sonnet-medium`, `sonnet-high`, `opus-medium`",
    );
  });
});

describe("enforce-dispatch-contract: an enabled claude row runs as an Agent subagent (implementation kept)", () => {
  test.each([
    ["sonnet-medium", "sonnet"],
    ["sonnet-high", "sonnet"],
    ["opus-medium", "opus"],
  ])("%s passes, with its family's model or none", (id, family) => {
    expect(
      decideAllOn(agent({ subagent_type: id, model: family })).decision,
    ).toBeUndefined();
    expect(decideAllOn(agent({ subagent_type: id })).decision).toBeUndefined();
    expect(
      decideAllOn(agent({ subagent_type: id }, "Task")).decision,
    ).toBeUndefined();
  });

  test("a model of the other family is denied with the fix", () => {
    const d = decideAllOn(
      agent({ subagent_type: "sonnet-high", model: "opus" }),
    );
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
        `agent-router run --choice ${id} --prompt-file <brief>`,
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
  test("any Workflow call is denied, pointing at codex-run, with the table", () => {
    const d = decide({
      tool_name: "Workflow",
      tool_input: {
        script:
          "export const meta = {name:'x', description:'y'}\nawait agent('hi', {agentType:'sonnet-high'})",
      },
    });
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("the Workflow tool is not used");
    expect(d.reason).toContain("agent-router run");
    expect(d.reason).not.toContain("Claude workers as Agent calls");
    expect(d.reason).toContain("| ● | `luna-high` |");
  });

  test("with Claude rows enabled the deny also names Agent fan-out", () => {
    const d = decideAllOn({
      tool_name: "Workflow",
      tool_input: { script: "" },
    });
    expect(d.reason).toContain("Claude workers as Agent calls");
  });
});

describe("enforce-dispatch-contract: resource class", () => {
  test("an enabled choice without a resource declaration is denied", () => {
    const d = decideAllOn({
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
