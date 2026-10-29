import { lstat } from "node:fs/promises";
import { dirname } from "node:path";
import { loadConfig } from "./engine.ts";
import { protectedReason } from "./lib/protected.ts";
import { Candidate, type Config } from "./model.ts";
import { createToolchainsTarget } from "./targets/toolchains.ts";
import type { Context, Target } from "./targets/index.ts";

const fingerprint = async (path: string) => {
  const s = await lstat(path);
  return JSON.stringify([
    s.dev,
    s.ino,
    s.mode,
    s.uid,
    s.size,
    s.mtimeMs,
    s.ctimeMs,
  ]);
};

/** This worker is bounded and observed by its parent, which holds the shared lock. */
export async function toolchainsWorker(
  request: { path?: string; fingerprint?: string },
  injected?: {
    config: Config;
    target: Target;
    fingerprint: (path: string) => Promise<string>;
    protection: (path: string) => string | null;
  },
) {
  const loaded =
    injected === undefined
      ? loadConfig()
      : { config: injected.config, error: null };
  if (loaded.config === null)
    return { error: loaded.error ?? "configuration unavailable" };
  const target =
    injected?.target ??
    createToolchainsTarget(undefined, undefined, undefined, {
      includeRefusals: true,
    });
  const identify = injected?.fingerprint ?? fingerprint;
  const ctx: Context = {
    mode: "run",
    explicit: true,
    targetName: "toolchains",
    config: loaded.config,
    log: (message) => {
      process.stderr.write(`${message}\n`);
    },
  };
  const parsed = Candidate.array().safeParse(await target.plan(ctx));
  if (!parsed.success) return { error: parsed.error.message };
  const candidates = parsed.data;
  if (request.path === undefined) {
    return Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        fingerprint:
          candidate.verdict === "RECLAIM" && candidate.path !== null
            ? await identify(candidate.path)
            : null,
      })),
    );
  }
  const candidate = candidates.find((row) => row.path === request.path);
  if (candidate === undefined || candidate.verdict !== "RECLAIM")
    return {
      verdict: "changed",
      reason: "candidate is no longer eligible",
      effect: "none",
      detail: candidate ?? null,
    };
  const protection =
    injected?.protection(request.path) ??
    (injected === undefined
      ? protectedReason(request.path, {
          ownerTarget: "toolchains",
          repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
          protectedPaths: ctx.config.protected ?? [],
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        })
      : null);
  if (protection !== null)
    return {
      verdict: protection === "process paths are unknown" ? "unknown" : "keep",
      reason: protection,
      effect: "none",
      detail: candidate,
    };
  if ((await identify(request.path)) !== request.fingerprint)
    return {
      verdict: "changed",
      reason: "fingerprint changed",
      effect: "none",
      detail: candidate,
    };
  let sameFilesystem = true;
  if (injected === undefined) {
    const [entry, parent] = await Promise.all([
      lstat(request.path),
      lstat(dirname(request.path)),
    ]);
    sameFilesystem = entry.dev === parent.dev;
  }
  const result = await target.act(candidate, ctx);
  return {
    verdict: result.ok ? "completed" : "failed",
    reason: result.error ?? "toolchain removed",
    effect: "unlink",
    detail: result,
    same_filesystem: sameFilesystem,
  };
}
