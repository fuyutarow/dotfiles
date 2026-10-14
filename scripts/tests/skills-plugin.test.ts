import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDotfilesPlugin } from "../skills-plugin.ts";

function fixture(source = "./agents/skills", pluginSkills = ["./"]): string {
  const root = mkdtempSync(join(tmpdir(), "skills-plugin-fixture-"));
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  mkdirSync(join(root, "agents/skills/.claude-plugin"), { recursive: true });
  mkdirSync(join(root, "agents/skills/alpha"), { recursive: true });
  writeFileSync(
    join(root, "agents/skills/alpha/SKILL.md"),
    "---\nname: alpha\ndescription: test\n---\n",
  );
  writeFileSync(
    join(root, ".claude-plugin/marketplace.json"),
    JSON.stringify({
      name: "dotfiles",
      version: "1.0.0",
      description: "Fixture",
      owner: { name: "Test" },
      plugins: [{ name: "dotfiles", source }],
    }),
  );
  writeFileSync(
    join(root, "agents/skills/.claude-plugin/plugin.json"),
    JSON.stringify({
      name: "dotfiles",
      version: "1.0.0",
      description: "Fixture plugin",
      author: { name: "Test" },
      skills: pluginSkills,
    }),
  );
  return root;
}

describe("dotfiles plugin manifests", () => {
  test("accepts the versioned local marketplace and scans agents/skills", () => {
    const root = fixture();
    const result = readDotfilesPlugin(root);
    expect(result.isOk()).toBe(true);
    expect(result.unwrapOr(undefined)?.marketplaceName).toBe("dotfiles");
    expect(result.unwrapOr(undefined)?.pluginName).toBe("dotfiles");
    expect(result.unwrapOr(undefined)?.skillNames).toEqual(["alpha"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects a plugin source that escapes agents/skills", () => {
    const root = fixture("./../outside");
    const result = readDotfilesPlugin(root);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("escapes the marketplace root");
    rmSync(root, { recursive: true, force: true });
  });

  test("requires the plugin manifest to scan the skill collection", () => {
    const root = fixture("./agents/skills", ["./other"]);
    const result = readDotfilesPlugin(root);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain("skills must include ./");
    rmSync(root, { recursive: true, force: true });
  });
});
