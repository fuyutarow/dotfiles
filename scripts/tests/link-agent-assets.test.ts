import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "link-agent-assets.ts");

function fixture(): { root: string; home: string } {
  const root = mkdtempSync(join(tmpdir(), "agent-assets-repo-"));
  const home = mkdtempSync(join(tmpdir(), "agent-assets-home-"));
  mkdirSync(join(root, "agents/commands"), { recursive: true });
  mkdirSync(join(root, "agents/codex"), { recursive: true });
  writeFileSync(join(root, "agents/commands/example.md"), "# Example\n");
  writeFileSync(join(root, "agents/codex/AGENTS.md"), "# Codex\n");
  return { root, home };
}

function run(
  root: string,
  home: string,
  dryRun = false,
): { out: string; code: number } {
  const args = ["bun", SCRIPT, "--dotfiles", root, "--home", home];
  if (dryRun) args.push("--dry-run");
  const result = Bun.spawnSync(args, { maxBuffer: 1024 * 1024 });
  return {
    out: result.stdout.toString() + result.stderr.toString(),
    code: result.exitCode ?? -1,
  };
}

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

describe("agents:link", () => {
  test("keeps command and Codex guidance links without creating skill links", () => {
    const { root, home } = fixture();
    const result = run(root, home);
    expect(result.code).toBe(0);
    expect(readlinkSync(join(home, ".claude/commands"))).toBe(
      join(root, "agents/commands"),
    );
    expect(readlinkSync(join(home, ".codex/AGENTS.md"))).toBe(
      join(root, "agents/codex/AGENTS.md"),
    );
    expect(readlinkSync(join(home, ".codex/prompts"))).toBe(
      join(root, "agents/commands"),
    );
    expect(
      readlinkSync(join(home, ".gemini/antigravity/global_workflows")),
    ).toBe(join(root, "agents/commands"));
    expect(existsSync(join(home, ".claude/skills"))).toBe(false);
    expect(existsSync(join(home, ".agents/skills"))).toBe(false);

    const repeated = run(root, home);
    expect(repeated.code).toBe(0);
    expect(readlinkSync(join(home, ".claude/commands"))).toBe(
      join(root, "agents/commands"),
    );
    cleanup(root, home);
  });

  test("dry run prints command destinations and writes nothing", () => {
    const { root, home } = fixture();
    const result = run(root, home, true);
    expect(result.code).toBe(0);
    expect(result.out).toContain("[dry-run] would link:");
    expect(existsSync(join(home, ".claude"))).toBe(false);
    cleanup(root, home);
  });
});
