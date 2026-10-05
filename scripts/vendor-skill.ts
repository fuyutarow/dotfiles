// Vendor a third-party Agent Skill into this repo, via the `skills` CLI (npm `skills`,
// github.com/vercel-labs/skills). Consumer: human/agent running `mise run skills:add`.
// Output is verdict-style lines, matching link-skills.ts / link-dots.ts, not a machine envelope.
//
// WHY A WRAPPER AT ALL — four measured behaviors of the bare CLI, each of which silently
// damages this repo (1-3 probed 2026-08-14, 4 probed 2026-09-21, all against skills@1.5.22 in
// throwaway HOMEs):
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
//   4. Even WITH `--skill <name>` naming exactly one skill, `-y` also silently accepts the CLI's
//      own first-run prompt to install ITS OWN companion `find-skills` skill (source
//      vercel-labs/skills, the CLI's own repo) — a second, unrequested real directory plus a
//      second ledger entry, landing in agents/skills/ next to whatever was actually asked for.
//      Reproduced live vendoring typesafe-ai/skills --skill typesafe-ai: find-skills arrived
//      unasked, both on disk and in the ledger. `--skill` scopes the SOURCE repo's own skills;
//      it does not stop the CLI grafting on a skill from a DIFFERENT repo.
//
// So this wrapper pins the version, forces `-g`, requires explicit skill names, REFUSES a name
// this repo already owns, and imports ONLY the names asked for, so #4's stowaway never arrives.
// The one thing it does NOT reimplement is the fetch.
//
// DATA FLOWS ONE WAY (INV-8, 2026-10-06). The CLI runs with HOME set to a throwaway directory,
// so it writes nothing but that directory; THIS script is then the one writer of what enters the
// repo: each requested agents/skills/<name>/ and its entry in agents/skills-lock.json. Until then
// the CLI ran against the real HOME, where ~/.agents/skills and ~/.agents/.skill-lock.json were
// links INTO the repo — so a third-party tool wrote the repo through a deployed path, stowaways
// included, and a link aimed elsewhere sent the bytes outside it without a word. `git status`
// stays the review surface. Test seam: VENDOR_SKILL_CLI names a script run with bun in place of
// `bunx skills@…` (scripts/tests/fake-skills.ts).
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

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

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

/** Skill names this repo already owns; vendoring over one destroys it (see header note 3). */
function collidingNames(
  names: string[],
  dotfiles: string,
): { name: string; path: string }[] {
  return names
    .map((name) => ({ name, path: `${dotfiles}/agents/skills/${name}` }))
    .filter((entry) => existsSync(entry.path));
}

function isDir(p: string): boolean {
  return fromThrowable((path: string) => statSync(path))(p)
    .map((s) => s.isDirectory())
    .unwrapOr(false);
}

function listSkillDirNames(skillsDir: string): string[] {
  return fromThrowable((dir: string) => readdirSync(dir))(skillsDir)
    .map((names) =>
      names
        .filter((n) => !n.startsWith("."))
        .filter((n) => isDir(`${skillsDir}/${n}`)),
    )
    .unwrapOr([]);
}

/** A directory name that appeared during the fetch but was never in `--skill` (see header note 4). */
export function detectStowaways(
  before: string[],
  after: string[],
  requested: string[],
): string[] {
  const beforeSet = new Set(before);
  const requestedSet = new Set(requested);
  return after.filter((n) => !beforeSet.has(n) && !requestedSet.has(n));
}

// The ledger is read as a record: only `skills` is looked at, every other key is carried through.
const LedgerDocSchema = z.record(z.string(), z.unknown());

const LedgerSchema = z.looseObject({ skills: LedgerDocSchema.optional() });

/** The ledger text with `entries` merged into its `skills` (every other key and entry kept,
 * `skills` where it was), or undefined when the committed ledger is unreadable — provenance is
 * never guessed. */
export function mergeLedger(
  text: string,
  entries: Record<string, unknown>,
): string | undefined {
  const doc = jsonOf(LedgerSchema).safeParse(text);
  if (!doc.success) return undefined;
  const skills = { ...doc.data.skills, ...entries };
  return `${JSON.stringify({ ...doc.data, skills }, null, 2)}\n`;
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

  // The fetch writes only a throwaway HOME (see DATA FLOWS ONE WAY). The package cache stays the
  // real one, so a pinned CLI already fetched is not downloaded again.
  const stage = mkdtempSync(`${tmpdir()}/vendor-skill-`);
  using _stage = {
    [Symbol.dispose]: () => {
      rmSync(stage, { recursive: true, force: true });
    },
  };
  const fake = process.env.VENDOR_SKILL_CLI;
  const proc = Bun.spawnSync(
    fake === undefined ? argv : [process.execPath, fake, ...argv.slice(2)],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      timeout: FETCH_TIMEOUT_MS,
      env: {
        ...process.env,
        HOME: stage,
        BUN_INSTALL_CACHE_DIR:
          process.env.BUN_INSTALL_CACHE_DIR ?? `${home}/.bun/install/cache`,
      },
    },
  );
  if (proc.exitCode !== 0) {
    fail(`FATAL: ${SKILLS_CLI} add exited ${proc.exitCode}`);
    process.exitCode = 1;
    return;
  }

  // Verify everything before writing anything: a skill without bytes or without provenance
  // enters the repo as neither.
  const staged = `${stage}/.agents/skills`;
  const lockText = fromThrowable(() =>
    readFileSync(`${stage}/.agents/.skill-lock.json`, "utf8"),
  )();
  const lock = lockText.isOk()
    ? jsonOf(z.object({ skills: LedgerDocSchema })).safeParse(lockText.value)
    : undefined;
  const provenance = lock?.success === true ? lock.data.skills : {};
  const missing = names.filter(
    (n) =>
      !existsSync(`${staged}/${n}/SKILL.md`) || !Object.hasOwn(provenance, n),
  );
  if (missing.length > 0) {
    fail(
      `FATAL: the fetch reported success but left no SKILL.md or no ledger entry for: ${missing.join(", ")}`,
    );
    fail("  nothing was written to the repo");
    process.exitCode = 1;
    return;
  }
  const ledgerPath = `${dotfiles}/agents/skills-lock.json`;
  const ledgerText = fromThrowable(() =>
    existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "{}",
  )();
  const ledger = ledgerText.isOk()
    ? mergeLedger(
        ledgerText.value,
        Object.fromEntries(names.map((n) => [n, provenance[n]])),
      )
    : undefined;
  if (ledger === undefined) {
    fail(`FATAL: ${ledgerPath} is not a readable ledger — nothing was written`);
    process.exitCode = 1;
    return;
  }

  // Header note 4: whatever the CLI grafted on stays in the throwaway HOME.
  for (const n of detectStowaways([], listSkillDirNames(staged), names)) {
    print(
      `STOWAWAY: ignored ${n} — the CLI installed it without being asked ` +
        "(see vendor-skill.ts header note 4)",
    );
  }

  const skillsDir = `${dotfiles}/agents/skills`;
  for (const n of names) {
    rmSync(`${skillsDir}/${n}`, { recursive: true, force: true });
    cpSync(`${staged}/${n}`, `${skillsDir}/${n}`, {
      recursive: true,
      dereference: true,
    });
  }
  writeFileSync(ledgerPath, ledger);

  for (const n of names) print(`vendored: ${dotfiles}/agents/skills/${n}`);
  print(
    "next: add each one to agents/skills/README.md (lint:skills-index enforces it),",
  );
  print(
    "      then `mise run link:skills` and commit both the skill and agents/skills-lock.json.",
  );
}

// Guarded so a test can `import { detectStowaways } from "../vendor-skill.ts"` without running
// main() for real — same pattern and same reason as install-mcp.ts (see its tail comment).
// Global boundary, not a try/catch: main() is sync, so it has no `.catch()` to hang off — this
// is the sync equivalent of BG1's mandated `main().catch(...)`, a listener registered before
// main() runs rather than a local try/catch wrapped around the call.
if (import.meta.main) {
  process.on("uncaughtException", (error) => {
    if (error instanceof UsageError) {
      fail(`${error.message}\n${USAGE}`);
      process.exitCode = 2;
    } else {
      fail(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  });

  main();
  process.exit(process.exitCode ?? 0);
}
