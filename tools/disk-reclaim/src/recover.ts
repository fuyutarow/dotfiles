import { lstat, mkdir, realpath, statfs, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { hostname } from "node:os";
import { fromAsyncThrowable } from "neverthrow";
import { enumerateRipPayloads } from "./targets/rip-expire.ts";
import {
  loadGraveyardAgePolicy,
  type GraveyardAgePolicy,
} from "./graveyard-age.ts";
import { ripBurialTime, ripGraveyardRoot } from "./lib/graveyards.ts";
import { removeTree, type RemoveTreeOptions } from "./lib/remove-tree.ts";
import type { Config } from "./model.ts";
import {
  errorMessage,
  registerForegroundWaiter,
  stateDir,
  waitForLock,
  writeReceiptAsync,
} from "./receipt.ts";
import { requestedBytes } from "./free.ts";

export const RECOVER_BUDGET_MS = 120_000;
export type RecoverResult = {
  schema: "reclaim.recover/1";
  outcome: "met" | "needs_more" | "busy" | "invalid" | "unknown" | "cancelled";
  root: string;
  filesystem: string | null;
  goal_bytes: number | null;
  available_before: number | null;
  available_after: number | null;
  unlinked_logical_bytes: number;
  allocated_estimate_bytes: number;
  shortfall_bytes: number | null;
  eligible_payloads: string[];
  eligible_at: { path: string; eligible_at: string }[];
  deleted_payloads: string[];
  errors: string[];
  receipt: string | null;
  output: string | null;
};
type Options = {
  config: Config;
  path?: string;
  env?: NodeJS.ProcessEnv;
  now?: number;
  state?: string;
  log?: (line: string) => void;
  lockWaitS?: number;
  withinMs?: number;
  clock?: () => number;
  statfs?: (
    path: string,
  ) =>
    | Promise<{ bavail: number; bsize: number; type?: number }>
    | { bavail: number; bsize: number; type?: number };
  policyPath?: string;
  owner?: RemoveTreeOptions["owner"];
  immutable?: RemoveTreeOptions["immutable"];
  signal?: AbortSignal;
  yes?: boolean;
};
type Payload = Awaited<
  ReturnType<typeof enumerateRipPayloads>
>["payloads"][number];
const identity = (stat: Awaited<ReturnType<typeof lstat>>): string =>
  `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.size}`;
const defaultStatfs = (path: string) => statfs(path);
async function unchanged(
  root: string,
  canonicalRoot: string,
  rootIdentity: string | null,
  row: Payload,
  path: string,
  now: number,
  undoMs: number,
): Promise<boolean> {
  if (rootIdentity === null) return false;
  const checked = await fromAsyncThrowable(async () => {
    const currentRoot = await lstat(root);
    const current = await lstat(path);
    const parent = await realpath(dirname(path));
    if (
      `${currentRoot.dev}:${currentRoot.ino}` !== rootIdentity ||
      identity(current) !== row.identity ||
      parent !== join(canonicalRoot, relative(root, dirname(path)))
    )
      return false;
    const burial = await ripBurialTime(root, path);
    return (
      burial !== undefined && burial === row.time && now - burial >= undoMs
    );
  })();
  // A lock holder may remove this snapshot row while recover waits for the lock.
  return checked.isOk() && checked.value;
}

type RecoveryContext = {
  input: string;
  options: Options;
  env: NodeJS.ProcessEnv;
  root: string;
  goal: number;
  result: RecoverResult;
  log: (line: string) => void;
  started: string;
  now: number;
  deadline: number;
  clock: () => number;
  fsStat: NonNullable<Options["statfs"]>;
  signal: AbortSignal;
};
type CandidateSnapshot = {
  rootStat: Awaited<ReturnType<typeof lstat>> | null;
  canonicalRoot: string;
  rows: Payload[];
  error: string | null;
};

async function saveReceipt(context: RecoveryContext): Promise<void> {
  const { result, options, env, root, input, started } = context;
  const dir = options.state ?? stateDir(env);
  await mkdir(join(dir, "runs"), { recursive: true, mode: 0o700 });
  const output = join(dir, "runs", `recover-${crypto.randomUUID()}.json`);
  result.output = output;
  result.receipt = output;
  if (result.available_before !== null) {
    const ended = Temporal.Now.instant().toString();
    result.receipt = await writeReceiptAsync(
      {
        schema: 2,
        target: "recover",
        tier: "owner",
        actions: [],
        name: "recover",
        command: [
          "recover",
          "--path",
          options.path ?? root,
          "--min-available",
          input,
        ],
        host: hostname(),
        pid: process.pid,
        started,
        ended,
        exit: recoverExit(result),
        free_before: result.available_before,
        free_after: result.available_after ?? result.available_before,
        output,
      },
      dir,
    );
  }
  await writeFile(
    output,
    `${JSON.stringify({ ...result, ended: Temporal.Now.instant().toString(), pid: process.pid, host: hostname() })}\n`,
    { mode: 0o600, flag: "wx" },
  );
}

async function locateFilesystem(
  path: string,
): Promise<{ path: string; stat: Awaited<ReturnType<typeof lstat>> } | null> {
  let candidate = path;
  while (true) {
    const inspectPath = candidate;
    const inspected = await fromAsyncThrowable(() => lstat(inspectPath))();
    if (inspected.isOk()) return { path: candidate, stat: inspected.value };
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

async function snapshotCandidates(
  context: RecoveryContext,
  agePolicy: GraveyardAgePolicy,
): Promise<CandidateSnapshot> {
  const { root, now, result } = context;
  const inspected = await fromAsyncThrowable(() => lstat(root))();
  if (inspected.isErr())
    return { rootStat: null, canonicalRoot: root, rows: [], error: null };
  const rootStat = inspected.value;
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    return {
      rootStat,
      canonicalRoot: root,
      rows: [],
      error: "graveyard root must be a real directory",
    };
  const canonicalRoot = await realpath(root);
  const minimumAgeMs = agePolicy.minimumAgeMinutes * 60_000;
  const undoMs = agePolicy.undoWindowMinutes * 60_000;
  const enumerated = await enumerateRipPayloads(
    root,
    undefined,
    now,
    agePolicy.minimumAgeMinutes / 60,
    undoMs,
  );
  const rows: Payload[] = [];
  for (const row of enumerated.payloads) {
    const path = row.candidate.path;
    if (path === null || path === join(root, ".record")) continue;
    if (row.time !== undefined && now - row.time < minimumAgeMs) {
      result.eligible_at.push({
        path,
        eligible_at: Temporal.Instant.fromEpochMilliseconds(
          row.time + minimumAgeMs,
        ).toString(),
      });
      continue;
    }
    if (row.hold === undefined) result.eligible_payloads.push(path);
    rows.push(row);
  }
  return { rootStat, canonicalRoot, rows, error: null };
}

async function removeEligible(
  context: RecoveryContext,
  filesystemPath: string,
  snapshot: CandidateSnapshot,
  undoMs: number,
): Promise<void> {
  const {
    options,
    root,
    goal,
    result,
    log,
    now,
    deadline,
    clock,
    fsStat,
    signal,
  } = context;
  const rootIdentity =
    snapshot.rootStat === null
      ? null
      : `${snapshot.rootStat.dev}:${snapshot.rootStat.ino}`;
  const beforeUnlink = (row: Payload, path: string) =>
    unchanged(
      root,
      snapshot.canonicalRoot,
      rootIdentity,
      row,
      path,
      now,
      undoMs,
    );
  using cleanup = new DisposableStack();
  const start = Temporal.Now.instant().epochMilliseconds;
  const heartbeat = setInterval(() => {
    log(
      `disk-reclaim recover: available ${result.available_after ?? result.available_before}; goal ${goal}; unlinked ${result.unlinked_logical_bytes}; elapsed ${Temporal.Now.instant().epochMilliseconds - start}ms`,
    );
  }, 5_000);
  cleanup.defer(() => {
    clearInterval(heartbeat);
  });
  for (const row of snapshot.rows) {
    if (signal.aborted || clock() >= deadline) break;
    const path = row.candidate.path;
    if (path === null || row.hold !== undefined) continue;
    const beforeMeasure = await fsStat(filesystemPath);
    result.available_after = beforeMeasure.bavail * beforeMeasure.bsize;
    if (result.available_after >= goal) break;
    if (!(await beforeUnlink(row, path))) continue;
    const allocatedEstimate = (await lstat(path)).blocks * 512;
    const removed = await removeTree(path, {
      uid: process.getuid?.() ?? 0,
      graveyard: true,
      signal,
      bytesKind: "logical",
      measureFilesystem: false,
      progress: false,
      beforeUnlink: () => beforeUnlink(row, path),
      ...(options.owner === undefined ? {} : { owner: options.owner }),
      ...(options.immutable === undefined
        ? {}
        : { immutable: options.immutable }),
    });
    result.unlinked_logical_bytes += removed.bytes_freed;
    result.allocated_estimate_bytes += allocatedEstimate;
    if (removed.ok) result.deleted_payloads.push(path);
    result.errors.push(
      ...removed.errors.map((error) => `${error.path}: ${error.error}`),
    );
    const afterMeasure = await fsStat(filesystemPath);
    result.available_after = afterMeasure.bavail * afterMeasure.bsize;
    log(
      `disk-reclaim recover: ${JSON.stringify(path)}; available ${result.available_after}; goal ${goal}; logical unlinked ${result.unlinked_logical_bytes}`,
    );
    if (result.available_after >= goal) break;
  }
}

async function executeRecovery(
  context: RecoveryContext,
): Promise<RecoverResult> {
  const { options, root, goal, result, log, deadline, clock, fsStat, signal } =
    context;
  const location = await locateFilesystem(options.path ?? root);
  if (location === null) {
    result.outcome = "unknown";
    result.errors.push("cannot locate a filesystem for the requested path");
    await saveReceipt(context);
    return result;
  }
  const filesystemPath = location.path;
  result.filesystem = filesystemPath;
  const before = await fsStat(filesystemPath);
  result.available_before = before.bavail * before.bsize;
  if (result.available_before >= goal) {
    result.outcome = "met";
    result.available_after = result.available_before;
    await saveReceipt(context);
    return result;
  }
  const graveyardLocation = await locateFilesystem(root);
  if (graveyardLocation === null) {
    result.outcome = "unknown";
    result.errors.push("cannot locate a filesystem for the graveyard");
    await saveReceipt(context);
    return result;
  }
  const agePolicy = await loadGraveyardAgePolicy(graveyardLocation.path, {
    availableBytes: async (path) => {
      const filesystem = await fsStat(path);
      return filesystem.bavail * filesystem.bsize;
    },
    ...(options.policyPath === undefined
      ? {}
      : { policyPath: options.policyPath }),
  });
  if (agePolicy.isErr()) {
    result.outcome = "unknown";
    result.errors.push(`graveyard age policy: ${String(agePolicy.error)}`);
    await saveReceipt(context);
    return result;
  }
  const resolvedAgePolicy = agePolicy.value;
  const removeWaiter =
    options.yes === true
      ? await registerForegroundWaiter(options.state ?? stateDir(context.env))
      : async () => {};
  await using _waiter = { [Symbol.asyncDispose]: removeWaiter };
  const snapshot = await snapshotCandidates(context, resolvedAgePolicy);
  if (snapshot.error !== null) {
    result.outcome = "unknown";
    result.errors.push(snapshot.error);
    await saveReceipt(context);
    return result;
  }
  if (options.yes !== true) {
    result.shortfall_bytes = goal - result.available_before;
    result.available_after = result.available_before;
    await saveReceipt(context);
    return result;
  }
  const remainingWaitS = (deadline - clock()) / 1000;
  const lockWaitS = Math.min(
    options.lockWaitS ?? remainingWaitS,
    remainingWaitS,
  );
  const lock = await waitForLock(
    "recover",
    options.state ?? stateDir(context.env),
    log,
    Math.max(0, lockWaitS),
  );
  if (lock.release === null) {
    result.outcome = "busy";
    result.errors.push(lock.error ?? "reclaim lock unavailable");
    await saveReceipt(context);
    return result;
  }
  using _lock = { [Symbol.dispose]: lock.release };
  await removeEligible(
    context,
    filesystemPath,
    snapshot,
    resolvedAgePolicy.undoWindowMinutes * 60_000,
  );
  if (signal.aborted) result.outcome = "cancelled";
  const after = await fsStat(filesystemPath);
  result.available_after = after.bavail * after.bsize;
  result.shortfall_bytes = Math.max(0, goal - result.available_after);
  if (!signal.aborted)
    result.outcome = result.available_after >= goal ? "met" : "needs_more";
  await saveReceipt(context);
  return result;
}

export async function recoverGraveyard(
  input: string | undefined,
  options: Options,
): Promise<RecoverResult> {
  const env = options.env ?? process.env;
  const root = ripGraveyardRoot(env);
  const goal = requestedBytes(input);
  const result: RecoverResult = {
    schema: "reclaim.recover/1",
    outcome: "invalid",
    root,
    filesystem: null,
    goal_bytes: goal,
    available_before: null,
    available_after: null,
    unlinked_logical_bytes: 0,
    allocated_estimate_bytes: 0,
    shortfall_bytes: goal,
    eligible_payloads: [],
    eligible_at: [],
    deleted_payloads: [],
    errors: [],
    receipt: null,
    output: null,
  };
  if (goal === null) {
    result.errors.push(
      "--min-available must be a positive finite size with KiB/MiB/GiB/TiB or KB/MB/GB/TB",
    );
    return result;
  }
  const clock = options.clock ?? (() => performance.now());
  const context: RecoveryContext = {
    input: input ?? "",
    options,
    env,
    root,
    goal,
    result: { ...result, outcome: "needs_more" },
    log: options.log ?? ((line: string) => process.stderr.write(`${line}\n`)),
    started: Temporal.Now.instant().toString(),
    now: options.now ?? Temporal.Now.instant().epochMilliseconds,
    deadline: clock() + (options.withinMs ?? RECOVER_BUDGET_MS),
    clock,
    fsStat: options.statfs ?? defaultStatfs,
    signal: options.signal ?? new AbortController().signal,
  };
  const operation = await fromAsyncThrowable(() => executeRecovery(context))();
  if (operation.isOk()) return operation.value;
  context.result.outcome = "unknown";
  context.result.errors.push(
    operation.error instanceof Error
      ? `${operation.error.name}: ${errorMessage(operation.error)}`
      : errorMessage(operation.error),
  );
  await fromAsyncThrowable(() => saveReceipt(context))();
  return context.result;
}

export function recoverExit(result: RecoverResult): number {
  if (result.outcome === "met") return 0;
  if (result.outcome === "invalid") return 2;
  if (result.outcome === "busy") return 3;
  if (result.outcome === "cancelled") return 130;
  if (result.outcome === "unknown") return 4;
  return 1;
}
