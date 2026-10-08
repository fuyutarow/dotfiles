import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { Candidate } from "../model.ts";
import { collectProcesses, resolveProcRoot } from "../lib/procs.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, treeCandidate } from "./tree.ts";

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

function findTargets(root: string, depth = 0): string[] {
  if (depth > 4) return [];
  const names = fromThrowable(() => readdirSync(root))()
    .map((entries) => entries.toSorted())
    .unwrapOr([]);
  return names.flatMap((name) => {
    const path = join(root, name);
    const stat = fromThrowable(() => lstatSync(path))();
    if (
      stat.isErr() ||
      !stat.value.isDirectory() ||
      stat.value.isSymbolicLink()
    )
      return [];
    if (name === "target") return [path];
    return findTargets(path, depth + 1);
  });
}

function lastBuilt(path: string): number | undefined {
  const own = fromThrowable(() => statSync(path))();
  if (own.isErr()) return undefined;
  const entries = fromThrowable(() => readdirSync(path))();
  if (entries.isErr()) return undefined;
  return Math.floor(
    Math.max(
      own.value.mtimeMs,
      ...entries.value.map((name) =>
        fromThrowable(() => statSync(join(path, name)).mtimeMs)().unwrapOr(0),
      ),
    ) / 1000,
  );
}

const ask = (candidate: Candidate, reason: string): Candidate => ({
  ...candidate,
  verdict: "ASK",
  reason,
  action: { kind: "delete", argv: [] },
});

function targetRows(
  path: string,
  unknown: string[],
  processes: ReturnType<typeof collectProcesses>["processes"],
): Candidate[] {
  const project = dirname(path);
  const manifest = fromThrowable(() => statSync(join(project, "Cargo.toml")))();
  const base = treeCandidate(path, "Rust target is idle and regenerable");
  if (manifest.isErr() || !manifest.value.isFile())
    return [
      ask(
        base,
        "Cargo.toml is missing or unreadable; target ownership is unknown",
      ),
    ];

  const target = resolve(path);
  const usesTarget = processes.some((process) => {
    const name =
      process.comm ??
      (process.exe === undefined ? undefined : basename(process.exe));
    if (!["cargo", "rustc", "rust-analyzer", "sccache"].includes(name ?? ""))
      return false;
    const cargoTarget = process.environ
      ?.split("\0")
      .find((entry) => entry.startsWith("CARGO_TARGET_DIR="))
      ?.slice("CARGO_TARGET_DIR=".length);
    return (
      (process.cwd !== undefined && within(resolve(process.cwd), project)) ||
      process.openPaths.some((openPath) => within(resolve(openPath), target)) ||
      (cargoTarget !== undefined &&
        resolve(process.cwd ?? project, cargoTarget) === target)
    );
  });
  if (usesTarget)
    return [
      {
        ...base,
        verdict: "KEEP",
        reason: "live Rust build process uses this target",
        action: { kind: "delete", argv: [] },
      },
    ];

  const liveRepoSession = processes.some(
    (process) =>
      process.cwd !== undefined && within(resolve(process.cwd), project),
  );
  const uncertain = unknown.length > 0;
  const rows: Candidate[] = [];
  let verdict: Candidate["verdict"] = "RECLAIM";
  let reason = "Rust target is idle and regenerable";
  if (liveRepoSession) {
    verdict = "ASK";
    reason =
      "live process cwd is inside the repository; no Rust build process uses this target";
  } else if (uncertain) {
    verdict = "ASK";
    reason = `process state is unreadable; cannot confirm target is idle: ${unknown.join("; ")}`;
  }
  const parent = verdict === "RECLAIM" ? base : ask(base, reason);
  rows.push(parent);
  const incremental = join(path, "incremental");
  if (verdict === "ASK" && existsSync(incremental)) {
    const child = treeCandidate(
      incremental,
      "incremental cache inside an unresolved Rust target",
    );
    rows.push(ask(child, reason));
  }
  return rows;
}

export const createRustTarget = (root?: () => string) =>
  ({
    name: "rust",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: (ctx: Context) => {
      const home = process.env.HOME ?? homedir();
      const roots =
        root === undefined
          ? [
              ...(process.env.AUDIT_PROJECTS ?? join(home, "Workspace"))
                .split(":")
                .filter((path) => path !== ""),
              process.env.KONDO_DIR ?? home,
            ]
          : [root()];
      const targets = [
        ...new Set(roots.flatMap((scanRoot) => findTargets(scanRoot))),
      ];
      const snapshot = collectProcesses({
        procRoot: resolveProcRoot(ctx.procDir),
        ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
      });
      const now = Temporal.Now.instant().epochMilliseconds / 1000;
      return targets
        .flatMap((path) =>
          targetRows(
            path,
            snapshot.openPaths(path).unknown,
            snapshot.processes,
          ),
        )
        .toSorted((a, b) => {
          const aBuilt = lastBuilt(a.path ?? "") ?? now;
          const bBuilt = lastBuilt(b.path ?? "") ?? now;
          return aBuilt - bBuilt;
        });
    },
    act: deleteTree,
  }) satisfies Target;

export const rust = createRustTarget();
