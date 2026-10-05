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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, attemptOr } from "../hooks/attempt.ts";
import { jsonOf, z } from "../hooks/zod.ts";
import { requireExecutable, runChildCaptured } from "./child.ts";

// One definition as ccc_defs.py writes it (see its `Record:` line); every file this module reads
// back — the extractor's cache and the catalog's records.json — is parsed with this schema.
const DefinitionSchema = z.object({
  name: z.string(),
  kind: z.string(),
  lang: z.string(),
  file: z.string(),
  start: z.number(),
  end: z.number(),
  signature: z.string(),
  doc: z.string(),
  body: z.string(),
  public: z.boolean(),
});
export type Definition = z.output<typeof DefinitionSchema>;

export type Card = Definition & { score: number; methods: number };

export type DefinitionAnswer = {
  cards: Card[];
  strength: "strong" | "likely" | "none" | "unranked"; // unranked: no judge answered, so no match/absence judgement
  best: number;
  reranked: boolean;
  judge: Judge | "none";
  catalogSize: number;
  notes: string[];
};

export type Judge = "jev" | "local";
type Thresholds = { strong: number; likely: number; hook: number };
type JevEndpoint = { url: string; model?: string; whenExhausted?: string };
export type RetrievalConfig = {
  recall: number;
  pool: number;
  priors: { public: number; documented: number; private: number; test: number };
  judge: Judge;
  jevEndpoint: JevEndpoint;
  noEgress: string[];
  thresholds: Record<Judge, Thresholds>;
};

const CONFIG = join(import.meta.dir, "retrieval.toml");
const JEV_TIMEOUT_MS = 20_000;
const JEV_RETRIES = 3; // 429 / 529, exponential backoff — the API reference's guidance

type Table = Record<string, unknown>;
const TableSchema = z.record(z.string(), z.unknown());
const asTable = (v: unknown): Table | undefined =>
  TableSchema.safeParse(v).data;
const NoEgressSchema = z.array(z.string());

// retrieval.toml, validated: a wrong value names the key and stops, never a guessed default.
export function loadRetrievalConfig(path = CONFIG): RetrievalConfig {
  const parsedToml: unknown = Bun.TOML.parse(readFileSync(path, "utf8"));
  const raw = asTable(parsedToml) ?? {};
  const d = asTable(raw.definition) ?? {};
  function fail(key: string, want: string): never {
    throw new Error(`${path}: definition.${key} must be ${want}`);
  }
  const num = (t: Table, key: string, at: string): number => {
    const v = t[key];
    return typeof v === "number" && Number.isFinite(v)
      ? v
      : fail(`${at}${key}`, "a finite number");
  };
  const count = (key: string): number => {
    const v = d[key];
    return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 200
      ? v
      : fail(key, "an integer in 1..200");
  };
  const table = (t: unknown, key: string): Table =>
    asTable(t) ?? fail(key, "a table");

  const recall = count("recall");
  const pool = count("pool");
  if (pool > recall) fail("pool", `at most recall (${recall})`);

  const p = table(d.priors, "priors");
  const priors = {
    public: num(p, "public", "priors."),
    documented: num(p, "documented", "priors."),
    private: num(p, "private", "priors."),
    test: num(p, "test", "priors."),
  };

  const judge = d.judge;
  if (judge !== "jev" && judge !== "local") fail("judge", '"jev" or "local"');
  const endpoints = table(d.jev_endpoints, "jev_endpoints");
  const provider = d.jev_provider;
  const e =
    typeof provider === "string" ? asTable(endpoints[provider]) : undefined;
  if (typeof provider !== "string" || e === undefined)
    fail(
      "jev_provider",
      `one of [definition.jev_endpoints.*] (${Object.keys(endpoints).join(", ")})`,
    );
  const url = e.url;
  if (typeof url !== "string" || !url.startsWith("https://"))
    fail(`jev_endpoints.${provider}.url`, "an https:// URL");
  const model = e.model;
  if (model !== undefined && typeof model !== "string")
    fail(`jev_endpoints.${provider}.model`, "a string when present");
  const whenExhausted = e.when_exhausted;
  if (whenExhausted !== undefined && typeof whenExhausted !== "string")
    fail(`jev_endpoints.${provider}.when_exhausted`, "a string when present");
  const jevEndpoint: JevEndpoint = { url };
  if (model !== undefined) jevEndpoint.model = model;
  if (whenExhausted !== undefined) jevEndpoint.whenExhausted = whenExhausted;

  const noEgress = NoEgressSchema.safeParse(d.no_egress);
  if (!noEgress.success) fail("no_egress", "a list of paths");

  const ths = table(d.thresholds, "thresholds");
  const thresholdsOf = (j: Judge): Thresholds => {
    const t = table(ths[j], `thresholds.${j}`);
    const at = `thresholds.${j}.`;
    const th = {
      strong: num(t, "strong", at),
      likely: num(t, "likely", at),
      hook: num(t, "hook", at),
    };
    // Ordered bands: below likely = absent, likely..strong = read first, strong.. = this one.
    if (!(th.likely < th.strong)) fail(`${at}likely`, "below strong");
    if (!(th.hook >= th.strong)) fail(`${at}hook`, "at least strong");
    return th;
  };
  const thresholds: Record<Judge, Thresholds> = {
    jev: thresholdsOf("jev"),
    local: thresholdsOf("local"),
  };

  const expand = (x: string) =>
    x.startsWith("~/") ? join(homedir(), x.slice(2)) : x;
  return {
    recall,
    pool,
    priors,
    judge,
    jevEndpoint,
    noEgress: noEgress.data.map(expand),
    thresholds,
  };
}

function judgeFor(project: string, cfg: RetrievalConfig): Judge {
  const real = realpathSync(project);
  const blocked = cfg.noEgress.some(
    (p) => real === p || real.startsWith(`${p.replace(/\/$/, "")}/`),
  );
  return blocked ? "local" : cfg.judge;
}
const RERANK_TIMEOUT_MS = 45_000; // first query after idle loads the model (~16 s measured)
const SCRIPT = join(import.meta.dir, "ccc_defs.py");

export const catalogDir = (project: string): string =>
  join(
    homedir(),
    ".cache/repo-retrieve/catalog",
    createHash("sha1").update(realpathSync(project)).digest("hex").slice(0, 16),
  );

const MetaSchema = z.object({
  project: z.string(),
  head: z.string().nullable(),
  files: z.record(z.string(), z.string()), // code file -> "size mtimeMs" when last parsed
  checkedAt: z.number(), // epoch ms of the last full (git) check
  builtAt: z.string(),
  count: z.number(),
});
type Meta = z.output<typeof MetaSchema>;
const SCAN_EVERY_MS = 60_000;

// The interpreter that can import cocoindex: the `ccc` script's own shebang (same as ccc-scope.ts).
function cccPython(): string {
  const ccc = realpathSync(requireExecutable("ccc"));
  const line = readFileSync(ccc, "utf8").split("\n", 1)[0] ?? "";
  const py = line.startsWith("#!/") ? line.slice(2).trim() : "";
  if (!/\/python[0-9.]*$/.test(py))
    throw new Error(`cannot find ccc's Python interpreter (shebang of ${ccc})`);
  return py;
}

async function git(project: string, args: string[]): Promise<string | null> {
  const r = await runChildCaptured(
    ["git", "-C", project, ...args],
    15_000,
    false,
  );
  return r.exitCode === 0 ? r.stdout : null;
}

// Paths that may differ from what the catalog was built from: commits since its HEAD plus the
// uncommitted and untracked files now. null = cannot tell (no git / no previous build) → rebuild.
async function changedSince(
  project: string,
  head: string | null,
): Promise<string[] | null> {
  if (head === null) return null;
  const committed = await git(project, ["diff", "--name-only", head, "HEAD"]);
  const dirty = await git(project, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (committed === null || dirty === null) return null;
  return [
    ...committed.split("\n"),
    ...dirty.split("\n").map((l) => l.slice(3).split(" -> ").at(-1) ?? ""),
  ].filter((p) => /\.(jl|py|ts|tsx|js|mjs|rs)$/.test(p));
}

function mdText(d: Definition): string {
  // No line numbers: an edit above a definition must not change its text and force a re-embed.
  return [
    `# ${d.name}`,
    `${d.kind} (${d.lang}) in ${d.file}`,
    d.signature,
    "",
    d.doc,
    "",
    d.body,
  ].join("\n");
}

const mdName = (text: string) =>
  `${createHash("sha1").update(text).digest("hex").slice(0, 20)}.md`;

// A JSON file's content, decoded and validated by the caller's schema in one zod step.
const readJsonOf = <S extends z.ZodType>(
  schema: S,
  path: string,
): z.output<S> => jsonOf(schema).parse(readFileSync(path, "utf8"));

const DefsCacheSchema = z.object({
  files: z.record(
    z.string(),
    z.object({
      records: z.array(DefinitionSchema),
      publics: z.array(z.string()),
    }),
  ),
});
const RecordsSchema = z.record(z.string(), z.array(DefinitionSchema));

function loadDefinitions(cachePath: string): {
  defs: Definition[];
  files: string[];
} {
  const cache = readJsonOf(DefsCacheSchema, cachePath);
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
): Promise<{
  dir: string;
  defs: Definition[];
  byFile: Map<string, Definition[]>;
}> {
  const dir = catalogDir(project);
  const metaPath = join(dir, "catalog.json");
  const recordsPath = join(dir, "records.json");
  const meta = await attemptOr(() => readJsonOf(MetaSchema, metaPath), null);
  const head = (await git(project, ["rev-parse", "HEAD"]))?.trim() ?? null;
  const now = Temporal.Now.instant().epochMilliseconds;
  const recent =
    meta !== null &&
    existsSync(recordsPath) &&
    meta.head === head &&
    now - meta.checkedAt < SCAN_EVERY_MS;

  let only: string[] | null = null;
  let checkedAt = now;
  if (recent) {
    only = Object.entries(meta.files)
      .filter(([rel, k]) => statKey(project, rel) !== k)
      .map(([rel]) => rel);
    checkedAt = meta.checkedAt;
  } else if (meta !== null && existsSync(recordsPath)) {
    only = await changedSince(project, meta.head);
  }
  if (recent && only?.length === 0) return readCatalog(dir);
  const rebuilt = await rebuild(dir, project, only);
  const files = Object.fromEntries(
    rebuilt.files.map((rel) => [rel, statKey(project, rel)]),
  );
  writeAtomic(
    metaPath,
    JSON.stringify({
      project,
      head,
      files,
      checkedAt,
      builtAt: Temporal.Now.instant().toString(),
      count: rebuilt.count,
    } satisfies Meta),
  );
  notes.push(
    `catalog ${meta ? "refreshed" : "built"}: ${rebuilt.count} definitions` +
      (only === null ? " (full scan)" : ` (${only.length} changed path(s))`),
  );
  return readCatalog(dir);
}

function readCatalog(dir: string): {
  dir: string;
  defs: Definition[];
  byFile: Map<string, Definition[]>;
} {
  const byFile = new Map(
    Object.entries(readJsonOf(RecordsSchema, join(dir, "records.json"))),
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
  const onlyArgs =
    only !== null && existsSync(cachePath) ? ["--only", onlyPath] : [];
  mkdirSync(join(dir, "defs"), { recursive: true });
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  const settings = join(dir, ".cocoindex_code/settings.yml");
  if (!existsSync(settings)) {
    writeFileSync(
      settings,
      "include_patterns:\n- 'defs/**/*.md'\nexclude_patterns:\n- '**/.cocoindex_code'\n",
    );
  }
  const extract = await runChildCaptured(
    [cccPython(), SCRIPT, project, cachePath, cachePath, ...onlyArgs],
    600_000,
    false,
  );
  if (only !== null && existsSync(onlyPath)) unlinkSync(onlyPath);
  if (extract.exitCode !== 0)
    throw new Error(`ccc_defs.py failed: ${extract.stderr.trim().slice(-400)}`);
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
  writeAtomic(
    join(dir, "records.json"),
    JSON.stringify(Object.fromEntries(wanted)),
  );
  // An edit that only moved definitions (line numbers live in records.json, not in the indexed
  // text) changes no catalog file: nothing to embed, no daemon round trip.
  if (written + stale.length > 0) {
    const index = await runChildCaptured(
      [requireExecutable("ccc"), "index"],
      900_000,
      false,
      dir,
    );
    if (index.exitCode !== 0)
      throw new Error(
        `catalog index failed: ${index.stderr.trim().slice(-400)}`,
      );
  }
  return { count: defs.length, files };
}

// A reader in another session must never see half a file.
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

// ccc search --json: only the path is read; the rest of each result is ignored.
const SearchSchema = z.object({
  results: z.array(z.object({ file_path: z.string() })),
});
type Hit = z.output<typeof SearchSchema>["results"][number];

async function recall(
  dir: string,
  query: string,
  limit: number,
): Promise<Hit[]> {
  const r = await runChildCaptured(
    [
      requireExecutable("ccc"),
      "search",
      "--json",
      "--limit",
      String(limit),
      query,
    ],
    120_000,
    false,
    dir,
  );
  if (r.exitCode !== 0)
    throw new Error(`catalog search failed: ${r.stderr.trim().slice(-400)}`);
  return jsonOf(SearchSchema).parse(r.stdout).results;
}

const rerankSocket = (): string =>
  join(homedir(), ".cache/repo-retrieve/rerank.sock");

export type RerankResult =
  | { scores: number[]; reason?: undefined }
  | { reason: string; scores?: undefined };

// rerank_server.py's one-line reply. A field of the wrong type counts as absent.
const RerankReplySchema = z.object({
  scores: z.array(z.number()).optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

// One request to the resident reranker. A `reason` means the caller ranks by embeddings and says why.
export async function rerank(
  query: string,
  docs: string[],
): Promise<RerankResult> {
  if (!existsSync(rerankSocket()))
    return { reason: "reranker socket absent (enable: mise run wsl:rerank)" };
  const { promise, resolve } = Promise.withResolvers<RerankResult>();
  let reply = "";
  let settled = false;
  const timer = setTimeout(
    () => done({ reason: `no answer within ${RERANK_TIMEOUT_MS} ms` }),
    RERANK_TIMEOUT_MS,
  );
  function done(v: RerankResult): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(v);
  }
  const finish = async () => {
    const line = reply.split("\n", 1)[0] ?? "";
    const r = jsonOf(RerankReplySchema).safeParse(line).data;
    if (r?.scores !== undefined && r.scores.length === docs.length)
      return done({ scores: r.scores });
    return done({
      reason: r?.error
        ? `reranker: ${r.error}`
        : "reranker closed without an answer",
    });
  };
  // A large request does not fit one write: Bun's socket.write sends what the kernel buffer takes
  // and returns that count; the rest goes out on `drain` (measured 2026-10-01: 30 candidates were
  // silently cut, the server never saw the newline, every rerank failed).
  let pending = Buffer.from(`${JSON.stringify({ query, docs })}\n`);
  const flush = (s: { write: (b: Buffer) => number }) => {
    const n = s.write(pending);
    pending = pending.subarray(n);
  };
  const connected = await attempt(() =>
    Bun.connect({
      unix: rerankSocket(),
      socket: {
        open: flush,
        drain: (s) => {
          if (pending.length > 0) flush(s);
        },
        data: (s, chunk) => {
          reply += chunk.toString();
          if (!reply.includes("\n")) return;
          void finish();
          s.end();
        },
        close: () => void finish(),
        error: (_s, e) =>
          done({ reason: `reranker socket error: ${String(e)}` }),
      },
    }),
  );
  if (!connected.ok)
    done({
      reason: `cannot connect to the reranker: ${String(connected.error)}`,
    });
  return promise;
}

const rerankText = (d: Definition) =>
  `${d.name}\n${d.signature.slice(0, 200)}\n${d.doc.slice(0, 500)}`;
// Internal by convention: a leading underscore, or a kernel/impl/inner suffix (the GPU kernel or
// worker a public entry point launches — `residual_add_flag_kernel!` behind `residual_add_flag!`).
export const isPrivate = (d: Pick<Definition, "name">) =>
  d.name.startsWith("_") || /_(kernel|impl|inner|helper)!?$/.test(d.name);
const key = (d: Definition) => `${d.file}:${d.start}`;

// `refresh: false` serves the catalog as it stands (the PostToolUse hook: it must not pay a
// re-parse + re-index inside an edit, and the definition it checks is the new one, not in there).
// No catalog yet → empty answer, never a build.
export async function findDefinitions(
  project: string,
  query: string,
  limit: number,
  exclude?: (d: Definition) => boolean,
  refresh = true,
): Promise<DefinitionAnswer> {
  const notes: string[] = [];
  if (!refresh && !existsSync(join(catalogDir(project), "records.json"))) {
    return {
      cards: [],
      strength: "none",
      best: -99,
      reranked: false,
      judge: "none",
      catalogSize: 0,
      notes: ["no catalog yet"],
    };
  }
  const { dir, defs, byFile } = refresh
    ? await refreshCatalog(project, notes)
    : readCatalog(catalogDir(project));
  const cfg = loadRetrievalConfig();
  const hits = await recall(dir, query, cfg.recall);

  const owners = ownersOf(defs);
  const order = candidates(hits, byFile, owners, exclude).slice(0, cfg.pool);
  const { judge, result } = await judgeCandidates(
    query,
    order.map(rerankText),
    judgeFor(project, cfg),
    cfg.jevEndpoint,
    notes,
  );
  const scores = result.scores ?? null;
  const reranked = scores !== null;
  if (result.reason !== undefined)
    notes.push(`embedding order only — ${result.reason}`);
  // Unjudged: a descending stand-in keeps embedding order; strength is "unranked" regardless.
  const raw = scores ?? order.map((_, i) => order.length - i);
  const ranked = toCards(
    order,
    finalScores(order, raw, owners, cfg.priors),
  ).slice(0, limit);
  const best = ranked[0]?.score ?? -99;
  return {
    cards: ranked,
    strength: strengthOf(best, reranked, cfg.thresholds[judge]),
    best,
    reranked,
    judge: reranked ? judge : "none",
    catalogSize: defs.length,
    notes,
  };
}

// The configured judge; Jev failing (network, quota, bad key) falls back to the local reranker and
// says so — the answer never silently loses its judgement.
async function judgeCandidates(
  query: string,
  docs: string[],
  preferred: Judge,
  jevEndpoint: JevEndpoint,
  notes: string[],
): Promise<{ judge: Judge; result: RerankResult }> {
  if (docs.length === 0) return { judge: preferred, result: { scores: [] } };
  if (preferred === "jev") {
    const jev = await judgeJev(query, docs, jevEndpoint);
    if (jev.scores !== undefined) return { judge: "jev", result: jev };
    notes.push(`Jev unavailable (${jev.reason}); local reranker instead`);
  }
  return { judge: "local", result: await rerank(query, docs) };
}

function jevKey(): string | null {
  const env = process.env.TYPESAFE_API_KEY;
  if (env) return env;
  const file = join(homedir(), ".config/typesafe/.env");
  if (!existsSync(file)) return null;
  const m = /^TYPESAFE_API_KEY=(\S+)$/m.exec(readFileSync(file, "utf8"));
  return m?.[1] ?? null;
}

// The Jev answer: only each slot's `noul` probability is read.
const JevAnswerSchema = z.object({
  answers: z.record(z.string(), z.object({ noul: z.unknown() })).optional(),
});

// One request: every candidate is one `noul` question about its own slot of the state. Jev's
// probabilities are calibrated; they come back as log-odds so the priors and thresholds share the
// local judge's scale. The candidate text (name, signature, first doc lines) is what leaves the
// machine — never file bodies.
export async function judgeJev(
  query: string,
  docs: string[],
  endpoint: JevEndpoint,
): Promise<RerankResult> {
  const apiKey = jevKey();
  if (apiKey === null)
    return { reason: "no TYPESAFE_API_KEY (env or ~/.config/typesafe/.env)" };
  const id = (i: number) => `C${String(i).padStart(2, "0")}`;
  const body = JSON.stringify({
    ...(endpoint.model === undefined ? {} : { model: endpoint.model }),
    state: Object.fromEntries(docs.map((d, i) => [id(i), d])),
    questions: Object.fromEntries(
      docs.map((_, i) => [
        id(i),
        {
          type: "noul",
          instructions: `Does the code definition ${id(i)} already implement what this developer needs: "${query}"?`,
        },
      ]),
    ),
  });
  for (let attempt_ = 0; attempt_ <= JEV_RETRIES; attempt_ += 1) {
    const res = await attempt(() =>
      fetch(endpoint.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
      }),
    );
    if (!res.ok) return { reason: `request failed: ${String(res.error)}` };
    const status = res.value.status;
    if ((status === 429 || status === 529) && attempt_ < JEV_RETRIES) {
      await Bun.sleep(500 * 2 ** attempt_);
      continue;
    }
    const provider = new URL(endpoint.url).host;
    if (status === 401)
      return {
        reason: `HTTP 401 at ${provider}: the key is not this provider's (retrieval.toml jev_provider)`,
      };
    if (status === 402)
      return {
        reason: `HTTP 402 at ${provider}: no credit left — ${endpoint.whenExhausted ?? "top up"}`,
      };
    if (status !== 200) return { reason: `HTTP ${status} at ${provider}` };
    const answered = await attemptOr(() => res.value.text(), "");
    const json = jsonOf(JevAnswerSchema).safeParse(answered).data;
    const ps = docs.map((_, i) => json?.answers?.[id(i)]?.noul);
    const numbers = ps.flatMap((p) => (typeof p === "number" ? [p] : []));
    if (numbers.length !== ps.length) return { reason: "malformed answer" };
    const clamp = (p: number) => Math.min(1 - 1e-4, Math.max(1e-4, p));
    return {
      scores: numbers.map((p) => Math.log(clamp(p) / (1 - clamp(p)))),
    };
  }
  return { reason: "still rate-limited after retries" };
}

// The candidates the second stage would score, with the exact text it would read — for comparing
// second-stage backends on the same input (bench, experiments).
export async function candidatePool(
  project: string,
  query: string,
): Promise<{ name: string; text: string; def: Definition }[]> {
  const cfg = loadRetrievalConfig();
  const { dir, defs, byFile } = await refreshCatalog(project, []);
  const order = candidates(
    await recall(dir, query, cfg.recall),
    byFile,
    ownersOf(defs),
  ).slice(0, cfg.pool);
  return order.map((def) => ({ name: def.name, text: rerankText(def), def }));
}

// private helper key -> the public definitions in its file whose body calls it.
function ownersOf(defs: Definition[]): Map<string, Definition[]> {
  const publicByFile = new Map<string, Definition[]>();
  for (const d of defs)
    if (!isPrivate(d))
      publicByFile.set(d.file, [...(publicByFile.get(d.file) ?? []), d]);
  const out = new Map<string, Definition[]>();
  for (const d of defs) {
    if (!isPrivate(d)) continue;
    const os = (publicByFile.get(d.file) ?? []).filter((o) =>
      o.body.includes(d.name),
    );
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
  const entries = hits.flatMap(
    (h) => byFile.get(h.file_path.split("/").at(-1) ?? "") ?? [],
  );
  for (const d of entries) {
    add(d);
    for (const o of owners.get(key(d)) ?? []) add(o);
  }
  return order;
}

// A helper defined in a test file is rarely the thing to reuse.
export const isTest = (d: Pick<Definition, "file">) =>
  /(^|\/)(tests?|spec|__tests__)\/|[._-]test\.|_spec\./.test(d.file);

const prior = (d: Definition, p: RetrievalConfig["priors"]): number =>
  (d.public ? p.public : 0) +
  (d.doc ? p.documented : 0) +
  (isPrivate(d) ? p.private : 0) +
  (isTest(d) ? p.test : 0);

// Reranker log-odds + priors; a helper's evidence also counts for its owners.
function finalScores(
  order: Definition[],
  raw: number[],
  owners: Map<string, Definition[]>,
  priors: RetrievalConfig["priors"],
): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (k: string, v: number) =>
    out.set(k, Math.max(out.get(k) ?? -99, v));
  order.forEach((d, i) => {
    const r = raw[i] ?? 0;
    bump(key(d), r + prior(d, priors));
    for (const o of owners.get(key(d)) ?? []) bump(key(o), r + priors.public);
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
    cards.set(k, {
      ...(better ? d : prev),
      score: better ? s : prev.score,
      methods: (prev?.methods ?? 0) + 1,
    });
  }
  return [...cards.values()].sort((a, b) => b.score - a.score);
}

export function strengthOf(
  best: number,
  reranked: boolean,
  t: Thresholds,
): DefinitionAnswer["strength"] {
  if (!reranked) return "unranked";
  if (best >= t.strong) return "strong";
  return best >= t.likely ? "likely" : "none";
}

// The first line that says what it does: Julia/Python docstrings usually open with a copy of the
// signature (already on the card) and rulers; skip those.
export function firstLine(name: string, doc: string): string {
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
      const tags = [
        c.lang,
        c.kind.replace(/_definition$/, ""),
        c.public ? "public" : "",
        c.methods > 1 ? `${c.methods} methods` : "",
      ]
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
