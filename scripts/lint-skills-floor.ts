// `mise run lint:skills-floor` — forging-skills' structural floor (F1/F4) over the current skills.
//
// It used to scan `agents/skills/*/` in the working tree. In this shared checkout another session's
// half-written skill counted toward the listing budget and refused every other session's commit
// (2026-10-01: 75 skills / 65619 chars against a 65242 ceiling, from keeping-research-notebooks
// alone). wiring-repositories HOOK-1c: the commit gate judges only what is committed. So the index
// copy of agents/skills/ and the budget file are exported to a temp dir and checked there.
// J1 jj mode exports BASE with only selected REV paths overlaid; unrelated WIP is excluded.
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readDeclaration,
  skillFiles,
  thirdPartySkillFiles,
} from "./skills-declaration.ts";
import {
  jjCandidate,
  jjContext,
  jjExport,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";

const BUDGET = "agents/skills-listing-budget.json";
const ROOT = join(import.meta.dir, "..");
const run = (cmd: string[], stdin?: Uint8Array) =>
  Bun.spawnSync(cmd, {
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });

function copyWorktreeInputs(
  root: string,
  destination: string,
): string | undefined {
  const sourceSkills = join(root, "agents/skills");
  const candidateSkills = join(destination, "agents/skills");
  mkdirSync(candidateSkills, { recursive: true });
  for (const directory of new Bun.Glob("*/").scanSync({
    cwd: sourceSkills,
    onlyFiles: false,
  })) {
    cpSync(join(sourceSkills, directory), join(candidateSkills, directory), {
      recursive: true,
      dereference: true,
    });
  }
  for (const path of [BUDGET, "agents/skills.thirdparty.toml"]) {
    const source = join(root, path);
    if (!existsSync(source)) return path;
    const target = join(destination, path);
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(source, target);
  }
  return undefined;
}

const tmp = mkdtempSync(join(tmpdir(), "skills-floor-"));
const context = jjContext();
const listed =
  context === undefined && process.env["SKILLS_LINT_WORKTREE"] !== "1"
    ? run([
        "bun",
        "scripts/tracked-files.ts",
        "--git-index",
        "--expect-non-empty",
        "agents/skills",
        "agents/skills.thirdparty.toml",
        BUDGET,
      ])
    : undefined;
if (listed !== undefined && listed.exitCode !== 0) {
  console.error(
    "lint-skills-floor: tracked-files failed: " +
      listed.stderr.toString().trim(),
  );
  process.exit(2);
}
if (context !== undefined) {
  jjExport(
    context,
    tmp,
    new Map(
      [...jjCandidate(context)].filter(
        ([path]) =>
          path.startsWith("agents/skills/") ||
          path === BUDGET ||
          path === "agents/skills.thirdparty.toml",
      ),
    ),
  );
} else if (process.env["SKILLS_LINT_WORKTREE"] === "1") {
  const missing = copyWorktreeInputs(ROOT, tmp);
  if (missing !== undefined) {
    console.error(`lint-skills-floor: missing ${missing}`);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(2);
  }
} else {
  // J1 migration fallback; TODO(J1): remove after jj consumer rollout. Standalone mise tasks set
  // SKILLS_LINT_WORKTREE; commit hooks provide PRECOMMIT_VCS and use the selected J1 candidate.
  const exported = run(
    ["git", "checkout-index", "-z", "--stdin", "--prefix=" + tmp + "/"],
    listed?.stdout,
  );
  if (exported.exitCode !== 0) {
    console.error(
      "lint-skills-floor: Git-index export failed: " +
        exported.stderr.toString().trim(),
    );
    rmSync(tmp, { recursive: true, force: true });
    process.exit(2);
  }
}
const candidateDeclaration = readDeclaration(tmp);
const declaration =
  candidateDeclaration.isOk() || context !== undefined
    ? candidateDeclaration
    : readDeclaration(join(import.meta.dir, ".."));
if (declaration.isErr()) {
  console.error(`lint-skills-floor: ${declaration.error}`);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(2);
}
const thirdPartyCopies = thirdPartySkillFiles(
  skillFiles(join(tmp, "agents/skills")),
  declaration.value,
);
if (thirdPartyCopies.length > 0) {
  for (const { path, skill } of thirdPartyCopies)
    console.error(
      `lint-skills-floor: third-party skill "${skill}" reappeared: ${path}`,
    );
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
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
    join(
      import.meta.dir,
      "../agents/skills/forging-skills/scripts/skill-check.ts",
    ),
    "--quiet",
    "--budget",
    join(tmp, BUDGET),
    ...dirs,
  ],
  { stdout: "inherit", stderr: "inherit", timeout: 300_000 },
);
rmSync(tmp, { recursive: true, force: true });
process.exit(check.exitCode ?? 1);
