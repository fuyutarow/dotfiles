import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { Context, Target } from "./index.ts";
import { deleteTree, keepTreeCandidate, treeCandidate } from "./tree.ts";
import { processBusy } from "../lib/busy.ts";

export type ProcessProbe = (comm: string) => boolean;
const defaultFs = {
  exists: existsSync,
  tree: treeCandidate,
  keep: keepTreeCandidate,
};

const paths = (home: string) => [
  `${home}/.bun/install/cache`,
  `${home}/.npm/_cacache`,
  `${home}/.pnpm-store`,
  `${home}/.cache/uv`,
  `${home}/.cache/pip`,
  `${home}/.cargo/registry/src`,
  `${home}/.cargo/registry/cache`,
  `${home}/.cargo/git/checkouts`,
  `${home}/.julia/compiled`,
  `${home}/.julia/scratchspaces`,
];
export const createCleanTarget = (
  home: () => string = () => process.env["HOME"] ?? homedir(),
  isBusy: ProcessProbe = processBusy,
  bunGc: (homePath: string) => boolean | Promise<boolean> = async (
    homePath,
  ) => {
    const child = Bun.spawn(["bun", "pm", "cache", "rm"], {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 120_000,
      env: { ...process.env, HOME: homePath },
    });
    return (await child.exited) === 0;
  },
  fs = defaultFs,
) =>
  ({
    name: "clean",
    tier: "blind",
    available: (_ctx?: Context) => ({ available: true, skip_reason: null }),
    plan: async (_ctx: Context) => {
      const root = home();
      return Promise.all(
        [
          ...new Set([
            ...paths(root),
            ...(_ctx.config.regenerable_caches ?? []).map((rule) =>
              rule.path.replace(/^~/u, root),
            ),
          ]),
        ]
          .filter((p) => fs.exists(p))
          .map((p) => {
            let comm = _ctx.config.regenerable_caches?.find(
              (rule) => rule.path.replace(/^~/u, root) === p,
            )?.process;
            if (p.endsWith("/.cache/uv")) comm = "uv";
            else if (
              p.endsWith("/.julia/compiled") ||
              p.endsWith("/.julia/scratchspaces")
            )
              comm = "julia";
            else if (p.endsWith("/.bun/install/cache")) comm = "bun";
            else if (
              (p.startsWith(`${root}/.cargo/registry/`) ||
                p.startsWith(`${root}/.cargo/git/`)) &&
              ["cargo", "rustc", "rust-analyzer"].some((name) => isBusy(name))
            )
              return fs.keep(p, "busy: cargo", _ctx);
            if (comm !== undefined && isBusy(comm))
              return fs.keep(p, `busy: ${comm}`, _ctx);
            return fs.tree(p, "regenerable package cache", _ctx);
          }),
      );
    },
    act: async (candidate, ctx) => {
      if (candidate.path?.endsWith("/.bun/install/cache") === true) {
        if (isBusy("bun"))
          return { ok: false, bytes_freed: null, error: "busy: bun" };
        if (await bunGc(home()))
          return { ok: true, bytes_freed: candidate.bytes ?? 0, error: null };
      }
      return deleteTree(candidate, ctx);
    },
  }) satisfies Target;
export const clean = createCleanTarget();
