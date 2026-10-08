// Catalog completeness: every agents/skills/*/ with a SKILL.md must be linked in
// agents/skills/README.md.
//
// Reads the GIT INDEX, not the working tree (wiring-repositories HOOK-1c: the commit gate judges
// only what is committed). In this shared checkout another session's half-written skill sits in
// the tree for minutes; a tree scan refused every other session's commit on it (2026-10-01,
// keeping-research-notebooks). J1 jj mode checks BASE with the selected REV changes overlaid.
import {
  jjCandidate,
  jjContent,
  jjContext,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";

const git = (args: string[]): { code: number; out: string } => {
  const p = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return { code: p.exitCode ?? 1, out: p.stdout.toString() };
};

const idx = "agents/skills/README.md";
const context = jjContext();
const candidate = context === undefined ? undefined : jjCandidate(context);
// J1 migration fallback; TODO(J1): remove after jj consumer rollout.
function readCandidateReadme(): { code: number; out: string } {
  if (context === undefined) return git(["show", ":" + idx]);
  const readmeRev = candidate?.get(idx);
  if (readmeRev === undefined) return { code: 1, out: "" };
  return { code: 0, out: jjContent(context, idx, readmeRev).toString() };
}
const readme = readCandidateReadme();
if (readme.code !== 0) {
  console.log(`❌ missing ${idx} in the commit candidate`);
  process.exit(1);
}

const listed =
  candidate === undefined
    ? (() => {
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
      })()
    : {
        code: 0,
        out: [...candidate.keys()]
          .filter((path) => /^agents\/skills\/[^/]+\/SKILL\.md$/u.test(path))
          .map((path) => path + "\0")
          .join(""),
        error: "",
      };
if (listed.code !== 0) {
  console.log("❌ tracked-files failed — " + listed.error);
  process.exit(1);
}
let rc = 0;
for (const path of listed.out.split("\0").filter(Boolean)) {
  const n = path.split("/")[2] ?? "";
  if (readme.out.includes(`](${n}/)`)) continue;
  console.log(`❌ not in index: ${n}`);
  rc = 1;
}
if (rc === 0) console.log("✅ skills index complete");
process.exit(rc);
