import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findRepoSkillSymlinks,
  removeRepoSkillSymlinks,
} from "../skills-links.ts";

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

describe("repo-owned skill symlink cleanup", () => {
  test("removes only links resolving into this checkout across tool skill dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "skills-link-repo-"));
    const home = mkdtempSync(join(tmpdir(), "skills-link-home-"));
    const external = mkdtempSync(join(tmpdir(), "skills-link-external-"));
    mkdirSync(join(root, "agents/skills/owned"), { recursive: true });
    mkdirSync(join(root, "agents/commands"), { recursive: true });
    writeFileSync(join(root, "agents/skills/owned/SKILL.md"), "# Owned\n");
    writeFileSync(join(external, "SKILL.md"), "# External\n");
    for (const rel of [".claude/skills", ".agents/skills", ".codex/skills"])
      mkdirSync(join(home, rel), { recursive: true });

    symlinkSync(
      join(root, "agents/skills/owned"),
      join(home, ".claude/skills/owned"),
    );
    symlinkSync(
      join(root, "agents/commands"),
      join(home, ".codex/skills/old-commands"),
    );
    symlinkSync(external, join(home, ".agents/skills/independent"));
    mkdirSync(join(home, ".agents/skills/handwritten"));
    writeFileSync(
      join(home, ".agents/skills/handwritten/SKILL.md"),
      "# Keep\n",
    );

    const scan = findRepoSkillSymlinks(home, root);
    expect(scan.paths.toSorted()).toEqual([
      join(home, ".claude/skills/owned"),
      join(home, ".codex/skills/old-commands"),
    ]);
    const result = removeRepoSkillSymlinks(home, root);
    expect(result.errors).toEqual([]);
    expect(result.removed.toSorted()).toEqual(scan.paths.toSorted());
    expect(existsSync(join(home, ".claude/skills/owned"))).toBe(false);
    expect(existsSync(join(home, ".codex/skills/old-commands"))).toBe(false);
    expect(readlinkSync(join(home, ".agents/skills/independent"))).toBe(
      external,
    );
    expect(
      lstatSync(join(home, ".agents/skills/handwritten")).isDirectory(),
    ).toBe(true);
    cleanup(root, home, external);
  });

  test("removes a whole skills-root symlink and a dangling in-repo skill link", () => {
    const root = mkdtempSync(join(tmpdir(), "skills-link-root-"));
    const home = mkdtempSync(join(tmpdir(), "skills-link-whole-home-"));
    mkdirSync(join(root, "agents/skills"), { recursive: true });
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(join(root, "agents/skills"), join(home, ".agents/skills"));
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    symlinkSync(
      join(root, "agents/skills/retired"),
      join(home, ".claude/skills/retired"),
    );

    const result = removeRepoSkillSymlinks(home, root);
    expect(result.errors).toEqual([]);
    expect(result.removed.toSorted()).toEqual([
      join(home, ".agents/skills"),
      join(home, ".claude/skills/retired"),
    ]);
    expect(existsSync(join(home, ".agents/skills"))).toBe(false);
    expect(existsSync(join(home, ".claude/skills/retired"))).toBe(false);
    cleanup(root, home);
  });

  test("recognizes another worktree of the same Git repository and keeps foreign links", () => {
    const worktree = mkdtempSync(join(tmpdir(), "skills-link-worktree-"));
    const main = mkdtempSync(join(tmpdir(), "skills-link-main-"));
    const foreign = mkdtempSync(join(tmpdir(), "skills-link-foreign-"));
    const home = mkdtempSync(join(tmpdir(), "skills-link-old-home-"));
    const worktreeGitDir = join(main, ".git/worktrees/active");
    mkdirSync(join(worktree, "agents/skills"), { recursive: true });
    mkdirSync(join(main, ".git/worktrees/active"), { recursive: true });
    mkdirSync(join(main, "agents/skills/old-skill"), { recursive: true });
    mkdirSync(join(foreign, ".git"), { recursive: true });
    mkdirSync(join(foreign, "agents/skills/foreign-skill"), {
      recursive: true,
    });
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    writeFileSync(join(worktree, ".git"), `gitdir: ${worktreeGitDir}\n`);
    writeFileSync(join(worktreeGitDir, "commondir"), "../..\n");
    symlinkSync(
      join(main, "agents/skills/old-skill"),
      join(home, ".claude/skills/old-skill"),
    );
    symlinkSync(
      join(foreign, "agents/skills/foreign-skill"),
      join(home, ".claude/skills/foreign-skill"),
    );

    const oldLink = join(home, ".claude/skills/old-skill");
    const foreignLink = join(home, ".claude/skills/foreign-skill");
    const plan = removeRepoSkillSymlinks(home, worktree, true);
    expect(plan.paths).toEqual([oldLink]);
    expect(lstatSync(oldLink).isSymbolicLink()).toBe(true);
    expect(lstatSync(foreignLink).isSymbolicLink()).toBe(true);

    const result = removeRepoSkillSymlinks(home, worktree);
    expect(result.errors).toEqual([]);
    expect(result.removed).toEqual([oldLink]);
    expect(existsSync(oldLink)).toBe(false);
    expect(readlinkSync(foreignLink)).toBe(
      join(foreign, "agents/skills/foreign-skill"),
    );
    cleanup(worktree, main, foreign, home);
  });
});
