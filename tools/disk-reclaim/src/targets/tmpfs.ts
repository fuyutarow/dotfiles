import {
  accessSync,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statfsSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { inspectRipGraveyard } from "../lib/graveyards.ts";
import { collectProcesses } from "../lib/procs.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";

type Mount = { path: string; type: string };
type TmpfsOptions = {
  mounts?: () => Mount[];
  uid?: () => number;
  now?: () => number;
  isOpen?: (path: string) => boolean | null;
  ripGraveyard?: () => string | undefined;
  diskGraveyard?: () => string;
  isDiskPath?: (path: string) => boolean;
};

const TMPFS_MAGIC = 0x01021994n;
const RAMFS_MAGIC = 0x858458f6n;
const protectedName = /^(?:claude-|herdr-)|^systemd-private-|scratchpad/iu;
const tempName = /^.+-[A-Za-z0-9]{6,}$/u;

function mountedTmpfs(): Mount[] {
  const fixtureRoot = process.env.RECLAIM_TEST_TMPFS_ROOT;
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
    if (parts.length !== 2 || !(parts[1] ?? "").startsWith("tmpfs ")) return [];
    const fields = parts[0]?.split(" ");
    const path = fields?.[4]?.replaceAll(/\\([0-7]{3})/gu, (_m, oct: string) =>
      String.fromCodePoint(Number.parseInt(oct, 8)),
    );
    return path === undefined ? [] : [{ path, type: "tmpfs" }];
  });
}

function treeOwnedBy(path: string, owner: number): boolean {
  const stat = lstatSync(path);
  if (stat.uid !== owner) return false;
  if (stat.isDirectory() && !stat.isSymbolicLink())
    return readdirSync(path).every((name) =>
      treeOwnedBy(join(path, name), owner),
    );
  return true;
}

function allocatedBytes(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.blocks * 512;
  return readdirSync(path).reduce(
    (sum, name) => sum + allocatedBytes(join(path, name)),
    0,
  );
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

function usage(path: string) {
  const fs = statfsSync(path, { bigint: true });
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

function copyTree(source: string, destination: string): boolean {
  const statResult = fromThrowable(() => lstatSync(source))();
  if (statResult.isErr()) return false;
  const stat = statResult.value;
  if (stat.isSymbolicLink()) return false;
  if (stat.isDirectory()) {
    const mkdir = fromThrowable(() => {
      mkdirSync(destination, { mode: (stat.mode & 0o777) | 0o700 });
    })();
    if (mkdir.isErr()) return false;
    const names = fromThrowable(() => readdirSync(source))();
    const copied =
      names.isOk() &&
      names.value.every((name) =>
        copyTree(join(source, name), join(destination, name)),
      );
    if (!copied) return false;
    return fromThrowable(() => {
      chmodSync(destination, stat.mode & 0o777);
    })().isOk();
  }
  const parent = fromThrowable(() => {
    mkdirSync(dirname(destination), { recursive: true });
  })();
  if (parent.isErr()) return false;
  const copied = fromThrowable(() => {
    copyFileSync(source, destination);
  })();
  if (copied.isErr()) return false;
  return fromThrowable(() => {
    chmodSync(destination, stat.mode & 0o777);
  })().isOk();
}

function sameTree(source: string, destination: string): boolean {
  const pair = fromThrowable(() => ({
    left: lstatSync(source),
    right: lstatSync(destination),
  }))();
  if (pair.isErr()) return false;
  const { left, right } = pair.value;
  if (
    left.isDirectory() !== right.isDirectory() ||
    left.isSymbolicLink() ||
    right.isSymbolicLink()
  )
    return false;
  if (!left.isDirectory()) {
    const contents = fromThrowable(
      () => [readFileSync(source), readFileSync(destination)] as const,
    )();
    return contents.isOk() && contents.value[0].equals(contents.value[1]);
  }
  const sourceNames = fromThrowable(() => readdirSync(source).toSorted())();
  const destinationNames = fromThrowable(() =>
    readdirSync(destination).toSorted(),
  )();
  if (sourceNames.isErr() || destinationNames.isErr()) return false;
  return (
    sourceNames.value.join("\0") === destinationNames.value.join("\0") &&
    sourceNames.value.every((name) =>
      sameTree(join(source, name), join(destination, name)),
    )
  );
}

export function createTmpfsTarget(options: TmpfsOptions = {}) {
  const mounts = options.mounts ?? mountedTmpfs;
  const uid = options.uid ?? (() => process.getuid?.() ?? 0);
  const now = options.now ?? (() => Temporal.Now.instant().epochMilliseconds);
  const diskGraveyard =
    options.diskGraveyard ??
    (() =>
      join(
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
        "graveyard",
      ));
  const ripGraveyard =
    options.ripGraveyard ?? (() => process.env.RIP_GRAVEYARD);
  const beforeUse = new Map<string, ReturnType<typeof usage>>();
  return {
    name: "tmpfs",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: (ctx) => {
      const mountList = [
        ...new Map(
          mounts().map((mount) => [resolve(mount.path), mount]),
        ).values(),
      ];
      const procRoot =
        process.env.RECLAIM_UNIT_PROC_ROOT ??
        process.env.RECLAIM_TEST_PROC_ROOT;
      const procOptions = procRoot === undefined ? {} : { procRoot };
      const opened =
        options.isOpen === undefined
          ? (ctx.liveness?.openPaths("/") ??
            collectProcesses({
              uid: uid(),
              ...procOptions,
            }).openPaths("/"))
          : undefined;
      const planOptions: PlanOptions = {
        uid: uid(),
        now: now(),
        openPaths:
          opened?.open.map(({ path }) => resolve(path)).toSorted() ?? [],
        openPathSet: new Set(
          opened?.open.map(({ path }) => resolve(path)) ?? [],
        ),
        processStatusKnown: opened?.unknown.length === 0,
        ...(options.isOpen === undefined ? {} : { isOpen: options.isOpen }),
        ripGraveyard: ripGraveyard(),
        diskGraveyard: diskGraveyard(),
        isDiskPath: options.isDiskPath ?? isDiskBacked,
      };
      const roots = new Set(mountList.map((mount) => resolve(mount.path)));
      return mountList.flatMap((mount) =>
        planMount(mount, roots, planOptions, beforeUse),
      );
    },
    act: (item: Candidate, _ctx: Context) => {
      const path = item.path;
      if (item.verdict !== "RECLAIM" || path === null)
        return {
          ok: false,
          bytes_freed: null,
          error: "tmpfs candidate is not reclaimable",
        };
      if (item.action.argv[0] === "relocate-graveyard") {
        const destination = item.action.argv[1];
        if (destination === undefined)
          return {
            ok: false,
            bytes_freed: null,
            error: "graveyard destination is missing",
          };
        const existing = fromThrowable(() => existsSync(destination))();
        if (existing.isErr() || existing.value)
          return {
            ok: false,
            bytes_freed: null,
            error: "graveyard destination already exists or cannot be checked",
          };
        const diskPath = options.isDiskPath ?? isDiskBacked;
        if (!diskPath(destination))
          return {
            ok: false,
            bytes_freed: null,
            error: "graveyard destination is RAM-backed; tmpfs source retained",
          };
        const parent = fromThrowable(() =>
          mkdirSync(dirname(destination), { recursive: true }),
        )();
        if (parent.isErr())
          return {
            ok: false,
            bytes_freed: null,
            error: "cannot create disk graveyard parent",
          };
        if (!copyTree(path, destination) || !sameTree(path, destination))
          return {
            ok: false,
            bytes_freed: null,
            error: "graveyard copy verification failed; tmpfs source retained",
          };
      }
      const size = fromThrowable(() => allocatedBytes(path))();
      if (size.isErr())
        return {
          ok: false,
          bytes_freed: null,
          error: "cannot measure tmpfs candidate",
        };
      const removed = fromThrowable(() => {
        rmSync(path, { recursive: true, force: false });
      })();
      if (removed.isErr())
        return {
          ok: false,
          bytes_freed: null,
          error: "direct tmpfs removal failed",
        };
      for (const [root, before] of beforeUse) logUsage(root, before, _ctx.log);
      return { ok: true, bytes_freed: size.value, error: null };
    },
  } satisfies Target;
}

function logUsage(
  root: string,
  before: ReturnType<typeof usage>,
  log: (message: string) => void,
): void {
  const result = fromThrowable(() => usage(root))();
  if (result.isErr()) return;
  const after = result.value;
  log(
    `[tmpfs] ${root}: ${before.inodes}/${before.totalInodes} inodes and ${before.bytes}/${before.totalBytes} bytes before; ${after.inodes}/${after.totalInodes} inodes and ${after.bytes}/${after.totalBytes} bytes after`,
  );
}

type PlanOptions = {
  uid: number;
  now: number;
  openPaths: string[];
  openPathSet: Set<string>;
  processStatusKnown: boolean;
  isOpen?: (path: string) => boolean | null;
  ripGraveyard: string | undefined;
  diskGraveyard: string;
  isDiskPath: (path: string) => boolean;
};

function planEntry(
  path: string,
  name: string,
  options: PlanOptions,
): Candidate | null {
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
  const isGraveyard = path === options.ripGraveyard;
  const isTempDirectory =
    st.isDirectory() && !st.isSymbolicLink() && tempName.test(name);
  if (!isGraveyard && !isTempDirectory) return null;
  const owned = fromThrowable(() => treeOwnedBy(path, options.uid))();
  if (owned.isErr() || !owned.value)
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
  const graveyard = isGraveyard
    ? fromThrowable(() => inspectRipGraveyard(path))()
    : null;
  if (graveyard?.isOk() === true && graveyard.value.ramBacked) {
    const exists = pathExists(options.diskGraveyard);
    const onDisk = options.isDiskPath(options.diskGraveyard);
    const canMove = exists.isOk() && !exists.value && onDisk;
    let reason: string;
    if (canMove)
      reason = `relocate rip graveyard to ${options.diskGraveyard}; verify copy, then remove tmpfs copy`;
    else if (onDisk)
      reason = `destination exists or cannot be checked: ${options.diskGraveyard}`;
    else reason = `destination is RAM-backed: ${options.diskGraveyard}`;
    const verdict = canMove ? "RECLAIM" : "ASK";
    return candidate(
      path,
      verdict,
      reason,
      fromThrowable(() => allocatedBytes(path))().unwrapOr(null),
      { kind: "command", argv: ["relocate-graveyard", options.diskGraveyard] },
    );
  }
  if (!isTempDirectory) return null;
  const bytes = fromThrowable(() => allocatedBytes(path))().unwrapOr(null);
  if (options.now - st.mtimeMs < 60 * 60_000)
    return candidate(path, "KEEP", "younger than 60 minutes", bytes, {
      kind: "command",
      argv: [],
    });
  return candidate(
    path,
    "RECLAIM",
    "stale mkdtemp-style directory; not open",
    bytes,
    { kind: "delete", argv: [path] },
  );
}

function planMount(
  mount: Mount,
  allMountRoots: Set<string>,
  options: PlanOptions,
  beforeUse: Map<string, ReturnType<typeof usage>>,
): Candidate[] {
  const fs = fromThrowable(() => statfsSync(mount.path, { bigint: true }))();
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
  const measured = fromThrowable(() => usage(root))();
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
  const entries = names.value.flatMap((name) => {
    const path = join(root, name);
    if (allMountRoots.has(path)) return [];
    const row = planEntry(path, name, options);
    return row === null ? [] : [row];
  });
  return [usageRow, ...entries];
}

export const tmpfs = createTmpfsTarget();
