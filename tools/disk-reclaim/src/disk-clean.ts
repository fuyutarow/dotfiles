import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { Candidate } from "./model.ts";
import { fromThrowable } from "@dotfiles/shared/src/zod.ts";
import { stateDir, waitForLock } from "./receipt.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";

const observation = z.object({
  time: z.string(),
  source: z.string(),
  mount: z.null(),
  filesystem: z.null(),
  available_bytes: z.number().nonnegative(),
  free_inodes: z.number().nullable(),
  error: z.null(),
});
const planSchema = z.array(
  z.object({ candidate: Candidate, fingerprint: z.string().nullable() }),
);
const actionSchema = z.object({
  verdict: z.enum(["completed", "failed", "keep", "ask", "changed", "unknown"]),
  reason: z.string().nullable(),
  effect: z.enum(["none", "unlink"]),
  before: observation.optional(),
  after: observation.optional(),
  detail: z.unknown().optional(),
});
type ProbeResult = {
  out: string;
  err: string;
  exit: number | null;
  timedOut: boolean;
};
type Dependencies = {
  guard: () => string | null;
  lock: (ms: number) => Promise<{
    release: (() => void) | null;
    exit: number;
    error: string | null;
  }>;
  probe: (
    action: string | undefined,
    ms: number,
    signal?: AbortSignal,
  ) => Promise<ProbeResult>;
  receipt: (
    items: unknown[],
  ) => Promise<{ id: string; path: string; delivery_error: null }>;
};

// The Bun cache command is a descendant of the adapter child. Kill the whole
// process group on cancellation and wait for the pipes and child to close.
async function cleanProbe(
  action: string | undefined,
  ms: number,
  signal?: AbortSignal,
  target: "clean" | "rust" = "clean",
): Promise<ProbeResult> {
  const spawned = fromThrowable(() =>
    Bun.spawn(
      [process.execPath, join(import.meta.dir, `disk-${target}-child.ts`)],
      {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
        env: {
          ...process.env,
          [`DISK_${target.toUpperCase()}_DEADLINE`]: String(
            Temporal.Now.instant().epochMilliseconds + ms,
          ),
          [`DISK_${target.toUpperCase()}_ACTION`]: action,
        },
      },
    ),
  )();
  if (spawned.isErr())
    return { out: "", err: String(spawned.error), exit: null, timedOut: false };
  const child = spawned.value;
  let timedOut = false;
  const stop = () => {
    timedOut = true;
    fromThrowable(() => process.kill(-child.pid, "SIGKILL"))();
  };
  const timer = setTimeout(stop, Math.min(ms, 2147483647));
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted === true) stop();
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  signal?.removeEventListener("abort", stop);
  return { out, err, exit, timedOut };
}

export async function freeClean(
  deadline: number,
  start: number,
  progress: boolean,
  injected?: Dependencies,
  signal?: AbortSignal,
  stopOnError = false,
  target: "clean" | "rust" = "clean",
) {
  const remaining = () => Math.floor(deadline - (performance.now() - start));
  const report = (stage: string) => {
    if (progress)
      process.stderr.write(
        `disk: free ${target} ${stage}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms\n`,
      );
  };
  const deps: Dependencies = injected ?? {
    guard: workerMutationRefusal,
    lock: (ms) =>
      waitForLock(target, stateDir(), report, Math.min(10, ms / 1000)),
    probe: (action, ms, abort) => cleanProbe(action, ms, abort, target),
    receipt: async (items) => {
      const id = crypto.randomUUID();
      const dir = join(stateDir(), "disk-receipts");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${id}.json`);
      await writeFile(
        path,
        JSON.stringify({ schema: "disk.target-receipt/1", id, items }),
        { flag: "wx", mode: 0o600 },
      );
      return { id, path, delivery_error: null };
    },
  };
  const items: {
    id: string;
    target: string;
    path: string | null;
    verdict: string;
    reason: string;
    fingerprint: string | null;
    effect: string;
    logical_bytes: number | null;
    allocated_bytes: null;
    eligible_at: null;
    error: string | null;
    detail: unknown;
    before: z.output<typeof observation> | null;
    after: z.output<typeof observation> | null;
  }[] = [];
  let exit = 4;
  let error: string | null = null;
  let receipt: Awaited<ReturnType<Dependencies["receipt"]>> | null = null;
  const result = () => ({ items, exit, error, receipt });
  const guard = deps.guard();
  if (guard !== null) {
    error = guard;
    exit = 1;
    return result();
  }
  if (remaining() <= 0 || signal?.aborted === true) {
    error = "deadline expired or cancelled";
    return result();
  }
  report("waiting for lock");
  const locked = await fromAsyncThrowable(() => deps.lock(remaining()))();
  if (locked.isErr()) {
    error = `lock unavailable: ${String(locked.error)}`;
    return result();
  }
  if (locked.value.release === null) {
    error = locked.value.error;
    exit = locked.value.exit === 3 ? 3 : 4;
    return result();
  }
  using _lock = { [Symbol.dispose]: locked.value.release };
  const probe = async (action?: string) => {
    if (remaining() <= 0 || signal?.aborted === true)
      return { out: "", error: "deadline expired or cancelled" };
    const timer = progress
      ? setInterval(() => {
          report(`waiting for ${target}`);
        }, 5000)
      : undefined;
    const response = await fromAsyncThrowable(() =>
      deps.probe(action, remaining(), signal),
    )();
    if (timer !== undefined) clearInterval(timer);
    if (response.isErr()) return { out: "", error: String(response.error) };
    if (response.value.timedOut || response.value.exit !== 0)
      return {
        out: "",
        error: response.value.timedOut
          ? "clean child timed out; effects may be partial"
          : `clean child failed: ${response.value.err}`,
      };
    return { out: response.value.out, error: null };
  };
  const planProbe = await probe();
  const plan = jsonOf(planSchema).safeParse(planProbe.out);
  if (planProbe.error !== null || !plan.success) {
    error = `clean plan unavailable: ${planProbe.error ?? "invalid result"}`;
    return result();
  }
  let stopped = false;
  for (const { candidate, fingerprint } of plan.data) {
    let verdict = "unknown";
    if (candidate.verdict === "KEEP") verdict = "keep";
    else if (candidate.verdict === "ASK") verdict = "ask";
    const item = {
      id: candidate.id,
      target,
      path: candidate.path,
      verdict,
      reason: candidate.reason,
      fingerprint,
      effect: "none",
      logical_bytes: null,
      allocated_bytes: null,
      eligible_at: null,
      error: null,
      detail: { checks: candidate.checks },
      before: null,
      after: null,
    };
    items.push(item);
    if (candidate.verdict !== "RECLAIM") continue;
    if (stopped) {
      item.reason = "not attempted after earlier failure";
      continue;
    }
    if (candidate.path === null || fingerprint === null) {
      item.reason = "missing path or fingerprint";
      continue;
    }
    report(`revalidating ${candidate.path}`);
    const actionProbe = await probe(
      JSON.stringify({ id: candidate.id, path: candidate.path, fingerprint }),
    );
    const action = jsonOf(actionSchema).safeParse(actionProbe.out);
    if (actionProbe.error !== null || !action.success) {
      item.reason = actionProbe.error ?? "invalid action result";
      item.effect = "unlink";
      stopped = true;
      continue;
    }
    const value = action.data;
    Object.assign(item, {
      verdict: value.verdict,
      reason: value.reason ?? "action failed",
      effect: value.effect,
      before: value.before ?? null,
      after: value.after ?? null,
      detail: value.detail ?? null,
    });
    if (
      value.verdict === "completed" &&
      (value.before === undefined || value.after === undefined)
    ) {
      item.verdict = "unknown";
      item.reason = "filesystem measurement unavailable";
    } else if (
      value.verdict === "completed" &&
      value.before !== undefined &&
      value.after !== undefined &&
      value.after.available_bytes <= value.before.available_bytes
    ) {
      item.verdict = "partial";
      item.reason = "no measured increase in available space";
    }
    report(`completed ${candidate.path}`);
    if (stopOnError && ["failed", "partial", "unknown"].includes(item.verdict))
      stopped = true;
  }
  exit = 0;
  if (items.some((i) => i.verdict !== "completed")) exit = 1;
  if (items.some((i) => i.verdict === "unknown")) exit = 4;
  const saved = await fromAsyncThrowable(() => deps.receipt(items))();
  if (saved.isOk()) receipt = saved.value;
  else {
    exit = 4;
    error = `receipt unavailable: ${String(saved.error)}`;
  }
  return result();
}
