import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  liveExecutables,
  readStore,
  releasesToRemove,
  STORES,
} from "../lib/version-stores.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, keepTreeCandidate, treeCandidate } from "./tree.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";

const walkPins = (root: string, depth = 0): string[] => {
  if (depth > 5) return [];
  const names = fromThrowable(() => readdirSync(root))().unwrapOr([]);
  return names.flatMap((name) => {
    const path = join(root, name);
    const stat = fromThrowable(() => statSync(path))();
    if (stat.isErr()) return [];
    if (stat.value.isDirectory()) return walkPins(path, depth + 1);
    if (name === "rust-toolchain" || name === "rust-toolchain.toml")
      return [path];
    return [];
  });
};
const channel = (text: string) =>
  /channel\s*=\s*"?([^"\s]+)"?/u.exec(text)?.[1] ??
  text.trim().split("\n")[0]?.trim();
export const createToolchainsTarget = (
  homePath: () => string = () => process.env.HOME ?? homedir(),
  rustupOptions?: {
    available: () => boolean;
    defaultToolchain: () => string | undefined;
  },
) => {
  const rustup = rustupOptions ?? {
    available: () => Bun.which("rustup") !== null && Bun.which("fd") !== null,
    defaultToolchain: () =>
      fromThrowable(() =>
        Bun.spawnSync(["rustup", "show", "active-toolchain"], {
          stdout: "pipe",
          stderr: "ignore",
        }),
      )()
        .map((result) => result.stdout.toString().trim().split(/\s+/u)[0])
        .unwrapOr(undefined),
  };
  return {
    name: "toolchains",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: (_ctx: Context) => {
      const home = homePath();
      const projects = process.env.AUDIT_PROJECTS ?? join(home, "Workspace");
      const keepDays = Number(process.env.KEEP_DAYS ?? "2");
      const nowSec = Math.floor(
        Temporal.Now.instant().epochMilliseconds / 1000,
      );
      const live = liveExecutables(_ctx.procDir);
      const candidates = [];
      const rustupDir = join(home, ".rustup/toolchains");
      const pins = walkPins(projects)
        .flatMap((path) =>
          fromThrowable(() => readFileSync(path, "utf8"))()
            .map((text) => [channel(text) ?? ""])
            .unwrapOr([]),
        )
        .filter(Boolean);
      let rustupNames: string[] = [];
      let defaultName: string | undefined;
      if (rustup.available() && existsSync(rustupDir)) {
        rustupNames = fromThrowable(() => readdirSync(rustupDir))()
          .map((names) => names.toSorted())
          .unwrapOr([]);
        defaultName = rustup.defaultToolchain();
      }
      for (const name of rustupNames) {
        const path = join(rustupDir, name);
        if (name === defaultName) {
          candidates.push(keepTreeCandidate(path, "default rustup toolchain"));
          continue;
        }
        if (pins.some((p) => name.startsWith(p) || p.startsWith(name))) {
          candidates.push(keepTreeCandidate(path, "pinned rustup toolchain"));
          continue;
        }
        candidates.push(
          treeCandidate(path, "non-default rustup toolchain is not pinned"),
        );
      }
      const servers = join(home, ".vscode-server/cli/servers");
      const serverNames = fromThrowable(() => readdirSync(servers))()
        .unwrapOr([])
        .filter(
          (name) =>
            name.startsWith("Stable-") &&
            fromThrowable(() =>
              statSync(join(servers, name)).isDirectory(),
            )().unwrapOr(false),
        );
      let newest: string | undefined;
      for (const name of serverNames) {
        const stat = fromThrowable(() => statSync(join(servers, name)))();
        if (stat.isErr()) continue;
        if (newest === undefined) {
          newest = name;
          continue;
        }
        const latestName = newest;
        const latest = fromThrowable(() =>
          statSync(join(servers, latestName)),
        )();
        if (latest.isOk() && stat.value.mtimeMs > latest.value.mtimeMs)
          newest = name;
      }
      for (const name of serverNames) {
        const path = join(servers, name);
        const hash = name.replace(/^Stable-/u, "").replace(/\.staging$/u, "");
        const busy = fromThrowable(() =>
          Bun.spawnSync(["pgrep", "-f", hash], {
            stdout: "ignore",
            stderr: "ignore",
          }),
        )();
        const stat = fromThrowable(() => statSync(path))();
        if (busy.isErr() || stat.isErr()) continue;
        if (
          name === newest ||
          stat.value.mtimeMs / 1000 >= nowSec - keepDays * 86400 ||
          busy.value.exitCode === 0
        )
          continue;
        candidates.push(treeCandidate(path, "old idle VS Code server version"));
      }
      for (const store of STORES) {
        const found = readStore(home, store);
        for (const release of releasesToRemove(found.releases, {
          current: found.current,
          live,
          nowSec,
          keepDays,
        }))
          candidates.push(
            treeCandidate(release.path, `superseded ${store.name} release`),
          );
      }
      return candidates;
    },
    act: deleteTree,
  } satisfies Target;
};
export const toolchains = createToolchainsTarget();
