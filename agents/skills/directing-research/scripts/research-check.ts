/** Structural floor check for a filled directing-research RESEARCH SPEC. */

import { typeFlag } from "type-flag";

function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type SlotName =
  | "g1s"
  | "g1l"
  | "g1fl"
  | "g2c"
  | "g2f"
  | "g2t"
  | "g3p"
  | "g3d"
  | "g3a"
  | "g3n"
  | "g4p"
  | "g4k"
  | "g4h";

function valueAfterLabel(line: string): string {
  const normalized = line.replaceAll("：", ":");
  const labelEnd = normalized.indexOf("):");
  const index = labelEnd === -1 ? normalized.indexOf(":") : labelEnd + 1;
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
    /^(\[\.\.\.\]|\[…\]|\[ *\])$/.test(value) ||
    /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+|\.\.\.)$/.test(value)
  );
}

function hasTimestamp(value: string): boolean {
  return /(19|20)\d\d[-/]\d|timestamp|dated|\d{4}-\d{2}/i.test(value);
}

function hasThreshold(value: string): boolean {
  const withoutDate = value.replaceAll(
    /(19|20)\d\d[-/]\d\d?(?:[-/]\d\d?)?/g,
    "",
  );
  return (
    ((/[<>≤≥%％]/.test(withoutDate) ||
      /threshold|閾値|kill|以上|以下|未満|超|below|above|stall/i.test(
        withoutDate,
      )) &&
      /\d/.test(withoutDate)) ||
    /stop condition|stop rule/i.test(withoutDate)
  );
}

function atLeastItems(value: string, minimum: 2 | 3): boolean {
  if (minimum === 2 ? /[2-9]|\d\d/.test(value) : /[3-9]|\d\d/.test(value))
    return true;
  const separators = [...value.matchAll(/;|·|、|, | vs | \/ /g)].length;
  return separators >= minimum - 1;
}

async function readInput(): Promise<string> {
  const parsed = typeFlag({}, Bun.argv.slice(2), {
    ignore: rejectUnknownFlag,
  });
  const unknownFlag = Object.keys(parsed.unknownFlags)[0];
  if (unknownFlag !== undefined)
    throw new Error(`unknown option '--${unknownFlag}'`);
  const [input, ...extra] = parsed._;
  if (extra.length > 0)
    throw new Error("usage: bun research-check.ts [spec.md|-]");
  if (input === undefined || input === "-")
    return new Response(Bun.stdin.stream()).text();
  if (!(await Bun.file(input).exists()))
    throw new Error(`research-check: file not found: ${input}`);
  return Bun.file(input).text();
}

function report(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const slots: Partial<Record<SlotName, string>> = {};
  let virtue = 0;
  const capture = (name: SlotName, line: string): void => {
    if (slots[name] === undefined) slots[name] = valueAfterLabel(line);
  };

  for (const line of (await readInput()).split(/\r?\n/)) {
    if (/consequence-ranked slate/i.test(line)) capture("g1s", line);
    if (/fresh lever|why-now/i.test(line)) capture("g1l", line);
    if (/cheap victory/i.test(line)) capture("g2c", line);
    if (/firewall/i.test(line)) capture("g2f", line);
    if (/pre-registration/i.test(line)) capture("g3p", line);
    if (/denominator/i.test(line)) capture("g3d", line);
    if (/generator/i.test(line) && /auditor/i.test(line)) capture("g3a", line);
    if (/portfolio/i.test(line)) capture("g4p", line);
    if (/learning-rate kill/i.test(line)) capture("g4k", line);
    if (/live hypothes/i.test(line)) capture("g4h", line);
    if (/fluency check/i.test(line)) capture("g1fl", line);
    if (/formalization throws away|throws away/i.test(line))
      capture("g2t", line);
    if (/negation/i.test(line)) capture("g3n", line);
    if (/^[ \t]*-/.test(line)) {
      const value = valueAfterLabel(line).toLowerCase();
      if (
        /^(be|stay|remain) (honest|careful|rigorous|bold|brave|curious|objective|thorough)([ .]|$)|make sure to|try to be|remember to be|just be /.test(
          value,
        )
      )
        virtue += 1;
    }
  }

  let fails = 0;
  let warns = 0;
  const fail = (message: string): void => {
    report(message);
    fails += 1;
  };
  const warn = (message: string): void => {
    report(message);
    warns += 1;
  };
  const filled = (value: string | undefined): value is string =>
    value !== undefined && !placeholder(value);

  if (slots.g1s === undefined)
    fail("G1  MISSING  『Consequence-ranked slate』の行が無い");
  else if (!filled(slots.g1s))
    fail(
      "G1  FAIL     slate 未記入 -> consequence 前に fluency で選んでいる疑い",
    );
  else report("G1  PASS     consequence-ranked slate あり");
  if (slots.g1l === undefined)
    warn("G1  WARN     『Fresh lever / why-now』の行が無い");
  else if (!filled(slots.g1l))
    warn("G1  WARN     lever 未記入 -> lever 無しなら shelve with a trigger");
  else report("G1  PASS     fresh lever / why-now あり");
  if (slots.g1fl === undefined)
    warn("G1  WARN     『Fluency check』の行が無い");
  else if (!filled(slots.g1fl))
    warn(
      "G1  WARN     fluency check 未記入 -> effortless method = crowdedness alarm",
    );
  else report("G1  PASS     fluency check あり");

  if (slots.g2c === undefined)
    fail("G2  MISSING  『The cheap victory』の行が無い");
  else if (!filled(slots.g2c))
    fail(
      "G2  FAIL     cheap victory 未記入 -> metric が gameable か未検討 (Goodhart)",
    );
  else report("G2  PASS     cheap victory あり");
  if (slots.g2f === undefined)
    fail("G2  MISSING  『Optimize/trust firewall』の行が無い");
  else if (!filled(slots.g2f))
    fail(
      "G2  FAIL     firewall 未記入 -> held-out witness 無し = optimize した数字を trust している",
    );
  else if (
    !/optimi[sz]/i.test(slots.g2f) ||
    !/witness|held[- ]?out|holdout/i.test(slots.g2f)
  )
    fail(
      "G2  FAIL     firewall に optimize/witness の両輪が無い -> 分離になっていない",
    );
  else report("G2  PASS     optimize/trust firewall あり");
  if (slots.g2t === undefined)
    warn("G2  WARN     『What the formalization throws away』の行が無い");
  else if (!filled(slots.g2t))
    warn(
      "G2  WARN     throws-away 未記入 -> 捨てた所に難しさが有れば frame が誤り (Type III)",
    );
  else report("G2  PASS     throws-away あり");

  if (slots.g3p === undefined)
    fail("G3  MISSING  『Pre-registration』の行が無い");
  else if (!filled(slots.g3p))
    fail(
      "G3  FAIL     pre-registration 未記入 -> predicted/postdicted 境界が無い (HARKing)",
    );
  else {
    report("G3  PASS     pre-registration あり");
    if (!hasTimestamp(slots.g3p))
      warn(
        "G3  WARN     pre-reg に TIMESTAMP/日付が無い -> 事前に書いた証拠にならない",
      );
    if (!hasThreshold(slots.g3p))
      warn("G3  WARN     pre-reg に kill-threshold が無い");
  }
  if (slots.g3d === undefined) fail("G3  MISSING  『Denominator』の行が無い");
  else if (!filled(slots.g3d))
    fail(
      "G3  FAIL     denominator 未記入 -> best-of-N を point estimate として報告する疑い",
    );
  else if (!/\d/.test(slots.g3d))
    warn("G3  WARN     denominator に N (試行数) が無い");
  else report("G3  PASS     denominator あり");
  if (slots.g3a === undefined)
    fail("G3  MISSING  『generator≠auditor』の行が無い");
  else if (!filled(slots.g3a))
    fail(
      "G3  FAIL     generator≠auditor 未記入 -> 生成者が自分を監査している (leakage 不可視)",
    );
  else if (!/independent|different|separate|別|独立|外部/i.test(slots.g3a))
    warn("G3  WARN     同一モデルの自己再読の疑い -> 真の独立監査を");
  else report("G3  PASS     generator≠auditor あり");
  if (slots.g3n === undefined) warn("G3  WARN     『Negation』の行が無い");
  else if (!filled(slots.g3n))
    warn(
      "G3  WARN     negation 未記入 -> 反対仮説を先に述べる (anti-sycophancy)",
    );
  else report("G3  PASS     negation あり");

  if (slots.g4p === undefined) warn("G4  WARN     『Portfolio』の行が無い");
  else if (!filled(slots.g4p))
    warn("G4  WARN     portfolio 未記入 -> all-in or scatter の疑い");
  else if (!atLeastItems(slots.g4p, 2))
    warn(
      "G4  WARN     portfolio が単一 bet に見える (>=2 必要) -> all-in or scatter の疑い",
    );
  else report("G4  PASS     portfolio あり");
  if (slots.g4k === undefined)
    fail("G4  MISSING  『Learning-rate kill/persist』の行が無い");
  else if (!filled(slots.g4k))
    fail("G4  FAIL     kill/persist 未記入 -> 方向レベルの kill 基準が無い");
  else if (
    !/learn|information|bits|novel|surprise|understanding|uncertainty|学習|情報|新規/i.test(
      slots.g4k,
    )
  )
    warn(
      "G4  WARN     metric の停滞ではなく学習率で kill する条件になっていない疑い",
    );
  else {
    report("G4  PASS     learning-rate kill/persist あり");
    if (!/family|closure|tested family|族|境界|閉包/i.test(slots.g4k))
      warn(
        "G4  WARN     kill/persist に『族(tested family)の境界』の言及が無い -> family-scoped kill か space 全体の kill か不明",
      );
  }
  if (slots.g4h === undefined)
    warn("G4  WARN     『Live hypotheses』の行が無い");
  else if (!filled(slots.g4h)) warn("G4  WARN     live hypotheses 未記入");
  else if (!atLeastItems(slots.g4h, 3))
    warn(
      "G4  WARN     live hypotheses が >=3 に見えない -> 1 つに collapse させない (Chamberlin)",
    );
  else report("G4  PASS     >=3 live hypotheses あり");

  report("----");
  if (virtue > 0)
    warn(
      `LAW   WARN  virtue らしき記述 ${virtue} 件 -> 「be honest」等の徳目ではなく MECHANISM を書く (SKILL.md THE LAW)`,
    );
  report(
    `gates: FAIL=${fails} WARN=${warns}  (FLOOR — 構造のみ。意味は SKILL.md の G1-G4 と references に照らして人/agent が判定)`,
  );
  if (fails > 0) {
    report(
      "-> FAIL の欄は該当ゲート未通過。徳目で埋めず、どのゲートの mechanism が欠けているかを述べよ。",
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
});
