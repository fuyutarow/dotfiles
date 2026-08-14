// bun test for scripts/vendor-skill.ts — the gates in front of `bunx skills add`. Nothing here
// reaches the network: every case exercises a refusal or --dry-run, so the assertions are about
// the three measured hazards of the bare CLI (project-scope litter, install-everything, silent
// same-name overwrite) never getting the chance to happen. Fixtures are throwaway tmp trees
// passed via --dotfiles/--home; the real $HOME is never touched (Safety rule).
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

const SCRIPT = join(import.meta.dir, "..", "vendor-skill.ts");

function run(args: string[]): { out: string; code: number } {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    out: proc.stdout.toString() + proc.stderr.toString(),
    code: proc.exitCode ?? -1,
  };
}

function makeDotfiles(skillNames: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "vendor-skill-dotfiles-"));
  mkdirSync(join(dir, "agents", "skills"), { recursive: true });
  for (const name of skillNames) {
    mkdirSync(join(dir, "agents", "skills", name), { recursive: true });
    writeFileSync(
      join(dir, "agents", "skills", name, "SKILL.md"),
      `# ${name}\n`,
    );
  }
  return dir;
}

/** Home wired the way link:skills leaves it — ~/.agents/skills pointing into the repo. */
function makeWiredHome(dotfiles: string): string {
  const home = mkdtempSync(join(tmpdir(), "vendor-skill-home-"));
  mkdirSync(join(home, ".agents"), { recursive: true });
  symlinkSync(
    join(dotfiles, "agents", "skills"),
    join(home, ".agents", "skills"),
  );
  return home;
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

describe("vendor-skill: argv contract", () => {
  test("missing <owner/repo> is a usage error", () => {
    const { out, code } = run(["--skill", "mintlify"]);
    expect(code).toBe(2);
    expect(out).toContain("missing <owner/repo>");
  });

  test("lets Cleye strictFlags reject an ordinary unknown", () => {
    const { out, code } = run(["acme/skills", "--wat"]);
    expect(code).toBe(1);
    expect(out).toContain("Error: Unknown flag: --wat.");
  });

  test("rejects --__proto__", () => {
    const { out, code } = run(["--__proto__"]);
    expect(code).toBe(2);
    expect(out).toContain("unknown flag(s): --__proto__");
  });

  test("rejects a second positional", () => {
    const { out, code } = run(["acme/skills", "extra", "--skill", "x"]);
    expect(code).toBe(2);
    expect(out).toContain("unexpected positional argument: extra");
  });
});

describe("vendor-skill: --skill is mandatory", () => {
  test("omitting it refuses, naming the install-everything hazard", () => {
    const { out, code } = run(["mintlify/docs"]);
    expect(code).toBe(2);
    expect(out).toContain("--skill is required");
    expect(out).toContain("EVERY skill in mintlify/docs");
  });
});

describe("vendor-skill: WIRING gate", () => {
  test("refuses when ~/.agents/skills does not exist — the fetch would land outside the repo", () => {
    const dotfiles = makeDotfiles([]);
    const home = mkdtempSync(join(tmpdir(), "vendor-skill-bare-"));
    const { out, code } = run([
      "mintlify/docs",
      "--skill",
      "mintlify",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(3);
    expect(out).toContain("REFUSED");
    expect(out).toContain("WIRING:");
    expect(out).toContain("mise run link:skills");
    cleanup(dotfiles, home);
  });

  test("refuses when ~/.agents/skills points at another tree", () => {
    const dotfiles = makeDotfiles([]);
    const home = mkdtempSync(join(tmpdir(), "vendor-skill-wrong-"));
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync("/somewhere/else", join(home, ".agents", "skills"));
    const { out, code } = run([
      "mintlify/docs",
      "--skill",
      "mintlify",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(3);
    expect(out).toContain("points at /somewhere/else");
    cleanup(dotfiles, home);
  });
});

describe("vendor-skill: COLLISION gate", () => {
  test("refuses a name this repo already owns — `add` would overwrite it with no prompt", () => {
    const dotfiles = makeDotfiles(["writing-julia"]);
    const home = makeWiredHome(dotfiles);
    const { out, code } = run([
      "acme/skills",
      "--skill",
      "writing-julia",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(3);
    expect(out).toContain("COLLISION: writing-julia");
    expect(out).toContain("overwrites a same-named directory with no prompt");
    cleanup(dotfiles, home);
  });

  test("reports EVERY colliding name in one decision", () => {
    const dotfiles = makeDotfiles(["one", "two"]);
    const home = makeWiredHome(dotfiles);
    const { out, code } = run([
      "acme/skills",
      "--skill",
      "one",
      "--skill",
      "two",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(3);
    expect(out).toContain("REFUSED (2):");
    expect(out).toContain("COLLISION: one");
    expect(out).toContain("COLLISION: two");
    cleanup(dotfiles, home);
  });

  test("a wiring problem and a collision come back together, not one round trip each", () => {
    const dotfiles = makeDotfiles(["one"]);
    const home = mkdtempSync(join(tmpdir(), "vendor-skill-both-"));
    const { out, code } = run([
      "acme/skills",
      "--skill",
      "one",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(3);
    expect(out).toContain("REFUSED (2):");
    expect(out).toContain("WIRING:");
    expect(out).toContain("COLLISION: one");
    cleanup(dotfiles, home);
  });

  test("--force allows the overwrite and says what it is replacing", () => {
    const dotfiles = makeDotfiles(["one"]);
    const home = makeWiredHome(dotfiles);
    const { out, code } = run([
      "acme/skills",
      "--skill",
      "one",
      "--force",
      "--dry-run",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(0);
    expect(out).toContain(`force: will replace ${dotfiles}/agents/skills/one`);
    expect(out).not.toContain("REFUSED");
    cleanup(dotfiles, home);
  });
});

describe("vendor-skill: --dry-run", () => {
  test("prints the exact pinned, global, per-skill command and touches nothing", () => {
    const dotfiles = makeDotfiles([]);
    const home = makeWiredHome(dotfiles);
    const { out, code } = run([
      "mintlify/docs",
      "--skill",
      "mintlify",
      "--dry-run",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(code).toBe(0);
    expect(out).toContain(
      "[dry-run] would run: bunx skills@1.5.22 add mintlify/docs -g " +
        "--agent claude-code --agent codex -y --skill mintlify",
    );
    expect(out).toContain(
      `[dry-run] would vendor: ${dotfiles}/agents/skills/mintlify`,
    );
    expect(out).not.toContain("vendored:");
    cleanup(dotfiles, home);
  });

  test("every requested skill is passed through explicitly", () => {
    const dotfiles = makeDotfiles([]);
    const home = makeWiredHome(dotfiles);
    const { out } = run([
      "acme/skills",
      "--skill",
      "a",
      "--skill",
      "b",
      "--dry-run",
      "--dotfiles",
      dotfiles,
      "--home",
      home,
    ]);
    expect(out).toContain("--skill a --skill b");
    cleanup(dotfiles, home);
  });
});
