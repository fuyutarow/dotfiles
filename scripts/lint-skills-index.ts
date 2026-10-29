// Catalog completeness: every agents/skills/*/ with a SKILL.md must be linked in
// agents/skills/README.md.
//
// J1 commit-gate calls read BASE with selected REV changes overlaid. Standalone mise calls opt
// into a worktree view so an uncommitted declaration or removal is still checkable before review.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  jjCandidate,
  jjContent,
  jjContext,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { fromThrowable } from "neverthrow";
import {
  parseDeclaration,
  thirdPartySkillFiles,
  type SkillFile,
} from "./skills-declaration.ts";

const git = (args: string[]): { code: number; out: string } => {
  const p = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return { code: p.exitCode ?? 1, out: p.stdout.toString() };
};

const idx = "agents/skills/README.md";
const ROOT = join(import.meta.dir, "..");
const context = jjContext();
const candidate = context === undefined ? undefined : jjCandidate(context);

function readCandidateFile(path: string): { code: number; out: string } {
  if (context === undefined) {
    if (process.env["SKILLS_LINT_WORKTREE"] === "1") {
      const file = fromThrowable((value: string) =>
        readFileSync(value, "utf8"),
      )(join(ROOT, path));
      return { code: file.isOk() ? 0 : 1, out: file.unwrapOr("") };
    }
    const result = git(["show", ":" + path]);
    return { code: result.code, out: result.out };
  }
  const rev = candidate?.get(path);
  return rev === undefined
    ? { code: 1, out: "" }
    : { code: 0, out: jjContent(context, path, rev).toString() };
}
// J1 migration fallback; TODO(J1): remove after jj consumer rollout.
function readCandidateReadme(): { code: number; out: string } {
  return readCandidateFile(idx);
}
const readme = readCandidateReadme();
if (readme.code !== 0) {
  console.log(`❌ missing ${idx} in the commit candidate`);
  process.exit(1);
}

function listSkillPaths(): { code: number; out: string; error: string } {
  if (context !== undefined)
    return {
      code: 0,
      out: [...(candidate?.keys() ?? [])]
        .filter((path) => /^agents\/skills\/[^/]+\/SKILL\.md$/u.test(path))
        .map((path) => path + "\0")
        .join(""),
      error: "",
    };
  if (process.env["SKILLS_LINT_WORKTREE"] === "1")
    return {
      code: 0,
      out: [
        ...new Bun.Glob("*/SKILL.md").scanSync({
          cwd: join(ROOT, "agents/skills"),
          onlyFiles: true,
        }),
      ]
        .map((path) => `agents/skills/${path}\0`)
        .join(""),
      error: "",
    };
  const result = Bun.spawnSync(
    [
      "bun",
      "scripts/tracked-files.ts",
      "--git-index",
      "--expect-non-empty",
      "agents/skills/*/SKILL.md",
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  return {
    code: result.exitCode ?? 1,
    out: result.stdout.toString(),
    error: result.stderr.toString().trim(),
  };
}

const listed = listSkillPaths();
if (listed.code !== 0) {
  console.log("❌ tracked-files failed — " + listed.error);
  process.exit(1);
}

const declarationFile = readCandidateFile("agents/skills.thirdparty.toml");
if (declarationFile.code !== 0) {
  console.log(
    "❌ missing agents/skills.thirdparty.toml in the commit candidate",
  );
  process.exit(1);
}
const declaration = parseDeclaration(declarationFile.out);
if (declaration.isErr()) {
  console.log(`❌ invalid agents/skills.thirdparty.toml: ${declaration.error}`);
  process.exit(1);
}

const candidateSkillFiles: SkillFile[] = [];
for (const path of listed.out.split("\0").filter(Boolean)) {
  const file = readCandidateFile(path);
  if (file.code !== 0) {
    console.log(`❌ unable to read ${path} from the commit candidate`);
    process.exit(1);
  }
  candidateSkillFiles.push({ path, content: file.out });
}
for (const { path, skill } of thirdPartySkillFiles(
  candidateSkillFiles,
  declaration.value,
)) {
  console.log(
    `❌ third-party skill "${skill}" reappeared in the candidate: ${path}`,
  );
  process.exitCode = 1;
}

let rc = 0;
if (process.exitCode === 1) rc = 1;
for (const path of listed.out.split("\0").filter(Boolean)) {
  const n = path.split("/")[2] ?? "";
  if (readme.out.includes(`](${n}/)`)) continue;
  console.log(`❌ not in index: ${n}`);
  rc = 1;
}
if (rc === 0) console.log("✅ skills index complete");
process.exit(rc);
