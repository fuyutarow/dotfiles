import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, homedir, hostname } from "node:os";
import { resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { fromThrowable, z } from "@dotfiles/shared/src/zod.ts";
import { readHeadroom } from "./storage.ts";
import { protectedReason } from "./lib/protected.ts";
import {
  createLivenessSnapshot,
  type LivenessSnapshot,
} from "./liveness/facts.ts";
import {
  ActionResult,
  Candidate,
  Config,
  type ActionResult as ActionResultType,
  type Headroom,
  type Plan,
  type ReceiptAction,
  type ReceiptV2,
  type TargetPlan,
} from "./model.ts";
import {
  errorMessage,
  finalLine,
  freeBytes,
  hasForegroundWaiter,
  now,
  outputPath,
  stateDir,
  waitForLock,
  writeReceipt,
} from "./receipt.ts";
import type { Context, Target } from "./targets/index.ts";
import { defaultScanCacheDir, withScanSignal } from "./lib/scan-cache.ts";

const expand = (p: string) =>
  p
    .replace(/^~(?=\/|$)/u, homedir())
    .replaceAll("{uid}", String(process.getuid?.() ?? 0));

export function loadConfig(
  path = process.env["RECLAIM_CONFIG"] ??
    resolve(import.meta.dir, "../reclaim.toml"),
) {
  const raw = fromThrowable((): unknown =>
    Bun.TOML.parse(readFileSync(path, "utf8")),
  )();
  if (raw.isErr())
    return { config: null, error: `${path}: ${errorMessage(raw.error)}` };
  const ignoreEntries = regenerableIgnoreEntries(
    readFileSync(resolve(import.meta.dir, "../../..", ".gitignore"), "utf8"),
  );
  if (ignoreEntries === null)
    return {
      config: null,
      error: ".gitignore: missing or malformed regenerable-ignored block",
    };
  const declared = Config.omit({
    repo_roots: true,
    repos: true,
    scratch_roots: true,
    delete_roots: true,
    protected: true,
    regenerable_ignored: true,
  })
    .extend({
      repo_roots: Config.shape.regenerable_ignored,
      repos: Config.shape.regenerable_ignored,
      scratch_roots: Config.shape.regenerable_ignored,
      delete_roots: Config.shape.regenerable_ignored
        .optional()
        .default(["/tmp", "~/.cache"]),
      protected: z.array(z.string()).default([]),
    })
    .strict()
    .safeParse(raw.value);
  if (!declared.success)
    return { config: null, error: `${path}: ${declared.error.message}` };

  const config = Config.safeParse({
    ...declared.data,
    regenerable_ignored: ignoreEntries,
    repo_roots: declared.data.repo_roots.map(expand),
    repos: declared.data.repos.map(expand),
    scratch_roots: declared.data.scratch_roots.map(expand),
    delete_roots: declared.data.delete_roots.map(expand),
    protected: declared.data.protected.map(expand),
  });
  return config.success
    ? { config: config.data, error: null }
    : { config: null, error: `${path}: ${config.error.message}` };
}

/** The repository .gitignore block is the single source for disk-reclaim's cache names. */
export function regenerableIgnoreEntries(source: string): string[] | null {
  const lines = source.split(/\r?\n/u);
  const start = lines.indexOf("# BEGIN regenerable-ignored");
  const end = lines.indexOf("# END regenerable-ignored");
  if (start < 0 || end <= start) return null;
  const patterns = lines
    .slice(start + 1, end)
    .filter((line) => line.trim() !== "");
  if (patterns.some((pattern) => !/^\*\*\/[A-Za-z0-9._/-]+\/$/u.test(pattern)))
    return null;
  return patterns.map((pattern) => pattern.slice(3, -1));
}
export type EngineOptions = {
  context: Context;
  headroom?: Headroom;
  underPressure?: boolean;
  explicit?: string[];
  yes?: boolean;
  stopOnError?: boolean;
  state?: string;
  /** Fixture seam; production snapshots always read the real process table. */
  captureLiveness?: (config: Config) => LivenessSnapshot;
  env?: NodeJS.ProcessEnv;
  /** Timer injection for deterministic run-deadline tests. */
  scheduleDeadline?: (callback: () => void, ms: number) => () => void;
  deadlineCheck?: (phase: string) => void;
  cancellationSignal?: AbortSignal;
  measureFree?: () => number;
  onCompletedDeletion?: (path: string) => void;
};
// Cooperative deadline: bounds work between checks, not one blocking syscall.
const RUN_BUDGET_S = 1800;
class RunDeadline extends Error {
  constructor(readonly phase: string) {
    super(`deadline: ${phase}`);
  }
}
export type EngineResult = {
  exit: number;
  plan: Plan | null;
  error: string | null;
};
const totals = (candidates: Candidate[]): TargetPlan["totals"] => ({
  reclaim: candidates.filter((c) => c.verdict === "RECLAIM").length,
  ask: candidates.filter((c) => c.verdict === "ASK").length,
  keep: candidates.filter((c) => c.verdict === "KEEP").length,
});
const isAborted = (signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true;
const snapshotFor = (config: Config, context: Context): LivenessSnapshot =>
  createLivenessSnapshot(config, {
    procs: {
      ...(context.procDir === undefined ? {} : { procRoot: context.procDir }),
      diagnostics: (summary, details) => {
        if (context.reportProcessFailures !== undefined) {
          context.reportProcessFailures(summary, details);
          return;
        }
        context.log(summary);
        if (context.verbose === true)
          for (const detail of details) context.log(detail);
      },
    },
  });
function aggregate(
  targets: TargetPlan[],
  mode: "plan" | "run",
  measured: Headroom,
  receipt: string | null,
): Plan {
  const candidates = targets.flatMap((t) => t.candidates);
  const sum = (verdict: "RECLAIM" | "ASK") =>
    candidates
      .filter((c) => c.verdict === verdict)
      .reduce((n, c) => n + (c.bytes ?? 0), 0);
  const freed = candidates.filter((c) => c.result !== null);
  return {
    schema: "reclaim.plan/1",
    host: hostname(),
    generated_at: now(),
    mode,
    headroom: measured,
    targets,
    totals: {
      reclaim_bytes: sum("RECLAIM"),
      ask_bytes: sum("ASK"),
      freed_bytes:
        mode === "plan" || freed.some((c) => c.result?.bytes_freed === null)
          ? null
          : freed.reduce((n, c) => n + (c.result?.bytes_freed ?? 0), 0),
    },
    receipt,
  };
}
type OwnershipNode = {
  children: Map<string, OwnershipNode>;
  owners: { target: string; candidate: Candidate }[];
  subtree: Set<string>;
};
const ownershipNode = (): OwnershipNode => ({
  children: new Map(),
  owners: [],
  subtree: new Set(),
});
function insertOwnership(
  root: OwnershipNode,
  target: string,
  candidate: Candidate,
): void {
  if (candidate.path === null || candidate.verdict !== "RECLAIM") return;
  let current = root;
  current.subtree.add(target);
  for (const component of candidate.path.split("/")) {
    let child = current.children.get(component);
    if (child === undefined) {
      child = ownershipNode();
      current.children.set(component, child);
    }
    current = child;
    current.subtree.add(target);
  }
  current.owners.push({ target, candidate });
}
function markNodeOwners(
  current: OwnershipNode,
  ancestors: Set<string>,
  conflicts: Map<Candidate, Set<string>>,
): Set<string> {
  const overlapping = new Set([...ancestors, ...current.subtree]);
  for (const owner of current.owners) {
    if (overlapping.size > 1) conflicts.set(owner.candidate, overlapping);
  }
  const nextAncestors = new Set(ancestors);
  for (const owner of current.owners) nextAncestors.add(owner.target);
  return nextAncestors;
}
/** Path components bound comparison work by path length, rather than candidate pairs. */
function ownershipConflicts(
  targets: TargetPlan[],
): Map<Candidate, Set<string>> {
  const root = ownershipNode();
  for (const target of targets) {
    for (const candidate of target.candidates) {
      insertOwnership(root, target.name, candidate);
    }
  }
  const conflicts = new Map<Candidate, Set<string>>();
  const pending = [{ current: root, ancestors: new Set<string>() }];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) break;
    const { current, ancestors } = entry;
    const nextAncestors = markNodeOwners(current, ancestors, conflicts);
    for (const child of current.children.values()) {
      pending.push({ current: child, ancestors: nextAncestors });
    }
  }
  return conflicts;
}
function markOwnershipConflicts(targets: TargetPlan[]): void {
  for (const [candidate, names] of ownershipConflicts(targets)) {
    candidate.verdict = "ASK";
    candidate.reason = `ownership conflict: ${[...names].toSorted().join(", ")}`;
    candidate.action = { kind: "delete", argv: [] };
  }
  for (const target of targets) target.totals = totals(target.candidates);
}

async function planTarget(
  target: Target,
  ctx: Context,
  heartbeat: ReturnType<typeof setInterval>,
  present: boolean,
) {
  if (!present) {
    clearInterval(heartbeat);
    return null;
  }
  const planned = await fromAsyncThrowable(async () =>
    withScanSignal(ctx.signal, () => target.plan(ctx)),
  )();
  clearInterval(heartbeat);
  return planned;
}

export async function plan(
  targets: Target[],
  options: EngineOptions,
): Promise<EngineResult> {
  const headroom = options.headroom ?? readHeadroom();
  const remoteProbes: Context["remoteProbes"] = new Map();
  const liveness = (
    options.captureLiveness ??
    ((config) => snapshotFor(config, options.context))
  )(options.context.config);
  const rows: (TargetPlan | null)[] = Array.from(
    { length: targets.length },
    () => null,
  );
  const errors: (string | null)[] = Array.from(
    { length: targets.length },
    () => null,
  );
  const partialErrors = Array.from({ length: targets.length }, () => false);
  const failTarget = (index: number, target: Target, message: string): void => {
    const error = `${target.name}: ${message}`;
    errors[index] = error;
    rows[index] = {
      name: target.name,
      tier: target.tier,
      available: false,
      skip_reason: message,
      exit: 1,
      candidates: [],
      totals: totals([]),
    };
    options.context.reportProgress?.(target.name, target.name, 0, 0, true);
  };
  let cursor = 0;
  const scan = async (): Promise<void> => {
    while (cursor < targets.length) {
      if (options.context.signal?.aborted === true) return;
      const index = cursor;
      cursor += 1;
      const target = targets[index];
      if (target === undefined) continue;
      const started = performance.now();
      options.context.reportActivity?.(target.name, "scan started");
      const reportProgress = options.context.reportProgress;
      reportProgress?.(target.name, target.name, 0, 0);
      const scannedPaths = new Map<
        string,
        { entries: number; bytes: number }
      >();
      const ctx = {
        ...options.context,
        remoteProbes,
        scanCacheDir: options.context.scanCacheDir ?? defaultScanCacheDir(),
        targetName: target.name,
        reportPlanError: (message: string, partial = false) => {
          errors[index] = message;
          partialErrors[index] = partial;
        },
        reportProgress:
          reportProgress === undefined
            ? undefined
            : (
                unit: string,
                root: string,
                entries: number,
                bytes: number,
                done = false,
                phase: "scan" | "delete" = "scan",
                totalBytes?: number,
              ) => {
                if (phase !== "scan" || root === target.name) {
                  reportProgress(
                    unit,
                    root,
                    entries,
                    bytes,
                    done,
                    phase,
                    totalBytes,
                  );
                  return;
                }
                scannedPaths.set(root, { entries, bytes });
                const sum = [...scannedPaths.values()].reduce(
                  (all, path) => ({
                    entries: all.entries + path.entries,
                    bytes: all.bytes + path.bytes,
                  }),
                  { entries: 0, bytes: 0 },
                );
                reportProgress(
                  unit,
                  target.name,
                  sum.entries,
                  sum.bytes,
                  false,
                  phase,
                );
              },
        mode:
          options.yes === true && target.incremental === true ? "run" : "plan",
        headroom,
        underPressure: options.underPressure === true,
        liveness,
        explicit: options.explicit?.includes(target.name) === true,
      } satisfies Context;
      const available = await fromAsyncThrowable(async () =>
        target.available(ctx),
      )();
      if (available.isErr()) {
        failTarget(index, target, errorMessage(available.error));
        continue;
      }
      const { available: present, skip_reason } = available.value;
      const heartbeat = setInterval(
        () => {
          const sum = [...scannedPaths.values()].reduce(
            (all, path) => ({
              entries: all.entries + path.entries,
              bytes: all.bytes + path.bytes,
            }),
            { entries: 0, bytes: 0 },
          );
          reportProgress?.(target.name, target.name, sum.entries, sum.bytes);
        },
        options.context.progressTty === true ? 250 : 2000,
      );
      const planned = await planTarget(target, ctx, heartbeat, present);
      options.context.reportActivity?.(
        target.name,
        `scan finished in ${((performance.now() - started) / 1000).toFixed(3)}s${present ? "" : `; skipped: ${skip_reason ?? "unavailable"}`}`,
      );
      if (planned !== null && planned.isErr()) {
        failTarget(index, target, errorMessage(planned.error));
        continue;
      }
      const targetError = errors[index] ?? null;
      if (targetError !== null && partialErrors[index] !== true) {
        failTarget(index, target, targetError);
        continue;
      }
      const parsed = Candidate.array().safeParse(
        planned !== null && planned.isOk() ? planned.value : [],
      );
      if (!parsed.success) {
        failTarget(index, target, parsed.error.message);
        continue;
      }
      if (new Set(parsed.data.map((c) => c.id)).size !== parsed.data.length) {
        failTarget(index, target, "duplicate candidate id");
        continue;
      }
      if (targetError !== null) {
        rows[index] = {
          name: target.name,
          tier: target.tier,
          available: present,
          skip_reason: targetError,
          exit: 1,
          candidates: parsed.data,
          totals: totals(parsed.data),
        };
        reportProgress?.(
          target.name,
          target.name,
          parsed.data.length,
          parsed.data.reduce(
            (sum, candidate) => sum + (candidate.bytes ?? 0),
            0,
          ),
          true,
        );
        continue;
      }
      reportProgress?.(
        target.name,
        target.name,
        parsed.data.length,
        parsed.data.reduce((sum, candidate) => sum + (candidate.bytes ?? 0), 0),
      );
      rows[index] = {
        name: target.name,
        tier: target.tier,
        available: present,
        skip_reason,
        exit: null,
        candidates: parsed.data,
        totals: totals(parsed.data),
      };
      reportProgress?.(
        target.name,
        target.name,
        parsed.data.length,
        parsed.data.reduce((sum, candidate) => sum + (candidate.bytes ?? 0), 0),
        true,
      );
    }
  };
  const workers = Math.min(targets.length, cpus().length, 4);
  await Promise.all(Array.from({ length: workers }, () => scan()));
  if (options.context.signal?.aborted === true)
    return { exit: 0, plan: null, error: "cancelled" };
  const completeRows = rows.flatMap((row) => (row === null ? [] : [row]));
  if (completeRows.length !== targets.length)
    return { exit: 2, plan: null, error: "target scan did not complete" };
  markOwnershipConflicts(completeRows);
  return {
    exit: errors.some((item) => item !== null) ? 1 : 0,
    plan: aggregate(completeRows, "plan", headroom, null),
    error: null,
  };
}

async function recheckAndAct(
  target: Target,
  row: TargetPlan,
  index: number,
  ctx: Context,
  actions: ReceiptAction[],
  check: (phase: string) => void,
  onCompletedDeletion?: (path: string) => void,
): Promise<number> {
  check("candidate recheck");
  if (isAborted(ctx.signal)) return 0;
  const original = row.candidates[index];
  if (original === undefined || original.verdict !== "RECLAIM") return 0;
  // The target re-evaluates under the lock immediately before act, against the stage's
  // one liveness snapshot (ctx.liveness); a target with `recheck` judges only this
  // candidate instead of re-planning every candidate for each one.
  const freshContext = ctx;
  const fresh = await fromAsyncThrowable(async () => {
    if (target.recheck === undefined) return target.plan(freshContext);
    const one = await target.recheck(original, freshContext);
    return one === null ? [] : [one];
  })();
  check("candidate recheck");
  if (isAborted(ctx.signal)) return 0;
  const parsed = fresh.isOk() ? Candidate.array().safeParse(fresh.value) : null;
  if (parsed !== null && !parsed.success) {
    ctx.log(`${target.name}: invalid recheck: ${parsed.error.message}`);
    return 2;
  }
  const found =
    parsed !== null && parsed.success
      ? parsed.data.find(
          (c) => c.id === original.id && c.path === original.path,
        )
      : undefined;
  if (found === undefined) {
    row.candidates[index] = {
      ...original,
      verdict: "ASK",
      reason: fresh.isErr()
        ? errorMessage(fresh.error)
        : "candidate disappeared during recheck",
      result: null,
    };
    return 0;
  }
  row.candidates[index] = found;
  if (found.verdict !== "RECLAIM") return 0;
  if (found.path !== null) {
    const protection = protectedReason(found.path, {
      ownerTarget: target.name === "rip-expire" ? "delete" : target.name,
      procDir: freshContext.procDir,
      repoRoots: [
        ...freshContext.config.repo_roots,
        ...freshContext.config.repos,
      ],
      protectedPaths: freshContext.config.protected ?? [],
      ignoreUnreadableProcs: freshContext.config.ignore_unreadable_procs ?? [],
      processes:
        target.name === "rip-expire"
          ? { openPaths: () => ({ open: [], unknown: [] }) }
          : freshContext.liveness,
    });
    if (protection !== null) {
      found.verdict =
        protection === "process paths are unknown" ? "ASK" : "KEEP";
      found.reason = protection.startsWith("protected:")
        ? protection
        : `protected: ${protection}`;
      return 0;
    }
  }
  const action: ReceiptAction = {
    id: found.id,
    path: found.path,
    kind: found.action.kind,
    verdict_at_act: found.verdict,
    bytes_planned: found.bytes,
    bytes_freed: null,
    ok: false,
    error: "action has not completed",
    recovery: null,
  };
  actions.push(action);
  ctx.log(`${target.name}: ${found.id} ${found.action.kind}`);
  check("action");
  const acted = await fromAsyncThrowable(async () =>
    target.act(found, freshContext),
  )();
  const validated = acted.isOk() ? ActionResult.safeParse(acted.value) : null;
  let result: ActionResult = {
    ok: false,
    bytes_freed: null,
    error: "invalid action result",
  };
  if (validated !== null && validated.success) result = validated.data;
  if (acted.isErr()) result.error = errorMessage(acted.error);
  found.result = result;
  Object.assign(action, result);
  if (result.ok && found.path !== null && found.action.kind === "delete")
    onCompletedDeletion?.(found.path);
  check("action complete");
  return result.ok ? 0 : 1;
}

/** Re-plan one stdin-authorized path under the caller's host lock, then act once. */
export async function actPlannedPath(
  target: Target,
  path: string,
  context: Context,
  captureLiveness?: (config: Config) => LivenessSnapshot,
): Promise<ActionResultType> {
  const freshContext: Context = {
    ...context,
    mode: "run",
    explicit: true,
    targetName: target.name,
    liveness: (captureLiveness ?? ((config) => snapshotFor(config, context)))(
      context.config,
    ),
  };
  const availability = await fromAsyncThrowable(async () =>
    target.available(freshContext),
  )();
  if (availability.isErr())
    return {
      ok: false,
      bytes_freed: null,
      error: errorMessage(availability.error),
    };
  if (!availability.value.available)
    return {
      ok: false,
      bytes_freed: null,
      error: availability.value.skip_reason ?? "target unavailable",
    };
  const planned = await fromAsyncThrowable(async () =>
    target.plan(freshContext),
  )();
  if (planned.isErr())
    return { ok: false, bytes_freed: null, error: errorMessage(planned.error) };
  const candidates = Candidate.array().safeParse(planned.value);
  if (!candidates.success)
    return { ok: false, bytes_freed: null, error: candidates.error.message };
  const candidate = candidates.data.find(
    (item) => item.path === path && item.verdict === "RECLAIM",
  );
  if (candidate === undefined)
    return {
      ok: false,
      bytes_freed: null,
      error: "candidate is no longer safe after revalidation",
    };
  const protection = protectedReason(candidate.path ?? path, {
    ownerTarget: target.name,
    procDir: freshContext.procDir,
    repoRoots: [
      ...freshContext.config.repo_roots,
      ...freshContext.config.repos,
    ],
    protectedPaths: freshContext.config.protected ?? [],
    ignoreUnreadableProcs: freshContext.config.ignore_unreadable_procs ?? [],
  });
  if (protection !== null)
    return { ok: false, bytes_freed: null, error: protection };
  const acted = await fromAsyncThrowable(async () =>
    target.act(candidate, freshContext),
  )();
  if (acted.isErr())
    return { ok: false, bytes_freed: null, error: errorMessage(acted.error) };
  const result = ActionResult.safeParse(acted.value);
  return result.success
    ? result.data
    : { ok: false, bytes_freed: null, error: result.error.message };
}

async function executeCandidates(
  target: Target,
  row: TargetPlan,
  ctx: Context,
  actions: ReceiptAction[],
  options: EngineOptions,
): Promise<void> {
  // A fastFirst target acts on the cheapest candidate first: a small subtree frees space and
  // shows progress before a huge one starts. Unmeasured candidates (null bytes) go last.
  const indexes = [...row.candidates.keys()];
  const bytesAt = (index: number): number =>
    row.candidates[index]?.bytes ?? Number.POSITIVE_INFINITY;
  // Infinity - Infinity is NaN, which falls through to the stable index tie-break.
  const order =
    target.fastFirst === true
      ? indexes.toSorted((left, right) => {
          const difference = bytesAt(left) - bytesAt(right);
          if (Number.isNaN(difference) || difference === 0) return left - right;
          return difference;
        })
      : indexes;
  for (const index of order) {
    if (options.cancellationSignal?.aborted === true) break;
    if (ctx.foregroundLockYielded?.() === true) break;
    options.deadlineCheck?.("candidate recheck");
    const exit = await recheckAndAct(
      target,
      row,
      index,
      ctx,
      actions,
      options.deadlineCheck ?? (() => {}),
      options.onCompletedDeletion,
    );
    if (exit === 0) continue;
    row.exit = exit;
    if (exit === 2 || options.stopOnError === true || target.tier !== "blind")
      break;
  }
}

async function executeTarget(
  target: Target,
  row: TargetPlan,
  options: EngineOptions,
  dir: string,
  targetsRemaining: number,
): Promise<string> {
  const check = options.deadlineCheck ?? (() => {});
  const checkUnlessCancelled = (phase: string): void => {
    if (options.cancellationSignal?.aborted !== true) check(phase);
  };
  check("target plan");
  const headroom = options.headroom ?? readHeadroom();
  const started = now();
  const measureFree = options.measureFree ?? freeBytes;
  const before = measureFree();
  const output = outputPath(target.name, dir);
  writeFileSync(output, "", { mode: 0o600 });
  const actions: ReceiptAction[] = [];
  const receipt = (): ReceiptV2 => {
    const lockYield = ctx.foregroundLockYieldReceipt?.();
    return {
      schema: 2,
      name: target.name,
      target: target.name,
      tier: target.tier,
      command: [
        "disk-reclaim",
        "run",
        target.name,
        "--yes",
        ...(options.underPressure === true ? ["--under-pressure"] : []),
      ],
      host: hostname(),
      pid: process.pid,
      started,
      ended: now(),
      exit: row.exit ?? 0,
      free_before: before,
      free_after: measureFree(),
      output,
      actions,
      headroom,
      under_pressure: options.underPressure === true,
      ...(lockYield === undefined ? {} : { lock_yield: lockYield }),
    };
  };
  let currentPath = target.name;
  let currentBytes = 0;
  const ctx: Context = {
    ...options.context,
    reportProgress: (name, root, entries, bytes, done, phase, total) => {
      if (phase === "delete") {
        currentPath = root;
        currentBytes = done === true ? 0 : bytes;
      }
      options.context.reportProgress?.(
        name,
        root,
        entries,
        bytes,
        done,
        phase,
        total,
      );
    },
    mode: "run",
    targetName: target.name,
    headroom,
    underPressure: options.underPressure === true,
    procDir: options.context.procDir,
    progress: options.context.progress,
    progressTty: options.context.progressTty,
    explicit: options.explicit?.includes(target.name) === true,
    log: (message) => {
      options.context.log(message);
      appendFileSync(output, `${message}\n`);
    },
    recordRecovery: (candidate, recovery) => {
      const action = actions.find((a) => a.id === candidate.id);
      if (action !== undefined) action.recovery = recovery;
      // Durable pending receipt precedes a multi-step destructive operation.
      writeFileSync(`${output}.receipt.json`, JSON.stringify(receipt()), {
        mode: 0o600,
      });
    },
  };
  const progress = (): void => {
    if (ctx.progress === false) return;
    const freed = actions.reduce(
      (sum, action) => sum + (action.bytes_freed ?? 0),
      0,
    );
    ctx.log(
      `progress: ${freed + currentBytes} bytes freed; current target ${target.name}: ${currentPath}; ${targetsRemaining} targets remaining`,
    );
  };
  const heartbeat = setInterval(progress, 2000);
  using _heartbeat = {
    [Symbol.dispose]: () => {
      clearInterval(heartbeat);
    },
  };
  progress();
  const plannedFailure = row.exit === 1 ? row.skip_reason : null;
  row.exit = 0;
  ctx.reportProgress?.(target.name, target.name, 0, 0, false, "delete");
  const availability = await fromAsyncThrowable(async () =>
    target.available(ctx),
  )();
  check("target plan");
  if (availability.isErr() || !availability.value.available) {
    row.available = false;
    row.skip_reason = availability.isErr()
      ? errorMessage(availability.error)
      : availability.value.skip_reason;
    row.exit = ctx.explicit === true ? 4 : 0;
    ctx.log(`SKIP ${target.name}: ${row.skip_reason ?? "unavailable"}`);
  } else {
    row.available = true;
    row.skip_reason = plannedFailure;
    // Earlier targets may have removed delegated workspaces. Refresh this target's
    // candidates under the lock, then still recheck each RECLAIM immediately before act.
    // One liveness snapshot per stage: the under-lock plan and every candidate recheck share it.
    const stageCtx: Context = {
      ...ctx,
      liveness: (
        options.captureLiveness ?? ((config) => snapshotFor(config, ctx))
      )(ctx.config),
    };
    const fresh = await fromAsyncThrowable(async () => target.plan(stageCtx))();
    check("target plan");
    const parsed = fresh.isOk()
      ? Candidate.array().safeParse(fresh.value)
      : null;
    const parsedError =
      parsed !== null && !parsed.success ? parsed.error.message : null;
    if (fresh.isErr()) {
      row.candidates = row.candidates.map((c) => ({
        ...c,
        verdict: "ASK",
        reason: errorMessage(fresh.error),
        result: null,
      }));
    } else if (
      parsed === null ||
      !parsed.success ||
      new Set(parsed.data.map((c) => c.id)).size !== parsed.data.length
    ) {
      row.exit = 2;
      ctx.log(
        `${target.name}: invalid under-lock plan: ${parsedError ?? "duplicate candidate ids"}`,
      );
    } else {
      row.candidates = parsed.data;
      await executeCandidates(target, row, stageCtx, actions, options);
      checkUnlessCancelled("finish");
      await target.finish?.(stageCtx);
      checkUnlessCancelled("finish");
    }
  }
  if (plannedFailure !== null && row.exit === 0) row.exit = 1;
  row.totals = totals(row.candidates);
  const completed = receipt();
  const path = writeReceipt(completed, dir);
  finalLine(completed, path, ctx.log);
  if (completed.free_after < completed.free_before)
    ctx.log(
      `WARNING ${target.name} reduced free space by ${completed.free_before - completed.free_after} bytes`,
    );
  ctx.reportProgress?.(
    target.name,
    target.name,
    actions.length,
    actions.reduce((sum, action) => sum + (action.bytes_freed ?? 0), 0),
    true,
    "delete",
  );
  return path;
}

async function executeLocked(
  targets: Target[],
  options: EngineOptions,
  dir: string,
): Promise<EngineResult> {
  const check = options.deadlineCheck ?? (() => {});
  check("locked plan");
  const recheckedPreview = await plan(targets, options);
  check("locked plan");
  if (recheckedPreview.plan === null) return recheckedPreview;
  const lockedPlan = recheckedPreview.plan;
  if (
    lockedPlan.targets.some((target) =>
      target.candidates.some(
        (candidate) =>
          candidate.verdict === "ASK" &&
          candidate.reason.startsWith("ownership conflict:"),
      ),
    )
  )
    return { exit: 0, plan: lockedPlan, error: null };
  const remaining = ownershipConflicts(lockedPlan.targets).values().next();
  if (remaining.done !== true)
    return {
      exit: 2,
      plan: lockedPlan,
      error: `overlapping delete paths remain owned by ${[...remaining.value].join(" and ")}`,
    };
  let receipt: string | null = null;
  for (const [index, target] of targets.entries()) {
    if (options.cancellationSignal?.aborted === true) break;
    check("target plan");
    if (options.context.foregroundLockYielded?.() === true) break;
    const row = lockedPlan.targets[index];
    receipt = await executeTargetIfPresent(
      target,
      row,
      options,
      dir,
      receipt,
      targets.length - index - 1,
    );
  }
  const codes = new Set(lockedPlan.targets.map((t) => t.exit));
  let exit = 0;
  if (codes.has(4)) exit = 4;
  if (codes.has(2)) exit = 2;
  if (codes.has(1)) exit = 1;
  return {
    exit,
    plan: aggregate(
      lockedPlan.targets,
      "run",
      options.headroom ?? readHeadroom(),
      receipt,
    ),
    error: null,
  };
}

async function executeTargetIfPresent(
  target: Target,
  row: Plan["targets"][number] | undefined,
  options: EngineOptions,
  dir: string,
  previous: string | null,
  targetsRemaining: number,
): Promise<string | null> {
  if (row === undefined) return previous;
  if (row.exit === 1 && !row.available) return previous;
  return executeTarget(target, row, options, dir, targetsRemaining);
}

export async function run(
  targets: Target[],
  options: EngineOptions,
): Promise<EngineResult> {
  const rawBudget =
    (options.env ?? process.env)["RECLAIM_RUN_BUDGET_S"] ??
    String(RUN_BUDGET_S);
  const budget = Number(rawBudget);
  if (!/^\d+$/u.test(rawBudget) || !Number.isSafeInteger(budget) || budget <= 0)
    return {
      exit: 2,
      plan: null,
      error: "RECLAIM_RUN_BUDGET_S must be a positive integer",
    };
  if (
    options.yes !== true ||
    targets.some(
      (t) =>
        t.tier === "plan-only" ||
        t.tier === "interactive" ||
        (t.tier === "irreversible" &&
          options.explicit?.includes(t.name) !== true),
    )
  )
    return {
      exit: 2,
      plan: null,
      error:
        "run requires --yes; irreversible targets must be named; plan-only and interactive targets cannot run",
    };
  const runOptions = {
    ...options,
    headroom: options.headroom ?? readHeadroom(),
  };
  const preview = await plan(targets, runOptions);
  if (preview.plan === null) return preview;
  if (options.context.signal?.aborted === true) return preview;
  const dir = options.state ?? stateDir();
  options.context.reportActivity?.("lock", "waiting for reclaim lock");
  const lock = await waitForLock(
    targets.length === 0 ? "run" : targets.map((t) => t.name).join(","),
    dir,
    options.context.log,
  );
  options.context.reportProgress?.("lock", "lock", 0, 0, true);
  if (lock.release === null)
    return { exit: lock.exit, plan: preview.plan, error: lock.error };
  const releaseLock = lock.release;
  const controller = new AbortController();
  const schedule =
    options.scheduleDeadline ??
    ((callback, ms) => {
      let remaining = ms;
      let timer: ReturnType<typeof setTimeout>;
      const next = (): void => {
        const delay = Math.min(remaining, 2147483647);
        remaining -= delay;
        timer = setTimeout(remaining > 0 ? next : callback, delay);
      };
      next();
      return () => {
        clearTimeout(timer);
      };
    });
  const cancelDeadline = schedule(() => {
    controller.abort();
  }, budget * 1000);
  const signal =
    options.context.signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, options.context.signal]);
  const check = (phase: string): void => {
    if (controller.signal.aborted)
      AbortSignal.abort(new RunDeadline(phase)).throwIfAborted();
    if (signal.aborted && phase !== "action complete")
      AbortSignal.abort(new Error(`cancelled: ${phase}`)).throwIfAborted();
  };
  let yielded = false;
  let lockYield: { payloads_completed: number; reason: string } | undefined;
  const lockedOptions: EngineOptions = {
    ...runOptions,
    deadlineCheck: check,
    ...(options.context.signal === undefined
      ? {}
      : { cancellationSignal: options.context.signal }),
    context: {
      ...runOptions.context,
      signal,
      yieldForegroundLock: async (payloadsCompleted) => {
        if (yielded || !(await hasForegroundWaiter(dir))) return false;
        yielded = true;
        lockYield = {
          payloads_completed: payloadsCompleted,
          reason: "foreground capacity waiter",
        };
        releaseLock();
        return true;
      },
      foregroundLockYielded: () => yielded,
      foregroundLockYieldReceipt: () => lockYield,
    },
  };
  using _lock = { [Symbol.dispose]: lock.release };
  using _deadline = { [Symbol.dispose]: cancelDeadline };
  const execute = await fromAsyncThrowable(async () =>
    executeLocked(targets, lockedOptions, dir),
  )();
  if (execute.isOk()) return execute.value;
  if (execute.error instanceof RunDeadline) {
    const time = now();
    const free = (options.measureFree ?? freeBytes)();
    const receipt = {
      schema: 2 as const,
      name: "run",
      target: "run",
      tier: "blind" as const,
      command: ["disk-reclaim", "run"],
      host: hostname(),
      pid: process.pid,
      started: time,
      ended: time,
      exit: 1,
      free_before: free,
      free_after: free,
      output: null,
      actions: [],
      outcome: "deadline",
      phase: execute.error.phase,
    };
    const receiptPath = writeReceipt(receipt, dir);
    return {
      exit: 1,
      plan: { ...preview.plan, mode: "run", receipt: receiptPath },
      error: execute.error.message,
    };
  }
  return { exit: 2, plan: null, error: errorMessage(execute.error) };
}
