// Tests for skills:add. Every CLI invocation receives a throwaway HOME; the real HOME and network
// are never touched. The fake preserves the pinned CLI's global target and find-skills behavior.
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkillLock } from "../skills-declaration.ts";

const FAKE = join(import.meta.dir, "fake-skills.ts");
const SCRIPT = join(import.meta.dir, "..", "vendor-skill.ts");

function run(
  args: string[],
  env: Record<string, string> = {},
): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeDotfiles(
  inHouseNames: string[] = [],
  declared: { source: string; skill: string }[] = [],
): string {
  const root = mkdtempSync(join(tmpdir(), "skills-add-dotfiles-"));
  for (const name of inHouseNames) {
    mkdirSync(join(root, "agents/skills", name), { recursive: true });
    writeFileSync(
      join(root, "agents/skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: In-house fixture.\n---\n# ${name}\n`,
    );
  }
  const rows = declared
    .map(
      ({ source, skill }) =>
        `\n[[skills]]\nsource = "${source}"\nskill = "${skill}"\n`,
    )
    .join("");
  mkdirSync(join(root, "agents"), { recursive: true });
  writeFileSync(
    join(root, "agents/skills.thirdparty.toml"),
    `cli_version = "1.5.22"\n${rows}`,
  );
  return root;
}

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "skills-add-home-"));
  mkdirSync(join(home, ".agents/skills"), { recursive: true });
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  writeFileSync(
    join(home, ".agents/.skill-lock.json"),
    '{"version":3,"skills":{}}\n',
  );
  return home;
}

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

const flags = (dotfiles: string, home: string) => [
  "--dotfiles",
  dotfiles,
  "--home",
  home,
];

const fakeEnv = { VENDOR_SKILL_CLI: FAKE };

describe("skills:add argv", () => {
  test("requires a source and explicit --skill names", () => {
    const missing = run(["--skill", "mintlify"]);
    expect(missing.code).toBe(2);
    expect(missing.out).toContain("missing <owner/repo>");
    const all = run(["mintlify/docs"]);
    expect(all.code).toBe(2);
    expect(all.out).toContain("--skill is required");
    expect(all.out).toContain("EVERY skill");
  });

  test("rejects ordinary unknown, prototype, and extra positional arguments", () => {
    expect(run(["acme/skills", "--wat"]).code).toBe(1);
    expect(run(["--__proto__"]).code).toBe(2);
    expect(run(["acme/skills", "extra", "--skill", "one"]).code).toBe(2);
  });
});

describe("skills:add refusal gates", () => {
  test("refuses an in-house name before invoking the CLI", () => {
    const dotfiles = makeDotfiles(["writing-julia"]);
    const home = makeHome();
    const marker = join(home, "calls.log");
    const { out, code } = run(
      ["acme/skills", "--skill", "writing-julia", ...flags(dotfiles, home)],
      { ...fakeEnv, FAKE_SKILLS_MARKER: marker },
    );
    expect(code).toBe(3);
    expect(out).toContain("COLLISION: writing-julia");
    expect(existsSync(marker)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("refuses an already declared skill and directs to sync", () => {
    const dotfiles = makeDotfiles(
      [],
      [{ source: "acme/skills", skill: "known" }],
    );
    const home = makeHome();
    const { out, code } = run(
      ["acme/skills", "--skill", "known", ...flags(dotfiles, home)],
      fakeEnv,
    );
    expect(code).toBe(3);
    expect(out).toContain("DECLARED: known");
    expect(out).toContain("mise run skills:sync");
    cleanup(dotfiles, home);
  });

  test("refuses a global target that resolves into a repo and names migration", () => {
    const dotfiles = makeDotfiles();
    const home = mkdtempSync(join(tmpdir(), "skills-add-linked-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(join(dotfiles, "agents/skills"), join(home, ".agents/skills"));
    const marker = join(home, "calls.log");
    const { out, code } = run(
      ["acme/skills", "--skill", "new-skill", ...flags(dotfiles, home)],
      { ...fakeEnv, FAKE_SKILLS_MARKER: marker },
    );
    expect(out).toContain("resolves into a repository");
    expect(out).toContain("mise run skills:migrate");
    expect(code).toBe(3);
    expect(existsSync(marker)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("refuses to overwrite an installed but undeclared global skill", () => {
    const dotfiles = makeDotfiles();
    const home = makeHome();
    mkdirSync(join(home, ".agents/skills/foreign"), { recursive: true });
    writeFileSync(join(home, ".agents/skills/foreign/SKILL.md"), "# keep\n");
    const marker = join(home, "calls.log");
    const { out, code } = run(
      ["acme/skills", "--skill", "foreign", ...flags(dotfiles, home)],
      { ...fakeEnv, FAKE_SKILLS_MARKER: marker },
    );
    expect(code).toBe(3);
    expect(out).toContain("INSTALLED: foreign");
    expect(existsSync(marker)).toBe(false);
    cleanup(dotfiles, home);
  });
});

describe("skills:add install", () => {
  test("uses the pinned global command on a throwaway cwd and appends only requested rows", () => {
    const dotfiles = makeDotfiles();
    const home = makeHome();
    mkdirSync(join(home, ".agents/skills/kept"), { recursive: true });
    writeFileSync(join(home, ".agents/skills/kept/SKILL.md"), "# keep\n");
    writeFileSync(
      join(home, ".agents/.skill-lock.json"),
      JSON.stringify({ version: 3, skills: { kept: { source: "old/repo" } } }),
    );
    const before = readFileSync(
      join(dotfiles, "agents/skills.thirdparty.toml"),
      "utf8",
    );
    const { out, code } = run(
      [
        "vendor/repo",
        "--skill",
        "alpha",
        "--skill",
        "beta",
        ...flags(dotfiles, home),
      ],
      fakeEnv,
    );
    expect(code).toBe(0);
    expect(out).toContain(
      "STOWAWAY: removed new unrequested global skill find-skills",
    );
    expect(out).toContain("installed: vendor/repo alpha");
    expect(
      readFileSync(join(home, ".agents/skills/alpha/SKILL.md"), "utf8"),
    ).toBe("# alpha (fetched)\n");
    expect(existsSync(join(home, ".claude/skills/beta/SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".agents/skills/find-skills"))).toBe(false);
    expect(existsSync(join(home, ".claude/skills/find-skills"))).toBe(false);
    const lock = parseSkillLock(
      readFileSync(join(home, ".agents/.skill-lock.json"), "utf8"),
    ).unwrapOr({ skills: {} });
    expect(Object.keys(lock.skills).toSorted()).toEqual([
      "alpha",
      "beta",
      "kept",
    ]);
    const declaration = readFileSync(
      join(dotfiles, "agents/skills.thirdparty.toml"),
      "utf8",
    );
    expect(declaration).toContain('source = "vendor/repo"\nskill = "alpha"');
    expect(declaration).toContain('source = "vendor/repo"\nskill = "beta"');
    expect(declaration.startsWith('cli_version = "1.5.22"')).toBe(true);
    expect(declaration).not.toBe(before);
    expect(existsSync(join(dotfiles, ".agents"))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("dry-run prints the measured CLI command and changes no files", () => {
    const dotfiles = makeDotfiles();
    const home = makeHome();
    const before = readFileSync(
      join(dotfiles, "agents/skills.thirdparty.toml"),
      "utf8",
    );
    const { out, code } = run([
      "mintlify/docs",
      "--skill",
      "mintlify",
      "--dry-run",
      ...flags(dotfiles, home),
    ]);
    expect(code).toBe(0);
    expect(out).toContain(
      "bunx --bun --yes skills@1.5.22 add mintlify/docs --skill mintlify -g --agent claude-code codex --copy -y",
    );
    expect(
      readFileSync(join(dotfiles, "agents/skills.thirdparty.toml"), "utf8"),
    ).toBe(before);
    expect(existsSync(join(home, ".agents/skills/mintlify"))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("does not declare a successful CLI response without a lock record", () => {
    const dotfiles = makeDotfiles();
    const home = makeHome();
    const before = readFileSync(
      join(dotfiles, "agents/skills.thirdparty.toml"),
      "utf8",
    );
    const { out, code } = run(
      ["vendor/repo", "--skill", "alpha", ...flags(dotfiles, home)],
      { ...fakeEnv, FAKE_SKILLS_NO_LEDGER: "1", FAKE_SKILLS_STOWAWAY: "0" },
    );
    expect(code).toBe(1);
    expect(out).toContain("without installing and recording: alpha");
    expect(
      readFileSync(join(dotfiles, "agents/skills.thirdparty.toml"), "utf8"),
    ).toBe(before);
    cleanup(dotfiles, home);
  });
});
