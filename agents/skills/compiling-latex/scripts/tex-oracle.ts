// tex-oracle — evidence for a LaTeX manuscript cleanup (references/manuscript-cleanup.md).
//
//   bun tex-oracle.ts census <main.tex> [<input.tex> ...]   macro definitions vs body uses
//   bun tex-oracle.ts boxes  <a.pdf> <b.pdf>                 word boxes identical? (same engine)
//   bun tex-oracle.ts words  <a.pdf> <b.pdf>                 prose word multiset diff (across layouts/engines)
//   bun tex-oracle.ts paras  <a.tex> <b.tex>                 paragraph count and order in the body
//   bun tex-oracle.ts lint   <main.tex> --contract <NOTATION.md>
//                            forbidden patterns of the contract over main + every \input/\include
//
// Exit 0 = the oracle holds, 1 = it does not, 2 = usage or contract error.
import { dirname, relative, resolve } from "node:path";
import { $ } from "bun";
import { cli, command } from "cleye";

const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl" };
// A % starts a comment only after an EVEN run of backslashes: `\%` is a percent sign,
// `\\%` is a line break followed by a comment.
const stripLineComment = (line: string): string => {
  for (let i = 0; i < line.length; i++) {
    let run = 0;
    while (line[i] === "%" && line[i - run - 1] === "\\") run++;
    if (line[i] === "%" && run % 2 === 0) return line.slice(0, i);
  }
  return line;
};
const stripComments = (s: string) => s.split("\n").map(stripLineComment).join("\n");
const bodyOf = (s: string) => {
  const i = s.indexOf("\\begin{document}");
  return i >= 0 ? s.slice(i) : "";
};

async function census(files: string[]): Promise<number> {
  type Def = { name: string; kind: string; at: string };
  const defs: Def[] = [];
  const pats: [string, RegExp][] = [
    ["newcommand", /\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?/g],
    ["def", /\\[egx]?def\s*\\([A-Za-z]+)/g],
    ["xparse", /\\(?:Declare|New|Renew|Provide)DocumentCommand\s*\{?\\([A-Za-z]+)\}?/g],
    ["operator", /\\DeclareMathOperator\*?\s*\{?\\([A-Za-z]+)\}?/g],
    ["delimiter", /\\DeclarePairedDelimiter(?:X|XPP)?\s*\{?\\([A-Za-z]+)\}?/g],
    ["robust", /\\DeclareRobustCommand\*?\s*\{?\\([A-Za-z]+)\}?/g],
    ["environment", /\\(?:re)?newenvironment\s*\{([A-Za-z*]+)\}/g],
    ["theorem", /\\newtheorem\s*\{([A-Za-z]+)\}/g],
  ];
  let body = "";
  for (const f of files) {
    const s = stripComments(await Bun.file(f).text());
    body += bodyOf(s);
    const pre = s.includes("\\begin{document}") ? s.slice(0, s.indexOf("\\begin{document}")) : s;
    pre.split("\n").forEach((line, i) => {
      for (const [kind, re] of pats) for (const m of line.matchAll(re)) defs.push({ name: m[1], kind, at: `${f.split("/").pop()}:${i + 1}` });
      const delim = line.match(/\\def\s*\\([A-Za-z]+)([0-9]+)\s*\{/);
      if (delim) console.log(`TRAP  \\def\\${delim[1]}${delim[2]} is a DELIMITED macro (\\${delim[1]} must be followed by "${delim[2]}"), not a name with a digit  [${f}:${i + 1}]`);
    });
  }
  const uses = (d: Def) => {
    const re = d.kind === "environment" || d.kind === "theorem"
      ? new RegExp(`\\\\begin\\{${d.name.replace("*", "\\*")}\\}`, "g")
      : new RegExp(`\\\\${d.name}(?![A-Za-z])`, "g");
    return (body.match(re) || []).length;
  };
  const byName = new Map<string, Def[]>();
  for (const d of defs) byName.set(d.name, [...(byName.get(d.name) || []), d]);
  const rows = [...byName.entries()].map(([name, ds]) => ({ name, ds, n: uses(ds[0]) })).sort((a, b) => a.n - b.n || a.name.localeCompare(b.name));
  for (const r of rows) {
    const re = r.ds.length > 1 ? `  REDEFINED x${r.ds.length} (last wins: ${r.ds.at(-1)!.at})` : "";
    console.log(`${String(r.n).padStart(4)}  \\${r.name}  ${r.ds.map((d) => `${d.kind}@${d.at}`).join(", ")}${re}`);
  }
  console.log(`\n${rows.length} names; ${rows.filter((r) => r.n === 0).length} unused; ${rows.filter((r) => r.ds.length > 1).length} redefined`);
  return 0;
}

type Word = { page: number; x: number; y: number; t: string };
async function bboxWords(pdf: string): Promise<Word[]> {
  const html = await $`pdftotext -bbox ${pdf} -`.text();
  const out: Word[] = [];
  let page = 0;
  for (const line of html.split("\n")) {
    if (line.includes("<page ")) page++;
    const m = line.match(/xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>(.*)<\/word>/);
    if (m) out.push({ page, x: +m[1], y: +m[2], t: m[3] });
  }
  return out;
}

async function boxes(a: string, b: string): Promise<number> {
  const [wa, wb] = await Promise.all([bboxWords(a), bboxWords(b)]);
  console.log(`words: ${wa.length} vs ${wb.length}`);
  let bad = 0;
  for (let i = 0; i < Math.min(wa.length, wb.length); i++) {
    const A = wa[i], B = wb[i];
    const dx = B.x - A.x, dy = B.y - A.y;
    if (A.t !== B.t || Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      if (bad++ < 30) console.log(`p${A.page} "${A.t}"${A.t !== B.t ? ` -> "${B.t}"` : ""} dx=${dx.toFixed(3)} dy=${dy.toFixed(3)}`);
    }
  }
  if (wa.length !== wb.length) bad++;
  console.log(bad ? `BOXES DIFFER (${bad})` : "BOXES IDENTICAL");
  return bad ? 1 : 0;
}

async function proseWords(pdf: string): Promise<string[]> {
  let t = await $`pdftotext ${pdf} -`.text();
  for (const [k, v] of Object.entries(LIGATURES)) t = t.replaceAll(k, v);
  t = t.replace(/-\n/g, "");
  return t.match(/\b[A-Za-z]{3,}\b/g) ?? [];
}

async function words(a: string, b: string): Promise<number> {
  const [wa, wb] = await Promise.all([proseWords(a), proseWords(b)]);
  const count = (ws: string[]) => ws.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map<string, number>());
  const [ca, cb] = [count(wa), count(wb)];
  const minus = (x: Map<string, number>, y: Map<string, number>) =>
    [...x].flatMap(([w, n]) => (n > (y.get(w) ?? 0) ? [`${w}×${n - (y.get(w) ?? 0)}`] : []));
  const onlyA = minus(ca, cb), onlyB = minus(cb, ca);
  console.log(`prose words: ${wa.length} vs ${wb.length}`);
  console.log(`only in A: ${onlyA.join(" ") || "-"}`);
  console.log(`only in B: ${onlyB.join(" ") || "-"}`);
  return onlyA.length + onlyB.length ? 1 : 0;
}

async function paras(a: string, b: string): Promise<number> {
  const blocks = async (f: string) => {
    const body = bodyOf(await Bun.file(f).text()).split("\n").filter((l) => !/^\s*%/.test(l)).join("\n");
    return body
      .split(/\n[ \t]*\n/)
      .map((blk) => (blk.replace(/\$[^$]*\$|\\[A-Za-z]+\*?(\[[^\]]*\])?(\{[^{}]*\})?(\[[^\]]*\])?/g, " ").match(/\b[A-Za-z]{3,}\b/g) ?? []).slice(0, 5).join(" "))
      .filter(Boolean);
  };
  const [pa, pb] = await Promise.all([blocks(a), blocks(b)]);
  console.log(`paragraphs: ${pa.length} vs ${pb.length}`);
  let shown = 0;
  for (let i = 0; i < Math.max(pa.length, pb.length) && shown < 20; i++) {
    if (pa[i] !== pb[i]) { console.log(`#${i}: ${pa[i] ?? "-"}  |  ${pb[i] ?? "-"}`); shown++; }
  }
  return pa.length === pb.length ? 0 : 1;
}

// NOTATION.md contract (references/manuscript-cleanup.md §6): exactly one fenced block opened by
// the line "```forbidden" and closed by "```". Inside it a blank line is skipped; every other line
// is <regex><TAB><reason>, split at the FIRST tab, both halves non-empty. The regex is ECMAScript,
// compiled with flag g, and applied to one comment-stripped source line at a time.
type Rule = { id: string; re: RegExp; reason: string };
type ContractError = { line: number; problem: string };
type TexFile = { path: string; lines: string[] };
const usageError = (message: string): number => {
  console.error(`tex-oracle: ${message}`);
  return 2;
};

function forbiddenBlock(lines: string[]): { start: number; body: string[] } | ContractError {
  const opens = lines.flatMap((l, i) => (/^```forbidden\s*$/.test(l) ? [i] : []));
  if (opens.length !== 1) return { line: (opens[1] ?? 0) + 1, problem: `need exactly one \`\`\`forbidden block, found ${opens.length}` };
  const start = opens[0];
  const close = lines.findIndex((l, i) => i > start && /^```\s*$/.test(l));
  if (close < 0) return { line: start + 1, problem: "the ```forbidden block is never closed" };
  return { start, body: lines.slice(start + 1, close) };
}

async function compileRule(line: string, n: number, lineNo: number): Promise<Rule | ContractError> {
  const tab = line.indexOf("\t");
  const source = tab < 0 ? "" : line.slice(0, tab);
  const reason = tab < 0 ? "" : line.slice(tab + 1).trim();
  if (!source || !reason) return { line: lineNo, problem: "a rule line is <regex><TAB><reason>, both non-empty" };
  const re = await Promise.try(() => new RegExp(source, "g")).then(
    (ok) => ok,
    (e: Error) => e.message,
  );
  if (typeof re === "string") return { line: lineNo, problem: `bad regex: ${re}` };
  return { id: `R${n}`, re, reason };
}

async function readContract(path: string): Promise<Rule[] | ContractError> {
  const lines = (await Bun.file(path).text()).split("\n");
  const block = forbiddenBlock(lines);
  if ("problem" in block) return block;
  const rules: Rule[] = [];
  for (const [k, line] of block.body.entries()) {
    if (line.trim() === "") continue;
    const rule = await compileRule(line, rules.length + 1, block.start + k + 2);
    if ("problem" in rule) return rule;
    rules.push(rule);
  }
  if (rules.length === 0) return { line: block.start + 1, problem: "the ```forbidden block has no rules" };
  return rules;
}

// The main file plus every \input{x} / \include{x} reached from it, depth first, each file once.
// Names resolve against the main file's directory, which is the build directory when latexmk runs
// from the paper directory (references/manuscript-cleanup.md §2, latexmk -cd row).
async function texClosure(main: string): Promise<TexFile[] | string> {
  const root = dirname(resolve(main));
  const seen = new Set<string>();
  const out: TexFile[] = [];
  const visit = async (path: string): Promise<string | undefined> => {
    if (seen.has(path)) return undefined;
    seen.add(path);
    if (!(await Bun.file(path).exists())) return `missing input file ${relative(process.cwd(), path)}`;
    const lines = stripComments(await Bun.file(path).text()).split("\n");
    out.push({ path, lines });
    const names = [...lines.join("\n").matchAll(/\\(?:input|include)\s*\{([^}]+)\}/g)].map((m) => resolve(root, m[1].trim()));
    for (const name of names) {
      const target = (await Bun.file(`${name}.tex`).exists()) ? `${name}.tex` : name;
      const problem = await visit(target);
      if (problem) return problem;
    }
    return undefined;
  };
  const problem = await visit(resolve(main));
  return problem ?? out;
}

// Non-ASCII and control characters print as <U+XXXX>, so an invisible hit (NBSP, a stray tab) is legible.
const visible = (text: string): string =>
  [...text].map((c) => (/[\x20-\x7E]/.test(c) ? c : `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`)).join("");

function lintHits(file: TexFile, rules: Rule[]): string[] {
  const shown = relative(process.cwd(), file.path);
  return file.lines.flatMap((line, i) =>
    rules.flatMap((r) =>
      [...line.matchAll(r.re)].map((m) => `${shown}:${i + 1}:${(m.index ?? 0) + 1}: [${r.id}] \`${visible(m[0])}\` — ${r.reason}`),
    ),
  );
}

async function lint(main: string, contract: string): Promise<number> {
  if (!(await Bun.file(contract).exists())) return usageError(`contract not found: ${contract}`);
  const rules = await readContract(contract);
  if ("problem" in rules) return usageError(`contract ${contract}:${rules.line}: ${rules.problem}`);
  const files = await texClosure(main);
  if (typeof files === "string") return usageError(files);
  const hits = files.flatMap((f) => lintHits(f, rules));
  for (const h of hits) console.log(h);
  const scope = `${rules.length} rules, ${files.length} files`;
  console.log(hits.length ? `LINT FAILED: ${hits.length} hits (${scope})` : `LINT CLEAN (${scope})`);
  return hits.length ? 1 : 0;
}

// A present --contract with no value must stop at the boundary (exit 2), never become "".
const requiredPath = (value: string): string => {
  if (value) return value;
  console.error("tex-oracle: --contract needs a path");
  process.exit(2);
};

// strictFlags alone lets --__proto__ reach type-flag before the unknown-flag check (BG1), and its
// own unknown-flag exit is 1, which this CLI reserves for "the oracle does not hold". Every unknown
// flag, --__proto__ included, stops here with the usage exit 2.
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag") {
    console.error(`tex-oracle: unknown option '--${flag}'`);
    process.exit(2);
  }
};

const argv = cli({
  name: "tex-oracle",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  help: { description: "Evidence for a format-only LaTeX manuscript cleanup (references/manuscript-cleanup.md)" },
  commands: [
    command({ name: "census", strictFlags: true, ignoreArgv: rejectPrototypeFlag, parameters: ["<files...>"], help: { description: "macro definitions vs body uses" } }),
    command({ name: "boxes", strictFlags: true, ignoreArgv: rejectPrototypeFlag, parameters: ["<a>", "<b>"], help: { description: "word boxes identical (same engine)" } }),
    command({ name: "words", strictFlags: true, ignoreArgv: rejectPrototypeFlag, parameters: ["<a>", "<b>"], help: { description: "prose word multiset diff" } }),
    command({ name: "paras", strictFlags: true, ignoreArgv: rejectPrototypeFlag, parameters: ["<a>", "<b>"], help: { description: "paragraph count and order" } }),
    command({
      name: "lint",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<main>"],
      flags: { contract: { type: requiredPath, description: "NOTATION.md holding one ```forbidden block" } },
      help: { description: "forbidden patterns of a NOTATION.md contract over main + \\input files" },
    }),
  ],
});
const p = argv._ as Record<string, string | string[]>;
const run: Record<string, () => Promise<number>> = {
  census: () => census(p.files as string[]),
  boxes: () => boxes(p.a as string, p.b as string),
  words: () => words(p.a as string, p.b as string),
  paras: () => paras(p.a as string, p.b as string),
  lint: async () => {
    const contract = (argv.flags as { contract?: string }).contract;
    if (argv._.length !== 1) return usageError("lint takes exactly one <main.tex>");
    if (!contract) return usageError("lint needs --contract <NOTATION.md>");
    return lint(p.main as string, contract);
  },
};
const handler = argv.command ? run[argv.command] : undefined;
if (!handler) {
  argv.showHelp();
  process.exit(2);
}
process.exit(await handler());
