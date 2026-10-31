import { access, lstat, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { Candidate } from "../model.ts";
import { collectProcesses, resolveProcRoot } from "../lib/procs.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, treeCandidate } from "./tree.ts";
import { cachedDiscoveryAsync, checkScanDeadline } from "../lib/scan-cache.ts";

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

async function findTargets(
  root: string,
  depth = 0,
  ctx?: Context,
): Promise<string[]> {
  checkScanDeadline(ctx);
  if (depth > 4) return [];
  const names = await readdir(root).then(
    (entries) => entries.toSorted(),
    () => [],
  );
  const targets: string[] = [];
  for (const name of names) {
    const path = join(root, name);
    const entry = await lstat(path).catch(() => null);
    if (entry === null || !entry.isDirectory() || entry.isSymbolicLink())
      continue;
    if (name === "target") targets.push(path);
    else targets.push(...(await findTargets(path, depth + 1, ctx)));
  }
  return targets;
}

async function lastBuilt(path: string): Promise<number | undefined> {
  const own = await stat(path).catch(() => null);
  if (own === null) return undefined;
  const entries = await readdir(path).catch(() => null);
  if (entries === null) return undefined;
  const times = await Promise.all(
    entries.map((name) =>
      stat(join(path, name)).then(
        (entry) => entry.mtimeMs,
        () => 0,
      ),
    ),
  );
  return Math.floor(Math.max(own.mtimeMs, ...times) / 1000);
}

const ask = (candidate: Candidate, reason: string): Candidate => ({
  ...candidate,
  verdict: "ASK",
  reason,
  action: { kind: "delete", argv: [] },
});

async function targetRows(
  path: string,
  unknown: string[],
  processes: ReturnType<typeof collectProcesses>["processes"],
  ctx: Context,
): Promise<Candidate[]> {
  const project = dirname(path);
  const manifest = await stat(join(project, "Cargo.toml")).catch(() => null);
  const base = await treeCandidate(
    path,
    "Rust target is idle and regenerable",
    ctx,
  );
  if (manifest === null || !manifest.isFile())
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
  if (
    verdict === "ASK" &&
    (await access(incremental).then(
      () => true,
      () => false,
    ))
  ) {
    const child = await treeCandidate(
      incremental,
      "incremental cache inside an unresolved Rust target",
      ctx,
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
    plan: async (ctx: Context) => {
      const home = process.env["HOME"] ?? homedir();
      const roots =
        root === undefined
          ? [
              ...(process.env["AUDIT_PROJECTS"] ?? join(home, "Workspace"))
                .split(":")
                .filter((path) => path !== ""),
              process.env["KONDO_DIR"] ?? home,
            ]
          : [root()];
      const discovered: string[] = [];
      for (const scanRoot of roots)
        discovered.push(
          ...(await cachedDiscoveryAsync(
            scanRoot,
            "rust-discovery-v1",
            ctx,
            () => findTargets(scanRoot, 0, ctx),
          )),
        );
      const targets = [...new Set(discovered)];
      const snapshot = collectProcesses({
        procRoot: resolveProcRoot(ctx.procDir),
        ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        diagnostics: (summary, details) => {
          if (ctx.reportProcessFailures !== undefined) {
            ctx.reportProcessFailures(summary, details);
            return;
          }
          ctx.log(summary);
          if (ctx.verbose === true)
            for (const detail of details) ctx.log(detail);
        },
      });
      const now = Temporal.Now.instant().epochMilliseconds / 1000;
      const rows: Candidate[] = [];
      for (const path of targets) {
        rows.push(
          ...(await targetRows(
            path,
            snapshot.openPaths(path).unknown,
            snapshot.processes,
            ctx,
          )),
        );
      }
      const built = await Promise.all(
        rows.map(async (row) => ({
          row,
          time: (await lastBuilt(row.path ?? "")) ?? now,
        })),
      );
      return built.toSorted((a, b) => a.time - b.time).map(({ row }) => row);
    },
    act: deleteTree,
  }) satisfies Target;

export const rust = createRustTarget();
