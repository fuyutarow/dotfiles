import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "skills-doctor.ts");

function run(dotfiles: string, home?: string): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT, "--dotfiles", dotfiles], {
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      ...(home === undefined ? {} : { HOME: home }),
    },
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeDotfiles(
  skillNames: string[],
  thirdPartyNames: string[] = [],
): string {
  const dir = mkdtempSync(join(tmpdir(), "skills-doctor-dotfiles-"));
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  mkdirSync(join(dir, "agents", "skills", ".claude-plugin"), {
    recursive: true,
  });
  for (const name of skillNames) {
    mkdirSync(join(dir, "agents", "skills", name), { recursive: true });
    writeFileSync(
      join(dir, "agents", "skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: In-house fixture skill.\n---\n# ${name}\n`,
    );
  }
  const rows = thirdPartyNames
    .map(
      (skill) => `\n[[skills]]\nsource = "vendor/repo"\nskill = "${skill}"\n`,
    )
    .join("");
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(
    join(dir, ".claude-plugin/marketplace.json"),
    JSON.stringify({
      name: "dotfiles",
      version: "1.0.0",
      description: "Fixture",
      owner: { name: "Test" },
      plugins: [{ name: "dotfiles", source: "./agents/skills" }],
    }),
  );
  writeFileSync(
    join(dir, "agents/skills/.claude-plugin/plugin.json"),
    JSON.stringify({
      name: "dotfiles",
      version: "1.0.0",
      description: "Fixture plugin",
      author: { name: "Test" },
      skills: ["./"],
    }),
  );
  writeFileSync(
    join(dir, "agents", "skills.thirdparty.toml"),
    `cli_version = "1.5.22"\n${rows}`,
  );
  return dir;
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

describe("skills-doctor: repo-only skills wiring", () => {
  test("valid plugin manifest and in-house tree pass", () => {
    const dotfiles = makeDotfiles(["alpha-skill", "beta-skill"], ["vendor"]);
    const { out, code } = run(dotfiles);
    expect(code).toBe(0);
    expect(out).toContain("✅ SKILLS-WIRING PASS");
    expect(out).not.toContain("CODEX:");
    expect(out).not.toContain("SYMLINK:");
    cleanup(dotfiles);
  });

  test("tool-home symlinks do not affect the repository lint", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-home-links-"));
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    symlinkSync(
      join(dotfiles, "agents/skills/alpha-skill"),
      join(home, ".claude/skills/alpha-skill"),
    );
    const { out, code } = run(dotfiles, home);
    expect(code).toBe(0);
    expect(out).toContain("✅ SKILLS-WIRING PASS");
    expect(out).not.toContain("SYMLINK:");
    cleanup(dotfiles, home);
  });

  test("fails when a third-party skill file is under agents/skills", () => {
    const dotfiles = makeDotfiles(["vendor-skill"], ["vendor-skill"]);
    const { out, code } = run(dotfiles);
    expect(code).toBe(1);
    expect(out).toContain("THIRD-PARTY:");
    expect(out).toContain('"vendor-skill"');
    cleanup(dotfiles);
  });

  test("fails when the plugin manifest does not scan the skill collection", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    writeFileSync(
      join(dotfiles, "agents/skills/.claude-plugin/plugin.json"),
      JSON.stringify({
        name: "dotfiles",
        version: "1.0.0",
        description: "Fixture plugin",
        author: { name: "Test" },
        skills: [],
      }),
    );
    const { out, code } = run(dotfiles);
    expect(code).toBe(1);
    expect(out).toContain("PLUGIN:");
    expect(out).toContain("skills must include ./");
    cleanup(dotfiles);
  });
});
