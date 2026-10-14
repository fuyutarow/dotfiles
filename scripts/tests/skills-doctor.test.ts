// Throwaway fixtures prove the repo contains only in-house skills and global install paths do
// not write through a link into a repository. The real HOME is never touched.
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

function run(args: string[]): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    maxBuffer: 4 * 1024 * 1024,
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
    join(dir, "agents", "skills.thirdparty.toml"),
    `cli_version = "1.5.22"\n${rows}`,
  );
  return dir;
}

function makeWiredHome(dotfiles: string, skillNames: string[]): string {
  const home = mkdtempSync(join(tmpdir(), "skills-doctor-home-"));
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  mkdirSync(join(home, ".agents", "skills"), { recursive: true });
  for (const name of skillNames) {
    symlinkSync(
      join(dotfiles, "agents", "skills", name),
      join(home, ".claude", "skills", name),
    );
    symlinkSync(
      join(dotfiles, "agents", "skills", name),
      join(home, ".agents", "skills", name),
    );
  }
  return home;
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

const args = (dotfiles: string, home: string) => [
  "--dotfiles",
  dotfiles,
  "--home",
  home,
];

describe("skills-doctor: argv contract", () => {
  test("lets Cleye reject an ordinary unknown", () => {
    const { out, code } = run(["--wat"]);
    expect(code).toBe(1);
    expect(out).toContain("Error: Unknown flag: --wat.");
  });

  test("rejects --__proto__", () => {
    const { out, code } = run(["--__proto__"]);
    expect(code).toBe(2);
    expect(out).toContain("unknown flag(s): --__proto__");
  });

  test("rejects a stray positional", () => {
    const { out, code } = run(["stray"]);
    expect(code).toBe(2);
    expect(out).toContain("unexpected positional argument: stray");
  });
});

describe("skills-doctor: healthy state", () => {
  test("real tool-owned global directory with in-house per-skill links passes", () => {
    const dotfiles = makeDotfiles(
      ["alpha-skill", "beta-skill"],
      ["vendor-skill"],
    );
    const home = makeWiredHome(dotfiles, ["alpha-skill", "beta-skill"]);
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(0);
    expect(out).toContain("✅ SKILLS-WIRING PASS");
    cleanup(dotfiles, home);
  });

  test("a fresh clone skips machine checks", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-fresh-"));
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(0);
    expect(out).toContain("⏭ SHADOW:");
    expect(out).toContain("⏭ WIRING:");
    cleanup(dotfiles, home);
  });
});

describe("skills-doctor: in-house links", () => {
  test("a real path masking an in-house skill fails", () => {
    const dotfiles = makeDotfiles(["cloudflare"]);
    const home = makeWiredHome(dotfiles, []);
    mkdirSync(join(home, ".claude", "skills", "cloudflare"), {
      recursive: true,
    });
    writeFileSync(
      join(home, ".claude", "skills", "cloudflare", "SKILL.md"),
      "# stale\n",
    );
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(1);
    expect(out).toContain("SHADOW:");
    expect(out).toContain("agents/skills/cloudflare is never read");
    expect(out).toContain("rip ");
    cleanup(dotfiles, home);
  });

  test("a real plugin directory with an unrelated name is left alone", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = makeWiredHome(dotfiles, ["alpha-skill"]);
    mkdirSync(join(home, ".claude", "skills", "foreign-plugin-skill"), {
      recursive: true,
    });
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(0);
    expect(out).not.toContain("foreign-plugin-skill");
    cleanup(dotfiles, home);
  });

  test("reports every shadowed in-house skill", () => {
    const dotfiles = makeDotfiles(["one", "two", "three"]);
    const home = makeWiredHome(dotfiles, []);
    for (const name of ["one", "two", "three"])
      mkdirSync(join(home, ".claude", "skills", name), { recursive: true });
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(1);
    expect(out).toContain("SKILLS-WIRING FAIL: 3 problem(s)");
    cleanup(dotfiles, home);
  });
});

describe("skills-doctor: third-party boundary", () => {
  test("fails if declared third-party frontmatter reappears under agents/skills", () => {
    const dotfiles = makeDotfiles(["vendor-skill"], ["vendor-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-fresh-"));
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(1);
    expect(out).toContain("THIRD-PARTY:");
    expect(out).toContain('"vendor-skill"');
    cleanup(dotfiles, home);
  });

  test("global targets linked into a repo refuse with the migration task", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(
      join(dotfiles, "agents", "skills"),
      join(home, ".agents/skills"),
    );
    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(1);
    expect(out).toContain("resolves into a repository");
    expect(out).toContain("mise run skills:migrate");
    cleanup(dotfiles, home);
  });

  test("allows in-house links but refuses a declared third-party per-skill link", () => {
    const dotfiles = makeDotfiles(["acting-on-hypotheses"], ["vendor-skill"]);
    mkdirSync(join(dotfiles, "agents/vendor-payload"), { recursive: true });
    const home = makeWiredHome(dotfiles, ["acting-on-hypotheses"]);
    symlinkSync(
      join(dotfiles, "agents/vendor-payload"),
      join(home, ".claude/skills/vendor-skill"),
    );

    const { out, code } = run(args(dotfiles, home));
    expect(code).toBe(1);
    expect(out).toContain(".claude/skills/vendor-skill");
    expect(out).toContain("mise run skills:migrate");
    expect(out).not.toContain("acting-on-hypotheses");
    cleanup(dotfiles, home);
  });
});
