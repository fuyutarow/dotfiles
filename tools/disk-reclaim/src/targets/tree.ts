import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import type { Candidate } from "../model.ts";
import type { Context } from "./index.ts";
import { defaultScanCacheDir, scanCache } from "../lib/scan-cache.ts";
import { z } from "../../../shared/src/zod.ts";

export async function treeBytes(
  path: string,
  report?: (entries: number, bytes: number) => void,
  signal?: AbortSignal,
  options: {
    stallMs?: number;
    workerUrl?: URL;
    timeoutMs?: number;
    cacheDir?: string;
    onMetadataProgress?: (probes: number) => void;
  } = {},
): Promise<number> {
  signal?.throwIfAborted();
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(
      options.workerUrl ?? new URL("./tree-scan-worker.ts", import.meta.url),
    );
    let settled = false;
    let lastEntries = 0;
    let lastProbes = 0;
    let lastProgress = performance.now();
    let lastTick = lastProgress;
    const watchdog = setInterval(
      () => {
        if (settled) return;
        const tick = performance.now();
        // Synchronous discovery/jj can delay delivery of worker counters.
        if (tick - lastTick > Math.max(500, (options.stallMs ?? 10_000) / 2))
          lastProgress = tick;
        lastTick = tick;
        const stalled =
          performance.now() - lastProgress >=
          (options.stallMs ?? options.timeoutMs ?? 10_000);
        if (!stalled) return;
        settled = true;
        cleanup();
        reject(new Error(`${path}: tree scan stopped: no progress`));
      },
      Math.min(250, options.stallMs ?? 10_000),
    );
    const cleanup = () => {
      clearInterval(watchdog);
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
        if (event.data.kind === "activity") {
          if (event.data.probes > lastProbes) {
            lastProbes = event.data.probes;
            lastProgress = performance.now();
            options.onMetadataProgress?.(event.data.probes);
          }
          return;
        }
        if (event.data.kind === "progress") {
          if (event.data.entries > lastEntries) {
            lastEntries = event.data.entries;
            lastProgress = performance.now();
          }
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
    else worker.postMessage({ path, cacheDir: options.cacheDir }, []);
  });
}

type TreeScanMessage =
  | { kind: "activity"; probes: number }
  | { kind: "progress"; entries: number; bytes: number }
  | { kind: "done"; entries: number; bytes: number }
  | { kind: "error"; message: string };

export async function measuredTreeBytes(
  path: string,
  ctx?: Context,
): Promise<number> {
  let lastMetadataReport = 0;
  const onMetadataProgress = (probes: number) => {
    if (performance.now() - lastMetadataReport < 2000) return;
    lastMetadataReport = performance.now();
    ctx?.reportActivity?.(
      ctx.targetName ?? path,
      `metadata ${path}: ${probes} probes`,
    );
  };
  let probes = 0;
  const cache = scanCache(
    path,
    "allocated-v1",
    ctx === undefined
      ? undefined
      : {
          ...ctx,
          onProbe: () => {
            probes++;
            onMetadataProgress(probes);
          },
        },
  );
  const cached = z.number().nonnegative().safeParse(cache.value);
  if (cached.success) {
    ctx?.reportActivity?.(ctx.targetName ?? path, `cache hit ${path}`);
    return cached.data;
  }
  ctx?.reportActivity?.(ctx.targetName ?? path, `walking ${path}`);
  const bytes = await treeBytes(
    path,
    ctx?.reportProgress === undefined
      ? undefined
      : (entries, measuredBytes) => {
          ctx.reportProgress?.(
            ctx.targetName ?? path,
            path,
            entries,
            measuredBytes,
          );
        },
    ctx?.signal,
    {
      onMetadataProgress,
      ...(ctx?.mode === "plan"
        ? { cacheDir: ctx.scanCacheDir ?? defaultScanCacheDir() }
        : {}),
    },
  );
  cache.save(bytes);
  return bytes;
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
