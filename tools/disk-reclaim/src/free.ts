// Consumer: owner shell and machine callers; one versioned JSON result, stderr progress.
import { lstat, readdir, realpath, statfs } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { match } from "ts-pattern";
import { z } from "../../shared/src/zod.ts";
import type { Holder } from "../../shared/src/dir-lock.ts";
import type { Config } from "./model.ts";
import { errorMessage, stateDir, waitForLock } from "./receipt.ts";
import { ripBurialTime, ripGraveyardRoot } from "./lib/graveyards.ts";
import type { OpenPaths } from "./lib/procs.ts";
import { removeTree, type RemoveTreeOptions } from "./lib/remove-tree.ts";
import { enumerateRipPayloads } from "./targets/rip-expire.ts";

export const FREE_LOCK_WAIT_S = 10;
export const FREE_BUDGET_MS = 120_000;
export const FREE_MAX_ENTRIES = 100_000;
const units = new Map([
  ["KiB", 1024],
  ["MiB", 1024 ** 2],
  ["GiB", 1024 ** 3],
  ["TiB", 1024 ** 4],
  ["KB", 1000],
  ["MB", 1000 ** 2],
  ["GB", 1000 ** 3],
  ["TB", 1000 ** 4],
]);
const size = z
  .string()
  .regex(
    /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/u,
  );
export function requestedBytes(input: string | undefined): number | null {
  const parsed = size.safeParse(input);
  if (!parsed.success) return null;
  const unit = parsed.data.match(/[A-Za-z]+$/u)?.[0];
  const bytes =
    Number(parsed.data.replace(/[A-Za-z]+$/u, "").trim()) *
    (units.get(unit ?? "") ?? NaN);
  return Number.isFinite(bytes) && bytes > 0 ? Math.ceil(bytes) : null;
}

type SkipReason =
  | "foreign_uid"
  | "unknown_burial"
  | "u_protected"
  | "protected"
  | "changed"
  | "unreadable"
  | "budget";
export type FreeResult = {
  schema: "reclaim.free/1";
  outcome: "met" | "partial" | "busy" | "invalid" | "failed";
  root: string;
  filesystem: { path: string; device: string; type: string } | null;
  requested_bytes: number | null;
  unlinked_bytes: number;
  unlinked_bytes_kind: string;
  free_delta_bytes: number | null;
  free_delta_note: string;
  overshoot_bytes: number;
  shortfall_bytes: number | null;
  u_protected_bytes: number;
  u_protected_bytes_complete: boolean;
  earliest_eligible_at: string | null;
  skip_counts: Record<SkipReason | "in_use", number>;
  lock_holder: Holder | null;
  lock_elapsed_ms: number;
  budget: {
    time_ms: number;
    entries: number;
    visited: number;
    exhausted: boolean;
  };
  deleted_payloads: string[];
  errors: string[];
};
export function freeResult(
  requested: number | null,
  root = ripGraveyardRoot(),
): FreeResult {
  return {
    schema: "reclaim.free/1",
    outcome: "invalid",
    root,
    filesystem: null,
    requested_bytes: requested,
    unlinked_bytes: 0,
    unlinked_bytes_kind: "logical size of entries actually unlinked",
    free_delta_bytes: null,
    free_delta_note:
      "statfs available-byte delta; possibly affected by other writers and open files; sparse files and hard links may release fewer blocks",
    overshoot_bytes: 0,
    shortfall_bytes: requested,
    u_protected_bytes: 0,
    u_protected_bytes_complete: true,
    earliest_eligible_at: null,
    skip_counts: {
      foreign_uid: 0,
      unknown_burial: 0,
      u_protected: 0,
      protected: 0,
      in_use: 0, // Reserved for reclaim.free/1 compatibility; graveyards ignore process use.
      changed: 0,
      unreadable: 0,
      budget: 0,
    },
    lock_holder: null,
    lock_elapsed_ms: 0,
    budget: {
      time_ms: FREE_BUDGET_MS,
      entries: FREE_MAX_ENTRIES,
      visited: 0,
      exhausted: false,
    },
    deleted_payloads: [],
    errors: [],
  };
}
export const freeExit = (result: FreeResult): number =>
  match(result.outcome)
    .with("met", () => 0)
    .with("invalid", () => 2)
    .with("busy", () => 3)
    .otherwise(() => 1);

type Options = {
  config: Config;
  env?: NodeJS.ProcessEnv;
  now?: number;
  state?: string;
  log?: (text: string) => void;
  lockWaitS?: number;
  budgetMs?: number;
  maxEntries?: number;
  processes?: () => { openPaths: (path: string) => OpenPaths };
  owner?: RemoveTreeOptions["owner"];
  immutable?: RemoveTreeOptions["immutable"];
};
type Payload = Awaited<
  ReturnType<typeof enumerateRipPayloads>
>["payloads"][number];
const identity = (stat: Awaited<ReturnType<typeof lstat>>): string =>
  `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.size}`;
const freeAt = async (path: string): Promise<number> => {
  const stat = await statfs(path);
  return stat.bavail * stat.bsize;
};

export async function freeGraveyard(
  input: string | undefined,
  options: Options,
): Promise<FreeResult> {
  const env = options.env ?? process.env;
  const root = ripGraveyardRoot(env);
  const requested = requestedBytes(input);
  const result = freeResult(requested, root);
  if (requested === null) {
    result.errors.push(
      "SIZE must be a positive finite number with KiB/MiB/GiB/TiB or KB/MB/GB/TB, yielding finite bytes",
    );
    return result;
  }
  result.outcome = "partial";
  const log =
    options.log ??
    ((text: string) => {
      process.stderr.write(`${text}\n`);
    });
  const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
  const undoMs =
    (options.config.graveyard_pressure_undo_minutes ?? 10) * 60_000;
  const budgetMs = options.budgetMs ?? FREE_BUDGET_MS;
  const maxEntries = options.maxEntries ?? FREE_MAX_ENTRIES;
  result.budget.time_ms = budgetMs;
  result.budget.entries = maxEntries;
  const deadline = performance.now() + budgetMs;
  const exhausted = new AbortController();
  const signal = AbortSignal.any([
    AbortSignal.timeout(budgetMs),
    exhausted.signal,
  ]);
  const allowVisit = (): boolean => {
    if (
      signal.aborted ||
      performance.now() >= deadline ||
      result.budget.visited >= maxEntries
    ) {
      result.budget.exhausted = true;
      exhausted.abort("disk:free request budget exhausted");
      return false;
    }
    result.budget.visited += 1;
    return true;
  };
  const check = () => {
    allowVisit();
    signal.throwIfAborted();
  };
  const skip = (reason: SkipReason, path: string, detail: string = reason) => {
    result.skip_counts[reason] += 1;
    log(`disk:free: skipped ${JSON.stringify(path)}: ${detail}`);
  };
  const measure = async (path: string): Promise<number> => {
    check();
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.size;
    let bytes = stat.size;
    for (const name of await readdir(path))
      bytes += await measure(join(path, name));
    return bytes;
  };
  const accountHeld = async (row: Payload): Promise<void> => {
    const path = row.candidate.path;
    if (path === null) return;
    if (row.hold === "unknown") skip("unknown_burial", path);
    if (row.hold !== "undo" || row.time === undefined) return;
    skip("u_protected", path);
    const eligible = Temporal.Instant.fromEpochMilliseconds(
      row.time + undoMs,
    ).toString();
    if (
      result.earliest_eligible_at === null ||
      Temporal.Instant.compare(eligible, result.earliest_eligible_at) < 0
    )
      result.earliest_eligible_at = eligible;
    const measured = await fromAsyncThrowable(() => measure(path))();
    if (measured.isOk()) {
      result.u_protected_bytes += measured.value;
      return;
    }
    result.u_protected_bytes_complete = false;
    signal.throwIfAborted();
    skip("unreadable", path, errorMessage(measured.error));
  };
  let filesystemPath = root;
  let before: number | undefined;
  const attempt = await fromAsyncThrowable(async () => {
    let location = await fromAsyncThrowable(() => lstat(filesystemPath))();
    const inspectLocation = () => lstat(filesystemPath);
    const rootExists = location.isOk();
    while (location.isErr() && dirname(filesystemPath) !== filesystemPath) {
      check();
      filesystemPath = dirname(filesystemPath);
      location = await fromAsyncThrowable(inspectLocation)();
    }
    if (location.isErr()) {
      result.outcome = "failed";
      result.errors.push(errorMessage(location.error));
      return;
    }
    const fs = await statfs(filesystemPath);
    result.filesystem = {
      path: filesystemPath,
      device: String(location.value.dev),
      type: `0x${fs.type.toString(16)}`,
    };
    before = await freeAt(filesystemPath);
    log(
      `disk:free: root ${JSON.stringify(root)}; filesystem ${JSON.stringify(result.filesystem)}`,
    );
    if (!rootExists) return;
    const initialRoot = location.value;
    if (!initialRoot.isDirectory() || initialRoot.isSymbolicLink()) {
      result.outcome = "failed";
      result.errors.push("graveyard root must be a real directory");
      return;
    }
    const canonicalRoot = await realpath(root);
    // Discovery completes before waiting: no candidates from later writers are added.
    const snapshot = await enumerateRipPayloads(
      root,
      undefined,
      now,
      0,
      undoMs,
      check,
    );
    const rows = snapshot.payloads.filter(
      (row) => row.candidate.path !== join(root, ".record"),
    );
    for (const row of rows) await accountHeld(row);
    const lock = await waitForLock(
      "free",
      options.state ?? stateDir(env),
      log,
      Math.min(options.lockWaitS ?? FREE_LOCK_WAIT_S, FREE_LOCK_WAIT_S),
    );
    if (lock.release === null) {
      result.outcome = "busy";
      result.lock_holder = lock.holder ?? null;
      result.lock_elapsed_ms = lock.elapsed_ms ?? 0;
      result.errors.push(lock.error ?? "reclaim lock unavailable");
      return;
    }
    using _lock = { [Symbol.dispose]: lock.release };
    const unchanged = async (row: Payload, path: string): Promise<boolean> => {
      check();
      const currentRoot = await lstat(root);
      const current = await lstat(path);
      const parent = await realpath(dirname(path));
      const same =
        currentRoot.dev === initialRoot.dev &&
        currentRoot.ino === initialRoot.ino &&
        current.dev === initialRoot.dev &&
        parent === join(canonicalRoot, relative(root, dirname(path))) &&
        identity(current) === row.identity;
      if (!same) {
        skip("changed", path);
        return false;
      }
      const burial = await ripBurialTime(root, path, undefined, check);
      if (burial === undefined) {
        skip("unknown_burial", path);
        return false;
      }
      if (now - burial < undoMs) {
        await accountHeld({ ...row, hold: "undo", time: burial });
        return false;
      }
      if (burial !== row.time) {
        skip("changed", path);
        return false;
      }
      return true;
    };
    const act = async (row: Payload): Promise<void> => {
      const path = row.candidate.path;
      if (row.hold !== undefined || path === null) return;
      if (!(await unchanged(row, path))) return;
      const current = await lstat(path);
      const owner = options.owner?.(path)?.uid ?? current.uid;
      if (owner !== (process.getuid?.() ?? 0)) {
        skip("foreign_uid", path);
        return;
      }
      // Share rip-expire's graveyard process rule and static protection in removeTree.
      const removed = await removeTree(path, {
        uid: process.getuid?.() ?? 0,
        graveyard: true,
        signal,
        bytesKind: "logical",
        measureFilesystem: false,
        progress: false,
        allowVisit,
        beforeUnlink: () => unchanged(row, path),
        ...(options.owner === undefined ? {} : { owner: options.owner }),
        ...(options.immutable === undefined
          ? {}
          : { immutable: options.immutable }),
        protection: {
          ownerTarget: "delete",
          processes: options.processes?.(),
          protectedPaths: options.config.protected ?? [],
        },
      });
      result.unlinked_bytes += removed.bytes_freed;
      if (removed.ok) result.deleted_payloads.push(row.candidate.id);
      const reasons = new Set<SkipReason>(
        removed.refused.map((refusal) =>
          refusal.reason === "entry is owned by another uid"
            ? "foreign_uid"
            : "protected",
        ),
      );
      for (const reason of reasons) skip(reason, path);
      result.errors.push(
        ...removed.errors.map((error) => `${error.path}: ${error.error}`),
      );
      log(
        `disk:free: ${JSON.stringify(path)}: ${removed.bytes_freed} logical bytes unlinked`,
      );
    };
    const tryAct = async (row: Payload): Promise<void> => {
      const acted = await fromAsyncThrowable(() => act(row))();
      if (acted.isOk()) return;
      signal.throwIfAborted();
      skip("unreadable", row.candidate.path ?? root, errorMessage(acted.error));
    };
    for (const row of rows) {
      if (result.unlinked_bytes >= requested) break;
      check();
      await tryAct(row);
    }
  })();
  if (attempt.isErr()) {
    result.u_protected_bytes_complete = false;
    if (!signal.aborted) {
      result.outcome = "failed";
      result.errors.push(errorMessage(attempt.error));
    }
  }
  if (signal.aborted || result.budget.exhausted) {
    result.budget.exhausted = true;
    result.skip_counts.budget += 1;
  }
  if (before !== undefined) {
    const after = await fromAsyncThrowable(() => freeAt(filesystemPath))();
    if (after.isOk()) result.free_delta_bytes = after.value - before;
    else {
      result.outcome = "failed";
      result.errors.push(errorMessage(after.error));
    }
  }
  result.overshoot_bytes = Math.max(0, result.unlinked_bytes - requested);
  result.shortfall_bytes = Math.max(0, requested - result.unlinked_bytes);
  if (
    result.outcome === "partial" &&
    result.errors.length === 0 &&
    result.unlinked_bytes >= requested
  )
    result.outcome = "met";
  log(
    `disk:free: ${result.outcome}; unlinked ${result.unlinked_bytes}; shortfall ${result.shortfall_bytes}; statfs delta ${result.free_delta_bytes ?? "unknown"}`,
  );
  return result;
}
