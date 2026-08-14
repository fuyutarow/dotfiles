// Vendor a third-party Agent Skill into this repo, via the `skills` CLI (npm `skills`,
// github.com/vercel-labs/skills). Consumer: human/agent running `mise run skills:add`.
// Output is verdict-style lines, matching link-skills.ts / link-dots.sh, not a machine envelope.
//
// WHY A WRAPPER AT ALL — three measured behaviors of the bare CLI, each of which silently
// damages this repo (probed 2026-08-14 against skills@1.5.22 in throwaway HOMEs):
//
//   1. Without `-g` everything is written into the CURRENT DIRECTORY: ./.agents/skills/<name>/
//      (real bytes), ./.claude/skills/<name> (relative symlink), ./agent/skills/<name>/ (a
//      SECOND real copy), and ./skills-lock.json. Run inside this repo, that litters four paths
//      none of which link-skills.ts knows about.
//   2. Without `--skill` it installs EVERY skill the source repo ships (mintlify/docs ships four:
//      mintlify, mintlify-api, doc-reader, doc-author). Without `--agent` it installs for every
//      supported agent.
//   3. `add` OVERWRITES an existing same-named directory with no prompt even without -y — a
//      fixture holding a hand-authored SKILL.md plus an extra file came back containing only
//      upstream's SKILL.md. Against agents/skills/ that destroys a house skill.
//
// So this wrapper pins the version, forces `-g`, requires explicit skill names, and REFUSES a
// name this repo already owns. The one thing it does NOT reimplement is the fetch: with `-g` the
// CLI writes to ~/.agents/skills, which link-skills.ts already points at agents/skills, so the
// bytes land in the repo on their own and `git status` is the review surface.
//
// Usage: bun scripts/vendor-skill.ts <owner/repo> --skill <name> [--skill <name>…]
//                                    [--force] [--dry-run] [--dotfiles <path>] [--home <path>]
//   --force    allow a name that already exists under agents/skills/ to be overwritten. Only
//              meaningful for re-fetching something already vendored; it CAN clobber a house
//              skill, so it is never the default and prints what it is about to replace.
//   --dry-run  print the exact command and every gate decision, run nothing.
//
// Exit: 0 vendored (or dry-run) · 1 the CLI itself failed · 2 usage · 3 a gate refused
// (batched: every violating name is reported in ONE decision, never one-at-a-time).

import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { cli } from "cleye";

/** Pinned deliberately: `add` is the one command here that can overwrite repo content. */
const SKILLS_CLI = "skills@1.5.22";

/** The fetch is network-bound and shows a progress UI; generous, but never unbounded. */
const FETCH_TIMEOUT_MS = 600_000;

const USAGE =
  "Usage: bun scripts/vendor-skill.ts <owner/repo> --skill <name> [--skill <name>…] " +
  "[--force] [--dry-run] [--dotfiles <path>] [--home <path>]\n";

class UsageError extends Error {}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): void {
  process.stderr.write(`${line}\n`);
}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name before
// assignment. Every ordinary unknown remains Cleye strictFlags' responsibility.
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

/** Raw, non-canonicalizing symlink probe — the stored target string, never resolved. */
function symlinkTarget(p: string): string | null {
  try {
    if (!lstatSync(p).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return readlinkSync(p);
}

/**
 * The load-bearing precondition. `-g` sends the real bytes to ~/.agents/skills; this repo only
 * receives them because link-skills.ts has pointed that path at agents/skills. If the link is
 * absent or aimed elsewhere, the fetch would succeed and land OUTSIDE the repo — the exact
 * invisible-copy failure this whole wrapper exists to prevent — so it is checked, never assumed.
 */
function checkUniversalWiring(home: string, dotfiles: string): string | null {
  const universal = `${home}/.agents/skills`;
  const expected = `${dotfiles}/agents/skills`;
  const target = symlinkTarget(universal);
  if (target === expected) return null;
  if (target === null && !existsSync(universal)) {
    return `${universal} does not exist — run: mise run link:skills`;
  }
  if (target === null) {
    return `${universal} is a real path, not a symlink into this repo — run: mise run link:skills`;
  }
  return `${universal} points at ${target}, not ${expected} — run: mise run link:skills`;
}

/** Skill names this repo already owns; vendoring over one destroys it (see header note 3). */
function collidingNames(
  names: string[],
  dotfiles: string,
): { name: string; path: string }[] {
  return names
    .map((name) => ({ name, path: `${dotfiles}/agents/skills/${name}` }))
    .filter((entry) => existsSync(entry.path));
}

function main(): void {
  const parsed = cli(
    {
      name: "vendor-skill.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[source]"],
      help: {
        description:
          "Vendor a third-party Agent Skill into agents/skills/ through the pinned skills CLI.",
      },
      flags: {
        skill: { type: [String] },
        force: { type: Boolean, default: false },
        dryRun: { type: Boolean, default: false },
        dotfiles: { type: nonEmptyString("--dotfiles") },
        home: { type: nonEmptyString("--home") },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  const source = parsed._.source;
  const names = parsed.flags.skill.filter((n) => n !== "");

  if (source === undefined || source === "") {
    fail(`missing <owner/repo>\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (parsed._.length > 1) {
    fail(`unexpected positional argument: ${parsed._[1]}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  // Not a style preference: omitting --skill makes the CLI install every skill the source ships
  // (four, for the mintlify/docs example), each one landing in agents/skills/ as a real commit.
  if (names.length === 0) {
    fail(
      "refusing: --skill is required. Without it the CLI installs EVERY skill in " +
        `${source}, not the one you meant. Name each skill explicitly.\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  const home = parsed.flags.home ?? process.env.HOME ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ?? process.env.DOTFILES ?? `${home}/dotfiles`;

  // Batched gate: collect every reason to refuse, then emit ONE decision. Reporting the wiring
  // problem and hiding a collision behind it would cost the caller a second round trip.
  const refusals: string[] = [];

  const wiring = checkUniversalWiring(home, dotfiles);
  if (wiring !== null) refusals.push(`WIRING: ${wiring}`);

  const collisions = collidingNames(names, dotfiles);
  if (collisions.length > 0 && !parsed.flags.force) {
    for (const { name, path } of collisions) {
      refusals.push(
        `COLLISION: ${name} — ${path} already exists. \`skills add\` overwrites a same-named ` +
          "directory with no prompt. Rename the vendored copy, or pass --force if replacing " +
          "this exact skill is what you mean.",
      );
    }
  }

  if (refusals.length > 0) {
    fail(`REFUSED (${refusals.length}):`);
    for (const r of refusals) fail(`  ${r}`);
    process.exitCode = 3;
    return;
  }

  if (collisions.length > 0) {
    for (const { path } of collisions) print(`force: will replace ${path}`);
  }

  const argv = [
    "bunx",
    SKILLS_CLI,
    "add",
    source,
    "-g",
    "--agent",
    "claude-code",
    "--agent",
    "codex",
    "-y",
    ...names.flatMap((n) => ["--skill", n]),
  ];

  if (parsed.flags.dryRun) {
    print(`[dry-run] would run: ${argv.join(" ")}`);
    for (const n of names) {
      print(`[dry-run] would vendor: ${dotfiles}/agents/skills/${n}`);
    }
    return;
  }

  const proc = Bun.spawnSync(argv, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    timeout: FETCH_TIMEOUT_MS,
  });
  if (proc.exitCode !== 0) {
    fail(`FATAL: ${SKILLS_CLI} add exited ${proc.exitCode}`);
    process.exitCode = 1;
    return;
  }

  // Post-condition: the CLI reports success per skill, but what matters here is whether the
  // bytes actually arrived on the repo side of the symlink. Verify rather than trust the banner.
  const missing = names.filter(
    (n) => !existsSync(`${dotfiles}/agents/skills/${n}/SKILL.md`),
  );
  if (missing.length > 0) {
    fail(`FATAL: no SKILL.md landed for: ${missing.join(", ")}`);
    fail(
      "  the fetch reported success but nothing reached the repo — inspect ~/.agents/skills",
    );
    process.exitCode = 1;
    return;
  }

  for (const n of names) print(`vendored: ${dotfiles}/agents/skills/${n}`);
  print(
    "next: add each one to agents/skills/README.md (lint:skills-index enforces it),",
  );
  print(
    "      then `mise run link:skills` and commit both the skill and agents/skills-lock.json.",
  );
}

try {
  main();
} catch (error) {
  if (error instanceof UsageError) {
    fail(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    fail(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
process.exit(process.exitCode ?? 0);
