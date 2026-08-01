/**
 * Structural floor check for a filled directing-research RESEARCH JUDGMENT SPEC.
 * Consumer: agent/human verdict lines.
 */

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
  | "stage"
  | "blindSpots"
  | "explorationAllocation"
  | "frames"
  | "axes"
  | "cheapVictory"
  | "firewall"
  | "collapse"
  | "registry"
  | "denominator"
  | "audit"
  | "portfolio"
  | "reopen";

type Check = Readonly<{
  id: string;
  label: string;
  value: string | undefined;
  invalid?: (value: string) => string | undefined;
  pass?: (value: string) => string;
}>;

const labelMatchers: ReadonlyArray<readonly [SlotName, RegExp]> = [
  ["stage", /stage diagnosis|段階診断/i],
  ["blindSpots", /blind[- ]spot packet|盲点.*(?:packet|パケット)/i],
  [
    "explorationAllocation",
    /exploration allocation|探索.*(?:allocation|配分)/i,
  ],
  ["frames", /problem[- ]frame slate|問題フレーム.*候補/i],
  ["axes", /selection axes|選択軸/i],
  ["cheapVictory", /(?:the )?cheap victory|安い勝利/i],
  ["firewall", /optimi[sz]e\/trust firewall|最適化.*信頼.*firewall/i],
  [
    "collapse",
    /diversity[- ]collapse rule|多様性.*(?:collapse|崩壊).*(?:rule|規則)/i,
  ],
  [
    "registry",
    /prediction[- ]registry policy|予測.*(?:台帳|レジストリ).*方針/i,
  ],
  ["denominator", /denominator policy|分母.*方針/i],
  [
    "audit",
    /independent[- ]audit requirement|独立監査.*要件|generator.*auditor|生成者.*監査者/i,
  ],
  ["portfolio", /portfolio update|ポートフォリオ.*更新/i],
  ["reopen", /reopen rule|再オープン.*規則|再検討.*規則/i],
];

const stagePattern =
  /corpus[- ]unclear|unclear corpus|anomaly[- ]unverified|unverified anomaly|assumptions?[- ]unexposed|unexposed assumptions?|problem[- ]underconstructed|underconstructed problem|thesis[- ]missing|missing thesis|candidate[- ]selection|select(?:ing)? candidates|one[- ]bet[- ]untested|untested (?:one|single) bet|program[- ]steering|steer(?:ing)? (?:the )?program|finished[- ]claim|finished claim|コーパス.*不明|文献.*不明|異常.*未検証|前提.*未(?:露出|顕在化)|問題.*未構成|問題設定.*不足|仮説.*欠如|候補.*選択|単一.*未検証|プログラム.*操舵|完成.*主張/i;

const axisPatterns = [
  /consequence|importance|impact|重要|帰結/i,
  /discriminab|識別|弁別/i,
  /feasib|実現可能|実行可能/i,
  /novel|新規|独創/i,
  /bounded loss|loss cap|損失上限|許容.*損失/i,
] satisfies RegExp[];

function valueAfterLabel(line: string): string {
  const normalized = line.replaceAll("：", ":");
  const index = normalized.indexOf(":");
  if (index === -1) return "";
  return normalized
    .slice(index + 1)
    .trim()
    .replace(/^(\*\*|__)\s*/, "")
    .replace(/^　+|　+$/g, "");
}

function placeholder(value: string): boolean {
  return (
    value === "" ||
    /^(\[\.\.\.\]|\[…\]|\[ *\])$/.test(value) ||
    /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+|\.\.\.)$/i.test(
      value,
    )
  );
}

function structuralItems(value: string): string[] {
  return value
    .split(/\s*(?:;|；|、|\s\|\s| \/ )\s*/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function hasAtLeastStructuralItems(value: string, minimum: 2 | 3): boolean {
  if (structuralItems(value).length >= minimum) return true;
  const numberedItems = [...value.matchAll(/(?:^|\s)\d+[.)]\s+\S/g)].length;
  return numberedItems >= minimum;
}

function invalidStage(value: string): string | undefined {
  if (stagePattern.test(value)) return undefined;
  return "stage must identify corpus-unclear, anomaly-unverified, assumptions-unexposed, problem-underconstructed, thesis-missing, candidate-selection, one-bet-untested, program-steering, finished-claim, or an explicit equivalent";
}

function invalidBlindSpots(value: string): string | undefined {
  const missing: string[] = [];
  if (!/locus|path|file|packet|所在|場所|台帳/i.test(value))
    missing.push("packet locus");
  if (!/assumption|premise|前提/i.test(value))
    missing.push("load-bearing assumption");
  if (!/open[- ]set|open residual|OPEN|未分類|残余/i.test(value))
    missing.push("open-set residual");
  if (!/stop|停止|打ち切/i.test(value)) missing.push("stop reason");
  return missing.length === 0
    ? undefined
    : `blind-spot packet needs ${missing.join(", ")}`;
}

function invalidExplorationAllocation(value: string): string | undefined {
  const missing: string[] = [];
  if (
    !/blind[- ]spot packet.{0,50}(?:locus|path|file|=|:)|(?:locus|path|file).{0,50}blind[- ]spot packet/i.test(
      value,
    )
  )
    missing.push("Blind-spot packet locus");
  if (!/\bSearch budget\b|探索予算/i.test(value))
    missing.push("SBS Search budget pointer");
  if (!/cross[- ]frame (?:micro[- ]?)?probe|フレーム間.*(?:probe|試行)/i.test(value))
    missing.push("cross-frame probe allocation");
  if (
    !/\bNONE\b|\b(?:cap|limit)\b|上限|\d+\s*frames?.{0,30}\d+\s*candidates?/i.test(
      value,
    )
  )
    missing.push("cross-frame probe cap or NONE");
  if (
    /\bbreadth(?: sweep)?\b|\bdepth(?: allocation)?\b|decision-sensitive stop/i.test(
      value,
    )
  )
    return "exploration allocation duplicates SBS-owned breadth/depth/stop; point to the packet Search budget instead";
  return missing.length === 0
    ? undefined
    : `exploration allocation needs ${missing.join(", ")}`;
}

function invalidFrames(value: string): string | undefined {
  const coverageGapCount = [...value.matchAll(/\bCOVERAGE GAP\b/gi)].length;
  if (coverageGapCount > 2)
    return "problem-frame slate permits at most two honest COVERAGE GAP entries";
  const missingRoles: string[] = [];
  if (!/CONTROL|grounded control|対照|既定.*保持/i.test(value))
    missingRoles.push("CONTROL");
  if (
    !/PREMISE[- ]BREAK|assumption[- ]break|breaks? (?:a )?(?:premise|assumption)|前提.*(?:破|反転|変更)/i.test(
      value,
    )
  )
    missingRoles.push("PREMISE-BREAK");
  if (!/ORTHOGONAL|直交|別.*(?:前提|slot|軸)/i.test(value))
    missingRoles.push("ORTHOGONAL");
  if (missingRoles.length > 0)
    return `problem-frame slate needs functional roles ${missingRoles.join(", ")}`;
  if (
    coverageGapCount > 0 &&
    (!/attempt(?:ed)?|tried|試み|試行/i.test(value) ||
      !/fixed (?:fact|constraint)|hard constraint|invariant|固定.*(?:事実|制約)|不変/i.test(
        value,
      ) ||
      !/illegitimate|invalid|impossible|not legitimate|不正当|無効|不可能/i.test(
        value,
      ))
  )
    return "each COVERAGE GAP needs the attempted transformation, fixed fact/constraint, and why a fabricated frame would be illegitimate";

  const discriminatorCount = [
    ...value.matchAll(/discriminator|識別(?:子|観測|条件)?/gi),
  ].length;
  const requiredActualFrames = 3 - coverageGapCount;
  if (discriminatorCount < requiredActualFrames)
    return "each actual problem frame needs its own discriminator";

  const slotCount = [
    ...value.matchAll(
      /\b(?:OBJECT|RELATION|OBSERVATION|REGIME|VALUE|ACTION|OPEN)\b/g,
    ),
  ].length;
  if (slotCount < requiredActualFrames)
    return "problem-frame slate needs explicit assumption slots for every actual frame";
  return undefined;
}

function invalidAxes(value: string): string | undefined {
  const scalarProduct =
    /scalar product|single score|aggregate score|weighted sum|multiply|multiplicative|掛け合わせ|総合点|単一.*スコア|[×*]/i.test(
      value,
    );
  if (scalarProduct)
    return "selection axes collapsed into a scalar product; keep the five judgments separate";

  const allAxesPresent = axisPatterns.every((pattern) => pattern.test(value));
  if (!allAxesPresent)
    return "selection axes need consequence/importance, discriminability, feasibility, novelty, and bounded loss";

  const keyedAxes = [
    /(?:consequence|importance|impact|重要|帰結)\s*[:=＝]/i,
    /(?:discriminab\w*|識別|弁別)\s*[:=＝]/i,
    /(?:feasib\w*|実現可能|実行可能)\s*[:=＝]/i,
    /(?:novel\w*|新規|独創)\s*[:=＝]/i,
    /(?:bounded loss|loss cap|損失上限|許容.*損失)\s*[:=＝]/i,
  ].filter((pattern) => pattern.test(value)).length;
  if (structuralItems(value).length < 5 && keyedAxes < 5)
    return "selection axes are named but not recorded as five separate judgments";
  return undefined;
}

function invalidFirewall(value: string): string | undefined {
  const namesOptimization = /optimi[sz]|最適化/i.test(value);
  const namesHeldOutWitness =
    /held[- ]?out|holdout|untouched witness|unseen witness|未使用.*(?:証人|検証)|独立.*(?:証人|検証)/i.test(
      value,
    );
  if (namesOptimization && namesHeldOutWitness) return undefined;
  return "firewall needs both an optimize surface and a held-out witness";
}

function invalidCollapse(value: string): string | undefined {
  const missing: string[] = [];
  if (!/dedup|collapse|semantic duplicate|重複|崩壊/i.test(value))
    missing.push("dedup/collapse trigger");
  if (!/premise|assumption|target|discriminator|前提|対象|識別/i.test(value))
    missing.push("collapsed dimension");
  if (!/\bonce\b|\bone\b|exactly one|一度|1回|一回/i.test(value))
    missing.push("one bounded regeneration");
  if (
    !/coverage[- ]gap|forging-novel-theses|unoccupied|未使用|未占有|被覆.*不足/i.test(
      value,
    )
  )
    missing.push("coverage-gap handoff");
  if (!/stop|停止|final|最終/i.test(value)) missing.push("final stop");
  return missing.length === 0
    ? undefined
    : `diversity-collapse rule needs ${missing.join(", ")}`;
}

function invalidRegistry(value: string): string | undefined {
  const hasLocus =
    /registry|ledger|logbook|prediction log|台帳|記録簿|レジストリ/i.test(value);
  const hasBeforeRule =
    /\bbefore\b|\bprior(?: to)?\b|pre[- ]?(?:register|commit)|事前|観測前|結果.*前|先に/i.test(
      value,
    );
  const missing: string[] = [];
  if (!hasLocus) missing.push("registry/ledger locus");
  if (!hasBeforeRule) missing.push("before/prior rule");
  if (missing.length === 0) return undefined;
  return `prediction-registry policy needs ${missing.join(
    " and ",
  )}; a timestamp or per-test threshold alone is insufficient`;
}

function invalidAudit(value: string): string | undefined {
  const missing: string[] = [];
  if (!/\b(?:independent|separate|distinct)\b|別|独立|分離|異なる/i.test(value))
    missing.push("required separation");
  if (!/evidence surface|blind input|frozen (?:packet|artifact)|証拠面|盲検入力/i.test(value))
    missing.push("evidence surface");
  if (!/acceptance condition|reject|block|clearance|受入条件|棄却|阻止|解除条件/i.test(value))
    missing.push("acceptance condition");
  if (!/actor assignment.{0,30}orchestrating-agents|配役.{0,30}orchestrating-agents/i.test(value))
    missing.push("actor assignment pointer to orchestrating-agents");
  return missing.length === 0
    ? undefined
    : `independent-audit requirement needs ${missing.join(", ")}`;
}

function isSingleBetHandoff(value: string): boolean {
  const namesHandoff =
    /(?:single|one|1)[- ]bet.*(?:handoff|hand[- ]off|acting-on-hypotheses)/i.test(
      value,
    ) ||
    /(?:handoff|hand[- ]off|acting-on-hypotheses).*(?:single|one|1)[- ]bet/i.test(
      value,
    ) ||
    /単一.*(?:bet|ベット).*(?:引き渡|委譲)|(?:引き渡|委譲).*単一.*(?:bet|ベット)/i.test(
      value,
    );
  const passesHardGate =
    /expensive|irreversible|load[- ]bearing|高価|不可逆|載荷/i.test(value);
  return namesHandoff && passesHardGate;
}

function invalidPortfolio(value: string): string | undefined {
  const namedBets = [...value.matchAll(/\bbet\s+[A-Za-z0-9]+\b/gi)].length;
  if (
    hasAtLeastStructuralItems(value, 2) ||
    namedBets >= 2 ||
    isSingleBetHandoff(value)
  )
    return undefined;
  return "portfolio update needs >=2 bets or an explicit single-bet handoff";
}

function invalidReopen(value: string): string | undefined {
  const namesUnexpectedResult =
    /unexpected|surpris|anomal|予想外|予期せぬ|異常|驚き/i.test(value);
  const namesFrameOrStage = /problem[- ]?frame|stage|問題フレーム|段階/i.test(
    value,
  );
  const namesUpdate = /reopen|update|revise|reframe|再検討|更新|改訂|組み直/i.test(
    value,
  );
  if (namesUnexpectedResult && namesFrameOrStage && namesUpdate)
    return undefined;
  return "reopen rule must let an unexpected result update the problem frame or stage";
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

function evaluate(check: Check): boolean {
  if (check.value === undefined) {
    report(`${check.id}  MISSING  ${check.label}`);
    return false;
  }
  if (placeholder(check.value)) {
    report(`${check.id}  FAIL     ${check.label} is blank or a placeholder`);
    return false;
  }
  const invalid = check.invalid?.(check.value);
  if (invalid !== undefined) {
    report(`${check.id}  FAIL     ${invalid}`);
    return false;
  }
  const pass = check.pass?.(check.value) ?? check.label;
  report(`${check.id}  PASS     ${pass}`);
  return true;
}

async function main(): Promise<void> {
  const slots: Partial<Record<SlotName, string>> = {};
  const text = await readInput();
  for (const line of text.split(/\r?\n/)) {
    for (const [name, pattern] of labelMatchers) {
      if (slots[name] === undefined && pattern.test(line))
        slots[name] = valueAfterLabel(line);
    }
  }

  const checks: Check[] = [
    {
      id: "R1",
      label: "Stage diagnosis",
      value: slots.stage,
      invalid: invalidStage,
    },
    {
      id: "R2",
      label: "Blind-spot packet",
      value: slots.blindSpots,
      invalid: invalidBlindSpots,
    },
    {
      id: "R3",
      label: "Exploration allocation",
      value: slots.explorationAllocation,
      invalid: invalidExplorationAllocation,
    },
    {
      id: "R4",
      label: "Problem-frame slate",
      value: slots.frames,
      invalid: invalidFrames,
    },
    {
      id: "R5",
      label: "Selection axes kept separate",
      value: slots.axes,
      invalid: invalidAxes,
    },
    {
      id: "R6",
      label: "Cheap victory",
      value: slots.cheapVictory,
    },
    {
      id: "R7",
      label: "Optimize/trust firewall",
      value: slots.firewall,
      invalid: invalidFirewall,
    },
    {
      id: "R8",
      label: "Diversity-collapse rule",
      value: slots.collapse,
      invalid: invalidCollapse,
    },
    {
      id: "R9",
      label: "Prediction-registry policy",
      value: slots.registry,
      invalid: invalidRegistry,
    },
    {
      id: "R10",
      label: "Denominator policy",
      value: slots.denominator,
    },
    {
      id: "R11",
      label: "Independent-audit requirement",
      value: slots.audit,
      invalid: invalidAudit,
    },
    {
      id: "R12",
      label: "Portfolio update",
      value: slots.portfolio,
      invalid: invalidPortfolio,
      pass: (value) =>
        isSingleBetHandoff(value)
          ? "Portfolio update: explicit single-bet handoff"
          : "Portfolio update: >=2 bets",
    },
    {
      id: "R13",
      label: "Reopen rule",
      value: slots.reopen,
      invalid: invalidReopen,
    },
  ];

  const failures = checks.reduce(
    (count, check) => count + (evaluate(check) ? 0 : 1),
    0,
  );
  report("----");
  report(
    `gates: FAIL=${failures}  (FLOOR — structure only; semantic judgment remains with the directing-research owner)`,
  );
  if (failures > 0) {
    report(
      "-> Repair the named mechanism; prose, a timestamp, or a per-test kill threshold cannot substitute for the missing field.",
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
