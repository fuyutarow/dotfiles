// `mise run lint:skills-floor` — forging-skills' structural floor (F1/F4) over the skills AS STAGED.
//
// It used to scan `agents/skills/*/` in the working tree. In this shared checkout another session's
// half-written skill counted toward the listing budget and refused every other session's commit
// (2026-10-01: 75 skills / 65619 chars against a 65242 ceiling, from keeping-research-notebooks
// alone). wiring-repositories HOOK-1c: the commit gate judges only what is committed. So the index
// copy of agents/skills/ and the budget file are exported to a temp dir and checked there.
// In a jj repo `mise run commit` stages exactly the chosen paths on top of @-.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUDGET = "agents/skills-listing-budget.json";
const run = (cmd: string[], stdin?: Uint8Array) =>
  Bun.spawnSync(cmd, {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });

const listed = run([
  "bun",
  "scripts/tracked-files.ts",
  "--git-index",
  "--expect-non-empty",
  "agents/skills",
  BUDGET,
]);
if (listed.exitCode !== 0) {
  console.error(
    `lint-skills-floor: tracked-files failed: ${listed.stderr.toString().trim()}`,
  );
  process.exit(2);
}
const tmp = mkdtempSync(join(tmpdir(), "skills-floor-"));
const exported = run(
  ["git", "checkout-index", "-z", "--stdin", `--prefix=${tmp}/`],
  listed.stdout,
);
if (exported.exitCode !== 0) {
  console.error(
    `lint-skills-floor: checkout-index failed: ${exported.stderr.toString().trim()}`,
  );
  rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
}
const dirs = [
  ...new Bun.Glob("*/").scanSync({
    cwd: join(tmp, "agents/skills"),
    onlyFiles: false,
  }),
].map((d) => join(tmp, "agents/skills", d));
const check = Bun.spawnSync(
  [
    "bun",
    "agents/skills/forging-skills/scripts/skill-check.ts",
    "--quiet",
    "--budget",
    join(tmp, BUDGET),
    ...dirs,
  ],
  { stdout: "inherit", stderr: "inherit", timeout: 300_000 },
);
rmSync(tmp, { recursive: true, force: true });
process.exit(check.exitCode ?? 1);
