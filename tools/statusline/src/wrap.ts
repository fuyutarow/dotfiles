const ESCAPE = String.fromCodePoint(27);
const BEL = String.fromCodePoint(7);
const SGR = `${ESCAPE}\\[[0-?]*[ -/]*[@-~]`;
const STRIP_ANSI = new RegExp(
  `${ESCAPE}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}]*(?:${BEL}|${ESCAPE}\\\\))`,
  "gu",
);
const SEGMENT_SEPARATOR = new RegExp(` (?:${SGR})*[·|](?:${SGR})* `, "gu");

function isWide(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f000 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}

function graphemeWidth(grapheme: string): number {
  if (/\p{Extended_Pictographic}/u.test(grapheme)) return 2;
  const points: number[] = [];
  for (let offset = 0; offset < grapheme.length;) {
    const point = grapheme.codePointAt(offset) ?? 0;
    points.push(point);
    offset += point > 0xffff ? 2 : 1;
  }
  const visible = points.filter(
    (point) =>
      !/\p{Mark}/u.test(String.fromCodePoint(point)) &&
      point !== 0x200d &&
      point !== 0xfe0e &&
      point !== 0xfe0f,
  );
  if (visible.length === 0) return 0;
  return visible.some((point) => isWide(point)) ? 2 : 1;
}

/** Terminal columns occupied by text. ANSI control sequences and combining marks use zero. */
export function displayWidth(text: string): number {
  const plain = text.replaceAll(STRIP_ANSI, "");
  let width = 0;
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(plain))
    width += graphemeWidth(segment);
  return width;
}

function visibleText(text: string): string {
  return text.replaceAll(STRIP_ANSI, "");
}

function splitSegments(line: string): {
  segments: string[];
  separators: string[];
} {
  const segments: string[] = [];
  const separators: string[] = [];
  let start = 0;
  for (const match of line.matchAll(SEGMENT_SEPARATOR)) {
    const index = match.index;
    if (index === undefined) continue;
    segments.push(line.slice(start, index));
    separators.push(match[0]);
    start = index + match[0].length;
  }
  segments.push(line.slice(start));
  return { segments, separators };
}

/** Wrap a rendered statusline row at its existing middot or pipe segment boundaries. */
export function wrapSegmentedLine(line: string, columns: number): string {
  if (!Number.isSafeInteger(columns) || columns < 1) return line;
  const { segments, separators } = splitSegments(line);
  if (separators.length === 0) return line;

  const physical: string[] = [];
  let current = segments[0] ?? "";
  for (const [index, segment] of segments.slice(1).entries()) {
    const separator = separators[index] ?? " ";
    const joined = `${current}${separator}${segment}`;
    if (displayWidth(joined) <= columns) {
      current = joined;
    } else {
      physical.push(current);
      current = segment;
    }
  }
  physical.push(current);
  return physical.join("\n");
}

/** Wrap only rows through Sys; later rows retain their original bytes and line breaks. */
export function wrapThroughSys(text: string, columns: number): string {
  if (!Number.isSafeInteger(columns) || columns < 1) return text;
  const lines = text.split("\n");
  const sysIndex = lines.findIndex((line) =>
    visibleText(line).startsWith("Sys:"),
  );
  if (sysIndex < 0) return text;
  return [
    ...lines
      .slice(0, sysIndex + 1)
      .map((line) => wrapSegmentedLine(line, columns)),
    ...lines.slice(sysIndex + 1),
  ].join("\n");
}

/** Claude Code captures statusline stdout, so its documented COLUMNS is the width source. */
export function statuslineColumns(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const columns = Number(env.COLUMNS);
  return Number.isSafeInteger(columns) && columns > 0 ? columns : undefined;
}
