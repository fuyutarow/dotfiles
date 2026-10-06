// Port of mise task `link:skills` (see mise.toml). Structural port only — same links, same
// guards, same four prune mechanisms, same clean-run printed lines as the original shell body. Consumer:
// human/agent running `mise run link:skills` — output is verdict-style lines meant for
// eyeballing (linked/skip/pruned/SHADOWED), not a machine envelope, matching the shell original.
//
// Links agents/commands + agents/skills from this dotfiles repo into Claude Code, Codex, and
// Gemini's config directories, and prunes stale links that a rename/delete would otherwise
// leave dangling. Four DISTINCT prune/exclusion mechanisms, do not conflate them:
//   (a) ~/.claude/skills legacy whole-dir symlink -> unlinked unconditionally if IS a symlink
//       at all (no target check), then recreated as a real directory.
//   (b) ~/.claude/skills/<name> per-skill -> pruned only if symlink AND dangling AND its raw
//       (non-canonicalized) target starts with "<dotfiles>/".
//   (c) ~/.codex/skills -> unlinked only if its raw target is EXACTLY "<dotfiles>/agents/commands"
//       (cleanup of one specific historical misconfiguration).
// Real plugin-installed skill directories (not symlinks) are never touched by any of the four.
// A real directory occupying a name this repo DOES own is reported as "SHADOWED: …" rather than
// the generic skip, because that case is a defect and not content worth protecting. It is still
// left untouched here; `mise run lint:skills-wiring` is the check that actually fails on it.
//
// Two printed strings intentionally hardcode a literal "~/..." rather than interpolating the
// actual home path — this reproduces the ORIGINAL shell's own quirk (its echo used a
// double-quoted "~/..." literal, which bash never tilde-expands inside quotes, unlike the
// unquoted `~/...` arguments used everywhere else in that script, which the shell DOES expand
// before the function/command ever sees them). Preserved verbatim, not "fixed".
//
// Usage: bun scripts/link-skills.ts [--dry-run] [--dotfiles <path>] [--home <path>]
//   --dotfiles defaults to $DOTFILES, else "<home>/dotfiles" (matches the shell default).
//   --home     defaults to $HOME, else os.homedir() — pass a fixture dir to test without
//              touching the real one.
//   --dry-run  prints every intended link/unlink/prune as "[dry-run] would …" and performs
//              zero filesystem writes (no mkdir, no symlink, no unlink, no git config).
//
// Mutation failures are reported at their call site and counted, but never stop later links or
// prunes. A completed pass exits 1 when any unlink/symlink failed. Usage failures happen before
// that path: Cleye strictFlags rejects ordinary unknown flags with its native exit 1, while the
// local compatibility guard rejects its missed `--__proto__` edge with exit 2. Neither path
// performs linking/pruning, so a typo'd `--dry-run` can never silently run a real mutation pass.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { cli } from "cleye";
import { err, fromThrowable, ok, type Result } from "neverthrow";

const USAGE =
  "Usage: bun scripts/link-skills.ts [--dry-run] [--dotfiles <path>] [--home <path>]\n";

class UsageError extends Error {}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name before
// assignment. Every ordinary unknown remains Cleye strictFlags' responsibility.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`unknown flag(s): --${flag}\n${USAGE}`);
    process.exit(2);
  }
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

let linkOperationFailures = 0;

function reportLinkOperation(
  operation: "unlink" | "symlink" | "prune",
  path: string,
  fn: () => void,
): boolean {
  const result = fromThrowable(fn)();
  if (result.isOk()) return true;
  linkOperationFailures += 1;
  const reason =
    result.error instanceof Error ? result.error.message : String(result.error);
  print(`cannot ${operation} ${path}: ${reason}`);
  return false;
}

/**
 * Runs best-effort directory setup. Link mutations use reportLinkOperation so failures remain
 * visible and contribute to the final exit status.
 */
function tryOp(fn: () => void): void {
  fromThrowable(fn)();
}

/** Directory-follows check: mirrors POSIX `[ -d p ]` (false for missing/non-dir, no throw). */
function isDir(p: string): boolean {
  return fromThrowable((path: string) => statSync(path))(p)
    .map((s) => s.isDirectory())
    .unwrapOr(false);
}

/**
 * Raw, non-canonicalizing symlink probe: mirrors `[ -L p ]` combined with a bare `readlink p`
 * (the literal stored target string, never resolved via `-f`/`-e`). Returns null when p is not
 * a symlink at all, including "does not exist".
 */
function symlinkTarget(p: string): string | null {
  const lstat = fromThrowable((path: string) => lstatSync(path))(p);
  if (lstat.isErr() || !lstat.value.isSymbolicLink()) return null;
  return readlinkSync(p);
}

/**
 * Mirrors `[ -L dst ] || [ ! -e dst ]` — the shell guard `link_path` uses to decide whether it
 * may (re)write dst. `-e`/`existsSync` alone can't distinguish "no path" from "dangling
 * symlink"; combining it with the `-L`/lstat check does.
 */
function isSymlinkOrAbsent(p: string): boolean {
  const isSymlink = fromThrowable((path: string) => lstatSync(path))(p)
    .map((s) => s.isSymbolicLink())
    .unwrapOr(false);
  return isSymlink || !existsSync(p);
}

/**
 * Sorted directory listing (bash pathname expansion sorts glob matches); [] if unreadable.
 * Dot-prefixed entries are excluded to match bash's default (non-dotglob) globbing in both
 * call sites this feeds (the per-skill "agents/skills" glob and the "~/.claude/skills" glob),
 * which never match hidden entries unless `shopt -s dotglob` is set (it is not, in the original).
 */
function listEntries(dir: string): string[] {
  return fromThrowable((path: string) => readdirSync(path))(dir)
    .map((names) => names.filter((n) => !n.startsWith(".")).toSorted())
    .unwrapOr([]);
}

/**
 * `link_path` from the shell body. Refuses to touch dst when it exists as a REAL file/dir
 * (never overwrites plugin-installed content); force-relinks (`ln -sfn` semantics: unlink then
 * symlink, never a naive `symlink` that would throw EEXIST or nest inside an existing dir
 * symlink) whenever dst is a symlink (dangling or not) or simply absent.
 */
function linkPath(src: string, dst: string, dryRun: boolean): void {
  if (!existsSync(src)) {
    print(`skip (missing): ${src}`);
    return;
  }
  if (!dryRun) {
    // `mkdir -p "$(dirname "$dst")"` has no `&&`/`set -e` gate in the original — a failure
    // prints its own stderr and falls through to the next line regardless.
    tryOp(() => {
      mkdirSync(dirname(dst), { recursive: true });
    });
  }
  if (isSymlinkOrAbsent(dst)) {
    if (dryRun) {
      print(`[dry-run] would link: ${dst} -> ${src}`);
      return;
    }
    const destinationIsSymlink = fromThrowable((path: string) =>
      lstatSync(path),
    )(dst)
      .map((stat) => stat.isSymbolicLink())
      .unwrapOr(false);
    const unlinked =
      !destinationIsSymlink ||
      reportLinkOperation("unlink", dst, () => {
        unlinkSync(dst);
      });
    const linked = reportLinkOperation("symlink", dst, () => {
      symlinkSync(src, dst);
    });
    if (unlinked && linked) print(`linked: ${dst} -> ${src}`);
  } else {
    print(`skip (exists, not symlink): ${dst}`);
  }
}

/**
 * One skill directory under agents/skills: link it or report a shadowed destination.
 */
function linkSkill(
  name: string,
  dotfilesSkillsDir: string,
  claudeSkillsDir: string,
  dryRun: boolean,
): void {
  // SHADOW report. linkPath's refusal to clobber a real directory is correct and stays, but
  // its generic "skip (exists, not symlink)" line reads the same whether the destination is
  // foreign content worth protecting or a stale copy MASKING this repo's own skill. Only the
  // second case is a defect, and only here can it be told apart — the loop already knows the
  // repo owns this name. Eight skills were masked this way for ~3 months behind that generic
  // line. Naming the consequence is all that changes; the exit status stays 0 (this script is
  // a tolerant linker, never a gate) and `mise run lint:skills-wiring` is what actually fails.
  const claudeDst = `${claudeSkillsDir}/${name}`;
  if (!isSymlinkOrAbsent(claudeDst)) {
    print(
      `SHADOWED: ${claudeDst} is a real path — agents/skills/${name} is NOT in use ` +
        "(run: mise run lint:skills-wiring)",
    );
    return;
  }
  linkPath(`${dotfilesSkillsDir}/${name}`, claudeDst, dryRun);
}

function linkSkills(
  dotfilesSkillsDir: string,
  claudeSkillsDir: string,
  dryRun: boolean,
): void {
  for (const name of listEntries(dotfilesSkillsDir).filter((n) =>
    isDir(`${dotfilesSkillsDir}/${n}`),
  )) {
    if (!existsSync(`${dotfilesSkillsDir}/${name}/SKILL.md`)) {
      print(`skip (no SKILL.md): ${dotfilesSkillsDir}/${name}`);
      continue;
    }
    linkSkill(name, dotfilesSkillsDir, claudeSkillsDir, dryRun);
  }
}

/**
 * Prune (b): remove one dangling, dotfiles-owned skill symlink under ~/.claude/skills so a
 * rename/delete in agents/skills doesn't leave Claude listing a skill that's gone. No-op for
 * anything else: not a symlink, not dangling, or not owned by this dotfiles checkout.
 */
function pruneDanglingSkillLink(
  name: string,
  claudeSkillsDir: string,
  dotfiles: string,
  dryRun: boolean,
): void {
  const old = `${claudeSkillsDir}/${name}`;
  const target = symlinkTarget(old);
  if (target === null) return; // not a symlink
  if (existsSync(old)) return; // not dangling
  if (!target.startsWith(`${dotfiles}/`)) return; // not dotfiles-owned
  if (dryRun) {
    print(`[dry-run] would prune (renamed/deleted): ${old}`);
    return;
  }
  if (
    !reportLinkOperation("prune", old, () => {
      unlinkSync(old);
    })
  )
    return;
  print(`pruned (renamed/deleted): ${old}`);
}

/**
 * Prune a repo-owned per-skill link whose target directory is no longer a skill. Unlike the
 * dangling-link pass, this catches empty archive leftovers that still exist in the checkout.
 */
function pruneLinkWithoutSkillMd(
  name: string,
  skillsDir: string,
  dotfiles: string,
  dryRun: boolean,
): void {
  const old = `${skillsDir}/${name}`;
  const target = symlinkTarget(old);
  if (target === null || !target.startsWith(`${dotfiles}/`)) return;
  if (!isDir(old) || existsSync(`${old}/SKILL.md`)) return;
  if (dryRun) {
    print(`[dry-run] would prune (no SKILL.md): ${old}`);
    return;
  }
  if (
    !reportLinkOperation("prune", old, () => {
      unlinkSync(old);
    })
  )
    return;
  print(`pruned (no SKILL.md): ${old}`);
}

function pruneLinksWithoutSkillMd(
  skillsDir: string,
  dotfiles: string,
  dryRun: boolean,
): void {
  for (const name of listEntries(skillsDir)) {
    pruneLinkWithoutSkillMd(name, skillsDir, dotfiles, dryRun);
  }
}

function main(): Result<void, UsageError> {
  const parsed = cli(
    {
      name: "link-skills.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Link shared agent skills and commands into local AI tool homes.",
      },
      flags: {
        dryRun: { type: Boolean, default: false },
        dotfiles: { type: String },
        home: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (parsed.flags.dotfiles === "")
    return err(new UsageError("--dotfiles requires a value"));
  if (parsed.flags.home === "")
    return err(new UsageError("--home requires a value"));

  // The [] schema leaves unexpected operands in argv._; never let one fall through to a real
  // prune/relink pass.
  if (parsed._.length > 0) {
    process.stderr.write(
      `unexpected positional argument: ${parsed._[0]}\n${USAGE}`,
    );
    return err(
      new UsageError(`unexpected positional argument: ${parsed._[0]}`),
    );
  }

  const dryRun = parsed.flags.dryRun;
  const home = parsed.flags.home ?? process.env.HOME ?? homedir();
  const dotfiles =
    parsed.flags.dotfiles ?? process.env.DOTFILES ?? `${home}/dotfiles`;

  // Activate the post-merge hook so future `git pull`s auto-relink skills. Idempotent,
  // best-effort: the original swallows failure via `2>/dev/null || true` and never prints
  // either way — mirrored exactly (real run prints nothing for this step).
  if (dryRun) {
    print(
      `[dry-run] would set: git -C ${dotfiles} config core.hooksPath .githooks`,
    );
  } else {
    // swallowed, matching `|| true`
    fromThrowable(Bun.spawnSync)(
      ["git", "-C", dotfiles, "config", "core.hooksPath", ".githooks"],
      { stdout: "ignore", stderr: "ignore" },
    );
  }

  // Claude Code — slash commands
  if (!dryRun)
    tryOp(() => {
      mkdirSync(`${home}/.claude`, { recursive: true });
    });
  linkPath(`${dotfiles}/agents/commands`, `${home}/.claude/commands`, dryRun);

  // Claude Code — skills: link each skill INDIVIDUALLY. Claude Code itself populates
  // ~/.claude/skills/ with plugin-installed skills (real dirs), so a whole-dir symlink would
  // either clobber them or silently nest. Per-skill links coexist with plugin skills.
  const claudeSkillsDir = `${home}/.claude/skills`;
  const wholeDirTarget = symlinkTarget(claudeSkillsDir); // PRUNE (a)
  if (wholeDirTarget !== null) {
    if (dryRun) {
      print(
        `[dry-run] would remove whole-dir symlink: ~/.claude/skills -> ${wholeDirTarget}`,
      );
    } else if (
      reportLinkOperation("unlink", claudeSkillsDir, () => {
        unlinkSync(claudeSkillsDir);
      })
    ) {
      print(`removed whole-dir symlink: ~/.claude/skills -> ${wholeDirTarget}`);
    }
  }
  if (!dryRun)
    tryOp(() => {
      mkdirSync(claudeSkillsDir, { recursive: true });
    });

  const dotfilesSkillsDir = `${dotfiles}/agents/skills`;
  if (isDir(dotfilesSkillsDir)) {
    linkSkills(dotfilesSkillsDir, claudeSkillsDir, dryRun);

    // Prune renamed/deleted skills (b): the loop above only ADDS, so a rename leaves the old
    // link dangling and Claude keeps listing a skill that is gone. Remove only dangling links
    // INTO this repo; plugin skills (real dirs) and non-dotfiles-owned dangling links untouched.
    for (const name of listEntries(claudeSkillsDir)) {
      pruneDanglingSkillLink(name, claudeSkillsDir, dotfiles, dryRun);
    }

    // An archived/retired skill may leave an empty directory behind in the checkout, so its
    // old symlink is not dangling. Prune such links under both per-skill target directories.
    pruneLinksWithoutSkillMd(claudeSkillsDir, dotfiles, dryRun);
    pruneLinksWithoutSkillMd(`${home}/.agents/skills`, dotfiles, dryRun);
  } else {
    print(`skip (missing): ${dotfilesSkillsDir}`);
  }

  // Codex — global guidance, skills, and legacy markdown prompts
  if (!dryRun) {
    tryOp(() => {
      mkdirSync(`${home}/.codex`, { recursive: true });
    });
    tryOp(() => {
      mkdirSync(`${home}/.agents`, { recursive: true });
    });
  }
  linkPath(
    `${dotfiles}/agents/codex/AGENTS.md`,
    `${home}/.codex/AGENTS.md`,
    dryRun,
  );
  linkPath(dotfilesSkillsDir, `${home}/.agents/skills`, dryRun);
  linkPath(`${dotfiles}/agents/commands`, `${home}/.codex/prompts`, dryRun);

  // PRUNE (d)
  const codexSkillsDst = `${home}/.codex/skills`;
  const staleExpected = `${dotfiles}/agents/commands`;
  if (symlinkTarget(codexSkillsDst) === staleExpected) {
    if (dryRun) {
      print(
        `[dry-run] would remove stale: ~/.codex/skills -> ${staleExpected}`,
      );
    } else if (
      reportLinkOperation("unlink", codexSkillsDst, () => {
        unlinkSync(codexSkillsDst);
      })
    ) {
      print(`removed stale: ~/.codex/skills -> ${staleExpected}`);
    }
  }

  // Gemini — global_workflows
  if (!dryRun) {
    tryOp(() => {
      mkdirSync(`${home}/.gemini/antigravity`, { recursive: true });
    });
  }
  linkPath(
    `${dotfiles}/agents/commands`,
    `${home}/.gemini/antigravity/global_workflows`,
    dryRun,
  );

  print(`✅ Agent link pass complete. Source root: ${dotfiles}`);
  if (linkOperationFailures > 0) {
    print(`${linkOperationFailures} link operation(s) failed`);
    process.exitCode = 1;
  }
  return ok(undefined);
}

// The tracked unlink/symlink mutations report locally and do not reach this boundary. This is a
// last-resort safety net for unexpected errors outside those operations.
// Global boundary, not a try/catch: main() is sync, so it has no `.catch()` to hang off — this
// is the sync equivalent of BG1's mandated `main().catch(...)`.
process.on("uncaughtException", (error) => {
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
  }
  // Unexpected non-usage failures retain the existing tolerant boundary behavior.
  process.exit(process.exitCode ?? 0);
});

const mainResult = fromThrowable(main)().andThen((result) => result);
if (mainResult.isErr()) {
  const message =
    mainResult.error instanceof Error
      ? mainResult.error.message
      : String(mainResult.error);
  process.stderr.write(`${message}\n${USAGE}`);
  process.exitCode = 2;
}
// Clean runs retain exit 0; tracked link operation failures set exit 1 above. Locally caught
// usage errors (including `--__proto__`) set exit 2 before this line; Cleye ordinary-unknown
// strictness exits 1 inside the framework, before any filesystem work.
process.exit(process.exitCode ?? 0);
