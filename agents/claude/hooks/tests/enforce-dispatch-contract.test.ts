import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { at, obj, parseJson, strAt } from "../../../hooks/narrow.ts";
import { ROSTER_PATH } from "../../../models/roster.ts";
import { runHook } from "./helpers.ts";

// enforce-dispatch-contract: the Agent, Task and Workflow tools dispatch nothing. Every worker,
// codex or claude, starts through `agent-router run` (Jev picks the row from the roster's
// declared weights), so every one of these calls is denied with that entry point and the roster
// table. The roster itself loads strictly: an unknown key — including the retired `enabled`
// switch — rejects the load, and the hook then fails closed.
const HOOK = "enforce-dispatch-contract.ts";
const decisionOf = (stdout: string) => {
  const text = stdout.trim();
  const parsed = text === "" ? undefined : parseJson(stdout);
  if (text !== "") expect(parsed).not.toBeUndefined();
  const output =
    parsed === undefined ? undefined : at(parsed, "hookSpecificOutput");
  return {
    decision: strAt(output, "permissionDecision"),
    reason: strAt(output, "permissionDecisionReason") ?? "",
    output: obj(output),
  };
};
const call = (tool: string, input: Record<string, unknown> = {}) => ({
  tool_name: tool,
  tool_input: { prompt: "x", ...input },
});

const scratch = mkdtempSync(join(tmpdir(), "dispatch-roster-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
// The retired switch, put back on one row: strict loading must reject it, not ignore it.
const WITH_ENABLED = join(scratch, "with-enabled.toml");
writeFileSync(
  WITH_ENABLED,
  readFileSync(ROSTER_PATH, "utf8").replace(
    'id = "sonnet-high"\nroute = "claude"\n',
    'id = "sonnet-high"\nroute = "claude"\nenabled = true\n',
  ),
);

describe("enforce-dispatch-contract", () => {
  test.each([
    ["Agent", { subagent_type: "sonnet-high" }],
    ["Agent", { subagent_type: "luna-high" }],
    ["Agent", { subagent_type: "Explore" }],
    ["Task", { subagent_type: "general-purpose" }],
    ["Workflow", { script: "export const meta = {}" }],
  ])(
    "%s %o is denied with the agent-router entry point and the roster",
    (tool, input) => {
      const d = decisionOf(runHook(HOOK, call(tool, input)).stdout);
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain(`the ${tool} tool dispatches nothing`);
      expect(d.reason).toContain("agent-router run --prompt-file <brief>");
      expect(d.reason).toContain("run_in_background: true");
      // the table names every candidate, claude rows included, with its measured numbers and cost
      expect(d.reason).toContain("| ● | `luna-high` | codex | 33 | 4.5 |");
      expect(d.reason).toContain("| ○ | `sonnet-high` | claude | 47 | 43.9 |");
    },
  );

  test("a roster carrying the retired `enabled` switch fails to load, and the hook fails closed", () => {
    const d = decisionOf(
      runHook(HOOK, call("Agent"), { DISPATCH_ROSTER_PATH: WITH_ENABLED })
        .stdout,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain(
      "cannot read agents/models/dispatch-roster.toml",
    );
    expect(d.reason).toContain("enabled");
  });

  test("other tools pass untouched", () => {
    expect(
      decisionOf(runHook(HOOK, call("Bash", { command: "ls" })).stdout)
        .decision,
    ).toBeUndefined();
  });
});
