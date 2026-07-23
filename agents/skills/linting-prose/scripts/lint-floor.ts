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
const child = Bun.spawn(["bunx", "textlint", "--config", config, ...args], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
