import { $ } from "bun";
import { existsSync, statSync } from "node:fs";

// IRREVERSIBLE: empty rip's graveyard. This is the ONLY step that actually frees disk — rip
// is a same-filesystem rename, so ripped data still occupies space until purged. Prints the
// contents and requires typing 'yes'. Human-only gate; never run this from an agent.

const g = process.env.GRAVEYARD ?? `/tmp/graveyard-${process.env.USER}`;

if (!existsSync(g) || !statSync(g).isDirectory()) {
  console.log(`graveyard 無し: ${g}`);
  process.exit(0);
}

console.log(`== ${g} の中身 ==`);
const duList = (await $`du -sh ${g}/*`.quiet().nothrow()).stdout.toString();
const sorted = await $`echo ${duList} | sort -rh | head -20`.text();
process.stdout.write(sorted);

console.log();
const total =
  (await $`du -sh ${g}`.quiet().nothrow()).stdout.toString().split("\t")[0] ??
  "";
console.log(`合計 ${total} — これを完全に削除します。復元はできません。`);

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
await $`find ${g} -mindepth 1 -maxdepth 1 -exec /bin/rm -rf -- {} +`;

const dfLine =
  await $`df -h ${process.env.HOME} | awk 'NR==2{print $4" free"}'`.text();
console.log(`✅ purge 完了。 ${dfLine.trim()}`);
