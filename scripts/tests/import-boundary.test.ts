import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const REPO = resolve(import.meta.dir, "../..");
const BASELINE = resolve(REPO, "lint/import-boundary-baseline.tsv");

type Token = { kind: "string" | "word" | "punct"; value: string };
type Edge = { file: string; target: string };

function skipLineComment(source: string, start: number): number {
  let i = start + 2;
  while (i < source.length && source[i] !== "\n") i++;
  return i;
}

function skipBlockComment(source: string, start: number): number {
  let i = start + 2;
  while (i < source.length && !(source[i] === "*" && source[i + 1] === "/"))
    i++;
  return i + 2;
}

function quoted(source: string, start: number): { token: Token; end: number } {
  const quote = source[start] ?? "";
  let value = "";
  let i = start + 1;
  while (i < source.length && source[i] !== quote) {
    if (source[i] === "\\" && i + 1 < source.length) {
      i++;
      const escaped = source[i] ?? "";
      const replacements: Record<string, string> = { n: "\n", r: "\r" };
      value += replacements[escaped] ?? escaped;
      i++;
      continue;
    }
    value += source[i] ?? "";
    i++;
  }
  return { token: { kind: "string", value }, end: i + 1 };
}

function word(source: string, start: number): { token: Token; end: number } {
  let i = start + 1;
  while (i < source.length && /[\p{L}\p{N}_$]/u.test(source[i] ?? "")) i++;
  return { token: { kind: "word", value: source.slice(start, i) }, end: i };
}

function skipTemplate(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length && source[i] !== "`") {
    if (source[i] === "\\") i += 2;
    else i++;
  }
  return i + 1;
}

function tokens(source: string): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < source.length;) {
    const char = source[i] ?? "";
    if (/\s/u.test(char)) {
      i++;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (char === "'" || char === '"') {
      const parsed = quoted(source, i);
      result.push(parsed.token);
      i = parsed.end;
      continue;
    }
    if (char === "`") {
      i = skipTemplate(source, i);
      continue;
    }
    if (/[\p{L}_$]/u.test(char)) {
      const parsed = word(source, i);
      result.push(parsed.token);
      i = parsed.end;
      continue;
    }
    result.push({ kind: "punct", value: char });
    i++;
  }
  return result;
}

function fromSpecifier(
  all: readonly Token[],
  start: number,
): string | undefined {
  for (let j = start; j < all.length && j < start + 100; j++) {
    const next = all[j];
    if (
      next?.value === ";" ||
      next?.value === "import" ||
      next?.value === "export"
    )
      return undefined;
    if (
      next?.kind === "word" &&
      next.value === "from" &&
      all[j + 1]?.kind === "string"
    )
      return all[j + 1]?.value;
  }
  return undefined;
}

function isModuleUrl(all: readonly Token[], i: number): boolean {
  return (
    all[i]?.value === "new" &&
    all[i + 1]?.value === "URL" &&
    all[i + 2]?.value === "(" &&
    all[i + 3]?.kind === "string" &&
    all[i + 4]?.value === "," &&
    all[i + 5]?.value === "import" &&
    all[i + 6]?.value === "." &&
    all[i + 7]?.value === "meta" &&
    all[i + 8]?.value === "." &&
    all[i + 9]?.value === "url"
  );
}

function importedSpecifier(
  all: readonly Token[],
  i: number,
): string | undefined {
  if (all[i + 1]?.value === "(" && all[i + 2]?.kind === "string")
    return all[i + 2]?.value;
  if (all[i + 1]?.kind === "string") return all[i + 1]?.value;
  return fromSpecifier(all, i + 1);
}

function specifierAt(all: readonly Token[], i: number): string | undefined {
  const token = all[i];
  if (token?.value === "import") return importedSpecifier(all, i);
  if (token?.value === "export") return fromSpecifier(all, i + 1);
  if (isModuleUrl(all, i)) return all[i + 3]?.value;
  return undefined;
}

function importedSpecifiers(source: string): string[] {
  const all = tokens(source);
  const found: string[] = [];
  for (let i = 0; i < all.length; i++) {
    const token = all[i];
    if (token?.kind !== "word") continue;
    const specifier = specifierAt(all, i);
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

function edgeFor(file: string, specifier: string): Edge | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const absoluteFile = resolve(REPO, file);
  const absoluteTarget = resolve(dirname(absoluteFile), specifier);
  return {
    file: relative(REPO, absoluteFile).split(sep).join("/"),
    target: relative(REPO, absoluteTarget).split(sep).join("/"),
  };
}

function isAllowed(file: string, target: string): boolean {
  const sourceParts = file.split("/");
  const targetParts = target.split("/");
  const tool = sourceParts[1];
  return (
    sourceParts[0] === "tools" &&
    sourceParts[2] === "src" &&
    targetParts[0] === "tools" &&
    (targetParts[1] === tool || targetParts[1] === "shared")
  );
}

function violations(files: Readonly<Record<string, string>>): Edge[] {
  return Object.entries(files).flatMap(([file, source]) =>
    importedSpecifiers(source)
      .map((specifier) => edgeFor(file, specifier))
      .flatMap((edge) => (edge === undefined ? [] : [edge]))
      .filter((edge) => !isAllowed(edge.file, edge.target))
      .map(({ file: sourceFile, target }) => ({ file: sourceFile, target })),
  );
}

function parseBaseline(text: string): Edge[] {
  return text
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => {
      const [file, target] = line.split("\t");
      expect(line.split("\t")).toHaveLength(2);
      return { file: file ?? "", target: target ?? "" };
    });
}

function scanSources(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of new Bun.Glob("tools/*/src/**/*.ts").scanSync({
    cwd: root,
  })) {
    const file = resolve(root, path);
    files[relative(root, file).split(sep).join("/")] = readFileSync(
      file,
      "utf8",
    );
  }
  return files;
}

function check(
  files: Readonly<Record<string, string>>,
  baselineRows: readonly Edge[],
) {
  const actual = violations(files);
  const baseline = new Set(
    baselineRows.map(({ file, target }) => `${file}\t${target}`),
  );
  const observed = new Set(
    actual.map(({ file, target }) => `${file}\t${target}`),
  );
  return {
    added: actual.filter(
      ({ file, target }) => !baseline.has(`${file}\t${target}`),
    ),
    stale: baselineRows.filter(
      ({ file, target }) => !observed.has(`${file}\t${target}`),
    ),
  };
}

describe("scripts/tests/import-boundary.test.ts", () => {
  test("tool src imports stay within the owning tool and tools/shared/; baseline only shrinks", () => {
    const rows = parseBaseline(readFileSync(BASELINE, "utf8"));
    const result = check(scanSources(REPO), rows);
    expect(result.added, "unrecorded cross-tool imports").toEqual([]);
    expect(result.stale, "stale import boundary baseline rows").toEqual([]);
  });

  test("a planted cross-tool import fails", () => {
    const found = violations({
      "tools/alpha/src/index.ts": 'import "../../beta/src/index.ts";\n',
    });
    expect(found).toEqual([
      { file: "tools/alpha/src/index.ts", target: "tools/beta/src/index.ts" },
    ]);
    expect(
      check(
        { "tools/alpha/src/index.ts": 'import "../../beta/src/index.ts";\n' },
        [],
      ).added,
    ).toEqual(found);
  });

  test("parses dynamic imports, re-exports, and module URLs", () => {
    const found = violations({
      "tools/alpha/src/index.ts": [
        'void import("../../beta/src/dynamic.ts");',
        'export { value } from "../../beta/src/exported.ts";',
        'const worker = new URL("../../beta/src/worker.ts", import.meta.url);',
      ].join("\n"),
    });
    expect(found).toEqual([
      { file: "tools/alpha/src/index.ts", target: "tools/beta/src/dynamic.ts" },
      {
        file: "tools/alpha/src/index.ts",
        target: "tools/beta/src/exported.ts",
      },
      { file: "tools/alpha/src/index.ts", target: "tools/beta/src/worker.ts" },
    ]);
  });

  test("a removed violation with its baseline row fails as stale", () => {
    const row = {
      file: "tools/alpha/src/index.ts",
      target: "tools/beta/src/index.ts",
    };
    expect(
      check({ "tools/alpha/src/index.ts": "export {};\n" }, [row]).stale,
    ).toEqual([row]);
  });
});
