import { describe, expect, test } from "bun:test";
import { decisionOf, runHook } from "./helpers.ts";

const HOOK = "enforce-sonnet-agents.ts";
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
