// term-scan.ts — listing for check T (term mapping) in documenting-software.
//
// MECHANICAL ONLY. It lists what T judges and cuts the listing into judgment units.
//   Glossary terms: every glossary headword with an occurrence. Body uses are grouped per (term, file):
//   one unit with the occurrence count and up to two representative lines.
//   Structural and convention occurrences: one unit per occurrence, for every name that has one.
//   Variant clusters: names that share a normalized key or a head word (the last part of a multi-part
//   name, equal to a bare name) are one cluster, one unit, listing each variant's files and counts.
//   Non-glossary names get no body groups; their body uses appear only inside a cluster.
//
// Occurrence kinds: body (a non-heading page line), title (first level-1 heading of a Markdown page, or a
// TOML `title = "..."` line), heading (other headings), label (a quoted string of --labels; paths and URLs
// skipped), convention (every line of a --convention file).
//
// Normalized key: katakana loanwords map to Latin (a small table), CamelCase is split, case is folded, and
// spaces, hyphens, underscores, slashes and dots are removed. A Latin headword matches case-insensitively as a
// whole word; a non-Latin headword matches as a substring. Kanji-only names are not candidates: their
// boundaries need a segmenter this scan does not have.
//
// Usage:  bun scripts/term-scan.ts <doc-dir> [--glossary <file>] [--labels <file>]
//             [--convention <file-or-dir>]... [--max-units <m> [--shard <k>]]
// Exit:   0 = listing printed (a header-only table is a valid result)
//         2 = usage error, or an input is unreadable or holds no pages
//         1 = unknown flag (Cleye's strictFlags exit)

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { Result } from "better-result";

export type OccurrenceKind =
  | "body"
  | "title"
  | "heading"
  | "label"
  | "convention";

export interface Unit {
  readonly kind: OccurrenceKind;
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

// A judgment unit: a glossary body group, one structural or convention occurrence, or one variant cluster.
export interface JudgmentUnit {
  readonly term: string;
  readonly entry: "glossary" | "no-entry" | "cluster";
  readonly kind: OccurrenceKind | "cluster";
  readonly file: string;
  readonly line: number;
  readonly count: number;
  readonly reps: readonly Unit[];
  readonly detail?: string;
}

export interface Breakdown {
  readonly glossary: number;
  readonly labelled: number;
  readonly structural: number;
  readonly convention: number;
  readonly clusters: number;
}

interface ConventionFile {
  readonly root: string;
  readonly path: string;
}

const PAGE = /\.(md|toml)$/iu;
const CONVENTION = /\.(md|mdx|txt|toml|ya?ml|json|ts|js)$/iu;
const MAX_TEXT = 200;
const MAX_DETAIL = 2000;
const REPS = 2;
const QUOTED = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`([^`]*)`/gu;
const LATIN_WORD = "[A-Za-z][A-Za-z0-9]*(?:[_/.\\-][A-Za-z0-9]+)*";
// Candidate names: a Latin word with separators, a two-word Latin phrase, kanji/katakana before a Latin word,
// and a katakana run.
const NAME_RES: readonly RegExp[] = [
  new RegExp(LATIN_WORD, "gu"),
  new RegExp(`${LATIN_WORD} ${LATIN_WORD}`, "gu"),
  /[\p{Script=Han}\p{Script=Katakana}]+ ?[A-Za-z][A-Za-z0-9]*/gu,
  /[\p{Script=Katakana}ー]{2,}/gu,
];
// English function words and markup tokens that never name a term.
const STOP = new Set(
  (
    "the a an and or for with this that from are is was be to of in on by at as it if not use see " +
    "can may will has have its all any one two md toml json http https ts js"
  ).split(" "),
);
// Loanword table for the normalized key (longest first).
const LOANWORDS: readonly (readonly [string, string])[] = [
  ["サーバー", "server"],
  ["サーバ", "server"],
  ["ネットワーク", "network"],
  ["キー", "key"],
  ["ポリシー", "policy"],
  ["レコード", "record"],
];

const isLatin = (s: string): boolean => /^[A-Za-z]/u.test(s);
const escapeRe = (s: string): string =>
  s.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const visible = (rel: string): boolean =>
  !rel.split(sep).some((part) => part.startsWith("."));
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
function withLoanwords(s: string): string {
  return LOANWORDS.reduce(
    (acc, [kana, latin]) => acc.replaceAll(kana, latin),
    s,
  );
}

export function normalizeKey(name: string): string {
  return withLoanwords(name)
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .replaceAll(/[\s\-_/.]+/gu, "");
}

// The head word of a multi-part name: its last part (CamelCase and separators split). Undefined for one part.
export function headOf(name: string): string | undefined {
  const parts = withLoanwords(name)
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[\s\-_/.]+/u)
    .filter((p) => p !== "");
  if (parts.length < 2) return undefined;
  return (parts.at(-1) ?? "").toLowerCase();
}

export function headwordsOf(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t.startsWith("|")) continue;
    const first = t.split("|")[1]?.trim().replaceAll("`", "") ?? "";
    if (first === "" || first === "Term" || /^:?-+:?$/u.test(first)) continue;
    if (!out.includes(first)) out.push(first);
  }
  return out;
}

export function pageUnits(label: string, lines: readonly string[]): Unit[] {
  const units: Unit[] = [];
  const toml = /\.toml$/iu.test(label);
  let titleSeen = false;
  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (text === "") return;
    const heading = /^(#{1,6})\s+\S/u.exec(text);
    if (heading !== null) {
      const kind: OccurrenceKind =
        heading[1]?.length === 1 && !titleSeen ? "title" : "heading";
      if (kind === "title") titleSeen = true;
      units.push({ kind, file: label, line: i + 1, text });
      return;
    }
    const kind: OccurrenceKind =
      toml && /^title\s*=/u.test(text) ? "title" : "body";
    units.push({ kind, file: label, line: i + 1, text });
  });
  return units;
}

export function labelUnits(label: string, lines: readonly string[]): Unit[] {
  const units: Unit[] = [];
  lines.forEach((raw, i) => {
    for (const m of raw.matchAll(QUOTED)) {
      const s = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (s === "" || /^[./]/u.test(s) || s.includes("://")) continue;
      units.push({ kind: "label", file: label, line: i + 1, text: s });
    }
  });
  return units;
}

export function conventionUnits(
  label: string,
  lines: readonly string[],
): Unit[] {
  const units: Unit[] = [];
  lines.forEach((raw, i) => {
    const text = raw.trim();
    if (text !== "")
      units.push({ kind: "convention", file: label, line: i + 1, text });
  });
  return units;
}

const isStop = (word: string): boolean => STOP.has(word.toLowerCase());

// Candidate names in one text, de-duplicated. Skips stop words and names equal to a glossary headword.
export function namesIn(text: string, headwords: readonly string[]): string[] {
  const raw = NAME_RES.flatMap((re) =>
    [...text.matchAll(re)].map((m) => m[0].trim()),
  );
  const kept = raw.filter(
    (name) =>
      /[A-Za-z\p{Script=Katakana}]/u.test(name) &&
      !name.split(" ").every((w) => isStop(w)) &&
      !headwords.some((h) => sameTerm(h, name)),
  );
  return [...new Set(kept)];
}

function headwordRe(h: string): RegExp {
  return isLatin(h)
    ? new RegExp(`(?<![A-Za-z0-9_])${escapeRe(h)}(?![A-Za-z0-9_])`, "iu")
    : new RegExp(escapeRe(h), "u");
}

const sameTerm = (headword: string, token: string): boolean =>
  isLatin(headword)
    ? headword.toLowerCase() === token.toLowerCase()
    : headword === token;

// Units per name: a glossary headword's units are its matches; any other name's are the units that contain it.
export function unitsByName(
  units: readonly Unit[],
  headwords: readonly string[],
): Map<string, Unit[]> {
  const byName = new Map<string, Unit[]>();
  const add = (name: string, u: Unit): void => {
    const list = byName.get(name) ?? [];
    if (!list.includes(u)) list.push(u);
    byName.set(name, list);
  };
  for (const u of units) {
    for (const name of namesIn(u.text, headwords)) add(name, u);
    for (const h of headwords.filter((x) => headwordRe(x).test(u.text)))
      add(h, u);
  }
  return byName;
}

// Union-find over names: equal normalized keys join; a multi-part name joins the bare name equal to its head word.
export function clusterNames(names: readonly string[]): string[][] {
  const parent = new Map(names.map((n) => [n, n]));
  const find = (n: string): string => {
    const p = parent.get(n) ?? n;
    if (p === n) return n;
    const root = find(p);
    parent.set(n, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const byKey = new Map<string, string>();
  const bareByLower = new Map<string, string>();
  for (const n of names) {
    if (headOf(n) === undefined) bareByLower.set(n.toLowerCase(), n);
  }
  for (const n of names) {
    const key = normalizeKey(n);
    const first = byKey.get(key);
    if (first === undefined) byKey.set(key, n);
    else union(first, n);
    // A single-token multi-part name (CoralbaseCore, move/core) and a kanji-or-katakana phrase before a Latin word
    // (鍵 server) join the bare name of their head word. A two-word Latin phrase (Move core) joins through its
    // key only, so that it does not pull in every bare word.
    const kanaPhrase = /^[\p{Script=Han}\p{Script=Katakana}]+ ?[A-Za-z]/u.test(
      n,
    );
    const head = !/\s/u.test(n) || kanaPhrase ? headOf(n) : undefined;
    const bare = head === undefined ? undefined : bareByLower.get(head);
    if (bare !== undefined) union(bare, n);
  }
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const root = find(n);
    groups.set(root, [...(groups.get(root) ?? []), n]);
  }
  // A group is a cluster only if two of its names differ beyond case: case-only variants are one spelling.
  return [...groups.values()].filter(
    (g) =>
      g.length >= 2 &&
      g.some((n) => n.toLowerCase() !== (g[0] ?? "").toLowerCase()),
  );
}

// One unit per (glossary term, file) for body text; one per other occurrence.
// withBody: body text is judged for this term (every glossary term; a non-glossary name only when it has a
// label, so that the label can be judged against the page that holds the same name).
function unitsOf(
  term: string,
  entry: "glossary" | "no-entry",
  units: readonly Unit[],
  withBody: boolean,
): JudgmentUnit[] {
  const bodyByFile = new Map<string, Unit[]>();
  for (const u of units.filter((x) => x.kind === "body")) {
    bodyByFile.set(u.file, [...(bodyByFile.get(u.file) ?? []), u]);
  }
  const emitted = new Set<string>();
  return units.flatMap((u): JudgmentUnit[] => {
    if (u.kind !== "body") {
      return [
        {
          term,
          entry,
          kind: u.kind,
          file: u.file,
          line: u.line,
          count: 1,
          reps: [u],
        },
      ];
    }
    if (!withBody || emitted.has(u.file)) return [];
    emitted.add(u.file);
    const group = bodyByFile.get(u.file) ?? [];
    return [
      {
        term,
        entry,
        kind: "body",
        file: u.file,
        line: group[0]?.line ?? u.line,
        count: group.length,
        reps: group.slice(0, REPS),
      },
    ];
  });
}

const fileCounts = (units: readonly Unit[]): string => {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.file, (counts.get(u.file) ?? 0) + 1);
  return [...counts.keys()]
    .toSorted()
    .map((file) => `${file}×${counts.get(file) ?? 0}`)
    .join(", ");
};

function clusterUnit(
  names: readonly string[],
  byName: Map<string, Unit[]>,
): JudgmentUnit {
  const variants = names
    .map((n) => ({ n, units: byName.get(n) ?? [] }))
    .toSorted((a, b) => {
      const byCount = b.units.length - a.units.length;
      return byCount === 0 ? a.n.localeCompare(b.n) : byCount;
    });
  const total = variants.reduce((s, v) => s + v.units.length, 0);
  const detail = variants
    .map((v) => `${v.n} (${fileCounts(v.units)})`)
    .join("; ");
  return {
    term: variants.map((v) => v.n).join(" / "),
    entry: "cluster",
    kind: "cluster",
    file: "",
    line: 0,
    count: total,
    reps: [],
    detail,
  };
}

// The judgment units of the whole listing, and the breakdown for stderr.
export function judgmentUnits(
  headwords: readonly string[],
  byName: Map<string, Unit[]>,
): { units: JudgmentUnit[]; breakdown: Breakdown } {
  const units: JudgmentUnit[] = [];
  for (const h of headwords) {
    units.push(...unitsOf(h, "glossary", byName.get(h) ?? [], true));
  }
  const others = [...byName.keys()]
    .filter((n) => !headwords.includes(n))
    .toSorted();
  const groups = clusterNames([...headwords, ...others]);
  const members = new Set(groups.flat());
  for (const n of others) {
    // Title, heading and convention rows are kept for cluster members only: a lone Latin word in a heading is
    // not a naming conflict. Label rows are kept for every name, since a label is judged against the content.
    const all = byName.get(n) ?? [];
    const labelled = all.some((u) => u.kind === "label");
    const list = all.filter(
      (u) =>
        u.kind === "label" ||
        (members.has(n) && u.kind !== "body") ||
        (labelled && u.kind === "body"),
    );
    units.push(...unitsOf(n, "no-entry", list, labelled));
  }
  const clusters = groups.map((g) => clusterUnit(g, byName));
  units.push(...clusters);
  const body = units.filter((u) => u.kind === "body");
  const breakdown: Breakdown = {
    glossary: body.filter((u) => u.entry === "glossary").length,
    labelled: body.filter((u) => u.entry === "no-entry").length,
    structural: units.filter(
      (u) => u.kind === "label" || u.kind === "title" || u.kind === "heading",
    ).length,
    convention: units.filter((u) => u.kind === "convention").length,
    clusters: clusters.length,
  };
  return { units, breakdown };
}

const cell = (s: string, max = MAX_TEXT): string => {
  const flat = s.replaceAll(/\s+/gu, " ").trim().replaceAll("|", "\\|");
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function renderTable(
  units: readonly JudgmentUnit[],
  first: number,
): string {
  const rows = [
    "| # | Term | Entry | Kind | Location | Count | Text |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  units.forEach((u, i) => {
    if (u.kind === "cluster") {
      rows.push(
        `| ${first + i} | ${cell(u.term)} | cluster | cluster | - | ${u.count} | ${cell(u.detail ?? "", MAX_DETAIL)} |`,
      );
      return;
    }
    const location = u.kind === "body" ? u.file : `${u.file}:${u.line}`;
    const text = u.reps.map((r) => `L${r.line}: ${r.text}`).join(" / ");
    rows.push(
      `| ${first + i} | ${cell(u.term)} | ${u.entry} | ${u.kind} | ${location} | ${u.count} | ${cell(text)} |`,
    );
  });
  return `${rows.join("\n")}\n`;
}

async function listFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries
    .filter((rel) => pattern.test(rel) && visible(rel))
    .toSorted()
    .map((rel) => join(dir, rel));
}

const labelOf = (root: string, path: string): string =>
  relative(root, path).split(sep).join("/");

const readLines = async (path: string): Promise<string[]> =>
  (await readFile(path, "utf8")).split(/\r?\n/u);

async function conventionFilesOf(
  conventions: readonly string[],
): Promise<ConventionFile[]> {
  const groups = await Promise.all(
    conventions.map(async (c): Promise<ConventionFile[]> => {
      const abs = resolve(c);
      if (!(await stat(abs)).isDirectory()) {
        return [{ root: resolve(abs, ".."), path: abs }];
      }
      return (await listFiles(abs, CONVENTION)).map((path) => ({
        root: abs,
        path,
      }));
    }),
  );
  return groups.flat();
}

interface Inputs {
  readonly units: Unit[];
  readonly headwords: string[];
}

// Reads every input. A failed check or read is returned as an err value; the entry point prints it and exits 2.
async function collect(
  docdir: string,
  glossary: string | undefined,
  labels: string | undefined,
  conventions: readonly string[],
): Promise<Result<Inputs, string>> {
  const root = resolve(docdir);
  const info = await Result.tryPromise({
    try: () => stat(root),
    catch: (e: unknown) => e,
  });
  if (info.isErr()) return Result.err(`${docdir}: ${messageOf(info.error)}`);
  if (!info.value.isDirectory())
    return Result.err(`${docdir} is not a directory`);

  const listed = await Result.tryPromise({
    try: () => listFiles(root, PAGE),
    catch: (e: unknown) => e,
  });
  if (listed.isErr()) return Result.err(messageOf(listed.error));
  const conventionFiles = await Result.tryPromise({
    try: () => conventionFilesOf(conventions),
    catch: (e: unknown) => e,
  });
  if (conventionFiles.isErr())
    return Result.err(messageOf(conventionFiles.error));

  const glossaryAbs = glossary === undefined ? undefined : resolve(glossary);
  const labelsAbs = labels === undefined ? undefined : resolve(labels);
  const excluded = new Set(
    [
      glossaryAbs,
      labelsAbs,
      ...conventionFiles.value.map((c) => c.path),
    ].flatMap((p) => (p === undefined ? [] : [p])),
  );
  const pages = listed.value.filter((p) => !excluded.has(resolve(p)));
  if (pages.length === 0)
    return Result.err(`no Markdown or TOML pages under ${docdir}`);

  const read = await Result.tryPromise({
    try: () =>
      readInputs(root, pages, glossaryAbs, labelsAbs, conventionFiles.value),
    catch: (e: unknown) => e,
  });
  if (read.isErr()) return Result.err(messageOf(read.error));
  return Result.ok(read.value);
}

async function readInputs(
  root: string,
  pages: readonly string[],
  glossaryAbs: string | undefined,
  labelsAbs: string | undefined,
  conventionFiles: readonly ConventionFile[],
): Promise<Inputs> {
  const units: Unit[] = [];
  for (const path of pages) {
    units.push(...pageUnits(labelOf(root, path), await readLines(path)));
  }
  if (labelsAbs !== undefined) {
    units.push(...labelUnits(basename(labelsAbs), await readLines(labelsAbs)));
  }
  for (const { root: base, path } of conventionFiles) {
    const label = `${basename(base)}/${labelOf(base, path)}`;
    units.push(...conventionUnits(label, await readLines(path)));
  }
  const headwords =
    glossaryAbs === undefined ? [] : headwordsOf(await readLines(glossaryAbs));
  return { units, headwords };
}

// Cleye is the argv boundary: unknown flags fail, and a prototype flag is rejected before parsing.
let prototypeFlagSeen = false;
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") prototypeFlagSeen = true;
};

const positiveInt = (n: number): boolean => Number.isInteger(n) && n >= 1;

// Writes the shard plan to stderr and returns the selected shard's units with the index of its first unit.
function planShards(
  units: readonly JudgmentUnit[],
  max: number,
  pick: number | undefined,
): { units: JudgmentUnit[]; first: number } | string {
  const count = Math.max(1, Math.ceil(units.length / max));
  if (pick !== undefined && pick > count)
    return `--shard ${pick} exceeds the ${count} shard(s) at --max-units ${max}`;
  process.stderr.write(`term-scan: --max-units ${max}: ${count} shard(s)\n`);
  const sizes = Array.from({ length: count }, (_, i) =>
    Math.min(max, units.length - i * max),
  );
  process.stderr.write(
    sizes
      .map((n, i) => `term-scan: shard ${i + 1}/${count}: ${n} units\n`)
      .join(""),
  );
  if (pick === undefined) return { units: [...units], first: 1 };
  const start = (pick - 1) * max;
  return { units: units.slice(start, start + max), first: start + 1 };
}

async function main(): Promise<number> {
  const parsed = cli({
    name: "term-scan",
    parameters: ["[doc-dir]"],
    flags: {
      glossary: {
        type: String,
        description:
          "Glossary file: its table headwords are the terms with an entry",
      },
      labels: {
        type: String,
        description: "Navigation config whose quoted strings are the labels",
      },
      convention: {
        type: [String],
        description: "Convention file or directory (repeatable)",
      },
      maxUnits: {
        type: Number,
        description:
          "Pack judgment units into shards of at most this many; plan on stderr",
      },
      shard: {
        type: Number,
        description: "With --max-units, print only shard k (1-based)",
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

  const { glossary, labels, maxUnits, shard } = parsed.flags;
  const conventions: string[] = parsed.flags.convention ?? [];
  if (maxUnits !== undefined && !positiveInt(maxUnits))
    return usage("--max-units expects an integer of at least 1");
  if (shard !== undefined && !positiveInt(shard))
    return usage("--shard expects a shard number k >= 1");
  if (shard !== undefined && maxUnits === undefined)
    return usage("--shard needs --max-units");

  const loaded = await collect(docdir, glossary, labels, conventions);
  if (loaded.isErr()) return fail(loaded.error);

  const { headwords, units: all } = loaded.value;
  const byName = unitsByName(all, headwords);
  const { units, breakdown: b } = judgmentUnits(headwords, byName);
  process.stderr.write(
    `term-scan: ${byName.size} names, ${units.length} judgment units ` +
      `(glossary body groups ${b.glossary}, label-linked body groups ${b.labelled}, ` +
      `label/title/heading rows ${b.structural}, convention rows ${b.convention}, ` +
      `variant clusters ${b.clusters})\n`,
  );

  if (maxUnits === undefined) {
    process.stdout.write(renderTable(units, 1));
    return 0;
  }
  const chosen = planShards(units, maxUnits, shard);
  if (typeof chosen === "string") return usage(chosen);
  process.stdout.write(renderTable(chosen.units, chosen.first));
  return 0;
}

function usage(message: string): number {
  process.stderr.write(
    `term-scan: ${message}\nusage: bun term-scan.ts <doc-dir> [--glossary <file>] [--labels <file>] [--convention <file-or-dir>]... [--max-units <m> [--shard <k>]]\n`,
  );
  return 2;
}

function fail(message: string): number {
  process.stderr.write(`term-scan: cannot read input: ${message}\n`);
  return 2;
}

if (import.meta.main) {
  process.exit(await main());
}
