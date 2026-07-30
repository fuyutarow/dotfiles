import { existsSync } from "node:fs";
import { typeFlag } from "type-flag";

function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type Gate = Readonly<{
  id: string;
  label: RegExp;
  pass: string;
  missing: string;
  failed: string;
  warn?: string;
  test?: (value: string) => boolean;
  testSeverity?: "FAIL" | "WARN";
}>;

function valueAfterColon(line: string): string {
  const normalized = line
    .replaceAll("←", "←")
    .replace(/←.*$/, "")
    .replaceAll("：", ":");
  const index = normalized.indexOf(":");
  return index === -1
    ? ""
    : normalized
        .slice(index + 1)
        .trim()
        .replace(/^　+|　+$/g, "");
}

function placeholder(value: string): boolean {
  return (
    value === "" ||
    /\[\.\.\.\]|\[…\]|\[ *\]/.test(value) ||
    /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+)$/.test(value)
  );
}

function threshold(value: string): boolean {
  return /[0-9]|割|超|未満|以上|以下|%|％|閾値|threshold|倍|円|ドル|\$|秒|分|時間|日|週|月|年|回|件|人/.test(
    value,
  );
}

async function input(): Promise<string> {
  const parsed = typeFlag({}, Bun.argv.slice(2), {
    ignore: rejectUnknownFlag,
  });
  const unknownFlag = Object.keys(parsed.unknownFlags)[0];
  if (unknownFlag !== undefined)
    throw new Error(`unknown option '--${unknownFlag}'`);
  const [path, ...extra] = parsed._;
  if (extra.length > 0)
    throw new Error("usage: bun gate-check.ts [thesis.md|-]");
  if (path === undefined || path === "-")
    return new Response(Bun.stdin.stream()).text();
  if (!existsSync(path)) throw new Error(`gate-check: file not found: ${path}`);
  return Bun.file(path).text();
}

async function main(): Promise<void> {
  const text = await input();
  const lines = text.split("\n");
  const gates: Gate[] = [
    {
      id: "G1",
      label: /制約を装った慣習/,
      pass: "覆す慣習を名指し",
      missing: "『制約を装った慣習』の行が見つからない",
      failed: "箱B 未達（空/placeholder）→ 記述しただけ = me-too",
    },
    {
      id: "G2",
      label: /転移した構造|源分野/,
      pass: "関係写像+予測あり",
      missing: "『転移した構造』の行が見つからない",
      failed: "転移が空 → 新結合なし",
      warn: "新予測/写像記号(→,予測,ならば)が無い → 表層類似(比喩)の疑い",
      test: (value) => /予測|→|=>|ならば|なら/.test(value),
      testSeverity: "WARN",
    },
    {
      id: "G3",
      label: /最も安い反証実験|反証実験/,
      pass: "kill-experiment + 閾値あり",
      missing: "『3a 最も安い反証実験』の行が見つからない",
      failed: "反証実験が空 → 反証不能 = 信仰",
      warn: "kill-signal に閾値(数値/割/超/%…)が無い → 殺せる実験になっていない",
      test: threshold,
      testSeverity: "FAIL",
    },
    {
      id: "3d",
      label: /撤退基準/,
      pass: "撤退閾値あり",
      missing: "『撤退基準』の行が見つからない",
      failed: "撤退基準が空 → 事前 kill-criteria なし",
      warn: "撤退基準に閾値が検出できない → 主観的（なんとなく）の疑い",
      test: threshold,
      testSeverity: "WARN",
    },
  ];
  let failures = 0;
  let warnings = 0;
  for (const gate of gates) {
    const line = lines.find((candidate) => gate.label.test(candidate));
    const value = line === undefined ? undefined : valueAfterColon(line);
    if (value === undefined) {
      process.stdout.write(`${gate.id}  MISSING  ${gate.missing}\n`);
      failures += 1;
    } else if (placeholder(value)) {
      process.stdout.write(`${gate.id}  FAIL     ${gate.failed}\n`);
      failures += 1;
    } else if (gate.test !== undefined && !gate.test(value)) {
      const severity = gate.testSeverity ?? "WARN";
      process.stdout.write(`${gate.id}  ${severity}     ${gate.warn}\n`);
      if (severity === "WARN") warnings += 1;
      else failures += 1;
    } else {
      process.stdout.write(`${gate.id}  PASS     ${gate.pass}\n`);
    }
  }
  process.stdout.write("----\n");
  process.stdout.write(
    `gates: FAIL=${failures} WARN=${warnings}  (floor check — 構造のみ検査。意味は人間/エージェントが G1/G2/G3 に照らす)\n`,
  );
  if (failures > 0)
    process.stdout.write(
      "→ FAIL の欄は Phase 3 通過条件では『未回答』扱い。thesis を磨く前に、どのゲートが落ちたかを述べよ。\n",
    );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
