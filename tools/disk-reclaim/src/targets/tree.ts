import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import type { Candidate } from "../model.ts";
import type { Context } from "./index.ts";

export function treeBytes(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.blocks * 512;
  return readdirSync(path).reduce(
    (sum, name) => sum + treeBytes(join(path, name)),
    stat.blocks * 512,
  );
}

export function treeCandidate(path: string, reason: string): Candidate {
  return {
    id: path,
    path,
    verdict: "RECLAIM",
    reason,
    checks: [
      { name: "target exists and is a directory", ok: true, detail: path },
    ],
    bytes: treeBytes(path),
    bytes_kind: "freed_now",
    action: { kind: "delete", argv: [path] },
    result: null,
  };
}

export function keepTreeCandidate(path: string, reason: string): Candidate {
  return {
    ...treeCandidate(path, reason),
    verdict: "KEEP",
    action: { kind: "delete", argv: [] },
  };
}

export async function deleteTree(candidate: Candidate, _ctx: Context) {
  if (candidate.path === null)
    return { ok: false, bytes_freed: null, error: "missing path" };
  const result = await removeTree(candidate.path, {
    uid: process.getuid?.() ?? 0,
    protection: {
      ownerTarget: _ctx.targetName,
      procDir: _ctx.procDir,
      repoRoots: [..._ctx.config.repo_roots, ..._ctx.config.repos],
      protectedPaths: _ctx.config.protected ?? [],
      ignoreUnreadableProcs: _ctx.config.ignore_unreadable_procs ?? [],
    },
    progress: removeTreeProgress(candidate.path, candidate.bytes, _ctx),
  });
  return {
    ok: result.ok,
    bytes_freed: result.ok ? result.statfs_bytes_freed : null,
    error: result.ok
      ? null
      : [
          ...result.refused.map((r) => `${r.path}: ${r.reason}`),
          ...result.errors.map((e) => `${e.path}: ${e.error}`),
        ].join("; "),
  };
}
