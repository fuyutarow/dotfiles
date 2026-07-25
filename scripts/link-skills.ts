// Port of mise task `link:skills` (see mise.toml). Structural port only — same links, same
// guards, same four prune mechanisms, same printed lines as the original shell body. Consumer:
// human/agent running `mise run link:skills` — output is verdict-style lines meant for
// eyeballing (linked/skip/pruned/excluded), not a machine envelope, matching the shell original.
//
// Links agents/commands + agents/skills from this dotfiles repo into Claude Code, Codex, and
// Gemini's config directories, and prunes stale links that a rename/delete would otherwise
// leave dangling. Four DISTINCT prune/exclusion mechanisms, do not conflate them:
//   (a) ~/.claude/skills legacy whole-dir symlink -> unlinked unconditionally if IS a symlink
//       at all (no target check), then recreated as a real directory.
//   (b) ~/.claude/skills/<name> per-skill -> pruned only if symlink AND dangling AND its raw
//       (non-canonicalized) target starts with "<dotfiles>/".
//   (c) ~/.claude/skills/driving-claude -> unlinked only if its raw target is EXACTLY
//       "<dotfiles>/agents/skills/driving-claude" (driving-claude is Codex-only by design).
//   (d) ~/.codex/skills -> unlinked only if its raw target is EXACTLY "<dotfiles>/agents/commands"
//       (cleanup of one specific historical misconfiguration).
// Real plugin-installed skill directories (not symlinks) are never touched by any of the four.
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
// Error handling mirrors the original shell body EXACTLY: that body has no `set -e` anywhere,
// so every individual `mkdir`/`ln`/`unlink`/`rm` failure is tolerated (bash just falls through
// to the next statement) and the task ALWAYS reaches its final line, which always exits 0 (the
// last command run is always `echo "✅ ..."`). Every filesystem mutation below is therefore
// wrapped in its OWN local try/catch that swallows the failure and falls through, exactly like
// bash without `set -e` — never in one outer catch-all that would abort everything else. Two
// print sites intentionally differ in whether the failure suppresses the message, because the
// original differs too: `link_path`'s `ln -sfn` and every PRUNE site except (b) have NO `&&`
// between the mutation and its `echo`, so the message prints unconditionally even when the
// mutation itself failed (preserved here, not "fixed" — see two-hats/behavior-preservation);
// PRUNE (b) alone uses `rm -f "$old" && echo ...`, so ITS message is gated on success.
// Exit: always 0, matching the original — no FATAL line is ever printed (the original prints
// none either).

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
import { parseArgs } from "node:util";

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Runs a single filesystem mutation and swallows any failure, mirroring bash's tolerance for
 * an individual `mkdir`/`unlink`/`ln`/`rm` command when the script has no `set -e`: bash prints
 * that command's own stderr and falls through to the next statement regardless. Used at every
 * mutation site so a failure here NEVER bubbles to an outer catch-all that would abort the rest
 * of the run — each site stays locally tolerant, exactly like the original shell body.
 */
function tryOp(fn: () => void): void {
  try {
    fn();
  } catch {
    // swallowed — see function doc.
  }
}

/** Directory-follows check: mirrors POSIX `[ -d p ]` (false for missing/non-dir, no throw). */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Raw, non-canonicalizing symlink probe: mirrors `[ -L p ]` combined with a bare `readlink p`
 * (the literal stored target string, never resolved via `-f`/`-e`). Returns null when p is not
 * a symlink at all, including "does not exist".
 */
function symlinkTarget(p: string): string | null {
  try {
    if (!lstatSync(p).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return readlinkSync(p);
}

/**
 * Mirrors `[ -L dst ] || [ ! -e dst ]` — the shell guard `link_path` uses to decide whether it
 * may (re)write dst. `-e`/`existsSync` alone can't distinguish "no path" from "dangling
 * symlink"; combining it with the `-L`/lstat check does.
 */
function isSymlinkOrAbsent(p: string): boolean {
  let isSymlink = false;
  try {
    isSymlink = lstatSync(p).isSymbolicLink();
  } catch {
    isSymlink = false;
  }
  return isSymlink || !existsSync(p);
}

/**
 * Sorted directory listing (bash pathname expansion sorts glob matches); [] if unreadable.
 * Dot-prefixed entries are excluded to match bash's default (non-dotglob) globbing in both
 * call sites this feeds (the per-skill "agents/skills" glob and the "~/.claude/skills" glob),
 * which never match hidden entries unless `shopt -s dotglob` is set (it is not, in the original).
 */
function listEntries(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => !n.startsWith("."))
      .sort();
  } catch {
    return [];
  }
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
    tryOp(() => mkdirSync(dirname(dst), { recursive: true }));
  }
  if (isSymlinkOrAbsent(dst)) {
    if (dryRun) {
      print(`[dry-run] would link: ${dst} -> ${src}`);
      return;
    }
    tryOp(() => unlinkSync(dst)); // dst didn't exist — nothing to remove, matches `ln -f`.
    // `ln -sfn "$src" "$dst"` failing doesn't stop the original: the very next line,
    // `echo "linked: $dst -> $src"`, has no `&&` gate on the `ln`, so it prints
    // unconditionally even when `ln` itself failed — preserved verbatim, not fixed.
    tryOp(() => symlinkSync(src, dst));
    print(`linked: ${dst} -> ${src}`);
  } else {
    print(`skip (exists, not symlink): ${dst}`);
  }
}

function main(): void {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      dotfiles: { type: "string" },
      home: { type: "string" },
    },
    strict: true,
  });

  const dryRun = values["dry-run"] === true;
  const home = values.home ?? process.env.HOME ?? homedir();
  const dotfiles =
    values.dotfiles ?? process.env.DOTFILES ?? `${home}/dotfiles`;

  // Activate the post-merge hook so future `git pull`s auto-relink skills. Idempotent,
  // best-effort: the original swallows failure via `2>/dev/null || true` and never prints
  // either way — mirrored exactly (real run prints nothing for this step).
  if (dryRun) {
    print(
      `[dry-run] would set: git -C ${dotfiles} config core.hooksPath .githooks`,
    );
  } else {
    try {
      Bun.spawnSync(
        ["git", "-C", dotfiles, "config", "core.hooksPath", ".githooks"],
        {
          stdout: "ignore",
          stderr: "ignore",
        },
      );
    } catch {
      // swallowed, matching `|| true`
    }
  }

  // Claude Code — slash commands
  if (!dryRun) tryOp(() => mkdirSync(`${home}/.claude`, { recursive: true }));
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
    } else {
      // `unlink` failing doesn't stop the original: its `echo` on the next line has no `&&`
      // gate, so it prints unconditionally even when `unlink` itself failed.
      tryOp(() => unlinkSync(claudeSkillsDir));
      print(`removed whole-dir symlink: ~/.claude/skills -> ${wholeDirTarget}`);
    }
  }
  if (!dryRun) tryOp(() => mkdirSync(claudeSkillsDir, { recursive: true }));

  const dotfilesSkillsDir = `${dotfiles}/agents/skills`;
  if (isDir(dotfilesSkillsDir)) {
    for (const name of listEntries(dotfilesSkillsDir).filter((n) =>
      isDir(`${dotfilesSkillsDir}/${n}`),
    )) {
      // `driving-claude` is deliberately Codex-only: it teaches Codex to drive this CLI, so
      // exposing it as a Claude Code skill would be self-referential and creates a needless
      // trigger collision. Codex receives the whole source tree through ~/.agents/skills below.
      if (name === "driving-claude") {
        // PRUNE (c)
        const dst = `${claudeSkillsDir}/${name}`;
        const expected = `${dotfilesSkillsDir}/${name}`;
        if (symlinkTarget(dst) === expected) {
          if (dryRun) {
            print(`[dry-run] would exclude (unlink, Codex-only): ${dst}`);
          } else {
            // Same unconditional-echo shape as PRUNE (a)/(d): no `&&` gates the `unlink` in
            // the original, so the message prints even if `unlink` itself failed.
            tryOp(() => unlinkSync(dst));
            print(`excluded (Codex-only): ${dst}`);
          }
        } else {
          print(`excluded (Codex-only): ${dst}`);
        }
        continue;
      }
      linkPath(
        `${dotfilesSkillsDir}/${name}`,
        `${claudeSkillsDir}/${name}`,
        dryRun,
      );
    }

    // Prune renamed/deleted skills (b): the loop above only ADDS, so a rename leaves the old
    // link dangling and Claude keeps listing a skill that is gone. Remove only dangling links
    // INTO this repo; plugin skills (real dirs) and non-dotfiles-owned dangling links untouched.
    for (const name of listEntries(claudeSkillsDir)) {
      const old = `${claudeSkillsDir}/${name}`;
      const target = symlinkTarget(old);
      if (target === null) continue; // not a symlink
      if (existsSync(old)) continue; // not dangling
      if (!target.startsWith(`${dotfiles}/`)) continue; // not dotfiles-owned
      if (dryRun) {
        print(`[dry-run] would prune (renamed/deleted): ${old}`);
      } else {
        // Unlike every other prune/exclude site, the original gates this one on success —
        // `rm -f "$old" && echo "pruned ...`. A failed `rm -f` short-circuits the `&&`, so
        // the message must NOT print and the loop just moves to the next entry.
        try {
          unlinkSync(old);
        } catch {
          continue;
        }
        print(`pruned (renamed/deleted): ${old}`);
      }
    }
  } else {
    print(`skip (missing): ${dotfilesSkillsDir}`);
  }

  // Codex — global guidance, skills, and legacy markdown prompts
  if (!dryRun) {
    tryOp(() => mkdirSync(`${home}/.codex`, { recursive: true }));
    tryOp(() => mkdirSync(`${home}/.agents`, { recursive: true }));
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
    } else {
      // Unconditional echo, same shape as PRUNE (a)/(c) — no `&&` gates the `unlink`.
      tryOp(() => unlinkSync(codexSkillsDst));
      print(`removed stale: ~/.codex/skills -> ${staleExpected}`);
    }
  }

  // Gemini — global_workflows
  if (!dryRun) {
    tryOp(() => mkdirSync(`${home}/.gemini/antigravity`, { recursive: true }));
  }
  linkPath(
    `${dotfiles}/agents/commands`,
    `${home}/.gemini/antigravity/global_workflows`,
    dryRun,
  );

  print(`✅ Agent link pass complete. Source root: ${dotfiles}`);
}

// No outer abort here, matching the original's total tolerance: every mutation above already
// guards itself locally via tryOp(), so main() should never throw. This catch is a last-resort
// safety net only — even in the unforeseen case something escapes a local guard, it is
// swallowed silently (no new "FATAL" stderr line the original never printed) and the process
// still exits 0, exactly like the original shell body always reaching its final `echo` (last
// command run, so its exit status — always 0 — is the task's exit status).
try {
  main();
} catch {
  // swallowed — see comment above.
}
process.exit(0);
