// bun test characterizing the `link:skills` port (scripts/link-skills.ts) against the ORIGINAL
// shell body's behavior — see mise.toml's (now-replaced) run body / the behavior oracle this
// port was built from. Every fixture is a throwaway tmp tree passed via --dotfiles/--home; the
// real $HOME is never touched (Safety rule). Focus: the four DISTINCT prune/exclusion
// mechanisms (a/b/c/d) and the guard semantics in `link_path`, since those are the parts that
// had never had a test before this port.
import { describe, expect, test } from "bun:test";
import {
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

const SCRIPT = join(import.meta.dir, "..", "link-skills.ts");

function run(args: string[]): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

/** A minimal but complete dotfiles source tree: agents/{commands,codex,skills/<names>}. */
function makeDotfiles(skillNames: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "link-skills-dotfiles-"));
  mkdirSync(join(dir, "agents", "commands"), { recursive: true });
  writeFileSync(join(dir, "agents", "commands", "example.md"), "# example\n");
  mkdirSync(join(dir, "agents", "codex"), { recursive: true });
  writeFileSync(join(dir, "agents", "codex", "AGENTS.md"), "# AGENTS\n");
  for (const name of skillNames) {
    mkdirSync(join(dir, "agents", "skills", name), { recursive: true });
    writeFileSync(
      join(dir, "agents", "skills", name, "SKILL.md"),
      `# ${name}\n`,
    );
  }
  return dir;
}

function makeHome(): string {
  return mkdtempSync(join(tmpdir(), "link-skills-home-"));
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe("link-skills: argv contract", () => {
  test("lets Cleye strictFlags reject an ordinary unknown before link work", () => {
    const { out, code } = run(["--wat"]);
    expect(code).toBe(1);
    expect(out).toContain("Error: Unknown flag: --wat.");
    expect(out).not.toContain("linked:");
  });

  test("rejects --__proto__ before performing any link work", () => {
    const { out, code } = run(["--__proto__"]);
    expect(code).toBe(2);
    expect(out).toContain("unknown flag(s): --__proto__");
    expect(out).not.toContain("linked:");
  });

  test("rejects every String flag with no value", () => {
    for (const flag of ["--dotfiles", "--home"]) {
      const { out, code } = run([flag]);
      expect(code).toBe(2);
      expect(out).toContain(`${flag} requires a value`);
      expect(out).not.toContain("linked:");
    }
  });

  test("rejects a stray positional before performing any link work", () => {
    const { out, code } = run(["stray"]);
    expect(code).toBe(2);
    expect(out).toContain("unexpected positional argument: stray");
    expect(out).not.toContain("linked:");
  });
});

describe("link-skills: fresh run", () => {
  test("links commands, per-skill dirs, AGENTS.md, whole-tree Codex/Gemini targets", () => {
    const dotfiles = makeDotfiles(["alpha-skill", "beta-skill"]);
    const home = makeHome();
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);

    expect(code).toBe(0);
    expect(out).toContain(
      `linked: ${home}/.claude/commands -> ${dotfiles}/agents/commands`,
    );
    expect(out).toContain(
      `linked: ${home}/.claude/skills/alpha-skill -> ${dotfiles}/agents/skills/alpha-skill`,
    );
    expect(out).toContain(
      `linked: ${home}/.claude/skills/beta-skill -> ${dotfiles}/agents/skills/beta-skill`,
    );
    expect(out).toContain(
      `linked: ${home}/.codex/AGENTS.md -> ${dotfiles}/agents/codex/AGENTS.md`,
    );
    expect(out).toContain(
      `linked: ${home}/.agents/skills -> ${dotfiles}/agents/skills`,
    );
    expect(out).toContain(
      `linked: ${home}/.codex/prompts -> ${dotfiles}/agents/commands`,
    );
    expect(out).toContain(
      `linked: ${home}/.gemini/antigravity/global_workflows -> ${dotfiles}/agents/commands`,
    );
    expect(out).toContain(
      `✅ Agent link pass complete. Source root: ${dotfiles}`,
    );

    expect(readlinkSync(`${home}/.claude/skills/alpha-skill`)).toBe(
      `${dotfiles}/agents/skills/alpha-skill`,
    );
    expect(readlinkSync(`${home}/.agents/skills`)).toBe(
      `${dotfiles}/agents/skills`,
    );
    cleanup(dotfiles, home);
  });

  test("skill loop order is alphabetical (bash glob expansion sorts matches)", () => {
    const dotfiles = makeDotfiles(["zeta", "alpha", "mid"]);
    const home = makeHome();
    const { out } = run(["--dotfiles", dotfiles, "--home", home]);
    const positions = ["alpha", "mid", "zeta"].map((n) =>
      out.indexOf(`skills/${n} ->`),
    );
    const [alpha, mid, zeta] = positions;
    if (alpha === undefined || mid === undefined || zeta === undefined) {
      throw new Error("expected all three fixture skills in the output");
    }
    expect(alpha).toBeLessThan(mid);
    expect(mid).toBeLessThan(zeta);
    cleanup(dotfiles, home);
  });

  test("missing agents/skills prints skip(missing) TWICE and runs no prune pass", () => {
    const dotfiles = makeDotfiles([]);
    rmSync(join(dotfiles, "agents", "skills"), {
      recursive: true,
      force: true,
    });
    const home = makeHome();
    // Seed a dangling dotfiles-owned link that WOULD be pruned if the pass ran.
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    symlinkSync(
      `${dotfiles}/agents/skills/ghost`,
      `${home}/.claude/skills/ghost`,
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    const skipMissing = `skip (missing): ${dotfiles}/agents/skills`;
    const occurrences = out.split(skipMissing).length - 1;
    expect(occurrences).toBe(2); // once from the explicit else, once from link_path's own check
    expect(out).not.toContain("pruned");
    expect(isSymlink(`${home}/.claude/skills/ghost`)).toBe(true); // untouched
    cleanup(dotfiles, home);
  });
});

describe("link-skills: PRUNE (a) whole-dir legacy symlink", () => {
  test("an existing whole-dir symlink at ~/.claude/skills is unlinked and replaced by a real dir", () => {
    const dotfiles = makeDotfiles(["only-skill"]);
    const home = makeHome();
    const legacyTarget = mkdtempSync(join(tmpdir(), "link-skills-legacy-"));
    mkdirSync(`${home}/.claude`, { recursive: true });
    symlinkSync(legacyTarget, `${home}/.claude/skills`);

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    // Literal "~/.claude/skills" text, NOT the fixture home path — reproduces the original
    // shell's own double-quoted-tilde quirk (never expanded inside quotes).
    expect(out).toContain(
      `removed whole-dir symlink: ~/.claude/skills -> ${legacyTarget}`,
    );
    expect(isSymlink(`${home}/.claude/skills`)).toBe(false);
    expect(lstatSync(`${home}/.claude/skills`).isDirectory()).toBe(true);
    cleanup(dotfiles, home, legacyTarget);
  });

  test("no prior symlink at ~/.claude/skills: no removal message, still ends up a real dir", () => {
    const dotfiles = makeDotfiles(["only-skill"]);
    const home = makeHome();
    const { out } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(out).not.toContain("removed whole-dir symlink");
    expect(lstatSync(`${home}/.claude/skills`).isDirectory()).toBe(true);
    cleanup(dotfiles, home);
  });
});

describe("link-skills: PRUNE (b) dangling per-skill symlinks", () => {
  test("a dangling symlink into dotfiles for a renamed/deleted skill is pruned", () => {
    const dotfiles = makeDotfiles(["kept-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    const staleTarget = `${dotfiles}/agents/skills/renamed-away`;
    symlinkSync(staleTarget, `${home}/.claude/skills/renamed-away`);

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(
      `pruned (renamed/deleted): ${home}/.claude/skills/renamed-away`,
    );
    expect(isSymlink(`${home}/.claude/skills/renamed-away`)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a dangling symlink pointing OUTSIDE dotfiles is left alone", () => {
    const dotfiles = makeDotfiles(["kept-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    symlinkSync(
      "/nonexistent/somewhere/else",
      `${home}/.claude/skills/foreign`,
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).not.toContain("foreign");
    expect(isSymlink(`${home}/.claude/skills/foreign`)).toBe(true); // untouched
    cleanup(dotfiles, home);
  });

  test("a non-dangling symlink into dotfiles (still-current skill) is never pruned", () => {
    const dotfiles = makeDotfiles(["kept-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    symlinkSync(
      `${dotfiles}/agents/skills/kept-skill`,
      `${home}/.claude/skills/kept-skill`,
    );

    const { out } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(out).not.toContain(
      `pruned (renamed/deleted): ${home}/.claude/skills/kept-skill`,
    );
    cleanup(dotfiles, home);
  });

  test("a real (non-symlink) plugin-installed skill directory is never touched", () => {
    const dotfiles = makeDotfiles(["kept-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills/real-plugin-skill`, { recursive: true });
    writeFileSync(
      `${home}/.claude/skills/real-plugin-skill/SKILL.md`,
      "# plugin\n",
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).not.toContain("real-plugin-skill");
    expect(
      lstatSync(`${home}/.claude/skills/real-plugin-skill`).isDirectory(),
    ).toBe(true);
    expect(isSymlink(`${home}/.claude/skills/real-plugin-skill`)).toBe(false);
    cleanup(dotfiles, home);
  });
});

describe("link-skills: SHADOW report", () => {
  test("a real dir occupying a name this repo OWNS is named, not folded into the generic skip", () => {
    const dotfiles = makeDotfiles(["cloudflare"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills/cloudflare`, { recursive: true });
    writeFileSync(
      `${home}/.claude/skills/cloudflare/SKILL.md`,
      "# stale copy\n",
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    // Still a tolerant linker: it reports and moves on, it does not become a gate.
    expect(code).toBe(0);
    expect(out).toContain(
      `SHADOWED: ${home}/.claude/skills/cloudflare is a real path — agents/skills/cloudflare is NOT in use`,
    );
    expect(out).not.toContain(
      `skip (exists, not symlink): ${home}/.claude/skills/cloudflare`,
    );
    // And it still refuses to touch what it found.
    expect(isSymlink(`${home}/.claude/skills/cloudflare`)).toBe(false);
    expect(lstatSync(`${home}/.claude/skills/cloudflare`).isDirectory()).toBe(
      true,
    );
    cleanup(dotfiles, home);
  });

  test("dry-run reports the shadow too (it is a finding, not an action)", () => {
    const dotfiles = makeDotfiles(["cloudflare"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills/cloudflare`, { recursive: true });

    const { out, code } = run([
      "--dotfiles",
      dotfiles,
      "--home",
      home,
      "--dry-run",
    ]);
    expect(code).toBe(0);
    expect(out).toContain("SHADOWED:");
    cleanup(dotfiles, home);
  });
});

describe("link-skills: PRUNE (c) driving-claude Codex-only exclusion", () => {
  test("an existing matching symlink at driving-claude is unlinked, never relinked", () => {
    const dotfiles = makeDotfiles(["driving-claude", "other-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    symlinkSync(
      `${dotfiles}/agents/skills/driving-claude`,
      `${home}/.claude/skills/driving-claude`,
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(
      `excluded (Codex-only): ${home}/.claude/skills/driving-claude`,
    );
    expect(isSymlink(`${home}/.claude/skills/driving-claude`)).toBe(false);
    // The generic linker never runs for it (no "linked: …driving-claude" line).
    expect(out).not.toContain(`linked: ${home}/.claude/skills/driving-claude`);
    cleanup(dotfiles, home);
  });

  test("no prior symlink: still prints excluded, performs no unlink (nothing to unlink)", () => {
    const dotfiles = makeDotfiles(["driving-claude"]);
    const home = makeHome();
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(
      `excluded (Codex-only): ${home}/.claude/skills/driving-claude`,
    );
    expect(isSymlink(`${home}/.claude/skills/driving-claude`)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a driving-claude symlink pointing elsewhere is left untouched but still reported excluded", () => {
    const dotfiles = makeDotfiles(["driving-claude"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    symlinkSync("/some/other/target", `${home}/.claude/skills/driving-claude`);

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(
      `excluded (Codex-only): ${home}/.claude/skills/driving-claude`,
    );
    expect(isSymlink(`${home}/.claude/skills/driving-claude`)).toBe(true);
    expect(readlinkSync(`${home}/.claude/skills/driving-claude`)).toBe(
      "/some/other/target",
    );
    cleanup(dotfiles, home);
  });
});

describe("link-skills: PRUNE (d) stale ~/.codex/skills", () => {
  test("a symlink to agents/commands (the historical misconfiguration) is removed", () => {
    const dotfiles = makeDotfiles(["only-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.codex`, { recursive: true });
    symlinkSync(`${dotfiles}/agents/commands`, `${home}/.codex/skills`);

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    // Literal "~/.codex/skills" text, matching the shell's own unexpanded-quote quirk.
    expect(out).toContain(
      `removed stale: ~/.codex/skills -> ${dotfiles}/agents/commands`,
    );
    expect(isSymlink(`${home}/.codex/skills`)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a ~/.codex/skills symlink to anything else is left alone", () => {
    const dotfiles = makeDotfiles(["only-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.codex`, { recursive: true });
    symlinkSync("/somewhere/unrelated", `${home}/.codex/skills`);

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).not.toContain("removed stale");
    expect(isSymlink(`${home}/.codex/skills`)).toBe(true);
    cleanup(dotfiles, home);
  });
});

describe("link-skills: link_path guard", () => {
  test("refuses to overwrite a REAL (non-symlink) file/dir at the destination", () => {
    const dotfiles = makeDotfiles(["only-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude`, { recursive: true });
    mkdirSync(`${home}/.claude/commands`, { recursive: true }); // real dir, not a symlink
    writeFileSync(`${home}/.claude/commands/keepme.md`, "do not clobber\n");

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(
      `skip (exists, not symlink): ${home}/.claude/commands`,
    );
    expect(isSymlink(`${home}/.claude/commands`)).toBe(false);
    cleanup(dotfiles, home);
  });

  test("relinks a dangling pre-existing symlink at the destination (ln -sfn semantics)", () => {
    const dotfiles = makeDotfiles(["only-skill"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude`, { recursive: true });
    symlinkSync("/nowhere/at/all", `${home}/.claude/commands`);

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(
      `linked: ${home}/.claude/commands -> ${dotfiles}/agents/commands`,
    );
    expect(readlinkSync(`${home}/.claude/commands`)).toBe(
      `${dotfiles}/agents/commands`,
    );
    cleanup(dotfiles, home);
  });

  test("skip (missing) when the source path does not exist", () => {
    const dotfiles = makeDotfiles([]); // no agents/skills dir either -> also exercises that path
    rmSync(join(dotfiles, "agents", "codex", "AGENTS.md"), { force: true });
    const home = makeHome();
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain(`skip (missing): ${dotfiles}/agents/codex/AGENTS.md`);
    cleanup(dotfiles, home);
  });
});

describe("link-skills: --dry-run", () => {
  test("performs zero filesystem writes and prefixes every action with [dry-run]", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = makeHome(); // completely empty fixture home

    const { out, code } = run([
      "--dotfiles",
      dotfiles,
      "--home",
      home,
      "--dry-run",
    ]);
    expect(code).toBe(0);
    expect(out).toContain(
      `[dry-run] would link: ${home}/.claude/commands -> ${dotfiles}/agents/commands`,
    );
    expect(out).toContain(
      `[dry-run] would link: ${home}/.claude/skills/alpha-skill -> ${dotfiles}/agents/skills/alpha-skill`,
    );
    expect(out).toContain(
      `[dry-run] would set: git -C ${dotfiles} config core.hooksPath .githooks`,
    );
    expect(out).not.toContain("\nlinked:"); // no real "linked:" line ever appears
    // Zero side effects: the fixture home must remain exactly as empty as it started.
    expect(() => lstatSync(`${home}/.claude`)).toThrow();
    cleanup(dotfiles, home);
  });

  test("dry-run still reports what an existing prune/exclusion WOULD do, without doing it", () => {
    const dotfiles = makeDotfiles(["driving-claude"]);
    const home = makeHome();
    mkdirSync(`${home}/.claude/skills`, { recursive: true });
    symlinkSync(
      `${dotfiles}/agents/skills/driving-claude`,
      `${home}/.claude/skills/driving-claude`,
    );
    const staleTarget = `${dotfiles}/agents/skills/gone`;
    symlinkSync(staleTarget, `${home}/.claude/skills/gone`);

    const { out, code } = run([
      "--dotfiles",
      dotfiles,
      "--home",
      home,
      "--dry-run",
    ]);
    expect(code).toBe(0);
    expect(out).toContain(
      `[dry-run] would exclude (unlink, Codex-only): ${home}/.claude/skills/driving-claude`,
    );
    expect(out).toContain(
      `[dry-run] would prune (renamed/deleted): ${home}/.claude/skills/gone`,
    );
    // Neither was actually touched.
    expect(isSymlink(`${home}/.claude/skills/driving-claude`)).toBe(true);
    expect(isSymlink(`${home}/.claude/skills/gone`)).toBe(true);
    cleanup(dotfiles, home);
  });
});

describe("link-skills: defaults", () => {
  test("--dotfiles defaults to $DOTFILES env var when the flag is omitted", () => {
    const dotfiles = makeDotfiles(["env-skill"]);
    const home = makeHome();
    const proc = Bun.spawnSync(["bun", SCRIPT, "--home", home], {
      env: { ...process.env, DOTFILES: dotfiles },
      maxBuffer: 4 * 1024 * 1024,
    });
    const out = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode).toBe(0);
    expect(out).toContain(
      `✅ Agent link pass complete. Source root: ${dotfiles}`,
    );
    cleanup(dotfiles, home);
  });
});
