import { $ } from "bun";
import { existsSync, statSync } from "node:fs";

// git pre-commit body: run `fmt` and re-stage the formatted files that were ALREADY staged
// (formatting fallout in unrelated working-tree files stays unstaged). Called by
// .githooks/pre-commit; safe to run by hand.
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
process.exit(0);
