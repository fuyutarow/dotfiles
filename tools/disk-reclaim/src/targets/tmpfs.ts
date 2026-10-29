import {
  accessSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statfsSync,
} from "node:fs";
import { lstat } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { removeTree } from "../lib/remove-tree.ts";
import { collectProcesses } from "../lib/procs.ts";
import { fromThrowable } from "@dotfiles/shared/src/zod.ts";
import { checkScanDeadline } from "../lib/scan-cache.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";

type Mount = { path: string; type: string };
type Filesystem = {
  type: bigint;
  files: bigint;
  ffree: bigint;
  blocks: bigint;
  bfree: bigint;
  bsize: bigint;
};
type TmpfsOptions = {
  mounts?: () => Mount[];
  statfs?: (path: string) => Filesystem;
  uid?: () => number;
  now?: () => number;
  isOpen?: (path: string) => boolean | null;
  ripGraveyard?: () => string | undefined;
  diskGraveyard?: () => string;
  isDiskPath?: (path: string) => boolean;
  scanMaxEntries?: number;
  scanMaxMs?: number;
};

const TMPFS_MAGIC = 0x01021994n;
const RAMFS_MAGIC = 0x858458f6n;
const protectedName =
  /^(?:claude-|herdr-)|^systemd-private-|scratchpad|^(?:dbus-1|gnupg)$/iu;
const tempName = /^.+-[A-Za-z0-9]{6,}$/u;
const MAX_TREE_SCAN_ENTRIES = 1_048_576;
const MAX_TREE_SCAN_MS = 4000;

function mountedTmpfs(): Mount[] {
  const fixtureRoot = process.env["RECLAIM_TEST_TMPFS_ROOT"];
  if (fixtureRoot !== undefined) return [{ path: fixtureRoot, type: "tmpfs" }];
  if (process.platform !== "linux") return [];
  return awaitMountInfo() ?? [];
}

function awaitMountInfo(): Mount[] | null {
  // mountinfo paths escape whitespace and backslashes with octal sequences.
  const text = fromThrowable(() =>
    readFileSync("/proc/self/mountinfo", "utf8"),
  )();
  if (text.isErr()) return null;
  return text.value.split("\n").flatMap((line) => {
    const parts = line.split(" - ");
    if (parts.length !== 2 || !/^(tmpfs|ramfs) /u.test(parts[1] ?? ""))
      return [];
    const fields = parts[0]?.split(" ");
    const path = fields?.[4]?.replaceAll(/\\([0-7]{3})/gu, (_m, oct: string) =>
      String.fromCodePoint(Number.parseInt(oct, 8)),
    );
    return path === undefined ? [] : [{ path, type: "tmpfs" }];
  });
}

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

function inspectTree(path: string, options: PlanOptions, cutoff?: number) {
  const summary = {
    bytes: 0,
    inodes: 0,
    newestMtime: Number.NEGATIVE_INFINITY,
    owned: true,
    complete: false,
    graveyard: false,
  };
  const started = performance.now();
  const pending = [{ path, depth: 0 }];
  while (pending.length > 0) {
    checkScanDeadline(options.context);
    if (
      summary.inodes >= options.scanMaxEntries ||
      performance.now() - started >= options.scanMaxMs
    )
      return summary;
    const node = pending.pop();
    if (node === undefined || node.depth > 64) return summary;
    if (isGraveyardPath(node.path, options))
      return { ...summary, graveyard: true };
    const stat = lstatSync(node.path);
    summary.inodes += 1;
    summary.bytes += stat.blocks * 512;
    summary.newestMtime = Math.max(summary.newestMtime, stat.mtimeMs);
    if (stat.uid !== options.uid) return { ...summary, owned: false };
    if (cutoff !== undefined && summary.newestMtime > cutoff) return summary;
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    for (const name of readdirSync(node.path))
      pending.push({ path: join(node.path, name), depth: node.depth + 1 });
  }
  return { ...summary, complete: true };
}

function candidate(
  path: string,
  verdict: Candidate["verdict"],
  reason: string,
  bytes: number | null,
  action: Candidate["action"],
): Candidate {
  let check: boolean | null = null;
  if (verdict === "RECLAIM") check = true;
  if (verdict === "KEEP") check = false;
  return {
    id: path,
    path,
    verdict,
    reason,
    checks: [
      {
        name: "tmpfs safety",
        ok: check,
        detail: reason,
      },
    ],
    bytes,
    bytes_kind: "estimate",
    action,
    result: null,
  };
}

function usage(
  path: string,
  measure: (p: string) => Filesystem = (p) => statfsSync(p, { bigint: true }),
) {
  const fs = measure(path);
  const totalInodes = Number(fs.files);
  const freeInodes = Number(fs.ffree);
  const totalBytes = Number(fs.blocks * fs.bsize);
  const freeBytes = Number(fs.bfree * fs.bsize);
  return {
    inodes: totalInodes - freeInodes,
    totalInodes,
    bytes: totalBytes - freeBytes,
    totalBytes,
  };
}

function isDiskBacked(path: string): boolean {
  let current = resolve(path);
  while (true) {
    const exists = pathExists(current);
    if (exists.isErr()) return false;
    if (exists.value) break;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  const fs = fromThrowable(() => statfsSync(current, { bigint: true }))();
  return (
    fs.isOk() && fs.value.type !== TMPFS_MAGIC && fs.value.type !== RAMFS_MAGIC
  );
}

function pathExists(path: string) {
  return fromThrowable(() => existsSync(path))();
}

export function createTmpfsTarget(options: TmpfsOptions = {}) {
  const mounts = options.mounts ?? mountedTmpfs;
  const uid = options.uid ?? (() => process.getuid?.() ?? 0);
  const now = options.now ?? (() => Temporal.Now.instant().epochMilliseconds);
  const diskGraveyard =
    options.diskGraveyard ??
    (() =>
      join(
        process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local/share"),
        "graveyard",
      ));
  const ripGraveyard =
    options.ripGraveyard ??
    (() => process.env["RIP_GRAVEYARD"] ?? process.env["GRAVEYARD"]);
  const beforeUse = new Map<string, ReturnType<typeof usage>>();
  const stageOptions = new WeakMap<object, PlanOptions>();
  const stageTotals = { candidates: 0, entries: 0, bytes: 0 };
  // One process snapshot and one options record per stage (keyed by the stage's
  // liveness snapshot), shared by the plan and by every per-candidate recheck.
  const optionsFor = (ctx: Context): PlanOptions => {
    const key = ctx;
    const cached = stageOptions.get(key);
    if (cached !== undefined) return cached;
    const built = buildOptions(ctx);
    stageOptions.set(key, built);
    return built;
  };
  const buildOptions = (ctx: Context): PlanOptions => {
    const procRoot =
      process.env["RECLAIM_UNIT_PROC_ROOT"] ??
      process.env["RECLAIM_TEST_PROC_ROOT"];
    const procOptions = procRoot === undefined ? {} : { procRoot };
    const opened =
      options.isOpen === undefined
        ? (ctx.liveness?.openPaths("/") ??
          collectProcesses({
            uid: uid(),
            ...procOptions,
          }).openPaths("/"))
        : undefined;
    return {
      context: ctx,
      uid: uid(),
      now: now(),
      openPaths: opened?.open.map(({ path }) => resolve(path)).toSorted() ?? [],
      openPathSet: new Set(opened?.open.map(({ path }) => resolve(path)) ?? []),
      processStatusKnown: opened?.unknown.length === 0,
      ...(options.isOpen === undefined ? {} : { isOpen: options.isOpen }),
      ripGraveyard: ripGraveyard(),
      graveyardRoots: new Set<string>(),
      mountRoots: new Set<string>(),
      diskGraveyard: diskGraveyard(),
      isDiskPath: options.isDiskPath ?? isDiskBacked,
      scanMaxEntries: options.scanMaxEntries ?? MAX_TREE_SCAN_ENTRIES,
      scanMaxMs: options.scanMaxMs ?? MAX_TREE_SCAN_MS,
    };
  };
  return {
    name: "tmpfs",
    tier: "blind",
    fastFirst: true,
    available: () => ({ available: true, skip_reason: null }),
    plan: async (ctx) => {
      beforeUse.clear();
      const mountList = [
        ...new Map(
          mounts().map((mount) => [resolve(mount.path), mount]),
        ).values(),
      ];
      const planOptions = optionsFor(ctx);
      const roots = new Set(mountList.map((mount) => resolve(mount.path)));
      planOptions.mountRoots = roots;
      const refusal = await onlyAncestorRefusal(ctx.only, roots);
      if (refusal !== null) return [refusal];
      const rows = mountList.flatMap((mount) =>
        planMount(mount, roots, planOptions, beforeUse, options.statfs),
      );
      const declared = planOptions.ripGraveyard;
      if (
        declared !== undefined &&
        !rows.some((row) => row.path === declared) &&
        (ctx.only === undefined || within(declared, ctx.only)) &&
        mountList.some((mount) =>
          declared.startsWith(`${resolve(mount.path)}/`),
        )
      ) {
        const fs = fromThrowable(() =>
          (options.statfs ?? ((p: string) => statfsSync(p, { bigint: true })))(
            declared,
          ),
        )();
        if (fs.isOk() && [TMPFS_MAGIC, RAMFS_MAGIC].includes(fs.value.type)) {
          const row = planEntry(declared, basename(declared), planOptions);
          rows.push(...(row === null ? [] : [row]));
        }
      }
      return rows;
    },
    // One candidate against the stage's single process snapshot: no mount is measured.
    recheck: async (item: Candidate, ctx: Context) => {
      if (item.path === null) return null;
      const planOptions = optionsFor(ctx);
      const refusal = await onlyAncestorRefusal(
        ctx.only,
        planOptions.mountRoots,
      );
      return refusal ?? planEntry(item.path, basename(item.path), planOptions);
    },
    act: async (item: Candidate, ctx: Context) => {
      const path = item.path;
      if (item.verdict !== "RECLAIM" || path === null)
        return {
          ok: false,
          bytes_freed: null,
          error: "tmpfs candidate is not reclaimable",
        };
      if (isGraveyardPath(path, optionsFor(ctx)))
        return {
          ok: false,
          bytes_freed: null,
          error: "graveyard requires burial-aware expiry",
        };
      // The stage's mount is measured once in plan and once in finish, never per candidate.
      const removed = await removeTree(path, {
        uid: uid(),
        progress: false,
        measureFilesystem: false,
        graveyard: isGraveyardPath(path, optionsFor(ctx)),
        ...(ctx.liveness === undefined
          ? {}
          : { protection: { processes: ctx.liveness } }),
      });
      if (!removed.ok)
        return {
          ok: false,
          bytes_freed: null,
          error: `direct tmpfs removal failed: ${JSON.stringify([...removed.refused, ...removed.errors])}`,
        };
      stageTotals.candidates += 1;
      stageTotals.entries += removed.entries_removed;
      stageTotals.bytes += removed.bytes_freed;
      return { ok: true, bytes_freed: removed.bytes_freed, error: null };
    },
    // Once per stage: the before/after usage of each tmpfs mount and what was removed.
    finish: (ctx: Context) => {
      for (const [root, before] of beforeUse)
        logUsage(root, before, ctx.log, options.statfs);
      ctx.log(
        `[tmpfs] removed ${stageTotals.entries} files and directories (${stageTotals.bytes} bytes) from ${stageTotals.candidates} candidates`,
      );
      stageTotals.candidates = 0;
      stageTotals.entries = 0;
      stageTotals.bytes = 0;
    },
  } satisfies Target;
}

const isGraveyardPath = (path: string, options: PlanOptions) => {
  const name = basename(path);
  return (
    (options.ripGraveyard !== undefined &&
      (within(path, resolve(options.ripGraveyard)) ||
        within(resolve(options.ripGraveyard), path))) ||
    [...options.graveyardRoots].some((root) => within(path, root)) ||
    name === "graveyard" ||
    name.startsWith("graveyard-")
  );
};

function logUsage(
  root: string,
  before: ReturnType<typeof usage>,
  log: (message: string) => void,
  measure?: (path: string) => Filesystem,
): void {
  const result = fromThrowable(() => usage(root, measure))();
  if (result.isErr()) return;
  const after = result.value;
  log(
    `[tmpfs] ${root}: ${before.inodes}/${before.totalInodes} inodes and ${before.bytes}/${before.totalBytes} bytes before; ${after.inodes}/${after.totalInodes} inodes and ${after.bytes}/${after.totalBytes} bytes after`,
  );
}

type PlanOptions = {
  context: Context;
  uid: number;
  now: number;
  openPaths: string[];
  openPathSet: Set<string>;
  processStatusKnown: boolean;
  isOpen?: (path: string) => boolean | null;
  ripGraveyard: string | undefined;
  graveyardRoots: Set<string>;
  mountRoots: ReadonlySet<string>;
  diskGraveyard: string;
  isDiskPath: (path: string) => boolean;
  scanMaxEntries: number;
  scanMaxMs: number;
};

async function onlyAncestorRefusal(
  only: string | undefined,
  roots: ReadonlySet<string>,
): Promise<Candidate | null> {
  if (only === undefined) return null;
  const root = [...roots]
    .filter((entry) => within(only, entry))
    .toSorted((left, right) => right.length - left.length)[0];
  if (root === undefined) return null;
  for (
    let parent = dirname(only);
    parent !== root && within(parent, root);
    parent = dirname(parent)
  ) {
    const entry = parent;
    const stat = await fromAsyncThrowable(() => lstat(entry))();
    if (
      stat.isErr() ||
      stat.value.isSymbolicLink() ||
      protectedName.test(basename(parent))
    )
      return candidate(only, "KEEP", "protected or symlinked ancestor", null, {
        kind: "command",
        argv: [],
      });
  }
  return null;
}

function planEntry(
  path: string,
  name: string,
  options: PlanOptions,
): Candidate | null {
  checkScanDeadline(options.context);
  const stat = fromThrowable(() => lstatSync(path))();
  if (stat.isErr()) return null;
  const st = stat.value;
  if (protectedName.test(name))
    return candidate(
      path,
      "KEEP",
      "protected session or system directory",
      null,
      { kind: "command", argv: [] },
    );
  const protectedPaths = options.context.config.protected ?? [];
  const configuredProtection = protectedPaths.some((entry) => {
    const root = resolve(
      entry.replace(/^~(?=\/|$)/u, process.env["HOME"] ?? homedir()),
    );
    return (
      path === root ||
      path.startsWith(`${root}/`) ||
      root.startsWith(`${path}/`)
    );
  });
  if (configuredProtection)
    return candidate(path, "KEEP", "configured protected path", null, {
      kind: "command",
      argv: [],
    });
  const isGraveyard = isGraveyardPath(path, options);
  const isTempDirectory = st.isDirectory() && !st.isSymbolicLink();
  if (!isGraveyard && !isTempDirectory) return null;
  if (st.isSymbolicLink())
    return candidate(path, "KEEP", "graveyard symlink is not traversed", null, {
      kind: "command",
      argv: [],
    });
  if (isGraveyard)
    return candidate(
      path,
      "KEEP",
      "graveyard requires recorded burial and undo-window checks; use rip-expire",
      null,
      {
        kind: "command",
        argv: [],
      },
    );
  if (st.uid !== options.uid)
    return candidate(
      path,
      "KEEP",
      "owned by another user or ownership unreadable",
      null,
      { kind: "command", argv: [] },
    );
  let low = 0;
  let high = options.openPaths.length;
  const descendants = `${path}/`;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((options.openPaths[middle] ?? "") < descendants) low = middle + 1;
    else high = middle;
  }
  const openPath = options.openPaths[low];
  const isOpenPath =
    options.openPathSet.has(path) || openPath?.startsWith(descendants) === true;
  let open: boolean | null = false;
  if (options.isOpen !== undefined) open = options.isOpen(path);
  else if (isOpenPath) open = true;
  else if (!options.processStatusKnown) open = null;
  if (open !== false) {
    const verdict = open === true ? "KEEP" : "ASK";
    const reason =
      open === true ? "open by a process" : "process-use status unavailable";
    return candidate(path, verdict, reason, null, {
      kind: "command",
      argv: [],
    });
  }
  const cutoff = options.now - 60 * 60_000;
  if (!isGraveyard && st.mtimeMs > cutoff)
    return candidate(path, "KEEP", "younger than 60 minutes", null, {
      kind: "command",
      argv: [],
    });
  const measurement = fromThrowable(() =>
    inspectTree(path, options, isGraveyard ? undefined : cutoff),
  )().unwrapOr(null);
  if (measurement?.graveyard === true)
    return candidate(
      path,
      "KEEP",
      "contains a graveyard; use burial-aware expiry",
      null,
      {
        kind: "command",
        argv: [],
      },
    );
  if (measurement !== null && !measurement.owned)
    return candidate(
      path,
      "KEEP",
      "owned by another user or ownership unreadable",
      null,
      {
        kind: "command",
        argv: [],
      },
    );
  if (!isGraveyard && measurement !== null && measurement.newestMtime > cutoff)
    return candidate(path, "KEEP", "younger than 60 minutes", null, {
      kind: "command",
      argv: [],
    });
  if (measurement === null || !measurement.complete)
    return candidate(
      path,
      "ASK",
      "tree safety scan limit exceeded or unreadable",
      null,
      {
        kind: "command",
        argv: [],
      },
    );
  const reason = tempName.test(name)
    ? "stale mkdtemp-style directory; not open"
    : "stale fixed-name directory; not open";
  return candidate(path, "RECLAIM", reason, measurement.bytes, {
    kind: "delete",
    argv: [path],
  });
}

function planMount(
  mount: Mount,
  allMountRoots: Set<string>,
  options: PlanOptions,
  beforeUse: Map<string, ReturnType<typeof usage>>,
  measure: (p: string) => Filesystem = (p) => statfsSync(p, { bigint: true }),
): Candidate[] {
  const fs = fromThrowable(() => measure(mount.path))();
  if (
    fs.isErr() ||
    (fs.value.type !== TMPFS_MAGIC && fs.value.type !== RAMFS_MAGIC)
  )
    return [];
  const root = resolve(mount.path);
  const writable = fromThrowable(() => {
    accessSync(root, 2);
  })();
  if (writable.isErr()) return [];
  // Reuse the type probe's counters: a mount is measured once in each plan stage.
  const measured = fromThrowable(() => usage(root, () => fs.value))();
  if (measured.isErr()) return [];
  beforeUse.set(root, measured.value);
  const usageRow = candidate(
    root,
    "KEEP",
    `tmpfs use: ${measured.value.inodes}/${measured.value.totalInodes} inodes; ${measured.value.bytes}/${measured.value.totalBytes} bytes`,
    null,
    { kind: "command", argv: [] },
  );
  usageRow.id = `tmpfs-usage:${root}`;
  const names = fromThrowable(() => readdirSync(root).toSorted())();
  if (names.isErr()) return [usageRow];
  const only = options.context.only;
  const entries = names.value.flatMap((name) => {
    const path = join(root, name);
    if (allMountRoots.has(path)) return [];
    if (only !== undefined && !within(path, only) && !within(only, path))
      return [];
    // A subtree below this entry is judged as its own candidate.
    const target = only !== undefined && within(only, path) ? only : path;
    if (
      basename(path) === "graveyard" ||
      basename(path).startsWith("graveyard-")
    )
      options.graveyardRoots.add(path);
    const row = planEntry(target, basename(target), options);
    return row === null ? [] : [row];
  });
  return [usageRow, ...entries];
}

export const tmpfs = createTmpfsTarget();
