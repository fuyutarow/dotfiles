export const MAX_INPUT_BYTES = 64 * 1024;

export type JapaneseOutcome =
  | "japanese-primary"
  | "non-japanese"
  | "insufficient";

export type JapaneseClassification = {
  outcome: JapaneseOutcome;
  reason:
    | "japanese-dominant"
    | "english-prose"
    | "insufficient-english"
    | "chinese-markers"
    | "han-only-without-kana"
    | "ambiguous-short-han-only"
    | "no-human-prose"
    | "input-too-large";
  scope: "authored-prose" | "quote-only-reference" | "no-prose" | "input";
  evidence: {
    bytes: number;
    proseChars: number;
    kana: number;
    han: number;
    latin: number;
    englishLetters: number;
    chineseMarkers: number;
  };
};

type Counts = {
  proseChars: number;
  kana: number;
  han: number;
  latin: number;
  englishLetters: number;
  chineseMarkers: number;
};

const SIMPLIFIED_ONLY_HAN_MARKERS = new Set(
  Array.from(
    "这说们个时对经过还进样应该现动问题关东车长为项发开间认识语话读处务员级结构输产业层网络设备线简单复杂选择确记录检查测试么没让给吗呢实从",
  ).filter((marker) => !"会写与将来号万了".includes(marker)),
);

function englishProseLetters(text: string): number {
  let total = 0;
  const run =
    /(?<![A-Za-z0-9_'-])[A-Za-z][A-Za-z'-]*(?:[ \t]+|[,;:][ \t]*)[A-Za-z][A-Za-z'-]*(?:(?:[ \t]+|[,;:][ \t]*)[A-Za-z][A-Za-z'-]*)+(?![A-Za-z0-9_'-])/gu;
  for (const match of text.matchAll(run))
    total += (match[0].match(/[A-Za-z]/gu) ?? []).length;
  return total;
}

function isSimplifiedOnlyHanMarker(unit: string): boolean {
  return SIMPLIFIED_ONLY_HAN_MARKERS.has(unit);
}

function withoutCodeAndReferences(text: string): {
  authored: string;
  quotes: string;
} {
  const authored: string[] = [];
  const quotes: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const target = /^\s*>/u.test(line) ? quotes : authored;
    target.push(line.replaceAll(/`[^`]*`/gu, ""));
  }
  return { authored: authored.join("\n"), quotes: quotes.join("\n") };
}

function proseOnly(text: string): string {
  const codeLikeCell =
    /`[^`]*`|(?:^|\s)--?[\w-]+|\b(?:[\w.-]+\/)+[\w.-]+\b|\b[\w-]+\.[A-Za-z0-9]{1,12}\b|\b[A-Za-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b|\b\w+_\w+\b|\b(?:[A-Za-z0-9_-]+:)+[A-Za-z0-9_-]+\b/u;
  const tableSafe = text
    .split("\n")
    .map((line) => {
      if (!/^\s*\|.*\|\s*$/u.test(line)) return line;
      return line
        .split("|")
        .map((cell) => (codeLikeCell.test(cell) ? "" : cell))
        .join("|");
    })
    .join("\n");
  return tableSafe
    .replaceAll(/https?:\/\/\S+|www\.\S+/giu, " ")
    .replaceAll(
      /(?:~\/|\.\.?(?:\/|\\)|\/)?(?:[\w.@+-]+[\\/])*[\w.@+-]+\.[A-Za-z0-9]{1,12}(?::\d+(?::\d+)?)?/gu,
      " ",
    )
    .replaceAll(
      /\b[A-Za-z_][A-Za-z0-9_]*(?:[./:-][A-Za-z0-9_./:-]+)+\b/gu,
      " ",
    );
}

function counts(text: string): Counts {
  let kana = 0;
  let han = 0;
  let latin = 0;
  let chineseMarkers = 0;
  for (const unit of text) {
    if (/^[\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(unit)) kana += 1;
    else if (/^\p{Script=Han}$/u.test(unit)) {
      han += 1;
      chineseMarkers += Number(isSimplifiedOnlyHanMarker(unit));
    } else if (/^\p{Script=Latin}$/u.test(unit)) latin += 1;
  }
  return {
    proseChars: text.trim().length,
    kana,
    han,
    latin,
    englishLetters: englishProseLetters(text),
    chineseMarkers,
  };
}

function evidence(bytes: number, value: Counts) {
  return {
    bytes,
    ...value,
  };
}

function emptyCounts(): Counts {
  return {
    proseChars: 0,
    kana: 0,
    han: 0,
    latin: 0,
    englishLetters: 0,
    chineseMarkers: 0,
  };
}

/**
 * A long Han-only authored segment has no Japanese-specific evidence.  Evaluate segments rather
 * than only the aggregate so a short Japanese acknowledgement cannot mask a subsequent Chinese
 * sentence.  This deliberately keeps short headings/labels ambiguous.
 */
function hasSubstantialHanOnlySegment(text: string): boolean {
  return text.split(/[。！？!?；;\n]+/u).some((segment) => {
    const value = counts(segment);
    return value.kana === 0 && value.han >= 16;
  });
}

/**
 * Positive, deterministic classification for human reply prose. Han alone is not Japanese
 * evidence: short Han-only input abstains, while substantial Han-only prose is non-Japanese.
 */
export function classifyJapanesePrimary(text: string): JapaneseClassification {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_INPUT_BYTES)
    return {
      outcome: "insufficient",
      reason: "input-too-large",
      scope: "input",
      evidence: evidence(bytes, emptyCounts()),
    };

  const split = withoutCodeAndReferences(text);
  const authored = proseOnly(split.authored);
  const quoted = proseOnly(split.quotes);
  const authoredCounts = counts(authored);
  const useAuthored =
    authoredCounts.kana + authoredCounts.han + authoredCounts.latin > 0;
  const prose = useAuthored ? authored : quoted;
  const measured = counts(prose);
  const stats = evidence(bytes, measured);
  let scope: JapaneseClassification["scope"] = "no-prose";
  if (useAuthored) scope = "authored-prose";
  else if (measured.kana + measured.han + measured.latin > 0)
    scope = "quote-only-reference";
  if (
    measured.kana + measured.han + measured.latin === 0 &&
    measured.englishLetters === 0
  )
    return {
      outcome: "insufficient",
      reason: "no-human-prose",
      scope,
      evidence: stats,
    };

  if (measured.chineseMarkers >= 3 && measured.chineseMarkers >= measured.kana)
    return {
      outcome: "non-japanese",
      reason: "chinese-markers",
      scope,
      evidence: stats,
    };

  if (measured.kana === 0 && measured.han === 0 && measured.englishLetters < 16)
    return {
      outcome: "insufficient",
      reason: "insufficient-english",
      scope,
      evidence: stats,
    };

  if (measured.kana === 0 && measured.han > 0)
    return {
      outcome: measured.han < 16 ? "insufficient" : "non-japanese",
      reason:
        measured.han < 16
          ? "ambiguous-short-han-only"
          : "han-only-without-kana",
      scope,
      evidence: stats,
    };

  if (hasSubstantialHanOnlySegment(prose))
    return {
      outcome: "non-japanese",
      reason: "han-only-without-kana",
      scope,
      evidence: stats,
    };

  if (
    measured.kana >= 1 &&
    1.5 * (measured.kana + measured.han) >= measured.englishLetters
  )
    return {
      outcome: "japanese-primary",
      reason: "japanese-dominant",
      scope,
      evidence: stats,
    };

  return {
    outcome: "non-japanese",
    reason: "english-prose",
    scope,
    evidence: stats,
  };
}
