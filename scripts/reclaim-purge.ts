import { $ } from "bun";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import { existingGraveyards, graveyardCandidates } from "./graveyards";
import { countEntries, newlines, progressLine } from "./purge-progress";

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

// prompt() reads ONE line and lets go of stdin. The previous `process.stdin.once("data")` left
// stdin open after the answer, so the process printed "✅ purge 完了" and then never exited — a
// finished command that looked hung (a rented box, 2026-10-06). null = EOF: no answer is "no".
const ans = (prompt("続けるなら yes と入力:") ?? "").trim();

if (ans !== "yes") {
  console.log("中止しました。");
  process.exit(1);
}

// The delete is the slow part (one unlink per entry), so it reports progress — never a silent wait.
// rm -v prints one line per entry it removed; counting those lines against countEntries() is the bar.
// On a TTY the bar redraws in place; elsewhere (a log, a pipe) one line per 10% step.
const tty = process.stdout.isTTY;
for (const g of graves) {
  process.stdout.write(`${g.label}: 件数を数えています…\n`);
  const total = countEntries(g.path);
  if (total === 0) {
    console.log(`${g.label}: 空です`);
    continue;
  }
  const t0 = performance.now();
  let done = 0;
  let shown = -1; // TTY: last redraw time; else: last 10% step printed
  const show = (final: boolean): void => {
    const line = progressLine(done, total, performance.now() - t0);
    if (tty) {
      if (!final && performance.now() - shown < 100) return;
      shown = performance.now();
      process.stdout.write(`\r削除中 ${line}\u001B[K${final ? "\n" : ""}`);
      return;
    }
    const step =
      total === 0 ? 10 : Math.floor((Math.min(done, total) / total) * 10);
    if (final || step > shown) {
      shown = step;
      process.stdout.write(`削除中 ${line}\n`);
    }
  };
  show(false);
  // 絶対パスで shell の rm 無効化を回避
  const rm = Bun.spawn(
    [
      "find",
      g.path,
      "-mindepth",
      "1",
      "-maxdepth",
      "1",
      "-exec",
      "/bin/rm",
      "-rfv",
      "--",
      "{}",
      "+",
    ],
    { stdout: "pipe", stderr: "inherit" },
  );
  for await (const chunk of rm.stdout) {
    done += newlines(chunk);
    show(false);
  }
  const code = await rm.exited;
  show(true);
  if (code !== 0) {
    console.log(
      `❌ ${g.path} の削除が exit ${code} で終わりました(上の rm のエラーを参照)。残りは削除していません。`,
    );
    process.exit(1);
  }
}

const dfLine =
  await $`df -h ${process.env.HOME} | awk 'NR==2{print $4" free"}'`.text();
console.log(`✅ purge 完了。 ${dfLine.trim()}`);
