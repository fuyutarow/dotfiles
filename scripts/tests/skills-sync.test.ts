// Every sync test uses a throwaway HOME and a fake pinned CLI. No network or real HOME writes.
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

const SCRIPT = join(import.meta.dir, "..", "skills-sync.ts");
const FAKE = join(import.meta.dir, "fake-skills.ts");

function run(dotfiles: string, home: string, marker: string) {
  const proc = Bun.spawnSync(
    ["bun", SCRIPT, "--dotfiles", dotfiles, "--home", home],
    {
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        VENDOR_SKILL_CLI: FAKE,
        FAKE_SKILLS_MARKER: marker,
      },
    },
  );
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeDotfiles(skills: { source: string; skill: string }[]): string {
  const root = mkdtempSync(join(tmpdir(), "skills-sync-dotfiles-"));
  const rows = skills
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

function makeHome(lock?: object): string {
  const home = mkdtempSync(join(tmpdir(), "skills-sync-home-"));
  mkdirSync(join(home, ".agents/skills"), { recursive: true });
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  writeFileSync(
    join(home, ".agents/.skill-lock.json"),
    `${JSON.stringify(lock ?? { version: 3, skills: {} }, null, 2)}\n`,
  );
  return home;
}

function writeInstalled(home: string, name: string, content: string): void {
  for (const base of [".agents/skills", ".claude/skills"]) {
    mkdirSync(join(home, base, name), { recursive: true });
    writeFileSync(join(home, base, name, "SKILL.md"), content);
  }
}

function cleanup(...paths: string[]): void {
  for (const path of paths) rmSync(path, { recursive: true, force: true });
}

describe("skills:sync", () => {
  test("installs only missing or out-of-date entries and reports undeclared lock entries", () => {
    const dotfiles = makeDotfiles([
      { source: "vendor/repo", skill: "alpha" },
      { source: "vendor/repo", skill: "beta" },
    ]);
    const home = makeHome({
      version: 3,
      skills: {
        alpha: { source: "vendor/repo" },
        "legacy-extra": { source: "other/repo" },
      },
    });
    const current = "# alpha (fetched)\n";
    writeInstalled(home, "alpha", current);
    mkdirSync(join(home, ".claude/skills/beta"), { recursive: true });
    writeFileSync(join(home, ".claude/skills/beta/SKILL.md"), "# stale\n");
    const marker = join(home, "cli-calls.log");

    const { out, code } = run(dotfiles, home, marker);
    expect(code).toBe(0);
    expect(out).toContain("synced: vendor/repo (beta)");
    expect(out).toContain(
      "UNDECLARED: installed third-party skill legacy-extra (left untouched)",
    );
    expect(
      readFileSync(join(home, ".agents/skills/alpha/SKILL.md"), "utf8"),
    ).toBe(current);
    expect(
      readFileSync(join(home, ".agents/skills/beta/SKILL.md"), "utf8"),
    ).toBe("# beta (fetched)\n");
    expect(existsSync(join(home, ".agents/skills/find-skills"))).toBe(false);
    expect(existsSync(join(home, ".claude/skills/find-skills"))).toBe(false);
    const lock = parseSkillLock(
      readFileSync(join(home, ".agents/.skill-lock.json"), "utf8"),
    ).unwrapOr({ skills: {} });
    expect(Object.keys(lock.skills).toSorted()).toEqual([
      "alpha",
      "beta",
      "legacy-extra",
    ]);
    const calls = readFileSync(marker, "utf8").trim().split("\n");
    expect(calls).toHaveLength(2); // one throwaway upstream fetch, one real install for beta
    expect(
      calls.every(
        (line) =>
          line.split("\t")[1]?.startsWith("/tmp/skills-cli-cwd-") ?? false,
      ),
    ).toBe(true);
    expect(calls.some((line) => line.startsWith(`${home}\t`))).toBe(true);
    cleanup(dotfiles, home);
  });

  test("leaves exact current copies alone", () => {
    const dotfiles = makeDotfiles([{ source: "vendor/repo", skill: "alpha" }]);
    const home = makeHome({
      version: 3,
      skills: { alpha: { source: "vendor/repo" } },
    });
    writeInstalled(home, "alpha", "# alpha (fetched)\n");
    const before = readFileSync(join(home, ".agents/.skill-lock.json"), "utf8");
    const marker = join(home, "cli-calls.log");
    const { out, code } = run(dotfiles, home, marker);
    expect(code).toBe(0);
    expect(out).toContain("up to date: vendor/repo (1 skill(s))");
    expect(readFileSync(join(home, ".agents/.skill-lock.json"), "utf8")).toBe(
      before,
    );
    expect(readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(1);
    expect(readFileSync(marker, "utf8")).not.toContain(`${home}\t`);
    cleanup(dotfiles, home);
  });

  test("refuses a repo-linked global target and names skills:migrate", () => {
    const dotfiles = makeDotfiles([{ source: "vendor/repo", skill: "alpha" }]);
    const home = mkdtempSync(join(tmpdir(), "skills-sync-linked-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(join(dotfiles, "agents/skills"), join(home, ".agents/skills"));
    const marker = join(home, "cli-calls.log");
    const { out, code } = run(dotfiles, home, marker);
    expect(out).toContain("resolves into a repository");
    expect(out).toContain("mise run skills:migrate");
    expect(code).toBe(3);
    expect(existsSync(marker)).toBe(false);
    cleanup(dotfiles, home);
  });
});
