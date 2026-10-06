import { $ } from "bun";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fromThrowable } from "neverthrow";

import { jsonOf } from "../agents/hooks/zod.ts";
import { existingGraveyards, graveyardCandidates } from "./graveyards";
import { Receipt, stateDir } from "./reclaim-run.ts";
import {
  liveExecutables,
  readStore,
  releasesToRemove,
  STORES,
} from "./version-stores.ts";

// READ-ONLY 断捨離 evidence: stale dotdirs, rustup toolchains (with a pin search) and their
// optional components, vscode-server versions, self-updating CLIs' version stores, the ~/.cache
// breakdown, and the largest build-artifact dirs of ANY age — each with size, last-touched date
// and age. Deletes nothing; hand the table to whoever decides. STALE_DAYS=180 to retune.
// §6 and §7 are the judgment tier: what no blind task may remove (an active project's target/,
// a toolchain's offline docs), shown so a human can choose with the cost in view.

const staleDays = Number(process.env.STALE_DAYS ?? "180");
const now = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
const userHome = homedir();

// GNU then BSD
async function mtime(path: string): Promise<number | null> {
  const gnu = await $`stat -c %Y ${path}`.quiet().nothrow();
  if (gnu.exitCode === 0) return Number(gnu.stdout.toString().trim());
  const bsd = await $`stat -f %m ${path}`.quiet().nothrow();
  if (bsd.exitCode === 0) return Number(bsd.stdout.toString().trim());
  return null;
}

// → "2026-02-25 (148d)"
async function when(path: string): Promise<string> {
  const m = await mtime(path);
  if (m === null) return "";
  const gnuDate = await $`date -d @${m} +%F`.quiet().nothrow();
  const date =
    gnuDate.exitCode === 0
      ? gnuDate.stdout.toString().trim()
      : (await $`date -r ${m} +%F`.quiet().nothrow()).stdout.toString().trim();
  const days = Math.floor((now - m) / 86400);
  return `${date} (${days}d)`;
}

async function duH(path: string): Promise<string> {
  const res = await $`du -sh ${path}`.quiet().nothrow();
  if (res.exitCode !== 0) return "";
  return res.stdout.toString().split("\t")[0] ?? "";
}

console.log(`== 1. ~/ の隠しディレクトリ: 最終更新が ${staleDays} 日以上前 ==`);
// Shell glob expansion returns entries in sorted order; readdirSync does not.
for (const name of readdirSync(userHome).toSorted()) {
  if (!(name.length >= 2 && name[0] === "." && name[1] !== ".")) continue;
  const d = `${userHome}/${name}`;
  // statSync is overloaded (bigint/throwIfNoEntry variants); wrapping the CALL rather than the
  // bare function keeps this single-argument overload's plain-Stats return through fromThrowable.
  const statResult = fromThrowable(() => statSync(d))();
  if (statResult.isErr()) continue;
  const st = statResult.value;
  if (!st.isDirectory()) continue;
  const m = await mtime(d);
  if (m === null) continue;
  if (Math.floor((now - m) / 86400) < staleDays) continue;
  const size = await duH(d);
  console.log(`  ${size.padEnd(8)} ${`~/${name}`.padEnd(28)} ${await when(d)}`);
}
console.log(
  "  (サイズは候補のみ計測。年齢は手掛かりであって証拠ではない — 親の mtime は中身の",
);
console.log(
  "   更新を反映しないので ~/.local や ~/.rustup のような現役も並ぶ。§2〜§4 で裏を取れ)",
);

async function auditRustToolchainPins(searchHome: string): Promise<void> {
  console.log("  -- rust-toolchain で固定しているプロジェクト --");
  if (Bun.which("fd") === undefined) {
    console.log("  fd 不在のため未検索");
    return;
  }
  const projects = process.env.AUDIT_PROJECTS ?? `${searchHome}/Workspace`;
  const fdRes = await $`fd -H -t f "^rust-toolchain(\\.toml)?$" ${projects}`
    .quiet()
    .nothrow();
  const found = fdRes.stdout.toString().split("\n").filter(Boolean);
  for (const f of found) {
    const grepRes = await $`grep -h channel ${f}`.quiet().nothrow();
    const channel = grepRes.stdout
      .toString()
      .replaceAll(" ", "")
      .replace(/\n+$/u, "");
    console.log(`  ${f} → ${channel}`);
  }
  console.log(
    "  (この一覧が空なら、既定以外の toolchain を固定しているものは無い)",
  );
}

console.log();
console.log("== 2. rustup toolchain: 既定と、プロジェクトによる固定の有無 ==");
if (Bun.which("rustup") !== undefined) {
  const list = await $`rustup toolchain list`.text();
  for (const line of list.replace(/\n$/u, "").split("\n")) {
    console.log(`  ${line}`);
  }
  await auditRustToolchainPins(userHome);
}

async function auditVscodeServerVersions(serversDir: string): Promise<void> {
  for (const name of readdirSync(serversDir).toSorted()) {
    if (!name.startsWith("Stable-")) continue;
    const v = `${serversDir}/${name}`;
    if (!existsSync(v)) continue;
    const size = await duH(v);
    console.log(`  ${size.padEnd(8)} ${name.padEnd(46)} ${await when(v)}`);
  }
}

console.log();
console.log("== 3. vscode-server: 現行版以外は再接続で取り直される ==");
const serversDir = `${userHome}/.vscode-server/cli/servers`;
if (existsSync(serversDir) && statSync(serversDir).isDirectory()) {
  await auditVscodeServerVersions(serversDir);
}

async function auditCacheBreakdown(
  cacheDir: string,
  cacheHome: string,
): Promise<void> {
  // Shell glob expansion (`.cache/*`) is sorted; readdirSync is not — match it so a size tie
  // in `sort -rh` breaks the same way.
  const entries = readdirSync(cacheDir)
    .toSorted()
    .map((n) => `${cacheDir}/${n}`);
  if (entries.length === 0) return;
  const duRaw = (
    await $`du -sh ${entries}`.quiet().nothrow()
  ).stdout.toString();
  const sorted = await $`echo ${duRaw} | sort -rh | head -12`.text();
  for (const line of sorted.split("\n").filter(Boolean)) {
    console.log(`  ${line.replace(cacheHome, "~")}`);
  }
}

console.log();
console.log("== 4. ~/.cache 内訳(降順) ==");
const cacheDir = `${userHome}/.cache`;
if (existsSync(cacheDir)) {
  await auditCacheBreakdown(cacheDir, userHome);
}

console.log();
console.log(
  "== 5. version stores: 自己更新する CLI の旧版(reclaim:toolchains が消すもの) ==",
);
const live = liveExecutables();
const nowSec = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
for (const store of STORES) {
  const { releases, current } = readStore(userHome, store);
  const removable = new Set(
    releasesToRemove(releases, { current, live, nowSec, keepDays: 2 }).map(
      (r) => r.name,
    ),
  );
  for (const r of releases) {
    const busy = (live ?? []).some(
      (exe) => exe === r.path || exe.startsWith(`${r.path}/`),
    );
    const tag = [
      r.name === current ? "現行" : "",
      busy ? "実行中" : "",
      removable.has(r.name) ? "→ 削除対象" : "",
    ]
      .filter((t) => t !== "")
      .join(" ");
    console.log(
      `  ${(await duH(r.path)).padEnd(8)} ${`${store.name}/${r.name}`.padEnd(46)} ${await when(r.path)} ${tag}`,
    );
  }
}

/** The `limit` largest of `paths` (du -s), largest first. */
async function largest(paths: string[], limit: number): Promise<string[]> {
  if (paths.length === 0) return [];
  return (await $`du -s ${paths}`.quiet().nothrow()).stdout
    .toString()
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => {
      const [kb = "0", ...rest] = l.split("\t");
      return { kb: Number(kb), path: rest.join("\t") };
    })
    .toSorted((x, y) => y.kb - x.kb)
    .slice(0, limit)
    .map((e) => e.path);
}

async function auditBuildDirs(roots: string): Promise<void> {
  if (Bun.which("fd") === null) {
    console.log("  fd 不在のため未検索");
    return;
  }
  const found = (
    await $`fd -H -I -t d -d 4 --prune "^(target|node_modules|\\.venv)$" ${roots}`
      .quiet()
      .nothrow()
  ).stdout
    .toString()
    .split("\n")
    .filter((p) => p !== "");
  for (const path of await largest(found, 8)) {
    console.log(
      `  ${(await duH(path)).padEnd(8)} ${path.replace(userHome, "~").padEnd(46)} ${await when(path)}`,
    );
  }
  console.log(
    "  (30 日以内の現役は reclaim:builds が触らない。消すなら cargo clean / KONDO_OLDER=0 mise run reclaim:pick)",
  );
}

async function auditRustDocs(toolchains: string): Promise<void> {
  if (!existsSync(toolchains)) return;
  for (const tc of readdirSync(toolchains).toSorted((x, y) =>
    x.localeCompare(y),
  )) {
    const docs = `${toolchains}/${tc}/share/doc/rust/html`;
    if (!existsSync(docs)) continue;
    console.log(
      `  ${(await duH(docs)).padEnd(8)} rust-docs (${tc}) — オフライン文書。不要なら: rustup component remove rust-docs --toolchain ${tc}`,
    );
  }
}

console.log();
console.log(
  "== 6. 判断が要る: 年齢を問わない大きなビルド成果物 (target/ node_modules/ .venv/) ==",
);
await auditBuildDirs(process.env.AUDIT_PROJECTS ?? `${userHome}/Workspace`);

console.log();
console.log("== 7. 判断が要る: toolchain の省ける component ==");
await auditRustDocs(`${userHome}/.rustup/toolchains`);

console.log();
console.log("== 8. graveyard(削除済み・まだ空きは増えていない) ==");
// EVERY mechanism, not the first one found. Reporting only rip's graveyard is what hid 33 GB of
// trashed agent worktrees in the XDG trash beside it on r99 (2026-09-21) — see graveyards.ts.
const graves = existingGraveyards(
  graveyardCandidates(process.env, userHome),
  (p) => existsSync(p) && statSync(p).isDirectory(),
);
if (graves.length === 0) console.log("  無し");
for (const g of graves) {
  const size = await duH(g.path);
  console.log(
    `  ${size.padEnd(8)} ${g.path.replace(userHome, "~").padEnd(40)} ${g.label}`,
  );
}
console.log();
console.log("== 9. 直近の reclaim 実行(誰が・いつ・何を・空きの増減) ==");
const receipts = fromThrowable(() =>
  readFileSync(join(stateDir(), "log.jsonl"), "utf8"),
)()
  .unwrapOr("")
  .split("\n")
  .filter((l) => l !== "")
  .slice(-6)
  .flatMap((l) => {
    const r = jsonOf(Receipt).safeParse(l);
    return r.success ? [r.data] : [];
  });
if (receipts.length === 0) console.log("  記録なし");
for (const r of receipts) {
  const delta = (r.free_after - r.free_before) / 2 ** 30;
  console.log(
    `  ${r.started} ${r.name.padEnd(12)} exit ${r.exit} ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}G  ${r.host}:${r.pid}  ${r.output ?? ""}`,
  );
}
console.log();
const dfLine =
  await $`df -h ${userHome} | awk 'NR==2{print $4" free / "$2}'`.text();
console.log(`df: ${dfLine.trim()}`);
console.log(
  "→ 判断が要らない分は reclaim:clean(tool-native gc) / rustup・vscode-server・CLI 旧版は reclaim:toolchains(述語) / §6・§7 は人が選ぶ / 受け入れた候補は rip / 空きが増えるのは reclaim:purge だけ",
);
