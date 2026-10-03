// bun test for scripts/skills-doctor.ts — the gate that fails on a shadowed skill or drifted
// vendoring wiring. Every fixture is a throwaway tmp tree passed via --dotfiles/--home; the real
// $HOME is never touched (Safety rule). The cases that matter are the two that the old silent
// `skip (exists, not symlink)` line could not tell apart: a real dir occupying a name this repo
// OWNS (defect) versus one it does not (foreign content, none of our business).
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

/** A dotfiles fixture: agents/skills/<names>/SKILL.md plus the committed ledger. */
function makeDotfiles(skillNames: string[], ledger?: object): string {
  const dir = mkdtempSync(join(tmpdir(), "skills-doctor-dotfiles-"));
  for (const name of skillNames) {
    mkdirSync(join(dir, "agents", "skills", name), { recursive: true });
    writeFileSync(
      join(dir, "agents", "skills", name, "SKILL.md"),
      `# ${name}\n`,
    );
  }
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(
    join(dir, "agents", "skills-lock.json"),
    `${JSON.stringify(ledger ?? { version: 3, skills: {}, dismissed: {} }, null, 2)}\n`,
  );
  return dir;
}

/** A home fixture already wired the way `mise run link:dots` + `link:skills` leave it. */
function makeWiredHome(dotfiles: string, skillNames: string[]): string {
  const home = mkdtempSync(join(tmpdir(), "skills-doctor-home-"));
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  mkdirSync(join(home, ".agents"), { recursive: true });
  symlinkSync(
    join(dotfiles, "agents", "skills"),
    join(home, ".agents", "skills"),
  );
  symlinkSync(
    join(dotfiles, "agents", "skills-lock.json"),
    join(home, ".agents", ".skill-lock.json"),
  );
  for (const name of skillNames) {
    symlinkSync(
      join(dotfiles, "agents", "skills", name),
      join(home, ".claude", "skills", name),
    );
  }
  return home;
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe("skills-doctor: argv contract", () => {
  test("lets Cleye strictFlags reject an ordinary unknown before checking anything", () => {
    const { out, code } = run(["--wat"]);
    expect(code).toBe(1);
    expect(out).toContain("Error: Unknown flag: --wat.");
    expect(out).not.toContain("SKILLS-WIRING");
  });

  test("rejects --__proto__ before checking anything", () => {
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

describe("skills-doctor: healthy machine", () => {
  test("fully wired home passes", () => {
    const dotfiles = makeDotfiles(["alpha-skill", "beta-skill"]);
    const home = makeWiredHome(dotfiles, ["alpha-skill", "beta-skill"]);
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).toContain("✅ SKILLS-WIRING PASS");
    cleanup(dotfiles, home);
  });

  test("a fresh clone SKIPs the machine-state checks instead of failing them", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-fresh-")); // nothing linked yet
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    // Every skip is printed: a green run must never be mistakable for a run that checked.
    expect(out).toContain("⏭ SHADOW:");
    expect(out).toContain("⏭ WIRING:");
    expect(out).toContain("⏭ LEDGER:");
    expect(out).toContain("✅ SKILLS-WIRING PASS");
    cleanup(dotfiles, home);
  });
});

describe("skills-doctor: SHADOW", () => {
  test("a real dir occupying a name this repo OWNS fails and names the remedy", () => {
    const dotfiles = makeDotfiles(["cloudflare"]);
    const home = makeWiredHome(dotfiles, []);
    mkdirSync(join(home, ".claude", "skills", "cloudflare"), {
      recursive: true,
    });
    writeFileSync(
      join(home, ".claude", "skills", "cloudflare", "SKILL.md"),
      "# stale\n",
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(1);
    expect(out).toContain("SHADOW:");
    expect(out).toContain("agents/skills/cloudflare is never read");
    expect(out).toContain("rip ");
    expect(out).toContain("SKILLS-WIRING FAIL: 1 problem(s)");
    cleanup(dotfiles, home);
  });

  test("a real dir this repo does NOT own is left alone (plugin content is not our business)", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = makeWiredHome(dotfiles, ["alpha-skill"]);
    mkdirSync(join(home, ".claude", "skills", "foreign-plugin-skill"), {
      recursive: true,
    });

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(0);
    expect(out).not.toContain("foreign-plugin-skill");
    cleanup(dotfiles, home);
  });

  test("reports EVERY shadowed skill in one pass, not just the first", () => {
    const dotfiles = makeDotfiles(["one", "two", "three"]);
    const home = makeWiredHome(dotfiles, []);
    for (const n of ["one", "two", "three"]) {
      mkdirSync(join(home, ".claude", "skills", n), { recursive: true });
    }
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(1);
    expect(out).toContain("SKILLS-WIRING FAIL: 3 problem(s)");
    cleanup(dotfiles, home);
  });
});

describe("skills-doctor: WIRING and LEDGER", () => {
  test("~/.agents/skills aimed somewhere else fails — a fetch would land outside the repo", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync("/somewhere/else", join(home, ".agents", "skills"));
    symlinkSync(
      join(dotfiles, "agents", "skills-lock.json"),
      join(home, ".agents", ".skill-lock.json"),
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(1);
    expect(out).toContain("WIRING:");
    expect(out).toContain("would land outside the repo");
    cleanup(dotfiles, home);
  });

  test("an unlinked provenance ledger fails — `skills add` output would never be committed", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-home-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(
      join(dotfiles, "agents", "skills"),
      join(home, ".agents", "skills"),
    );

    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(1);
    expect(out).toContain("LEDGER:");
    expect(out).toContain("mise run link:dots");
    cleanup(dotfiles, home);
  });

  test("a ledger entry with no skill on disk fails as an ORPHAN", () => {
    const dotfiles = makeDotfiles(["alpha-skill"], {
      version: 3,
      skills: { "gone-away": { source: "acme/skills", sourceType: "github" } },
      dismissed: {},
    });
    const home = makeWiredHome(dotfiles, ["alpha-skill"]);
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(1);
    expect(out).toContain('ORPHAN: ledger records "gone-away"');
    cleanup(dotfiles, home);
  });

  test("a missing ledger file fails rather than passing silently", () => {
    const dotfiles = makeDotfiles(["alpha-skill"]);
    rmSync(join(dotfiles, "agents", "skills-lock.json"), { force: true });
    const home = mkdtempSync(join(tmpdir(), "skills-doctor-fresh-"));
    const { out, code } = run(["--dotfiles", dotfiles, "--home", home]);
    expect(code).toBe(1);
    expect(out).toContain("ORPHAN:");
    expect(out).toContain("expected the committed ledger");
    cleanup(dotfiles, home);
  });
});
