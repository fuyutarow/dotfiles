// Where ccc keeps a project's index DB — one home for every house tool that must find it.
//
// ccc (cocoindex-code, checked v0.2.41 settings.py:256 `resolve_db_dir`) puts a project's DB
// artifacts in `<root>/.cocoindex_code/` unless COCOINDEX_CODE_DB_PATH_MAPPING
// ("source=target[,source=target...]", both absolute) rewrites the project root's prefix: the
// first entry whose source is the root or an ancestor of it wins, and the DB dir becomes
// `target/<root relative to source>`. This module mirrors that rule exactly, because a house
// tool that computes a DIFFERENT dir than the daemon reads a DB nobody writes.
//
// WHY THE MAPPING IS SET AT ALL (2026-09-23): a DB inside the repo is rewritten on every commit
// (a large repository: 2.8 GB rewritten per HEAD move), and every tool that walks the repo tree — a
// before/after file scan, a backup, rip — pays for bytes that are derived state, not project
// content. The indexed tool's landing took 21–36 s while the daemon rewrote the
// in-repo DB, against 0.65–0.88 s otherwise. zsh/zshenv exports the mapping for every client,
// and cocoindex/ccc-daemon-launch.py sets the same value for the supervised daemon. Both derive
// it from the one declaration cocoindex/db-root (a root relative to $HOME, outside ~/.cache,
// which disk-reclaim treats as deletable).
//
// Consequence of prefix mapping: a project nested inside another project (a git worktree under
// `.claude/worktrees/`) gets a DB dir nested inside its parent's DB dir. A tool that treats a
// project's DB dir as a whole — recursive size, whole-directory rename — therefore sweeps up the
// nested project's DB. Operate on DB_ARTIFACTS by name instead.

import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
const resolveRealpath = (path: string) =>
  fromAsyncThrowable(() => realpath(path), asError)();

export const MAPPING_ENV = "COCOINDEX_CODE_DB_PATH_MAPPING";
export const SETTINGS_DIR_NAME = ".cocoindex_code";
export const DB_ROOT_DECLARATION = resolve(
  import.meta.dir,
  "../../../cocoindex/db-root",
);

/** Establish the daemon's declared mapping before any watermark read or ccc child. */
export async function declaredDbEnv(
  env: Record<string, string | undefined> = process.env,
  declaration = DB_ROOT_DECLARATION,
): Promise<Result<Record<string, string | undefined>, Error>> {
  const read = await fromAsyncThrowable(
    () => readFile(declaration, "utf8"),
    asError,
  )();
  if (read.isErr())
    return err(new Error(`${declaration}: ${read.error.message}`));
  const root = read.value.trim();
  if (root === "" || isAbsolute(root) || root.split("/").includes(".."))
    return err(
      new Error(`${declaration}: expected a non-empty path relative to $HOME`),
    );
  const home = env["HOME"] ?? homedir();
  const declared = `${home}=${join(home, root)}`;
  const actual = env[MAPPING_ENV];
  if (actual === undefined || actual === "")
    return ok({ ...env, [MAPPING_ENV]: declared });
  const [given, expected] = await Promise.all([
    parseMapping(actual),
    parseMapping(declared),
  ]);
  if (given.isErr()) return err(given.error);
  if (expected.isErr()) return err(expected.error);
  if (JSON.stringify(given.value) !== JSON.stringify(expected.value))
    return err(
      new Error(`${MAPPING_ENV} locates DBs differently from ${declaration}`),
    );
  return ok(env);
}

// Every file ccc's daemon or repo-retrieve writes into a project's DB dir. `INDEXED_AT` is the
// house freshness watermark (ccc-index.ts), kept next to the DB it certifies so that moving one
// moves the other.
export const DB_ARTIFACTS = [
  "cocoindex.db",
  "target_sqlite.db",
  "INDEXED_AT",
] as const;

export type PathMapping = { source: string; target: string };

// Python's Path.resolve() follows symlinks and tolerates a missing tail; mirror both, or a
// symlinked project root maps differently here than in the daemon.
async function resolveLikePython(path: string): Promise<string> {
  const absolute = resolve(path);
  let head = absolute;
  const tail: string[] = [];
  while (true) {
    const resolved = await resolveRealpath(head);
    if (resolved.isOk()) {
      return join(resolved.value, ...tail.toReversed());
    }
    // Python Path.resolve() tolerates a missing tail; keep walking to its existing parent.
    const parent = dirname(head);
    if (parent === head) return absolute;
    tail.push(basename(head));
    head = parent;
  }
}

// Returns an error for malformed values, as ccc does — a mapping this module cannot parse is one
// the daemon also refuses, and guessing past it would split the two apart.
export async function parseMapping(
  raw: string | undefined,
): Promise<Result<PathMapping[], Error>> {
  if (raw === undefined || raw.trim() === "") return ok([]);
  const mappings: PathMapping[] = [];
  for (const piece of raw.split(",")) {
    const entry = piece.trim();
    if (entry === "") continue;
    const cut = entry.indexOf("=");
    const source = cut < 0 ? "" : entry.slice(0, cut);
    const target = cut < 0 ? "" : entry.slice(cut + 1);
    if (source === "" || target === "") {
      return err(
        new Error(
          `${MAPPING_ENV}: invalid entry '${entry}', expected 'source=target'`,
        ),
      );
    }
    if (!isAbsolute(source) || !isAbsolute(target)) {
      return err(
        new Error(`${MAPPING_ENV}: paths must be absolute, got '${entry}'`),
      );
    }
    mappings.push({
      source: await resolveLikePython(source),
      target: await resolveLikePython(target),
    });
  }
  return ok(mappings);
}

export async function resolveDbDir(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): Promise<Result<string, Error>> {
  const root = await resolveLikePython(projectRoot);
  return (await parseMapping(env[MAPPING_ENV])).map((mappings) => {
    for (const { source, target } of mappings) {
      const rel = relative(source, root);
      if (
        rel === "" ||
        (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel))
      ) {
        return rel === "" ? target : join(target, rel);
      }
    }
    return join(projectRoot, SETTINGS_DIR_NAME);
  });
}
