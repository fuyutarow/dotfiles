import { $ } from "bun";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import { existingGraveyards, graveyardCandidates } from "./graveyards";

// IRREVERSIBLE: empty EVERY graveyard — rip's, and the XDG trash beside it. This is the ONLY
// step that actually frees disk: both mechanisms delete by RENAME, so the bytes stay on the
// filesystem until something empties them. Prints every target with its size and requires typing
// 'yes'. Human-only gate; never run this from an agent.
//
// Why "every": until 2026-09-21 this purged only rip's /tmp/graveyard-$USER. On r99 that held
// 503 MB while the XDG trash held 33 GB of trashed agent worktrees — the largest pure-waste item
// on a box at 7% free C:, reachable by no task at all. Discovery is shared with reclaim:audit so
// the reporter and the purger cannot disagree about where to look (see graveyards.ts).
//
// Each target is a directory whose CONTENTS are removed; the directory itself survives, because
// the XDG spec needs files/ and info/ to exist for the next trash operation.

const home = homedir();
const graves = existingGraveyards(
  graveyardCandidates(process.env, home),
  (p) => existsSync(p) && statSync(p).isDirectory(),
);

if (graves.length === 0) {
  console.log("graveyard 無し");
  process.exit(0);
}

for (const g of graves) {
  const total =
    (await $`du -sh ${g.path}`.quiet().nothrow()).stdout
      .toString()
      .split("\t")[0] ?? "";
  console.log(`== ${g.label}: ${g.path} (${total.trim()}) ==`);
  const duList = (
    await $`du -sh ${g.path}/*`.quiet().nothrow()
  ).stdout.toString();
  const sorted = await $`echo ${duList} | sort -rh | head -10`.text();
  process.stdout.write(sorted);
  console.log();
}

console.log(
  `上記 ${graves.length} 箇所の中身を完全に削除します。復元はできません。`,
);

process.stdout.write("続けるなら yes と入力: ");
const ans = (
  await new Promise<string>((resolve) => {
    process.stdin.once("data", (d) => resolve(d.toString()));
  })
).trim();

if (ans !== "yes") {
  console.log("中止しました。");
  process.exit(1);
}

// 絶対パスで shell の rm 無効化を回避
for (const g of graves) {
  await $`find ${g.path} -mindepth 1 -maxdepth 1 -exec /bin/rm -rf -- {} +`;
}

const dfLine =
  await $`df -h ${process.env.HOME} | awk 'NR==2{print $4" free"}'`.text();
console.log(`✅ purge 完了。 ${dfLine.trim()}`);
