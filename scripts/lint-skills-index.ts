import { existsSync, readFileSync } from "node:fs";

// Catalog completeness: every agents/skills/*/ with a SKILL.md must be linked in
// agents/skills/README.md.
const idx = "agents/skills/README.md";
if (!existsSync(idx)) {
  console.log(`❌ missing ${idx}`);
  process.exit(1);
}
const idxContent = readFileSync(idx, "utf8");

let rc = 0;
const glob = new Bun.Glob("*/");
for (const name of glob.scanSync({ cwd: "agents/skills", onlyFiles: false })) {
  const n = name.replace(/\/$/, "");
  if (!existsSync(`agents/skills/${n}/SKILL.md`)) continue; // skip dangling symlinks / non-skill dirs
  if (idxContent.includes(`](${n}/)`)) continue;
  console.log(`❌ not in index: ${n}`);
  rc = 1;
}
if (rc === 0) console.log("✅ skills index complete");
process.exit(rc);
