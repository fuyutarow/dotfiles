import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import type { Candidate } from "../model.ts";
import type { Context } from "./index.ts";

export async function treeBytes(
  path: string,
  report?: (entries: number, bytes: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(
      new URL("./tree-scan-worker.ts", import.meta.url),
    );
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("tree scan aborted"));
    };
    worker.addEventListener(
      "message",
      (event: MessageEvent<TreeScanMessage>) => {
        if (settled) return;
        if (event.data.kind === "progress") {
          report?.(event.data.entries, event.data.bytes);
          return;
        }
        settled = true;
        cleanup();
        if (event.data.kind === "error") {
          reject(new Error(event.data.message));
          return;
        }
        report?.(event.data.entries, event.data.bytes);
        resolve(event.data.bytes);
      },
    );
    worker.addEventListener("error", (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message));
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted === true) abort();
    else worker.postMessage({ path }, []);
  });
}

type TreeScanMessage =
  | { kind: "progress"; entries: number; bytes: number }
  | { kind: "done"; entries: number; bytes: number }
  | { kind: "error"; message: string };

export function measuredTreeBytes(
  path: string,
  ctx?: Context,
): Promise<number> {
  return treeBytes(
    path,
    ctx?.reportProgress === undefined
      ? undefined
      : (entries, bytes) => {
          ctx.reportProgress?.(ctx.targetName ?? path, path, entries, bytes);
        },
    ctx?.signal,
  );
}

export function treeCandidate(
  path: string,
  reason: string,
  ctx?: Context,
): Promise<Candidate> {
  return measuredTreeBytes(path, ctx).then((bytes) => ({
    id: path,
    path,
    verdict: "RECLAIM",
    reason,
    checks: [
      { name: "target exists and is a directory", ok: true, detail: path },
    ],
    bytes,
    bytes_kind: "freed_now",
    action: { kind: "delete", argv: [path] },
    result: null,
  }));
}

export async function keepTreeCandidate(
  path: string,
  reason: string,
  ctx?: Context,
): Promise<Candidate> {
  return {
    ...(await treeCandidate(path, reason, ctx)),
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
