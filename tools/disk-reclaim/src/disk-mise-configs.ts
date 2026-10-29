import { statfs, mkdir, writeFile, lstat, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import {
  createMiseConfigsTarget,
  deadEntries,
} from "./targets/mise-configs.ts";
import type { Context, Target } from "./targets/index.ts";
import { stateDir, waitForLock } from "./receipt.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";
import { runProbe } from "./disk-probe.ts";

type Observation = {
  time: string;
  source: string;
  mount: null;
  filesystem: null;
  available_bytes: number;
  free_inodes: number | null;
  error: null;
};
type Dependencies = {
  target: Target;
  guard: () => string | null;
  lock: (remaining: number) => Promise<{
    release: (() => void) | null;
    exit: number;
    error: string | null;
  }>;
  measure: () => Promise<Observation>;
  fingerprint: () => Promise<string>;
  receipt: (
    item: unknown,
    before: Observation,
    after: Observation | null,
  ) => Promise<{ id: string; path: string; delivery_error: null }>;
};

export async function freeMiseConfigs(
  deadline: number,
  start: number,
  progress: boolean,
  injected?: Dependencies,
  signal?: AbortSignal,
) {
  const remaining = () => Math.floor(deadline - (performance.now() - start));
  const report = (stage: string) => {
    if (progress)
      process.stderr.write(
        `disk: free mise-configs ${stage}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms\n`,
      );
  };
  const target = createMiseConfigsTarget({
    run: async (argv) => {
      const result = await runProbe(
        argv,
        Math.max(1, remaining()),
        process.env,
        signal,
      );
      return {
        code: result.timedOut || result.exit === null ? 1 : result.exit,
        out: result.out,
        err: result.timedOut
          ? "command timed out; effects may be partial"
          : result.err,
      };
    },
  });
  const deps: Dependencies = injected ?? {
    target,
    guard: workerMutationRefusal,
    lock: (ms) =>
      waitForLock("mise-configs", stateDir(), report, Math.min(10, ms / 1000)),
    fingerprint: async () => {
      const path = resolve(
        process.env.MISE_STATE_DIR ??
          join(
            process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
            "mise",
          ),
      );
      const records = (await deadEntries(path)).toSorted();
      return JSON.stringify(
        await Promise.all(
          records.map(async (record) => {
            const s = await lstat(record);
            return [
              record,
              s.dev,
              s.ino,
              s.mode,
              s.uid,
              s.size,
              s.mtimeMs,
              s.ctimeMs,
              s.isSymbolicLink() ? await readlink(record) : null,
            ];
          }),
        ),
      );
    },
    measure: async () => {
      const path = resolve(
        process.env.MISE_STATE_DIR ??
          join(
            process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
            "mise",
          ),
      );
      const s = await statfs(path);
      return {
        time: Temporal.Now.instant().toString(),
        source: "statfs",
        mount: null,
        filesystem: null,
        available_bytes: s.bavail * s.bsize,
        free_inodes: s.ffree,
        error: null,
      };
    },
    receipt: async (item, before, after) => {
      const id = crypto.randomUUID();
      const dir = join(stateDir(), "disk-receipts");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${id}.json`);
      await writeFile(
        path,
        JSON.stringify({
          schema: "disk.target-receipt/1",
          id,
          item,
          before,
          after,
        }),
        { flag: "wx", mode: 0o600 },
      );
      return { id, path, delivery_error: null };
    },
  };
  const ctx: Context = {
    mode: "run",
    explicit: true,
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
    },
    log: report,
  };
  const item: {
    id: string;
    target: string;
    path: null;
    verdict: string;
    reason: string;
    fingerprint: string | null;
    effect: string;
    logical_bytes: null;
    allocated_bytes: null;
    eligible_at: null;
    error: string | null;
    detail: unknown;
  } = {
    id: "mise-configs:prune",
    target: "mise-configs",
    path: null,
    verdict: "unknown",
    reason: "not attempted",
    fingerprint: null,
    effect: "none",
    logical_bytes: null,
    allocated_bytes: null,
    eligible_at: null,
    error: null,
    detail: null,
  };
  let before: Observation | null = null;
  let after: Observation | null = null;
  let receipt: Awaited<ReturnType<Dependencies["receipt"]>> | null = null;
  let exit = 4;
  const result = () => ({ item, before, after, receipt, exit });
  const guard = deps.guard();
  if (guard !== null) {
    item.verdict = "deny";
    item.reason = guard;
    exit = 1;
    return result();
  }
  if (remaining() <= 0 || signal?.aborted === true) {
    item.reason = "deadline expired or cancelled";
    return result();
  }
  report("waiting for lock");
  const locked = await fromAsyncThrowable(() => deps.lock(remaining()))();
  if (locked.isErr()) {
    item.reason = `lock unavailable: ${String(locked.error)}`;
    return result();
  }
  if (locked.value.release === null) {
    item.reason = locked.value.error ?? "lock unavailable";
    exit = locked.value.exit === 3 ? 3 : 4;
    return result();
  }
  using _lock = { [Symbol.dispose]: locked.value.release };
  const execute = await fromAsyncThrowable(async () => {
    if (remaining() <= 0) {
      item.reason = "deadline expired";
      return;
    }
    const available = await deps.target.available(ctx);
    if (!available.available) {
      item.reason = available.skip_reason ?? "target unavailable";
      return;
    }
    const first = await deps.target.plan(ctx);
    if (first.length === 0) {
      item.verdict = "completed";
      item.reason = "no dead config records";
      exit = 0;
      return;
    }
    const candidate = first[0];
    if (
      first.length !== 1 ||
      candidate === undefined ||
      candidate.verdict !== "RECLAIM"
    ) {
      item.reason = "target plan unavailable or refused";
      return;
    }
    item.fingerprint = await deps.fingerprint();
    before = await deps.measure();
    const reavailable = await deps.target.available(ctx);
    const fresh = await deps.target.plan(ctx);
    const current = fresh[0];
    if (!reavailable.available) {
      item.reason = reavailable.skip_reason ?? "target unavailable";
      return;
    }
    if (
      current === undefined ||
      fresh.length !== 1 ||
      current.verdict !== "RECLAIM" ||
      current.id !== candidate.id ||
      current.reason !== candidate.reason ||
      (await deps.fingerprint()) !== item.fingerprint
    ) {
      item.verdict = "changed";
      item.reason = "target plan changed during revalidation";
      exit = 1;
      return;
    }
    if (remaining() <= 0 || signal?.aborted === true) {
      item.reason = "deadline expired or cancelled before action";
      return;
    }
    report("running prune");
    item.effect = "unlink";
    const timer = progress
      ? setInterval(() => {
          report("waiting for prune");
        }, 5000)
      : undefined;
    const actionResult = await fromAsyncThrowable(async () =>
      deps.target.act(current, ctx),
    )();
    if (timer !== undefined) clearInterval(timer);
    if (actionResult.isErr()) {
      item.reason = `prune result unavailable: ${String(actionResult.error)}`;
      return;
    }
    const acted = actionResult.value;
    item.detail = acted;
    const measured = await fromAsyncThrowable(() => deps.measure())();
    if (measured.isOk()) after = measured.value;
    if (!acted.ok) {
      item.verdict = "failed";
      item.reason = acted.error ?? "prune failed";
      exit = 1;
      if (item.reason.includes("timed out")) {
        item.verdict = "unknown";
        exit = 4;
      }
    } else if (after === null) {
      item.reason = "after measurement unavailable";
    } else {
      item.verdict = "completed";
      item.reason = "config prune completed";
      exit = 0;
    }
    if (after === null) {
      item.verdict = "unknown";
      item.reason = "after measurement unavailable";
      exit = 4;
    }
    const observedBefore = before;
    const saved = await fromAsyncThrowable(() =>
      deps.receipt(item, observedBefore, after),
    )();
    if (saved.isOk()) receipt = saved.value;
    else {
      item.verdict = "unknown";
      item.reason = `receipt unavailable: ${String(saved.error)}`;
      exit = 4;
    }
  })();
  if (execute.isErr()) {
    item.reason = String(execute.error);
    if (item.effect !== "none") item.verdict = "unknown";
    exit = 4;
  }
  return result();
}
