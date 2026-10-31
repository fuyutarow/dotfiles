// Catalog completeness: every agents/skills/*/ with a SKILL.md must be linked in
// agents/skills/README.md.
//
// J1 commit-gate calls read BASE with selected REV changes overlaid. Standalone mise calls opt
// into a worktree view so an uncommitted declaration or removal is still checkable before review.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import consola from "consola";
import {
  jjCandidate,
  jjContent,
  jjContext,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import {
  parseDeclaration,
  thirdPartySkillFiles,
  type SkillFile,
} from "./skills-declaration.ts";

const git = async (args: string[]): Promise<{ code: number; out: string }> => {
  const child = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [code, out] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  return { code: code ?? 1, out };
};

const idx = "agents/skills/README.md";
const ROOT = join(import.meta.dir, "..");
const context = await jjContext();
const candidate =
  context === undefined ? undefined : await jjCandidate(context);

async function readCandidateFile(
  path: string,
): Promise<{ code: number; out: string }> {
  if (context === undefined) {
    if (process.env["SKILLS_LINT_WORKTREE"] === "1") {
      const result = await readFile(join(ROOT, path), "utf8").then(
        (out) => ({ code: 0, out }),
        () => ({ code: 1, out: "" }),
      );
      return result;
    }
    return git(["show", ":" + path]);
  }
  const rev = candidate?.get(path);
  return rev === undefined
    ? { code: 1, out: "" }
    : { code: 0, out: (await jjContent(context, path, rev)).toString() };
}

const readme = await readCandidateFile(idx);
if (readme.code !== 0) {
  consola.error(`❌ missing ${idx} in the commit candidate`);
  process.exit(1);
}

async function listSkillPaths(): Promise<{
  code: number;
  out: string;
  error: string;
}> {
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
      out: (
        await Array.fromAsync(
          new Bun.Glob("*/SKILL.md").scan({
            cwd: join(ROOT, "agents/skills"),
            onlyFiles: true,
          }),
        )
      )
        .map((path) => `agents/skills/${path}\0`)
        .join(""),
      error: "",
    };
  const child = Bun.spawn(
    [
      "bun",
      "scripts/tracked-files.ts",
      "--git-index",
      "--expect-non-empty",
      "agents/skills/*/SKILL.md",
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code: code ?? 1, out, error: error.trim() };
}

const listed = await listSkillPaths();
if (listed.code !== 0) {
  consola.error("❌ tracked-files failed — " + listed.error);
  process.exit(1);
}

const declarationFile = await readCandidateFile(
  "agents/skills.thirdparty.toml",
);
if (declarationFile.code !== 0) {
  consola.error(
    "❌ missing agents/skills.thirdparty.toml in the commit candidate",
  );
  process.exit(1);
}
const declaration = parseDeclaration(declarationFile.out);
if (declaration.isErr()) {
  consola.error(
    `❌ invalid agents/skills.thirdparty.toml: ${declaration.error}`,
  );
  process.exit(1);
}

const candidateSkillFiles: SkillFile[] = [];
for (const path of listed.out.split("\0").filter(Boolean)) {
  const file = await readCandidateFile(path);
  if (file.code !== 0) {
    consola.error(`❌ unable to read ${path} from the commit candidate`);
    process.exit(1);
  }
  candidateSkillFiles.push({ path, content: file.out });
}
for (const { path, skill } of thirdPartySkillFiles(
  candidateSkillFiles,
  declaration.value,
)) {
  consola.error(
    `❌ third-party skill "${skill}" reappeared in the candidate: ${path}`,
  );
  process.exitCode = 1;
}

let rc = 0;
if (process.exitCode === 1) rc = 1;
for (const path of listed.out.split("\0").filter(Boolean)) {
  const n = path.split("/")[2] ?? "";
  if (readme.out.includes(`](${n}/)`)) continue;
  consola.error(`❌ not in index: ${n}`);
  rc = 1;
}
if (rc === 0) consola.success("✅ skills index complete");
process.exit(rc);
