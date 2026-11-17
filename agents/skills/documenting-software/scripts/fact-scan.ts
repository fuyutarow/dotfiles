// fact-scan.ts — step 1 of check F (fact consistency) in documenting-software.
//
// MECHANICAL ONLY. The unit is a STATEMENT, not a word occurrence: one sentence (or one table
// row) that states (a) a number with a unit, (b) a status word together with the subject it
// qualifies, or (c) a definition ("X は … です", "X とは", "X: …", "X is a …", a glossary row).
// Statements are grouped by subject and only groups found in two or more files are printed, each
// with its location count (distinct file:line). The scan does not judge; that is F step 2.
//
// Subject heuristics (a fact stated with none of these shapes needs F's hand pass):
//   number      the noun phrase before the number (last two content words; a table cell with no
//               noun phrase takes the row label)
//   status word the last backticked identifier before it, else the last two content words before
//               it, else the first words after it; in a table row, the row label
//   definition  the term before は/とは/is/means/":"; a glossary row's headword
// A sentence may wrap across lines; its location is the line of the trigger (number, status word
// or definition head), so a quote taken from that line verifies.
//
// A glossary headword alone creates no group. `--terms` prints, per glossary headword, every
// file:line where it occurs (outside the glossary file) as input for a separate term check.
//
// --max-locations <m> packs contiguous groups (stable sorted order) so each shard has at most m
// locations; a single group larger than m gets a shard of its own and is reported on stderr.
// --shard <k> prints shard k (stdout stays the table alone; the plan goes to stderr).
//
// Usage:  bun scripts/fact-scan.ts <doc-dir> [--glossary <file>]
//             [--max-locations <m> [--shard <k>]] | [--terms]
// Exit:   0 = scan ran (an empty table is a valid result)
//         2 = usage error, or input unreadable / no Markdown or TOML files
//         1 = unknown flag (Cleye's strictFlags exit)

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { fromAsyncThrowable } from "neverthrow";

export type StatementKind = "number" | "status" | "definition";

export interface Statement {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface Group {
  readonly subject: string;
  readonly kinds: readonly StatementKind[];
  readonly statements: readonly Statement[];
  readonly locations: number;
}

export interface Occurrence {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface TermRow {
  readonly term: string;
  readonly occurrences: readonly Occurrence[];
}

export interface Source {
  readonly label: string;
  readonly lines: readonly string[];
}

const STATUS_WORDS = [
  "未確認",
  "未決",
  "未実装",
  "実装済み",
  "予定",
  "unverified",
  "undecided",
  "unimplemented",
  "implemented",
  "planned",
  "deprecated",
];
const UNITS = [
  "ms",
  "sec",
  "min",
  "bytes",
  "byte",
  "KiB",
  "MiB",
  "GiB",
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
  "つ",
  "個",
  "種",
  "s",
  "h",
];
// Units of one family are grouped together without converting between them.
const FAMILY = new Map<string, string>([
  ...["ms", "s", "sec", "min", "秒", "分", "時間", "h"].map(
    (u) => [u, "time"] as const,
  ),
  ...["bytes", "byte", "kib", "mib", "gib", "kb", "mb", "gb"].map(
    (u) => [u, "size"] as const,
  ),
]);
const familyKey = (unit: string | undefined): string | undefined => {
  const u = unit?.toLowerCase();
  return u === undefined ? undefined : `[unit:${FAMILY.get(u) ?? u}]`;
};
const NUMBER_WITH_UNIT = new RegExp(
  `(?<![\\w.])(\\d+(?:[.,]\\d+)?)\\s?(${UNITS.map((u) => escapeRe(u)).join("|")})(?![A-Za-z])`,
  "giu",
);
const STATUS_RES = STATUS_WORDS.map((w) => ({
  word: w,
  re: new RegExp(
    /^[A-Za-z]/u.test(w)
      ? `(?<![A-Za-z])${escapeRe(w)}(?![A-Za-z])`
      : escapeRe(w),
    "iu",
  ),
}));
const MARKUP = /\.(md|toml)$/iu;
const MAX_TEXT = 200;
const SENTENCE = /.+?(?:[。！？]|[.!?](?=\s|$)|$)/gu;
const GUARD = ""; // protects spaces inside a backticked span while tokenizing

// Words that never name a subject. Particles are handled by splitting CJK tokens.
const STOP = new Set(
  (
    "the a an is are was were be been being of at in on within after before every each per than " +
    "about approximately over under up to by for and or default defaults max min maximum minimum " +
    "least most only currently not no with from as it its this that these those then if when has " +
    "have uses use set sets now also still 約 最大 最小 最長 最短 既定 デフォルト 毎 およそ おおよそ " +
    "現在 まだ また すでに 以下 以上 以内 以外 次 上記 下記"
  ).split(/\s+/u),
);
const LABELS = new Set(
  "note example warning tip important caution see usage 注 注意 例 備考 参考 警告".split(
    " ",
  ),
);

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

// The headword a line contributes, if any: a heading below the title, or the first cell of a
// table body row.
function headwordAt(lines: readonly string[], i: number): string | undefined {
  const line = lines[i] ?? "";
  const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/u.exec(line);
  if (heading?.[2] !== undefined)
    return heading[1] === "#" ? undefined : cleanTerm(heading[2]);
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

function literalRe(text: string): RegExp {
  const left = /^[A-Za-z]/u.test(text) ? "(?<![A-Za-z])" : "";
  const right = /[A-Za-z]$/u.test(text) ? "(?![A-Za-z])" : "";
  return new RegExp(left + escapeRe(text) + right, "iu");
}

function literalMatcher(text: string): (line: string) => boolean {
  const re = literalRe(text);
  return (line) => re.test(line);
}

// ---------------------------------------------------------------------------------------
// Subjects

const normalize = (s: string): string =>
  s.replaceAll(/[`*]/gu, "").replaceAll(/\s+/gu, " ").trim().toLowerCase();

// Content words of a phrase, in order: split on spaces and punctuation, CJK words also on
// particles, minus stop words, bare numbers and single Latin characters.
function tokens(phrase: string): string[] {
  const guarded = phrase.replaceAll(/`[^`\n]*`/gu, (m) =>
    m.replaceAll(/\s+/gu, GUARD),
  );
  return guarded
    .split(/[\s,;、。，．（）()「」『』|=<>[\]{}"'“”!?！？]+/u)
    .flatMap((t) =>
      /[\p{sc=Han}\p{sc=Katakana}\p{sc=Hiragana}]/u.test(t)
        ? t.split(/[はがをにでのもとへや]/u)
        : [t],
    )
    .map((t) =>
      t
        .replaceAll(/[`*]/gu, "")
        .replaceAll(GUARD, " ")
        .replace(/[.:-]+$/u, "")
        .toLowerCase(),
    )
    .filter(
      (t) =>
        t !== "" &&
        !STOP.has(t) &&
        !/^\d+(?:[.,]\d+)?$/u.test(t) &&
        !/^[\p{sc=Hiragana}ー]+$/u.test(t) &&
        !(t.length === 1 && /[a-z0-9]/u.test(t)),
    );
}

const lastWords = (phrase: string, n: number): string | undefined => {
  const words = tokens(phrase).slice(-n);
  return words.length === 0 ? undefined : words.join(" ");
};

const firstWords = (phrase: string, n: number): string | undefined => {
  const words = tokens(phrase).slice(0, n);
  return words.length === 0 ? undefined : words.join(" ");
};

function lastBackticked(phrase: string): string | undefined {
  const spans = [...phrase.matchAll(/`([^`\n]+)`/gu)];
  return spans.at(-1)?.[1];
}

function firstBackticked(phrase: string): string | undefined {
  return /`([^`\n]+)`/u.exec(phrase)?.[1];
}

function statusSubject(
  sentence: string,
  at: number,
  length: number,
): string | undefined {
  const before = sentence.slice(0, at);
  const after = sentence.slice(at + length);
  return (
    lastBackticked(before) ??
    lastWords(before, 2) ??
    firstBackticked(after) ??
    firstWords(after, 2)
  );
}

// The term a sentence defines, if it has a definition shape.
function definitionSubject(sentence: string): string | undefined {
  const s = sentence.trim().replace(/^(?:\*\*|__)/u, "");
  const head =
    /^(.{1,60}?)とは/u.exec(s)?.[1] ??
    /^(.{1,60}?)は[^。]{0,120}?(?:です|である|をいう|を指す|のこと)/u.exec(
      s,
    )?.[1] ??
    /^(?:(?:an?|the)\s+)?(.{1,60}?)\s+(?:is|are|means|refers to)\s+(?:an?|the|one|any)\b/iu.exec(
      s,
    )?.[1];
  if (head !== undefined) return lastWords(head, 3);
  const colon = /^([^\s:：`/][^:：/]{0,40}?)\s*[:：]\s*\S/u.exec(s)?.[1];
  if (
    colon === undefined ||
    LABELS.has(colon.replaceAll("*", "").toLowerCase())
  )
    return undefined;
  return lastWords(colon, 3);
}

// ---------------------------------------------------------------------------------------
// Statements

interface Entry {
  readonly subject: string;
  readonly kind: StatementKind;
  readonly offset: number; // offset of the trigger inside the unit text
}

// Glossary terms (headword, and the alias in parentheses) used to anchor statements.
interface TermEntry {
  readonly primary: string;
  readonly re: RegExp;
}

export interface Ctx {
  readonly terms: readonly TermEntry[];
}

const aliasOf = (head: string): RegExpExecArray | null =>
  /^(.*?)\s*[（(]([^）)]+)[）)]\s*$/u.exec(head);

// A headword "outer（alias）" is known by both names; its primary key is the outer one.
function termEntries(head: string): TermEntry[] {
  const alias = aliasOf(head);
  const outer = alias?.[1] ?? head;
  const primary = normalize(outer);
  return [outer, alias?.[2] ?? ""]
    .filter((name) => primary.length >= 2 && normalize(name).length >= 2)
    .map((name) => ({ primary, re: literalRe(name.trim()) }));
}

export function buildCtx(glossary: Source | undefined): Ctx {
  return {
    terms:
      glossary === undefined
        ? []
        : glossaryHeadwords(glossary.lines).flatMap((h) => termEntries(h)),
  };
}

function termsIn(text: string, ctx: Ctx): string[] {
  return [
    ...new Set(ctx.terms.filter((t) => t.re.test(text)).map((t) => t.primary)),
  ];
}

const GENERIC = new Set(
  "true false null none this that with from have will must should also into then when where which".split(
    " ",
  ),
);
const STATUS_LOWER = new Set(STATUS_WORDS.map((w) => w.toLowerCase()));

// Latin identifiers and words of a text: domain names that tie a status to its subject.
function latinAnchors(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/[A-Za-z][A-Za-z0-9_]{3,}/gu)]
        .map((m) => m[0].toLowerCase())
        .filter((w) => !STOP.has(w) && !GENERIC.has(w) && !STATUS_LOWER.has(w)),
    ),
  ];
}

interface UnitOptions {
  readonly definition: boolean; // prose: look for definition shapes and topic terms
  readonly anchors: boolean; // tie a status to the names around it
  readonly context: string; // the previous sentence of the paragraph
}

// Entries of one unit of prose or code (a sentence, or a code/TOML/heading line).
function proseEntries(text: string, ctx: Ctx, opts: UnitOptions): Entry[] {
  const out: Entry[] = [];
  const push = (
    subject: string | undefined,
    kind: StatementKind,
    offset: number,
  ): void => {
    if (subject !== undefined) out.push({ subject, kind, offset });
  };
  if (opts.definition) {
    push(definitionSubject(text), "definition", 0);
    const topic = /^(.{1,40}?)は/u.exec(text.trim())?.[1] ?? "";
    for (const term of termsIn(topic, ctx)) push(term, "definition", 0);
  }
  const mentioned = termsIn(text, ctx);
  let from = 0;
  for (const m of text.matchAll(NUMBER_WITH_UNIT)) {
    push(lastWords(text.slice(from, m.index), 2), "number", m.index);
    push(familyKey(m[2]), "number", m.index);
    for (const term of mentioned) push(term, "number", m.index);
    from = m.index + m[0].length;
  }
  const around = `${opts.context} ${text}`;
  for (const { word, re } of STATUS_RES) {
    const m = re.exec(text);
    if (m === null) continue;
    push(statusSubject(text, m.index, word.length), "status", m.index);
    if (!opts.anchors) continue;
    for (const a of [...termsIn(around, ctx), ...latinAnchors(around)])
      push(a, "status", m.index);
  }
  return out;
}

// Entries of a table body row; `glossaryRow` makes the first cell a defined term.
function rowEntries(row: string, glossaryRow: boolean, ctx: Ctx): Entry[] {
  const parts = row.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|");
  const label = cleanTerm(parts[0] ?? "");
  const out: Entry[] = [];
  const push = (subject: string | undefined, kind: StatementKind): void => {
    if (subject !== undefined) out.push({ subject, kind, offset: 0 });
  };
  const labelSubject = lastWords(label, 3);
  if (glossaryRow) push(normalize(aliasOf(label)?.[1] ?? label), "definition");
  else for (const term of termsIn(label, ctx)) push(term, "definition");
  const mentioned = termsIn(row, ctx);
  parts.slice(1).forEach((cell) => {
    let from = 0;
    for (const m of cell.matchAll(NUMBER_WITH_UNIT)) {
      push(lastWords(cell.slice(from, m.index), 2) ?? labelSubject, "number");
      push(familyKey(m[2]), "number");
      for (const term of mentioned) push(term, "number");
      from = m.index + m[0].length;
    }
    if (!STATUS_RES.some(({ re }) => re.test(cell))) return;
    push(labelSubject, "status");
    for (const a of [...mentioned, ...latinAnchors(row)]) push(a, "status");
  });
  return out;
}

interface Segment {
  readonly offset: number;
  readonly line: number;
}

function lineAt(segments: readonly Segment[], offset: number): number {
  let line = segments[0]?.line ?? 1;
  for (const seg of segments) if (seg.offset <= offset) line = seg.line;
  return line;
}

const clip = (s: string): string => s.trim().slice(0, MAX_TEXT);

export type Add = (
  subject: string,
  kind: StatementKind,
  statement: Statement,
) => void;

function flushParagraph(
  label: string,
  text: string,
  segments: readonly Segment[],
  add: Add,
  ctx: Ctx,
): void {
  let context = "";
  for (const m of text.matchAll(SENTENCE)) {
    const sentence = m[0];
    if (sentence.trim() === "") continue;
    const lead = sentence.length - sentence.trimStart().length;
    const opts = { definition: true, anchors: true, context };
    for (const e of proseEntries(sentence, ctx, opts)) {
      add(e.subject, e.kind, {
        file: label,
        line: lineAt(segments, m.index + Math.max(e.offset, lead)),
        text: clip(sentence),
      });
    }
    context = sentence;
  }
}

// Walks one source and reports every statement entry.
export function statementsOf(
  source: Source,
  isGlossary: boolean,
  add: Add,
  ctx: Ctx,
): void {
  const toml = /\.toml$/iu.test(source.label);
  let fenced = false;
  let text = "";
  let segments: Segment[] = [];
  const flush = (): void => {
    if (text !== "") flushParagraph(source.label, text, segments, add, ctx);
    text = "";
    segments = [];
  };
  const append = (piece: string, line: number): void => {
    if (text !== "") text += " ";
    segments.push({ offset: text.length, line });
    text += piece.trim();
  };
  const rowStatements = (
    entries: readonly Entry[],
    statement: Statement,
  ): void => {
    for (const e of entries) add(e.subject, e.kind, statement);
  };
  let tomlName: string | undefined;
  const lineStatements = (piece: string, line: number): void => {
    const statement = { file: source.label, line, text: clip(piece) };
    tomlName = toml
      ? (/^name\s*=\s*"([^"]+)"/u.exec(piece)?.[1] ?? tomlName)
      : undefined;
    // a TOML status belongs to the table's name, not to the word "status"
    if (tomlName !== undefined && /^status\s*=/u.test(piece)) {
      add(tomlName, "status", statement);
      return;
    }
    const opts = { definition: false, anchors: false, context: "" };
    for (const e of proseEntries(piece, ctx, opts))
      add(e.subject, e.kind, statement);
  };

  for (const [i, raw] of source.lines.entries()) {
    const line = i + 1;
    const next = source.lines[i + 1];
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/u.exec(raw);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/u.exec(raw);
    if (/^\s*(?:```|~~~)/u.test(raw)) {
      flush();
      fenced = !fenced;
    } else if (toml || fenced) {
      lineStatements(raw.trim(), line);
    } else if (raw.trim() === "") {
      flush();
    } else if (heading?.[1] !== undefined) {
      flush();
      lineStatements(heading[1], line);
    } else if (/^\s*\|/u.test(raw)) {
      flush();
      const skip =
        isSeparator(raw) || (next !== undefined && isSeparator(next));
      rowStatements(skip ? [] : rowEntries(raw, isGlossary, ctx), {
        file: source.label,
        line,
        text: clip(raw),
      });
    } else if (item?.[1] !== undefined) {
      flush();
      append(item[1], line);
    } else {
      append(raw.replace(/^\s*>\s?/u, ""), line);
    }
  }
  flush();
}

function byLocation(a: Statement, c: Statement): number {
  const byFile = Number(a.file > c.file) - Number(a.file < c.file);
  return byFile === 0 ? a.line - c.line : byFile;
}

interface Building {
  subject: string;
  readonly kinds: Set<StatementKind>;
  readonly statements: Map<string, Statement>;
}

export function scanSources(
  sources: readonly Source[],
  glossary?: Source,
): Group[] {
  const building = new Map<string, Building>();
  const addTo: Add = (subjectRaw, kind, statement) => {
    const key = normalize(subjectRaw);
    if (key.length < 2) return;
    const entry = building.get(key) ?? {
      subject: key,
      kinds: new Set<StatementKind>(),
      statements: new Map<string, Statement>(),
    };
    entry.kinds.add(kind);
    entry.statements.set(
      `${statement.file}:${statement.line}\u0000${statement.text}`,
      statement,
    );
    building.set(key, entry);
  };
  const ctx = buildCtx(glossary);
  for (const source of sources)
    statementsOf(source, source.label === glossary?.label, addTo, ctx);

  return [...building.values()]
    .flatMap((b) => {
      const statements = [...b.statements.values()].toSorted(byLocation);
      if (new Set(statements.map((s) => s.file)).size < 2) return [];
      const locations = new Set(statements.map((s) => `${s.file}:${s.line}`));
      return [
        {
          subject: b.subject,
          kinds: [...b.kinds],
          statements,
          locations: locations.size,
        },
      ];
    })
    .toSorted((a, b) => (a.subject < b.subject ? -1 : 1));
}

export function totalLocations(groups: readonly Group[]): number {
  return groups.reduce((sum, g) => sum + g.locations, 0);
}

// Contiguous groups, in order, each shard at most `max` locations; a group larger than `max`
// is alone in its shard.
export function packShards(groups: readonly Group[], max: number): Group[][] {
  const shards: Group[][] = [];
  let current: Group[] = [];
  let used = 0;
  for (const g of groups) {
    if (current.length > 0 && used + g.locations > max) {
      shards.push(current);
      current = [];
      used = 0;
    }
    current.push(g);
    used += g.locations;
  }
  if (current.length > 0) shards.push(current);
  return shards;
}

// Glossary headwords with every occurrence outside the glossary file; headwords that occur
// nowhere else are omitted.
export function termRows(
  sources: readonly Source[],
  glossary: Source,
): TermRow[] {
  const seen = new Set<string>();
  const rows: TermRow[] = [];
  for (const head of glossaryHeadwords(glossary.lines)) {
    const key = normalize(head);
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = literalMatcher(head);
    const occurrences = sources
      .filter((s) => s.label !== glossary.label)
      .flatMap((s) =>
        s.lines.flatMap((line, i) =>
          matches(line)
            ? [
                {
                  file: s.label,
                  line: i + 1,
                  text: line.trim().slice(0, MAX_TEXT),
                },
              ]
            : [],
        ),
      );
    if (occurrences.length > 0) rows.push({ term: head, occurrences });
  }
  return rows.toSorted((a, b) => (a.term < b.term ? -1 : 1));
}

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

export function renderTable(groups: readonly Group[]): string {
  if (groups.length === 0)
    return "No statement subject appears in two or more files.\n";
  const lines = [
    "| Subject | Kinds | Locations | Statements (file:line — text) |",
    "| --- | --- | --- | --- |",
  ];
  for (const g of groups) {
    const statements = g.statements
      .map((s) => `${s.file}:${s.line} — ${escapeCell(s.text)}`)
      .join("<br>");
    lines.push(
      `| ${escapeCell(g.subject)} | ${g.kinds.join(", ")} | ${g.locations} | ${statements} |`,
    );
  }
  return lines.join("\n") + "\n";
}

export function renderTerms(rows: readonly TermRow[]): string {
  if (rows.length === 0)
    return "No glossary headword occurs outside the glossary.\n";
  const lines = [
    "| Term | Count | Occurrences (file:line — line text) |",
    "| --- | --- | --- |",
  ];
  for (const row of rows) {
    const where = row.occurrences
      .map((o) => `${o.file}:${o.line} — ${escapeCell(o.text)}`)
      .join("<br>");
    lines.push(
      `| ${escapeCell(row.term)} | ${row.occurrences.length} | ${where} |`,
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

const positiveInt = (n: number): boolean => Number.isInteger(n) && n >= 1;

// Writes the shard plan to stderr and returns the table of the selected shard (or the whole).
function planShards(
  groups: readonly Group[],
  max: number,
  pick: number | undefined,
): Group[] | string {
  const shards = packShards(groups, max);
  const count = Math.max(1, shards.length);
  if (pick !== undefined && pick > count)
    return `--shard ${pick} exceeds the ${count} shard(s) at --max-locations ${max}`;
  process.stderr.write(
    `fact-scan: --max-locations ${max}: ${count} shard(s)\n`,
  );
  shards.forEach((shard, i) => {
    const n = shard.reduce((sum, g) => sum + g.locations, 0);
    const over =
      shard.length === 1 && n > max
        ? ` (single group "${shard[0]?.subject ?? ""}" exceeds the bound)`
        : "";
    process.stderr.write(
      `fact-scan: shard ${i + 1}/${count}: ${shard.length} groups, ${n} locations${over}\n`,
    );
  });
  return pick === undefined ? [...groups] : (shards[pick - 1] ?? []);
}

async function main(): Promise<number> {
  const parsed = cli({
    name: "fact-scan",
    parameters: ["[doc-dir]"],
    flags: {
      glossary: {
        type: String,
        description: "Glossary file (table headwords and headings)",
      },
      terms: {
        type: Boolean,
        description:
          "Print every file:line of each glossary headword (needs --glossary) instead of statements",
      },
      maxLocations: {
        type: Number,
        description:
          "Pack contiguous groups into shards of at most this many locations; plan on stderr",
      },
      shard: {
        type: Number,
        description: "With --max-locations, print only shard k (1-based)",
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

  const { glossary: glossaryFlag, terms, maxLocations, shard } = parsed.flags;
  if (maxLocations !== undefined && !positiveInt(maxLocations))
    return usage("--max-locations expects an integer of at least 1");
  if (shard !== undefined && !positiveInt(shard))
    return usage(
      "--shard expects a shard number k >= 1 (k/n was replaced by --max-locations)",
    );
  if (shard !== undefined && maxLocations === undefined)
    return usage("--shard needs --max-locations");
  if (terms === true && glossaryFlag === undefined)
    return usage("--terms needs --glossary");
  if (terms === true && maxLocations !== undefined)
    return usage("--terms cannot be combined with --max-locations");

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
    loadInputs(root, listed.value, glossaryFlag),
  )();
  if (loaded.isErr())
    return fail(`cannot read input: ${messageOf(loaded.error)}`);

  if (terms === true && loaded.value.glossary !== undefined) {
    const rows = termRows(loaded.value.sources, loaded.value.glossary);
    const n = rows.reduce((sum, r) => sum + r.occurrences.length, 0);
    process.stderr.write(`fact-scan: ${rows.length} terms, ${n} locations\n`);
    process.stdout.write(renderTerms(rows));
    return 0;
  }

  const groups = scanSources(loaded.value.sources, loaded.value.glossary);
  process.stderr.write(
    `fact-scan: ${groups.length} groups, ${totalLocations(groups)} locations\n`,
  );
  if (maxLocations === undefined) {
    process.stdout.write(renderTable(groups));
    return 0;
  }
  const chosen = planShards(groups, maxLocations, shard);
  if (typeof chosen === "string") return usage(chosen);
  process.stdout.write(renderTable(chosen));
  return 0;
}

function usage(message: string): number {
  process.stderr.write(
    `fact-scan: ${message}\nusage: bun fact-scan.ts <doc-dir> [--glossary <file>] [--max-locations <m> [--shard <k>]] | [--terms]\n`,
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
