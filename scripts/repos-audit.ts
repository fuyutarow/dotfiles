import { $ } from "bun";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { registeredRepos } from "./workspace-repos.ts";

// ~/Workspace の全 git repo の配線健全性を一望する (scaffolding-repositories の floor を
// 横断実行)。dotfiles 自身の `lint` には入れない。他 repo の状態で dotfiles の gate が落ちる
// のは結合の誤りである。強制は各 repo の check が持ち、ここは差分を見るための眺めに徹する。
const check =
  process.env.WIRING_CHECK ??
  join(
    import.meta.dir,
    "../agents/skills/wiring-repositories/scripts/wiring-check.ts",
  );
if (!existsSync(check)) {
  console.error(`repos:audit: scaffold-check not found at ${check}`);
  process.exit(2);
}

const root = process.env.WORKSPACE_ROOT ?? `${process.env.HOME}/Workspace`;
const dirs = registeredRepos(process.env.HOME ?? "", root);

let rc = 0;
for (const d of dirs) {
  const name = basename(d.replace(/\/$/u, ""));
  const res = await $`bun ${check} --repo ${d} --audit 2>&1`.quiet().nothrow();
  if (res.exitCode !== 0) rc = 1;
  const out = res.stdout.toString().replace(/\n$/u, "");
  const n = (out.match(/^FAIL/gmu) ?? []).length;
  console.log(`\n=== ${name.padEnd(16)} ${n} FAIL ===`);
  for (const line of out.split("\n")) {
    console.log(`  ${line}`);
  }
}
process.exit(rc);
