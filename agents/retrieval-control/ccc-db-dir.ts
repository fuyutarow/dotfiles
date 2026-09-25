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
// (firedancer: 2.8 GB rewritten per HEAD move), and every tool that walks the repo tree — a
// before/after file scan, a backup, rip — pays for bytes that are derived state, not project
// content. firedancer measured polysearch's landing at 21–36 s while the daemon rewrote the
// in-repo DB, against 0.65–0.88 s otherwise. zsh/zshenv exports the mapping for every client,
// and cocoindex/ccc-daemon.service.wsl sets the same value for the supervised daemon.
//
// Consequence of prefix mapping: a project nested inside another project (a git worktree under
// `.claude/worktrees/`) gets a DB dir nested inside its parent's DB dir. A tool that treats a
// project's DB dir as a whole — recursive size, whole-directory rename — therefore sweeps up the
// nested project's DB. Operate on DB_ARTIFACTS by name instead.

import { realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

export const MAPPING_ENV = "COCOINDEX_CODE_DB_PATH_MAPPING";
export const SETTINGS_DIR_NAME = ".cocoindex_code";

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
function resolveLikePython(path: string): string {
  const absolute = resolve(path);
  let head = absolute;
  const tail: string[] = [];
  while (true) {
    try {
      return join(realpathSync(head), ...tail.reverse());
    } catch {
      const parent = dirname(head);
      if (parent === head) return absolute;
      tail.push(basename(head));
      head = parent;
    }
  }
}

// Throws on a malformed value, as ccc does — a mapping this module cannot parse is one the
// daemon also refuses, and guessing past it would split the two apart.
export function parseMapping(raw: string | undefined): PathMapping[] {
  if (raw === undefined || raw.trim() === "") return [];
  const mappings: PathMapping[] = [];
  for (const piece of raw.split(",")) {
    const entry = piece.trim();
    if (entry === "") continue;
    const cut = entry.indexOf("=");
    const source = cut < 0 ? "" : entry.slice(0, cut);
    const target = cut < 0 ? "" : entry.slice(cut + 1);
    if (source === "" || target === "") {
      throw new Error(
        `${MAPPING_ENV}: invalid entry '${entry}', expected 'source=target'`,
      );
    }
    if (!isAbsolute(source) || !isAbsolute(target)) {
      throw new Error(`${MAPPING_ENV}: paths must be absolute, got '${entry}'`);
    }
    mappings.push({
      source: resolveLikePython(source),
      target: resolveLikePython(target),
    });
  }
  return mappings;
}

export function resolveDbDir(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const root = resolveLikePython(projectRoot);
  for (const { source, target } of parseMapping(env[MAPPING_ENV])) {
    const rel = relative(source, root);
    if (
      rel === "" ||
      (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel))
    ) {
      return rel === "" ? target : join(target, rel);
    }
  }
  return join(projectRoot, SETTINGS_DIR_NAME);
}
