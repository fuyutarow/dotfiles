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
const sonnetHigh = (extra: Record<string, unknown> = {}) =>
  pre("Agent", {
    prompt: "x",
    subagent_type: "sonnet-high",
    model: "sonnet",
    ...extra,
  });
const opusMedium = (extra: Record<string, unknown> = {}) =>
  pre("Task", {
    prompt: "x",
    subagent_type: "opus-medium",
    model: "opus",
    ...extra,
  });
const markWorkflowAgents = (script: string) =>
  script.replace(
    /\bagent\s*\(/g,
    (call) => `${call}/* ${RESOURCE_DECLARATION} */ `,
  );
const wf = (script: string) =>
  rawPre("Workflow", { script: markWorkflowAgents(script) });
const rawWf = (script: string) => rawPre("Workflow", { script });

describe("Agent / Task — allowed pairs", () => {
  test("sonnet-high + model:sonnet -> silent pass", () => {
    const r = runHook(HOOK, sonnetHigh());
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("opus-medium + model:opus -> silent pass", () => {
    const r = runHook(HOOK, opusMedium());
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("sonnet-high + a full model id in the sonnet family -> silent pass", () => {
    const r = runHook(HOOK, sonnetHigh({ model: "claude-sonnet-5" }));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("opus-medium + a full model id in the opus family -> silent pass", () => {
    const r = runHook(HOOK, opusMedium({ model: "claude-opus-4" }));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});

describe("Agent / Task — every other shape is denied", () => {
  test("missing subagent_type -> deny", () => {
    const r = runHook(HOOK, pre("Agent", { prompt: "x", model: "sonnet" }));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      'subagent_type is missing — set subagent_type:"sonnet-high" (matches model',
    );
  });

  test("missing model -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "x", subagent_type: "sonnet-high" }),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "model is missing for subagent_type 'sonnet-high' — add model:\"sonnet\"",
    );
  });

  test("sonnet-high with model:opus -> deny (mismatch)", () => {
    const r = runHook(HOOK, sonnetHigh({ model: "opus" }));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "does not match subagent_type",
    );
  });

  test("opus-medium with model:sonnet -> deny (mismatch)", () => {
    const r = runHook(HOOK, opusMedium({ model: "sonnet" }));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "does not match subagent_type",
    );
  });

  test.each([
    "fork",
    "Explore",
    "general-purpose",
    "Plan",
    "claude-code-guide",
  ])("subagent_type '%s' -> deny", (subagent_type) => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "x", subagent_type, model: "sonnet" }),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      `subagent_type '${subagent_type}' is not allowed`,
    );
  });

  test("no model no type at all -> deny, both violations named", () => {
    const r = runHook(HOOK, pre("Agent", { prompt: "x" }));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "no allowed dispatch pair (subagent_type missing, model missing)",
    );
    expect(d.permissionDecisionReason).toContain(
      "Choose by the task: sonnet-high when the brief fully specifies the result",
    );
  });

  test("every deny states the two allowed forms", () => {
    const r = runHook(HOOK, pre("Agent", { prompt: "x" }));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain('subagent_type:"sonnet-high", model:"sonnet"');
    expect(reason).toContain('subagent_type:"opus-medium", model:"opus"');
  });

  test("missing resource declaration -> deny", () => {
    const r = runHook(
      HOOK,
      rawPre("Agent", {
        prompt: "inspect",
        subagent_type: "sonnet-high",
        model: "sonnet",
      }),
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
        subagent_type: "sonnet-high",
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
        subagent_type: "opus-medium",
        model: "opus",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("omitted subagent_type preserves every other argument in the deny check", () => {
    const input = { prompt: "x", description: "audit", nested: { keep: true } };
    const r = runHook(HOOK, pre("Agent", input));
    const d = decisionOf(r.stdout);
    // no injection happens any more — a missing type/model is simply denied
    expect(d.permissionDecision).toBe("deny");
    expect(d).not.toHaveProperty("updatedInput");
  });
});

describe("Workflow — allowed pairs", () => {
  test("all agent() calls literal sonnet/high -> silent pass", () => {
    const r = runHook(
      HOOK,
      wf(`const a = await agent('find bugs', {model: 'sonnet', effort: 'high'})
          const b = await parallel([() => agent("x", { schema: S, model: "sonnet", effort: "high" })])`),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("all agent() calls literal opus/medium -> silent pass", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {model: 'opus', effort: 'medium'})`),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("agent() without model -> deny with line number", () => {
    const r = runHook(
      HOOK,
      wf(`log('hi')\nconst a = await agent('find bugs', {effort: 'high'})`),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("line 2:");
    expect(d.permissionDecisionReason).toContain("missing model");
  });

  test("agent() without effort -> deny", () => {
    const r = runHook(HOOK, wf(`await agent('x', {model: 'sonnet'})`));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("missing effort");
  });

  test.each([
    ["sonnet+medium", "await agent('x', {model: 'sonnet', effort: 'medium'})"],
    ["opus+high", "await agent('x', {model: 'opus', effort: 'high'})"],
  ])("mismatched pair %s -> deny naming the allowed pairs", (_case, script) => {
    const r = runHook(HOOK, wf(script));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("is not an allowed pair");
    expect(d.permissionDecisionReason).toContain(
      "model:'sonnet' with effort:'high'",
    );
    expect(d.permissionDecisionReason).toContain(
      "model:'opus' with effort:'medium'",
    );
  });

  test.each([
    [
      "dynamic",
      "const model = 'sonnet'\nawait agent('x', {model, effort: 'high'})",
    ],
    ["non-family", "await agent('x', {model: 'fable', effort: 'high'})"],
    [
      "duplicate",
      "await agent('x', {model: 'sonnet', model: 'opus', effort: 'high'})",
    ],
  ])("agent() with %s model property -> deny", (_case, script) => {
    const r = runHook(HOOK, wf(script));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("effort:'low' is simply not an allowed value -> deny", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {model: 'sonnet', effort: 'low'})`),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("effort 'low' is not allowed");
    // there is no escape-hatch declaration mechanism any more
    expect(d.permissionDecisionReason).not.toContain("LOW-EFFORT");
  });

  test("a LOW-EFFORT(...) declaration does not excuse effort:'low' any more", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('x', {model: 'sonnet', effort: 'low',\n  // LOW-EFFORT(triage): mechanical\n})`,
      ),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test.each([
    [
      "nested model only",
      "await agent('x', {schema: {model: 'sonnet'}, effort: 'high'})",
    ],
    [
      "spread after a literal model",
      "await agent('x', {model: 'sonnet', effort: 'high', ...overrides})",
    ],
    [
      "spread before a literal model",
      "await agent('x', {...defaults, model: 'sonnet', effort: 'high'})",
    ],
    [
      "computed key after a literal model",
      "await agent('x', {model: 'sonnet', effort: 'high', [modelKey]: 'fable'})",
    ],
    [
      "computed model key",
      "await agent('x', {['model']: 'sonnet', effort: 'high'})",
    ],
  ])("agent() with %s -> deny", (_case, script) => {
    const r = runHook(HOOK, wf(script));
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("model:'sonnet' inside a prompt STRING cannot fake a pass", () => {
    const r = runHook(
      HOOK,
      wf(`await agent("use model:'sonnet' effort:'high' please", {schema: S})`),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("agent( inside a comment is ignored", () => {
    const r = runHook(
      HOOK,
      wf(
        `// agent('not real')\nawait agent('real', {model: 'sonnet', effort: 'high'})`,
      ),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("an aliased agent capability -> deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `const dispatch = agent\nawait dispatch("do something", {model: "opus", effort: "medium"})`,
      ),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("a computed global agent capability -> deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `await globalThis["agent"]("do something", {model: "opus", effort: "medium"})`,
      ),
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
    const r = runHook(
      HOOK,
      rawWf(`await agent('x', {model: 'sonnet', effort: 'high'})`),
    );
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      "resource declaration",
    );
  });
});

// Independent axes must not be reported one-per-deny: a caller should see the whole fix
// list once instead of being denied N times in a row.
describe("batched diagnostics (2026-09-27)", () => {
  test("one call violating model + effort + resource -> ONE deny naming all three", () => {
    const r = runHook(HOOK, rawWf(`await agent('x', {schema: S})`));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "no agentType, model, or effort",
    );
    expect(d.permissionDecisionReason).toContain(
      "or the literal pair model:'sonnet' with effort:'high'",
    );
    expect(d.permissionDecisionReason).toContain("resource declaration");
  });

  test("findings are grouped under the agent() call that owns them", () => {
    const r = runHook(HOOK, rawWf(`await agent('x', {schema: S})`));
    const [entry] = decisionOf(r.stdout)
      .permissionDecisionReason.split("\n")
      .filter((l: string) => l.startsWith("  line "));
    expect(entry).toContain("line 1:");
    expect(entry).toContain("no agentType, model, or effort");
    expect(entry).toContain("add agentType:'sonnet-high'");
    expect(entry).toContain("resource declaration");
  });

  test("two calls with different violations -> both lines in a single deny", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('a', {schema: S})\nawait agent('b', {model: 'sonnet', effort: 'medium'})`,
      ),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("line 1: no agentType, model, or effort");
    expect(reason).toContain("line 2:");
    expect(reason).toContain("is not an allowed pair");
  });

  test("a clean call alongside a violating one is not named", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('a', {model: 'sonnet', effort: 'high'})\nawait agent('b', {schema: S})`,
      ),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("line 2:");
    expect(reason).not.toContain("line 1:");
  });

  test("POISONING: an unbalanced span is reported as syntax, not as a missing model", () => {
    const r = runHook(HOOK, wf(`await agent('x', {model: 'sonnet'`));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("unbalanced");
    expect(reason).not.toContain("missing model");
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
    expect(reason).toContain("no agentType, model, or effort");
    expect(reason).toContain("NOTE:");
  });

  test("no shape finding -> no incompleteness NOTE", () => {
    const r = runHook(HOOK, wf(`await agent('x', {schema: S})`));
    expect(decisionOf(r.stdout).permissionDecisionReason).not.toContain(
      "NOTE:",
    );
  });

  test("HOW TO FIX lists only the axes that actually fired", () => {
    const r = runHook(
      HOOK,
      rawWf(`await agent('x', {model: 'sonnet', effort: 'high'})`),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("HOW TO FIX");
    expect(reason).toContain("resource —");
    expect(reason).not.toContain("model    —");
    expect(reason).not.toContain("effort   —");
  });

  test("Agent: a bad subagent_type AND a missing resource declaration -> ONE deny naming both", () => {
    const r = runHook(
      HOOK,
      rawPre("Agent", { subagent_type: "fork", prompt: "x", model: "sonnet" }),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("fork");
    expect(reason).toContain("RESOURCE-CLASS(NONCOMPUTE)");
  });

  test("Agent: a missing model AND a missing resource declaration -> ONE deny naming both", () => {
    const r = runHook(
      HOOK,
      rawPre("Task", { subagent_type: "opus-medium", prompt: "x" }),
    );
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain(
      "model is missing for subagent_type 'opus-medium' — add model:\"opus\"",
    );
    expect(reason).toContain("RESOURCE-CLASS(NONCOMPUTE)");
  });

  test("Agent: a single violation stays a one-line reason", () => {
    const r = runHook(HOOK, sonnetHigh({ model: "opus" }));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).not.toContain("\n");
    expect(reason).toContain("does not match subagent_type");
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
  test("fable model on sonnet-high -> deny (family mismatch)", () => {
    const r = runHook(HOOK, sonnetHigh({ model: "fable" }));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "does not match subagent_type",
    );
  });

  test("fable model with no subagent_type at all -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "audit this", model: "fable" }),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "no allowed dispatch pair (subagent_type missing, model 'fable')",
    );
  });

  test("full model id claude-fable-5 on opus-medium -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Task", {
        prompt: "work",
        subagent_type: "opus-medium",
        model: "claude-fable-5",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("Workflow fable agent() denies", () => {
    const script = `phase('x')\nawait agent('do it', {model: 'fable', effort: 'high'})`;
    const r = runHook(HOOK, wf(script));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain(
      "model 'fable' is not allowed",
    );
  });
});

// A deny must carry the smallest exact repair, so one retry can succeed (designing-developer-
// diagnostics D3). Positive cases for each repair; the valid neighbours above are the negatives.
describe("deny text names the minimal exact repair", () => {
  test("type/model mismatch -> keep the type, or switch the type to the model's family", () => {
    const r = runHook(
      HOOK,
      pre("Agent", {
        prompt: "x",
        subagent_type: "sonnet-high",
        model: "opus",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      `model 'opus' does not match subagent_type 'sonnet-high' — set model:"sonnet", or switch to subagent_type:"opus-medium" if the task needs opus`,
    );
  });

  test("workflow pair mismatch -> keep the model or keep the effort", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {model: 'opus', effort: 'high'})`),
    );
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      "keep model:'opus' and set effort:'medium', or keep effort:'high' and set model:'sonnet'",
    );
  });

  test("workflow missing effort beside a valid model -> the one effort that fits", () => {
    const r = runHook(HOOK, wf(`await agent('x', {model: 'sonnet'})`));
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      "missing effort — model:'sonnet' pairs only with effort:'high'; add effort:'high'",
    );
  });
});

// Workflow agent() may name the pair by agentType (the agent definition's frontmatter carries
// model AND effort), the same two names the Agent tool takes as subagent_type.
describe("Workflow agentType names the pair", () => {
  test("agentType:'opus-medium' alone -> allow", () => {
    const r = runHook(HOOK, wf(`await agent('x', {agentType: 'opus-medium'})`));
    expect(r.stdout.trim()).toBe("");
  });
  test("agentType:'sonnet-high' with its own model and effort -> allow", () => {
    const r = runHook(
      HOOK,
      wf(
        `await agent('x', {agentType: 'sonnet-high', model: 'sonnet', effort: 'high'})`,
      ),
    );
    expect(r.stdout.trim()).toBe("");
  });
  test("agentType with a contradicting model -> deny with the exact fix", () => {
    const r = runHook(
      HOOK,
      wf(`await agent('x', {agentType: 'sonnet-high', model: 'opus'})`),
    );
    expect(decisionOf(r.stdout).permissionDecisionReason).toContain(
      "agentType:'sonnet-high' runs on model:'sonnet' — drop model, or set model:'sonnet'",
    );
  });
  test("any other agentType -> deny naming both choices", () => {
    const r = runHook(HOOK, wf(`await agent('x', {agentType: 'Explore'})`));
    const reason = decisionOf(r.stdout).permissionDecisionReason;
    expect(reason).toContain("agentType 'Explore' is not allowed");
    expect(reason).toContain(
      "agentType:'sonnet-high' or agentType:'opus-medium'",
    );
  });
});
