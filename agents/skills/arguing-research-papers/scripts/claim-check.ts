/** Structural floor check for a filled arguing-research-papers CLAIM SPEC. */

type SlotName = "g0" | "g1c" | "g1k" | "g2a" | "g2s" | "g3p" | "g3o";

function trim(value: string): string {
  return value.trim().replace(/^　+|　+$/g, "");
}

function valueAfterLastColon(line: string): string {
  const normalized = line.replaceAll("：", ":");
  const index = normalized.lastIndexOf(":");
  return index === -1 ? "" : trim(normalized.slice(index + 1));
}

function isPlaceholder(value: string): boolean {
  return (
    value === "" ||
    /^(\[\.\.\.\]|\[…\]|\[ *\])$/.test(value) ||
    /^(未回答|未記入|未定|TBD|N\/?A|NA|[Nn]one( yet)?|[Nn]othing|なし|-|—|ー|―|\?+|\.\.\.)$/.test(
      value,
    )
  );
}

function isBracketPlaceholder(value: string): boolean {
  const normalized = value
    .replaceAll("［", "[")
    .replaceAll("］", "]")
    .replaceAll("【", "[")
    .replaceAll("】", "]");
  const remaining = normalized
    .replaceAll(/\[[^\]]*\]/g, "")
    .replaceAll(/[\[\]()\/ \t·・、,;:-]/g, "");
  return normalized.startsWith("[") && remaining === "";
}

function placeholder(value: string): boolean {
  return isPlaceholder(value) || isBracketPlaceholder(value);
}

function stripScaffold(value: string): string {
  return value.replaceAll(
    /existing methods?|prior work|current approaches?|previous work|unlike/gi,
    "",
  );
}

function hasNamedReference(value: string): boolean {
  return (
    /(19|20)\d\d/.test(value) ||
    /[A-Z][A-Za-z0-9.+-]*[A-Za-z0-9] +et al/.test(value) ||
    /"[^"]+"|“[^”]+”/.test(value) ||
    /[A-Z][A-Za-z0-9-][A-Za-z0-9-]+/.test(stripScaffold(value))
  );
}

function barePositioning(value: string): boolean {
  return /unlike prior work|(existing methods?|prior work|current approaches?|previous work) (struggle|fail|cannot|are)/i.test(
    value,
  );
}

function report(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function readInput(): Promise<string> {
  const [input, ...extra] = Bun.argv.slice(2);
  if (extra.length > 0)
    throw new Error("usage: bun claim-check.ts [spec.md|-]");
  if (input === undefined || input === "-")
    return new Response(Bun.stdin.stream()).text();
  if (!(await Bun.file(input).exists()))
    throw new Error(`claim-check: file not found: ${input}`);
  return Bun.file(input).text();
}

async function main(): Promise<void> {
  const slots: Partial<Record<SlotName, string>> = {};
  let superlatives = 0;
  let mush = 0;
  let bare = 0;
  const capture = (name: SlotName, line: string): void => {
    if (slots[name] === undefined || placeholder(slots[name] ?? ""))
      slots[name] = valueAfterLastColon(line);
  };

  for (const line of (await readInput()).split(/\r?\n/)) {
    if (/^[ \t]*[-*][ \t*]*[Ii]n hand/.test(line)) capture("g0", line);
    if (/^[ \t]*[-*][ \t*]*[Gg]overning claim/.test(line)) capture("g1c", line);
    if (/^[ \t]*[-*][ \t*]*(?:[Ii]nstability|[Rr]eader-cost)/.test(line))
      capture("g1k", line);
    if (
      /^[ \t]*[-*][ \t*]*(?:[Ee]vidence anchor|[Pp]er claim.*anchor)/.test(line)
    )
      capture("g2a", line);
    if (/^[ \t]*[-*][ \t*]*[Ss]cope qualifier/.test(line)) capture("g2s", line);
    if (/^[ \t]*[-*][ \t*]*[Nn]earest prior/.test(line)) capture("g3p", line);
    if (/^[ \t]*[-*][ \t*]*(?:[Ss]harpest|[Rr]eviewer objection)/.test(line))
      capture("g3o", line);

    const scan =
      line.startsWith("-") || /^[ \t]*-/.test(line)
        ? valueAfterLastColon(line)
        : line;
    const lower = scan.toLowerCase();
    if (
      /state-of-the-art|paradigm|paves the way|broad implications|(^|[^a-z])novel([^a-z]|$)|robustly|(^|[^a-z])outperforms|(^|[^a-z])significantly/.test(
        lower,
      )
    )
      superlatives += 1;
    if (
      /may potentially|it is worth noting|to some extent|further research is needed/.test(
        lower,
      )
    )
      mush += 1;
    if (
      /unlike prior work|existing methods (struggle|fail|cannot|are)/.test(
        lower,
      )
    )
      bare += 1;
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
  const present = (value: string | undefined): value is string =>
    value !== undefined && !placeholder(value);

  if (slots.g0 === undefined)
    fail(
      "G0  FAIL     『In hand』(materials audit) の行が無い -> 手元の results/priors/venue を監査してから主張を組む (SKILL.md G0)",
    );
  else if (!present(slots.g0))
    fail(
      "G0  FAIL     materials audit 未記入 -> 実際に手元にある物を列挙 (無い物は placeholder 化し下流で断言しない)",
    );
  else report("G0  PASS     materials audit あり");

  if (slots.g1c === undefined)
    fail("G1  MISSING  『Governing claim』の行が無い");
  else if (!present(slots.g1c))
    fail(
      "G1  FAIL     governing claim が未記入/placeholder ([VERIFY] 等) -> まだ主張が絞れていない (絞る)",
    );
  else report("G1  PASS     governing claim あり");
  if (slots.g1k === undefined)
    fail("G1  MISSING  『Instability + reader-cost』の行が無い");
  else if (!present(slots.g1k))
    fail(
      "G1  FAIL     instability/cost が未記入/placeholder -> gap without a cost は problem ではない",
    );
  else report("G1  PASS     instability + reader-cost あり");

  if (slots.g2a === undefined)
    fail("G2  MISSING  『evidence anchor』の行が無い");
  else if (isPlaceholder(slots.g2a))
    fail("G2  FAIL     evidence anchor 未記入 -> 主張が証拠に紐付いていない");
  else {
    report(
      "G2  PASS     evidence anchor あり (中身が主張を licence するかは人が判定)",
    );
    if (
      /\d/.test(slots.g2a) &&
      !/\[VERIFY|\[VALUE|\[CITATION|\[BASELINE|\[STAT/.test(slots.g2a) &&
      !/[Tt]able|[Ff]ig|[Tt]heorem|[Ll]emma|§|[Aa]ppendix|表|図|定理|補題|付録/.test(
        slots.g2a,
      )
    ) {
      warn(
        "G2  WARN     anchor に数値があるが [VERIFY]/[VALUE] placeholder も locus 明示も無い -> 実在確認 or placeholder 化 (捏造禁止, calibration.md §6)",
      );
    }
  }
  if (slots.g2s === undefined)
    fail(
      "G2  FAIL     『Scope qualifier』の行が無い -> scope を hedge していない (SKILL.md §G2 の必須 artifact)",
    );
  else if (!present(slots.g2s))
    fail(
      'G2  FAIL     scope qualifier が未記入/placeholder -> "in regime S ... unless Y" を書く (scope-hedge/importance-bold)',
    );
  else report("G2  PASS     scope qualifier + rebuttal あり");

  if (slots.g3p === undefined)
    fail("G3  MISSING  『Nearest prior work』の行が無い");
  else if (!present(slots.g3p))
    fail(
      "G3  FAIL     positioning が未記入/placeholder ([CITATION NEEDED] 等) -> 具体の prior を NAMED で",
    );
  else if (/\[X\]|\[Y\]|\[Z\]/.test(slots.g3p))
    fail(
      "G3  FAIL     positioning が template のまま ([X]/[Y]/[Z]) -> 具体の prior method と gap を名指し",
    );
  else if (barePositioning(slots.g3p))
    fail(
      'G3  FAIL     bare positioning 句 ("unlike prior work"/"existing methods fail" 等) -> 具体の named prior method + gap に置換 (CARS Move 2)',
    );
  else if (!hasNamedReference(slots.g3p))
    fail(
      'G3  FAIL     bare positioning -> 具体の prior work を NAMED で ("unlike prior work" 禁止, CARS Move 2)',
    );
  else report("G3  PASS     named prior work + gap あり");
  if (slots.g3o === undefined)
    fail("G3  MISSING  『reviewer objection』の行が無い");
  else if (!present(slots.g3o))
    fail(
      "G3  FAIL     sharpest objection が未記入/placeholder -> red-team を回す (reviewer-defense.md §2)",
    );
  else report("G3  PASS     hostile-reviewer objection あり");

  report("----");
  if (superlatives > 0)
    warn(
      `DENY  WARN  unwarranted superlative らしきトークン ${superlatives} 件 -> 各々 inline warrant を付けるか downgrade (calibration.md §1)`,
    );
  if (mush > 0)
    warn(
      `DENY  WARN  over-hedge mush らしきトークン ${mush} 件 -> verb-softener を削り scope hedge に置換`,
    );
  if (bare > 0)
    warn(
      `DENY  WARN  bare positioning 句 ${bare} 件 -> named prior method に (spec 外の本文も確認)`,
    );
  report(
    `gates: FAIL=${fails} WARN=${warns}  (FLOOR — 構造のみ。意味は SKILL.md の G1/G2/G3 と calibration.md に照らして人/agent が判定)`,
  );
  if (fails > 0) {
    report(
      "-> FAIL の欄は該当ゲート未通過。fluent な散文で埋めず、どのゲートが落ちたかを述べよ。",
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
