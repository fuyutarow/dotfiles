// Host-wide, opportunistic GPU estimates. No resident polling: consumers share a locked,
// atomic history, with jitter to avoid synchronizing with periodic short GPU bursts.
import { randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { tryAcquire } from "./dir-lock.ts";
import { fromThrowable, jsonOf, z } from "./zod.ts";

const RETAIN_MS = 2 * 60 * 60_000;
const MAX_SAMPLES = 721;
const MAX_BYTES = 1024 * 1024;
const Pct = z.number().min(0).max(100);
const Memory = z
  .object({
    memUsedGiB: z.number().nonnegative(),
    memTotalGiB: z.number().positive(),
  })
  .refine((m) => m.memUsedGiB <= m.memTotalGiB);
const PercentText = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?(?:\s*%)?$/u)
  .transform((s) => Number(s.replace(/\s*%$/u, "")))
  .pipe(Pct);
const MiBText = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?(?:\s*MiB)?$/u)
  .transform((s) => Number(s.replace(/\s*MiB$/u, "")) / 1024);
export const GPU_QUERY =
  "--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total";
export const GpuOutputSchema = z
  .string()
  .transform((out) => (out.split("\n")[0] ?? "").split(","))
  .pipe(z.tuple([PercentText, PercentText, MiBText, MiBText]))
  .transform(([utilPct, , memUsedGiB, memTotalGiB]) => ({
    utilPct,
    memUsedGiB,
    memTotalGiB,
  }))
  .pipe(Memory.extend({ utilPct: Pct }));
export const GpuSampleSchema = Memory.extend({
  ts: z.number().int().nonnegative(),
  utilPct: Pct,
  nextTs: z.number().int().nonnegative(),
}).refine((s) => s.nextTs >= s.ts + 10_000 && s.nextTs <= s.ts + 20_000);
export type GpuSample = z.output<typeof GpuSampleSchema>;
export const GpuReadingSchema = Memory.extend({
  nowPct: Pct,
  avg15Pct: Pct.nullable(),
  avg60Pct: Pct.nullable(),
  samples15: z.number().int().nonnegative(),
});
export type GpuReading = z.output<typeof GpuReadingSchema>;

export function gpuStatePath(): string {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
    "gpu-samples.jsonl",
  );
}
export function gpuSampleInterval(random = Math.random): number {
  return 10_000 + Math.floor(Math.max(0, Math.min(1, random())) * 10_000);
}
/** A corrupt, oversized, unordered, or future-dated history contributes no samples. */
export function readGpuSamples(path: string, now: number): GpuSample[] {
  const text = fromThrowable(() => {
    if (statSync(path).size > MAX_BYTES) return null;
    return readFileSync(path, "utf8");
  })();
  if (text.isErr() || text.value === null) return [];
  const lines = text.value.trim().split("\n");
  if (lines.length > MAX_SAMPLES) return [];
  const samples: GpuSample[] = [];
  for (const line of lines) {
    const parsed = jsonOf(GpuSampleSchema).safeParse(line);
    if (!parsed.success || parsed.data.ts > now) return [];
    const previous = samples.at(-1);
    if (previous !== undefined && parsed.data.ts < previous.nextTs) return [];
    samples.push(parsed.data);
  }
  return samples.filter((s) => now - s.ts <= RETAIN_MS);
}
function mean(rows: GpuSample[]): number | null {
  return rows.length < 3
    ? null
    : rows.reduce((sum, s) => sum + s.utilPct, 0) / rows.length;
}
/** Arithmetic sample mean, an estimate rather than a reconstructed duty cycle. */
export function gpuEstimate(
  samples: GpuSample[],
  now: number,
): GpuReading | "unknown" {
  const retained = samples.filter(
    (s) => s.ts <= now && now - s.ts <= RETAIN_MS,
  );
  const last = retained.at(-1);
  if (last === undefined) return "unknown";
  const window = (ms: number) => retained.filter((s) => now - s.ts <= ms);
  const recent = window(15 * 60_000);
  const parsed = GpuReadingSchema.safeParse({
    nowPct: last.utilPct,
    avg15Pct: mean(recent),
    avg60Pct: mean(window(60 * 60_000)),
    samples15: recent.length,
    memUsedGiB: last.memUsedGiB,
    memTotalGiB: last.memTotalGiB,
  });
  return parsed.success ? parsed.data : "unknown";
}
export function findGpuExecutable(
  path = process.env.PATH ?? "",
  fallbacks = ["/usr/lib/wsl/lib/nvidia-smi", "/usr/bin/nvidia-smi"],
): string | undefined {
  const candidates = path
    .split(process.platform === "win32" ? ";" : ":")
    .filter((p) => p !== "")
    .map((p) => join(p, "nvidia-smi"));
  return [...candidates, ...fallbacks].find((p) =>
    fromThrowable(() => {
      accessSync(p, constants.X_OK);
    })().isOk(),
  );
}
type Options = {
  cwd?: string;
  path?: string;
  fallbacks?: string[];
  statePath?: string;
  timeoutMs?: number;
  now?: number;
  random?: () => number;
};
export type GpuRead =
  | { ok: true; value: GpuReading }
  | { ok: false; why: string };
function answer(samples: GpuSample[], now: number): GpuRead {
  const value = gpuEstimate(samples, now);
  return value === "unknown"
    ? { ok: false, why: "sampling in progress" }
    : { ok: true, value };
}
function collect(
  options: Options,
): { ok: true; output: string } | { ok: false; why: string } {
  const executable = findGpuExecutable(options.path, options.fallbacks);
  if (executable === undefined) return { ok: false, why: "no nvidia-smi" };
  const timeout = options.timeoutMs ?? 1_000;
  const started = performance.now();
  const proc = Bun.spawnSync(
    [executable, GPU_QUERY, "--format=csv,noheader,nounits"],
    {
      cwd: options.cwd ?? process.cwd(),
      timeout: timeout,
      maxBuffer: MAX_BYTES,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (proc.signalCode === "SIGTERM" && performance.now() - started >= timeout)
    return { ok: false, why: `nvidia-smi timeout ${timeout}ms` };
  if (proc.signalCode !== undefined && proc.signalCode !== null)
    return { ok: false, why: `nvidia-smi killed by ${proc.signalCode}` };
  if (proc.exitCode !== 0)
    return { ok: false, why: `nvidia-smi exit ${proc.exitCode}` };
  return { ok: true, output: proc.stdout.toString() };
}
function lockedRead(options: Options, path: string): GpuRead {
  const lock = tryAcquire(`${path}.lock`, {
    pid: process.pid,
    host: hostname(),
    what: "GPU sample",
    since: Temporal.Now.instant().toString(),
  });
  // Stamp after acquiring: a competing writer may have landed a newer sample while
  // this reader was entering the lock. Never discard it as future-dated and resample.
  const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
  if (!lock.ok) return answer(readGpuSamples(path, now), now);
  using _held = { [Symbol.dispose]: lock.release };
  const samples = readGpuSamples(path, now);
  const last = samples.at(-1);
  if (last !== undefined && now < last.nextTs) return answer(samples, now);
  const collected = collect(options);
  if (!collected.ok) return collected;
  const parsed = GpuOutputSchema.safeParse(collected.output);
  if (!parsed.success)
    return { ok: false, why: "nvidia-smi output unparsable" };
  const ts = options.now ?? Temporal.Now.instant().epochMilliseconds;
  const sample = {
    ...parsed.data,
    ts,
    nextTs: ts + gpuSampleInterval(options.random),
  };
  const rows = [...samples.filter((s) => ts - s.ts <= RETAIN_MS), sample].slice(
    -MAX_SAMPLES,
  );
  const tmp = join(dirname(path), `.gpu-${randomUUID()}.tmp`);
  using _temp = {
    [Symbol.dispose]: () => {
      fromThrowable(() => {
        rmSync(tmp, { force: true });
      })();
    },
  };
  writeFileSync(tmp, `${rows.map((s) => JSON.stringify(s)).join("\n")}\n`, {
    mode: 0o600,
  });
  renameSync(tmp, path);
  return answer(rows, ts);
}
/** One bounded read across both consumers; lock losers use history without waiting. */
export function sampleGpu(options: Options = {}): GpuRead {
  const result = fromThrowable(() =>
    lockedRead(options, options.statePath ?? gpuStatePath()),
  )();
  return result.isOk()
    ? result.value
    : { ok: false, why: "GPU sampling unavailable" };
}
