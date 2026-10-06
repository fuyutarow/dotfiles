import { $ } from "bun";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";

import { existingGraveyards, graveyardCandidates } from "./graveyards";
import { cancel, isCancel, log, progress, text } from "@clack/prompts";
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

// The answer must be typed by a human at a terminal: no TTY on stdin is a refusal, never a "yes"
// read from a pipe. Clack's text() releases stdin after the answer (the earlier
// `process.stdin.once("data")` kept it open, so the process printed "✅ purge 完了" and never
// exited — a rented box, 2026-10-06). Esc / Ctrl-C cancels; anything but exactly "yes" is a no.
if (!process.stdin.isTTY) {
  cancel("人間専用です。端末から実行してください。中止しました。");
  process.exit(1);
}
const ans = await text({ message: "続けるなら yes と入力" });
if (isCancel(ans) || ans.trim() !== "yes") {
  cancel("中止しました。");
  process.exit(1);
}

// The delete is the slow part (one unlink per entry), so it reports progress — never a silent wait.
// rm -v prints one line per entry it removed; counting those lines against countEntries() is the bar.
// On a TTY the bar is Clack's progress(): it measures display width and, on every frame, moves up
// over the rows the last frame wrapped to before redrawing, so a narrow pane keeps one bar (a
// hand-drawn \r bar left one row per frame on a ~55-column herdr pane, 2026-10-06). Off a TTY Clack
// would write its spinner escapes into the log, so there it is one plain line per 10% step.
const tty = process.stdout.isTTY;
const count = (v: number): string => v.toLocaleString("en-US");
for (const g of graves) {
  const total = countEntries(g.path);
  if (total === 0) {
    log.info(`${g.label}: 空です`);
    continue;
  }
  const label = (done: number): string =>
    `${g.label}: 削除中 ${count(done)}/${count(total)} 件`;
  const bar = tty
    ? progress({ style: "heavy", max: total, size: 20 })
    : undefined;
  bar?.start(label(0));
  // how the run ends is said where the progress was shown: the bar on a TTY, a log line elsewhere
  const end =
    bar === undefined
      ? {
          error: (m: string): void => {
            log.error(m);
          },
          stop: (m: string): void => {
            log.success(m);
          },
        }
      : {
          error: (m: string): void => {
            bar.error(m);
          },
          stop: (m: string): void => {
            bar.stop(m);
          },
        };
  let done = 0;
  let step = 0;
  const advance = (removed: number): void => {
    // capped at total: a name with a newline makes rm -v print two lines for one entry
    const next = Math.min(total, done + removed);
    bar?.advance(next - done, label(next));
    done = next;
    const now = Math.floor((done / total) * 10);
    if (bar === undefined && now > step) {
      step = now;
      process.stdout.write(`${label(done)} (${now * 10}%)\n`);
    }
  };
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
  for await (const chunk of rm.stdout) advance(newlines(chunk));
  const code = await rm.exited;
  if (code !== 0) {
    const why = `${g.path} の削除が exit ${code} で終わりました(上の rm のエラーを参照)。残りは削除していません。`;
    end.error(why);
    process.exit(1);
  }
  end.stop(`${g.label}: ${count(done)} 件を削除しました`);
}

const dfLine =
  await $`df -h ${process.env.HOME} | awk 'NR==2{print $4" free"}'`.text();
console.log(`✅ purge 完了。 ${dfLine.trim()}`);
