// Catalog completeness: every agents/skills/*/ with a SKILL.md must be linked in
// agents/skills/README.md.
//
// Reads the GIT INDEX, not the working tree (wiring-repositories HOOK-1c: the commit gate judges
// only what is committed). In this shared checkout another session's half-written skill sits in
// the tree for minutes; a tree scan refused every other session's commit on it (2026-10-01,
// keeping-research-notebooks). In a jj repo `mise run commit` stages exactly the chosen paths on
// top of @-, so a new skill is checked the moment it is committed, together with its README line.

const git = (args: string[]): { code: number; out: string } => {
  const p = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return { code: p.exitCode ?? 1, out: p.stdout.toString() };
};

const idx = "agents/skills/README.md";
const readme = git(["show", `:${idx}`]);
if (readme.code !== 0) {
  console.log(`❌ missing ${idx} in the index`);
  process.exit(1);
}

const listed = git(["ls-files", "--", "agents/skills/*/SKILL.md"]);
if (listed.code !== 0) {
  console.log("❌ git ls-files failed — cannot enumerate staged skills");
  process.exit(1);
}

let rc = 0;
for (const path of listed.out.split("\n").filter(Boolean)) {
  const n = path.split("/")[2] ?? "";
  if (readme.out.includes(`](${n}/)`)) continue;
  console.log(`❌ not in index: ${n}`);
  rc = 1;
}
if (rc === 0) console.log("✅ skills index complete");
process.exit(rc);
