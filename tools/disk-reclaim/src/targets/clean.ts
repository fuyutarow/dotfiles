import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { Context, Target } from "./index.ts";
import { deleteTree, keepTreeCandidate, treeCandidate } from "./tree.ts";
import { processBusy } from "../lib/busy.ts";

export type ProcessProbe = (comm: string) => boolean;

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
  home: () => string = () => process.env.HOME ?? homedir(),
  isBusy: ProcessProbe = processBusy,
  bunGc: (homePath: string) => boolean = (homePath) => {
    const result = Bun.spawnSync(["bun", "pm", "cache", "rm"], {
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, HOME: homePath },
    });
    return result.exitCode === 0;
  },
) =>
  ({
    name: "clean",
    tier: "blind",
    available: (_ctx?: Context) => ({ available: true, skip_reason: null }),
    plan: (_ctx: Context) => {
      const root = home();
      return paths(root)
        .filter((p) => existsSync(p))
        .map((p) => {
          let comm: string | undefined;
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
            return keepTreeCandidate(p, "busy: cargo");
          if (comm !== undefined && isBusy(comm))
            return keepTreeCandidate(p, `busy: ${comm}`);
          return treeCandidate(p, "regenerable package cache");
        });
    },
    act: (candidate, ctx) => {
      if (candidate.path?.endsWith("/.bun/install/cache") === true) {
        if (isBusy("bun"))
          return { ok: false, bytes_freed: null, error: "busy: bun" };
        if (bunGc(home()))
          return { ok: true, bytes_freed: candidate.bytes ?? 0, error: null };
      }
      return deleteTree(candidate, ctx);
    },
  }) satisfies Target;
export const clean = createCleanTarget();
