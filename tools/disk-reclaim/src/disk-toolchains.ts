import { mkdir, statfs, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { Candidate } from "./model.ts";
import { runProbe } from "./disk-probe.ts";
import { stateDir, waitForLock } from "./receipt.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";

const Plan = z.array(
  z.object({ candidate: Candidate, fingerprint: z.string().nullable() }),
);
const Action = z.object({
  verdict: z.enum(["completed", "failed", "changed", "keep", "unknown"]),
  reason: z.string(),
  effect: z.enum(["none", "unlink"]),
  detail: z.unknown(),
  same_filesystem: z.boolean().optional(),
});
type Observation = {
  time: string;
  source: string;
  mount: null;
  filesystem: null;
  available_bytes: number;
  free_inodes: number | null;
  error: null;
};
type Item = {
  id: string;
  target: string;
  path: string | null;
  verdict: string;
  reason: string;
  fingerprint: string | null;
  effect: string;
  logical_bytes: null;
  allocated_bytes: number | null;
  eligible_at: null;
  error: string | null;
  detail: unknown;
};
type Dependencies = {
  guard: () => string | null;
  lock: (remaining: number) => Promise<{
    release: (() => void) | null;
    exit: number;
    error: string | null;
  }>;
  probe: typeof runProbe;
  measure: (path: string) => Promise<Observation>;
  receipt: (
    items: Item[],
  ) => Promise<{ id: string; path: string; delivery_error: null }>;
};
export async function freeToolchains(
  deadline: number,
  start: number,
  progress: boolean,
  injected?: Dependencies,
  signal?: AbortSignal,
  stopOnError = false,
) {
  const remaining = () => Math.floor(deadline - (performance.now() - start));
  const report = (stage: string) => {
    if (progress)
      process.stderr.write(
        `disk: free toolchains ${stage}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms\n`,
      );
  };
  const deps: Dependencies = injected ?? {
    guard: workerMutationRefusal,
    lock: (ms) =>
      waitForLock("toolchains", stateDir(), report, Math.min(10, ms / 1000)),
    probe: runProbe,
    measure: async (path) => {
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
  const items: Item[] = [];
  let receipt: Awaited<ReturnType<Dependencies["receipt"]>> | null = null;
  let before: Observation | null = null;
  let summaryAfter: Observation | null = null;
  let measurements = 0;
  let exit = 4;
  const result = () => ({
    items,
    before: measurements === 1 ? before : null,
    after: measurements === 1 ? summaryAfter : null,
    receipt,
    exit,
  });
  const guard = deps.guard();
  if (guard !== null) {
    items.push({
      id: "toolchains",
      target: "toolchains",
      path: null,
      verdict: "deny",
      reason: guard,
      fingerprint: null,
      effect: "none",
      logical_bytes: null,
      allocated_bytes: null,
      eligible_at: null,
      error: null,
      detail: null,
    });
    exit = 1;
    return result();
  }
  if (remaining() <= 0 || signal?.aborted === true) return result();
  report("waiting for lock");
  const locked = await fromAsyncThrowable(() => deps.lock(remaining()))();
  if (locked.isErr() || locked.value.release === null) {
    if (locked.isOk() && locked.value.exit === 3) exit = 3;
    return result();
  }
  using _lock = {
    [Symbol.dispose]: () => {
      locked.value.release?.();
    },
  };
  const worker = join(import.meta.dir, "disk-toolchains-worker.ts");
  const call = async (request: object) => {
    if (remaining() <= 0 || signal?.aborted === true) return null;
    const timer = progress
      ? setInterval(() => {
          report("waiting for worker");
        }, 5000)
      : undefined;
    const value = await fromAsyncThrowable(() =>
      deps.probe(
        [
          process.execPath,
          "-e",
          `import { toolchainsWorker } from ${JSON.stringify(worker)}; console.log(JSON.stringify(await toolchainsWorker(JSON.parse(process.env.DISK_TOOLCHAINS_REQUEST))));`,
        ],
        remaining(),
        { ...process.env, DISK_TOOLCHAINS_REQUEST: JSON.stringify(request) },
        signal,
      ),
    )();
    if (timer !== undefined) clearInterval(timer);
    return value.isOk() && value.value.exit === 0 && !value.value.timedOut
      ? value.value.out
      : null;
  };
  report("planning");
  const raw = await call({});
  const planned = raw === null ? null : jsonOf(Plan).safeParse(raw);
  if (planned === null || !planned.success) return result();
  for (const row of planned.data) {
    const c = row.candidate;
    let verdict = "unknown";
    if (c.verdict === "KEEP") verdict = "keep";
    if (c.verdict === "ASK") verdict = "ask";
    items.push({
      id: c.id,
      target: "toolchains",
      path: c.path,
      verdict,
      reason: c.reason,
      fingerprint: row.fingerprint,
      effect: "none",
      logical_bytes: null,
      allocated_bytes: c.bytes,
      eligible_at: null,
      error: null,
      detail: c,
    });
  }
  let unknown = false;
  let stopped = false;
  for (const item of items) {
    if (item.verdict !== "unknown") continue;
    if (stopped) {
      item.verdict = "deny";
      item.reason = "not attempted after earlier error";
      continue;
    }
    if (
      item.path === null ||
      item.fingerprint === null ||
      remaining() <= 0 ||
      Boolean(signal?.aborted)
    ) {
      item.reason = "identity or deadline unavailable";
      unknown = true;
      continue;
    }
    const measured = await fromAsyncThrowable(() =>
      deps.measure(dirname(item.path ?? homedir())),
    )();
    if (measured.isErr()) {
      item.reason = "before measurement unavailable";
      unknown = true;
      stopped = stopOnError;
      continue;
    }
    report(`checking ${item.path}`);
    const response = await call({
      path: item.path,
      fingerprint: item.fingerprint,
    });
    const acted = response === null ? null : jsonOf(Action).safeParse(response);
    if (acted === null || !acted.success) {
      item.effect = "unlink";
      item.reason = "worker result unavailable; effects may be partial";
      unknown = true;
      const measuredAfter = await fromAsyncThrowable(() =>
        deps.measure(dirname(item.path ?? homedir())),
      )();
      item.detail = {
        before: measured.value,
        after: measuredAfter.isOk() ? measuredAfter.value : null,
      };
      stopped = stopOnError;
      continue;
    }
    Object.assign(item, acted.data);
    const after =
      item.effect === "unlink"
        ? await fromAsyncThrowable(() =>
            deps.measure(dirname(item.path ?? homedir())),
          )()
        : null;
    item.detail = {
      result: acted.data.detail,
      before: measured.value,
      after: after?.isOk() === true ? after.value : null,
    };
    if (item.effect === "unlink") {
      measurements++;
      before = measured.value;
      summaryAfter = after?.isOk() === true ? after.value : null;
    }
    if (after !== null && after.isErr()) {
      item.verdict = "unknown";
      item.reason = "after measurement unavailable";
    }
    if (item.effect === "unlink" && acted.data.same_filesystem !== true) {
      item.verdict = "unknown";
      item.reason = "candidate filesystem measurement unavailable";
      before = null;
      summaryAfter = null;
      item.detail = {
        result: acted.data.detail,
        measurement_scope: "parent filesystem",
        before: measured.value,
        after: after?.isOk() === true ? after.value : null,
      };
    }
    if (item.verdict === "unknown") unknown = true;
    if (["unknown", "failed", "changed", "keep"].includes(item.verdict))
      stopped = stopOnError;
    report(`finished ${item.path}`);
  }
  if (items.some((item) => item.effect !== "none")) {
    const saved = await fromAsyncThrowable(() => deps.receipt(items))();
    if (saved.isOk()) receipt = saved.value;
    else {
      unknown = true;
      items
        .filter((row) => row.effect !== "none")
        .forEach((item) => {
          item.verdict = "unknown";
          item.reason = `receipt unavailable: ${String(saved.error)}`;
        });
    }
  }
  exit = 0;
  if (
    items.some((item) =>
      ["failed", "changed", "ask", "keep"].includes(item.verdict),
    )
  )
    exit = 1;
  if (unknown) exit = 4;
  return result();
}
