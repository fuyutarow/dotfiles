/** Pure detection only. No rewriting, I/O, dependencies, or hook enforcement. */
export type MathDelimiterViolation = {
  readonly kind: "inline" | "display";
  readonly line: number;
  readonly column: number;
};

const MAX_SCAN = 1_048_576;
const MAX_FINDINGS = 100;

type Fence = { marker: string; length: number };

function parseFence(
  text: string,
  start: number,
  end: number,
  fence: Fence | null,
) {
  const match = /^ {0,3}(`{3,}|~{3,})([\s\S]*)$/u.exec(text.slice(start, end));
  if (match === null) return fence;
  const run = match[1] ?? "";
  const info = match[2] ?? "";
  const marker = run[0] ?? "";
  if (fence !== null) {
    if (
      marker === fence.marker &&
      run.length >= fence.length &&
      /^[ \t]*$/u.test(info)
    ) {
      return null;
    }
    return fence;
  }
  if (marker === "`" && info.includes("`")) return null;
  return { marker, length: run.length };
}

type Opening = { violation: MathDelimiterViolation; paired: boolean };

function recordDelimiter(
  delimiter: string | undefined,
  line: number,
  column: number,
  openings: Opening[],
  stack: number[],
) {
  if (delimiter === "(" || delimiter === "[") {
    openings.push({
      violation: {
        kind: delimiter === "(" ? "inline" : "display",
        line,
        column,
      },
      paired: false,
    });
    stack.push(openings.length - 1);
    return;
  }
  if (delimiter !== ")" && delimiter !== "]") return;
  const top = stack.at(-1);
  const opening = top === undefined ? undefined : openings[top];
  const kind = delimiter === ")" ? "inline" : "display";
  if (opening?.violation.kind !== kind) return;
  opening.paired = true;
  stack.pop();
}

/**
 * Scan a bounded prefix; capped results may be incomplete. Columns count UTF-16
 * code units. Supports top-level fences and exact-length inline backtick spans,
 * not container blocks, indented code, or TeX syntax. Source is never changed.
 */
export function findLegacyMathDelimiters(
  text: string,
): readonly MathDelimiterViolation[] {
  const limit = Math.min(text.length, MAX_SCAN);
  const code = new Uint8Array(limit);
  let fence: Fence | null = null;

  // Block parsing precedes inline parsing. Each line and marker run is read once.
  for (let start = 0; start < limit;) {
    let end = start;
    while (end < limit && text[end] !== "\n" && text[end] !== "\r") end++;
    let next = end;
    if (next < limit && text[next] === "\r") next++;
    if (next < limit && text[next] === "\n") next++;
    const previous = fence;
    fence = parseFence(text, start, end, fence);
    if (previous !== null || fence !== null) code.fill(1, start, next);
    start = next;
  }

  // Index the next equal-length run in each non-fenced region, including runs
  // preceded by a slash: inside a code span backslashes do not escape backticks.
  const closes = new Map<number, number>();
  const latest = new Map<number, number>();
  for (let i = limit - 1; i >= 0; i--) {
    if (code[i] === 1) {
      latest.clear();
      continue;
    }
    if (text[i] !== "`") continue;
    const end = i + 1;
    while (i > 0 && code[i - 1] !== 1 && text[i - 1] === "`") i--;
    const length = end - i;
    const close = latest.get(length);
    if (close !== undefined) closes.set(i, close + length);
    latest.set(length, i);
  }

  const openings: Opening[] = [];
  const stack: number[] = [];
  let line = 1;
  let column = 1;
  let slashes = 0;
  let inlineEnd = 0;
  for (let i = 0; i < limit; i++) {
    const char = text[i];
    const openingLine = line;
    const openingColumn = column;
    if (char === "\r" || (char === "\n" && text[i - 1] !== "\r")) {
      line++;
      column = 1;
    } else if (char !== "\n" || text[i - 1] !== "\r") {
      column++;
    }
    if (code[i] === 1) {
      // A pair cannot cross a fenced block boundary.
      stack.length = 0;
      inlineEnd = 0;
      slashes = 0;
      continue;
    }
    if (i < inlineEnd) {
      slashes = 0;
      continue;
    }
    if (char === "`" && text[i - 1] !== "`" && slashes % 2 === 0) {
      inlineEnd = closes.get(i) ?? 0;
    }
    if (i >= inlineEnd && char === "\\" && slashes % 2 === 0) {
      recordDelimiter(text[i + 1], openingLine, openingColumn, openings, stack);
    }
    slashes = char === "\\" ? slashes + 1 : 0;
  }
  const findings: MathDelimiterViolation[] = [];
  for (const opening of openings) {
    if (opening.paired) findings.push(opening.violation);
    if (findings.length === MAX_FINDINGS) break;
  }
  return findings;
}
