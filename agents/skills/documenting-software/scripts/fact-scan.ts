// fact-scan.ts — step 1 of check F (fact consistency) in documenting-software.
//
// MECHANICAL ONLY. It lists starting terms that occur in two or more files of a doc set, with
// every file:line and its line text. It does not decide whether an occurrence differs from its
// owner; that judgment is SKILL.md's F step 2. A fact that uses none of the four starting kinds
// is not found here and needs the hand pass that F step 1 requires.
//
// Starting kinds: glossary headwords (first column of a table, or a heading) from --glossary,
// status words, backticked code identifiers, and numbers with units.
//
// Usage:  bun scripts/fact-scan.ts <doc-dir> [--glossary <file>]
// Exit:   0 = scan ran (an empty table is a valid result)
//         2 = usage error, or input unreadable / no Markdown or TOML files
//         1 = unknown flag (Cleye's strictFlags exit)

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { fromAsyncThrowable } from "neverthrow";

export type TermKind = "glossary" | "status" | "code" | "number";

export interface Occurrence {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface Row {
  readonly term: string;
  readonly kinds: readonly TermKind[];
  readonly occurrences: readonly Occurrence[];
}

export interface Source {
  readonly label: string;
  readonly lines: readonly string[];
}

interface Term {
  readonly text: string;
  readonly kinds: Set<TermKind>;
  readonly matches: (line: string) => boolean;
}

const STATUS_WORDS = [
  "未確認",
  "未決",
  "未実装",
  "予定",
  "unverified",
  "undecided",
  "unimplemented",
  "planned",
  "deprecated",
];
const UNITS = [
  "ms",
  "sec",
  "min",
  "KB",
  "MB",
  "GB",
  "%",
  "秒",
  "分",
  "時間",
  "件",
  "行",
  "回",
  "s",
  "h",
];
const NUMBER_WITH_UNIT = new RegExp(
  `(?<![\\w.])(\\d+(?:[.,]\\d+)?)\\s?(${UNITS.map((u) => escapeRe(u)).join("|")})(?![A-Za-z])`,
  "giu",
);
const CODE_SPAN = /`([^`\n]{2,80})`/gu;
const MARKUP = /\.(md|toml)$/iu;
const MAX_TEXT = 160;

function escapeRe(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSeparator(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/u.test(line) && line.includes("-");
}

function cleanTerm(s: string): string {
  return s.replaceAll(/[`*]/gu, "").trim();
}

function cells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return trimmed.split("|").map((c) => cleanTerm(c));
}

// The headword a line contributes, if any: a heading, or the first cell of a table body row.
function headwordAt(lines: readonly string[], i: number): string | undefined {
  const line = lines[i] ?? "";
  const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/u.exec(line);
  if (heading?.[1] !== undefined) return cleanTerm(heading[1]);
  if (!/^\s*\|/u.test(line) || isSeparator(line)) return undefined;
  const next = lines[i + 1];
  if (next !== undefined && isSeparator(next)) return undefined; // header row
  const first = cells(line)[0];
  return first === undefined ? undefined : cleanTerm(first);
}

export function glossaryHeadwords(lines: readonly string[]): string[] {
  return lines
    .flatMap((_, i) => {
      const head = headwordAt(lines, i);
      return head === undefined ? [] : [head];
    })
    .filter((t) => t.length > 0 && t.length <= 80);
}

function literalMatcher(text: string): (line: string) => boolean {
  const left = /^[A-Za-z]/u.test(text) ? "(?<![A-Za-z])" : "";
  const right = /[A-Za-z]$/u.test(text) ? "(?![A-Za-z])" : "";
  const re = new RegExp(left + escapeRe(text) + right, "iu");
  return (line) => re.test(line);
}

function numberMatcher(num: string, unit: string): (line: string) => boolean {
  const re = new RegExp(
    `(?<![\\w.])${escapeRe(num)}\\s?${escapeRe(unit)}(?![A-Za-z])`,
    "iu",
  );
  return (line) => re.test(line);
}

function addTerm(
  terms: Map<string, Term>,
  text: string,
  kind: TermKind,
  matches: (line: string) => boolean,
): void {
  const key = text.toLowerCase().replaceAll(/\s+/gu, " ");
  const existing = terms.get(key);
  if (existing !== undefined) {
    existing.kinds.add(kind);
    return;
  }
  terms.set(key, { text, kinds: new Set([kind]), matches });
}

function addCodeTerm(terms: Map<string, Term>, raw: string | undefined): void {
  const id = raw?.trim();
  if (id !== undefined && id !== "")
    addTerm(terms, id, "code", literalMatcher(id));
}

function addNumberTerm(
  terms: Map<string, Term>,
  num: string | undefined,
  unit: string | undefined,
): void {
  if (num === undefined || unit === undefined) return;
  addTerm(
    terms,
    `${num} ${unit.toLowerCase()}`,
    "number",
    numberMatcher(num, unit),
  );
}

function addLineTerms(terms: Map<string, Term>, line: string): void {
  for (const m of line.matchAll(CODE_SPAN)) addCodeTerm(terms, m[1]);
  for (const m of line.matchAll(NUMBER_WITH_UNIT))
    addNumberTerm(terms, m[1], m[2]);
}

function collectTerms(
  sources: readonly Source[],
  glossary: Source | undefined,
): Term[] {
  const terms = new Map<string, Term>();
  const headwords =
    glossary === undefined ? [] : glossaryHeadwords(glossary.lines);
  for (const head of headwords)
    addTerm(terms, head, "glossary", literalMatcher(head));
  for (const word of STATUS_WORDS)
    addTerm(terms, word, "status", literalMatcher(word));
  for (const source of sources) {
    for (const line of source.lines) addLineTerms(terms, line);
  }
  return [...terms.values()];
}

function occurrencesIn(term: Term, source: Source): Occurrence[] {
  return source.lines.flatMap((line, i) =>
    term.matches(line)
      ? [
          {
            file: source.label,
            line: i + 1,
            text: line.trim().slice(0, MAX_TEXT),
          },
        ]
      : [],
  );
}

function rowOf(term: Term, sources: readonly Source[]): Row | undefined {
  const occurrences = sources.flatMap((source) => occurrencesIn(term, source));
  if (new Set(occurrences.map((o) => o.file)).size < 2) return undefined;
  return { term: term.text, kinds: [...term.kinds], occurrences };
}

export function scanSources(
  sources: readonly Source[],
  glossary?: Source,
): Row[] {
  return collectTerms(sources, glossary)
    .flatMap((term) => {
      const row = rowOf(term, sources);
      return row === undefined ? [] : [row];
    })
    .toSorted((a, b) => (a.term < b.term ? -1 : 1));
}

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

export function renderTable(rows: readonly Row[]): string {
  if (rows.length === 0) return "No term appears in two or more files.\n";
  const lines = [
    "| Term | Kinds | Locations (file:line — line text) |",
    "| --- | --- | --- |",
  ];
  for (const row of rows) {
    const locations = row.occurrences
      .map((o) => `${o.file}:${o.line} — ${escapeCell(o.text)}`)
      .join("<br>");
    lines.push(
      `| ${escapeCell(row.term)} | ${row.kinds.join(", ")} | ${locations} |`,
    );
  }
  return lines.join("\n") + "\n";
}

async function docFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries
    .filter(
      (rel) =>
        MARKUP.test(rel) &&
        !rel.split(sep).some((part) => part.startsWith(".")),
    )
    .toSorted()
    .map((rel) => join(dir, rel));
}

const labelOf = (root: string, path: string): string =>
  relative(root, path).split(sep).join("/");

async function loadInputs(
  root: string,
  files: readonly string[],
  glossaryPath: string | undefined,
): Promise<{ sources: Source[]; glossary: Source | undefined }> {
  const sources: Source[] = [];
  for (const path of files) {
    sources.push({
      label: labelOf(root, path),
      lines: (await readFile(path, "utf8")).split(/\r?\n/u),
    });
  }
  if (glossaryPath === undefined) return { sources, glossary: undefined };
  const glossaryAbs = resolve(glossaryPath);
  const inside = files.includes(glossaryAbs);
  const label = inside
    ? labelOf(root, glossaryAbs)
    : `glossary:${basename(glossaryAbs)}`;
  const glossary: Source = {
    label,
    lines: (await readFile(glossaryAbs, "utf8")).split(/\r?\n/u),
  };
  if (!inside) sources.push(glossary);
  return { sources, glossary };
}

// Cleye is the argv boundary: unknown flags fail, and a prototype flag is rejected before parsing.
let prototypeFlagSeen = false;
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
};

async function main(): Promise<number> {
  const parsed = cli({
    name: "fact-scan",
    parameters: ["[doc-dir]"],
    flags: {
      glossary: {
        type: String,
        description: "Glossary file (table headwords and headings)",
      },
    },
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (prototypeFlagSeen) return usage("unknown option --__proto__");
  const docdir = parsed._.at(0);
  if (docdir === undefined) return usage("doc directory is required");
  if (parsed._.length > 1)
    return usage("exactly one doc directory is expected");

  const root = resolve(docdir);
  const isDirectory = await fromAsyncThrowable(() => stat(root))();
  if (isDirectory.isErr())
    return fail(`cannot read ${docdir}: ${messageOf(isDirectory.error)}`);
  if (!isDirectory.value.isDirectory())
    return fail(`${docdir} is not a directory`);

  const listed = await fromAsyncThrowable(() => docFiles(root))();
  if (listed.isErr())
    return fail(`cannot list ${docdir}: ${messageOf(listed.error)}`);
  if (listed.value.length === 0)
    return fail(`no Markdown or TOML files under ${docdir}`);

  const loaded = await fromAsyncThrowable(() =>
    loadInputs(root, listed.value, parsed.flags.glossary),
  )();
  if (loaded.isErr())
    return fail(`cannot read input: ${messageOf(loaded.error)}`);

  process.stdout.write(
    renderTable(scanSources(loaded.value.sources, loaded.value.glossary)),
  );
  return 0;
}

function usage(message: string): number {
  process.stderr.write(
    `fact-scan: ${message}\nusage: bun fact-scan.ts <doc-dir> [--glossary <file>]\n`,
  );
  return 2;
}

function fail(message: string): number {
  process.stderr.write(`fact-scan: ${message}\n`);
  return 2;
}

if (import.meta.main) {
  process.exit(await main());
}
