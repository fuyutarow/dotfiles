import { dirname, resolve } from "node:path";

const args = Bun.argv.slice(2);
if (
  args.some((argument) => argument === "--fix" || argument === "--fix-dry-run")
) {
  process.stderr.write(
    "REFUSED: --fix is banned on the prose floor (detect-only; prh replacements are guidance, not text).\n",
  );
  process.stderr.write(
    "See references/machine-floor.md — the anti-auto-substitution rule.\n",
  );
  process.exit(2);
}

const here = dirname(resolve(import.meta.path));
const config =
  process.env.LINT_PROSE_CONFIG ?? resolve(here, "../assets/textlintrc.json");
// NOTE deliberately UNPINNED (floor W7 accepted, ledger-recorded 2026-07-23): the house
// textlint RULES resolve from the bun global install; a pinned `textlint@x.y.z` switches
// bunx to an isolated dir with no rule packages → "No rules found" (characterization test
// caught it). Real fix = graduation: a package.json pinning textlint+rules — owner:
// linting-prose next reforge.
// bounded: foreground lint passthrough; the child inherits stdio and the user can interrupt
const child = Bun.spawn(["bunx", "textlint", "--config", config, ...args], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
