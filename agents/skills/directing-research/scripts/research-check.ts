/**
 * Structural floor check for a filled directing-research RESEARCH JUDGMENT SPEC.
 * Consumer: agent/human verdict lines.
 */

import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cli } from "cleye";

const thesisGateCheckPath = resolvePath(
  import.meta.dir,
  "../../forging-novel-theses/scripts/gate-check.ts",
);

type ErrorValue = Readonly<{ ok: false; error: string }>;

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

type TransferAttempt = Readonly<{
  discriminator?: string | undefined;
  id: string;
  kind: "CANDIDATE" | "MAPPING-BREAK";
  prediction?: string | undefined;
}>;

type FrozenReference = Readonly<{
  digest: string;
  path: string;
}>;

type TargetResult = Readonly<{
  candidateId: string;
  mappingAssessmentRequest: string;
  observationLocus: string;
  prewrittenThreshold: string;
  targetObservation: string;
  thresholdResult: string;
  thresholdVerdict: "FAIL" | "PASS" | undefined;
  transferBundle: FrozenReference | undefined;
}>;

type Input = Readonly<{
  ok: true;
  donorSetPath?: string;
  targetResultPath?: string;
  text: string;
  transferBundlePath?: string;
}>;

const labelMatchers: ReadonlyArray<readonly [SlotName, RegExp]> = [
  ["stage", /stage diagnosis|段階診断/iu],
  ["blindSpots", /blind[- ]spot packet|盲点.*(?:packet|パケット)/iu],
  [
    "explorationAllocation",
    /exploration allocation|探索.*(?:allocation|配分)/iu,
  ],
  ["frames", /problem[- ]frame slate|問題フレーム.*候補/iu],
  ["axes", /selection axes|選択軸/iu],
  ["cheapVictory", /(?:the )?cheap victory|安い勝利/iu],
  ["firewall", /optimi[sz]e\/trust firewall|最適化.*信頼.*firewall/iu],
  [
    "collapse",
    /diversity[- ]collapse rule|多様性.*(?:collapse|崩壊).*(?:rule|規則)/iu,
  ],
  [
    "registry",
    /prediction[- ]registry policy|予測.*(?:台帳|レジストリ).*方針/iu,
  ],
  ["denominator", /denominator policy|分母.*方針/iu],
  [
    "audit",
    /independent[- ]audit requirement|独立監査.*要件|generator.*auditor|生成者.*監査者/iu,
  ],
  ["portfolio", /portfolio update|ポートフォリオ.*更新/iu],
  ["reopen", /reopen rule|再オープン.*規則|再検討.*規則/iu],
];

const stagePattern =
  /corpus[- ]unclear|unclear corpus|anomaly[- ]unverified|unverified anomaly|assumptions?[- ]unexposed|unexposed assumptions?|problem[- ]underconstructed|underconstructed problem|thesis[- ]missing|missing thesis|candidate[- ]selection|select(?:ing)? candidates|one[- ]bet[- ]untested|untested (?:one|single) bet|program[- ]steering|steer(?:ing)? (?:the )?program|finished[- ]claim|finished claim|コーパス.*不明|文献.*不明|異常.*未検証|前提.*未(?:露出|顕在化)|問題.*未構成|問題設定.*不足|仮説.*欠如|候補.*選択|単一.*未検証|プログラム.*操舵|完成.*主張/iu;

const axisPatterns = [
  /consequence|importance|impact|重要|帰結/iu,
  /discriminab|識別|弁別/iu,
  /feasib|実現可能|実行可能/iu,
  /novel|新規|独創/iu,
  /bounded loss|loss cap|損失上限|許容.*損失/iu,
] satisfies RegExp[];

function valueAfterLabel(line: string): string {
  const normalized = line.replaceAll("：", ":");
  const index = normalized.indexOf(":");
  if (index === -1) return "";
  return normalized
    .slice(index + 1)
    .trim()
    .replace(/^(\*\*|__)\s*/u, "")
    .replaceAll(/^　+|　+$/gu, "");
}

function fieldPattern(label: string): RegExp {
  const escaped = label.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    String.raw`^\s*(?:[-*+]\s+|#{1,6}\s+)?(?:\*\*|__)?${escaped}(?:(?:\*\*|__)\s*[：:]|\s*[：:](?:\*\*|__)?)`,
    "iu",
  );
}

function readField(
  lines: readonly string[],
  label: string,
): string | undefined {
  const pattern = fieldPattern(label);
  const line = lines.find((candidate) => pattern.test(candidate));
  return line === undefined ? undefined : valueAfterLabel(line);
}

function duplicateFields(
  lines: readonly string[],
  labels: readonly string[],
): readonly string[] {
  return [...new Set(labels)].filter((label) => {
    const pattern = fieldPattern(label);
    return lines.filter((line) => pattern.test(line)).length > 1;
  });
}

function sameResolvedFile(first: string, second: string): boolean {
  if (!existsSync(first) || !existsSync(second)) return false;
  return realpathSync(first) === realpathSync(second);
}

function normalizedOperation(value: string | undefined): string | undefined {
  const match = value
    ?.trim()
    .match(/^([A-Za-z]+)(?:\s*(?:—|–|:|\s-\s)\s*.+)?$/u);
  return match?.[1]?.toUpperCase();
}

function stableIds(value: string): readonly string[] | undefined {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (
    ids.length === 0 ||
    ids.some((id) => !/^[A-Za-z][A-Za-z0-9._-]*$/u.test(id))
  ) {
    return undefined;
  }
  return ids;
}

function resolvePreservedIds(
  value: string | undefined,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (/^NONE\s*(?:—|–|:|\s-\s)/u.test(value)) return [];
  return stableIds(value);
}

function placeholder(value: string): boolean {
  return (
    value === "" ||
    /^(\[\.\.\.\]|\[…\]|\[ *\])$/u.test(value) ||
    /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+|\.\.\.)$/iu.test(value)
  );
}

function structuralItems(value: string): string[] {
  return value
    .split(/\s*(?:;|；|、|\s\|\s| \/ )\s*/u)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function hasAtLeastStructuralItems(value: string, minimum: 2 | 3): boolean {
  if (structuralItems(value).length >= minimum) return true;
  const numberedItems = [...value.matchAll(/(?:^|\s)\d+[.)]\s+\S/gu)].length;
  return numberedItems >= minimum;
}

function invalidStage(value: string): string | undefined {
  if (stagePattern.test(value)) return undefined;
  return "stage must identify corpus-unclear, anomaly-unverified, assumptions-unexposed, problem-underconstructed, thesis-missing, candidate-selection, one-bet-untested, program-steering, finished-claim, or an explicit equivalent";
}

function invalidBlindSpots(value: string): string | undefined {
  const missing: string[] = [];
  if (!/locus|path|file|packet|所在|場所|台帳/iu.test(value))
    missing.push("packet locus");
  if (!/assumption|premise|前提/iu.test(value))
    missing.push("load-bearing assumption");
  if (!/open[- ]set|open residual|OPEN|未分類|残余/iu.test(value))
    missing.push("open-set residual");
  if (!/stop|停止|打ち切/iu.test(value)) missing.push("stop reason");
  return missing.length === 0
    ? undefined
    : `blind-spot packet needs ${missing.join(", ")}`;
}

function invalidExplorationAllocation(value: string): string | undefined {
  const missing: string[] = [];
  if (
    !/blind[- ]spot packet.{0,50}(?:locus|path|file|=|:)|(?:locus|path|file).{0,50}blind[- ]spot packet/iu.test(
      value,
    )
  )
    missing.push("Blind-spot packet locus");
  if (!/\bSearch budget\b|探索予算/iu.test(value))
    missing.push("SBS Search budget pointer");
  if (
    !/cross[- ]frame (?:micro[- ]?)?probe|フレーム間.*(?:probe|試行)/iu.test(
      value,
    )
  )
    missing.push("cross-frame probe allocation");
  if (
    !/\bNONE\b|\b(?:cap|limit)\b|上限|\d+\s*frames?.{0,30}\d+\s*candidates?/iu.test(
      value,
    )
  )
    missing.push("cross-frame probe cap or NONE");
  if (
    /\bbreadth(?: sweep)?\b|\bdepth(?: allocation)?\b|decision-sensitive stop/iu.test(
      value,
    )
  )
    return "exploration allocation duplicates SBS-owned breadth/depth/stop; point to the packet Search budget instead";
  return missing.length === 0
    ? undefined
    : `exploration allocation needs ${missing.join(", ")}`;
}

function invalidFrames(value: string): string | undefined {
  const coverageGapCount = [...value.matchAll(/\bCOVERAGE GAP\b/giu)].length;
  if (coverageGapCount > 2)
    return "problem-frame slate permits at most two honest COVERAGE GAP entries";
  const missingRoles: string[] = [];
  if (!/CONTROL|grounded control|対照|既定.*保持/iu.test(value))
    missingRoles.push("CONTROL");
  if (
    !/PREMISE[- ]BREAK|assumption[- ]break|breaks? (?:a )?(?:premise|assumption)|前提.*(?:破|反転|変更)/iu.test(
      value,
    )
  )
    missingRoles.push("PREMISE-BREAK");
  if (!/ORTHOGONAL|直交|別.*(?:前提|slot|軸)/iu.test(value))
    missingRoles.push("ORTHOGONAL");
  if (missingRoles.length > 0)
    return `problem-frame slate needs functional roles ${missingRoles.join(", ")}`;
  if (
    coverageGapCount > 0 &&
    (!/attempt(?:ed)?|tried|試み|試行/iu.test(value) ||
      !/fixed (?:fact|constraint)|hard constraint|invariant|固定.*(?:事実|制約)|不変/iu.test(
        value,
      ) ||
      !/illegitimate|invalid|impossible|not legitimate|不正当|無効|不可能/iu.test(
        value,
      ))
  )
    return "each COVERAGE GAP needs the attempted transformation, fixed fact/constraint, and why a fabricated frame would be illegitimate";

  const discriminatorCount = [
    ...value.matchAll(/discriminator|識別(?:子|観測|条件)?/giu),
  ].length;
  const requiredActualFrames = 3 - coverageGapCount;
  if (discriminatorCount < requiredActualFrames)
    return "each actual problem frame needs its own discriminator";

  const slotCount = [
    ...value.matchAll(
      /\b(?:OBJECT|RELATION|OBSERVATION|REGIME|VALUE|ACTION|OPEN)\b/gu,
    ),
  ].length;
  if (slotCount < requiredActualFrames)
    return "problem-frame slate needs explicit assumption slots for every actual frame";
  return undefined;
}

function invalidAxes(value: string): string | undefined {
  const scalarProduct =
    /scalar product|single score|aggregate score|weighted sum|multiply|multiplicative|掛け合わせ|総合点|単一.*スコア|[×*]/iu.test(
      value,
    );
  if (scalarProduct)
    return "selection axes collapsed into a scalar product; keep the five judgments separate";

  const allAxesPresent = axisPatterns.every((pattern) => pattern.test(value));
  if (!allAxesPresent)
    return "selection axes need consequence/importance, discriminability, feasibility, novelty, and bounded loss";

  const keyedAxes = [
    /(?:consequence|importance|impact|重要|帰結)\s*[:=＝]/iu,
    /(?:discriminab\w*|識別|弁別)\s*[:=＝]/iu,
    /(?:feasib\w*|実現可能|実行可能)\s*[:=＝]/iu,
    /(?:novel\w*|新規|独創)\s*[:=＝]/iu,
    /(?:bounded loss|loss cap|損失上限|許容.*損失)\s*[:=＝]/iu,
  ].filter((pattern) => pattern.test(value)).length;
  if (structuralItems(value).length < 5 && keyedAxes < 5)
    return "selection axes are named but not recorded as five separate judgments";
  return undefined;
}

function invalidFirewall(value: string): string | undefined {
  const namesOptimization = /optimi[sz]|最適化/iu.test(value);
  const namesHeldOutWitness =
    /held[- ]?out|holdout|untouched witness|unseen witness|未使用.*(?:証人|検証)|独立.*(?:証人|検証)/iu.test(
      value,
    );
  if (namesOptimization && namesHeldOutWitness) return undefined;
  return "firewall needs both an optimize surface and a held-out witness";
}

function invalidCollapse(value: string): string | undefined {
  const missing: string[] = [];
  if (!/dedup|collapse|semantic duplicate|重複|崩壊/iu.test(value))
    missing.push("dedup/collapse trigger");
  if (!/premise|assumption|target|discriminator|前提|対象|識別/iu.test(value))
    missing.push("collapsed dimension");
  if (!/\bonce\b|\bone\b|exactly one|一度|1回|一回/iu.test(value))
    missing.push("one bounded regeneration");
  if (
    !/coverage[- ]gap|forging-novel-theses|unoccupied|未使用|未占有|被覆.*不足/iu.test(
      value,
    )
  )
    missing.push("coverage-gap handoff");
  if (!/stop|停止|final|最終/iu.test(value)) missing.push("final stop");
  return missing.length === 0
    ? undefined
    : `diversity-collapse rule needs ${missing.join(", ")}`;
}

function invalidRegistry(value: string): string | undefined {
  const hasLocus =
    /registry|ledger|logbook|prediction log|台帳|記録簿|レジストリ/iu.test(
      value,
    );
  const hasBeforeRule =
    /\bbefore\b|\bprior(?: to)?\b|pre[- ]?(?:register|commit)|事前|観測前|結果.*前|先に/iu.test(
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
  if (
    !/\b(?:independent|separate|distinct)\b|別|独立|分離|異なる/iu.test(value)
  )
    missing.push("required separation");
  if (
    !/evidence surface|blind input|frozen (?:packet|artifact)|証拠面|盲検入力/iu.test(
      value,
    )
  )
    missing.push("evidence surface");
  if (
    !/acceptance condition|reject|block|clearance|受入条件|棄却|阻止|解除条件/iu.test(
      value,
    )
  )
    missing.push("acceptance condition");
  if (
    !/actor assignment.{0,30}orchestrating-agents|配役.{0,30}orchestrating-agents/iu.test(
      value,
    )
  )
    missing.push("actor assignment pointer to orchestrating-agents");
  return missing.length === 0
    ? undefined
    : `independent-audit requirement needs ${missing.join(", ")}`;
}

function isSingleBetHandoff(value: string): boolean {
  const namesHandoff =
    /(?:single|one|1)[- ]bet.*(?:handoff|hand[- ]off|acting-on-hypotheses)/iu.test(
      value,
    ) ||
    /(?:handoff|hand[- ]off|acting-on-hypotheses).*(?:single|one|1)[- ]bet/iu.test(
      value,
    ) ||
    /単一.*(?:bet|ベット).*(?:引き渡|委譲)|(?:引き渡|委譲).*単一.*(?:bet|ベット)/iu.test(
      value,
    );
  const passesHardGate =
    /expensive|irreversible|load[- ]bearing|高価|不可逆|載荷/iu.test(value);
  return namesHandoff && passesHardGate;
}

function invalidPortfolio(value: string): string | undefined {
  const namedBets = [...value.matchAll(/\bbet\s+[A-Za-z0-9]+\b/giu)].length;
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
    /unexpected|surpris|anomal|予想外|予期せぬ|異常|驚き/iu.test(value);
  const namesFrameOrStage = /problem[- ]?frame|stage|問題フレーム|段階/iu.test(
    value,
  );
  const namesUpdate =
    /reopen|update|revise|reframe|再検討|更新|改訂|組み直/iu.test(value);
  if (namesUnexpectedResult && namesFrameOrStage && namesUpdate)
    return undefined;
  return "reopen rule must let an unexpected result update the problem frame or stage";
}

function transferDispositionLines(text: string): readonly string[] | undefined {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    /^\s*#{1,6}\s+TRANSFER DISPOSITION\s*$/iu.test(line),
  );
  if (start === -1) return undefined;
  const endOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^\s*#{1,6}\s+/u.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end);
}

function parseTransferBundle(text: string): Readonly<{
  attempts: TransferAttempt[];
  findings: string[];
}> {
  const lines = text.split(/\r?\n/u);
  const starts: Readonly<{
    headingId: string;
    kind: "CANDIDATE" | "MAPPING-BREAK";
    line: number;
  }>[] = lines.flatMap((line, index) => {
    const match = line.match(
      /^\s*##\s+(Candidate|MAPPING-BREAK)(?:\s+\[([^\]]+)\]|\s+(.+?))\s*$/iu,
    );
    if (match === null) return [];
    const rawId = (match[2] ?? match[3] ?? "").trim();
    return [
      {
        headingId: rawId,
        kind:
          match[1]?.toUpperCase() === "MAPPING-BREAK"
            ? "MAPPING-BREAK"
            : "CANDIDATE",
        line: index,
      },
    ];
  });

  const findings: string[] = [];
  const attempts: TransferAttempt[] = [];
  for (const start of starts) {
    const headingOffset = lines
      .slice(start.line + 1)
      .findIndex((line) => /^\s*#{1,2}\s+/u.test(line));
    const sectionEnd =
      headingOffset === -1 ? lines.length : start.line + 1 + headingOffset;
    const section = lines.slice(start.line + 1, sectionEnd);
    const operation = normalizedOperation(readField(section, "Operation"));
    if (start.kind === "CANDIDATE" && operation !== "TRANSFER") continue;
    const duplicates = duplicateFields(section, [
      "Operation",
      "Transfer attempt ID",
      "New discriminator",
      "New testable prediction",
      "Status",
    ]);
    for (const field of duplicates) {
      findings.push(
        `${start.headingId !== undefined && start.headingId !== "" ? start.headingId : "<unnamed>"} has duplicate field ${field}`,
      );
    }
    const attemptId = readField(section, "Transfer attempt ID");
    if (
      attemptId === undefined ||
      !/^[A-Za-z][A-Za-z0-9._-]*$/u.test(attemptId)
    ) {
      findings.push(
        `${start.kind} ${start.headingId !== undefined && start.headingId !== "" ? start.headingId : "<unnamed>"} lacks a stable Transfer attempt ID`,
      );
      continue;
    }
    const status = readField(section, "Status");
    if (status !== start.kind) {
      findings.push(
        `${attemptId} status ${status ?? "<missing>"} does not match ${start.kind}`,
      );
    }
    attempts.push({
      id: attemptId,
      kind: start.kind,
      ...(start.kind === "CANDIDATE"
        ? {
            discriminator: readField(section, "New discriminator"),
            prediction: readField(section, "New testable prediction"),
          }
        : {}),
    });
  }
  if (starts.length === 0)
    findings.push(
      "transfer bundle contains no candidate or MAPPING-BREAK section",
    );
  const ids = new Set<string>();
  for (const attempt of attempts) {
    if (ids.has(attempt.id))
      findings.push(`duplicate transfer attempt ID: ${attempt.id}`);
    ids.add(attempt.id);
  }
  return { attempts, findings };
}

function validateFrozenTransferBundle(
  bytes: Uint8Array,
  donorSetPath: string,
  reportTransferFinding: (message: string) => void,
): string | undefined {
  if (!existsSync(thesisGateCheckPath)) {
    return `forging-novel-theses gate-check is missing: ${thesisGateCheckPath}`;
  }
  const upstream = Bun.spawnSync({
    cmd: [
      "bun",
      thesisGateCheckPath,
      "--legacy-v1",
      "--donor-set",
      donorSetPath,
      "-",
    ],
    stderr: "pipe",
    stdin: new Blob([bytes]),
    stdout: "pipe",
    timeout: 10_000,
  });
  if (upstream.exitCode === 2) {
    return `forging-novel-theses gate-check failed: ${upstream.stderr.toString().trim() !== "" ? upstream.stderr.toString().trim() : "fatal upstream validator error"}`;
  }
  if (upstream.exitCode !== 0 && upstream.exitCode !== 1) {
    return `forging-novel-theses gate-check could not complete (exit ${String(upstream.exitCode)}): ${upstream.stderr.toString().trim() !== "" ? upstream.stderr.toString().trim() : "upstream validator unavailable or timed out"}`;
  }
  if (upstream.exitCode !== 0) {
    const findings = upstream.stdout
      .toString()
      .split(/\r?\n/u)
      .filter((line) => /\s(?:FAIL|MISSING)\s/u.test(line))
      .slice(0, 3)
      .join(" | ");
    reportTransferFinding(
      `frozen transfer bundle failed forging-novel-theses gate-check${findings === "" ? "" : `: ${findings}`}`,
    );
  }
  return undefined;
}

function exactObservationLocus(value: string): boolean {
  const fileLine =
    /(?:^|\s)[\w./-]+\.(?:md|txt|json|jsonl|csv|tsv|log):\d+(?:-\d+)?\b/iu.test(
      value,
    );
  const externalSource = /\bdoi:\S+|https?:\/\/\S+/iu.test(value);
  const externalAnchor =
    /#[A-Za-z0-9._:-]+|\b(?:p{1,2}\.\s*|p{1,2}\s+|pages?\s+|§\s*|section\s+|table\s+|figure\s+|fig\.\s*)[A-Za-z0-9.-]+/iu.test(
      value,
    );
  return fileLine || (externalSource && externalAnchor);
}

function frozenReference(value: string): FrozenReference | undefined {
  const match = value.match(/^path=(\S.+?)\s*;\s*sha256=([a-f0-9]{64})$/u);
  const path = match?.[1]?.trim();
  const digest = match?.[2];
  return path === undefined || digest === undefined
    ? undefined
    : { digest, path };
}

function invalidTargetObservation(value: string): string | undefined {
  if (value.length < 20) {
    return "Target-side observation must record a concrete observed consequence";
  }
  if (
    /(?:\bdonor\b|\bsource(?:-side)?\b).{0,80}(?:succeed|success|worked|support|confirm|validat|establish)|(?:succeed|success|worked|support|confirm|validat|establish).{0,80}(?:\bdonor\b|\bsource(?:-side)?\b)/iu.test(
      value,
    )
  ) {
    return "Target-side observation cannot substitute donor/source success for a target observation";
  }
  return undefined;
}

function invalidPrewrittenThreshold(value: string): string | undefined {
  for (const match of value.matchAll(/\b(\d+)\s*(?:of|\/)\s*(\d+)\b/giu)) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator === 0) {
      return "Prewritten threshold ratio needs a positive denominator";
    }
    if (numerator > denominator) {
      return "Prewritten threshold ratio cannot exceed its denominator";
    }
  }
  const passBoundary = /\bPASS\b.{0,40}\b(?:when|if)\b/iu.test(value);
  const numericBoundary =
    /(?:[<>]=?|≥|≤|=)\s*\d|\b(?:at least|at most|more than|less than|fewer than|no more than|no fewer than|exactly)\s+\d|\b\d+\s*(?:of|\/)\s*\d+|\b\d+(?:\.\d+)?%/iu.test(
      value,
    );
  const precommitted =
    /\b(?:before|prior to|pre[- ]?(?:registered|committed|written))\b|事前/iu.test(
      value,
    );
  if (!(passBoundary && numericBoundary && precommitted)) {
    return "Prewritten threshold must name a numeric PASS boundary fixed before target observation";
  }
  return undefined;
}

type NumericRatio = Readonly<{ denominator: number; numerator: number }>;

function numericRatio(value: string): NumericRatio | undefined {
  const match = value.match(/\b(\d+)\s*(?:of|\/)\s*(\d+)\b/iu);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { denominator: Number(match[2]), numerator: Number(match[1]) };
}

function invalidThresholdApplication(
  prewrittenThreshold: string,
  thresholdResult: string,
  verdict: "FAIL" | "PASS" | undefined,
): string | undefined {
  if (verdict === undefined) return undefined;
  const boundary = numericRatio(prewrittenThreshold);
  const observed = numericRatio(thresholdResult);
  if (boundary === undefined || observed === undefined) return undefined;
  if (observed.denominator === 0 || observed.numerator > observed.denominator) {
    return "Threshold result ratio must have a positive denominator and valid numerator";
  }
  if (boundary.denominator === 0) return undefined;

  const boundaryValue = boundary.numerator / boundary.denominator;
  const observedValue = observed.numerator / observed.denominator;
  let passes: boolean | undefined;
  if (/\b(?:at least|no fewer than)\b|(?:≥|>=)/iu.test(prewrittenThreshold)) {
    passes = observedValue >= boundaryValue;
  } else if (/\bmore than\b|(?:^|[^<])>(?!=)/iu.test(prewrittenThreshold)) {
    passes = observedValue > boundaryValue;
  } else if (
    /\b(?:at most|no more than)\b|(?:≤|<=)/iu.test(prewrittenThreshold)
  ) {
    passes = observedValue <= boundaryValue;
  } else if (
    /\b(?:less than|fewer than)\b|(?:^|[^>])<(?!=)/iu.test(prewrittenThreshold)
  ) {
    passes = observedValue < boundaryValue;
  } else if (/\bexactly\b/iu.test(prewrittenThreshold)) {
    passes = observedValue === boundaryValue;
  }
  if (passes === undefined) {
    return "Prewritten threshold ratio must state a comparison direction";
  }
  if ((verdict === "PASS") !== passes) {
    return "Threshold result contradicts the prewritten numeric boundary";
  }
  return undefined;
}

function markdownCells(line: string): readonly string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

type DonorReference = Readonly<{
  id: string;
  locator: string;
  sourceIdentity: string | undefined;
}>;

function sourceIdentity(locator: string): string | undefined {
  const doi = locator.match(
    /\bdoi:\s*(10\.\d{4,9}\/[A-Z0-9._;()/:+-]+)/iu,
  )?.[1];
  if (doi !== undefined) return `doi:${doi.toLowerCase()}`;

  const url = locator.match(/https?:\/\/[^\s,;]+/iu)?.[0];
  if (url !== undefined) {
    return `url:${url
      .replace(/[#?].*$/u, "")
      .replace(/[.)]+$/u, "")
      .toLowerCase()}`;
  }

  const file = locator.match(
    /(?:^|[\s;])([\w./-]+\.(?:md|txt|json|jsonl|csv|tsv|log|pdf)):\d+(?:-\d+)?\b/iu,
  )?.[1];
  return file === undefined ? undefined : `file:${file.toLowerCase()}`;
}

function donorReferencesFromSet(text: string): readonly DonorReference[] {
  const lines = text.split(/\r?\n/u);
  const headerIndex = lines.findIndex(
    (line) => markdownCells(line)[0]?.toLowerCase() === "donor id",
  );
  if (headerIndex === -1) return [];
  const references: DonorReference[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^\s*#{1,6}\s+/u.test(line)) break;
    const cells = markdownCells(line);
    if (cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
      continue;
    }
    const id = cells[0]?.trim();
    const locator = cells[1]?.replaceAll(/\s+/gu, " ").trim();
    if (
      id !== undefined &&
      id !== "" &&
      locator !== undefined &&
      locator !== ""
    ) {
      references.push({ id, locator, sourceIdentity: sourceIdentity(locator) });
    }
  }
  return references;
}

function mentionsStableId(value: string, id: string): boolean {
  const escaped = id.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:^|[^A-Za-z0-9._-])${escaped}(?:$|[^A-Za-z0-9._-])`,
    "u",
  ).test(value);
}

function parseTargetResultBundle(text: string): Readonly<{
  findings: readonly string[];
  results: readonly TargetResult[];
}> {
  const lines = text.split(/\r?\n/u);
  const starts = lines.flatMap((line, index) =>
    /^\s*##\s+TARGET RESULT(?:\s+\[[^\]]+\]|\s+[A-Za-z][A-Za-z0-9._-]*)?\s*$/iu.test(
      line,
    )
      ? [index]
      : [],
  );
  const findings: string[] = [];
  const results: TargetResult[] = [];
  const labels = [
    "Candidate ID",
    "Transfer bundle",
    "Target-side observation",
    "Prewritten threshold",
    "Observation locus",
    "Threshold result",
    "Mapping assessment request",
    "Handoff",
  ] satisfies readonly string[];

  for (const start of starts) {
    const relativeEnd = lines
      .slice(start + 1)
      .findIndex((line) => /^\s*#{1,6}\s+/u.test(line));
    const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
    const section = lines.slice(start + 1, end);
    for (const label of duplicateFields(section, labels)) {
      findings.push(`duplicate ${label} in TARGET RESULT`);
    }
    const values = new Map(
      labels.map((label) => [label, readField(section, label)] as const),
    );
    labels.forEach((label) => {
      const value = values.get(label);
      if (value === undefined || placeholder(value)) {
        findings.push(`${label}: required in TARGET RESULT`);
      }
    });

    const candidateId = values.get("Candidate ID");
    if (
      candidateId === undefined ||
      !/^[A-Za-z][A-Za-z0-9._-]*$/u.test(candidateId)
    ) {
      findings.push("Candidate ID must be a stable ID in TARGET RESULT");
      continue;
    }
    const targetObservation = values.get("Target-side observation") ?? "";
    const prewrittenThreshold = values.get("Prewritten threshold") ?? "";
    const observationLocus = values.get("Observation locus") ?? "";
    const thresholdResult = values.get("Threshold result") ?? "";
    const transferBundle = frozenReference(values.get("Transfer bundle") ?? "");
    if (transferBundle === undefined) {
      findings.push(
        `TARGET RESULT ${candidateId} Transfer bundle must use path=<locus>; sha256=<64 lowercase hex>`,
      );
    }
    const observationFailure = invalidTargetObservation(targetObservation);
    if (observationFailure !== undefined) findings.push(observationFailure);
    const thresholdFailure = invalidPrewrittenThreshold(prewrittenThreshold);
    if (thresholdFailure !== undefined) findings.push(thresholdFailure);
    if (!exactObservationLocus(observationLocus)) {
      findings.push(
        `TARGET RESULT ${candidateId} Observation locus needs an exact source locator`,
      );
    }
    const thresholdToken = thresholdResult.match(
      /^(PASS|FAIL)\s*(?:—|–|:|\s-\s)\s*\S.+$/u,
    )?.[1];
    const thresholdVerdict =
      thresholdToken === "PASS" || thresholdToken === "FAIL"
        ? thresholdToken
        : undefined;
    if (thresholdVerdict === undefined) {
      findings.push(
        `TARGET RESULT ${candidateId} Threshold result must be PASS or FAIL with the applied result`,
      );
    }
    const applicationFailure = invalidThresholdApplication(
      prewrittenThreshold,
      thresholdResult,
      thresholdVerdict,
    );
    if (applicationFailure !== undefined) findings.push(applicationFailure);
    const mappingRequest = values.get("Mapping assessment request") ?? "";
    if (
      !/^NONE\s*(?:—|–|:|\s-\s)\s*\S.+$/iu.test(mappingRequest) &&
      !/^forging-novel-theses\s*(?:—|–|:|\s-\s)\s*\S.+$/iu.test(mappingRequest)
    ) {
      findings.push(
        `TARGET RESULT ${candidateId} Mapping assessment request must be NONE or forging-novel-theses with a reason`,
      );
    }
    const handoff = values.get("Handoff") ?? "";
    const preservesBreaks =
      /preserv(?:e|es|ed|ing)\s+(?:all|every)\s+(?:existing\s+)?MAPPING-BREAK(?:\s+IDs?)?/iu.test(
        handoff,
      );
    const destroysBreaks =
      /(?:discard|delete|drop|omit|remove|suppress).{0,60}MAPPING-BREAK|MAPPING-BREAK.{0,60}(?:discard|delete|drop|omit|remove|suppress)/iu.test(
        handoff,
      );
    const negatesPreservation =
      /(?:\b(?:do\s+not|don't|never|without|cannot|can't|fail(?:s|ed)?\s+to)\b.{0,40}\bpreserv|\bpreserv.{0,80}\b(?:except|unless|but\s+not)\b)/iu.test(
        handoff,
      );
    if (
      !/directing-research/iu.test(handoff) ||
      !/TRANSFER DISPOSITION/iu.test(handoff) ||
      !preservesBreaks ||
      destroysBreaks ||
      negatesPreservation
    ) {
      findings.push(
        `TARGET RESULT ${candidateId} handoff must return to directing-research, update TRANSFER DISPOSITION, and preserve all existing MAPPING-BREAK IDs`,
      );
    }
    results.push({
      candidateId,
      mappingAssessmentRequest: mappingRequest,
      observationLocus,
      prewrittenThreshold,
      targetObservation,
      thresholdResult,
      thresholdVerdict,
      transferBundle,
    });
  }
  if (starts.length === 0) findings.push("TARGET RESULT section is required");
  const ids = new Set<string>();
  for (const result of results) {
    if (ids.has(result.candidateId)) {
      findings.push(
        `duplicate TARGET RESULT candidate ID: ${result.candidateId}`,
      );
    }
    ids.add(result.candidateId);
  }
  return { findings, results };
}

function parseDecisions(
  value: string,
): ReadonlyMap<string, "ADOPT" | "REOPEN" | "RETIRE" | "TEST"> | undefined {
  if (/^NONE\s*(?:—|–|:|\s-\s)/u.test(value)) return new Map();
  const decisions = new Map<string, "ADOPT" | "REOPEN" | "RETIRE" | "TEST">();
  for (const item of value.split(/\s*;\s*/u)) {
    const match = item.match(
      /^([A-Za-z][A-Za-z0-9._-]*)\s*=\s*(ADOPT|REOPEN|RETIRE|TEST)$/u,
    );
    if (match === null || match[1] === undefined || match[2] === undefined) {
      return undefined;
    }
    const decision = match[2];
    if (
      decision !== "ADOPT" &&
      decision !== "REOPEN" &&
      decision !== "RETIRE" &&
      decision !== "TEST"
    ) {
      return undefined;
    }
    if (decisions.has(match[1])) return undefined;
    decisions.set(match[1], decision);
  }
  return decisions;
}

async function validateTransferDisposition(
  text: string,
  donorSetPath: string | undefined,
  transferBundlePath: string | undefined,
  targetResultPath: string | undefined,
): Promise<number | ErrorValue> {
  const dispositionHeadings = [
    ...text.matchAll(/^\s*#{1,6}\s+TRANSFER DISPOSITION\s*$/gimu),
  ];
  if (dispositionHeadings.length > 1) {
    report("R14  FAIL     duplicate TRANSFER DISPOSITION section");
    return 1;
  }
  const lines = transferDispositionLines(text);
  if (lines === undefined) {
    report("R14  MISSING  TRANSFER DISPOSITION");
    return 1;
  }
  const bundleField = readField(lines, "Transfer bundle");
  if (bundleField === undefined || placeholder(bundleField)) {
    report("R14  FAIL     Transfer bundle is blank, missing, or a placeholder");
    return 1;
  }
  if (/^NONE\s*(?:—|–|:|\s-\s)\s*\S.+$/u.test(bundleField)) {
    if (
      transferBundlePath !== undefined ||
      donorSetPath !== undefined ||
      targetResultPath !== undefined
    ) {
      report(
        "R14  FAIL     transfer dependencies were supplied but disposition says NONE",
      );
      return 1;
    }
    report(
      "R14  PASS     TRANSFER DISPOSITION: NONE — no transfer route admitted",
    );
    return 0;
  }
  if (transferBundlePath === undefined) {
    report(
      "R14  FAIL     active TRANSFER DISPOSITION requires --transfer-bundle <path>",
    );
    return 1;
  }
  if (donorSetPath === undefined) {
    report(
      "R14  FAIL     active TRANSFER DISPOSITION requires --donor-set <path>",
    );
    return 1;
  }
  if (!existsSync(transferBundlePath)) {
    return {
      ok: false,
      error: `transfer bundle not found: ${transferBundlePath}`,
    };
  }

  let failures = 0;
  const transferReport = (message: string): void => {
    report(`R14  FAIL     ${message}`);
    failures += 1;
  };
  for (const field of duplicateFields(lines, [
    "Transfer bundle",
    "Attempt denominator",
    "Candidate disposition",
    "Preserved MAPPING-BREAK IDs",
    "Basis / scope",
    "Target-side test or result locus",
    "Integration / retirement action",
    "Reopen trigger",
  ])) {
    transferReport(`TRANSFER DISPOSITION has duplicate field ${field}`);
  }
  const referenceMatch = bundleField.match(
    /^path=(\S.+?)\s*;\s*sha256=([a-f0-9]{64})$/u,
  );
  const declaredPath = referenceMatch?.[1]?.trim();
  const declaredDigest = referenceMatch?.[2];
  if (declaredPath === undefined || declaredDigest === undefined) {
    transferReport(
      "Transfer bundle must use path=<locus>; sha256=<64 lowercase hex>",
    );
  } else if (!sameResolvedFile(declaredPath, transferBundlePath)) {
    transferReport("Transfer bundle path does not match --transfer-bundle");
  }
  const bundleBytes = await Bun.file(transferBundlePath).bytes();
  const bundleText = new TextDecoder().decode(bundleBytes);
  const actualDigest = createHash("sha256").update(bundleBytes).digest("hex");
  if (declaredDigest !== actualDigest) {
    transferReport("transfer bundle SHA-256 does not match the frozen spec");
  }

  const bundleError = validateFrozenTransferBundle(
    bundleBytes,
    donorSetPath,
    transferReport,
  );
  if (bundleError !== undefined) return { ok: false, error: bundleError };
  const donorReferences = donorReferencesFromSet(
    await Bun.file(donorSetPath).text(),
  );
  if (donorReferences.length === 0) {
    transferReport("frozen DONOR SET contains no parseable source locators");
  }
  const parsed = parseTransferBundle(bundleText);
  for (const finding of parsed.findings) transferReport(finding);
  const actual = new Map(
    parsed.attempts.map((attempt) => [attempt.id, attempt]),
  );

  const denominatorValue = readField(lines, "Attempt denominator");
  const denominator =
    denominatorValue === undefined ? undefined : stableIds(denominatorValue);
  if (
    denominator === undefined ||
    new Set(denominator).size !== denominator.length
  ) {
    transferReport(
      "Attempt denominator must be a unique comma-separated ID list",
    );
  } else {
    const declared = new Set(denominator);
    parsed.attempts.forEach((attempt) => {
      if (!declared.has(attempt.id)) {
        transferReport(
          `transfer disposition omits bundle attempt ${attempt.id} (${attempt.kind})`,
        );
      }
    });
    declared.forEach((id) => {
      if (!actual.has(id)) {
        transferReport(`Attempt denominator names absent bundle attempt ${id}`);
      }
    });
  }

  const breakIds = parsed.attempts
    .filter((attempt) => attempt.kind === "MAPPING-BREAK")
    .map((attempt) => attempt.id);
  const preservedValue = readField(lines, "Preserved MAPPING-BREAK IDs");
  const preserved = resolvePreservedIds(preservedValue);
  if (preserved === undefined) {
    transferReport(
      "Preserved MAPPING-BREAK IDs must be a stable ID list or precise NONE",
    );
  } else {
    const preservedSet = new Set(preserved);
    breakIds.forEach((id) => {
      if (!preservedSet.has(id)) {
        transferReport(
          `MAPPING-BREAK ${id} is absent from the preserved-break list`,
        );
      }
    });
    preservedSet.forEach((id) => {
      if (!breakIds.includes(id)) {
        transferReport(
          `preserved MAPPING-BREAK ID is absent from the frozen transfer bundle: ${id}`,
        );
      }
    });
  }

  const decisionsValue = readField(lines, "Candidate disposition");
  const decisions =
    decisionsValue === undefined ? undefined : parseDecisions(decisionsValue);
  const candidates = parsed.attempts.filter(
    (attempt) => attempt.kind === "CANDIDATE",
  );
  if (decisions === undefined) {
    transferReport(
      "Candidate disposition must use ID=TEST|REOPEN|ADOPT|RETIRE or precise NONE",
    );
  } else {
    candidates.forEach((candidate) => {
      if (!decisions.has(candidate.id)) {
        transferReport(`candidate ${candidate.id} has no disposition`);
      }
    });
    decisions.forEach((_decision, id) => {
      if (!candidates.some((candidate) => candidate.id === id)) {
        transferReport(
          `candidate disposition names non-candidate attempt ${id}`,
        );
      }
    });
  }

  for (const label of [
    "Basis / scope",
    "Target-side test or result locus",
    "Integration / retirement action",
    "Reopen trigger",
  ]) {
    const value = readField(lines, label);
    if (value === undefined || placeholder(value)) {
      transferReport(`${label} is required for active TRANSFER DISPOSITION`);
    }
  }

  const targetEvidence =
    readField(lines, "Target-side test or result locus") ?? "";
  const action = readField(lines, "Integration / retirement action") ?? "";
  const decisionValues = decisions === undefined ? [] : [...decisions.values()];
  const targetResultDecisionIds = [...(decisions ?? [])]
    .filter(([, decision]) => decision === "ADOPT" || decision === "RETIRE")
    .map(([id]) => id);
  const targetResultReference = targetEvidence.match(
    /^TARGET RESULT\s*(?:—|–|:|\s-\s)\s*path=(\S.+?)\s*;\s*sha256=([a-f0-9]{64})$/iu,
  );
  if (targetResultDecisionIds.length > 0 && targetResultPath === undefined) {
    transferReport("ADOPT or RETIRE requires --target-result <path>");
  }
  if (targetResultDecisionIds.length > 0 && targetResultReference === null) {
    transferReport(
      "ADOPT or RETIRE requires TARGET RESULT — path=<locus>; sha256=<digest>; donor-side support is insufficient",
    );
  }
  const verifyTargetResults = async (): Promise<string | undefined> => {
    if (targetResultPath === undefined) return undefined;
    if (!existsSync(targetResultPath)) {
      return `target result not found: ${targetResultPath}`;
    }
    const beforeTargetResult = failures;
    if (targetResultReference === null) {
      transferReport(
        "Target-side test or result locus must bind TARGET RESULT path and SHA-256",
      );
    } else {
      const declaredResultPath = targetResultReference[1]?.trim();
      const declaredResultDigest = targetResultReference[2];
      if (
        declaredResultPath === undefined ||
        !sameResolvedFile(declaredResultPath, targetResultPath)
      ) {
        transferReport("TARGET RESULT path does not match --target-result");
      }
      const targetResultBytes = await Bun.file(targetResultPath).bytes();
      const actualResultDigest = createHash("sha256")
        .update(targetResultBytes)
        .digest("hex");
      if (declaredResultDigest !== actualResultDigest) {
        transferReport(
          "TARGET RESULT SHA-256 does not match the frozen artifact",
        );
      }
      const parsedResults = parseTargetResultBundle(
        new TextDecoder().decode(targetResultBytes),
      );
      for (const finding of parsedResults.findings) transferReport(finding);
      const resultIds = new Set(
        parsedResults.results.map((result) => result.candidateId),
      );
      parsedResults.results.forEach((result) => {
        const attempt = actual.get(result.candidateId);
        if (attempt === undefined || attempt.kind !== "CANDIDATE") {
          transferReport(
            `TARGET RESULT candidate ${result.candidateId} is absent from the frozen transfer bundle`,
          );
        }
        if (
          result.transferBundle === undefined ||
          !sameResolvedFile(result.transferBundle.path, transferBundlePath)
        ) {
          transferReport(
            `TARGET RESULT transfer bundle path does not match --transfer-bundle for candidate ${result.candidateId}`,
          );
        } else if (result.transferBundle.digest !== actualDigest) {
          transferReport(
            `TARGET RESULT transfer bundle SHA-256 does not match the frozen bundle for candidate ${result.candidateId}`,
          );
        }
        if (
          donorReferences.some((reference) =>
            result.observationLocus
              .replaceAll(/\s+/gu, " ")
              .trim()
              .includes(reference.locator),
          )
        ) {
          transferReport(
            `TARGET RESULT ${result.candidateId} observation locus reuses a frozen donor source locator`,
          );
        }
        const observationSource = sourceIdentity(result.observationLocus);
        if (
          observationSource !== undefined &&
          donorReferences.some(
            (reference) => reference.sourceIdentity === observationSource,
          )
        ) {
          transferReport(
            `TARGET RESULT ${result.candidateId} observation locus reuses frozen donor source identity`,
          );
        }
        donorReferences.forEach((reference) => {
          if (mentionsStableId(result.targetObservation, reference.id)) {
            transferReport(
              `Target-side observation mentions frozen donor ID ${reference.id}`,
            );
          }
        });
        if (
          decisions?.get(result.candidateId) === "ADOPT" &&
          result.thresholdVerdict !== "PASS"
        ) {
          transferReport(
            `ADOPT requires a PASS TARGET RESULT for candidate ${result.candidateId}`,
          );
        }
        if (
          decisions?.get(result.candidateId) === "ADOPT" &&
          !/^NONE\s*(?:—|–|:|\s-\s)\s*\S.+$/iu.test(
            result.mappingAssessmentRequest,
          )
        ) {
          transferReport(
            `ADOPT requires Mapping assessment request: NONE for candidate ${result.candidateId}`,
          );
        }
      });
      targetResultDecisionIds.forEach((id) => {
        if (!resultIds.has(id)) {
          transferReport(`candidate ${id} has no frozen TARGET RESULT`);
        }
      });
      if (failures === beforeTargetResult) {
        report(
          `R14  PASS     frozen TARGET RESULT verified: sha256=${actualResultDigest} candidates=${resultIds.size}`,
        );
      }
    }
    return undefined;
  };
  const targetResultError = await verifyTargetResults();
  if (targetResultError !== undefined) {
    return { ok: false, error: targetResultError };
  }
  if (decisionValues.includes("TEST")) {
    if (
      !/^UNTESTED\s*(?:—|–|:|\s-\s)/u.test(targetEvidence) ||
      !/prediction registry=/iu.test(targetEvidence) ||
      !/handoff=/iu.test(targetEvidence)
    ) {
      transferReport(
        "TEST requires an UNTESTED target prediction registry and target-side test handoff",
      );
    }
    decisions?.forEach((decision, id) => {
      if (decision !== "TEST") return;
      const candidate = actual.get(id);
      if (
        placeholder(candidate?.prediction ?? "") ||
        placeholder(candidate?.discriminator ?? "")
      ) {
        transferReport(
          `TEST requires candidate ${id} prediction and alternative discriminator`,
        );
      }
    });
  }
  if (
    decisionValues.includes("RETIRE") &&
    !/tested|mapping family|transfer boundary|検証|写像.*族|境界/iu.test(action)
  ) {
    transferReport(
      "RETIRE must name the tested mapping family or transfer boundary",
    );
  }

  if (candidates.length === 0) {
    if (
      decisions === undefined ||
      decisions.size > 0 ||
      !/^NONE\s*(?:—|–|:|\s-\s)/u.test(targetEvidence) ||
      !/^REOPEN\s*(?:—|–|:|\s-\s)/u.test(action)
    ) {
      transferReport(
        "all-MAPPING-BREAK bundles require NONE candidate disposition and explicit REOPEN",
      );
    } else {
      report(
        "R14  PASS     all attempts ended MAPPING-BREAK; REOPEN is explicit",
      );
    }
  }

  if (failures === 0) {
    report(
      `R14  PASS     TRANSFER DISPOSITION attempts=${parsed.attempts.length} mapping-breaks=${breakIds.length}`,
    );
  }
  return failures;
}

async function readInput(): Promise<Input | ErrorValue> {
  const parsed = cli(
    {
      name: "research-check.ts",
      parameters: ["[spec]"],
      flags: {
        donorSet: String,
        targetResult: String,
        transferBundle: String,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 1)
    return {
      ok: false,
      error: "research-check.ts accepts at most one spec path",
    };
  const input = parsed._.spec;
  const donorSetPath = parsed.flags.donorSet;
  const targetResultPath = parsed.flags.targetResult;
  const transferBundlePath = parsed.flags.transferBundle;
  if (
    [donorSetPath, targetResultPath, transferBundlePath].some(
      (value) => value !== undefined && value.trim() === "",
    )
  )
    return { ok: false, error: "option requires a non-empty value" };
  if (input === undefined || input === "-") {
    const text = await new Response(Bun.stdin.stream()).text();
    return {
      ok: true,
      text,
      ...(donorSetPath === undefined ? {} : { donorSetPath }),
      ...(targetResultPath === undefined ? {} : { targetResultPath }),
      ...(transferBundlePath === undefined ? {} : { transferBundlePath }),
    };
  }
  if (!(await Bun.file(input).exists()))
    return { ok: false, error: `research-check: file not found: ${input}` };
  return {
    ok: true,
    text: await Bun.file(input).text(),
    ...(donorSetPath === undefined ? {} : { donorSetPath }),
    ...(targetResultPath === undefined ? {} : { targetResultPath }),
    ...(transferBundlePath === undefined ? {} : { transferBundlePath }),
  };
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

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const slots: Partial<Record<SlotName, string>> = {};
  const input = await readInput();
  if (!input.ok) {
    process.stderr.write(`FATAL: ${input.error}\n`);
    process.exitCode = 2;
    return;
  }
  const { donorSetPath, targetResultPath, text, transferBundlePath } = input;
  for (const line of text.split(/\r?\n/u)) {
    labelMatchers.forEach(([name, pattern]) => {
      if (slots[name] === undefined && pattern.test(line))
        slots[name] = valueAfterLabel(line);
    });
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

  const gateFailures = checks.reduce(
    (count, check) => count + (evaluate(check) ? 0 : 1),
    0,
  );
  const transferFailures = await validateTransferDisposition(
    text,
    donorSetPath,
    transferBundlePath,
    targetResultPath,
  );
  if (typeof transferFailures !== "number") {
    process.stderr.write(`FATAL: ${transferFailures.error}\n`);
    process.exitCode = 2;
    return;
  }
  const failures = gateFailures + transferFailures;
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

await main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
});
