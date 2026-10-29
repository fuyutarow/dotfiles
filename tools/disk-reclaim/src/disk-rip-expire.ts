import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { runProbe } from "./disk-probe.ts";
import { stateDir, waitForLock } from "./receipt.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";

const observation = z.object({
  time: z.string(),
  source: z.string(),
  mount: z.null(),
  filesystem: z.null(),
  available_bytes: z.number(),
  free_inodes: z.number().nullable(),
  error: z.null(),
});
const resultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      target: z.string(),
      path: z.string().nullable(),
      verdict: z.string(),
      reason: z.string(),
      fingerprint: z.string().nullable(),
      effect: z.string(),
      logical_bytes: z.number().nullable(),
      allocated_bytes: z.null(),
      eligible_at: z.null(),
      error: z.string().nullable(),
      detail: z.unknown(),
    }),
  ),
  before: observation,
  after: observation,
});
type Dependencies = {
  guard: () => string | null;
  lock: (ms: number) => Promise<{
    release: (() => void) | null;
    exit: number;
    error: string | null;
  }>;
  probe: (
    ms: number,
    signal?: AbortSignal,
  ) => Promise<{
    out: string;
    err: string;
    exit: number | null;
    timedOut: boolean;
  }>;
  receipt: (
    result: unknown,
  ) => Promise<{ id: string; path: string; delivery_error: null }>;
};
export async function freeRipExpiry(
  deadline: number,
  start: number,
  progress: boolean,
  only?: string,
  stopOnError = false,
  signal?: AbortSignal,
  injected?: Dependencies,
) {
  const remaining = () => Math.floor(deadline - (performance.now() - start));
  const report = (stage: string) => {
    if (progress)
      process.stderr.write(
        `disk: free rip-expire ${stage}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms\n`,
      );
  };
  const deps: Dependencies = injected ?? {
    guard: workerMutationRefusal,
    lock: (ms) =>
      waitForLock("rip-expire", stateDir(), report, Math.min(10, ms / 1000)),
    probe: (ms, abort) =>
      runProbe(
        [process.execPath, join(import.meta.dir, "disk-rip-expire-child.ts")],
        ms,
        {
          ...process.env,
          DISK_RIP_ONLY: only,
          DISK_RIP_STOP: stopOnError ? "1" : "0",
        },
        abort,
      ),
    receipt: async (result) => {
      const id = crypto.randomUUID();
      const dir = join(stateDir(), "disk-receipts");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${id}.json`);
      await writeFile(
        path,
        JSON.stringify({ schema: "disk.target-receipt/1", id, result }),
        { flag: "wx", mode: 0o600 },
      );
      return { id, path, delivery_error: null };
    },
  };
  let data: z.output<typeof resultSchema> | null = null;
  let error: string | null = null;
  let receipt: Awaited<ReturnType<Dependencies["receipt"]>> | null = null;
  let exit = 4;
  const result = () => ({ data, error, receipt, exit });
  const refusal = deps.guard();
  if (refusal !== null) {
    error = refusal;
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
  if (remaining() <= 0 || Boolean(signal?.aborted)) {
    error = "deadline expired or cancelled";
    return result();
  }
  report("running expiry");
  const timer = progress
    ? setInterval(() => {
        report("waiting for expiry");
      }, 5000)
    : undefined;
  const response = await fromAsyncThrowable(() =>
    deps.probe(remaining(), signal),
  )();
  if (timer !== undefined) clearInterval(timer);
  if (response.isErr()) {
    error = String(response.error);
    return result();
  }
  const parsed = jsonOf(resultSchema).safeParse(response.value.out);
  if (response.value.timedOut || response.value.exit !== 0 || !parsed.success) {
    error = response.value.timedOut
      ? "expiry timed out; effects may be partial"
      : `expiry result unavailable: ${response.value.err}`;
    return result();
  }
  data = parsed.data;
  exit = data.items.some((item) => item.verdict !== "completed") ? 1 : 0;
  if (data.items.some((item) => item.verdict === "unknown")) exit = 4;
  const saved = await fromAsyncThrowable(() => deps.receipt(data))();
  if (saved.isErr()) {
    error = `receipt unavailable: ${String(saved.error)}`;
    exit = 4;
  } else receipt = saved.value;
  return result();
}
