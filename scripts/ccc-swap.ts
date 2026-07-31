// scripts/ccc-swap.ts — blue-green model swap for ccc (cocoindex-code).
//
// Problem this replaces: swapping the embedding model in global_settings.yml and then running
// `ccc reset --force && ccc index` in every project destroys the OLD index before the NEW one
// exists — search is dead for the whole rebuild, and a rollback costs another full rebuild.
//
// This tool builds every project's NEW index OUT OF BAND (a shadow ccc settings home + a
// per-project DB redirect) while the live indexes keep serving searches untouched, then swaps
// the new indexes in with a directory rename (near-instant) and a single daemon restart.
//
// Verified against the installed cocoindex-code 0.2.39
// (~/.local/share/uv/tools/cocoindex-code/lib/python3.12/site-packages/cocoindex_code/
// {settings,client,cli,daemon,indexer}.py, read 2026-07-30 — the stale 0.1.10 copy under
// ~/.cache/uv/archive-v0/ was NOT consulted):
//   - COCOINDEX_CODE_DIR overrides settings.user_settings_dir() (default ~/.cocoindex_code),
//     which _daemon_paths.daemon_runtime_dir() falls back to -> a shadow value gives shadow
//     `ccc index` calls an INDEPENDENT daemon (own socket/pid/log), never the live one.
//   - COCOINDEX_CODE_DB_PATH_MAPPING ("source=target[,source=target...]") is read LAZILY and
//     CACHED for the lifetime of whichever process reads it first (settings.py's
//     `_db_path_mapping` module global). The actual DB write path (settings.resolve_db_dir) is
//     evaluated inside the DAEMON process (daemon.py/indexer.py import target_sqlite_db_path),
//     not the short-lived `ccc` CLI client — and client.py's start_daemon() spawns the daemon
//     via `subprocess.Popen(cmd, ...)` with no `env=`, i.e. it inherits the parent's env
//     ONCE, at spawn time, for the daemon's whole lifetime. Consequence: build() always stops
//     any pre-existing shadow daemon before indexing and passes ONE
//     COCOINDEX_CODE_DB_PATH_MAPPING covering every discovered project, so a daemon (re)started
//     mid-run never ends up running with a stale/partial mapping from an earlier invocation.
//   - Project discovery (settings.find_project_root walks up for `.cocoindex_code/settings.yml`)
//     is NOT affected by either env var above — it always resolves against the real project
//     tree. So `ccc index` must be spawned with cwd = the LIVE project root even while writing
//     shadow DB files; the project's settings.yml is only ever READ from the live project by
//     `ccc index` itself, never written (auto_init never fires — the project is already
//     initialized, that is the definition of "discovered").
//   - `ccc index` takes no --path; project selection is 100% cwd-driven (cli.py `index()` calls
//     `require_project_root()`).
//   - The embedding dimension is frozen into the vec0 DDL (`embedding float[N]` inside the
//     `code_chunks_vec` CREATE VIRTUAL TABLE text in sqlite_master — readable WITHOUT loading
//     the vec0 extension; confirmed against this host's own target_sqlite.db). The actual row
//     count is NOT readable through the virtual table without that extension (bun:sqlite has no
//     vec0 loaded -> "no such module: vec0"), but IS readable from the plain shadow table
//     `code_chunks_vec_rowids` that vec0 maintains alongside it (also confirmed live).
//   - ccc's installed package has no static model -> dimension table (embedder_defaults.py only
//     curates indexing/query *params*, and only for `ccc init`); learning a dimension without
//     this tool's own DDL read would mean loading the actual model. discover() therefore infers
//     the fleet's expected dimension as the MAJORITY (mode) dimension across already-indexed
//     discovered projects — documented as a heuristic in its own output line, not asserted as
//     ground truth.
//
// Consumer: human/agent running this by hand. Output is verdict-style lines (PROJECT:/PLAN:/
// RESULT:/REFUSE:/BUILD:/CUTOVER:/ROLLBACK:/GC:), not a machine envelope.
//
// Exit: 0 clean (dry run with nothing to flag, or a mutating run that fully succeeded) /
// 1 findings (discover mismatch, a build/cutover/rollback partial failure, or a cutover
// refusal) / 2 environment-FATAL (bad flags, ccc binary missing, malformed global_settings.yml,
// a live index that changed during build — that last one should never happen and is a bug).

import { existsSync, readdirSync, statSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { typeFlag } from "type-flag";

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const SETTINGS_DIR_NAME = ".cocoindex_code";
const PROJECT_SETTINGS_FILE = "settings.yml";
const GLOBAL_SETTINGS_FILE = "global_settings.yml";
const TARGET_SQLITE_DB = "target_sqlite.db";
const PREV_DIR_RE = /^\.cocoindex_code\.prev-(\d+)$/;

function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
    throw new Error(`Unknown option '--${flag}'`);
  }
}

/** A present flag with no value becomes '' under a raw String parser; throw instead. */
function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new Error(`${flag} requires a value`);
    return value;
  };
}

// Infra denylist: package-manager / tool caches that structurally cannot hold a hand-registered
// ccc project (their trees are owned and regenerated by their own tool) and are large enough
// (44G+ measured for ~/.cache on this host) that walking them turns `discover` into a
// multi-minute crawl for zero coverage. This is a directory-BASENAME denylist, NOT a project
// allowlist — it does not exclude any directory a real project could live in (Workspace, DPP,
// MM, ... all still walk normally, anywhere under $HOME). node_modules/.git are the two the
// task text mandates; the rest are this host's measured offenders. Extend with --exclude.
const DEFAULT_EXCLUDE_DIR_NAMES = [
  "node_modules",
  ".git",
  ".cache",
  ".rustup",
  ".cargo",
  ".npm",
  ".bun",
];

// Sentence-transformers model load + first embed can be slow (cold HF cache, CPU inference);
// 30 minutes/project is generous headroom, not a target.
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_KEEP = 1;

// ---------------------------------------------------------------------------------------------
// Pure / testable helpers
// ---------------------------------------------------------------------------------------------

export function resolveHome(homeFlag: string | undefined): string {
  const home = homeFlag ?? process.env.HOME ?? homedir();
  if (!home) throw new Error("cannot resolve $HOME (pass --home)");
  return resolve(home);
}

export function resolveShadowDir(
  home: string,
  shadowDirFlag: string | undefined,
): string {
  return resolve(shadowDirFlag ?? join(home, ".cache", "ccc-shadow"));
}

// Mirrors settings.user_settings_dir(): COCOINDEX_CODE_DIR overrides, else `$HOME/.cocoindex_code`.
export function resolveLiveSettingsDir(
  home: string,
  envOverride: string | undefined,
): string {
  return resolve(envOverride ?? join(home, SETTINGS_DIR_NAME));
}

/**
 * Recursive walk from `searchRoot` for every directory literally named `.cocoindex_code` that
 * also holds a `settings.yml` (ccc's own project marker — settings.find_project_root requires
 * both). Returns each project's ROOT (the parent of `.cocoindex_code`), sorted. Never follows
 * symlinks (loop/escape risk); prunes by directory basename and by absolute-path prefix, and
 * never recurses INTO a matched `.cocoindex_code` (large LMDB/sqlite content, and it cannot
 * nest another project marker ccc itself would recognize).
 */
export function discoverProjects(
  searchRoot: string,
  opts: { excludeDirNames?: string[]; excludeAbsolutePaths?: string[] } = {},
): string[] {
  const excludeNames = new Set(
    opts.excludeDirNames ?? DEFAULT_EXCLUDE_DIR_NAMES,
  );
  const excludeAbs = (opts.excludeAbsolutePaths ?? []).map((p) => resolve(p));
  const found: string[] = [];

  const isPruned = (dir: string): boolean =>
    excludeAbs.some((ex) => dir === ex || dir.startsWith(`${ex}/`));

  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission denied / vanished mid-walk — skip, never crash discover
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (entry.name === SETTINGS_DIR_NAME) {
        if (existsSync(join(full, PROJECT_SETTINGS_FILE))) found.push(dir);
        continue;
      }
      if (excludeNames.has(entry.name) || isPruned(full)) continue;
      walk(full);
    }
  };

  const root = resolve(searchRoot);
  if (!isPruned(root)) walk(root);
  return found.sort();
}

export function dirSizeBytes(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          total += statSync(full).size;
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  }
  return total;
}

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

/** Parses the `embedding float[N]` DDL fragment out of `code_chunks_vec`'s sqlite_master row. */
export function computeIndexDimension(
  targetSqliteDbPath: string,
): number | null {
  if (!existsSync(targetSqliteDbPath)) return null;
  let db: Database;
  try {
    db = new Database(targetSqliteDbPath, { readonly: true });
  } catch {
    return null;
  }
  try {
    const row = db
      .query(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'code_chunks_vec'",
      )
      .get() as { sql: string } | null;
    const match = row?.sql?.match(/embedding\s+float\[(\d+)\]/);
    if (!match?.[1]) return null;
    const dim = Number(match[1]);
    return Number.isFinite(dim) ? dim : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Row count of `code_chunks_vec_rowids` — a plain table, queryable without the vec0 extension. */
export function countIndexedRows(targetSqliteDbPath: string): number | null {
  if (!existsSync(targetSqliteDbPath)) return null;
  let db: Database;
  try {
    db = new Database(targetSqliteDbPath, { readonly: true });
  } catch {
    return null;
  }
  try {
    const row = db
      .query("SELECT COUNT(*) as n FROM code_chunks_vec_rowids")
      .get() as {
      n: number;
    } | null;
    return row ? row.n : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Majority-vote "expected" dimension across already-indexed projects; null-dim entries excluded. */
export function pickModeDimension(dims: Array<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const d of dims) {
    if (d === null) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [dim, count] of [...counts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    if (count > bestCount) {
      best = dim;
      bestCount = count;
    }
  }
  return best;
}

function isTopLevelKeyLine(line: string): string | null {
  if (line.startsWith("#")) return null;
  const match = line.match(/^(\S.*):\s*$/);
  return match?.[1] ?? null;
}

/**
 * Reads `embedding.model` out of a global_settings.yml TEXT without a YAML dependency — a
 * targeted line scan (find the unindented `embedding:` block, then its `model:` line) rather
 * than a full parse/re-dump, which would silently drop the file's hand-written comments (this
 * repo's own global_settings.yml carries a whole model-swap history in comments).
 */
export function readEmbeddingModel(yamlText: string): string | null {
  let inEmbeddingBlock = false;
  for (const line of yamlText.split("\n")) {
    const topKey = isTopLevelKeyLine(line);
    if (topKey !== null) {
      inEmbeddingBlock = topKey === "embedding";
      continue;
    }
    if (!inEmbeddingBlock) continue;
    const modelMatch = line.match(/^\s*model:\s*(.*)$/);
    if (modelMatch?.[1] !== undefined) return modelMatch[1].trim();
  }
  return null;
}

/** Same targeted scan as {@link readEmbeddingModel}, replacing the value instead of reading it. */
export function replaceEmbeddingModel(
  yamlText: string,
  newModel: string,
): string {
  let inEmbeddingBlock = false;
  let replaced = false;
  const out = yamlText.split("\n").map((line) => {
    if (replaced) return line;
    const topKey = isTopLevelKeyLine(line);
    if (topKey !== null) {
      inEmbeddingBlock = topKey === "embedding";
      return line;
    }
    if (!inEmbeddingBlock) return line;
    const modelMatch = line.match(/^(\s*model:\s*)(.*)$/);
    if (modelMatch?.[1] !== undefined) {
      replaced = true;
      return `${modelMatch[1]}${newModel}`;
    }
    return line;
  });
  if (!replaced) {
    throw new Error(
      "no 'embedding: / model:' block found in global_settings.yml — refusing to guess its shape",
    );
  }
  return out.join("\n");
}

export function parseChunksAndFiles(stdout: string): {
  chunks: number | null;
  files: number | null;
} {
  const chunksMatch = stdout.match(/Chunks:\s*(\d+)/);
  const filesMatch = stdout.match(/Files:\s*(\d+)/);
  return {
    chunks: chunksMatch?.[1] ? Number(chunksMatch[1]) : null,
    files: filesMatch?.[1] ? Number(filesMatch[1]) : null,
  };
}

/** Mirrors an absolute project path under the shadow tree — collision-free, no manifest needed. */
export function mirrorShadowDbDir(
  shadowDir: string,
  projectRoot: string,
): string {
  return join(shadowDir, "db", resolve(projectRoot));
}

export function buildDbPathMappingEnv(
  pairs: Array<{ source: string; target: string }>,
): string {
  return pairs.map(({ source, target }) => `${source}=${target}`).join(",");
}

export interface FileSnapshot {
  size: number;
  mtimeMs: number;
}

/** Recursive (relative-path -> size/mtime) snapshot, for the before/after safety diff. */
export function snapshotDir(dir: string): Map<string, FileSnapshot> {
  const snap = new Map<string, FileSnapshot>();
  if (!existsSync(dir)) return snap;
  const walk = (current: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        try {
          const st = statSync(full);
          snap.set(relative(dir, full), { size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  };
  walk(dir);
  return snap;
}

export function diffSnapshots(
  before: Map<string, FileSnapshot>,
  after: Map<string, FileSnapshot>,
): string[] {
  const changed: string[] = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of keys) {
    const b = before.get(key);
    const a = after.get(key);
    if (!b || !a || b.size !== a.size || b.mtimeMs !== a.mtimeMs)
      changed.push(key);
  }
  return changed.sort();
}

export interface PrevGeneration {
  dirName: string;
  timestamp: number;
  path: string;
}

/** `.cocoindex_code.prev-<ts>` siblings of a project root, newest first. */
export function listPrevGenerations(projectRoot: string): PrevGeneration[] {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const gens: PrevGeneration[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(PREV_DIR_RE);
    if (!match?.[1]) continue;
    gens.push({
      dirName: entry.name,
      timestamp: Number(match[1]),
      path: join(projectRoot, entry.name),
    });
  }
  return gens.sort((a, b) => b.timestamp - a.timestamp);
}

function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return env;
}

export interface CccRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Spawns the `ccc` binary with a NATIVE timeout (AbortSignal.timeout — never a hand-rolled
 * setTimeout+kill), draining stdout/stderr in one Promise.all alongside `proc.exited` (a
 * sequential drain deadlocks the moment either pipe fills), and reads the timeout off the
 * signal rather than `proc.killed` (true after a clean exit too — not a timeout detector).
 */
export async function runCcc(
  cccBin: string,
  args: string[],
  opts: { cwd?: string; env: Record<string, string>; timeoutMs: number },
): Promise<CccRunResult> {
  const signal = AbortSignal.timeout(opts.timeoutMs);
  const proc = Bun.spawn([cccBin, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode, timedOut: signal.aborted };
}

export async function stopDaemon(
  cccBin: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<CccRunResult> {
  return runCcc(cccBin, ["daemon", "stop"], { env, timeoutMs });
}

/** `rip` (house `rm` replacement, recoverable graveyard) when available, else a plain recursive rm. */
export async function removeDir(
  path: string,
  opts: { spawn?: typeof Bun.spawnSync } = {},
): Promise<void> {
  const spawn = opts.spawn ?? Bun.spawnSync;
  let ripOk = false;
  if (Bun.which("rip") !== null) {
    try {
      // bounded: a single fast filesystem rename into rip's own graveyard, never hangs
      const proc = spawn(["rip", path], { stdout: "ignore", stderr: "ignore" });
      ripOk = proc.exitCode === 0;
    } catch {
      ripOk = false;
    }
  }
  if (!ripOk) {
    await rm(path, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

interface Ctx {
  home: string;
  shadowDir: string;
  liveSettingsDir: string;
  excludeDirNames: string[];
  // `--exclude` values that name a PATH rather than a directory basename. Split because the
  // first cut routed every `--exclude` into excludeDirNames, which matches `entry.name` only —
  // so `--exclude /home/fuyu/Workspace` silently pruned nothing and the plan still listed all
  // 8 projects. A flag that quietly does nothing is worse than one that refuses.
  excludePaths: string[];
  cccBin: string | null;
  timeoutMs: number;
}

function projectDbPath(root: string): string {
  return join(root, SETTINGS_DIR_NAME, TARGET_SQLITE_DB);
}

async function cmdDiscover(ctx: Ctx): Promise<number> {
  const projects = discoverProjects(ctx.home, {
    excludeDirNames: ctx.excludeDirNames,
    excludeAbsolutePaths: [ctx.shadowDir, ...ctx.excludePaths],
  });

  if (projects.length === 0) {
    process.stdout.write(
      `RESULT: discover found 0 ccc projects under ${ctx.home}\n`,
    );
    return 0;
  }

  const rows = projects.map((root) => {
    const dbPath = projectDbPath(root);
    return {
      root,
      dim: computeIndexDimension(dbPath),
      chunks: countIndexedRows(dbPath),
      size: dirSizeBytes(join(root, SETTINGS_DIR_NAME)),
    };
  });

  const modeDim = pickModeDimension(rows.map((r) => r.dim));

  let mismatches = 0;
  for (const r of rows) {
    let status = "OK";
    if (r.dim === null) {
      status = "NOT_INDEXED";
    } else if (modeDim !== null && r.dim !== modeDim) {
      status = "MISMATCH";
      mismatches += 1;
    }
    process.stdout.write(
      `PROJECT ${r.root} size=${humanSize(r.size)} dim=${r.dim ?? "—"} chunks=${r.chunks ?? "—"} status=${status}\n`,
    );
  }

  process.stdout.write(
    `RESULT: discover found ${projects.length} project(s); inferred fleet dimension=${modeDim ?? "—"} ` +
      "(majority vote across indexed projects — ccc exposes no static model->dimension table, " +
      `learning it exactly would require loading the model); ${mismatches} mismatch(es)\n`,
  );
  return mismatches > 0 ? 1 : 0;
}

interface BuildPlan {
  root: string;
  shadowDbDir: string;
  alreadyBuilt: boolean;
}

async function cmdBuild(
  ctx: Ctx,
  flags: { model: string; force: boolean; yes: boolean },
): Promise<number> {
  const projects = discoverProjects(ctx.home, {
    excludeDirNames: ctx.excludeDirNames,
    excludeAbsolutePaths: [ctx.shadowDir, ...ctx.excludePaths],
  });
  if (projects.length === 0) {
    process.stdout.write(
      `RESULT: build found 0 projects under ${ctx.home} — nothing to do\n`,
    );
    return 0;
  }

  const liveGlobalSettingsPath = join(
    ctx.liveSettingsDir,
    GLOBAL_SETTINGS_FILE,
  );
  if (!existsSync(liveGlobalSettingsPath)) {
    process.stderr.write(
      `FATAL: live global settings not found: ${liveGlobalSettingsPath}\n`,
    );
    return 2;
  }
  const liveYaml = await readFile(liveGlobalSettingsPath, "utf8");
  let shadowYaml: string;
  try {
    shadowYaml = replaceEmbeddingModel(liveYaml, flags.model);
  } catch (error) {
    process.stderr.write(`FATAL: ${(error as Error).message}\n`);
    return 2;
  }

  const plans: BuildPlan[] = projects.map((root) => {
    const shadowDbDir = mirrorShadowDbDir(ctx.shadowDir, root);
    const rows = countIndexedRows(join(shadowDbDir, TARGET_SQLITE_DB));
    return { root, shadowDbDir, alreadyBuilt: (rows ?? 0) > 0 };
  });
  const toBuild = plans.filter((p) => flags.force || !p.alreadyBuilt);
  const skipped = plans.filter((p) => !flags.force && p.alreadyBuilt);

  process.stdout.write(`PLAN: shadow settings home = ${ctx.shadowDir}\n`);
  process.stdout.write(`PLAN: shadow model = ${flags.model}\n`);
  for (const p of skipped) {
    process.stdout.write(
      `PLAN ${p.root}: SKIP (shadow already built, non-empty — use --force)\n`,
    );
  }
  for (const p of toBuild) {
    process.stdout.write(`PLAN ${p.root}: BUILD -> ${p.shadowDbDir}\n`);
  }

  if (!flags.yes) {
    process.stdout.write(
      `RESULT: dry run — ${toBuild.length} project(s) would be built, ${skipped.length} skipped. Re-run with --yes.\n`,
    );
    return 0;
  }
  if (toBuild.length === 0) {
    process.stdout.write(
      `RESULT: nothing to build (${skipped.length} already built; pass --force to rebuild)\n`,
    );
    return 0;
  }
  if (!ctx.cccBin) {
    process.stderr.write(
      "FATAL: ccc executable not found (PATH or --ccc-bin)\n",
    );
    return 2;
  }
  const cccBin = ctx.cccBin;

  // Snapshot every discovered project's LIVE .cocoindex_code BEFORE touching anything, so the
  // safety property (build never writes to a live index) is PROVEN below, not asserted.
  const liveSnapshots = new Map(
    projects.map((root) => [root, snapshotDir(join(root, SETTINGS_DIR_NAME))]),
  );

  await mkdir(ctx.shadowDir, { recursive: true });
  await writeFile(
    join(ctx.shadowDir, GLOBAL_SETTINGS_FILE),
    shadowYaml,
    "utf8",
  );

  const mappingEnv = buildDbPathMappingEnv(
    plans.map((p) => ({ source: p.root, target: p.shadowDbDir })),
  );
  const shadowEnv: Record<string, string> = {
    ...baseEnv(),
    COCOINDEX_CODE_DIR: ctx.shadowDir,
    COCOINDEX_CODE_DB_PATH_MAPPING: mappingEnv,
  };

  // Always restart the shadow daemon fresh before indexing: COCOINDEX_CODE_DB_PATH_MAPPING is
  // read once and cached for the daemon PROCESS's whole lifetime (settings.py module global),
  // and the daemon's env is fixed at spawn time with no per-request update path (see the file
  // header). A shadow daemon left running from a PRIOR partial `build` (fewer projects, or a
  // different --model) would otherwise silently keep answering every project in THIS run with
  // its OLD mapping/model.
  await stopDaemon(cccBin, shadowEnv, ctx.timeoutMs);

  let built = 0;
  let failed = 0;
  for (const p of toBuild) {
    const start = performance.now();
    const result = await runCcc(cccBin, ["index"], {
      cwd: p.root,
      env: shadowEnv,
      timeoutMs: ctx.timeoutMs,
    });
    const elapsedS = ((performance.now() - start) / 1000).toFixed(1);
    if (result.timedOut) {
      failed += 1;
      process.stdout.write(
        `BUILD ${p.root}: FAILED (timed out after ${ctx.timeoutMs}ms)\n`,
      );
      continue;
    }
    if (result.exitCode !== 0) {
      failed += 1;
      process.stdout.write(
        `BUILD ${p.root}: FAILED (exit ${result.exitCode}) ${result.stderr.trim().slice(-500)}\n`,
      );
      continue;
    }
    const { chunks, files } = parseChunksAndFiles(result.stdout);
    try {
      await mkdir(p.shadowDbDir, { recursive: true });
      await copyFile(
        join(p.root, SETTINGS_DIR_NAME, PROJECT_SETTINGS_FILE),
        join(p.shadowDbDir, PROJECT_SETTINGS_FILE),
      );
    } catch (error) {
      process.stdout.write(
        `BUILD ${p.root}: WARN settings.yml copy failed: ${(error as Error).message}\n`,
      );
    }
    built += 1;
    process.stdout.write(
      `BUILD ${p.root}: chunks=${chunks ?? "—"} files=${files ?? "—"} elapsed=${elapsedS}s\n`,
    );
  }
  // Best-effort refresh for skipped (already-built) projects too, so their settings.yml copy
  // never goes stale across separate build runs — read-only on the live side either way.
  for (const p of skipped) {
    try {
      await mkdir(p.shadowDbDir, { recursive: true });
      await copyFile(
        join(p.root, SETTINGS_DIR_NAME, PROJECT_SETTINGS_FILE),
        join(p.shadowDbDir, PROJECT_SETTINGS_FILE),
      );
    } catch {
      /* best effort */
    }
  }

  const liveTouched: string[] = [];
  for (const root of projects) {
    const before = liveSnapshots.get(root);
    if (!before) continue;
    const diff = diffSnapshots(
      before,
      snapshotDir(join(root, SETTINGS_DIR_NAME)),
    );
    if (diff.length > 0) liveTouched.push(`${root}: ${diff.join(", ")}`);
  }
  if (liveTouched.length > 0) {
    process.stderr.write(
      `FATAL-SAFETY: live index(es) were modified during build:\n${liveTouched.join("\n")}\n`,
    );
    return 2;
  }
  process.stdout.write(
    `SAFETY: verified — live .cocoindex_code untouched for all ${projects.length} discovered project(s) (size+mtime snapshot before/after)\n`,
  );
  process.stdout.write(
    `RESULT: build ${failed === 0 ? "succeeded" : "had failures"} — ${built} built, ${skipped.length} skipped, ${failed} failed\n`,
  );
  return failed > 0 ? 1 : 0;
}

async function cmdCutover(ctx: Ctx, flags: { yes: boolean }): Promise<number> {
  const projects = discoverProjects(ctx.home, {
    excludeDirNames: ctx.excludeDirNames,
    excludeAbsolutePaths: [ctx.shadowDir, ...ctx.excludePaths],
  });
  if (projects.length === 0) {
    process.stdout.write(
      `RESULT: cutover found 0 projects under ${ctx.home} — nothing to do\n`,
    );
    return 0;
  }

  const shadowYamlPath = join(ctx.shadowDir, GLOBAL_SETTINGS_FILE);
  if (!existsSync(shadowYamlPath)) {
    process.stderr.write(
      `FATAL: no shadow global settings at ${shadowYamlPath} — run build first\n`,
    );
    return 2;
  }
  const shadowYaml = await readFile(shadowYamlPath, "utf8");
  const newModel = readEmbeddingModel(shadowYaml);
  if (!newModel) {
    process.stderr.write(
      `FATAL: could not read embedding.model from ${shadowYamlPath}\n`,
    );
    return 2;
  }

  const liveGlobalSettingsPath = join(
    ctx.liveSettingsDir,
    GLOBAL_SETTINGS_FILE,
  );
  if (!existsSync(liveGlobalSettingsPath)) {
    process.stderr.write(
      `FATAL: live global settings not found: ${liveGlobalSettingsPath}\n`,
    );
    return 2;
  }
  const liveYaml = await readFile(liveGlobalSettingsPath, "utf8");
  const previousModel = readEmbeddingModel(liveYaml);

  const checks = projects.map((root) => {
    const shadowDbDir = mirrorShadowDbDir(ctx.shadowDir, root);
    const shadowDb = join(shadowDbDir, TARGET_SQLITE_DB);
    const dim = computeIndexDimension(shadowDb);
    const rows = countIndexedRows(shadowDb);
    const hasSettings = existsSync(join(shadowDbDir, PROJECT_SETTINGS_FILE));
    const ready =
      existsSync(shadowDb) && dim !== null && (rows ?? 0) > 0 && hasSettings;
    return { root, shadowDbDir, shadowDb, dim, rows, hasSettings, ready };
  });

  const problems: string[] = [];
  for (const c of checks) {
    if (c.ready) continue;
    const reason = !existsSync(c.shadowDb)
      ? "no shadow index (missing)"
      : (c.rows ?? 0) === 0
        ? "shadow index is empty (0 rows)"
        : !c.hasSettings
          ? "shadow index has no settings.yml copy"
          : "shadow index dimension unreadable";
    problems.push(`${c.root}: ${reason}`);
  }
  const dims = new Set(checks.filter((c) => c.dim !== null).map((c) => c.dim));
  if (dims.size > 1) {
    problems.push(
      `shadow indexes disagree on dimension: ${checks.map((c) => `${c.root}=${c.dim ?? "—"}`).join(", ")}`,
    );
  }

  if (problems.length > 0) {
    process.stdout.write(
      `REFUSE: cutover blocked for ${problems.length} reason(s):\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
    );
    process.stdout.write(
      "RESULT: cutover refused — run `build --model ... --yes` first\n",
    );
    return 1;
  }

  const ts = Date.now();
  for (const c of checks) {
    process.stdout.write(
      `PLAN ${c.root}: rename .cocoindex_code -> .cocoindex_code.prev-${ts}, then shadow -> .cocoindex_code\n`,
    );
  }
  process.stdout.write(
    `PLAN: update ${liveGlobalSettingsPath} embedding.model ${previousModel ?? "?"} -> ${newModel}, then stop the live daemon\n`,
  );

  if (!flags.yes) {
    process.stdout.write(
      `RESULT: dry run — ${checks.length} project(s) would be cut over (generation ${ts}). Re-run with --yes.\n`,
    );
    return 0;
  }
  if (!ctx.cccBin) {
    process.stderr.write(
      "FATAL: ccc executable not found (PATH or --ccc-bin)\n",
    );
    return 2;
  }
  const cccBin = ctx.cccBin;

  // ORDER: every project's directory swap happens FIRST; the global model line and the daemon
  // restart happen LAST, once, after all of them are done.
  //
  // Two things can disagree with each other at any instant: (a) global_settings.yml's model vs
  // a project's ON-DISK index dimension, and (b) the daemon's currently LOADED embedder (frozen
  // at its own last start; a client only forces a respawn when it notices global_settings.yml's
  // mtime moved) vs a project's on-disk index. Flipping the global model line FIRST would make
  // the very next daemon respawn load the NEW model while EVERY project (none renamed yet)
  // still has the OLD-dimension index — every project's search breaks simultaneously, and stays
  // broken for the whole rename loop. Renaming directories first keeps the daemon on the OLD
  // model throughout the loop (nothing has touched global_settings.yml yet, so no respawn is
  // triggered), so only the ALREADY-renamed subset can disagree at any instant — the blast
  // radius ramps 0 -> N instead of jumping straight to N. It also makes an interruption benign:
  // a crash mid-loop leaves some projects on the new index waiting for the final model flip
  // (still functionally serving the OLD model/OLD index everywhere the loop hasn't reached),
  // never the whole fleet mismatched at once the way a global-first flip would leave it.
  for (const c of checks) {
    const liveDir = join(c.root, SETTINGS_DIR_NAME);
    const prevDir = `${liveDir}.prev-${ts}`;
    await rename(liveDir, prevDir);
    await rename(c.shadowDbDir, liveDir);
    process.stdout.write(
      `CUTOVER ${c.root}: live -> ${prevDir}, shadow -> live\n`,
    );
  }

  await writeFile(
    join(ctx.shadowDir, `cutover-${ts}.json`),
    JSON.stringify(
      {
        timestamp: ts,
        previousModel,
        newModel,
        projects: checks.map((c) => c.root),
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    liveGlobalSettingsPath,
    replaceEmbeddingModel(liveYaml, newModel),
    "utf8",
  );
  process.stdout.write(
    `CUTOVER: ${liveGlobalSettingsPath} embedding.model -> ${newModel} (was ${previousModel ?? "unknown"})\n`,
  );

  const liveEnv = { ...baseEnv(), COCOINDEX_CODE_DIR: ctx.liveSettingsDir };
  await stopDaemon(cccBin, liveEnv, ctx.timeoutMs);
  process.stdout.write(
    "CUTOVER: live daemon stopped — next call respawns on the new model\n",
  );
  process.stdout.write(
    `RESULT: cutover complete for ${checks.length} project(s), generation ${ts}\n`,
  );
  return 0;
}

async function cmdRollback(
  ctx: Ctx,
  flags: { yes: boolean; generation: string | undefined },
): Promise<number> {
  const projects = discoverProjects(ctx.home, {
    excludeDirNames: ctx.excludeDirNames,
    excludeAbsolutePaths: [ctx.shadowDir, ...ctx.excludePaths],
  });
  const perProject = projects.map((root) => ({
    root,
    gens: listPrevGenerations(root),
  }));
  const withGens = perProject.filter((p) => p.gens.length > 0);
  if (withGens.length === 0) {
    process.stdout.write(
      "RESULT: rollback found 0 .prev-* generations — nothing to roll back\n",
    );
    return 0;
  }

  let targetTs: number;
  if (flags.generation !== undefined) {
    const parsed = Number(flags.generation);
    if (!Number.isFinite(parsed)) {
      process.stderr.write(
        `FATAL: invalid --generation '${flags.generation}'\n`,
      );
      return 2;
    }
    targetTs = parsed;
  } else {
    targetTs = Math.max(
      ...withGens.flatMap((p) => p.gens.map((g) => g.timestamp)),
    );
  }

  const usable = withGens
    .map((p) => ({
      root: p.root,
      gen: p.gens.find((g) => g.timestamp === targetTs),
    }))
    .filter(
      (p): p is { root: string; gen: PrevGeneration } => p.gen !== undefined,
    );
  const missing = withGens.filter(
    (p) => !p.gens.some((g) => g.timestamp === targetTs),
  );

  if (usable.length === 0) {
    process.stdout.write(
      `RESULT: no project has a .prev-${targetTs} generation — nothing to roll back\n`,
    );
    return 1;
  }
  for (const m of missing) {
    process.stdout.write(
      `WARN ${m.root}: no .prev-${targetTs} generation, skipped\n`,
    );
  }
  for (const u of usable) {
    process.stdout.write(
      `PLAN ${u.root}: current .cocoindex_code -> new .prev- generation, ${u.gen.dirName} -> .cocoindex_code\n`,
    );
  }

  const liveGlobalSettingsPath = join(
    ctx.liveSettingsDir,
    GLOBAL_SETTINGS_FILE,
  );
  const markerPath = join(ctx.shadowDir, `cutover-${targetTs}.json`);
  let previousModel: string | null = null;
  if (existsSync(markerPath)) {
    try {
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
        previousModel?: string | null;
      };
      previousModel = marker.previousModel ?? null;
    } catch {
      /* best effort */
    }
  }
  process.stdout.write(
    previousModel
      ? `PLAN: restore ${liveGlobalSettingsPath} embedding.model -> ${previousModel}\n`
      : `PLAN: no cutover-${targetTs}.json marker found — embedding.model line will be left untouched\n`,
  );

  if (!flags.yes) {
    process.stdout.write(
      `RESULT: dry run — ${usable.length} project(s) would be rolled back to generation ${targetTs}. Re-run with --yes.\n`,
    );
    return 0;
  }
  if (!ctx.cccBin) {
    process.stderr.write(
      "FATAL: ccc executable not found (PATH or --ccc-bin)\n",
    );
    return 2;
  }
  const cccBin = ctx.cccBin;

  const newTs = Date.now();
  for (const u of usable) {
    const liveDir = join(u.root, SETTINGS_DIR_NAME);
    const parkedDir = `${liveDir}.prev-${newTs}`;
    await rename(liveDir, parkedDir);
    await rename(u.gen.path, liveDir);
    process.stdout.write(
      `ROLLBACK ${u.root}: current -> ${parkedDir}, ${u.gen.dirName} -> .cocoindex_code\n`,
    );
  }

  if (previousModel && existsSync(liveGlobalSettingsPath)) {
    const liveYaml = await readFile(liveGlobalSettingsPath, "utf8");
    await writeFile(
      liveGlobalSettingsPath,
      replaceEmbeddingModel(liveYaml, previousModel),
      "utf8",
    );
    process.stdout.write(
      `ROLLBACK: ${liveGlobalSettingsPath} embedding.model restored -> ${previousModel}\n`,
    );
  }

  const liveEnv = { ...baseEnv(), COCOINDEX_CODE_DIR: ctx.liveSettingsDir };
  await stopDaemon(cccBin, liveEnv, ctx.timeoutMs);
  process.stdout.write(
    "ROLLBACK: live daemon stopped — next call respawns on the restored model\n",
  );
  process.stdout.write(
    `RESULT: rollback complete for ${usable.length} project(s) from generation ${targetTs}` +
      (missing.length > 0
        ? ` (${missing.length} project(s) skipped, no matching generation)\n`
        : "\n"),
  );
  return missing.length > 0 ? 1 : 0;
}

async function cmdGc(
  ctx: Ctx,
  flags: { yes: boolean; keep: number },
): Promise<number> {
  const projects = discoverProjects(ctx.home, {
    excludeDirNames: ctx.excludeDirNames,
    excludeAbsolutePaths: [ctx.shadowDir, ...ctx.excludePaths],
  });
  const perProject = projects.map((root) => ({
    root,
    gens: listPrevGenerations(root),
  }));

  const toDelete: PrevGeneration[] = [];
  for (const p of perProject) {
    for (const g of p.gens.slice(flags.keep)) {
      toDelete.push(g);
      process.stdout.write(`PLAN ${p.root}: delete ${g.dirName}\n`);
    }
  }

  if (toDelete.length === 0) {
    process.stdout.write(
      `RESULT: gc found nothing to delete (keep=${flags.keep})\n`,
    );
    return 0;
  }
  if (!flags.yes) {
    process.stdout.write(
      `RESULT: dry run — ${toDelete.length} generation(s) would be deleted (keep=${flags.keep}). Re-run with --yes.\n`,
    );
    return 0;
  }

  for (const g of toDelete) {
    await removeDir(g.path);
    process.stdout.write(`GC: deleted ${g.path}\n`);
  }

  // Best-effort: drop cutover-<ts>.json markers whose generation has no surviving .prev-<ts>
  // anywhere. Never affects gc's own result — a leftover marker is inert bookkeeping, not a
  // correctness problem (rollback simply won't find it useful).
  const survivingTs = new Set(
    perProject
      .flatMap((p) => p.gens)
      .map((g) => g.timestamp)
      .filter((ts) => {
        const deletedTimestamps = new Set(toDelete.map((d) => d.timestamp));
        return !deletedTimestamps.has(ts);
      }),
  );
  try {
    for (const entry of readdirSync(ctx.shadowDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^cutover-(\d+)\.json$/);
      if (!match?.[1]) continue;
      if (!survivingTs.has(Number(match[1]))) {
        await rm(join(ctx.shadowDir, entry.name), { force: true });
      }
    }
  } catch {
    /* best effort — shadowDir may not exist yet */
  }

  process.stdout.write(
    `RESULT: gc deleted ${toDelete.length} generation(s), kept ${flags.keep} newest per project\n`,
  );
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------------

const VERBS = ["discover", "build", "cutover", "rollback", "gc"] as const;
type Verb = (typeof VERBS)[number];

async function main(): Promise<void> {
  const parsed = typeFlag(
    {
      "shadow-dir": { type: nonEmptyString("--shadow-dir") },
      home: { type: nonEmptyString("--home") },
      model: { type: nonEmptyString("--model") },
      force: { type: Boolean, default: false },
      yes: { type: Boolean, default: false },
      keep: { type: Number, default: DEFAULT_KEEP },
      generation: { type: nonEmptyString("--generation") },
      "ccc-bin": { type: nonEmptyString("--ccc-bin") },
      "timeout-ms": { type: Number, default: DEFAULT_TIMEOUT_MS },
      exclude: { type: [nonEmptyString("--exclude")], default: () => [] },
    },
    Bun.argv.slice(2),
    { ignore: rejectUnknownFlag },
  );

  // Retained as a defensive invariant even with the early `ignore` interceptor above: a
  // post-parse Object.keys() check alone would miss a magic '--__proto__' name, but combined
  // with the early rejection it stays correct belt-and-braces (BG1).
  const unknown = Object.keys(parsed.unknownFlags);
  if (unknown.length > 0) {
    throw new Error(`Unknown option '--${unknown[0]}'`);
  }

  const verb = parsed._[0];
  if (verb === undefined || !(VERBS as readonly string[]).includes(verb)) {
    throw new Error(`usage: bun ccc-swap.ts <${VERBS.join("|")}> [flags]`);
  }
  if (parsed._.length > 1) {
    throw new Error(`Unexpected argument '${parsed._[1]}'`);
  }

  const keep = parsed.flags.keep;
  if (keep === null || !Number.isFinite(keep) || keep < 0) {
    throw new Error("--keep must be a non-negative number");
  }
  const timeoutMs = parsed.flags["timeout-ms"];
  if (timeoutMs === null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }

  const home = resolveHome(parsed.flags.home);
  const shadowDir = resolveShadowDir(home, parsed.flags["shadow-dir"]);
  const liveSettingsDir = resolveLiveSettingsDir(
    home,
    process.env.COCOINDEX_CODE_DIR,
  );
  // A basename can never contain a separator, so `/` is an unambiguous discriminator.
  const excludePaths = parsed.flags.exclude.filter((e) => e.includes("/"));
  const excludeDirNames = [
    ...DEFAULT_EXCLUDE_DIR_NAMES,
    ...parsed.flags.exclude.filter((e) => !e.includes("/")),
  ];
  const cccBin = parsed.flags["ccc-bin"] ?? Bun.which("ccc");

  const ctx: Ctx = {
    home,
    shadowDir,
    liveSettingsDir,
    excludeDirNames,
    excludePaths,
    cccBin,
    timeoutMs,
  };
  const verbTyped = verb as Verb;

  let exitCode: number;
  switch (verbTyped) {
    case "discover":
      exitCode = await cmdDiscover(ctx);
      break;
    case "build":
      if (!parsed.flags.model)
        throw new Error("build requires --model <hf-id>");
      exitCode = await cmdBuild(ctx, {
        model: parsed.flags.model,
        force: parsed.flags.force,
        yes: parsed.flags.yes,
      });
      break;
    case "cutover":
      exitCode = await cmdCutover(ctx, { yes: parsed.flags.yes });
      break;
    case "rollback":
      exitCode = await cmdRollback(ctx, {
        yes: parsed.flags.yes,
        generation: parsed.flags.generation,
      });
      break;
    case "gc":
      exitCode = await cmdGc(ctx, { yes: parsed.flags.yes, keep });
      break;
  }
  process.exitCode = exitCode;
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
