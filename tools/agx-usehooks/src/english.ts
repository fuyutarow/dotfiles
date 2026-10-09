const MIN_JAPANESE_SHARE = 0.3;

export function stripNonProse(text: string): string {
  const codeAndQuotes: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*>/u.test(line)) continue;
    codeAndQuotes.push(line.replaceAll(/`[^`]*`/gu, ""));
  }

  return codeAndQuotes
    .join("\n")
    .replaceAll(/https?:\/\/\S+|www\.\S+/giu, " ")
    .replaceAll(
      /(?:~\/|\.\.?\/|\/)?(?:[\w.@+-]+\/)*[\w.@+-]+\.[A-Za-z0-9]{1,12}(?::\d+(?::\d+)?)?/gu,
      " ",
    );
}

export function japaneseShare(text: string): {
  letters: number;
  share: number;
} {
  let japanese = 0;
  let latin = 0;
  for (const match of text.matchAll(
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]|\p{Script=Latin}/gu,
  )) {
    if (
      /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]$/u.test(match[0])
    )
      japanese += 1;
    else latin += 1;
  }
  const letters = japanese + latin;
  return { letters, share: letters === 0 ? 1 : japanese / letters };
}

export function proseSegments(text: string): string[] {
  const lines = text.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  let currentKind: "prose" | "list" | "table" | undefined;
  const flush = () => {
    if (current.length > 0) segments.push(current.join("\n"));
    current = [];
    currentKind = undefined;
  };

  for (const line of lines) {
    if (/^\s*#/u.test(line)) {
      flush();
      segments.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    let kind: "prose" | "list" | "table" = "prose";
    if (/^\s*(?:[-+*]|\d+[.)])\s/u.test(line)) kind = "list";
    else if (/^\s*\|.*\|\s*$/u.test(line)) kind = "table";
    if (currentKind !== undefined && currentKind !== kind) flush();
    currentKind = kind;
    current.push(line);
  }
  flush();
  return segments;
}

export function identifierHeavy(text: string): boolean {
  const tokens = text.match(/\p{Script=Latin}+/gu) ?? [];
  if (tokens.length === 0) return false;
  const identifiers = tokens.filter(
    (token) =>
      /[_\-./]/u.test(token) ||
      /[a-z][A-Z]/u.test(token) ||
      /^[A-Z]{2,}$/u.test(token),
  ).length;
  return identifiers / tokens.length >= 0.6;
}

/** True when a response contains a substantial English prose segment. */
function englishProse(text: string): string[] {
  const prose = stripNonProse(text);
  return proseSegments(prose).filter((segment) => {
    if (identifierHeavy(segment)) return false;
    const { letters, share } = japaneseShare(segment);
    return letters >= 120 && share < MIN_JAPANESE_SHARE;
  });
}

export function englishSegments(text: string): Promise<string[]> {
  return Promise.resolve(englishProse(text));
}
export function hasEnglishProseSegment(text: string): boolean {
  return englishProse(text).length > 0;
}
