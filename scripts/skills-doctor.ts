// The gate that would have caught the 2026-05→08 shadowing. Consumer: `mise run lint:skills-wiring`
// (wired into `mise run lint`) and any human running it directly. Output is verdict-style lines
// plus a final PASS/FAIL, matching link-skills.ts / link-dots.sh.
//
// WHAT WENT WRONG, AND WHY A LINT CHECK IS THE FIX: link-skills.ts refuses to clobber a real
// directory at ~/.claude/skills/<name>, which is correct — content this repo does not own must
// survive. But when the repo DOES own that name, the refusal means the repo's copy is never
// linked and never read, while the stale real directory is what the agent actually loads. That
// state is silent: the linker prints one `skip` line among sixty and exits 0. Eight skills sat
// shadowed for roughly three months. The linker stays tolerant; THIS is where it becomes loud.
//
// Machine-state checks are skipped, not failed, when the relevant home directory is absent — on
// a fresh clone (or CI) nothing has been linked yet and there is nothing to be wrong about.
// Every skip prints, so a green run can never be mistaken for a run that checked something.
//
// Usage: bun scripts/skills-doctor.ts [--dotfiles <path>] [--home <path>]
// Exit: 0 every check passed or was skipped · 1 at least one FAIL · 2 usage.

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { cli } from "cleye";

const USAGE =
  "Usage: bun scripts/skills-doctor.ts [--dotfiles <path>] [--home <path>]\n";

class UsageError extends Error {}

type Finding = { level: "FAIL" | "SKIP"; line: string };

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`unknown flag(s): --${flag}`);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new UsageError(`${flag} requires a value`);
    return value;
  };
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function symlinkTarget(p: string): string | null {
  try {
    if (!lstatSync(p).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return readlinkSync(p);
}

/** True when p exists on disk as something OTHER than a symlink (a real file or directory). */
function isRealPath(p: string): boolean {
  try {
    return !lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function listSkillNames(skillsDir: string): string[] {
  try {
    return readdirSync(skillsDir)
      .filter((n) => !n.startsWith("."))
      .filter((n) => isDir(`${skillsDir}/${n}`))
      .sort();
  } catch {
    return [];
  }
}

/** Every agents/skills/<name> this repo owns must reach Claude Code as a link, not be masked. */
function checkShadowing(home: string, dotfiles: string): Finding[] {
  const claudeSkills = `${home}/.claude/skills`;
  if (!isDir(claudeSkills)) {
    return [
      {
        level: "SKIP",
        line: `SHADOW: ${claudeSkills} absent — nothing linked yet`,
      },
    ];
  }
  const findings: Finding[] = [];
  for (const name of listSkillNames(`${dotfiles}/agents/skills`)) {
    const dst = `${claudeSkills}/${name}`;
    if (!isRealPath(dst)) continue;
    findings.push({
      level: "FAIL",
      line:
        `SHADOW: ${dst} is a real path, so agents/skills/${name} is never read. ` +
        `Compare with \`diff -rq ${dotfiles}/agents/skills/${name} ${dst}\`, then ` +
        `\`rip ${dst} && mise run link:skills\`.`,
    });
  }
  return findings;
}

/**
 * ~/.agents/skills is the cross-agent ("universal") skill home: Codex reads it directly, and
 * `skills add -g` writes real bytes into it. Pointing it at this repo is what makes a vendored
 * skill land in git instead of in an untracked corner of $HOME.
 */
function checkUniversalWiring(home: string, dotfiles: string): Finding[] {
  const universal = `${home}/.agents/skills`;
  const expected = `${dotfiles}/agents/skills`;
  if (!existsSync(`${home}/.agents`)) {
    return [
      {
        level: "SKIP",
        line: `WIRING: ${home}/.agents absent — nothing linked yet`,
      },
    ];
  }
  const target = symlinkTarget(universal);
  if (target === expected) return [];
  return [
    {
      level: "FAIL",
      line:
        `WIRING: ${universal} should be a symlink to ${expected} but is ` +
        `${target === null ? "not a symlink" : `aimed at ${target}`}. ` +
        "A vendored skill fetched now would land outside the repo. Run: mise run link:skills",
    },
  ];
}

/** The provenance ledger only reaches git because ~/.agents/.skill-lock.json is a link into it. */
function checkLedgerWiring(home: string, dotfiles: string): Finding[] {
  const ledger = `${home}/.agents/.skill-lock.json`;
  const expected = `${dotfiles}/agents/skills-lock.json`;
  if (!existsSync(`${home}/.agents`)) {
    return [
      {
        level: "SKIP",
        line: `LEDGER: ${home}/.agents absent — nothing linked yet`,
      },
    ];
  }
  const target = symlinkTarget(ledger);
  if (target === expected) return [];
  return [
    {
      level: "FAIL",
      line:
        `LEDGER: ${ledger} should be a symlink to ${expected} but is ` +
        `${target === null ? "not a symlink" : `aimed at ${target}`}. ` +
        "Provenance written by `skills add` would never be committed. Run: mise run link:dots",
    },
  ];
}

/** A ledger entry with no skill on disk means the record and the tree disagree. */
function checkLedgerOrphans(dotfiles: string): Finding[] {
  const path = `${dotfiles}/agents/skills-lock.json`;
  if (!existsSync(path)) {
    return [
      {
        level: "FAIL",
        line: `ORPHAN: ${path} is missing — expected the committed ledger`,
      },
    ];
  }
  let names: string[];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const skills =
      typeof parsed === "object" && parsed !== null && "skills" in parsed
        ? (parsed as { skills: unknown }).skills
        : undefined;
    names =
      typeof skills === "object" && skills !== null
        ? Object.keys(skills).sort()
        : [];
  } catch (error) {
    return [
      {
        level: "FAIL",
        line: `ORPHAN: ${path} is not readable JSON — ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
  return names
    .filter((n) => !existsSync(`${dotfiles}/agents/skills/${n}/SKILL.md`))
    .map((n) => ({
      level: "FAIL" as const,
      line: `ORPHAN: ledger records "${n}" but agents/skills/${n}/SKILL.md does not exist`,
    }));
}

function main(): void {
  const parsed = cli(
    {
      name: "skills-doctor.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Fail loudly when a repo-owned skill is shadowed or the vendoring wiring has drifted.",
      },
      flags: {
        dotfiles: { type: nonEmptyString("--dotfiles") },
        home: { type: nonEmptyString("--home") },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (parsed._.length > 0) {
    process.stderr.write(
      `unexpected positional argument: ${parsed._[0]}\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  const home = parsed.flags.home ?? process.env.HOME ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ?? process.env.DOTFILES ?? `${home}/dotfiles`;

  const findings = [
    ...checkShadowing(home, dotfiles),
    ...checkUniversalWiring(home, dotfiles),
    ...checkLedgerWiring(home, dotfiles),
    ...checkLedgerOrphans(dotfiles),
  ];

  for (const f of findings)
    print(`${f.level === "FAIL" ? "❌" : "⏭"} ${f.line}`);

  const failures = findings.filter((f) => f.level === "FAIL").length;
  if (failures > 0) {
    print(`SKILLS-WIRING FAIL: ${failures} problem(s)`);
    process.exitCode = 1;
    return;
  }
  print("✅ SKILLS-WIRING PASS: no shadowed skill, wiring and ledger intact");
}

try {
  main();
} catch (error) {
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
process.exit(process.exitCode ?? 0);
