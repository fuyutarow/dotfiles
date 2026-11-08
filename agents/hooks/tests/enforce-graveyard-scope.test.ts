import { describe, expect, test } from "bun:test";
import { jsonOf, z } from "../zod.ts";
import { runHook } from "./helpers.ts";

const decision = jsonOf(
  z.object({
    hookSpecificOutput: z.object({
      permissionDecision: z.literal("deny"),
      permissionDecisionReason: z.string(),
    }),
  }),
);

const HOOK = "enforce-graveyard-scope.ts";
// The declared graveyard, pinned by env: XDG_DATA_HOME empty → $HOME/.local/share/graveyard.
const ENV = { HOME: "/home/tester", XDG_DATA_HOME: "" };
const DECLARED = "/home/tester/.local/share/graveyard";
const CWD = "/home/tester/work";

const bash = (command: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd: CWD,
});

function decide(command: string): string | undefined {
  const result = runHook(HOOK, bash(command), ENV);
  expect(result.code).toBe(0);
  if (result.stdout === "") return undefined;
  const parsed = decision.safeParse(result.stdout);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return undefined;
  return parsed.data.hookSpecificOutput.permissionDecisionReason;
}

describe("enforce-graveyard-scope: other graveyards are denied", () => {
  const denied = [
    "rip --graveyard /x/.graveyard-gc a",
    "rip --graveyard=/x a",
    "cd w && rip --graveyard /x a",
    "GRAVEYARD=/x rip a",
    "RIP_GRAVEYARD=/x rip a",
    "env RIP_GRAVEYARD=/x rip a",
    "rip --graveyard=~/.local/share/graveyard a",
    'rip --graveyard "~/.local/share/graveyard" a',
    'rip --graveyard "$(echo /x)" a',
    "rip --graveyard .graveyard a",
    "export RIP_GRAVEYARD=/x; rip a",
    "sh -c 'rip --graveyard /x a'",
  ];
  for (const command of denied) {
    test(`denies: ${command}`, () => {
      const reason = decide(command);
      expect(reason).toBeDefined();
      expect(reason).toContain("[dotfiles:graveyard-scope]");
      expect(reason).toContain(DECLARED);
    });
  }
});

describe("enforce-graveyard-scope: the declared graveyard and plain rip pass", () => {
  const allowed = [
    "rip a",
    'rip --graveyard "$RIP_GRAVEYARD" a',
    "rip --graveyard ~/.local/share/graveyard a",
    "rip --graveyard /home/tester/.local/share/graveyard a",
    'GRAVEYARD="$GRAVEYARD" rip a',
    "rip -d",
    "echo 'rip --graveyard /x'",
    "cd /tmp && echo ok",
  ];
  for (const command of allowed) {
    test(`passes: ${command}`, () => {
      expect(decide(command)).toBeUndefined();
    });
  }
});

describe("enforce-graveyard-scope: decisions", () => {
  test("two violations in one command come back in ONE deny", () => {
    const reason = decide("rip --graveyard /x a && GRAVEYARD=/y rip b");
    expect(reason).toBeDefined();
    expect(reason).toContain("rip --graveyard /x");
    expect(reason).toContain("GRAVEYARD=/y");
  });

  test("an unreadable command that mentions rip and graveyard is denied", () => {
    expect(decide("rip --graveyard /x 'unterminated")).toBeDefined();
  });

  test("an unreadable command without both words passes", () => {
    expect(decide("echo 'unterminated")).toBeUndefined();
  });

  test("a non-Bash tool passes", () => {
    const result = runHook(
      HOOK,
      { tool_name: "Read", tool_input: { file_path: "/x" }, cwd: CWD },
      ENV,
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("an unreadable payload fails closed", () => {
    const result = runHook(HOOK, "{", ENV);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"permissionDecision":"deny"');
  });
});
