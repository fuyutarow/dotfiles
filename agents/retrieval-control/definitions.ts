// `repo-retrieve definition` — "does this already exist?" answered as a few definition cards.
//
// WHY A SEPARATE ROUTE. `concept` ranks ccc's chunks: tests, comments, research records and copies
// compete with the code, and a chunk is a slice, not a function. Measured 2026-10-01 on firedancer
// (12 FireOps primitive needs, builder phrasing that does not name the function, EN + JA = 24
// queries): the correct definition reached the top 3 for 13/24 with `concept`; builders missed
// existing kernels and re-implemented them. This route searches DEFINITIONS only and reaches 21/24
// (README "Measurements").
//
// PIPELINE
//   1. catalog  ccc_defs.py (ccc's own scope + tree-sitter) extracts every function/type definition:
//               name, signature, attached doc, location, public-ness. One small markdown file per
//               definition goes into a private ccc project under ~/.cache/repo-retrieve/catalog/,
//               indexed by the same daemon and embedder as the repo itself. Kept fresh against the
//               working tree: nothing changed since the last build (git) → reuse; else re-parse the
//               changed files only, rewrite their entries, `ccc index` the catalog (incremental).
//   2. recall   ccc search over the catalog, 40 hits. A private helper (`_name`) hands its hit to
//               the public definition in the same file that calls it — the kernel is not the API.
//   3. rerank   the resident cross-encoder (rerank_server.py, socket-activated) scores each
//               candidate's name + signature + doc against the query: this is what closes the
//               Japanese/English gap and the builder-vs-docstring wording gap. Log-odds plus small
//               priors (public, documented, not private) decide ties among near-duplicates.
//               No reranker reachable (macOS, unit not enabled) → embedding order, said so.
//   4. answer   at most --limit cards; a best score under the threshold is NO_DEFINITION with the
//               nearest candidates shown, never a confident wrong answer.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, attemptOr } from "../hooks/attempt.ts";
import { requireExecutable, runChildCaptured } from "./child.ts";

export type Definition = {
  name: string;
  kind: string;
  lang: string;
  file: string;
  start: number;
  end: number;
  signature: string;
  doc: string;
  body: string;
  public: boolean;
};

export type Card = Definition & { score: number; methods: number };

export type DefinitionAnswer = {
  cards: Card[];
  strength: "strong" | "likely" | "none";
  best: number;
  reranked: boolean;
  catalogSize: number;
  notes: string[];
};

const RECALL = 40; // embedding hits pulled from the catalog
const RERANK_POOL = 30; // candidates the cross-encoder scores: 45 cost ~2 s on a shared GPU, 30 ~1 s
const STRONG = 4; // log-odds; correct answers on the bench score 4-8
const LIKELY = 1.5; // below this nothing is shown as a match (NO_DEFINITION)
const PRIOR = { public: 1, documented: 0.5, private: -1.5, test: -1.5 };
const RERANK_TIMEOUT_MS = 45_000; // first query after idle loads the model (~16 s measured)
const SCRIPT = join(import.meta.dir, "ccc_defs.py");

export const catalogDir = (project: string): string =>
  join(
    homedir(),
    ".cache/repo-retrieve/catalog",
    createHash("sha1").update(realpathSync(project)).digest("hex").slice(0, 16),
  );

type Meta = {
  project: string;
  head: string | null;
  files: Record<string, string>; // code file -> "size mtimeMs" when last parsed
  checkedAt: number; // epoch ms of the last full (git) check
  builtAt: string;
  count: number;
};
const SCAN_EVERY_MS = 60_000;

// The interpreter that can import cocoindex: the `ccc` script's own shebang (same as ccc-scope.ts).
function cccPython(): string {
  const ccc = realpathSync(requireExecutable("ccc"));
  const line = readFileSync(ccc, "utf8").split("\n", 1)[0] ?? "";
  const py = line.startsWith("#!/") ? line.slice(2).trim() : "";
  if (!/\/python[0-9.]*$/.test(py)) throw new Error(`cannot find ccc's Python interpreter (shebang of ${ccc})`);
  return py;
}

async function git(project: string, args: string[]): Promise<string | null> {
  const r = await runChildCaptured(["git", "-C", project, ...args], 15_000, false);
  return r.exitCode === 0 ? r.stdout : null;
}

// Paths that may differ from what the catalog was built from: commits since its HEAD plus the
// uncommitted and untracked files now. null = cannot tell (no git / no previous build) → rebuild.
async function changedSince(project: string, head: string | null): Promise<string[] | null> {
  if (head === null) return null;
  const committed = await git(project, ["diff", "--name-only", head, "HEAD"]);
  const dirty = await git(project, ["status", "--porcelain", "--untracked-files=all"]);
  if (committed === null || dirty === null) return null;
  return [
    ...committed.split("\n"),
    ...dirty.split("\n").map((l) => l.slice(3).split(" -> ").at(-1) ?? ""),
  ].filter((p) => /\.(jl|py|ts|tsx|js|mjs|rs)$/.test(p));
}

function mdText(d: Definition): string {
  // No line numbers: an edit above a definition must not change its text and force a re-embed.
  return [`# ${d.name}`, `${d.kind} (${d.lang}) in ${d.file}`, d.signature, "", d.doc, "", d.body].join("\n");
}

const mdName = (text: string) => `${createHash("sha1").update(text).digest("hex").slice(0, 20)}.md`;

function loadDefinitions(cachePath: string): { defs: Definition[]; files: string[] } {
  const cache = JSON.parse(readFileSync(cachePath, "utf8")) as {
    files: Record<string, { records: Definition[]; publics: string[] }>;
  };
  const publics = new Set(Object.values(cache.files).flatMap((f) => f.publics));
  const defs = Object.values(cache.files).flatMap((f) =>
    f.records.map((r) => ({ ...r, public: r.public || publics.has(r.name) })),
  );
  return { defs, files: Object.keys(cache.files) };
}

const statKey = (project: string, rel: string): string => {
  const st = statSync(join(project, rel), { throwIfNoEntry: false });
  return st ? `${st.size} ${st.mtimeMs}` : "gone";
};

// Bring the catalog to the working tree. Returns the definitions and the catalog dir.
//
// Two depths of check, because `git status` alone costs ~1 s on a large tree (firedancer, 611
// dirty paths, measured 2026-10-01) and every query would pay it:
//   fast  same HEAD, last full check < SCAN_EVERY_MS ago → stat only the code files already in the
//         catalog (~500 stats, a few ms); re-parse the ones that changed.
//   full  otherwise → git names every path that may differ (commits since the last build, dirty
//         and untracked files); re-parse those (or walk the whole scope with no previous build).
// So an edited known file is always current; a brand-new file joins within SCAN_EVERY_MS.
export async function refreshCatalog(
  project: string,
  notes: string[],
): Promise<{ dir: string; defs: Definition[]; byFile: Map<string, Definition[]> }> {
  const dir = catalogDir(project);
  const metaPath = join(dir, "catalog.json");
  const recordsPath = join(dir, "records.json");
  const meta = await attemptOr(() => JSON.parse(readFileSync(metaPath, "utf8")) as Meta, null);
  const head = (await git(project, ["rev-parse", "HEAD"]))?.trim() ?? null;
  const now = Temporal.Now.instant().epochMilliseconds;
  const recent = meta !== null && existsSync(recordsPath) && meta.head === head && now - meta.checkedAt < SCAN_EVERY_MS;

  let only: string[] | null = null;
  let checkedAt = now;
  if (recent) {
    only = Object.entries(meta.files).filter(([rel, k]) => statKey(project, rel) !== k).map(([rel]) => rel);
    checkedAt = meta.checkedAt;
  } else if (meta !== null && existsSync(recordsPath)) {
    only = await changedSince(project, meta.head);
  }
  if (recent && only?.length === 0) return readCatalog(dir);
  const rebuilt = await rebuild(dir, project, only);
  const files = Object.fromEntries(rebuilt.files.map((rel) => [rel, statKey(project, rel)]));
  writeAtomic(
    metaPath,
    JSON.stringify({ project, head, files, checkedAt, builtAt: Temporal.Now.instant().toString(), count: rebuilt.count } satisfies Meta),
  );
  notes.push(
    `catalog ${meta ? "refreshed" : "built"}: ${rebuilt.count} definitions` +
      (only === null ? " (full scan)" : ` (${only.length} changed path(s))`),
  );
  return readCatalog(dir);
}

function readCatalog(dir: string): { dir: string; defs: Definition[]; byFile: Map<string, Definition[]> } {
  const byFile = new Map(
    Object.entries(JSON.parse(readFileSync(join(dir, "records.json"), "utf8")) as Record<string, Definition[]>),
  );
  return { dir, defs: [...byFile.values()].flat(), byFile };
}

// Re-extract (changed files only — ccc_defs.py keeps a per-file cache), rewrite the catalog's
// entries, and index it. Files are content-named, so unchanged definitions are never re-embedded.
async function rebuild(
  dir: string,
  project: string,
  only: string[] | null,
): Promise<{ count: number; files: string[] }> {
  const cachePath = join(dir, "defs-cache.json");
  const onlyPath = join(dir, `only.${process.pid}.json`);
  if (only !== null) writeFileSync(onlyPath, JSON.stringify(only));
  const onlyArgs = only !== null && existsSync(cachePath) ? ["--only", onlyPath] : [];
  mkdirSync(join(dir, "defs"), { recursive: true });
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  const settings = join(dir, ".cocoindex_code/settings.yml");
  if (!existsSync(settings)) {
    writeFileSync(settings, "include_patterns:\n- 'defs/**/*.md'\nexclude_patterns:\n- '**/.cocoindex_code'\n");
  }
  const extract = await runChildCaptured([cccPython(), SCRIPT, project, cachePath, cachePath, ...onlyArgs], 600_000, false);
  if (only !== null && existsSync(onlyPath)) unlinkSync(onlyPath);
  if (extract.exitCode !== 0) throw new Error(`ccc_defs.py failed: ${extract.stderr.trim().slice(-400)}`);
  const { defs, files } = loadDefinitions(cachePath);
  const wanted = new Map<string, Definition[]>();
  let written = 0;
  for (const d of defs) {
    const text = mdText(d);
    const name = mdName(text);
    wanted.set(name, [...(wanted.get(name) ?? []), d]);
    const path = join(dir, "defs", name);
    if (existsSync(path)) continue;
    writeFileSync(path, text);
    written += 1;
  }
  const stale = readdirSync(join(dir, "defs")).filter((f) => !wanted.has(f));
  for (const f of stale) unlinkSync(join(dir, "defs", f));
  writeAtomic(join(dir, "records.json"), JSON.stringify(Object.fromEntries(wanted)));
  // An edit that only moved definitions (line numbers live in records.json, not in the indexed
  // text) changes no catalog file: nothing to embed, no daemon round trip.
  if (written + stale.length > 0) {
    const index = await runChildCaptured([requireExecutable("ccc"), "index"], 900_000, false, dir);
    if (index.exitCode !== 0) throw new Error(`catalog index failed: ${index.stderr.trim().slice(-400)}`);
  }
  return { count: defs.length, files };
}

// A reader in another session must never see half a file.
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

type Hit = { file_path: string; score: number };

async function recall(dir: string, query: string): Promise<Hit[]> {
  const r = await runChildCaptured(
    [requireExecutable("ccc"), "search", "--json", "--limit", String(RECALL), query],
    120_000,
    false,
    dir,
  );
  if (r.exitCode !== 0) throw new Error(`catalog search failed: ${r.stderr.trim().slice(-400)}`);
  return (JSON.parse(r.stdout) as { results: Hit[] }).results;
}

const rerankSocket = (): string => join(homedir(), ".cache/repo-retrieve/rerank.sock");

// One request to the resident reranker. null = not reachable / failed (caller degrades, says so).
export async function rerank(query: string, docs: string[]): Promise<number[] | null> {
  if (!existsSync(rerankSocket())) return null;
  const { promise, resolve } = Promise.withResolvers<number[] | null>();
  let reply = "";
  const timer = setTimeout(() => resolve(null), RERANK_TIMEOUT_MS);
  const done = (v: number[] | null) => {
    clearTimeout(timer);
    resolve(v);
  };
  const parse = (line: string) =>
    attemptOr(() => {
      const r = JSON.parse(line) as { scores?: number[] };
      return Array.isArray(r.scores) && r.scores.length === docs.length ? r.scores : null;
    }, null);
  await attempt(() =>
    Bun.connect({
      unix: rerankSocket(),
      socket: {
        open: (s) => void s.write(`${JSON.stringify({ query, docs })}\n`),
        data: (s, chunk) => {
          reply += chunk.toString();
          if (!reply.includes("\n")) return;
          void parse(reply.split("\n", 1)[0] ?? "").then(done);
          s.end();
        },
        close: () => void parse(reply.split("\n", 1)[0] ?? "").then(done),
        error: () => done(null),
      },
    }),
  ).then((r) => (r.ok ? undefined : done(null)));
  return promise;
}

const rerankText = (d: Definition) => `${d.name}\n${d.signature.slice(0, 200)}\n${d.doc.slice(0, 400)}`;
const isPrivate = (d: Definition) => d.name.startsWith("_");
const key = (d: Definition) => `${d.file}:${d.start}`;

export async function findDefinitions(
  project: string,
  query: string,
  limit: number,
  exclude?: (d: Definition) => boolean,
): Promise<DefinitionAnswer> {
  const notes: string[] = [];
  const { dir, defs, byFile } = await refreshCatalog(project, notes);
  const hits = await recall(dir, query);

  const owners = ownersOf(defs);
  const order = candidates(hits, byFile, owners, exclude).slice(0, RERANK_POOL);
  const scores = order.length > 0 ? await rerank(query, order.map(rerankText)) : [];
  const reranked = scores !== null;
  if (!reranked) notes.push("reranker unreachable — embedding order only (enable: mise run wsl:rerank)");
  const raw = scores ?? order.map((_, i) => STRONG + 1 - (i * (STRONG + 1)) / Math.max(order.length, 1));
  const ranked = toCards(order, finalScores(order, raw, owners)).slice(0, limit);
  const best = ranked[0]?.score ?? -99;
  return { cards: ranked, strength: strengthOf(best, reranked), best, reranked, catalogSize: defs.length, notes };
}

// private helper key -> the public definitions in its file whose body calls it.
function ownersOf(defs: Definition[]): Map<string, Definition[]> {
  const publicByFile = new Map<string, Definition[]>();
  for (const d of defs) if (!isPrivate(d)) publicByFile.set(d.file, [...(publicByFile.get(d.file) ?? []), d]);
  const out = new Map<string, Definition[]>();
  for (const d of defs) {
    if (!isPrivate(d)) continue;
    const os = (publicByFile.get(d.file) ?? []).filter((o) => o.body.includes(d.name));
    if (os.length > 0) out.set(key(d), os);
  }
  return out;
}

// Embedding order, each definition once; a private helper also nominates its owners.
function candidates(
  hits: Hit[],
  byFile: Map<string, Definition[]>,
  owners: Map<string, Definition[]>,
  exclude?: (d: Definition) => boolean,
): Definition[] {
  const order: Definition[] = [];
  const seen = new Set<string>();
  const add = (d: Definition) => {
    if (seen.has(key(d)) || exclude?.(d)) return;
    seen.add(key(d));
    order.push(d);
  };
  const entries = hits.flatMap((h) => byFile.get(h.file_path.split("/").at(-1) ?? "") ?? []);
  for (const d of entries) {
    add(d);
    for (const o of owners.get(key(d)) ?? []) add(o);
  }
  return order;
}

// A helper defined in a test file is rarely the thing to reuse.
const isTest = (d: Definition) => /(^|\/)(tests?|spec|__tests__)\/|[._-]test\.|_spec\./.test(d.file);

const prior = (d: Definition): number =>
  (d.public ? PRIOR.public : 0) +
  (d.doc ? PRIOR.documented : 0) +
  (isPrivate(d) ? PRIOR.private : 0) +
  (isTest(d) ? PRIOR.test : 0);

// Reranker log-odds + priors; a helper's evidence also counts for its owners.
function finalScores(order: Definition[], raw: number[], owners: Map<string, Definition[]>): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (k: string, v: number) => out.set(k, Math.max(out.get(k) ?? -99, v));
  order.forEach((d, i) => {
    const r = raw[i] ?? 0;
    bump(key(d), r + prior(d));
    for (const o of owners.get(key(d)) ?? []) bump(key(o), r + PRIOR.public);
  });
  return out;
}

// One card per name+file: several methods of one function are one answer.
function toCards(order: Definition[], score: Map<string, number>): Card[] {
  const cards = new Map<string, Card>();
  for (const d of order) {
    const k = `${d.file}\0${d.name}`;
    const s = score.get(key(d)) ?? -99;
    const prev = cards.get(k);
    const better = !prev || s > prev.score;
    cards.set(k, { ...(better ? d : prev), score: better ? s : prev.score, methods: (prev?.methods ?? 0) + 1 });
  }
  return [...cards.values()].sort((a, b) => b.score - a.score);
}

function strengthOf(best: number, reranked: boolean): DefinitionAnswer["strength"] {
  if (!reranked) return "likely";
  if (best >= STRONG) return "strong";
  return best >= LIKELY ? "likely" : "none";
}

// The first line that says what it does: Julia/Python docstrings usually open with a copy of the
// signature (already on the card) and rulers; skip those.
function firstLine(name: string, doc: string): string {
  const said = doc
    .split("\n")
    .map((l) => l.trim())
    .find(
      (l) =>
        l !== "" &&
        !/^[-=*_`#]{3,}/.test(l) &&
        !l.startsWith(`${name}(`) &&
        !l.startsWith(`${name} `) &&
        !/^(function|struct|macro|def|fn|export)\b/.test(l),
    );
  return (said ?? "").slice(0, 160);
}

export function renderCards(a: DefinitionAnswer): string {
  return a.cards
    .map((c, i) => {
      const tags = [c.lang, c.kind.replace(/_definition$/, ""), c.public ? "public" : "", c.methods > 1 ? `${c.methods} methods` : ""]
        .filter(Boolean)
        .join(", ");
      const doc = firstLine(c.name, c.doc);
      return [
        `${i + 1}. ${c.name}  (${tags})  ${c.file}:${c.start}`,
        `   ${c.signature.slice(0, 160)}`,
        ...(doc ? [`   ${doc}`] : []),
      ].join("\n");
    })
    .join("\n");
}

