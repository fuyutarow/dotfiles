import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "@dotfiles/shared/src/zod.ts";
import { graveyardCandidates, existingGraveyards } from "../lib/graveyards.ts";
import {
  liveExecutables,
  readStore,
  releasesToRemove,
  STORES,
} from "../lib/version-stores.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { cachedDiscoveryAsync, checkScanDeadline } from "../lib/scan-cache.ts";
import { measuredTreeBytes } from "./tree.ts";

async function treeSize(
  path: string,
  progress?: (path: string, entries: number, bytes: number) => void,
): Promise<number> {
  let total = 0;
  let entries = 0;
  const visit = async (item: string): Promise<void> => {
    entries += 1;
    const stat = await lstat(item).catch(() => null);
    if (stat === null) {
      progress?.(path, entries, total);
      return;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      total += stat.blocks * 512;
      progress?.(path, entries, total);
      return;
    }
    const names = await readdir(item).catch(() => []);
    progress?.(path, entries, total);
    for (const name of names) await visit(join(item, name));
  };
  await visit(path);
  return total;
}

async function rustPins(
  root: string,
  depth = 0,
  ctx?: Context,
): Promise<string[]> {
  checkScanDeadline(ctx);
  if (depth > 5) return [];
  const names = await readdir(root).catch(() => []);
  const found: string[] = [];
  for (const name of names.toSorted((a, b) => a.localeCompare(b))) {
    const path = join(root, name);
    if (name === "rust-toolchain" || name === "rust-toolchain.toml") {
      found.push(path);
      continue;
    }
    const stat = await lstat(path).catch(() => null);
    if (stat === null || !stat.isDirectory() || stat.isSymbolicLink()) continue;
    found.push(...(await rustPins(path, depth + 1, ctx)));
  }
  return found;
}

export async function auditCandidates(
  home: string,
  env: Record<string, string | undefined>,
  progress?: Context["reportProgress"],
  context?: Context,
): Promise<Candidate[]> {
  const rows: Candidate[] = [];
  const staleDays = Number(env["STALE_DAYS"] ?? "180");
  const cutoff =
    Temporal.Now.instant().epochMilliseconds - staleDays * 86400_000;
  const homeEntries = fromThrowable(() => readdirSync(home))().unwrapOr([]);
  for (const name of homeEntries.toSorted((a, b) => a.localeCompare(b))) {
    if (!name.startsWith(".") || name.startsWith("..")) continue;
    const path = join(home, name);
    const stat = fromThrowable(() => lstatSync(path))();
    if (
      stat.isErr() ||
      !stat.value.isDirectory() ||
      stat.value.mtimeMs > cutoff
    )
      continue;
    const st = stat.value;
    rows.push({
      id: `stale:${name}`,
      path,
      verdict: "KEEP",
      reason: `stale dotdir audit item (${st.mtime.toISOString()})`,
      checks: [{ name: "age", ok: true, detail: `${staleDays}+ days` }],
      bytes: null,
      bytes_kind: "estimate",
      action: { kind: "command", argv: [] },
      result: null,
    });
  }
  const cache = join(home, ".cache");
  const cacheEntries = fromThrowable(() => readdirSync(cache))().unwrapOr([]);
  for (const name of cacheEntries.toSorted((a, b) => a.localeCompare(b))) {
    const path = join(cache, name);
    rows.push({
      id: `cache:${name}`,
      path,
      verdict: "KEEP",
      reason: "~/.cache breakdown audit item",
      checks: [{ name: "reported-only", ok: true, detail: "read-only" }],
      bytes: null,
      bytes_kind: "estimate",
      action: { kind: "command", argv: [] },
      result: null,
    });
  }
  const report = (
    id: string,
    path: string,
    reason: string,
    bytes: number | null,
    detail = "read-only",
  ) => {
    rows.push({
      id,
      path,
      verdict: "KEEP",
      reason,
      checks: [{ name: "reported-only", ok: true, detail }],
      bytes,
      bytes_kind: "estimate",
      action: { kind: "command", argv: [] },
      result: null,
    });
  };
  const size = (path: string) =>
    context === undefined
      ? treeSize(path, (root, entries, bytes) =>
          progress?.("audit", root, entries, bytes),
        )
      : measuredTreeBytes(path, context);
  const projects = env["AUDIT_PROJECTS"] ?? join(home, "Workspace");
  const pins: string[] = [];
  for (const root of projects.split(":")) {
    pins.push(
      ...(await (context === undefined
        ? rustPins(root)
        : cachedDiscoveryAsync(root, "audit-pin-discovery-v1", context, () =>
            rustPins(root, 0, context),
          ))),
    );
  }
  for (const path of pins) {
    const text = fromThrowable(() => readFileSync(path, "utf8"))();
    if (text.isErr()) continue;
    const channel =
      /channel\s*=\s*"?([^"\s]+)"?/u.exec(text.value)?.[1] ??
      text.value.trim().split("\n")[0] ??
      "";
    report(
      `rust-pin:${path}`,
      path,
      `rust-toolchain pin: ${channel}`,
      await size(path),
      channel,
    );
  }
  const toolchains = join(home, ".rustup/toolchains");
  const rustupEntries = fromThrowable(() => readdirSync(toolchains))().unwrapOr(
    [],
  );
  for (const name of rustupEntries.toSorted((a, b) => a.localeCompare(b))) {
    const path = join(toolchains, name);
    const stat = fromThrowable(() => statSync(path))();
    if (!stat.isOk() || !stat.value.isDirectory()) continue;
    report(
      `rust-toolchain:${name}`,
      path,
      "installed rustup toolchain",
      await size(path),
    );
  }
  const servers = join(home, ".vscode-server/cli/servers");
  const serverEntries = fromThrowable(() => readdirSync(servers))().unwrapOr(
    [],
  );
  for (const name of serverEntries.toSorted((a, b) => a.localeCompare(b))) {
    if (!name.startsWith("Stable-")) continue;
    const path = join(servers, name);
    const stat = fromThrowable(() => statSync(path))();
    if (!stat.isOk() || !stat.value.isDirectory()) continue;
    report(
      `vscode-server:${name}`,
      path,
      "VS Code server version",
      await size(path),
    );
  }
  const live = await liveExecutables();
  const nowSec = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
  for (const store of STORES) {
    const { releases, current } = await readStore(home, store);
    const removable = new Set(
      releasesToRemove(releases, { current, live, nowSec, keepDays: 2 }).map(
        (release) => release.name,
      ),
    );
    for (const release of releases) {
      const busy = (live ?? []).some(
        (exe) => exe === release.path || exe.startsWith(`${release.path}/`),
      );
      const status = [
        release.name === current ? "current" : "",
        busy ? "running" : "",
        removable.has(release.name) ? "eligible for removal" : "",
      ]
        .filter(Boolean)
        .join(", ");
      report(
        `version-store:${store.name}:${release.name}`,
        release.path,
        `self-updating CLI release${status === "" ? "" : ` (${status})`}`,
        await size(release.path),
      );
    }
  }
  const buildDirs: string[] = [];
  const findBuildDirs = async (root: string, depth: number): Promise<void> => {
    checkScanDeadline(context);
    if (depth >= 4) return;
    const names = await readdir(root).catch(() => []);
    for (const name of names.toSorted((a, b) => a.localeCompare(b))) {
      const path = join(root, name);
      const stat = await lstat(path).catch(() => null);
      if (stat === null || !stat.isDirectory() || stat.isSymbolicLink())
        continue;
      if (name === "target" || name === "node_modules" || name === ".venv") {
        buildDirs.push(path);
        continue;
      }
      await findBuildDirs(path, depth + 1);
    }
  };
  for (const root of projects.split(":")) {
    if (context === undefined) await findBuildDirs(root, 0);
    else
      buildDirs.push(
        ...(await cachedDiscoveryAsync(
          root,
          "audit-build-discovery-v1",
          context,
          async () => {
            const start = buildDirs.length;
            await findBuildDirs(root, 0);
            return buildDirs.splice(start);
          },
        )),
      );
  }
  const measuredBuilds = [];
  for (const itemPath of buildDirs)
    measuredBuilds.push({ path: itemPath, bytes: await size(itemPath) });
  for (const { path: candidatePath, bytes } of measuredBuilds
    .toSorted((a, b) => b.bytes - a.bytes)
    .slice(0, 8)) {
    report(
      `build:${candidatePath}`,
      candidatePath,
      "largest build directory audit item",
      bytes,
    );
  }
  for (const name of rustupEntries.toSorted((a, b) => a.localeCompare(b))) {
    const path = join(toolchains, name, "share/doc/rust/html");
    if (!existsSync(path)) continue;
    report(
      `rust-docs:${name}`,
      path,
      "optional offline rust-docs",
      await size(path),
    );
  }
  for (const g of existingGraveyards(graveyardCandidates(env, home))) {
    rows.push({
      id: `graveyard:${g.label}`,
      path: g.path,
      verdict: "KEEP",
      reason: "graveyard audit item",
      checks: [
        {
          name: "reported-only",
          ok: true,
          detail: "purge is a separate target",
        },
      ],
      bytes: null,
      bytes_kind: "estimate",
      action: { kind: "command", argv: [] },
      result: null,
    });
  }
  const state =
    env["RECLAIM_STATE_DIR"] ??
    join(env["XDG_STATE_HOME"] ?? join(home, ".local/state"), "reclaim");
  const log = join(state, "log.jsonl");
  if (existsSync(log)) {
    for (const line of readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-6)) {
      rows.push({
        id: `receipt:${rows.length}`,
        path: log,
        verdict: "KEEP",
        reason: "recent reclaim receipt audit item",
        checks: [{ name: "receipt", ok: true, detail: line.slice(0, 240) }],
        bytes: null,
        bytes_kind: "estimate",
        action: { kind: "command", argv: [] },
        result: null,
      });
    }
  }
  return rows;
}

export const audit: Target = {
  name: "audit",
  tier: "plan-only",
  available: () => ({ available: true, skip_reason: null }),
  plan: (ctx) =>
    auditCandidates(homedir(), process.env, ctx.reportProgress, ctx),
  act: () => ({ ok: false, bytes_freed: null, error: "audit is read-only" }),
};
