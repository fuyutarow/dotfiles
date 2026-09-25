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
// RELOCATED LAYOUT (2026-09-23, `agents/retrieval-control/ccc-db-dir.ts`): when
// COCOINDEX_CODE_DB_PATH_MAPPING is set host-wide, a project's DB artifacts
// (cocoindex.db/target_sqlite.db/INDEXED_AT — DB_ARTIFACTS) live OUTSIDE the project, under the
// mapped target; only settings.yml stays in `<root>/.cocoindex_code/`. `resolveDbDir(root, env)`
// (imported, mirrors ccc's own resolve_db_dir) is the ONE place that computes where a project's
// DB artifacts actually live — discover/build/cutover/rollback/gc/relocate all call it instead
// of assuming `<root>/.cocoindex_code`. NESTED-PROJECT HAZARD: prefix mapping puts a nested
// project's (e.g. a git worktree under `.claude/worktrees/`) DB dir INSIDE its parent's DB dir —
// so every op here moves/sizes/snapshots DB_ARTIFACTS BY NAME, never the DB dir as a whole
// (no recursive size/rename/delete of a whole DB dir), or it would sweep up a nested project's
// live index. `relocate` is the one-time migration from the old in-repo layout to the mapped one.
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
// RESULT:/REFUSE:/BUILD:/CUTOVER:/ROLLBACK:/GC:/RELOCATE:/NOTE:), not a machine envelope.
//
// Exit: 0 clean (dry run with nothing to flag, or a mutating run that fully succeeded) /
// 1 findings (discover mismatch, a build/cutover/rollback/relocate partial failure or refusal)
// and Cleye's native ordinary-unknown-flag refusal / 2 environment-FATAL (prototype-sensitive or
// invalid flag input, ccc missing, malformed global_settings.yml, or a live index changed during
// build — that last one should never happen and is a bug).

import { existsSync, readdirSync, statSync, type Dirent } from "node:fs";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { cli, command } from "cleye";
import { fromAsyncThrowable, fromThrowable } from "neverthrow";
import { match } from "ts-pattern";
import {
  DB_ARTIFACTS,
  MAPPING_ENV,
  parseMapping,
  resolveDbDir,
  SETTINGS_DIR_NAME,
} from "../agents/retrieval-control/ccc-db-dir";

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const PROJECT_SETTINGS_FILE = "settings.yml";
const GLOBAL_SETTINGS_FILE = "global_settings.yml";
const TARGET_SQLITE_DB = "target_sqlite.db";

// Cleye 2.6.0's strictFlags misses --__proto__; this prototype-only pre-assignment guard must
// be installed on both the root CLI and every command boundary. Ordinary unknowns stay native.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
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

  // Records `dir` when `full` (its `.cocoindex_code`) carries ccc's own project marker.
  const recordIfProjectRoot = (dir: string, full: string): void => {
    if (existsSync(join(full, PROJECT_SETTINGS_FILE))) found.push(dir);
  };

  const walk = (dir: string): void => {
    const entriesResult = fromThrowable(() =>
      readdirSync(dir, { withFileTypes: true }),
    )();
    if (entriesResult.isErr()) return; // permission denied / vanished mid-walk — skip, never crash discover
    for (const entry of entriesResult.value) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (entry.name === SETTINGS_DIR_NAME) {
        recordIfProjectRoot(dir, full);
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

/** One `readdirSync` entry's contribution to {@link dirSizeBytes}: bytes to add, dirs pushed onto `stack`. */
function accumulateDirEntry(
  current: string,
  entry: Dirent,
  stack: string[],
): number {
  if (entry.isSymbolicLink()) return 0;
  const full = join(current, entry.name);
  if (entry.isDirectory()) {
    stack.push(full);
    return 0;
  }
  if (!entry.isFile()) return 0;
  // vanished mid-walk
  const sizeResult = fromThrowable(() => statSync(full).size)();
  return sizeResult.isOk() ? sizeResult.value : 0;
}

export function dirSizeBytes(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    const entriesResult = fromThrowable(() =>
      readdirSync(current, { withFileTypes: true }),
    )();
    if (entriesResult.isErr()) continue;
    for (const entry of entriesResult.value) {
      total += accumulateDirEntry(current, entry, stack);
    }
  }
  return total;
}

/** Size of a file, or the recursive size of a directory (e.g. `cocoindex.db`). Missing -> 0. */
export function pathSizeBytes(path: string): number {
  const statResult = fromThrowable(() => statSync(path))();
  if (statResult.isErr()) return 0;
  return statResult.value.isDirectory()
    ? dirSizeBytes(path)
    : statResult.value.size;
}

/**
 * Sums the size of every {@link DB_ARTIFACTS} entry PRESENT in `dbDir`, by name — never the size
 * of `dbDir` as a whole. A mapped DB dir can hold a NESTED project's DB dir (worktree hazard, see
 * file header); a whole-directory size would silently fold that project's bytes into this one's.
 */
export function dbArtifactsSizeBytes(dbDir: string): number {
  let total = 0;
  for (const name of DB_ARTIFACTS) {
    total += pathSizeBytes(join(dbDir, name));
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
  const dbResult = fromThrowable(
    () => new Database(targetSqliteDbPath, { readonly: true }),
  )();
  if (dbResult.isErr()) return null;
  const db = dbResult.value;
  try {
    return fromThrowable(() => {
      const row = db
        .query(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'code_chunks_vec'",
        )
        .get() as { sql: string } | null;
      const match = row?.sql?.match(/embedding\s+float\[(\d+)\]/);
      if (!match?.[1]) return null;
      const dim = Number(match[1]);
      return Number.isFinite(dim) ? dim : null;
    })().unwrapOr(null);
  } finally {
    db.close();
  }
}

/** Row count of `code_chunks_vec_rowids` — a plain table, queryable without the vec0 extension. */
export function countIndexedRows(targetSqliteDbPath: string): number | null {
  if (!existsSync(targetSqliteDbPath)) return null;
  const dbResult = fromThrowable(
    () => new Database(targetSqliteDbPath, { readonly: true }),
  )();
  if (dbResult.isErr()) return null;
  const db = dbResult.value;
  try {
    return fromThrowable(() => {
      const row = db
        .query("SELECT COUNT(*) as n FROM code_chunks_vec_rowids")
        .get() as {
        n: number;
      } | null;
      return row ? row.n : null;
    })().unwrapOr(null);
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
    const entriesResult = fromThrowable(() =>
      readdirSync(current, { withFileTypes: true }),
    )();
    if (entriesResult.isErr()) return;
    for (const entry of entriesResult.value) {
      if (entry.isSymbolicLink()) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        // vanished mid-walk
        fromThrowable(() => statSync(full))().map((st) => {
          snap.set(relative(dir, full), { size: st.size, mtimeMs: st.mtimeMs });
        });
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

/**
 * Same shape as {@link snapshotDir}, but bounded to {@link DB_ARTIFACTS} entries of `dbDir` BY
 * NAME (recursing only inside a matched artifact, e.g. the `cocoindex.db` directory) — never a
 * whole-`dbDir` walk, which would also snapshot a nested project's DB dir underneath it.
 */
export function snapshotDbArtifacts(dbDir: string): Map<string, FileSnapshot> {
  const snap = new Map<string, FileSnapshot>();
  for (const name of DB_ARTIFACTS) {
    const full = join(dbDir, name);
    const statResult = fromThrowable(() => statSync(full))();
    if (statResult.isErr()) continue;
    if (statResult.value.isDirectory()) {
      for (const [rel, s] of snapshotDir(full)) snap.set(join(name, rel), s);
      continue;
    }
    snap.set(name, {
      size: statResult.value.size,
      mtimeMs: statResult.value.mtimeMs,
    });
  }
  return snap;
}

export interface PrevGeneration {
  dirName: string;
  timestamp: number;
  path: string;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `<basename(dbDir)>.prev-<digits>` siblings of `dbDir`, newest first.
 *
 * `dbDir` is a project's LIVE DB dir (`resolveDbDir(root, env)`), not necessarily the project
 * root — under a path mapping a generation is parked next to the MAPPED dir, which can sit far
 * outside the project tree. Unmapped, `dbDir` is `<root>/.cocoindex_code` and this reduces to the
 * historical shape (`.cocoindex_code.prev-<ts>` next to the project's own settings dir).
 */
export function listPrevGenerations(dbDir: string): PrevGeneration[] {
  const parent = dirname(dbDir);
  const re = new RegExp(`^${escapeRegExp(basename(dbDir))}\\.prev-(\\d+)$`);
  const entriesResult = fromThrowable(() =>
    readdirSync(parent, { withFileTypes: true }),
  )();
  if (entriesResult.isErr()) return [];
  const gens: PrevGeneration[] = [];
  for (const entry of entriesResult.value) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(re);
    if (!match?.[1]) continue;
    gens.push({
      dirName: entry.name,
      timestamp: Number(match[1]),
      path: join(parent, entry.name),
    });
  }
  return gens.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * The live daemon's Unix socket path (mirrors cocoindex_code's `_daemon_paths.daemon_socket_path`
 * for the non-Windows, non-overlong-path case — this repo never hits the AF_UNIX length fallback).
 * `COCOINDEX_CODE_RUNTIME_DIR` overrides where daemon.sock/pid/log live, same as the real client.
 */
export function daemonSocketPath(
  liveSettingsDir: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const runtimeDir = env.COCOINDEX_CODE_RUNTIME_DIR ?? liveSettingsDir;
  return join(runtimeDir, "daemon.sock");
}

/**
 * Whether the LIVE ccc daemon is up — a bare socket-file existence check, deliberately NOT a
 * `ccc daemon status` shell-out: that command's own client auto-starts a daemon on a cold socket
 * (cli.py `daemon_status` -> `_connect_and_handshake` -> `start_daemon`, verified against the
 * installed 0.2.41), so using it to ask "is it running" could itself spawn one. This mirrors
 * client.py's own `is_daemon_running()`, which is exactly this same file check.
 */
export function isLiveDaemonRunning(
  liveSettingsDir: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return existsSync(daemonSocketPath(liveSettingsDir, env));
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
    // exactOptionalPropertyTypes: omit the key entirely rather than pass an explicit `cwd:
    // undefined` — SpawnOptions declares `cwd?: string`, not `cwd?: string | undefined`.
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
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
    // bounded: a single fast filesystem rename into rip's own graveyard, never hangs
    ripOk = fromThrowable(spawn)(["rip", path], {
      stdout: "ignore",
      stderr: "ignore",
    })
      .map((proc) => proc.exitCode === 0)
      .unwrapOr(false);
  }
  if (!ripOk) {
    await rm(path, { recursive: true, force: true });
  }
}

export interface MoveResult {
  ok: boolean;
  error?: string;
}

/**
 * Moves one DB_ARTIFACTS entry `src` -> `dst` (a file or, for `cocoindex.db`, a directory).
 * `rename` first (near-instant, same-filesystem); on EXDEV (dst on a different filesystem — a
 * fresh COCOINDEX_CODE_DB_PATH_MAPPING target commonly is) falls back to a recursive copy,
 * verifies the byte totals match, then deletes the source — never deletes before the copy is
 * verified.
 */
export async function moveDbArtifact(
  src: string,
  dst: string,
): Promise<MoveResult> {
  const renameResult = await fromAsyncThrowable(() => rename(src, dst))();
  if (renameResult.isOk()) return { ok: true };
  const error = renameResult.error;
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;
  if (code !== "EXDEV") {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const srcBytes = pathSizeBytes(src);
  const copyResult = await fromAsyncThrowable(async () => {
    await cp(src, dst, { recursive: true, errorOnExist: true });
    const dstBytes = pathSizeBytes(dst);
    if (dstBytes !== srcBytes) {
      throw new Error(
        `byte mismatch after cross-device copy: src=${srcBytes} dst=${dstBytes}`,
      );
    }
    await removeDir(src);
  })();
  if (copyResult.isErr()) {
    const copyError = copyResult.error;
    return {
      ok: false,
      error: copyError instanceof Error ? copyError.message : String(copyError),
    };
  }
  return { ok: true };
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
  // Injected rather than read ad hoc from `process.env` at every call site, so a CLI-level test
  // (which fully replaces the subprocess's env — see ccc-swap.test.ts's `runScript`) is the same
  // code path as production, never a separate branch that could drift.
  env: Record<string, string | undefined>;
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
    const dbDir = resolveDbDir(root, ctx.env);
    const dbPath = join(dbDir, TARGET_SQLITE_DB);
    return {
      root,
      dim: computeIndexDimension(dbPath),
      chunks: countIndexedRows(dbPath),
      size: dbArtifactsSizeBytes(dbDir),
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
  const shadowYamlResult = fromThrowable(() =>
    replaceEmbeddingModel(liveYaml, flags.model),
  )();
  if (shadowYamlResult.isErr()) {
    const error = shadowYamlResult.error;
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
  const shadowYaml = shadowYamlResult.value;

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

  // Snapshot every discovered project's LIVE DB_ARTIFACTS BEFORE touching anything, so the
  // safety property (build never writes to a live index) is PROVEN below, not asserted. Bounded
  // to DB_ARTIFACTS by name (never the whole live DB dir) — see the file header's nested-project
  // hazard.
  const liveSnapshots = new Map(
    projects.map((root) => [
      root,
      snapshotDbArtifacts(resolveDbDir(root, ctx.env)),
    ]),
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
  // The shadow daemon lives under COCOINDEX_CODE_DIR and has NO supervisor — the systemd unit
  // owns the LIVE daemon only. zsh/zshenv exports COCOINDEX_CODE_DAEMON_SUPERVISED=1 for live
  // clients; inherited here it would forbid the client from spawning a shadow daemon, so every
  // shadow `ccc index` would wait out _wait_for_daemon's 30s for a socket nobody will create
  // and fail with "Daemon did not start in time". liveEnv deliberately KEEPS the flag.
  delete shadowEnv.COCOINDEX_CODE_DAEMON_SUPERVISED;

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
    built += 1;
    process.stdout.write(
      `BUILD ${p.root}: chunks=${chunks ?? "—"} files=${files ?? "—"} elapsed=${elapsedS}s\n`,
    );
  }
  // settings.yml is never copied into the shadow tree: `ccc index` reads it straight from the
  // LIVE project root (never the shadow), and cutover no longer moves or duplicates it either
  // (it stays put in `<root>/.cocoindex_code/` — see the file header).

  const liveTouched: string[] = [];
  for (const root of projects) {
    const before = liveSnapshots.get(root);
    if (!before) continue;
    const diff = diffSnapshots(
      before,
      snapshotDbArtifacts(resolveDbDir(root, ctx.env)),
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
    `SAFETY: verified — live DB artifacts untouched for all ${projects.length} discovered project(s) (size+mtime snapshot before/after)\n`,
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
    const liveDbDir = resolveDbDir(root, ctx.env);
    const ready = existsSync(shadowDb) && dim !== null && (rows ?? 0) > 0;
    return { root, shadowDbDir, shadowDb, liveDbDir, dim, rows, ready };
  });

  const problems: string[] = [];
  for (const c of checks) {
    if (c.ready) continue;
    const reason = match(c)
      .when(
        (x) => !existsSync(x.shadowDb),
        () => "no shadow index (missing)",
      )
      .when(
        (x) => (x.rows ?? 0) === 0,
        () => "shadow index is empty (0 rows)",
      )
      .otherwise(() => "shadow index dimension unreadable");
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
      `PLAN ${c.root}: move live DB artifacts ${c.liveDbDir} -> ${c.liveDbDir}.prev-${ts}, then shadow artifacts -> ${c.liveDbDir}\n`,
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
  const cutoverFailures: string[] = [];
  for (const c of checks) {
    const prevDir = `${c.liveDbDir}.prev-${ts}`;
    await mkdir(prevDir, { recursive: true });
    for (const name of DB_ARTIFACTS) {
      const src = join(c.liveDbDir, name);
      if (!existsSync(src)) continue;
      const moved = await moveDbArtifact(src, join(prevDir, name));
      if (!moved.ok) {
        cutoverFailures.push(`${c.root}: parking ${name}: ${moved.error}`);
      }
    }
    await mkdir(c.liveDbDir, { recursive: true });
    for (const name of DB_ARTIFACTS) {
      const src = join(c.shadowDbDir, name);
      if (!existsSync(src)) continue;
      const moved = await moveDbArtifact(src, join(c.liveDbDir, name));
      if (!moved.ok) {
        cutoverFailures.push(`${c.root}: promoting ${name}: ${moved.error}`);
      }
    }
    process.stdout.write(
      `CUTOVER ${c.root}: live artifacts -> ${prevDir}, shadow artifacts -> ${c.liveDbDir}\n`,
    );
  }
  if (cutoverFailures.length > 0) {
    process.stderr.write(
      `FATAL: cutover artifact move failed:\n${cutoverFailures.map((f) => `  - ${f}`).join("\n")}\n`,
    );
    return 2;
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
  const perProject = projects.map((root) => {
    const liveDbDir = resolveDbDir(root, ctx.env);
    return { root, liveDbDir, gens: listPrevGenerations(liveDbDir) };
  });
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
      liveDbDir: p.liveDbDir,
      gen: p.gens.find((g) => g.timestamp === targetTs),
    }))
    .filter(
      (p): p is { root: string; liveDbDir: string; gen: PrevGeneration } =>
        p.gen !== undefined,
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
      `PLAN ${u.root}: current live artifacts -> new .prev- generation, ${u.gen.dirName} artifacts -> live (${u.liveDbDir})\n`,
    );
  }

  const liveGlobalSettingsPath = join(
    ctx.liveSettingsDir,
    GLOBAL_SETTINGS_FILE,
  );
  const markerPath = join(ctx.shadowDir, `cutover-${targetTs}.json`);
  let previousModel: string | null = null;
  if (existsSync(markerPath)) {
    // best effort
    const markerResult = await fromAsyncThrowable(async () => {
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
        previousModel?: string | null;
      };
      return marker.previousModel ?? null;
    })();
    if (markerResult.isOk()) previousModel = markerResult.value;
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
  const rollbackFailures: string[] = [];
  for (const u of usable) {
    const parkedDir = `${u.liveDbDir}.prev-${newTs}`;
    await mkdir(parkedDir, { recursive: true });
    for (const name of DB_ARTIFACTS) {
      const src = join(u.liveDbDir, name);
      if (!existsSync(src)) continue;
      const moved = await moveDbArtifact(src, join(parkedDir, name));
      if (!moved.ok) {
        rollbackFailures.push(`${u.root}: parking ${name}: ${moved.error}`);
      }
    }
    await mkdir(u.liveDbDir, { recursive: true });
    // `u.gen.path` may be an OLD-FORMAT generation (a whole renamed `.cocoindex_code`, still
    // carrying its own settings.yml copy) — move only DB_ARTIFACTS by name and leave any
    // settings.yml inside `u.gen.path` untouched, orphaned in the now-consumed generation dir.
    for (const name of DB_ARTIFACTS) {
      const src = join(u.gen.path, name);
      if (!existsSync(src)) continue;
      const moved = await moveDbArtifact(src, join(u.liveDbDir, name));
      if (!moved.ok) {
        rollbackFailures.push(`${u.root}: restoring ${name}: ${moved.error}`);
      }
    }
    // A generation is CONSUMED, not merely drained: reclaim its now-empty husk so the net
    // `.prev-*` count stays flat (park one, consume one) the way the old whole-dir rename did.
    // An OLD-FORMAT generation that still holds a leftover settings.yml is left as-is — its
    // settings.yml is never touched, so the dir is never actually empty in that case.
    const remaining = fromThrowable(() => readdirSync(u.gen.path))();
    if (remaining.isOk() && remaining.value.length === 0) {
      await removeDir(u.gen.path);
    }
    process.stdout.write(
      `ROLLBACK ${u.root}: current artifacts -> ${parkedDir}, ${u.gen.dirName} artifacts -> ${u.liveDbDir}\n`,
    );
  }
  if (rollbackFailures.length > 0) {
    process.stderr.write(
      `FATAL: rollback artifact move failed:\n${rollbackFailures.map((f) => `  - ${f}`).join("\n")}\n`,
    );
    return 2;
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
    gens: listPrevGenerations(resolveDbDir(root, ctx.env)),
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
  // best effort — shadowDir may not exist yet
  await fromAsyncThrowable(async () => {
    for (const entry of readdirSync(ctx.shadowDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^cutover-(\d+)\.json$/);
      if (!match?.[1]) continue;
      if (!survivingTs.has(Number(match[1]))) {
        await rm(join(ctx.shadowDir, entry.name), { force: true });
      }
    }
  })();

  process.stdout.write(
    `RESULT: gc deleted ${toDelete.length} generation(s), kept ${flags.keep} newest per project\n`,
  );
  return 0;
}

/**
 * One-time migration off the old in-repo `<root>/.cocoindex_code/` DB layout onto a
 * COCOINDEX_CODE_DB_PATH_MAPPING target. For each discovered project: `from` is always
 * `<root>/.cocoindex_code`, `to` is `resolveDbDir(root, env)`. Unmapped (`from === to`) is a
 * per-project SKIP, not a refusal — a fleet migrating gradually is expected to have both. Moves
 * DB_ARTIFACTS by name only (never `from`/`to` as whole directories — see the file header);
 * settings.yml is never touched, so `from` (`<root>/.cocoindex_code/`) ends up holding only it.
 */
async function cmdRelocate(ctx: Ctx, flags: { yes: boolean }): Promise<number> {
  const mappings = parseMapping(ctx.env[MAPPING_ENV]);
  if (mappings.length === 0) {
    process.stdout.write(
      `NOTE: ${MAPPING_ENV} is unset or maps nothing — nothing to relocate\n`,
    );
    return 0;
  }

  const projects = discoverProjects(ctx.home, {
    excludeDirNames: ctx.excludeDirNames,
    excludeAbsolutePaths: [ctx.shadowDir, ...ctx.excludePaths],
  });
  if (projects.length === 0) {
    process.stdout.write(
      `RESULT: relocate found 0 projects under ${ctx.home} — nothing to do\n`,
    );
    return 0;
  }

  const plans = projects.map((root) => ({
    root,
    from: join(root, SETTINGS_DIR_NAME),
    to: resolveDbDir(root, ctx.env),
  }));

  const conflicts: string[] = [];
  const work: Array<{
    root: string;
    from: string;
    to: string;
    artifacts: readonly string[];
  }> = [];
  let skipped = 0;
  for (const p of plans) {
    if (p.from === p.to) {
      process.stdout.write(`PLAN ${p.root}: SKIP (unmapped)\n`);
      skipped += 1;
      continue;
    }
    const present = DB_ARTIFACTS.filter((name) =>
      existsSync(join(p.from, name)),
    );
    if (present.length === 0) {
      process.stdout.write(
        `PLAN ${p.root}: SKIP (no DB artifacts at ${p.from})\n`,
      );
      skipped += 1;
      continue;
    }
    const conflicting = present.filter((name) => existsSync(join(p.to, name)));
    if (conflicting.length > 0) {
      conflicts.push(
        `${p.root}: ${conflicting.join(", ")} present at BOTH ${p.from} and ${p.to} — refusing to overwrite`,
      );
      continue;
    }
    process.stdout.write(
      `PLAN ${p.root}: RELOCATE ${present.join(", ")} ${p.from} -> ${p.to}\n`,
    );
    work.push({ root: p.root, from: p.from, to: p.to, artifacts: present });
  }

  if (conflicts.length > 0) {
    process.stdout.write(
      `REFUSE: relocate blocked for ${conflicts.length} project(s):\n${conflicts.map((c) => `  - ${c}`).join("\n")}\n`,
    );
    process.stdout.write(
      "RESULT: relocate refused — resolve every conflict by hand, nothing is auto-overwritten\n",
    );
    return 1;
  }

  if (work.length === 0) {
    process.stdout.write(
      `RESULT: relocate found nothing to move (${skipped} project(s) skipped)\n`,
    );
    return 0;
  }

  if (!flags.yes) {
    process.stdout.write(
      `RESULT: dry run — ${work.length} project(s) would be relocated, ${skipped} skipped. Re-run with --yes.\n`,
    );
    return 0;
  }

  if (isLiveDaemonRunning(ctx.liveSettingsDir, ctx.env)) {
    process.stdout.write(
      `REFUSE: the live ccc daemon is running (${daemonSocketPath(ctx.liveSettingsDir, ctx.env)}) — stop it first (the host's supervision regime decides how: e.g. \`systemctl --user stop ccc-daemon\`, or \`ccc daemon stop\` unsupervised), then re-run relocate\n`,
    );
    process.stdout.write("RESULT: relocate refused — daemon is live\n");
    return 1;
  }

  let moved = 0;
  let failed = 0;
  for (const w of work) {
    await mkdir(w.to, { recursive: true });
    const errors: string[] = [];
    for (const name of w.artifacts) {
      const result = await moveDbArtifact(join(w.from, name), join(w.to, name));
      if (!result.ok) errors.push(`${name}: ${result.error}`);
    }
    if (errors.length > 0) {
      failed += 1;
      process.stdout.write(
        `RELOCATE ${w.root}: FAILED — ${errors.join("; ")}\n`,
      );
      continue;
    }
    moved += 1;
    process.stdout.write(
      `RELOCATE ${w.root}: moved ${w.artifacts.join(", ")} -> ${w.to}\n`,
    );
  }

  process.stdout.write(
    `RESULT: relocate moved ${moved} project(s), ${skipped} skipped, ${failed} failed\n`,
  );
  return failed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------------

const VERBS = [
  "discover",
  "build",
  "cutover",
  "rollback",
  "gc",
  "relocate",
] as const;
type Verb = (typeof VERBS)[number];

const SWAP_FLAGS = {
  shadowDir: { type: nonEmptyString("--shadow-dir") },
  home: { type: nonEmptyString("--home") },
  model: { type: nonEmptyString("--model") },
  force: { type: Boolean, default: false },
  yes: { type: Boolean, default: false },
  keep: { type: Number, default: DEFAULT_KEEP },
  generation: { type: nonEmptyString("--generation") },
  cccBin: { type: nonEmptyString("--ccc-bin") },
  timeoutMs: { type: Number, default: DEFAULT_TIMEOUT_MS },
  // `as const` pins this to the readonly one-tuple cleye's Flags type requires for a
  // multi-value flag; a bare array literal infers as a general array and fails assignability.
  exclude: { type: [nonEmptyString("--exclude")] as const, default: () => [] },
};

type SwapFlags = {
  // cleye's parsed flags carry these keys unconditionally, valued `undefined` when the flag
  // was not passed — a real, distinct "not given" state the code below relies on (`??`,
  // truthiness checks), so `| undefined` is written explicitly rather than left implicit.
  shadowDir?: string | undefined;
  home?: string | undefined;
  model?: string | undefined;
  force: boolean;
  yes: boolean;
  keep: number;
  generation?: string | undefined;
  cccBin?: string | undefined;
  timeoutMs: number;
  exclude: string[];
};

async function runVerb(verb: Verb, flags: SwapFlags): Promise<number> {
  const keep = flags.keep;
  if (keep === null || !Number.isFinite(keep) || keep < 0) {
    throw new Error("--keep must be a non-negative number");
  }
  const timeoutMs = flags.timeoutMs;
  if (timeoutMs === null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number");
  }

  const home = resolveHome(flags.home);
  const shadowDir = resolveShadowDir(home, flags.shadowDir);
  const liveSettingsDir = resolveLiveSettingsDir(
    home,
    process.env.COCOINDEX_CODE_DIR,
  );
  // A basename can never contain a separator, so `/` is an unambiguous discriminator.
  const excludePaths = flags.exclude.filter((e) => e.includes("/"));
  const excludeDirNames = [
    ...DEFAULT_EXCLUDE_DIR_NAMES,
    ...flags.exclude.filter((e) => !e.includes("/")),
  ];
  const cccBin = flags.cccBin ?? Bun.which("ccc");

  const ctx: Ctx = {
    home,
    shadowDir,
    liveSettingsDir,
    excludeDirNames,
    excludePaths,
    cccBin,
    timeoutMs,
    env: process.env,
  };
  return match(verb)
    .with("discover", () => cmdDiscover(ctx))
    .with("build", () => {
      if (!flags.model) throw new Error("build requires --model <hf-id>");
      return cmdBuild(ctx, {
        model: flags.model,
        force: flags.force,
        yes: flags.yes,
      });
    })
    .with("cutover", () => cmdCutover(ctx, { yes: flags.yes }))
    .with("rollback", () =>
      cmdRollback(ctx, { yes: flags.yes, generation: flags.generation }),
    )
    .with("gc", () => cmdGc(ctx, { yes: flags.yes, keep }))
    .with("relocate", () => cmdRelocate(ctx, { yes: flags.yes }))
    .exhaustive();
}

async function main(): Promise<void> {
  await cli(
    {
      name: "ccc-swap.ts",
      parameters: ["[verb]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Build and cut over ccc embedding indexes without taking live search down.",
      },
      commands: VERBS.map((verb) =>
        command(
          {
            name: verb,
            parameters: [],
            flags: SWAP_FLAGS,
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: { description: `${verb} the ccc shadow-index lifecycle.` },
          },
          async (parsed) => {
            if (parsed._.length > 0) {
              throw new Error(`Unexpected argument '${parsed._[0]}'`);
            }
            process.exitCode = await runVerb(verb, parsed.flags);
          },
        ),
      ),
    },
    (parsed) => {
      if (
        parsed._.verb === undefined ||
        !(VERBS as readonly string[]).includes(parsed._.verb)
      ) {
        throw new Error(`usage: bun ccc-swap.ts <${VERBS.join("|")}> [flags]`);
      }
      throw new Error(`Unexpected argument '${parsed._[1]}'`);
    },
    Bun.argv.slice(2),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
