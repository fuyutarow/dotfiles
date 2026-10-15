import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-agx-workspace-add.ts";

describe("enforce-agx-workspace-add", () => {
  test("case-esac workspace add is allowed with a one-line warning", () => {
    const cwd = tempDir("workspace-add-case-");
    mkdirSync(join(cwd, ".jj"));
    const result = runHook(HOOK, {
      tool_name: "Bash",
      tool_input: {
        command: "case x in x) jj workspace add ../worker ;; esac",
      },
      cwd,
    });
    const decision = decisionOf(result.stdout);
    expect(decision?.permissionDecision).toBe("allow");
    expect(decision?.permissionDecisionReason).toContain(
      "could not parse shell syntax around jj workspace add",
    );
    expect(decision?.permissionDecisionReason?.split("\n")).toHaveLength(1);
    expect(result.stderr).toBe("");
  });

  test("a proven forbidden add is denied with the runnable sparse workflow", () => {
    const cwd = tempDir("workspace-add-policy-");
    mkdirSync(join(cwd, ".jj"));
    writeFileSync(join(cwd, ".agx.toml"), "workspace = true\n");
    const decision = decisionOf(
      runHook(HOOK, {
        tool_name: "Bash",
        tool_input: { command: "jj workspace add ../worker" },
        cwd,
      }).stdout,
    );
    expect(decision?.permissionDecision).toBe("deny");
    expect(decision?.permissionDecisionReason).toContain(
      "jj workspace add --sparse-patterns empty <dir>",
    );
    expect(decision?.permissionDecisionReason).toContain(
      "jj sparse set --add <paths>",
    );
    expect(decision?.permissionDecisionReason).not.toContain(
      "sparse workspace workflow",
    );
  });
});
