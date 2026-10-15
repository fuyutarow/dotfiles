import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "skills-doctor.ts");

function makeDotfiles(
  skillNames: string[],
  thirdPartyNames: string[] = [],
): string {
  const dir = mkdtempSync(join(tmpdir(), "skills-doctor-dotfiles-"));
  for (const name of skillNames) {
    mkdirSync(join(dir, "agents/skills", name), { recursive: true });
    writeFileSync(
      join(dir, "agents/skills", name, "SKILL.md"),
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
    join(dir, "agents/skills.thirdparty.toml"),
    `cli_version = "1.5.22"\n${rows}`,
  );
  return dir;
}

function run(dotfiles: string, home: string): { out: string; code: number } {
  const bin = mkdtempSync(join(tmpdir(), "skills-doctor-empty-path-"));
  using _bin = {
    [Symbol.dispose]() {
      rmSync(bin, { recursive: true, force: true });
    },
  };
  const proc = Bun.spawnSync([process.execPath, SCRIPT], {
    env: {
      ...process.env,
      DOTFILES: dotfiles,
      HOME: home,
      PATH: bin,
    },
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

describe("skills-wiring repo lint", () => {
  test("passes with an empty HOME and no Claude executable", () => {
    const dotfiles = makeDotfiles(["alpha-skill", "beta-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-empty-home-"));
    expect(existsSync(join(home, ".claude"))).toBe(false);
    const { out, code } = run(dotfiles, home);
    expect(code).toBe(0);
    expect(out).toContain("2 in-house skill directories are valid");
    cleanup(dotfiles, home);
  });

  test("fails when a directory name and frontmatter name differ", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    writeFileSync(
      join(dotfiles, "agents/skills/alpha-skill/SKILL.md"),
      "---\nname: another-skill\ndescription: mismatch\n---\n",
    );
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-name-home-"));
    const { out, code } = run(dotfiles, home);
    expect(code).toBe(1);
    expect(out).toContain("frontmatter name does not match the directory");
    cleanup(dotfiles, home);
  });

  test("fails while a retired plugin manifest remains", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    mkdirSync(join(dotfiles, ".claude-plugin"), { recursive: true });
    writeFileSync(join(dotfiles, ".claude-plugin/marketplace.json"), "{}\n");
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-plugin-home-"));
    const { out, code } = run(dotfiles, home);
    expect(code).toBe(1);
    expect(out).toContain("retired Claude plugin manifest remains");
    cleanup(dotfiles, home);
  });

  test("fails when a third-party skill is authored in the in-house tree", () => {
    const dotfiles = makeDotfiles(["vendor-skill"], ["vendor-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-vendor-home-"));
    const { out, code } = run(dotfiles, home);
    expect(code).toBe(1);
    expect(out).toContain("THIRD-PARTY:");
    expect(out).toContain('"vendor-skill"');
    cleanup(dotfiles, home);
  });
});
