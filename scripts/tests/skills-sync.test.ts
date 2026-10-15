// Every sync test uses a throwaway HOME and a fake pinned CLI. No network or real HOME writes.
import { describe, expect, test } from "bun:test";
import {
  chmodSync,
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
import { parseSkillLock } from "../skills-declaration.ts";

const SCRIPT = join(import.meta.dir, "..", "skills-sync.ts");
const FAKE = join(import.meta.dir, "fake-skills.ts");
const FAKE_CLAUDE = join(import.meta.dir, "fake-claude.ts");

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function fakeBin(): string {
  const bin = mkdtempSync(join(tmpdir(), "skills-sync-bin-"));
  const bun = shellQuote(process.execPath);
  writeFileSync(
    join(bin, "claude"),
    `#!/bin/sh\nexec ${bun} ${shellQuote(FAKE_CLAUDE)} "$@"\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "skills"),
    `#!/bin/sh\nexec ${bun} ${shellQuote(FAKE)} "$@"\n`,
    { mode: 0o755 },
  );
  writeFileSync(join(bin, "bunx"), '#!/bin/sh\nshift 3\nexec skills "$@"\n', {
    mode: 0o755,
  });
  chmodSync(join(bin, "claude"), 0o755);
  chmodSync(join(bin, "skills"), 0o755);
  chmodSync(join(bin, "bunx"), 0o755);
  return bin;
}

function run(
  dotfiles: string,
  home: string,
  marker: string,
  inHouseOnly = false,
  dryRun = false,
  failAfterOne = false,
) {
  const bin = fakeBin();
  using _bin = {
    [Symbol.dispose]() {
      rmSync(bin, { recursive: true, force: true });
    },
  };
  const args = ["bun", SCRIPT, "--dotfiles", dotfiles, "--home", home];
  if (inHouseOnly) args.push("--in-house-only");
  if (dryRun) args.push("--dry-run");
  const proc = Bun.spawnSync(args, {
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      VENDOR_SKILL_CLI: FAKE,
      FAKE_SKILLS_MARKER: marker,
      FAKE_SKILLS_ARGS_MARKER: `${marker}.args`,
      FAKE_CLAUDE_MARKER: `${marker}.claude`,
      FAKE_SKILLS_FAIL_AFTER_ONE: failAfterOne ? "1" : "0",
    },
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeDotfiles(
  skills: { source: string; skill: string }[],
  inHouseNames = ["house-skill"],
): string {
  const root = mkdtempSync(join(tmpdir(), "skills-sync-dotfiles-"));
  const rows = skills
    .map(
      ({ source, skill }) =>
        `\n[[skills]]\nsource = "${source}"\nskill = "${skill}"\n`,
    )
    .join("");
  mkdirSync(join(root, "agents"), { recursive: true });
  for (const name of inHouseNames) {
    mkdirSync(join(root, "agents/skills", name), { recursive: true });
    writeFileSync(
      join(root, "agents/skills", name, "SKILL.md"),
      `---\nname: ${name}\ndescription: Local fixture.\n---\n# ${name}\n`,
    );
  }
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
      "house-skill",
      "legacy-extra",
    ]);
    const calls = readFileSync(marker, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("\t"));
    expect(calls).toHaveLength(4); // Claude copy + Codex copy + upstream comparison + vendor install
    const localInstall = calls.find(
      (row) => row[2] === "add" && row[3] === join(dotfiles, "agents/skills"),
    );
    expect(
      localInstall?.[0]?.startsWith(join(tmpdir(), "skills-sync-claude-home-")),
    ).toBe(true);
    expect(localInstall?.[1]).toBe(dotfiles);
    expect(localInstall?.[4]).toBe("house-skill");
    expect(
      calls.some(
        (row) => row[0] === home && row[3] === join(dotfiles, "agents/skills"),
      ),
    ).toBe(true);
    expect(calls.filter((row) => row[3] === "vendor/repo")).toHaveLength(2);
    expect(
      calls.filter((row) => row[1]?.startsWith("/tmp/skills-cli-cwd-") ?? false)
        .length,
    ).toBe(2);
    const args = readFileSync(`${marker}.args`, "utf8");
    expect(args).toContain("-a\tclaude-code");
    expect(args).toContain("--agent\tcodex");
    expect(args).toContain("--copy");
    expect(args).toContain("-g");
    cleanup(dotfiles, home);
  });

  test("leaves exact current copies alone", () => {
    const dotfiles = makeDotfiles([{ source: "vendor/repo", skill: "alpha" }]);
    const home = makeHome({
      version: 3,
      skills: { alpha: { source: "vendor/repo" } },
    });
    writeInstalled(home, "alpha", "# alpha (fetched)\n");
    const marker = join(home, "cli-calls.log");
    const { out, code } = run(dotfiles, home, marker);
    expect(code).toBe(0);
    expect(out).toContain("up to date: vendor/repo (1 skill(s))");
    const lock = parseSkillLock(
      readFileSync(join(home, ".agents/.skill-lock.json"), "utf8"),
    ).unwrapOr({ skills: {} });
    expect(Object.keys(lock.skills).toSorted()).toEqual([
      "alpha",
      "house-skill",
    ]);
    const calls = readFileSync(marker, "utf8").trim().split("\n");
    expect(calls).toHaveLength(3); // Claude copy + Codex copy + upstream comparison
    expect(calls.some((line) => line.startsWith(`${home}\t`))).toBe(true);
    cleanup(dotfiles, home);
  });

  test("refuses an unsafe skill-root link without changing it", () => {
    const dotfiles = makeDotfiles([]);
    const home = mkdtempSync(join(tmpdir(), "skills-sync-linked-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(join(dotfiles, "agents/skills"), join(home, ".agents/skills"));
    const marker = join(home, "cli-calls.log");
    const { out, code } = run(dotfiles, home, marker);
    expect(code).toBe(3);
    expect(out).toContain("resolves into a repository");
    expect(lstatSync(join(home, ".agents/skills")).isSymbolicLink()).toBe(true);
    expect(existsSync(marker)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("copies Claude and Codex skills and uninstalls the retired plugin idempotently", () => {
    const dotfiles = makeDotfiles([]);
    const home = makeHome();
    const personal = mkdtempSync(join(tmpdir(), "skills-sync-personal-"));
    mkdirSync(join(personal, "personal-skill"));
    writeFileSync(join(personal, "personal-skill/SKILL.md"), "personal\n");
    symlinkSync(
      join(personal, "personal-skill"),
      join(home, ".claude/skills/personal-skill"),
    );
    mkdirSync(join(home, ".claude/plugins"), { recursive: true });
    writeFileSync(
      join(home, ".claude/plugins/installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "dotfiles@dotfiles": [
            { scope: "user", installPath: "/plugin/cache", version: "1.0.0" },
          ],
        },
      }),
    );
    const marker = join(home, "cli-calls.log");
    const first = run(dotfiles, home, marker);
    expect(first.code).toBe(0);
    expect(first.out).toContain(
      "declared third-party skill set matches the global lock",
    );
    expect(
      lstatSync(join(home, ".agents/skills/house-skill")).isSymbolicLink(),
    ).toBe(false);
    expect(existsSync(join(home, ".agents/skills/house-skill/SKILL.md"))).toBe(
      true,
    );
    expect(
      lstatSync(join(home, ".claude/skills/house-skill")).isSymbolicLink(),
    ).toBe(false);
    expect(
      readFileSync(join(home, ".claude/skills/house-skill/SKILL.md"), "utf8"),
    ).toContain("name: house-skill");
    expect(
      lstatSync(join(home, ".claude/skills/personal-skill")).isSymbolicLink(),
    ).toBe(true);

    const callsAfterFirst = readFileSync(`${marker}.claude`, "utf8")
      .trim()
      .split("\n");
    expect(callsAfterFirst).toContain(
      "plugin\tuninstall\tdotfiles@dotfiles\t--scope\tuser\t--json",
    );
    const skillsAfterFirst = readFileSync(`${marker}.args`, "utf8")
      .trim()
      .split("\n");
    expect(skillsAfterFirst).toHaveLength(2);
    expect(
      skillsAfterFirst.some((line) => line.includes("-a\tclaude-code")),
    ).toBe(true);
    expect(
      skillsAfterFirst.some((line) => line.includes("--agent\tcodex")),
    ).toBe(true);
    expect(skillsAfterFirst.every((line) => line.includes("--copy"))).toBe(
      true,
    );

    const second = run(dotfiles, home, marker);
    expect(second.code).toBe(0);
    const callsAfterSecond = readFileSync(`${marker}.claude`, "utf8")
      .trim()
      .split("\n");
    expect(callsAfterSecond).toHaveLength(callsAfterFirst.length);
    expect(
      callsAfterSecond.slice(callsAfterFirst.length).join("\n"),
    ).not.toContain("uninstall");
    expect(
      readFileSync(`${marker}.args`, "utf8").trim().split("\n"),
    ).toHaveLength(2);
    cleanup(dotfiles, home, personal);
  });

  test("removes stale Codex copies only for previously managed in-house names", () => {
    const dotfiles = makeDotfiles([], ["old-house-skill"]);
    const home = makeHome();
    const marker = join(home, "cli-calls.log");
    expect(run(dotfiles, home, marker).code).toBe(0);
    rmSync(join(dotfiles, "agents/skills/old-house-skill"), {
      recursive: true,
      force: true,
    });
    mkdirSync(join(dotfiles, "agents/skills/new-house-skill"), {
      recursive: true,
    });
    writeFileSync(
      join(dotfiles, "agents/skills/new-house-skill/SKILL.md"),
      "---\nname: new-house-skill\ndescription: New local fixture.\n---\n# New\n",
    );

    const result = run(dotfiles, home, marker);
    expect(result.code).toBe(0);
    expect(existsSync(join(home, ".agents/skills/old-house-skill"))).toBe(
      false,
    );
    expect(
      existsSync(join(home, ".agents/skills/new-house-skill/SKILL.md")),
    ).toBe(true);
    const invocations = readFileSync(`${marker}.args`, "utf8");
    expect(invocations).toContain(
      "remove\told-house-skill\t-g\t--agent\tcodex\t-y",
    );
    expect(invocations).not.toContain("remove\talpha");
    cleanup(dotfiles, home);
  });

  test("partial Claude install failure preserves every existing in-house copy", () => {
    const dotfiles = makeDotfiles([], ["alpha", "beta"]);
    const home = makeHome({
      version: 3,
      skills: { "retired-house": { source: join(dotfiles, "agents/skills") } },
    });
    const oldAlpha = "# alpha before sync\n";
    const oldBeta = "# beta before sync\n";
    writeInstalled(home, "alpha", oldAlpha);
    writeInstalled(home, "beta", oldBeta);
    mkdirSync(join(home, ".claude/skills/retired-house"), { recursive: true });
    writeFileSync(
      join(home, ".claude/skills/retired-house/SKILL.md"),
      "old Claude\n",
    );
    mkdirSync(join(home, ".agents/skills/retired-house"), { recursive: true });
    writeFileSync(
      join(home, ".agents/skills/retired-house/SKILL.md"),
      "old Codex\n",
    );
    writeFileSync(
      join(home, ".agents/.dotfiles-skills.json"),
      JSON.stringify({ version: 1, skills: { "retired-house": "old" } }),
    );

    const marker = join(home, "cli-calls.log");
    const result = run(dotfiles, home, marker, false, false, true);
    expect(result.code).toBe(1);
    expect(result.out).toContain("skills add for Claude exited 17");
    expect(
      readFileSync(join(home, ".claude/skills/alpha/SKILL.md"), "utf8"),
    ).toBe(oldAlpha);
    expect(
      readFileSync(join(home, ".claude/skills/beta/SKILL.md"), "utf8"),
    ).toBe(oldBeta);
    expect(
      readFileSync(join(home, ".agents/skills/alpha/SKILL.md"), "utf8"),
    ).toBe(oldAlpha);
    expect(
      readFileSync(join(home, ".agents/skills/beta/SKILL.md"), "utf8"),
    ).toBe(oldBeta);
    expect(existsSync(join(home, ".claude/skills/retired-house"))).toBe(true);
    expect(existsSync(join(home, ".agents/skills/retired-house"))).toBe(true);
    cleanup(dotfiles, home);
  });

  test("in-house-only sync skips third-party fetching", () => {
    const dotfiles = makeDotfiles([{ source: "vendor/repo", skill: "alpha" }]);
    const home = makeHome();
    const marker = join(home, "cli-calls.log");
    const result = run(dotfiles, home, marker, true);
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "in-house Claude and Codex copies are in sync",
    );
    expect(readFileSync(marker, "utf8")).not.toContain("vendor/repo");
    cleanup(dotfiles, home);
  });

  test("dry-run prints the full plan and invokes no tool CLIs", () => {
    const dotfiles = makeDotfiles([{ source: "vendor/repo", skill: "alpha" }]);
    const home = makeHome();
    const marker = join(home, "cli-calls.log");
    const link = join(home, ".claude/skills/house-skill");
    const lock = readFileSync(join(home, ".agents/.skill-lock.json"), "utf8");
    symlinkSync(join(dotfiles, "agents/skills/house-skill"), link);

    const result = run(dotfiles, home, marker, false, true);
    expect(result.code).toBe(0);
    const lines = result.out.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.startsWith("[dry-run] would "))).toBe(
      true,
    );
    expect(result.out).toContain(
      "[dry-run] would uninstall dotfiles@dotfiles from every installed scope",
    );
    expect(result.out).toContain(
      `[dry-run] would copy-install Claude skill house-skill: bunx --bun --yes skills@1.5.22 add ${join(dotfiles, "agents/skills")} --skill house-skill -g -a claude-code --copy -y`,
    );
    expect(result.out).toContain(
      "[dry-run] would compare and reconcile third-party skills from vendor/repo: alpha",
    );
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(`${marker}.args`)).toBe(false);
    expect(existsSync(`${marker}.claude`)).toBe(false);
    expect(readFileSync(join(home, ".agents/.skill-lock.json"), "utf8")).toBe(
      lock,
    );
    expect(existsSync(join(home, ".agents/.dotfiles-skills.json"))).toBe(false);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    cleanup(dotfiles, home);
  });
});
