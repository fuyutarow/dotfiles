import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { fromThrowable, z } from "../../shared/src/zod.ts";
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
  now,
  outputPath,
  stateDir,
  waitForLock,
  writeReceipt,
} from "./receipt.ts";
import type { Context, Target } from "./targets/index.ts";

const expand = (p: string) =>
  p
    .replace(/^~(?=\/|$)/u, homedir())
    .replaceAll("{uid}", String(process.getuid?.() ?? 0));

export function loadConfig(
  path = process.env.RECLAIM_CONFIG ??
    resolve(import.meta.dir, "../reclaim.toml"),
) {
  const raw = fromThrowable((): unknown =>
    Bun.TOML.parse(readFileSync(path, "utf8")),
  )();
  if (raw.isErr())
    return { config: null, error: `${path}: ${errorMessage(raw.error)}` };
  const declared = Config.omit({
    repo_roots: true,
    repos: true,
    scratch_roots: true,
    delete_roots: true,
    protected: true,
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
export type EngineOptions = {
  context: Context;
  headroom?: Headroom;
  explicit?: string[];
  yes?: boolean;
  stopOnError?: boolean;
  state?: string;
  /** Fixture seam; production snapshots always read the real process table. */
  captureLiveness?: (config: Config) => LivenessSnapshot;
};
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
const snapshotFor = (config: Config, context: Context): LivenessSnapshot =>
  createLivenessSnapshot(
    config,
    context.procDir === undefined
      ? {}
      : { procs: { procRoot: context.procDir } },
  );
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
const pathsOverlap = (left: Candidate, right: Candidate): boolean => {
  if (left.path === null || right.path === null) return false;
  return (
    left.path === right.path ||
    left.path.startsWith(`${right.path}/`) ||
    right.path.startsWith(`${left.path}/`)
  );
};
function markOwnershipConflicts(targets: TargetPlan[]): void {
  const owned = targets.flatMap((target) =>
    target.candidates.flatMap((candidate) =>
      candidate.path !== null && candidate.verdict === "RECLAIM"
        ? [{ target: target.name, candidate }]
        : [],
    ),
  );
  const conflicts = new Map<Candidate, Set<string>>();
  const markConflict = (
    left: (typeof owned)[number],
    right: (typeof owned)[number],
  ): void => {
    for (const [owner, other] of [
      [left, right],
      [right, left],
    ] as const) {
      const names = conflicts.get(owner.candidate) ?? new Set<string>();
      names.add(owner.target);
      names.add(other.target);
      conflicts.set(owner.candidate, names);
    }
  };
  for (const [index, left] of owned.entries()) {
    const overlapping = owned
      .slice(index + 1)
      .filter(
        (right) =>
          left.target !== right.target &&
          pathsOverlap(left.candidate, right.candidate),
      );
    for (const right of overlapping) {
      markConflict(left, right);
    }
  }
  for (const [candidate, names] of conflicts) {
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
  const planned = await fromAsyncThrowable(async () => target.plan(ctx))();
  clearInterval(heartbeat);
  return planned;
}

export async function plan(
  targets: Target[],
  options: EngineOptions,
): Promise<EngineResult> {
  const rows: TargetPlan[] = [];
  const liveness = (
    options.captureLiveness ??
    ((config) => snapshotFor(config, options.context))
  )(options.context.config);
  for (const target of targets) {
    const reportProgress = options.context.reportProgress;
    reportProgress?.(target.name, target.name, 0, 0);
    const ctx = {
      ...options.context,
      mode: "plan",
      liveness,
      explicit: options.explicit?.includes(target.name) === true,
    } satisfies Context;
    const available = await fromAsyncThrowable(async () =>
      target.available(ctx),
    )();
    if (available.isErr())
      return {
        exit: 2,
        plan: null,
        error: `${target.name}: ${errorMessage(available.error)}`,
      };
    const { available: present, skip_reason } = available.value;
    const heartbeat = setInterval(
      () => reportProgress?.(target.name, target.name, 0, 0),
      options.context.progressTty === true ? 250 : 2000,
    );
    const planned = await planTarget(target, ctx, heartbeat, present);
    if (planned !== null && planned.isErr())
      return {
        exit: 2,
        plan: null,
        error: `${target.name}: ${errorMessage(planned.error)}`,
      };
    const parsed = Candidate.array().safeParse(
      planned !== null && planned.isOk() ? planned.value : [],
    );
    if (!parsed.success)
      return {
        exit: 2,
        plan: null,
        error: `${target.name}: ${parsed.error.message}`,
      };
    if (new Set(parsed.data.map((c) => c.id)).size !== parsed.data.length)
      return {
        exit: 2,
        plan: null,
        error: `${target.name}: duplicate candidate id`,
      };
    rows.push({
      name: target.name,
      tier: target.tier,
      available: present,
      skip_reason,
      exit: null,
      candidates: parsed.data,
      totals: totals(parsed.data),
    });
  }
  markOwnershipConflicts(rows);
  return {
    exit: 0,
    plan: aggregate(rows, "plan", options.headroom ?? readHeadroom(), null),
    error: null,
  };
}

async function recheckAndAct(
  target: Target,
  row: TargetPlan,
  index: number,
  ctx: Context,
  actions: ReceiptAction[],
  options: EngineOptions,
): Promise<number> {
  const original = row.candidates[index];
  if (original === undefined || original.verdict !== "RECLAIM") return 0;
  // The target re-evaluates in run mode under the lock immediately before act.
  const freshContext = {
    ...ctx,
    liveness: (
      options.captureLiveness ?? ((config) => snapshotFor(config, ctx))
    )(ctx.config),
  };
  const fresh = await fromAsyncThrowable(async () =>
    target.plan(freshContext),
  )();
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
      ownerTarget: target.name,
      procDir: freshContext.procDir,
      repoRoots: [
        ...freshContext.config.repo_roots,
        ...freshContext.config.repos,
      ],
      protectedPaths: freshContext.config.protected ?? [],
      ignoreUnreadableProcs: freshContext.config.ignore_unreadable_procs ?? [],
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
  return result.ok ? 0 : 1;
}

async function executeCandidates(
  target: Target,
  row: TargetPlan,
  ctx: Context,
  actions: ReceiptAction[],
  options: EngineOptions,
): Promise<void> {
  for (const index of row.candidates.keys()) {
    const exit = await recheckAndAct(target, row, index, ctx, actions, options);
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
): Promise<string> {
  const started = now();
  const before = freeBytes();
  const output = outputPath(target.name, dir);
  writeFileSync(output, "", { mode: 0o600 });
  const actions: ReceiptAction[] = [];
  const receipt = (): ReceiptV2 => ({
    schema: 2,
    name: target.name,
    target: target.name,
    tier: target.tier,
    command: ["disk-reclaim", "run", target.name, "--yes"],
    host: hostname(),
    pid: process.pid,
    started,
    ended: now(),
    exit: row.exit ?? 0,
    free_before: before,
    free_after: freeBytes(),
    output,
    actions,
  });
  const ctx: Context = {
    ...options.context,
    mode: "run",
    targetName: target.name,
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
  row.exit = 0;
  if (options.context.progress !== false)
    process.stderr.write(`disk-reclaim: ${target.name} started\n`);
  const availability = await fromAsyncThrowable(async () =>
    target.available(ctx),
  )();
  if (availability.isErr() || !availability.value.available) {
    row.available = false;
    row.skip_reason = availability.isErr()
      ? errorMessage(availability.error)
      : availability.value.skip_reason;
    row.exit = ctx.explicit === true ? 4 : 0;
    ctx.log(`SKIP ${target.name}: ${row.skip_reason ?? "unavailable"}`);
  } else {
    row.available = true;
    row.skip_reason = null;
    // Earlier targets may have removed delegated workspaces. Refresh this target's
    // candidates under the lock, then still recheck each RECLAIM immediately before act.
    const fresh = await fromAsyncThrowable(async () =>
      target.plan({
        ...ctx,
        liveness: (
          options.captureLiveness ?? ((config) => snapshotFor(config, ctx))
        )(ctx.config),
      }),
    )();
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
      await executeCandidates(target, row, ctx, actions, options);
    }
  }
  row.totals = totals(row.candidates);
  const completed = receipt();
  const path = writeReceipt(completed, dir);
  finalLine(completed, path);
  if (completed.free_after < completed.free_before)
    process.stderr.write(
      `disk-reclaim: WARNING ${target.name} reduced free space by ${completed.free_before - completed.free_after} bytes\n`,
    );
  return path;
}

async function executeLocked(
  targets: Target[],
  preview: Plan,
  options: EngineOptions,
  dir: string,
): Promise<EngineResult> {
  let receipt: string | null = null;
  for (const [index, target] of targets.entries()) {
    const row = preview.targets[index];
    receipt = await executeTargetIfPresent(target, row, options, dir, receipt);
  }
  const codes = new Set(preview.targets.map((t) => t.exit));
  let exit = 0;
  if (codes.has(4)) exit = 4;
  if (codes.has(2)) exit = 2;
  if (codes.has(1)) exit = 1;
  return {
    exit,
    plan: aggregate(
      preview.targets,
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
): Promise<string | null> {
  if (row === undefined) return previous;
  return executeTarget(target, row, options, dir);
}

export async function run(
  targets: Target[],
  options: EngineOptions,
): Promise<EngineResult> {
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
  const preview = await plan(targets, options);
  if (preview.plan === null) return preview;
  const dir = options.state ?? stateDir();
  const lock = await waitForLock(
    targets.length === 0 ? "run" : targets.map((t) => t.name).join(","),
    dir,
  );
  if (lock.release === null)
    return { exit: lock.exit, plan: preview.plan, error: lock.error };
  using _lock = { [Symbol.dispose]: lock.release };
  const value = preview.plan;
  const execute = await fromAsyncThrowable(async () =>
    executeLocked(targets, value, options, dir),
  )();
  return execute.isOk()
    ? execute.value
    : { exit: 2, plan: null, error: errorMessage(execute.error) };
}
