import { describe, expect, test } from "bun:test";
import {
  isValidRole,
  randomSuffix,
  rolePrompt,
  sessionName,
} from "../assign-lib.ts";

describe("isValidRole", () => {
  test("accepts a plain lowercase token", () => {
    expect(isValidRole("obs")).toBe(true);
  });

  test("rejects uppercase, digits-first, and empty", () => {
    expect(isValidRole("OBS")).toBe(false);
    expect(isValidRole("1pi")).toBe(false);
    expect(isValidRole("")).toBe(false);
  });

  test("rejects a token over 12 chars", () => {
    expect(isValidRole("a".repeat(13))).toBe(false);
  });

  test("accepts exactly 12 chars", () => {
    expect(isValidRole(`a${"b".repeat(11)}`)).toBe(true);
  });
});

describe("randomSuffix", () => {
  test("is 4 chars from the Crockford base32 alphabet by default", () => {
    expect(randomSuffix()).toMatch(/^[0-9a-hj-km-np-tv-z]{4}$/);
  });

  test("honors an injected rand() for determinism", () => {
    expect(randomSuffix(4, () => 0)).toBe("0000");
  });

  test("honors a custom length", () => {
    expect(randomSuffix(6, () => 0)).toBe("000000");
  });
});

describe("sessionName", () => {
  test("lowercases the project and joins role + suffix with an underscore", () => {
    expect(sessionName("/home/fuyu/Workspace/firedancer", "pi", "abcd")).toBe(
      "firedancer-pi_abcd",
    );
  });

  test("lowercases a mixed-case cwd basename", () => {
    expect(sessionName("/home/fuyu/dotFiles", "obs", "wxyz")).toBe(
      "dotfiles-obs_wxyz",
    );
  });

  test("snake_cases a hyphenated project so only one hyphen separates project/role", () => {
    expect(sessionName("/home/fuyu/Workspace/agentic-RnD", "agt", "bvxj")).toBe(
      "agentic_rnd-agt_bvxj",
    );
  });
});

describe("rolePrompt", () => {
  test("returns the configured prompt for a known role", () => {
    expect(rolePrompt("pi", { pi: { prompt: "hello" } })).toBe("hello");
  });

  test("returns null for a role with no table", () => {
    expect(rolePrompt("gpu", { pi: { prompt: "hello" } })).toBeNull();
  });

  test("returns null for a table with an empty/whitespace prompt", () => {
    expect(rolePrompt("obs", { obs: { prompt: "" } })).toBeNull();
    expect(rolePrompt("obs", { obs: { prompt: "   " } })).toBeNull();
  });

  test("returns null for a table with no prompt key at all", () => {
    expect(rolePrompt("obs", { obs: {} })).toBeNull();
  });
});
