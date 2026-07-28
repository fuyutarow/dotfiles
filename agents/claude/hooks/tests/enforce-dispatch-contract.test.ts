import { describe, expect, test } from "bun:test";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-dispatch-contract.ts";
const pre = (tool_name: string, tool_input: unknown) => ({
  tool_name,
  tool_input,
});

describe("Agent / Task", () => {
  test("model omitted -> allow + inject sonnet via updatedInput", () => {
    const r = runHook(HOOK, pre("Agent", { prompt: "x" }));
    const d = decisionOf(r.stdout);
    expect(r.code).toBe(0);
    expect(d.permissionDecision).toBe("allow");
    expect(d.updatedInput.model).toBe("sonnet");
    expect(d.updatedInput.prompt).toBe("x");
  });

  test("non-sonnet model -> deny", () => {
    const r = runHook(HOOK, pre("Task", { prompt: "x", model: "opus" }));
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

  test("fork inherits the parent model -> silent pass even with model set", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { subagent_type: "fork", model: "opus" }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});

describe("Workflow", () => {
  const wf = (script: string) => pre("Workflow", { script });

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
    expect(d.permissionDecisionReason).toContain("line(s) 2");
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

  test("child workflow() call -> ask", () => {
    const r = runHook(HOOK, wf(`await workflow('child', {})`));
    expect(decisionOf(r.stdout).permissionDecision).toBe("ask");
  });

  test("named workflow (no script) -> ask", () => {
    const r = runHook(HOOK, pre("Workflow", { name: "review-changes" }));
    expect(decisionOf(r.stdout).permissionDecision).toBe("ask");
  });

  test("unreadable scriptPath -> ask", () => {
    const r = runHook(
      HOOK,
      pre("Workflow", { scriptPath: "/nonexistent/wf.js" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("ask");
  });
});

describe("Workflow low-effort declaration (2026-07-28)", () => {
  const wf = (script: string) => pre("Workflow", { script });
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
    expect(d.permissionDecisionReason).toContain("line(s) 4");
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

describe("fail direction", () => {
  test("malformed payload -> FAIL CLOSED (deny)", () => {
    const r = runHook(HOOK, "not json at all");
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("unrelated tool -> silent pass", () => {
    const r = runHook(HOOK, pre("Bash", { command: "ls" }));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});

describe("Fable escalation clause (2026-07-25)", () => {
  const decl =
    "ESCALATION(fable): terra 移行の全面監査 | sonnet 3周が同じ穴を見落とした | 概算 300k tok";

  test("fable WITHOUT a declaration -> deny, and the reason carries the fix", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "audit this", model: "fable" }),
    );
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("ESCALATION(fable):");
  });

  test("fable WITH a declaration -> silent pass", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: `${decl}\n\naudit this`, model: "fable" }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("full model id claude-fable-5 takes the same path", () => {
    const r = runHook(
      HOOK,
      pre("Task", { prompt: `${decl}\nwork`, model: "claude-fable-5" }),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("bare marker with empty fields is not a declaration -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: "ESCALATION(fable): | | \nwork", model: "fable" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("fewer than three fields -> deny", () => {
    const r = runHook(
      HOOK,
      pre("Agent", {
        prompt: "ESCALATION(fable): audit | because\nwork",
        model: "fable",
      }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("the clause does NOT extend to opus — still denied even when declared", () => {
    const r = runHook(
      HOOK,
      pre("Agent", { prompt: `${decl}\nwork`, model: "opus" }),
    );
    expect(decisionOf(r.stdout).permissionDecision).toBe("deny");
  });

  test("Workflow fan-out has no escalation clause — a declared fable agent() still denies", () => {
    const script = `phase('x')\nawait agent('${decl}', {model: 'fable'})`;
    const r = runHook(HOOK, pre("Workflow", { script }));
    const d = decisionOf(r.stdout);
    expect(d.permissionDecision).toBe("deny");
    expect(d.permissionDecisionReason).toContain("SINGLE Agent call");
  });
});
