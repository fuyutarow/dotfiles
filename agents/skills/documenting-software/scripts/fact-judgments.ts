// fact-judgments.ts — validates the judgment record of check F (fact consistency) in
// documenting-software, so F cannot be reported as done while scan rows are unjudged.
//
// MECHANICAL ONLY. It does not decide whether a verdict is right. It checks that every scan row
// carries a complete, quoted judgment, that each quote really occurs at the cited file:line, and
// that no location was given two different owners for the same fact.
//
// Judgment table (Markdown, one row per judged location), nine columns:
//   row term | fact | scope | owner (file:line) | location (file:line) | verdict | quote of owner | quote of location | context
// verdict is match, mismatch, qualifier-omitted or to-T (a difference of sense for one word, routed to
// check T; counted and listed, never a failure). scope is "same" or "differs: ..."; a mismatch whose scope
// differs is invalid. The row term is a term of the scan table, or
// "(hand)" for a fact found by the hand pass (hand rows are validated but are not scan rows).
// A scan row (one statement group) is judged when every one of its locations is, in a complete judgment row for that
// term, the judged location or the owner. A complete row has a verdict, file:line on both sides and
// a non-empty quote on both sides that occurs (whitespace-normalised; "…" or "..." elide) on that line.
// context is file:start-end (or file:line): the range of the location's file the judge opened before judging
// (its section, every row of its table, or the enclosing TOML table). It must name the location's file, contain
// the location line, and both its end lines must be readable. The validator checks that the range was given and
// is real; it cannot check that the range is the whole section.
//
// Usage:  bun scripts/fact-judgments.ts --scan <scan-output> --docs <doc-dir>
//             [--glossary <file>] [--closed] <judgment-file>...
// Exit:   0 = judged = total, every row valid, no owner conflict (and, with --closed, no mismatch)
//         1 = an unjudged scan row, an invalid judgment row, an owner conflict, or (--closed) a
//             remaining mismatch; also Cleye's unknown-flag exit
//         2 = usage error or unreadable input

import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { cli } from "cleye";
import { Result } from "better-result";

export const VERDICTS = [
  "match",
  "mismatch",
  "qualifier-omitted",
  "to-T",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const HAND_TERM = "(hand)";
const COLUMNS = 9;
const MIN_QUOTE = 3;
const LOCATION = /^\S+:\d+$/u;
const CONTEXT = /^(\S+):(\d+)(?:-(\d+))?$/u;

export interface ScanRow {
  readonly term: string;
  readonly locations: readonly {
    readonly ref: string;
    readonly text: string;
  }[];
}

export interface Judgment {
  readonly file: string;
  readonly line: number;
  readonly term: string;
  readonly fact: string;
  readonly scope: string;
  readonly owner: string;
  readonly location: string;
  readonly verdict: string;
  readonly ownerQuote: string;
  readonly locationQuote: string;
  readonly context: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const squash = (s: string): string => s.replaceAll(/\s+/gu, " ").trim();
const key = (s: string): string => squash(s).toLowerCase();

// Split a Markdown table row on unescaped pipes and unescape `\|` in the cells.
export function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return body.split(/(?<!\\)\|/u).map((c) => c.replaceAll("\\|", "|").trim());
}

function isTableRow(line: string): boolean {
  return /^\s*\|/u.test(line);
}

function isSeparator(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/u.test(line) && line.includes("-");
}

// The scan table printed by fact-scan.ts, one statement group per row:
//   | Subject | Kinds | Locations (count) | file:line — statement<br>file:line — statement |
// (the --terms table has three columns and is not a scan table).
export function parseScan(markdown: string): ScanRow[] {
  const rows: ScanRow[] = [];
  for (const line of markdown.split(/\r?\n/u)) {
    if (!isTableRow(line) || isSeparator(line)) continue;
    const cells = splitRow(line);
    const [term, kinds, , locations] = cells;
    if (cells.length !== 4 || term === undefined || locations === undefined)
      continue;
    if (term === "Subject" && kinds === "Kinds") continue;
    const parsed = locations.split("<br>").flatMap((entry) => {
      const m = /^(.+?:\d+) — (.*)$/u.exec(entry);
      return m?.[1] === undefined ? [] : [{ ref: m[1], text: m[2] ?? "" }];
    });
    rows.push({ term, locations: parsed });
  }
  return rows;
}

// Judgment rows; a row with the wrong column count is kept with undefined fields as `malformed`.
export interface ParsedFile {
  readonly judgments: Judgment[];
  readonly malformed: { file: string; line: number; reason: string }[];
}

export function parseJudgments(label: string, markdown: string): ParsedFile {
  const judgments: Judgment[] = [];
  const malformed: ParsedFile["malformed"] = [];
  markdown.split(/\r?\n/u).forEach((text, i) => {
    if (!isTableRow(text) || isSeparator(text)) return;
    const cells = splitRow(text);
    if (key(cells[0] ?? "") === "row term") return; // header row
    if (cells.length !== COLUMNS) {
      malformed.push({
        file: label,
        line: i + 1,
        reason: `expected ${COLUMNS} columns, found ${cells.length}`,
      });
      return;
    }
    const [
      term = "",
      fact = "",
      scope = "",
      owner = "",
      location = "",
      verdict = "",
      ownerQuote = "",
      locationQuote = "",
      context = "",
    ] = cells;
    judgments.push({
      file: label,
      line: i + 1,
      term,
      fact,
      scope,
      owner,
      location,
      verdict,
      ownerQuote,
      locationQuote,
      context,
    });
  });
  return { judgments, malformed };
}

// The canonical spelling of a verdict cell (case-insensitive), or undefined when it is not one.
export function verdictOf(raw: string): Verdict | undefined {
  return VERDICTS.find((v) => v.toLowerCase() === raw.trim().toLowerCase());
}

// Quote forms to try: as written, without wrapping quote marks, without wrapping backticks.
function quoteForms(quote: string): string[] {
  const q = squash(quote);
  const forms = [q];
  const strip = (open: string, close: string): void => {
    if (q.length > 2 && q.startsWith(open) && q.endsWith(close))
      forms.push(q.slice(open.length, q.length - close.length).trim());
  };
  strip('"', '"');
  strip("“", "”");
  strip("`", "`");
  strip("「", "」");
  return forms;
}

// True when every elision-separated piece of the quote occurs, in order, in the line.
export function quoteOccurs(quote: string, lineText: string): boolean {
  const line = squash(lineText);
  return quoteForms(quote).some((form) => {
    const pieces = form
      .split(/…|\.\.\./u)
      .map((p) => p.trim())
      .filter((p) => p !== "");
    if (pieces.length === 0) return false;
    let from = 0;
    for (const piece of pieces) {
      const at = line.indexOf(piece, from);
      if (at < 0) return false;
      from = at + piece.length;
    }
    return true;
  });
}

function realQuote(quote: string): boolean {
  const bare = squash(quote).replaceAll(/[…"“”`「」.]|\.\.\./gu, "");
  return bare.replaceAll(/\s/gu, "").length >= MIN_QUOTE;
}

export type LineLookup = (ref: string) => string | undefined;

// Reasons a judgment row is incomplete; empty when it is complete and its quotes verify.
export function problemsOf(j: Judgment, lookup: LineLookup): string[] {
  const out: string[] = [];
  const verdict = verdictOf(j.verdict);
  if (verdict === undefined)
    out.push(`verdict "${j.verdict}" is not ${VERDICTS.join(" / ")}`);
  if (j.fact === "") out.push("fact is empty");
  if (j.scope === "") out.push("scope is empty");
  else if (verdict === "mismatch" && /^differs\b/iu.test(j.scope))
    out.push(
      `verdict mismatch with scope "${j.scope}": scopes that differ are not a mismatch`,
    );
  const sides = [
    ["owner", j.owner, j.ownerQuote],
    ["location", j.location, j.locationQuote],
  ] as const;
  for (const [name, ref, quote] of sides) {
    if (!LOCATION.test(ref)) {
      out.push(`${name} "${ref}" is not file:line`);
      continue;
    }
    if (!realQuote(quote)) {
      out.push(`${name} quote missing`);
      continue;
    }
    const text = lookup(ref);
    if (text === undefined) out.push(`${name} ${ref} cannot be read`);
    else if (!quoteOccurs(quote, text))
      out.push(`${name} quote does not occur at ${ref}`);
  }
  out.push(...contextProblems(j, lookup));
  return out;
}

// The location's context range: given, in the location's file, containing the location line, and readable at
// both ends. A row that opened no context, or opened a range that does not contain its own location, is incomplete.
function contextProblems(j: Judgment, lookup: LineLookup): string[] {
  if (j.context.trim() === "") return ["context missing"];
  const m = CONTEXT.exec(squash(j.context));
  if (m === null) return [`context "${j.context}" is not file:start-end`];
  const [, file = "", startRaw = "", endRaw = startRaw] = m;
  const start = Number(startRaw);
  const end = Number(endRaw);
  const loc = /^(\S+):(\d+)$/u.exec(j.location);
  if (loc === null) return []; // reported by the location check above
  const [, locFile = "", locLine = ""] = loc;
  const out: string[] = [];
  if (file !== locFile)
    out.push(`context file ${file} is not the location file ${locFile}`);
  if (start < 1 || end < start)
    out.push(`context ${j.context} is an empty or inverted range`);
  else if (Number(locLine) < start || Number(locLine) > end)
    out.push(`context ${j.context} does not contain location line ${locLine}`);
  else if (
    lookup(`${file}:${start}`) === undefined ||
    lookup(`${file}:${end}`) === undefined
  )
    out.push(`context ${j.context} cannot be read`);
  return out;
}

export interface Report {
  readonly total: number;
  readonly judged: number;
  readonly unjudged: { term: string; missing: string[] }[];
  readonly invalid: { where: string; problems: string[] }[];
  readonly conflicts: { location: string; fact: string; owners: string[] }[];
  readonly mismatches: Judgment[];
  readonly toT: Judgment[];
  readonly handRows: number;
  readonly judgmentRows: number;
  readonly unknownTerms: string[];
}

export function validate(
  scan: readonly ScanRow[],
  files: readonly ParsedFile[],
  lookup: LineLookup,
): Report {
  const all = files.flatMap((f) => f.judgments);
  const invalid: Report["invalid"] = files.flatMap((f) =>
    f.malformed.map((m) => ({
      where: `${m.file}:${m.line}`,
      problems: [m.reason],
    })),
  );
  const complete: Judgment[] = [];
  for (const j of all) {
    const problems = problemsOf(j, lookup);
    if (problems.length > 0)
      invalid.push({ where: `${j.file}:${j.line} (${j.term})`, problems });
    else complete.push(j);
  }

  const scanTerms = new Set(scan.map((r) => key(r.term)));
  const unknownTerms = [
    ...new Set(
      all
        .filter((j) => j.term !== HAND_TERM && !scanTerms.has(key(j.term)))
        .map((j) => j.term),
    ),
  ];
  for (const term of unknownTerms)
    invalid.push({
      where: `term "${term}"`,
      problems: ["is not a row of the scan table"],
    });

  const unjudged = scan.flatMap((row) => {
    const covered = new Set(
      complete
        .filter((j) => key(j.term) === key(row.term))
        .flatMap((j) => [j.location, j.owner]),
    );
    const missing = row.locations
      .map((l) => l.ref)
      .filter((ref) => !covered.has(ref));
    return missing.length > 0 || row.locations.length === 0
      ? [{ term: row.term, missing }]
      : [];
  });

  // Owner conflicts: one location, one fact, two owners — across rows and files.
  const owners = new Map<
    string,
    { location: string; fact: string; set: Set<string> }
  >();
  for (const j of complete) {
    const k = `${j.location}\u0000${key(j.fact)}`;
    const entry = owners.get(k) ?? {
      location: j.location,
      fact: j.fact,
      set: new Set<string>(),
    };
    entry.set.add(j.owner);
    owners.set(k, entry);
  }
  const conflicts = [...owners.values()]
    .filter((e) => e.set.size > 1)
    .map((e) => ({ location: e.location, fact: e.fact, owners: [...e.set] }));

  return {
    total: scan.length,
    judged: scan.length - unjudged.length,
    unjudged,
    invalid,
    conflicts,
    mismatches: complete.filter((j) => verdictOf(j.verdict) === "mismatch"),
    toT: complete.filter((j) => verdictOf(j.verdict) === "to-T"),
    handRows: complete.filter((j) => j.term === HAND_TERM).length,
    judgmentRows: all.length,
    unknownTerms,
  };
}

export function passes(report: Report, closed: boolean): boolean {
  return (
    report.unjudged.length === 0 &&
    report.invalid.length === 0 &&
    report.conflicts.length === 0 &&
    (!closed || report.mismatches.length === 0)
  );
}

export function renderReport(report: Report, closed: boolean): string {
  const out: string[] = [
    `judged ${report.judged}/${report.total} scan rows; ${report.judgmentRows} judgment rows (${report.handRows} hand)`,
    `to-T rows routed to T: ${report.toT.length}`,
  ];
  const section = (title: string, items: readonly string[]): void => {
    if (items.length === 0) return;
    out.push(`${title} (${items.length}):`, ...items.map((i) => `- ${i}`));
  };
  section(
    "unjudged rows",
    report.unjudged.map((u) =>
      u.missing.length === 0
        ? `${u.term}: no location in the scan row`
        : `${u.term}: no complete judgment for ${u.missing.join(", ")}`,
    ),
  );
  section(
    "invalid judgment rows",
    report.invalid.map((i) => `${i.where}: ${i.problems.join("; ")}`),
  );
  section(
    "owner conflicts",
    report.conflicts.map(
      (c) => `${c.location} fact "${c.fact}": owners ${c.owners.join(" vs ")}`,
    ),
  );
  section(
    "mismatch rows",
    report.mismatches.map(
      (m) => `${m.term} @ ${m.location} vs owner ${m.owner}: ${m.fact}`,
    ),
  );
  section(
    "to-T rows (sense differences, for check T)",
    report.toT.map(
      (t) => `${t.term} @ ${t.location} vs owner ${t.owner}: ${t.fact}`,
    ),
  );
  out.push(passes(report, closed) ? "PASS" : "FAIL");
  return out.join("\n") + "\n";
}

// Reads every file the judgments cite (inside the doc set, or the labelled glossary) before
// validation, so the line lookup stays synchronous.
const GLOSSARY_PREFIX = "glossary:";

function glossaryPath(
  glossary: string | undefined,
  label: string,
): string | undefined {
  return glossary !== undefined &&
    basename(glossary) === label.slice(GLOSSARY_PREFIX.length)
    ? resolve(glossary)
    : undefined;
}

// A label's file inside the doc root; a label that escapes the root is unreadable on purpose.
function insidePath(root: string, label: string): string | undefined {
  const abs = resolve(root, label);
  const rel = relative(root, abs);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel)
    ? undefined
    : abs;
}

async function preloadCited(
  docs: string,
  glossary: string | undefined,
  files: readonly ParsedFile[],
): Promise<LineLookup> {
  const root = resolve(docs);
  const labels = new Set(
    files
      .flatMap((f) => f.judgments)
      .flatMap((j) => [j.owner, j.location, j.context])
      .flatMap((ref) => {
        const label = /^(.+):\d+(?:-\d+)?$/u.exec(ref)?.[1];
        return label === undefined ? [] : [label];
      }),
  );
  const lines = new Map<string, string[]>();
  for (const label of labels) {
    const path = label.startsWith(GLOSSARY_PREFIX)
      ? glossaryPath(glossary, label)
      : insidePath(root, label);
    const read =
      path === undefined
        ? undefined
        : await Result.tryPromise({
            try: () => readFile(path, "utf8"),
            catch: (e: unknown) => e,
          });
    if (read?.isOk() === true) lines.set(label, read.value.split(/\r?\n/u));
  }
  return (ref) => {
    const m = /^(.+):(\d+)$/u.exec(ref);
    return lines.get(m?.[1] ?? "")?.[Number(m?.[2]) - 1]; // no match: NaN index, no line
  };
}

// Cleye is the argv boundary: unknown flags fail, and a prototype flag is rejected before parsing.
let prototypeFlagSeen = false;
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
};

async function main(): Promise<number> {
  const parsed = cli({
    name: "fact-judgments",
    parameters: ["[judgment-files...]"],
    flags: {
      scan: {
        type: String,
        description:
          "Scan table printed by fact-scan.ts (whole set or one --max-locations shard)",
      },
      docs: {
        type: String,
        description:
          "The doc directory the scan ran over (quotes are checked in it)",
      },
      glossary: {
        type: String,
        description: "The --glossary file given to the scan, if any",
      },
      closed: {
        type: Boolean,
        description: "Also fail while any mismatch row remains",
      },
    },
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  });
  if (prototypeFlagSeen) return usage("unknown option --__proto__");
  const { scan, docs, glossary, closed } = parsed.flags;
  if (scan === undefined) return usage("--scan is required");
  if (docs === undefined) return usage("--docs is required");
  if (parsed._.length === 0)
    return usage("at least one judgment file is required");

  const scanText = await Result.tryPromise({
    try: () => readFile(scan, "utf8"),
    catch: (e: unknown) => e,
  });
  if (scanText.isErr())
    return fail(`cannot read ${scan}: ${messageOf(scanText.error)}`);
  const files: ParsedFile[] = [];
  for (const path of parsed._) {
    const text = await Result.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: (e: unknown) => e,
    });
    if (text.isErr())
      return fail(`cannot read ${path}: ${messageOf(text.error)}`);
    files.push(parseJudgments(path, text.value));
  }

  const lookup = await preloadCited(docs, glossary, files);
  const report = validate(parseScan(scanText.value), files, lookup);
  process.stdout.write(renderReport(report, closed === true));
  return passes(report, closed === true) ? 0 : 1;
}

function usage(message: string): number {
  process.stderr.write(
    `fact-judgments: ${message}\nusage: bun fact-judgments.ts --scan <scan-output> --docs <doc-dir> [--glossary <file>] [--closed] <judgment-file>...\n`,
  );
  return 2;
}

function fail(message: string): number {
  process.stderr.write(`fact-judgments: ${message}\n`);
  return 2;
}

if (import.meta.main) {
  process.exit(await main());
}
