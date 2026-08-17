// Renders ~/.claude/settings.json from the committed base in this repo plus an untracked private
// overlay. Consumer: scripts/link-dots.sh (and therefore `mise run link:dots` + the post-merge
// hook). Output is verdict-style lines, matching link-dots.sh / link-skills.ts.
//
// WHY THIS FILE IS GENERATED AND NOT SYMLINKED — the one setting that forced it:
// `autoMode` (auto-mode classifier rules: environment / allow / soft_deny / hard_deny) is
// documented as "Read from user settings, the --settings flag, and managed settings only. Ignored
// in project .claude/settings.json and local .claude/settings.local.json" (code.claude.com/docs,
// read 2026-08-17). So its content CANNOT be relocated to the project it describes, and its
// content is inherently machine- and repo-specific: this machine's autoMode block named a private
// repo's path, its API-key variable names, and where its sensitive documents live. Symlinking
// ~/.claude/settings.json at this PUBLIC repo therefore forced a choice between losing the setting
// and publishing a private project's structure. Generation is the third option: the shared half is
// committed, the private half stays in $HOME and is never seen by git.
//
// The cost, stated plainly: ~/.claude/settings.json is no longer live-edited through the repo.
// After changing agents/claude/settings.json, run `mise run link:dots` (the post-merge hook already
// does this on every pull).
//
// NO FLAGS, NO DEPENDENCIES — deliberate. This runs from link-dots.sh, which on a fresh machine
// executes BEFORE `mise run deps` restores node_modules, so importing cleye would break bootstrap.
// With no argv read there is no Cleye boundary to owe (writing-bun-scripts BG1). Inputs come from
// the environment so tests can point it at fixtures:
//   DOTFILES                  repo root            (default: $HOME/dotfiles)
//   HOME                      destination root     (default: os.homedir())
//   CLAUDE_SETTINGS_PRIVATE   overlay path         (default: $HOME/.claude/settings.private.json)
//
// MERGE SEMANTICS: top-level keys only, and an overlay key REPLACES the base key outright. No deep
// merge — a deep merge of the `hooks` arrays has no defensible semantics (append? match on
// matcher? dedupe?), and guessing one would silently reorder security hooks.
//
// Exit: 0 rendered or already current · 1 the base is missing/unreadable, or an overlay exists but
// is not readable JSON (a typo in the overlay must never silently drop private rules).

import {
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): void {
  process.stderr.write(`${line}\n`);
}

const home = process.env.HOME ?? homedir();
const dotfiles = process.env.DOTFILES ?? `${home}/dotfiles`;
const basePath = `${dotfiles}/agents/claude/settings.json`;
const overlayPath =
  process.env.CLAUDE_SETTINGS_PRIVATE ??
  `${home}/.claude/settings.private.json`;
const destPath = `${home}/.claude/settings.json`;

async function readJson(path: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await Bun.file(path).text());
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

let base: Record<string, unknown>;
try {
  base = await readJson(basePath);
} catch (error) {
  fail(
    `FATAL: cannot read base settings ${basePath} — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

let overlay: Record<string, unknown> = {};
let overlayKeys: string[] = [];
if (existsSync(overlayPath)) {
  try {
    overlay = await readJson(overlayPath);
  } catch (error) {
    // Hard failure, not a skip: a malformed overlay means the private rules (which include
    // soft_deny entries protecting a court-of-record file) would vanish without a word.
    fail(
      `FATAL: private overlay ${overlayPath} is not readable JSON — ${error instanceof Error ? error.message : String(error)}`,
    );
    fail(
      "  refusing to render settings that would silently drop the private rules",
    );
    process.exit(1);
  }
  overlayKeys = Object.keys(overlay).sort();
}

const merged = { ...base, ...overlay };
const rendered = `${JSON.stringify(merged, null, 2)}\n`;

// Already current → no write, no churn (this runs on every pull via the post-merge hook).
if (existsSync(destPath) && lstatSync(destPath).isFile()) {
  if ((await Bun.file(destPath).text()) === rendered) {
    print(
      `settings current: ${destPath}${overlayKeys.length > 0 ? ` (private: ${overlayKeys.join(", ")})` : ""}`,
    );
    process.exit(0);
  }
}

mkdirSync(`${home}/.claude`, { recursive: true });

// Atomic: write beside the destination, then rename over it. A crash mid-render must never leave
// the user with a truncated settings file — this is the file that carries every security hook.
const tmpPath = `${destPath}.rendering`;
await Bun.write(tmpPath, rendered);

// The pre-2026-08-17 layout had a SYMLINK here pointing into the repo. rename() would replace the
// link itself, but unlink first so the transition is explicit and reported.
let replaced = "";
try {
  if (lstatSync(destPath).isSymbolicLink()) {
    replaced = " (replaced the old symlink into the repo)";
    unlinkSync(destPath);
  }
} catch {
  // no destination yet — nothing to replace
}
renameSync(tmpPath, destPath);

print(
  `rendered: ${destPath} <- ${basePath}${overlayKeys.length > 0 ? ` + ${overlayPath} [${overlayKeys.join(", ")}]` : " (no private overlay)"}${replaced}`,
);
