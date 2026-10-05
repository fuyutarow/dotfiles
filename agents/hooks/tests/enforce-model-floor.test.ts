import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { decisionOf, runHook, tempDir } from "./helpers.ts";

const HOOK = "enforce-model-floor.ts";

const bash = (command: string): unknown => ({
  tool_name: "Bash",
  tool_input: { command },
});
const run = (command: string, env: Record<string, string> = {}) =>
  runHook(HOOK, bash(command), env);
const verdict = (command: string): { denied: boolean; reason: string } => {
  const r = run(command);
  expect(r.code).toBe(0);
  const d = decisionOf(r.stdout);
  return {
    denied: d?.permissionDecision === "deny",
    reason: d?.permissionDecisionReason ?? "",
  };
};

describe("enforce-model-floor: orders go to the current generation only", () => {
  test("the order from the report that started this: gpt-5.6-sol at effort high is denied", () => {
    const v = verdict(
      `codex exec -m gpt-5.6-sol -c 'model_reasoning_effort="high"' --sandbox read-only 'audit'`,
    );
    expect(v.denied).toBe(true);
    expect(v.reason).toContain("gpt-5.6-sol");
    expect(v.reason).toContain("sol floor >= 6.1");
    expect(v.reason).toContain("gpt-6.1-sol");
  });

  test("grok-4.5 is denied and grok-4.7 passes", () => {
    const old = verdict(`grok -p 'audit' -m grok-4.5 --output-format json`);
    expect(old.denied).toBe(true);
    expect(old.reason).toContain("grok-4.7");
    expect(
      verdict(`grok -p 'audit' -m grok-4.7 --output-format json`).denied,
    ).toBe(false);
  });

  test("sol 6.1 passes, and so do generations that do not exist yet (6.2, 7)", () => {
    for (const m of [
      "gpt-6.1-sol",
      "gpt-6.2-sol",
      "gpt-7-sol",
      "gpt-6.10-sol",
    ]) {
      expect(verdict(`codex exec -m ${m} 'x'`).denied).toBe(false);
    }
  });

  test("the other models are held too: claude ids, gemini through agy, the other codex families", () => {
    expect(verdict("claude -p x --model claude-opus-4-8").denied).toBe(true);
    expect(verdict("claude -p x --model opus").denied).toBe(false);
    expect(
      verdict(`agy -p x --model "Claude Sonnet 4.6 (Thinking)"`).denied,
    ).toBe(true);
    expect(verdict(`agy -p x --model "Gemini 3.6 Flash (Medium)"`).denied).toBe(
      false,
    );
    expect(verdict("codex exec -m gpt-5.5-terra x").denied).toBe(true);
    expect(verdict("codex exec -m gpt-5.6-luna x").denied).toBe(true);
    expect(verdict("codex exec -m gpt-6-luna x").denied).toBe(false);
  });

  test("a bare codex exec / agy -p is denied: the model must be named", () => {
    expect(verdict("codex exec 'hi'").reason).toContain("names no model");
    expect(verdict("agy -p 'hi'").reason).toContain("names no model");
    expect(verdict("codex exec resume --last").denied).toBe(false);
  });

  test("two violations in one command come back in ONE deny, each named", () => {
    const v = verdict(
      "codex exec -m gpt-5.6-sol 'a' > a.txt; grok -p 'b' -m grok-4.5 > b.txt",
    );
    expect(v.denied).toBe(true);
    expect(v.reason).toContain("2 violations");
    expect(v.reason).toContain("gpt-5.6-sol");
    expect(v.reason).toContain("grok-4.5");
  });

  test("only the violating order is named when another one in the command is fine", () => {
    const v = verdict("codex exec -m gpt-6.1-sol 'a'; grok -p 'b' -m grok-4.5");
    expect(v.denied).toBe(true);
    expect(v.reason).toContain("grok-4.5");
    expect(v.reason).not.toContain("gpt-6.1-sol");
    expect(v.reason).not.toContain("violations");
  });

  test("a mention is not an order: echo, quoted text, a commit message, a heredoc all pass", () => {
    for (const cmd of [
      "echo codex exec -m gpt-5.6-sol",
      `rr text 'grok -p x -m grok-4.5'`,
      `git commit -m "retire codex exec -m gpt-5.6-sol and grok -m grok-4.5"`,
      "cat <<'EOF'\ncodex exec -m gpt-5.6-sol\nEOF",
      "ls ~/.codex && which grok",
    ]) {
      expect(verdict(cmd).denied).toBe(false);
    }
  });

  test("wrappers do not hide an order: env, timeout, bash -c, systemd-run", () => {
    for (const cmd of [
      "env A=1 codex exec -m gpt-5.6-sol x",
      "timeout 300 codex exec -m gpt-5.6-sol x",
      `bash -c "codex exec -m gpt-5.6-sol x"`,
      "systemd-run --user --unit=u -- grok -p x -m grok-4.5",
    ]) {
      expect(verdict(cmd).denied).toBe(true);
    }
  });

  test("a model held in a variable is followed when assigned in the same command, else denied", () => {
    expect(verdict(`M=gpt-6.1-sol; codex exec -m "$M" x`).denied).toBe(false);
    expect(verdict(`M=gpt-5.6-sol; codex exec -m "$M" x`).denied).toBe(true);
    const v = verdict(`codex exec -m "$MODEL" x`);
    expect(v.denied).toBe(true);
    expect(v.reason).toContain("not a literal name");
  });

  test("commands that run no model CLI, and other tools, are untouched", () => {
    expect(run("ls -la").stdout.trim()).toBe("");
    expect(run("codex --version").stdout.trim()).toBe("");
    expect(
      runHook(HOOK, {
        tool_name: "Edit",
        tool_input: { file_path: "x" },
      }).stdout.trim(),
    ).toBe("");
    expect(
      runHook(HOOK, { tool_name: "Bash", tool_input: {} }).stdout.trim(),
    ).toBe("");
  });
});

const configAt = (text: string): Record<string, string> => {
  const path = join(tempDir("modelfloor-"), "model-floor.toml");
  writeFileSync(path, text);
  return { MODEL_FLOOR_CONFIG: path };
};

describe("enforce-model-floor: the config can be broken without bricking the session", () => {
  test("an invalid floor file denies an order, listing every error, and nothing else", () => {
    const env = configAt(
      `schema = 2\n[[family]]\nvendor = "nope"\nfamily = "x"\nmin = "1"\n`,
    );
    const order = decisionOf(run("codex exec -m gpt-6.1-sol x", env).stdout);
    expect(order?.permissionDecision).toBe("deny");
    expect(order?.permissionDecisionReason).toContain("is invalid");
    expect(order?.permissionDecisionReason).toContain("`schema` must be 1");
    expect(order?.permissionDecisionReason).toContain(
      "`vendor` must be one of",
    );
    expect(run("ls -la", env).stdout.trim()).toBe("");
  });

  test("a missing floor file denies an order and leaves other commands alone", () => {
    const env = {
      MODEL_FLOOR_CONFIG: join(tempDir("modelfloor-"), "absent.toml"),
    };
    const d = decisionOf(run("grok -p x -m grok-4.7", env).stdout);
    expect(d?.permissionDecision).toBe("deny");
    expect(d?.permissionDecisionReason).toContain("cannot read");
    expect(run("echo hello", env).stdout.trim()).toBe("");
  });

  test("the floors in a custom file are what is enforced (a floor is data, not code)", () => {
    const env = configAt(
      `schema = 1\n[[family]]\nvendor = "openai"\nfamily = "sol"\nmin = "7"\n`,
    );
    expect(
      decisionOf(run("codex exec -m gpt-6.1-sol x", env).stdout)
        ?.permissionDecision,
    ).toBe("deny");
    expect(run("codex exec -m gpt-7-sol x", env).stdout.trim()).toBe("");
  });
});
