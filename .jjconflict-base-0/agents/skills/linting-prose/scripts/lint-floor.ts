import { dirname, resolve } from "node:path";
import { typeFlag } from "type-flag";

// argv-forwarding: textlint
const args = Bun.argv.slice(2);
const parsed = typeFlag(
  {
    fix: { type: [Boolean], default: () => [] },
    "fix-dry-run": { type: [Boolean], default: () => [] },
  },
  [...args],
  { ignore: (type) => type === "unknown-flag" },
);
// This CLI deliberately forwards downstream textlint flags. They are ignored into the
// untouched `args` relay rather than accepted as this wrapper's own flags.
if (
  Object.getPrototypeOf(parsed.unknownFlags) !== Object.prototype ||
  Object.keys(parsed.unknownFlags).length > 0
) {
  throw new Error("type-flag forwarding invariant violated");
}
const bannedAfterSeparator = parsed._["--"].some(
  (argument) => argument === "--fix" || argument === "--fix-dry-run",
);
if (
  parsed.flags.fix.length > 0 ||
  parsed.flags["fix-dry-run"].length > 0 ||
  bannedAfterSeparator
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
