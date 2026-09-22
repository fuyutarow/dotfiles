import { $ } from "bun";
import { existsSync, statSync } from "node:fs";

// git pre-commit body: run `fmt`, re-stage the formatted files that were ALREADY staged
// (formatting fallout in unrelated working-tree files stays unstaged), then LINT the staged
// TypeScript and refuse the commit on any oxlint error. Called by .githooks/pre-commit; safe to
// run by hand.
//
// Why lint is here (2026-09-22): this gate used to FORMAT only, so the .oxlintrc.json floor
// (try/catch -> neverthrow, switch/nested ternary -> ts-pattern) bit only when someone
// remembered to run `mise run lint`. Proven in a throwaway worktree: a staged try/catch in
// scripts/ committed with exit 0. Scope is the STAGED .ts files only, so unrelated debt
// elsewhere never blocks a commit; warnings (max-depth) print but do not block.
const staged = (
  await $`git diff --cached --name-only --diff-filter=ACM`.text()
).trim();

// fmt が触る拡張子だけ
if (!/\.(md|sh|ts)$/m.test(staged)) {
  process.exit(0);
}

const fmt = await $`mise run f`.quiet().nothrow();
if (fmt.exitCode !== 0) {
  console.error(
    "pre-commit: mise run f failed — fix the formatter, or bypass once with 'git commit --no-verify'",
  );
  process.exit(1);
}

// The original body's `for f in $staged` was unquoted, so it word-splits on all whitespace
// (not just newlines) — preserved here rather than fixed.
for (const f of staged.split(/\s+/).filter(Boolean)) {
  if (existsSync(f) && statSync(f).isFile()) {
    await $`git add ${f}`;
  }
}

const tsFiles = staged
  .split(/\s+/)
  .filter((f) => f.endsWith(".ts") && existsSync(f) && statSync(f).isFile());
if (tsFiles.length > 0) {
  // .oxlintrc.json's ignorePatterns (agents/skills, node_modules) and per-directory overrides
  // still decide what each file is held to; this only chooses WHICH files are looked at.
  const lint = await $`bunx oxlint ${tsFiles}`.nothrow();
  if (lint.exitCode !== 0) {
    console.error(
      "pre-commit: oxlint reported errors in the staged TypeScript above — fix them, then commit again." +
        " If it says a module/plugin cannot be found, run 'mise run deps' (the eslint-js jsPlugin lives in node_modules).",
    );
    process.exit(1);
  }
}
process.exit(0);
