// bun test for scripts/vendor-skill.ts — the gates in front of `bunx skills add`, and the import
// that follows it. Nothing here reaches the network: every case exercises a refusal, --dry-run,
// the pure helpers, or the import against scripts/tests/fake-skills.ts (VENDOR_SKILL_CLI), so the
// assertions are about the four measured hazards of the bare CLI (project-scope
// litter, install-everything, silent same-name overwrite, the uninvited find-skills companion)
// never getting the chance to happen. Fixtures are throwaway tmp trees passed via
// --dotfiles/--home; the real $HOME is never touched (Safety rule).
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
import { jsonOf, z } from "../../agents/hooks/zod.ts";

const Ledger = z.looseObject({ skills: z.record(z.string(), z.unknown()) });
import { detectStowaways, mergeLedger } from "../vendor-skill.ts";

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

describe("vendor-skill: detectStowaways (header note 4)", () => {
  test("a name that appeared but was never requested is a stowaway", () => {
    expect(
      detectStowaways(["mintlify"], ["mintlify", "find-skills"], ["mintlify"]),
    ).toEqual(["find-skills"]);
  });

  test("a requested name that newly appeared is not a stowaway", () => {
    expect(
      detectStowaways(
        ["mintlify"],
        ["mintlify", "typesafe-ai"],
        ["typesafe-ai"],
      ),
    ).toEqual([]);
  });

  test("a name that already existed before the fetch is never a stowaway", () => {
    expect(
      detectStowaways(["writing-julia"], ["writing-julia"], ["typesafe-ai"]),
    ).toEqual([]);
  });

  test("no surprises: unchanged before/after yields nothing", () => {
    expect(detectStowaways(["a", "b"], ["a", "b"], ["a"])).toEqual([]);
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

describe("vendor-skill: the import (one writer: this script, never the CLI)", () => {
  function vendor(
    dotfiles: string,
    home: string,
    env: Record<string, string> = {},
  ) {
    return run(
      [
        "acme/skills",
        "--skill",
        "typesafe-ai",
        "--dotfiles",
        dotfiles,
        "--home",
        home,
      ],
      { VENDOR_SKILL_CLI: FAKE, ...env },
    );
  }

  test("imports exactly the requested skill and its provenance; the stowaway stays behind", () => {
    const dotfiles = makeDotfiles(["writing-julia"]);
    writeFileSync(
      join(dotfiles, "agents", "skills-lock.json"),
      JSON.stringify({ version: 3, skills: { old: { source: "x/y" } } }),
    );
    // The old layout: a deployed path into the repo. The fetch must not write through it.
    const home = makeWiredHome(dotfiles);
    const { out, code } = vendor(dotfiles, home);
    expect(code).toBe(0);
    expect(out).toContain("STOWAWAY: ignored find-skills");
    expect(
      readFileSync(
        join(dotfiles, "agents", "skills", "typesafe-ai", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# typesafe-ai (fetched)\n");
    expect(existsSync(join(dotfiles, "agents", "skills", "find-skills"))).toBe(
      false,
    );
    const ledger = jsonOf(Ledger).safeParse(
      readFileSync(join(dotfiles, "agents", "skills-lock.json"), "utf8"),
    );
    expect(ledger.success).toBe(true);
    expect(ledger.data).toEqual({
      version: 3,
      skills: {
        old: { source: "x/y" },
        "typesafe-ai": { source: "acme/skills" },
      },
    });
    expect(existsSync(join(home, ".agents", ".skill-lock.json"))).toBe(false);
    cleanup(dotfiles, home);
  });

  test("a skill fetched without provenance writes nothing to the repo", () => {
    const dotfiles = makeDotfiles([]);
    const home = makeWiredHome(dotfiles);
    const { out, code } = vendor(dotfiles, home, {
      FAKE_SKILLS_NO_LEDGER: "1",
    });
    expect(code).toBe(1);
    expect(out).toContain("no SKILL.md or no ledger entry for: typesafe-ai");
    expect(existsSync(join(dotfiles, "agents", "skills", "typesafe-ai"))).toBe(
      false,
    );
    expect(existsSync(join(dotfiles, "agents", "skills-lock.json"))).toBe(
      false,
    );
    cleanup(dotfiles, home);
  });

  test("mergeLedger refuses an unreadable ledger instead of guessing", () => {
    expect(mergeLedger("{ not json", { b: 2 })).toBeUndefined();
    expect(
      mergeLedger(JSON.stringify({ skills: [] }), { b: 2 }),
    ).toBeUndefined();
  });

  test("mergeLedger keeps every other key and entry", () => {
    const merged = jsonOf(Ledger).safeParse(
      mergeLedger(JSON.stringify({ version: 3, skills: { a: 1 }, x: true }), {
        b: 2,
      }) ?? "",
    );
    expect(merged.success).toBe(true);
    expect(merged.data).toEqual({
      version: 3,
      skills: { a: 1, b: 2 },
      x: true,
    });
  });
});
