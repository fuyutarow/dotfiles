import { describe, expect, test } from "bun:test";
import { cli } from "cleye";
import {
  hasScriptAgeProvider,
  SECRETS_PUSH_CLI_OPTIONS,
} from "../secrets-push.ts";

describe("secrets:push options", () => {
  test("rotation defaults off and can be enabled with the strict Cleye flag", () => {
    const defaults = cli(SECRETS_PUSH_CLI_OPTIONS, undefined, ["box"]);
    const rotated = cli(SECRETS_PUSH_CLI_OPTIONS, undefined, [
      "--rotate",
      "box",
    ]);
    expect(defaults.flags.rotate).toBe(false);
    expect(rotated.flags.rotate).toBe(true);
  });
});

describe("script-owned fnox age config", () => {
  test("accepts the script's age provider key file", () => {
    expect(
      hasScriptAgeProvider(
        '[providers.age]\ntype = "age"\nkey_file = "~/.config/fnox/age.txt"\n',
      ),
    ).toBe(true);
  });

  test.each([
    [
      "no age provider",
      '[providers.other]\nkey_file = "~/.config/fnox/age.txt"\n',
    ],
    [
      "different age key file",
      '[providers.age]\ntype = "age"\nkey_file = "~/.config/fnox/other.txt"\n',
    ],
    [
      "key file only in another section",
      '[providers.age]\ntype = "age"\n[other]\nkey_file = "~/.config/fnox/age.txt"\n',
    ],
  ])("refuses %s", (_reason, config) => {
    expect(hasScriptAgeProvider(config)).toBe(false);
  });
});
