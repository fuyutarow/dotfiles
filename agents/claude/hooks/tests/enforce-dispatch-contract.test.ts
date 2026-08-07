import { describe, expect, test } from "bun:test";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-dispatch-contract.ts";
const RESOURCE_DECLARATION =
  "RESOURCE-CLASS(NONCOMPUTE): hook fixture performs no numerical work";
const withResource = (prompt: string) => `${RESOURCE_DECLARATION}\n${prompt}`;
const rawPre = (tool_name: string, tool_input: unknown) => ({
  tool_name,
  tool_input,
});
const pre = (tool_name: string, tool_input: unknown) => {
  if (
    (tool_name === "Agent" || tool_name === "Task") &&
    typeof tool_input === "object" &&
    tool_input !== null &&
    !Array.isArray(tool_input) &&
    typeof (tool_input as { prompt?: unknown }).prompt === "string"
  ) {
    const input = tool_input as Record<string, unknown> & { prompt: string };
    return rawPre(tool_name, { ...input, prompt: withResource(input.prompt) });
  }
  return rawPre(tool_name, tool_input);
};
const markWorkflowAgents = (script: string) =>
  script.replace(
    /\bagent\s*\(/g,
    (call) => `${call}/* ${RESOURCE_DECLARATION} */ `,
  );
const wf = (script: string) =>
  rawPre("Workflow", { script: markWorkflowAgents(script) });
const rawWf = (script: string) => rawPre("Workflow", { script });

describe("Agent / Task", () => {
  test("model omitted -> allow + inject sonnet via updatedInput", () => {
    const r = runHook(HOOK, pre("Agent", { prompt: "x" }));
    const d = decisionOf(r.stdout);
    expect(r.code).toBe(0);
    expect(d.permissionDecision).toBe("allow");
    expect(d.updatedInput.model).toBe("sonnet");
    expect(d.updatedInput.prompt).toBe(withResource("x"));
  });

  test("non-sonnet model -> deny", () => {
    const r = runHook(HOOK, pre("Task", { prompt: "x", model: "opus" }));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("a model name that merely contains sonnet -> deny", () => {
    const r = runHook(HOOK, pre("Task", { prompt: "x", model: "sonnetty" }));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("sonnet model -> silent pass", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "x", model: "claude-sonnet-5" }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("fork -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { subagent_type: "fork", model: "opus" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("omitted Task model preserves every other argument while injecting sonnet", () => {
    const input = { prompt: "x", description: "audit", nested: { keep: true } };
    const r = runHook(HOOK, pre("Task", input));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("allow");
    expect(d.updatedInput).toEqual({
      ...input,
      prompt: withResource(input.prompt),
      model: "sonnet",
    });
  });

  test("fable -> deny even with an escalation declaration", () => {
    const r = runHook(
      HOOK,
      pre("Agent", {
        prompt: "ESCALATION(fable): target | reason | cost",
        model: "fable",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("missing resource declaration -> deny", () => {
    const r = runHook(
      HOOK,
      rawPre("Agent", { prompt: "inspect", model: "sonnet" }),
    );
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      "RESOURCE-CLASS(NONCOMPUTE)",
    );
  });

  test("one absolute resource envelope declaration -> silent pass", () => {
    const r = runHook(
      HOOK,
      rawPre("Agent", {
        prompt:
          "RESOURCE-ENVELOPE(/tmp/job.resource.json): agent-resource-run only\nrun it",
        model: "sonnet",
      }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("two resource declarations -> deny", () => {
    const r = runHook(
      HOOK,
      rawPre("Task", {
        prompt: `${RESOURCE_DECLARATION}\n${RESOURCE_DECLARATION}\ninspect`,
        model: "sonnet",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });
});

describe("Workflow", () => {
  test("all agent() calls literal sonnet -> silent pass", () => {
    const r = runHook(
      HOOK,
      wf(`const a = await agent('find bugs', {model: 'sonnet'})
          const b = await parallel([() => agent("x", { schema: S, model: "sonnet" })])`),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("agent() without model -> deny with line number", () => {
    const r = runHook(
      HOOK,
      wf(`log('hi')\nconst a = await agent('find bugs', {schema: S})`),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("line 2:");
  });

  test.each([
    ["dynamic", "const model = 'sonnet'\nawait agent('x', {model})"],
    ["non-Sonnet", "await agent('x', {model: 'opus'})"],
    ["duplicate", "await agent('x', {model: 'sonnet', model: 'fable'})"],
  ])("agent() with %s model property -> deny", (_case, script) => {
    const r = runHook(HOOK, wf(script));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test.each([
    ["nested model only", "await agent('x', {schema: {model: 'sonnet'}})"],
    [
      "spread after a literal model",
      "await agent('x', {model: 'sonnet', ...overrides})",
    ],
    [
      "spread before a literal model",
      "await agent('x', {...defaults, model: 'sonnet'})",
    ],
    [
      "computed key after a literal model",
      "await agent('x', {model: 'sonnet', [modelKey]: 'fable'})",
    ],
    ["computed model key", "await agent('x', {['model']: 'sonnet'})"],
  ])("agent() with %s -> deny", (_case, script) => {
    const r = runHook(HOOK, wf(script));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("model:'sonnet' inside a prompt STRING cannot fake a pass", () => {
    const r = runHook(
      HOOK,
      wf(`await agent("use model:'sonnet' please", {schema: S})`),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("agent( inside a comment is ignored", () => {
    const r = runHook(
      HOOK,
      wf(`// agent('not real')\nawait agent('real', {model: 'sonnet'})`),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("an aliased agent capability -> deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `const dispatch = agent\nawait dispatch("do something", {model: "opus"})`,
      ),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("a computed global agent capability -> deny", () => {
    const r = runHook(
      HOOK,
      wf(`await globalThis["agent"]("do something", {model: "opus"})`),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("child workflow() call -> deny", () => {
    const r = runHook(HOOK, wf(`await workflow('child', {})`));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("named workflow (no script) -> deny", () => {
    const r = runHook(HOOK, pre("Workflow", { name: "review-changes" }));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("unreadable scriptPath -> deny", () => {
    const r = runHook(
      HOOK,
      rawPre("Workflow", { scriptPath: "/nonexistent/wf.js" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("agent() without a same-call resource declaration -> deny", () => {
    const r = runHook(HOOK, rawWf(`await agent('x', {model: 'sonnet'})`));
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      "resource declaration",
    );
  });
});

describe("Workflow low-effort declaration (2026-07-28)", () => {
  const lowDecl = "LOW-EFFORT(triage): mechanical count, not reasoning-heavy";

  test("effort:'low' with no declaration -> deny", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {model: 'sonnet', effort: 'low'})`),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("LOW-EFFORT(");
  });

  test("effort:'low' WITH a well-formed declaration in the same call -> silent pass", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('x', {model: 'sonnet', effort: 'low',\n  // ${lowDecl}\n})`,
      ),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("LOW-EFFORT() with an empty stage -> deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('x', {model: 'sonnet', effort: 'low',\n  // LOW-EFFORT(): mechanical count\n})`,
      ),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("LOW-EFFORT(<stage>) with an empty reason -> deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('x', {model: 'sonnet', effort: 'low',\n  // LOW-EFFORT(triage):\n})`,
      ),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("two agent() calls, only one declares -> the undeclared one is named by line", () => {
    const script =
      `await agent('a', {model: 'sonnet', effort: 'low',\n  // ${lowDecl}\n})\n` +
      `await agent('b', {model: 'sonnet', effort: 'low'})`;
    const r = runHook(HOOK, wf(script));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("line 4:");
  });

  test("effort:'medium' -> silent pass, no declaration needed", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {model: 'sonnet', effort: 'medium'})`),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("effort:'high' -> silent pass, no declaration needed", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {model: 'sonnet', effort: 'high'})`),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("effort absent -> silent pass, no declaration needed", () => {
    const r = runHook(HOOK, wf(`await agent('x', {model: 'sonnet'})`));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("a LOW-EFFORT(...) sitting OUTSIDE any agent() span does not excuse an undeclared call", () => {
    const script = `// ${lowDecl}\nawait agent('x', {model: 'sonnet', effort: 'low'})`;
    const r = runHook(HOOK, wf(script));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test('double-quoted "low" with no declaration -> deny, same as single-quoted', () => {
    const r = runHook(
      HOOK,
      wf(`await agent("x", {model: "sonnet", effort: "low"})`),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test('double-quoted "low" WITH a declaration -> silent pass', () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent("x", {model: "sonnet", effort: "low",\n  // ${lowDecl}\n})`,
      ),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("a computed/non-literal effort value fails OPEN by design -> silent pass", () => {
    const r = runHook(
      HOOK,
      wf(`const lvl = 'low'\nawait agent('x', {model: 'sonnet', effort: lvl})`),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("existing model check still fires unchanged alongside the effort gate", () => {
    const r = runHook(HOOK, wf(`await agent('x', {schema: S, effort: 'low'})`));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("missing model:'sonnet'");
  });
});

// Independent axes must not be reported one-per-deny: a caller should see the whole fix
// list once instead of being denied N times in a row.
describe("batched diagnostics (2026-08-08)", () => {
  test("one call violating model + resource + effort -> ONE deny naming all three", () => {
    const r = runHook(
      HOOK,
      rawWf(`await agent('x', {schema: S, effort: 'low'})`),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("missing model:'sonnet'");
    expect(d.permissionDecisionReason).toContain("resource declaration");
    expect(d.permissionDecisionReason).toContain("LOW-EFFORT");
  });

  test("findings are grouped under the agent() call that owns them", () => {
    const r = runHook(
      HOOK,
      rawWf(`await agent('x', {schema: S, effort: 'low'})`),
    );
    const [entry] = decisionOf(r.stdout)
      .permissionDecisionReason.split("\n")
      .filter((l: string) => l.startsWith("  line "));
    expect(entry).toContain("line 1:");
    expect(entry).toContain("missing model:'sonnet'");
    expect(entry).toContain("resource declaration");
    expect(entry).toContain("LOW-EFFORT");
  });

  test("two calls with different violations -> both lines in a single deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('a', {schema: S})\nawait agent('b', {model: 'sonnet', effort: 'low'})`,
      ),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("line 1: missing model:'sonnet'");
    expect(reason).toContain("line 2:");
    expect(reason).toContain("LOW-EFFORT");
  });

  test("a clean call alongside a violating one is not named", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('a', {model: 'sonnet'})\nawait agent('b', {schema: S})`),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("line 2:");
    expect(reason).not.toContain("line 1:");
  });

  test("POISONING: an unbalanced span is reported as syntax, not as a missing model", () => {
    const r = runHook(HOOK, wf(`await agent('x', {model: 'sonnet'`));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("unbalanced");
    expect(reason).not.toContain("missing model:'sonnet'");
    expect(reason).not.toContain("resource declaration");
  });

  test("CAP: more offending lines than the cap -> the remainder is stated, not dropped", () => {
    const script = Array.from(
      { length: 25 },
      (_, i) => `await agent('a${i}', {schema: S})`,
    ).join("\n");
    const r = runHook(HOOK, wf(script));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("line 20:");
    expect(reason).not.toContain("line 21:");
    expect(reason).toContain("…and 5 more line(s)");
  });

  test("indirection plus a per-call violation -> both, with an incompleteness NOTE", () => {
    const r = runHook(
      HOOK,
      wf(`const dispatch = agent\nawait agent('x', {schema: S})`),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("alias or indirection");
    expect(reason).toContain("missing model:'sonnet'");
    expect(reason).toContain("NOTE:");
  });

  test("no shape finding -> no incompleteness NOTE", () => {
    const r = runHook(HOOK, wf(`await agent('x', {schema: S})`));
    expect(decisionOf(r.stdout).permissionDecisionReason).not.toContain(
      "NOTE:",
    );
  });

  test("HOW TO FIX lists only the axes that actually fired", () => {
    const r = runHook(HOOK, wf(`await agent('x', {schema: S})`));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("HOW TO FIX");
    expect(reason).toContain("model    —");
    expect(reason).not.toContain("effort   —");
    expect(reason).not.toContain("resource —");
  });

  test("Agent: a bad model AND a missing resource declaration -> ONE deny naming both", () => {
    const r = runHook(
      HOOK,
      rawPre("Agent", { prompt: "inspect", model: "opus" }),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("RESOURCE-CLASS(NONCOMPUTE)");
    expect(d.permissionDecisionReason).toContain("'opus' is not allowed");
  });

  test("Agent: fork AND a missing resource declaration -> ONE deny naming both", () => {
    const r = runHook(
      HOOK,
      rawPre("Task", { subagent_type: "fork", prompt: "x" }),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("fork");
    expect(reason).toContain("RESOURCE-CLASS(NONCOMPUTE)");
  });

  test("Agent: a single violation stays a one-line reason", () => {
    const r = runHook(HOOK, pre("Agent", { prompt: "x", model: "opus" }));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).not.toContain("\n");
    expect(reason).toContain("'opus' is not allowed");
  });
});

describe("fail direction", () => {
  test("malformed payload -> FAIL CLOSED (deny)", () => {
    const r = runHook(HOOK, "not json at all");
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("malformed Agent input -> FAIL CLOSED (deny)", () => {
    const r = runHook(HOOK, pre("Agent", null));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("unrelated tool -> silent pass", () => {
    const r = runHook(HOOK, pre("Bash", { command: "ls" }));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});

describe("explicit model policy", () => {
  const decl =
    "ESCALATION(fable): terra 移行の全面監査 | sonnet 3周が同じ穴を見落とした | 概算 300k tok";

  test("fable -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "audit this", model: "fable" }),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("Sonnet");
  });

  test("fable with a declaration -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: `${decl}\n\naudit this`, model: "fable" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("full model id claude-fable-5 -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Task", { prompt: `${decl}\nwork`, model: "claude-fable-5" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("bare escalation marker cannot bypass the denial", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "ESCALATION(fable): | | \nwork", model: "fable" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("partial escalation marker cannot bypass the denial", () => {
    const r = runHook(
      HOOK,
      pre("Agent", {
        prompt: "ESCALATION(fable): audit | because\nwork",
        model: "fable",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("opus remains denied", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: `${decl}\nwork`, model: "opus" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("Workflow fable agent() denies", () => {
    const script = `phase('x')\nawait agent('${decl}', {model: 'fable'})`;
    const r = runHook(HOOK, wf(script));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("model:'sonnet'");
  });
});
