// Global skill paths are detached only in throwaway homes. These cases never touch the real HOME.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "skills-migrate.ts");

function run(dotfiles: string, home: string, dryRun = false) {
  const args = ["bun", SCRIPT, "--dotfiles", dotfiles, "--home", home];
  if (dryRun) args.push("--dry-run");
  const proc = Bun.spawnSync(args, { maxBuffer: 2 * 1024 * 1024 });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeDotfiles(): string {
  const root = mkdtempSync(join(tmpdir(), "skills-migrate-repo-"));
  mkdirSync(join(root, "agents/skills/sui-move"), { recursive: true });
  mkdirSync(join(root, "agents/skills/acting-on-hypotheses"), {
    recursive: true,
  });
  writeFileSync(join(root, "agents/skills/sui-move/SKILL.md"), "# Sui\n");
  writeFileSync(
    join(root, "agents/skills/acting-on-hypotheses/SKILL.md"),
    "# In-house\n",
  );
  writeFileSync(
    join(root, "agents/skills.thirdparty.toml"),
    'cli_version = "1.5.22"\n\n[[skills]]\nsource = "vendor/repo"\nskill = "sui-move"\n',
  );
  return root;
}

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

describe("skills:migrate", () => {
  test("migrates the Codex root and declared vendor link while leaving in-house links alone", () => {
    const dotfiles = makeDotfiles();
    const home = mkdtempSync(join(tmpdir(), "skills-migrate-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    symlinkSync(join(dotfiles, "agents/skills"), join(home, ".agents/skills"));
    symlinkSync(
      join(dotfiles, "agents/skills/sui-move"),
      join(home, ".claude/skills/sui-move"),
    );
    symlinkSync(
      join(dotfiles, "agents/skills/acting-on-hypotheses"),
      join(home, ".claude/skills/acting-on-hypotheses"),
    );

    const { out, code } = run(dotfiles, home);
    expect(code).toBe(0);
    expect(out).toContain("migrated: ");
    expect(out).toContain("left in-house link:");
    expect(lstatSync(join(home, ".agents/skills")).isDirectory()).toBe(true);
    expect(lstatSync(join(home, ".agents/skills")).isSymbolicLink()).toBe(
      false,
    );
    expect(
      lstatSync(join(home, ".claude/skills/sui-move")).isSymbolicLink(),
    ).toBe(false);
    expect(
      lstatSync(
        join(home, ".claude/skills/acting-on-hypotheses"),
      ).isSymbolicLink(),
    ).toBe(true);
    expect(
      readFileSync(join(home, ".agents/skills/sui-move/SKILL.md"), "utf8"),
    ).toBe("# Sui\n");
    expect(
      readFileSync(join(home, ".claude/skills/sui-move/SKILL.md"), "utf8"),
    ).toBe("# Sui\n");
    expect(
      readFileSync(join(dotfiles, "agents/skills/sui-move/SKILL.md"), "utf8"),
    ).toBe("# Sui\n");

    const again = run(dotfiles, home);
    expect(again.code).toBe(0);
    expect(again.out).toContain("already tool-owned");
    cleanup(dotfiles, home);
  });

  test("dry-run identifies the migration without replacing the link", () => {
    const dotfiles = makeDotfiles();
    const home = mkdtempSync(join(tmpdir(), "skills-migrate-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(join(dotfiles, "agents/skills"), join(home, ".agents/skills"));
    const { out, code } = run(dotfiles, home, true);
    expect(code).toBe(0);
    expect(out).toContain("[dry-run] would copy");
    expect(existsSync(join(home, ".agents/skills/sui-move/SKILL.md"))).toBe(
      true,
    );
    expect(lstatSync(join(home, ".agents/skills")).isSymbolicLink()).toBe(true);
    cleanup(dotfiles, home);
  });

  test("leaves a dangling unrelated link unchanged", () => {
    const dotfiles = makeDotfiles();
    const home = mkdtempSync(join(tmpdir(), "skills-migrate-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync("/somewhere/unrelated", join(home, ".agents/skills"));
    const { out, code } = run(dotfiles, home);
    expect(code).toBe(0);
    expect(out).toContain("left unrelated link");
    expect(lstatSync(join(home, ".agents/skills")).isSymbolicLink()).toBe(true);
    cleanup(dotfiles, home);
  });
});
