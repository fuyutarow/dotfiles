import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  statfsSync,
  type Stats,
} from "node:fs";
import { rmdir as removeDir, unlink as unlinkFile } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { userInfo } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { dlopen, FFIType, ptr, read } from "bun:ffi";
import { listWorkspaces, storeOf } from "../jj/discover.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { protectedReason } from "./protected.ts";
import { countEntries } from "./purge-progress.ts";
const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const pathDepth = (item: string): number => item.split(sep).length;

export type RemovalRefusal = {
  path: string;
  reason: string;
  owner_uid: number;
  owner_name: string;
  repair: string;
};
export type RemovalError = { path: string; error: string };
export type RemoveTreeResult = {
  ok: boolean;
  bytes_freed: number;
  statfs_bytes_freed: number;
  refused: RemovalRefusal[];
  errors: RemovalError[];
};
export type RemoveTreeOptions = {
  uid: number;
  owner?: (path: string) => { uid: number; name: string };
  immutable?: (path: string) => boolean | null;
  dryRun?: boolean;
  allowListedWorkspace?: string;
  protection?: {
    ownerTarget?: string | undefined;
    repoRoots?: string[] | undefined;
    protectedPaths?: string[] | undefined;
    home?: string | undefined;
    procDir?: string | undefined;
    ignoreUnreadableProcs?: readonly string[] | undefined;
  };
  progress?:
    | false
    | {
        entries: number;
        bytes: number;
        tty: boolean;
        write?: (line: string) => void;
        onProgress?: (entries: number, bytes: number, done: boolean) => void;
      };
};
type ContextProgress = (
  target: string,
  root: string,
  entries: number,
  bytes: number,
  done?: boolean,
  phase?: "scan" | "delete",
) => void;

function nameForUid(uid: number): string {
  return fromThrowable(() => userInfo())().match(
    (user) => (user.uid === uid ? user.username : String(uid)),
    () => String(uid),
  );
}

const estimatedBytes = (path: string): number => {
  const stat = fromThrowable(() => lstatSync(path))().unwrapOr(null);
  if (stat === null) return 0;
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.blocks * 512;
  return fromThrowable(() => readdirSync(path))()
    .unwrapOr([])
    .reduce(
      (sum, name) => sum + estimatedBytes(join(path, name)),
      stat.blocks * 512,
    );
};

export function removeTreeProgress(
  path: string,
  bytes: number | null,
  context?: {
    progress?: boolean | undefined;
    progressTty?: boolean | undefined;
    targetName?: string | undefined;
    reportProgress?: ContextProgress | undefined;
  },
):
  | false
  | {
      entries: number;
      bytes: number;
      tty: boolean;
      onProgress: (entries: number, bytes: number, done: boolean) => void;
    } {
  if (context?.progress === false) return false;
  return {
    entries: countEntries(path) + 1,
    bytes: bytes ?? estimatedBytes(path),
    tty: context?.progressTty === true,
    onProgress: (entries, currentBytes, done) =>
      context?.reportProgress?.(
        context.targetName ?? path,
        path,
        entries,
        currentBytes,
        done,
        "delete",
      ),
  };
}

/** Check one directory only; callers walk their target without following symlinks. */
export function directoryProtection(path: string): string | null {
  if (
    existsSync(join(path, ".jj", "repo", "store")) ||
    (existsSync(join(path, ".git")) &&
      lstatSync(join(path, ".git")).isDirectory())
  )
    return "repo store holder";
  const store = storeOf(path);
  if (store === null) return null;
  const result = listWorkspaces(store);
  if (result.listed === null)
    return `cannot inspect jj workspace store: ${result.error ?? "jj failed"}`;
  const root = resolve(path);
  const workspace = result.listed.find(
    (entry) => entry.root !== null && resolve(entry.root) === root,
  );
  if (workspace === undefined) return null;
  if (workspace.name === "default") return "default jj workspace is protected";
  return `listed jj workspace ${workspace.name}: run jj workspace forget first (or use the workspaces target)`;
}

const linuxLibc =
  process.platform === "linux"
    ? fromThrowable(() =>
        dlopen("libc.so.6", {
          ioctl: {
            args: [FFIType.i32, FFIType.u64, FFIType.ptr],
            returns: FFIType.i32,
          },
          __errno_location: { args: [], returns: FFIType.ptr },
        }),
      )()
    : null;

type LinuxFlagResult =
  | { kind: "flags"; value: number }
  | { kind: "unsupported" }
  | { kind: "unknown" };

function readLinuxFlags(fd: number): LinuxFlagResult {
  if (linuxLibc === null || linuxLibc.isErr()) return { kind: "unknown" };
  const flags = new Uint32Array(1);
  const request =
    0x80000000 + (process.arch.endsWith("64") ? 8 : 4) * 0x10000 + 0x6601;
  const status = linuxLibc.value.symbols.ioctl(fd, request, ptr(flags));
  if (status === 0) return { kind: "flags", value: flags[0] ?? 0 };
  const errnoPointer = linuxLibc.value.symbols.__errno_location();
  if (errnoPointer === null) return { kind: "unknown" };
  const errno = read.i32(errnoPointer);
  return errno === 25 || errno === 38
    ? { kind: "unsupported" }
    : { kind: "unknown" };
}

function linuxAttributesAt(path: string): boolean | null {
  if (linuxLibc === null || linuxLibc.isErr()) return null;
  const result = fromThrowable(() => {
    const fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    using _fd = {
      [Symbol.dispose]: () => {
        closeSync(fd);
      },
    };
    return readLinuxFlags(fd);
  })();
  if (result.isErr() || result.value.kind === "unknown") return null;
  if (result.value.kind === "unsupported") return false;
  return (result.value.value & 0x30) !== 0;
}

function attributesAt(path: string): boolean | null {
  if (process.platform === "linux") return linuxAttributesAt(path);
  if (process.platform === "darwin") {
    const output = fromThrowable(() =>
      execFileSync("/usr/bin/stat", ["-f", "%Sf", path], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    )();
    if (output.isErr()) return null;
    const flags = output.value.trim();
    if (flags === "-") return false;
    if (flags === "") return null;
    return /(?:^|,)(?:uchg|schg|uappnd|sappnd|sunlnk)(?:,|$)/u.test(flags);
  }
  const output = fromThrowable(() =>
    execFileSync("lsattr", ["-d", "--", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  )();
  if (output.isErr()) return null;
  const attributes = output.value.trim().split(/\s+/u)[0];
  if (
    attributes === undefined ||
    attributes.length === 0 ||
    attributes.includes("?")
  )
    return null;
  return attributes.includes("i") || attributes.includes("a");
}
const repairFor = (path: string, ownerName: string, reason: string): string => {
  if (
    reason === "immutable or append-only status is unknown" ||
    reason === "immutable or append-only attribute is set"
  )
    return `sudo chattr -R -i -a ${JSON.stringify(path)} && sudo rm -rf ${JSON.stringify(path)}`;
  return `sudo chown -R ${JSON.stringify(ownerName)} ${JSON.stringify(path)} && sudo rm -rf ${JSON.stringify(path)}`;
};

export async function removeTree(
  path: string,
  options: RemoveTreeOptions,
): Promise<RemoveTreeResult> {
  const refused: RemovalRefusal[] = [];
  const errors: RemovalError[] = [];
  let bytesFreed = 0;
  let entriesDone = 0;
  let lastProgress = 0;
  const pending: { path: string; stat: Stats }[] = [];
  const writeProgress = (final = false): void => {
    const progress = options.progress;
    if (options.dryRun === true || progress === undefined || progress === false)
      return;
    const now = Temporal.Now.instant().epochMilliseconds;
    const interval = progress.tty ? 250 : 2000;
    if (!final && now - lastProgress < interval) return;
    lastProgress = now;
    const percent =
      progress.bytes === 0
        ? 100
        : Math.min(100, Math.floor((bytesFreed / progress.bytes) * 100));
    const line = `[reclaim] ${path}: deleting ${bytesFreed}/${progress.bytes} bytes · ${entriesDone}/${progress.entries} entries · ${percent}%`;
    if (progress.onProgress !== undefined) {
      progress.onProgress(entriesDone, bytesFreed, final);
      return;
    }
    const writer =
      progress.write ?? ((value: string) => process.stderr.write(value));
    writer(
      `${progress.tty ? "\r" : ""}${line}${final || !progress.tty ? "\n" : ""}`,
    );
  };
  const rootResult = fromThrowable(() => lstatSync(path))();
  const rootStat = rootResult.match(
    (stat) => stat,
    (error) => {
      errors.push({ path, error: message(error) });
      return null;
    },
  );
  if (rootStat === null)
    return {
      ok: false,
      bytes_freed: 0,
      statfs_bytes_freed: 0,
      refused,
      errors,
    };
  writeProgress();
  const protectedPath = protectedReason(path, options.protection);
  if (protectedPath !== null)
    return {
      ok: false,
      bytes_freed: 0,
      statfs_bytes_freed: 0,
      refused: [
        {
          path,
          reason: `protected: ${protectedPath}`,
          owner_uid: rootStat.uid,
          owner_name: String(rootStat.uid),
          repair: "review the protected-path rule",
        },
      ],
      errors,
    };
  const device = rootStat.dev;
  const parent = dirname(path);
  const before = fromThrowable(() => statfsSync(parent))()
    .map((stat) => stat.bavail * stat.bsize)
    .unwrapOr(null);
  const getOwner =
    options.owner ??
    ((entry: string) => {
      const uid = lstatSync(entry).uid;
      return {
        uid,
        name: nameForUid(uid),
      };
    });
  const checkAttribute = options.immutable ?? attributesAt;
  const refuse = (
    entry: string,
    owner: { uid: number; name: string },
    reason: string,
  ) => {
    refused.push({
      path: entry,
      reason,
      owner_uid: owner.uid,
      owner_name: owner.name,
      repair: repairFor(entry, owner.name, reason),
    });
  };
  const ensureOwnerWritable = (entry: string, mode: number): string | null => {
    if (options.dryRun === true || (mode & 0o700) === 0o700) return null;
    return fromThrowable(() => {
      chmodSync(entry, mode | 0o700);
    })().match(
      () => null,
      (error) => `cannot add owner rwx: ${message(error)}`,
    );
  };
  const visit = (entry: string): boolean => {
    const statResult = fromThrowable(() => lstatSync(entry))();
    if (statResult.isErr()) {
      errors.push({ path: entry, error: message(statResult.error) });
      return false;
    }
    const stat = statResult.value;
    if (stat.dev !== device) {
      const owner = fromThrowable(() => getOwner(entry))().unwrapOr({
        uid: stat.uid,
        name: String(stat.uid),
      });
      refuse(entry, owner, "filesystem boundary (st_dev differs)");
      return false;
    }
    const ownerResult = fromThrowable(() => getOwner(entry))();
    if (ownerResult.isErr()) {
      errors.push({
        path: entry,
        error: `cannot determine owner: ${message(ownerResult.error)}`,
      });
      return false;
    }
    const owner = ownerResult.value;
    if (owner.uid !== options.uid) {
      refuse(entry, owner, "entry is owned by another uid");
      return false;
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      const permissionError = ensureOwnerWritable(entry, stat.mode);
      if (permissionError !== null) {
        errors.push({ path: entry, error: permissionError });
        return false;
      }
    }
    // Attribute probes that open a symlink can inspect its target. Symlink flags are not
    // mutable through the path-based Linux attribute interface, so unlink the link itself.
    const immutable = stat.isSymbolicLink()
      ? false
      : fromThrowable(() => checkAttribute(entry))().unwrapOr(null);
    if (immutable === null) {
      refuse(entry, owner, "immutable or append-only status is unknown");
      return false;
    }
    if (immutable) {
      refuse(entry, owner, "immutable or append-only attribute is set");
      return false;
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      const protection = fromThrowable(() =>
        directoryProtection(entry),
      )().match(
        (reason) => reason,
        (error) => `cannot inspect repo store: ${message(error)}`,
      );
      if (
        protection !== null &&
        !(
          entry === options.allowListedWorkspace &&
          protection.startsWith("listed jj workspace ")
        )
      ) {
        refuse(entry, owner, protection);
        return false;
      }
      const children = fromThrowable(() => readdirSync(entry))();
      if (children.isErr()) {
        errors.push({ path: entry, error: message(children.error) });
        return false;
      }
      let complete = true;
      for (const child of children.value) {
        complete = visit(join(entry, child)) && complete;
      }
      if (!complete) return false;
      if (options.dryRun === true) return true;
      pending.push({ path: entry, stat });
      return true;
    }
    if (options.dryRun === true) return true;
    pending.push({ path: entry, stat });
    return true;
  };
  visit(path);
  if (options.dryRun !== true && refused.length === 0 && errors.length === 0) {
    const files = pending.filter(({ stat }) => !stat.isDirectory());
    const directories = pending
      .filter(({ stat }) => stat.isDirectory())
      .toSorted((left, right) => right.path.length - left.path.length);
    const unlink = async (entries: typeof pending): Promise<void> => {
      let cursor = 0;
      const workers = Math.min(24, entries.length);
      await Promise.all(
        Array.from({ length: workers }, async () => {
          while (cursor < entries.length) {
            const entry = entries[cursor];
            cursor += 1;
            if (entry === undefined) continue;
            const removed = await fromAsyncThrowable(async () => {
              if (entry.stat.isDirectory()) await removeDir(entry.path);
              else await unlinkFile(entry.path);
            })();
            if (removed.isErr())
              errors.push({ path: entry.path, error: message(removed.error) });
            else {
              bytesFreed += entry.stat.blocks * 512;
              entriesDone += 1;
              writeProgress();
            }
          }
        }),
      );
    };
    await unlink(files);
    const maxDepth = directories.reduce(
      (maximum, { path: item }) => Math.max(maximum, pathDepth(item)),
      0,
    );
    for (let depth = maxDepth; depth >= 0; depth -= 1) {
      await unlink(
        directories.filter(({ path: item }) => pathDepth(item) === depth),
      );
    }
  }
  writeProgress(true);
  const after = fromThrowable(() => statfsSync(parent))()
    .map((stat) => stat.bavail * stat.bsize)
    .unwrapOr(null);
  return {
    ok: refused.length === 0 && errors.length === 0,
    bytes_freed: bytesFreed,
    statfs_bytes_freed:
      before === null || after === null ? 0 : Math.max(0, after - before),
    refused,
    errors,
  };
}
