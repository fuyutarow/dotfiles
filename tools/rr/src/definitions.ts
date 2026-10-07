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
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { typesafeKey } from "../../shared/src/typesafe-key.ts";
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

function configuredString(
  value: unknown,
  key: string,
): Result<string | undefined, Error> {
  if (value === undefined) return ok(undefined);
  if (typeof value === "string") return ok(value);
  return err(new Error(`${key} must be a string when present`));
}

const CONFIG = join(import.meta.dir, "..", "retrieval.toml");
const JEV_TIMEOUT_MS = 20_000;
const JEV_RETRIES = 3; // 429 / 529, exponential backoff — the API reference's guidance

type Table = Record<string, unknown>;
const TableSchema = z.record(z.string(), z.unknown());
const asTable = (v: unknown): Table | undefined =>
  TableSchema.safeParse(v).data;
const NoEgressSchema = z.array(z.string());
const expandHome = (value: string): string =>
  value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
const definitionId = (index: number): string =>
  `C${String(index).padStart(2, "0")}`;
const clampProbability = (p: number): number =>
  Math.min(1 - 1e-4, Math.max(1e-4, p));

// retrieval.toml, validated: a wrong value names the key and stops, never a guessed default.
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function loadRetrievalConfig(
  path = CONFIG,
): Result<RetrievalConfig, Error> {
  const text = fromThrowable(() => readFileSync(path, "utf8"), asError)();
  if (text.isErr()) return err(text.error);
  const parsed = fromThrowable(
    (): unknown => Bun.TOML.parse(text.value),
    asError,
  )();
  if (parsed.isErr()) return err(parsed.error);
  const parsedToml = parsed.value;
  const raw = asTable(parsedToml) ?? {};
  const d = asTable(raw.definition) ?? {};
  const fail = (key: string, want: string): Error =>
    new Error(`${path}: definition.${key} must be ${want}`);
  const num = (t: Table, key: string, at: string): Result<number, Error> => {
    const v = t[key];
    return typeof v === "number" && Number.isFinite(v)
      ? ok(v)
      : err(fail(`${at}${key}`, "a finite number"));
  };
  const count = (key: string): Result<number, Error> => {
    const v = d[key];
    return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 200
      ? ok(v)
      : err(fail(key, "an integer in 1..200"));
  };
  const table = (t: unknown, key: string): Result<Table, Error> => {
    const value = asTable(t);
    return value === undefined ? err(fail(key, "a table")) : ok(value);
  };

  const recallCount = count("recall");
  if (recallCount.isErr()) return err(recallCount.error);
  const pool = count("pool");
  if (pool.isErr()) return err(pool.error);
  if (pool.value > recallCount.value)
    return err(fail("pool", `at most recall (${recallCount.value})`));

  const p = table(d.priors, "priors");
  if (p.isErr()) return err(p.error);
  const publicPrior = num(p.value, "public", "priors.");
  if (publicPrior.isErr()) return err(publicPrior.error);
  const documentedPrior = num(p.value, "documented", "priors.");
  if (documentedPrior.isErr()) return err(documentedPrior.error);
  const privatePrior = num(p.value, "private", "priors.");
  if (privatePrior.isErr()) return err(privatePrior.error);
  const testPrior = num(p.value, "test", "priors.");
  if (testPrior.isErr()) return err(testPrior.error);
  const priors = {
    public: publicPrior.value,
    documented: documentedPrior.value,
    private: privatePrior.value,
    test: testPrior.value,
  };

  const judgeValue = d.judge;
  if (judgeValue !== "jev" && judgeValue !== "local")
    return err(fail("judge", '"jev" or "local"'));
  const judge: Judge = judgeValue === "jev" ? "jev" : "local";
  const endpoints = table(d.jev_endpoints, "jev_endpoints");
  if (endpoints.isErr()) return err(endpoints.error);
  const providerValue = d.jev_provider;
  const provider =
    typeof providerValue === "string" ? providerValue : undefined;
  if (provider === undefined)
    return err(fail("jev_provider", "a configured provider"));
  const e = asTable(endpoints.value[provider]);
  if (e === undefined)
    return err(
      fail(
        "jev_provider",
        `one of [definition.jev_endpoints.*] (${Object.keys(endpoints.value).join(", ")})`,
      ),
    );
  const urlValue = e.url;
  const url = typeof urlValue === "string" ? urlValue : undefined;
  if (url === undefined)
    return err(fail(`jev_endpoints.${provider}.url`, "an https:// URL"));
  if (!url.startsWith("https://"))
    return err(fail(`jev_endpoints.${provider}.url`, "an https:// URL"));
  const model = configuredString(e.model, `jev_endpoints.${provider}.model`);
  if (model.isErr()) return err(model.error);
  const whenExhausted = configuredString(
    e.when_exhausted,
    `jev_endpoints.${provider}.when_exhausted`,
  );
  if (whenExhausted.isErr()) return err(whenExhausted.error);
  const jevEndpoint: JevEndpoint = { url };
  if (model.value !== undefined) jevEndpoint.model = model.value;
  if (whenExhausted.value !== undefined)
    jevEndpoint.whenExhausted = whenExhausted.value;

  const noEgress = NoEgressSchema.safeParse(d.no_egress);
  const noEgressPaths = noEgress.success ? noEgress.data : undefined;
  if (noEgressPaths === undefined)
    return err(fail("no_egress", "a list of paths"));

  const ths = table(d.thresholds, "thresholds");
  if (ths.isErr()) return err(ths.error);
  const thresholdsOf = (j: Judge): Result<Thresholds, Error> => {
    const t = table(ths.value[j], `thresholds.${j}`);
    if (t.isErr()) return err(t.error);
    const at = `thresholds.${j}.`;
    const strong = num(t.value, "strong", at);
    if (strong.isErr()) return err(strong.error);
    const likely = num(t.value, "likely", at);
    if (likely.isErr()) return err(likely.error);
    const hook = num(t.value, "hook", at);
    if (hook.isErr()) return err(hook.error);
    const th = { strong: strong.value, likely: likely.value, hook: hook.value };
    // Ordered bands: below likely = absent, likely..strong = read first, strong.. = this one.
    if (!(th.likely < th.strong))
      return err(fail(`${at}likely`, "below strong"));
    if (!(th.hook >= th.strong))
      return err(fail(`${at}hook`, "at least strong"));
    return ok(th);
  };
  const jevThresholds = thresholdsOf("jev");
  if (jevThresholds.isErr()) return err(jevThresholds.error);
  const localThresholds = thresholdsOf("local");
  if (localThresholds.isErr()) return err(localThresholds.error);
  const thresholds: Record<Judge, Thresholds> = {
    jev: jevThresholds.value,
    local: localThresholds.value,
  };

  return ok({
    recall: recallCount.value,
    pool: pool.value,
    priors,
    judge,
    jevEndpoint,
    noEgress: noEgressPaths.map((entry) => expandHome(entry)),
    thresholds,
  });
}

function judgeFor(project: string, cfg: RetrievalConfig): Judge {
  const real = realpathSync(project);
  const blocked = cfg.noEgress.some(
    (p) => real === p || real.startsWith(`${p.replace(/\/$/u, "")}/`),
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
function cccPython(): Result<string, Error> {
  const executable = requireExecutable("ccc");
  if (executable.isErr()) return err(executable.error);
  const resolved = fromThrowable(
    () => realpathSync(executable.value),
    asError,
  )();
  if (resolved.isErr()) return err(resolved.error);
  const shebangLine = fromThrowable(
    () => readFileSync(resolved.value, "utf8").split("\n", 1)[0] ?? "",
    asError,
  )();
  if (shebangLine.isErr()) return err(shebangLine.error);
  const py = shebangLine.value.startsWith("#!/")
    ? shebangLine.value.slice(2).trim()
    : "";
  return /\/python[0-9.]*$/u.test(py)
    ? ok(py)
    : err(
        new Error(
          `cannot find ccc's Python interpreter (shebang of ${resolved.value})`,
        ),
      );
}

async function git(project: string, args: string[]): Promise<string | null> {
  const result = await fromAsyncThrowable(
    () => runChildCaptured(["git", "-C", project, ...args], 15_000, false),
    asError,
  )();
  return result.match(
    (r) => (r.exitCode === 0 ? r.stdout : null),
    () => null,
  );
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
  ].filter((p) => /\.(jl|py|ts|tsx|js|mjs|rs)$/u.test(p));
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

// A JSON file's content, decoded and validated by the caller's schema in one zod step. A file that
// does not match is an error NAMING the file (callers already treat an error here as "no catalog").
function readJsonOf<S extends z.ZodType>(
  schema: S,
  path: string,
): Result<z.output<S>, Error> {
  const text = fromThrowable(() => readFileSync(path, "utf8"), asError)();
  if (text.isErr()) return err(text.error);
  const parsed = jsonOf(schema).safeParse(text.value);
  return parsed.success
    ? ok(parsed.data)
    : err(new Error(`${path}: ${parsed.error.message}`));
}

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

function loadDefinitions(cachePath: string): Result<
  {
    defs: Definition[];
    files: string[];
  },
  Error
> {
  const cache = readJsonOf(DefsCacheSchema, cachePath);
  if (cache.isErr()) return err(cache.error);
  const publics = new Set(
    Object.values(cache.value.files).flatMap((f) => f.publics),
  );
  const defs = Object.values(cache.value.files).flatMap((f) =>
    f.records.map((r) => ({ ...r, public: r.public || publics.has(r.name) })),
  );
  return ok({ defs, files: Object.keys(cache.value.files) });
}

const statKey = (project: string, rel: string): string => {
  const st = statSync(join(project, rel), { throwIfNoEntry: false });
  return st !== undefined ? `${st.size} ${st.mtimeMs}` : "gone";
};

type Catalog = {
  dir: string;
  defs: Definition[];
  byFile: Map<string, Definition[]>;
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
): Promise<Result<Catalog, Error>> {
  const directory = fromThrowable(() => catalogDir(project), asError)();
  if (directory.isErr()) return err(directory.error);
  const dir = directory.value;
  const metaPath = join(dir, "catalog.json");
  const recordsPath = join(dir, "records.json");
  const meta = readJsonOf(MetaSchema, metaPath).match(
    (value) => value,
    () => null,
  );
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
    const scanned = fromThrowable(
      () =>
        Object.entries(meta.files)
          .filter(([rel, k]) => statKey(project, rel) !== k)
          .map(([rel]) => rel),
      asError,
    )();
    if (scanned.isErr()) return err(scanned.error);
    only = scanned.value;
    checkedAt = meta.checkedAt;
  } else if (meta !== null && existsSync(recordsPath)) {
    only = await changedSince(project, meta.head);
  }
  if (recent && only?.length === 0) return readCatalog(dir);
  const rebuiltResult = await rebuild(dir, project, only);
  if (rebuiltResult.isErr()) return err(rebuiltResult.error);
  const rebuilt = rebuiltResult.value;
  const filesResult = fromThrowable(
    () =>
      Object.fromEntries(
        rebuilt.files.map((rel) => [rel, statKey(project, rel)]),
      ),
    asError,
  )();
  if (filesResult.isErr()) return err(filesResult.error);
  const files = filesResult.value;
  const written = writeAtomic(
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
  if (written.isErr()) return err(written.error);
  notes.push(
    `catalog ${meta !== null ? "refreshed" : "built"}: ${rebuilt.count} definitions` +
      (only === null ? " (full scan)" : ` (${only.length} changed path(s))`),
  );
  return readCatalog(dir);
}

function readCatalog(dir: string): Result<Catalog, Error> {
  const records = readJsonOf(RecordsSchema, join(dir, "records.json"));
  if (records.isErr()) return err(records.error);
  const byFile = new Map(Object.entries(records.value));
  return ok({ dir, defs: [...byFile.values()].flat(), byFile });
}

// Re-extract (changed files only — ccc_defs.py keeps a per-file cache), rewrite the catalog's
// entries, and index it. Files are content-named, so unchanged definitions are never re-embedded.
async function rebuild(
  dir: string,
  project: string,
  only: string[] | null,
): Promise<Result<{ count: number; files: string[] }, Error>> {
  const cachePath = join(dir, "defs-cache.json");
  const onlyPath = join(dir, `only.${process.pid}.json`);
  const setup = fromThrowable(() => {
    if (only !== null) writeFileSync(onlyPath, JSON.stringify(only));
    mkdirSync(join(dir, "defs"), { recursive: true });
    mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
    const settings = join(dir, ".cocoindex_code/settings.yml");
    if (!existsSync(settings)) {
      writeFileSync(
        settings,
        "include_patterns:\n- 'defs/**/*.md'\nexclude_patterns:\n- '**/.cocoindex_code'\n",
      );
    }
  }, asError)();
  if (setup.isErr()) return err(setup.error);
  const onlyArgs =
    only !== null && existsSync(cachePath) ? ["--only", onlyPath] : [];
  const python = cccPython();
  if (python.isErr()) return err(python.error);
  const extract = await fromAsyncThrowable(
    () =>
      runChildCaptured(
        [python.value, SCRIPT, project, cachePath, cachePath, ...onlyArgs],
        600_000,
        false,
      ),
    asError,
  )();
  if (extract.isErr()) return err(extract.error);
  const cleanup = fromThrowable(() => {
    if (only !== null && existsSync(onlyPath)) unlinkSync(onlyPath);
  }, asError)();
  if (cleanup.isErr()) return err(cleanup.error);
  if (extract.value.exitCode !== 0)
    return err(
      new Error(
        `ccc_defs.py failed: ${extract.value.stderr.trim().slice(-400)}`,
      ),
    );
  const definitions = loadDefinitions(cachePath);
  if (definitions.isErr()) return err(definitions.error);
  const { defs, files } = definitions.value;
  const wanted = new Map<string, Definition[]>();
  let written = 0;
  const generated = fromThrowable(() => {
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
    return stale;
  }, asError)();
  if (generated.isErr()) return err(generated.error);
  const stale = generated.value;
  const recordsWrite = writeAtomic(
    join(dir, "records.json"),
    JSON.stringify(Object.fromEntries(wanted)),
  );
  if (recordsWrite.isErr()) return err(recordsWrite.error);
  // An edit that only moved definitions (line numbers live in records.json, not in the indexed
  // text) changes no catalog file: nothing to embed, no daemon round trip.
  if (written + stale.length > 0) {
    const ccc = requireExecutable("ccc");
    if (ccc.isErr()) return err(ccc.error);
    const index = await fromAsyncThrowable(
      () => runChildCaptured([ccc.value, "index"], 900_000, false, dir),
      asError,
    )();
    if (index.isErr()) return err(index.error);
    if (index.value.exitCode !== 0)
      return err(
        new Error(
          `catalog index failed: ${index.value.stderr.trim().slice(-400)}`,
        ),
      );
  }
  return ok({ count: defs.length, files });
}

// A reader in another session must never see half a file.
function writeAtomic(path: string, text: string): Result<void, Error> {
  const tmp = `${path}.${process.pid}.tmp`;
  return fromThrowable(() => {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  }, asError)();
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
): Promise<Result<Hit[], Error>> {
  const ccc = requireExecutable("ccc");
  if (ccc.isErr()) return err(ccc.error);
  const result = await fromAsyncThrowable(
    () =>
      runChildCaptured(
        [ccc.value, "search", "--json", "--limit", String(limit), query],
        120_000,
        false,
        dir,
      ),
    asError,
  )();
  if (result.isErr()) return err(result.error);
  const r = result.value;
  if (r.exitCode !== 0)
    return err(
      new Error(`catalog search failed: ${r.stderr.trim().slice(-400)}`),
    );
  const found = jsonOf(SearchSchema).safeParse(r.stdout);
  return found.success
    ? ok(found.data.results)
    : err(
        new Error(
          `catalog search printed no result list: ${found.error.message}`,
        ),
      );
}

const rerankSocket = (): string =>
  join(homedir(), ".cache/repo-retrieve/rerank.sock");

export type RerankResult =
  | { scores: number[]; reason?: undefined }
  | { reason: string; scores?: undefined };

// rerank_server.py's one-line reply. A field of the wrong type counts as absent.
const optionalParsed = <S extends z.ZodType>(schema: S) =>
  z
    .unknown()
    .transform((value): z.output<S> | undefined => {
      const parsed = schema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    })
    .optional();

const RerankReplySchema = z.object({
  scores: optionalParsed(z.array(z.number())),
  error: optionalParsed(z.string()),
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
  const timer = setTimeout(() => {
    done({ reason: `no answer within ${RERANK_TIMEOUT_MS} ms` });
  }, RERANK_TIMEOUT_MS);
  function done(v: RerankResult): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(v);
  }
  const finish = () => {
    const line = reply.split("\n", 1)[0] ?? "";
    const r = jsonOf(RerankReplySchema).safeParse(line).data;
    if (r?.scores !== undefined && r.scores.length === docs.length) {
      done({ scores: r.scores });
      return;
    }
    done({
      reason:
        r?.error !== undefined
          ? `reranker: ${r.error}`
          : "reranker closed without an answer",
    });
  };
  // A large request does not fit one write: Bun's socket.write sends what the kernel buffer takes
  // and returns that count; the rest goes out on `drain` (measured 2026-10-01: 30 candidates were
  // silently cut, the server never saw the newline, every rerank failed).
  let pending = Buffer.from(`${JSON.stringify({ query, docs })}\n`);
  const flush = (s: { write: (b: Buffer) => number }): void => {
    const n = s.write(pending);
    pending = pending.subarray(n);
  };
  const connected = await fromAsyncThrowable(
    () =>
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
            finish();
            s.end();
          },
          close: () => {
            finish();
          },
          error: (_s, e) => {
            done({ reason: `reranker socket error: ${String(e)}` });
          },
        },
      }),
    asError,
  )();
  if (connected.isErr())
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
  d.name.startsWith("_") || /_(kernel|impl|inner|helper)!?$/u.test(d.name);
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
): Promise<Result<DefinitionAnswer, Error>> {
  const notes: string[] = [];
  const directory = fromThrowable(() => catalogDir(project), asError)();
  if (directory.isErr()) return err(directory.error);
  const catalogPath = directory.value;
  if (!refresh && !existsSync(join(catalogPath, "records.json"))) {
    return ok({
      cards: [],
      strength: "none",
      best: -99,
      reranked: false,
      judge: "none",
      catalogSize: 0,
      notes: ["no catalog yet"],
    });
  }
  const catalog = refresh
    ? await refreshCatalog(project, notes)
    : readCatalog(catalogPath);
  if (catalog.isErr()) return err(catalog.error);
  const { dir, defs, byFile } = catalog.value;
  const cfg = loadRetrievalConfig();
  if (cfg.isErr()) return err(cfg.error);
  const hits = await recall(dir, query, cfg.value.recall);
  if (hits.isErr()) return err(hits.error);

  const owners = ownersOf(defs);
  const order = candidates(hits.value, byFile, owners, exclude).slice(
    0,
    cfg.value.pool,
  );
  const judged = await fromAsyncThrowable(
    () =>
      judgeCandidates(
        query,
        order.map((definition) => rerankText(definition)),
        judgeFor(project, cfg.value),
        cfg.value.jevEndpoint,
        notes,
      ),
    asError,
  )();
  if (judged.isErr()) return err(judged.error);
  const { judge, result } = judged.value;
  const scores = result.scores ?? null;
  const reranked = scores !== null;
  if (result.reason !== undefined)
    notes.push(`embedding order only — ${result.reason}`);
  // Unjudged: a descending stand-in keeps embedding order; strength is "unranked" regardless.
  const raw = scores ?? order.map((_, i) => order.length - i);
  const ranked = toCards(
    order,
    finalScores(order, raw, owners, cfg.value.priors),
  ).slice(0, limit);
  const best = ranked[0]?.score ?? -99;
  return ok({
    cards: ranked,
    strength: strengthOf(best, reranked, cfg.value.thresholds[judge]),
    best,
    reranked,
    judge: reranked ? judge : "none",
    catalogSize: defs.length,
    notes,
  });
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
  // One key lookup for every Jev caller (tools/shared/src/typesafe-key.ts: env, then fnox, then the
  // dotenv file). This file had its own copy without fnox, so on a machine whose key lives in fnox
  // `rr` reported "Jev unavailable" while agent-router used Jev (2026-10-06).
  const lookup = typesafeKey();
  if (!lookup.ok) return { reason: lookup.reason };
  const apiKey = lookup.key;
  const body = JSON.stringify({
    ...(endpoint.model === undefined ? {} : { model: endpoint.model }),
    state: Object.fromEntries(docs.map((d, i) => [definitionId(i), d])),
    questions: Object.fromEntries(
      docs.map((_, i) => [
        definitionId(i),
        {
          type: "noul",
          instructions: `Does the code definition ${definitionId(i)} already implement what this developer needs: "${query}"?`,
        },
      ]),
    ),
  });
  for (let attempt_ = 0; attempt_ <= JEV_RETRIES; attempt_ += 1) {
    const response = await fromAsyncThrowable(
      () =>
        fetch(endpoint.url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
        }),
      asError,
    )();
    if (response.isErr())
      return { reason: `request failed: ${String(response.error)}` };
    const res = response.value;
    const status = res.status;
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
    const answerText = await fromAsyncThrowable(() => res.text(), asError)();
    const answered = answerText.match(
      (text) => text,
      () => "",
    );
    const json = jsonOf(JevAnswerSchema).safeParse(answered).data;
    const ps = docs.map((_, i) => json?.answers?.[definitionId(i)]?.noul);
    const numbers = ps.flatMap((p) => (typeof p === "number" ? [p] : []));
    if (numbers.length !== ps.length) return { reason: "malformed answer" };
    return {
      scores: numbers.map((p) =>
        Math.log(clampProbability(p) / (1 - clampProbability(p))),
      ),
    };
  }
  return { reason: "still rate-limited after retries" };
}

// The candidates the second stage would score, with the exact text it would read — for comparing
// second-stage backends on the same input (bench, experiments).
export async function candidatePool(
  project: string,
  query: string,
): Promise<Result<{ name: string; text: string; def: Definition }[], Error>> {
  const cfg = loadRetrievalConfig();
  if (cfg.isErr()) return err(cfg.error);
  const catalog = await refreshCatalog(project, []);
  if (catalog.isErr()) return err(catalog.error);
  const { dir, defs, byFile } = catalog.value;
  const hits = await recall(dir, query, cfg.value.recall);
  if (hits.isErr()) return err(hits.error);
  const order = candidates(hits.value, byFile, ownersOf(defs)).slice(
    0,
    cfg.value.pool,
  );
  return ok(
    order.map((def) => ({ name: def.name, text: rerankText(def), def })),
  );
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
    if (seen.has(key(d)) || exclude?.(d) === true) return;
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
  /(^|\/)(tests?|spec|__tests__)\/|[._-]test\.|_spec\./u.test(d.file);

const prior = (d: Definition, p: RetrievalConfig["priors"]): number =>
  (d.public ? p.public : 0) +
  (d.doc !== "" ? p.documented : 0) +
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
    const better = prev === undefined || s > prev.score;
    cards.set(k, {
      ...(better ? d : prev),
      score: better ? s : prev.score,
      methods: (prev?.methods ?? 0) + 1,
    });
  }
  return [...cards.values()].toSorted((a, b) => b.score - a.score);
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
        !/^[-=*_`#]{3,}/u.test(l) &&
        !l.startsWith(`${name}(`) &&
        !l.startsWith(`${name} `) &&
        !/^(function|struct|macro|def|fn|export)\b/u.test(l),
    );
  return (said ?? "").slice(0, 160);
}

export function renderCards(a: DefinitionAnswer): string {
  return a.cards
    .map((c, i) => {
      const tags = [
        c.lang,
        c.kind.replace(/_definition$/u, ""),
        c.public ? "public" : "",
        c.methods > 1 ? `${c.methods} methods` : "",
      ]
        .filter((tag) => tag !== "")
        .join(", ");
      const doc = firstLine(c.name, c.doc);
      return [
        `${i + 1}. ${c.name}  (${tags})  ${c.file}:${c.start}`,
        `   ${c.signature.slice(0, 160)}`,
        ...(doc !== "" ? [`   ${doc}`] : []),
      ].join("\n");
    })
    .join("\n");
}
