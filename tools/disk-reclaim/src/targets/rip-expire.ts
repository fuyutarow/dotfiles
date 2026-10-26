import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import {
  ripRecords,
  ripBurialTime,
  UNKNOWN_RIP_BURIAL,
  RIP_GRAVEYARD_MAX_BYTES,
  ripGraveyardRoot,
} from "../lib/graveyards.ts";
import { removeTree } from "../lib/remove-tree.ts";
import type { Candidate, Config } from "../model.ts";
import type { Context, Target } from "./index.ts";

export const RIP_EXPIRY_BUDGET_MS = 120_000;
const capacityReason = "oldest-first capacity expiry";
type Payload = {
  candidate: Candidate;
  time: number | undefined;
  hold: "undo" | "unknown" | undefined;
  selected: boolean;
  logical: number;
  pending: { path: string; counted: boolean }[];
  identity: string;
};
type Expiry = {
  root: string;
  payloads: Payload[];
  overhead: number;
  knownBytes: number;
  deadline: number;
  signal: AbortSignal;
  expired: number;
  freed: number;
  now: number;
  undoMs: number;
  ageMs: number;
  completedPayloads: number;
  yielded: boolean;
};
type Options = {
  config?: Pick<
    Config,
    | "graveyard_min_age_hours"
    | "graveyard_pressure_undo_minutes"
    | "scratch_roots"
  >;
  context?: Context;
  only?: string | undefined;
  now?: number;
};
const identity = (stat: Awaited<ReturnType<typeof lstat>>): string =>
  `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.size}`;
const inside = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
};

async function safeScope(
  root: string,
  only: string | undefined,
): Promise<boolean> {
  if (only === undefined || resolve(only) === root) return true;
  if (!inside(root, resolve(only))) return false;
  let parent = dirname(resolve(only));
  while (inside(root, parent)) {
    const path = parent;
    const inspected = await fromAsyncThrowable(() => lstat(path))();
    if (inspected.isErr() || inspected.value.isSymbolicLink()) return false;
    parent = dirname(parent);
  }
  return true;
}

async function expandContainer(path: string, pending: string[]): Promise<void> {
  for (const name of await readdir(path)) pending.push(join(path, name));
}

/** No payload recursion: split rip's mirrored parents using the restore record. */
export async function enumerateRipPayloads(
  root: string,
  only: string | undefined,
  now: number,
  ageHours: number,
  undoMs: number,
  check: () => void = () => {},
): Promise<Pick<Expiry, "payloads" | "overhead">> {
  if (!(await safeScope(root, only))) return { payloads: [], overhead: 0 };
  const rootStat = await fromAsyncThrowable(() => lstat(root))();
  if (
    rootStat.isErr() ||
    !rootStat.value.isDirectory() ||
    rootStat.value.isSymbolicLink()
  )
    return { payloads: [], overhead: 0 };
  const records = ripRecords(root);
  const containers = new Set<string>();
  const times = new Map<string, number>();
  for (const record of records) {
    check();
    const destination = resolve(record.destination);
    if (!inside(root, destination)) continue;
    times.set(destination, Math.max(times.get(destination) ?? 0, record.time));
    let parent = dirname(destination);
    while (inside(root, parent)) {
      containers.add(parent);
      times.set(parent, Math.max(times.get(parent) ?? 0, record.time));
      parent = dirname(parent);
    }
  }
  const payloads: Payload[] = [];
  let overhead = 0;
  const pending = [root];
  while (pending.length > 0) {
    check();
    const path = pending.pop();
    if (path === undefined) break;
    const stat = await lstat(path);
    const directory = stat.isDirectory() && !stat.isSymbolicLink();
    if (path === root && !directory) continue;
    if (path === root || (containers.has(path) && directory)) {
      overhead += stat.size;
      await expandContainer(path, pending);
      continue;
    }
    // Metadata is retained even when all payloads expire: rip may append to it.
    const metadata = path === join(root, ".record");
    const scoped =
      only === undefined ||
      resolve(only) === root ||
      path === resolve(only) ||
      inside(resolve(only), path);
    const time = times.get(path);
    const unknown = !metadata && time === undefined;
    const undo = time !== undefined && now - time < undoMs;
    const old = time !== undefined && now - time >= ageHours * 3_600_000;
    let reason = "expiry rechecked before deletion";
    if (metadata) reason = "required to restore kept graveyard entries";
    else if (unknown) reason = UNKNOWN_RIP_BURIAL;
    else if (undo) reason = "undo window: recorded burial is too recent";
    let hold: Payload["hold"];
    if (unknown) hold = "unknown";
    else if (undo) hold = "undo";
    const candidate = {
      id: `rip graveyard: ${relative(root, path)}`,
      path,
      verdict: metadata || !scoped || unknown || undo ? "KEEP" : "RECLAIM",
      reason,
      checks: [
        {
          name: "graveyard-entry",
          ok: true,
          detail: "top-level graveyard payload",
        },
      ],
      bytes: directory ? null : stat.size,
      bytes_kind: "estimate",
      action: { kind: "delete", argv: ["removeTree", path] },
      result: null,
    } satisfies Candidate;
    if (!metadata && scoped && old && !undo)
      candidate.reason = `older than ${ageHours}h`;
    payloads.push({
      candidate,
      selected: scoped,
      time,
      hold,
      logical: stat.size,
      pending: directory ? [{ path, counted: true }] : [],
      identity: identity(stat),
    });
  }
  payloads.sort((a, b) =>
    a.time === b.time
      ? (a.candidate.path ?? "").localeCompare(b.candidate.path ?? "")
      : (a.time ?? Infinity) - (b.time ?? Infinity),
  );
  return { payloads, overhead };
}

/** A work budget belongs to a stage, including measurement and deletion. */
export function createRipExpiryTarget(
  options: {
    budgetMs?: number;
    clock?: () => number;
    remove?: typeof removeTree;
  } = {},
) {
  const budgetMs = options.budgetMs ?? RIP_EXPIRY_BUDGET_MS;
  const clock = options.clock ?? (() => performance.now());
  const states = new WeakMap<Context, Expiry>();
  const expired = (state: Expiry): boolean =>
    state.signal.aborted || clock() >= state.deadline;
  const check = (state: Expiry): void => {
    state.signal.throwIfAborted();
    if (clock() >= state.deadline)
      AbortSignal.abort(
        "graveyard expiry work budget exhausted",
      ).throwIfAborted();
  };

  // Advance a lower-bound measurement. Capacity probes stop as soon as enough
  // bytes prove overflow; they never require a complete graveyard census.
  async function measure(
    row: Payload,
    state: Expiry,
    capacityProbe = false,
    until = state.deadline,
  ): Promise<void> {
    while (row.pending.length > 0) {
      check(state);
      if (clock() >= until) return;
      if (capacityProbe && state.knownBytes > RIP_GRAVEYARD_MAX_BYTES) return;
      const entry = row.pending.pop();
      if (entry === undefined) break;
      const stat = await lstat(entry.path);
      if (!entry.counted) {
        row.logical += stat.size;
        state.knownBytes += stat.size;
      }
      // Foreign contents are retained; an unreadable directory must still reach
      // the removal guard and be reported as a foreign-owner skip.
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== (process.getuid?.() ?? 0)
      )
        continue;
      for (const name of await readdir(entry.path))
        row.pending.push({ path: join(entry.path, name), counted: false });
    }
  }

  async function overLimit(state: Expiry): Promise<boolean> {
    if (state.knownBytes > RIP_GRAVEYARD_MAX_BYTES) return true;
    // Newest first finds retained bytes; expiry still acts strictly oldest first.
    for (const row of state.payloads.toReversed()) {
      await measure(row, state, true);
      if (state.knownBytes > RIP_GRAVEYARD_MAX_BYTES) return true;
    }
    return false;
  }

  async function judge(
    candidate: Candidate,
    state: Expiry,
  ): Promise<Candidate | null> {
    const row = state.payloads.find(
      (item) => item.candidate.id === candidate.id,
    );
    if (row === undefined || candidate.path === null) return null;
    if (candidate.verdict === "KEEP") return candidate;
    if (expired(state))
      return {
        ...candidate,
        verdict: "ASK",
        reason: "graveyard expiry work budget exhausted; next timer continues",
      };
    const judged = await fromAsyncThrowable(async () => {
      check(state);
      const root = state.root;
      let parent = dirname(candidate.path ?? root);
      while (inside(root, parent)) {
        if ((await lstat(parent)).isSymbolicLink()) return null;
        parent = dirname(parent);
      }
      const stat = await lstat(candidate.path ?? root);
      if (identity(stat) !== row.identity)
        return {
          ...candidate,
          verdict: "ASK" as const,
          reason: "graveyard payload changed; retry next timer",
        };
      const burial = await ripBurialTime(root, candidate.path ?? root);
      if (burial === undefined || state.now - burial < state.undoMs) {
        row.hold = burial === undefined ? "unknown" : "undo";
        return {
          ...candidate,
          verdict: "KEEP" as const,
          reason:
            burial === undefined
              ? UNKNOWN_RIP_BURIAL
              : "undo window: recorded burial is too recent",
        };
      }
      const old = state.now - burial >= state.ageMs;
      if (!old && !(await overLimit(state)))
        return {
          ...candidate,
          verdict: "KEEP" as const,
          reason: "graveyard is within its size limit",
        };
      // Measure this payload immediately before its action, leaving most of the
      // budget for deletion. A huge payload may have only a lower-bound estimate:
      // Age-expired trees get only 250ms: age already authorizes removal.
      // The age or overflow witness authorizes expiry independently
      // of that estimate. Removal reports the bytes actually unlinked.
      state.knownBytes += stat.size - row.logical;
      row.logical = stat.size;
      row.pending =
        stat.isDirectory() && !stat.isSymbolicLink()
          ? [{ path: candidate.path ?? root, counted: true }]
          : [];
      await measure(
        row,
        state,
        false,
        Math.min(state.deadline, clock() + (old ? 250 : 10_000)),
      );
      check(state);
      return {
        ...candidate,
        verdict: "RECLAIM" as const,
        bytes: row.logical,
        reason: old
          ? `older than ${state.ageMs / 3_600_000}h`
          : `graveyard exceeds ${RIP_GRAVEYARD_MAX_BYTES} bytes; ${capacityReason}`,
      };
    })();
    return judged.isOk()
      ? judged.value
      : { ...candidate, verdict: "ASK", reason: String(judged.error) };
  }

  async function candidates(
    env = process.env,
    home = homedir(),
    settings: Options = {},
  ): Promise<Candidate[]> {
    const ctx = settings.context;
    // Urgent runs should drain at unlink throughput rather than repeat timer slices.
    // Explicit test/caller budgets remain authoritative; timer defaults stay bounded.
    const pressure =
      ctx?.underPressure === true ||
      ctx?.headroom?.drives.some((drive) => drive.state !== "ok") === true;
    const stageBudgetMs =
      options.budgetMs === undefined && pressure ? budgetMs * 15 : budgetMs;
    const timeout = AbortSignal.timeout(stageBudgetMs);
    const signal =
      ctx?.signal === undefined
        ? timeout
        : AbortSignal.any([timeout, ctx.signal]);
    const deadline = clock() + stageBudgetMs;
    const root = ripGraveyardRoot(env, home);
    const now = settings.now ?? Temporal.Now.instant().epochMilliseconds;
    const undoMs =
      (settings.config?.graveyard_pressure_undo_minutes ?? 10) * 60_000;
    const enumerated = await enumerateRipPayloads(
      root,
      settings.only,
      now,
      settings.config?.graveyard_min_age_hours ?? 24,
      undoMs,
    );
    const state: Expiry = {
      ...enumerated,
      knownBytes:
        enumerated.overhead +
        enumerated.payloads.reduce((sum, row) => sum + row.logical, 0),
      root,
      signal,
      deadline,
      expired: 0,
      freed: 0,
      now,
      undoMs,
      ageMs: (settings.config?.graveyard_min_age_hours ?? 24) * 3_600_000,
      completedPayloads: 0,
      yielded: false,
    };
    if (ctx !== undefined) states.set(ctx, state);
    if (ctx?.mode === "run")
      return state.payloads
        .filter((row) => row.selected)
        .map((row) => row.candidate);
    const rows: Candidate[] = [];
    for (const row of state.payloads) {
      if (!row.selected) continue;
      const fresh = await judge(row.candidate, state);
      if (fresh === null) continue;
      rows.push(fresh);
      if (fresh.verdict === "RECLAIM") {
        state.knownBytes -= row.logical;
        state.payloads = state.payloads.filter((item) => item !== row);
      }
      if (state.yielded) break;
    }
    await fromAsyncThrowable(() => overLimit(state))();
    const shortfall = capacityShortfall(state);
    if (shortfall !== null)
      rows.push({
        id: "rip graveyard capacity shortfall",
        path: root,
        verdict: "KEEP",
        reason: shortfall,
        checks: [],
        bytes: null,
        bytes_kind: "estimate",
        action: { kind: "command", argv: [] },
        result: null,
      });
    return rows;
  }

  const target = {
    name: "rip-expire",
    tier: "blind",
    incremental: true,
    fastFirst: false,
    description: {
      what: "expired rip graveyard entries",
      why: "age expiry and oldest-first capacity expiry within a work budget",
    },
    available: () => ({ available: true, skip_reason: null }),
    plan: (ctx: Context) =>
      candidates(process.env, homedir(), {
        context: ctx,
        config: ctx.config,
        ...(ctx.only === undefined ? {} : { only: ctx.only }),
      }),
    recheck: async (candidate: Candidate, ctx: Context) => {
      const state = states.get(ctx);
      return state === undefined ? null : judge(candidate, state);
    },
    act: async (candidate: Candidate, ctx: Context) => {
      const state = states.get(ctx);
      if (candidate.path === null)
        return { ok: false, bytes_freed: 0, error: "missing graveyard path" };
      if (state === undefined)
        return {
          ok: false,
          bytes_freed: 0,
          error: "missing graveyard expiry state; plan before acting",
        };
      if (candidate.verdict !== "RECLAIM")
        return {
          ok: false,
          bytes_freed: 0,
          error: "graveyard candidate is not reclaimable",
        };
      const burial = await ripBurialTime(state.root, candidate.path);
      if (burial === undefined || state.now - burial < state.undoMs)
        return {
          ok: false,
          bytes_freed: 0,
          error:
            burial === undefined
              ? UNKNOWN_RIP_BURIAL
              : "undo window: recorded burial is too recent",
        };
      const result = await (options.remove ?? removeTree)(candidate.path, {
        uid: process.getuid?.() ?? 0,
        graveyard: true,
        incrementalGraveyard: true,
        ...(state === undefined ? {} : { signal: state.signal }),
        progress: {
          entries: 0,
          bytes: candidate.bytes ?? 0,
          tty: ctx.progressTty === true,
          onProgress: (entries, bytes, done) =>
            ctx.reportProgress?.(
              "rip-expire",
              candidate.path ?? state.root,
              entries,
              bytes,
              done,
              "delete",
              candidate.bytes ?? undefined,
            ),
        },
        protection: {
          ownerTarget: "delete",
          processes: { openPaths: () => ({ open: [], unknown: [] }) },
          protectedPaths: ctx.config.protected ?? [],
        },
      });
      const skipped = result.refused
        .filter((row) => row.reason === "entry is owned by another uid")
        .map((row) => ({
          path: row.path,
          reason: "foreign-owner" as const,
          owner_uid: row.owner_uid,
        }));
      const failures = [
        ...result.errors.map((row) => row.error),
        ...result.refused
          .filter((row) => row.reason !== "entry is owned by another uid")
          .map((row) => row.reason),
      ];
      for (const row of skipped)
        ctx.log(`${row.path}: skipped: foreign-owner uid=${row.owner_uid}`);
      ctx.log(
        `${candidate.id}: ${result.ok ? 1 : 0} payload expired; ${result.entries_removed} entries removed (${result.entries_removed} files and directories, ${result.bytes_freed} bytes)`,
      );
      if (state !== undefined) {
        state.freed += result.bytes_freed;
        const payload = state.payloads.find(
          (row) => row.candidate.id === candidate.id,
        );
        if (payload !== undefined) {
          state.knownBytes -= payload.logical;
          // A refused or cancelled payload can have lost some children already.
          // Discard its old witness so later capacity checks cannot over-delete.
          payload.logical = 0;
          payload.pending = [{ path: candidate.path, counted: false }];
        }
        if (result.ok) {
          state.expired += 1;
          state.payloads = state.payloads.filter(
            (row) => row.candidate.id !== candidate.id,
          );
        }
        state.completedPayloads += 1;
        if (
          (await ctx.yieldForegroundLock?.(state.completedPayloads)) === true
        ) {
          state.yielded = true;
          ctx.log(
            `graveyard expiry yielded after ${state.completedPayloads} payload actions for a foreground disk:free waiter`,
          );
        }
      }
      return {
        ok: result.ok || (skipped.length > 0 && failures.length === 0),
        bytes_freed: result.bytes_freed,
        error: failures.length === 0 ? null : failures.join("; "),
        ...(skipped.length === 0 ? {} : { skipped }),
      };
    },
    finish: async (ctx: Context) => {
      const state = states.get(ctx);
      if (state === undefined) return;
      if (!state.yielded) await fromAsyncThrowable(() => overLimit(state))();
      const shortfall = capacityShortfall(state);
      if (shortfall !== null) ctx.log(shortfall);
      let continuation = "";
      if (state.yielded)
        continuation =
          "; yielded to foreground disk:free; next timer continues oldest-first";
      else if (expired(state))
        continuation =
          "; budget exhausted or cancelled; next timer continues oldest-first";
      ctx.log(
        `graveyard expiry: ${state.expired} payloads expired, ${state.freed} bytes freed${continuation}`,
      );
      states.delete(ctx);
    },
  } satisfies Target;
  return { target, candidates };
}

function capacityShortfall(state: Expiry): string | null {
  if (state.knownBytes <= RIP_GRAVEYARD_MAX_BYTES) return null;
  const held = (hold: Payload["hold"]) =>
    state.payloads.filter((row) => row.hold === hold);
  const undo = held("undo");
  const unknown = held("unknown");
  return `graveyard capacity shortfall: at least ${state.knownBytes - RIP_GRAVEYARD_MAX_BYTES} bytes over soft target; ${undo.length} undo-window payloads held (at least ${undo.reduce((sum, row) => sum + row.logical, 0)} bytes); ${unknown.length} unknown-burial payloads held (at least ${unknown.reduce((sum, row) => sum + row.logical, 0)} bytes)`;
}

const expiry = createRipExpiryTarget();
export const purgeRip = expiry.target;
export const ripExpiryCandidates = expiry.candidates;
