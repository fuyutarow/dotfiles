import { existsSync, lstatSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import { protectedReason } from "../lib/protected.ts";
import type { ActionResult, Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";

export const docsComponents = (installed: readonly string[]): string[] =>
  installed.filter((n) => /^rust-docs(?:-|$)/u.test(n));
const candidate = (id: string, path: string, bytes: number): Candidate => ({
  id,
  path,
  verdict: "RECLAIM",
  reason: "owner-approved optional rust-docs",
  checks: [{ name: "exists", ok: true, detail: "candidate exists" }],
  bytes,
  bytes_kind: "estimate",
  action: { kind: "delete", argv: ["removeTree", path] },
  result: null,
});

export function judgmentCandidates(
  env = process.env,
  home = homedir(),
  protection: {
    repoRoots?: string[];
    protectedPaths?: string[];
    procDir?: string;
    ignoreUnreadableProcs?: readonly string[];
  } = {},
): Candidate[] {
  const result: Candidate[] = [];
  const rustup = env.RUSTUP_HOME ?? join(home, ".rustup");
  const toolchains = join(rustup, "toolchains");
  const toolchainNames = fromThrowable(() =>
    readdirSync(toolchains),
  )().unwrapOr([]);
  for (const toolchain of toolchainNames) {
    const docs = join(toolchains, toolchain, "share/doc/rust/html");
    if (!existsSync(docs)) continue;
    const reason = protectedReason(docs, {
      ownerTarget: "judgment",
      home,
      ...(protection.repoRoots === undefined
        ? {}
        : { repoRoots: protection.repoRoots }),
      ...(protection.protectedPaths === undefined
        ? {}
        : { protectedPaths: protection.protectedPaths }),
      ...(protection.procDir === undefined
        ? {}
        : { procDir: protection.procDir }),
      ignoreUnreadableProcs: protection.ignoreUnreadableProcs ?? [],
    });
    const item = candidate(docs, docs, estimate(docs));
    if (reason === null) result.push(item);
    else {
      const verdict = reason === "process paths are unknown" ? "ASK" : "KEEP";
      result.push({
        ...item,
        verdict,
        reason: `protected: ${reason}`,
        action: { kind: "delete", argv: [] },
      });
    }
  }
  return result;
}

function estimate(path: string): number {
  let size = 0;
  const walk = (p: string): void => {
    const stat = fromThrowable(() => lstatSync(p))();
    if (stat.isErr()) return;
    if (!stat.value.isDirectory() || stat.value.isSymbolicLink()) {
      size += stat.value.blocks * 512;
      return;
    }
    const names = fromThrowable(() => readdirSync(p))().unwrapOr([]);
    for (const name of names) walk(join(p, name));
  };
  walk(path);
  return size;
}

export const judgment: Target = {
  name: "judgment",
  tier: "owner",
  available: () => ({ available: true, skip_reason: null }),
  plan: (ctx: Context) =>
    judgmentCandidates(process.env, homedir(), {
      repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
      ...(ctx.config.protected === undefined
        ? {}
        : { protectedPaths: ctx.config.protected }),
      ...(ctx.procDir === undefined ? {} : { procDir: ctx.procDir }),
      ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
    }),
  act: (c, ctx): ActionResult => {
    if (c.path === null)
      return { ok: false, bytes_freed: null, error: "missing path" };
    const r = removeTree(c.path, {
      uid: process.getuid?.() ?? 0,
      protection: {
        ownerTarget: "judgment",
        procDir: ctx.procDir,
        repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
        protectedPaths: ctx.config.protected ?? [],
        ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
      },
      progress: removeTreeProgress(c.path, c.bytes, ctx),
    });
    for (const refusal of r.refused)
      ctx.log(
        `${refusal.path}: refused: ${refusal.reason}; repair: ${refusal.repair}`,
      );
    for (const error of r.errors) ctx.log(`${error.path}: ${error.error}`);
    return {
      ok: r.ok,
      bytes_freed: r.statfs_bytes_freed,
      error: r.ok ? null : "one or more entries were refused or failed",
    };
  },
};
