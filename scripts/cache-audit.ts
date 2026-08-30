import { $ } from "bun";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";

// READ-ONLY 断捨離 evidence: stale dotdirs, rustup toolchains (with a pin search),
// vscode-server versions, and the ~/.cache breakdown — each with size, last-touched date
// and age. Deletes nothing; hand the table to whoever decides. STALE_DAYS=180 to retune.

const staleDays = Number(process.env.STALE_DAYS ?? "180");
const now = Math.floor(Date.now() / 1000);
const home = homedir();

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
for (const name of readdirSync(home).sort()) {
  if (!(name.length >= 2 && name[0] === "." && name[1] !== ".")) continue;
  const d = `${home}/${name}`;
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(d);
  } catch {
    continue;
  }
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

console.log();
console.log("== 2. rustup toolchain: 既定と、プロジェクトによる固定の有無 ==");
if (Bun.which("rustup")) {
  const list = await $`rustup toolchain list`.text();
  for (const line of list.replace(/\n$/, "").split("\n")) {
    console.log(`  ${line}`);
  }
  console.log("  -- rust-toolchain で固定しているプロジェクト --");
  if (Bun.which("fd")) {
    const projects = process.env.AUDIT_PROJECTS ?? `${home}/Workspace`;
    const fdRes = await $`fd -H -t f "^rust-toolchain(\\.toml)?$" ${projects}`
      .quiet()
      .nothrow();
    const found = fdRes.stdout.toString().split("\n").filter(Boolean);
    for (const f of found) {
      const grepRes = await $`grep -h channel ${f}`.quiet().nothrow();
      const channel = grepRes.stdout
        .toString()
        .replace(/ /g, "")
        .replace(/\n+$/, "");
      console.log(`  ${f} → ${channel}`);
    }
    console.log(
      "  (この一覧が空なら、既定以外の toolchain を固定しているものは無い)",
    );
  } else {
    console.log("  fd 不在のため未検索");
  }
}

console.log();
console.log("== 3. vscode-server: 現行版以外は再接続で取り直される ==");
const serversDir = `${home}/.vscode-server/cli/servers`;
if (existsSync(serversDir) && statSync(serversDir).isDirectory()) {
  for (const name of readdirSync(serversDir).sort()) {
    if (!name.startsWith("Stable-")) continue;
    const v = `${serversDir}/${name}`;
    if (!existsSync(v)) continue;
    const size = await duH(v);
    console.log(`  ${size.padEnd(8)} ${name.padEnd(46)} ${await when(v)}`);
  }
}

console.log();
console.log("== 4. ~/.cache 内訳(降順) ==");
const cacheDir = `${home}/.cache`;
if (existsSync(cacheDir)) {
  // Shell glob expansion (`.cache/*`) is sorted; readdirSync is not — match it so a size tie
  // in `sort -rh` breaks the same way.
  const entries = readdirSync(cacheDir)
    .sort()
    .map((n) => `${cacheDir}/${n}`);
  if (entries.length > 0) {
    const duRaw = (
      await $`du -sh ${entries}`.quiet().nothrow()
    ).stdout.toString();
    const sorted = await $`echo ${duRaw} | sort -rh | head -12`.text();
    for (const line of sorted.split("\n").filter(Boolean)) {
      console.log(`  ${line.replace(home, "~")}`);
    }
  }
}

console.log();
console.log("== 5. graveyard(rip 済み・まだ空きは増えていない) ==");
const graveyardCandidates = [
  process.env.GRAVEYARD ?? `/tmp/graveyard-${process.env.USER}`,
  `/tmp/graveyard-${process.env.USER}`,
];
for (const g of graveyardCandidates) {
  if (existsSync(g) && statSync(g).isDirectory()) {
    console.log(`  ${await duH(g)}  ${g}`);
    break;
  }
}
console.log();
const dfLine =
  await $`df -h ${home} | awk 'NR==2{print $4" free / "$2}'`.text();
console.log(`df: ${dfLine.trim()}`);
console.log(
  "→ 判断が要らない分は cache:clean / 受け入れた候補は rip / 空きが増えるのは cache:purge だけ",
);
