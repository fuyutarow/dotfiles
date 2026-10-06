import { $ } from "bun";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import { existingGraveyards, graveyardCandidates } from "./graveyards";
import { Presets, SingleBar } from "cli-progress";
import { countEntries, newlines } from "./purge-progress";

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
// The bar is cli-progress: on a TTY it redraws in place with the terminal's line wrap off, so a
// pane narrower than the line cuts it instead of leaving a row behind per frame (a hand-drawn bar
// did that on a ~55-column herdr pane, 2026-10-06); elsewhere (a log, a pipe) a line every 10 s.
const count = (v: number): string => v.toLocaleString("en-US");
for (const g of graves) {
  process.stdout.write(`${g.label}: 件数を数えています…\n`);
  const total = countEntries(g.path);
  if (total === 0) {
    console.log(`${g.label}: 空です`);
    continue;
  }
  const bar = new SingleBar(
    {
      format:
        "削除中 [{bar}] {percentage}%  {value}/{total} 件  {duration_formatted}",
      formatValue: (v, _options, type) =>
        type === "value" || type === "total" ? count(v) : String(v),
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 10_000,
      stream: process.stdout,
    },
    Presets.shades_classic,
  );
  bar.start(total, 0);
  let done = 0;
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
    // capped at total: a name with a newline makes rm -v print two lines for one entry
    done = Math.min(total, done + newlines(chunk));
    bar.update(done);
  }
  const code = await rm.exited;
  bar.stop();
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
