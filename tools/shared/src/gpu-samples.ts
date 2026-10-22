// Read-only GPU state API. Only gpu-sampler.ts may execute the driver tool.
import { homedir } from "node:os";
import { join } from "node:path";
import { attemptOr } from "./attempt.ts";
import { jsonOf, z } from "./zod.ts";
export const RETAIN_MS = 2 * 60 * 60_000;
const MAX_SAMPLES = 721;
export const MAX_BYTES = 1024 * 1024;
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
}).refine((s) => s.nextTs >= s.ts + 60_000);
export type GpuSample = z.output<typeof GpuSampleSchema>;
export const GpuReadingSchema = Memory.extend({
  nowPct: Pct,
  avg15Pct: Pct.nullable(),
  avg60Pct: Pct.nullable(),
  samples15: z.number().int().nonnegative(),
});
export type GpuReading = z.output<typeof GpuReadingSchema>;

export const GPU_INTERVAL_MS = 60_000;
export const GPU_FRESH_MS = 120_000;
export function gpuStatePath(): string {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"),
    "gpu-owner.json",
  );
}
export function gpuSampleInterval(_random = Math.random): number {
  return GPU_INTERVAL_MS;
}
export async function readGpuSamples(
  path: string,
  now: number,
): Promise<GpuSample[]> {
  const state = await readGpuState(path);
  return (
    state?.samples.filter((s) => s.ts <= now && now - s.ts <= RETAIN_MS) ?? []
  );
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

export const GpuDeviceSchema = z
  .object({
    id: z.number().int().nonnegative(),
    totalMiB: z.number().positive(),
    usedMiB: z.number().nonnegative(),
    utilPct: Pct,
    powerWatts: z.number().nonnegative().optional(),
  })
  .refine((d) => d.usedMiB <= d.totalMiB);
export const GpuProcessSchema = z.object({
  pid: z.number().int().positive(),
  usedMiB: z.number().nonnegative().nullable(),
});
// Local proc evidence never establishes the driver's PID namespace.
export const GpuIdentityReadSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("read"), value: z.string().max(4096) }),
  z.object({
    status: z.enum(["missing", "permission", "error", "limit", "unsupported"]),
  }),
]);
const LocalIdentitySchema = z.object({
  pid: z.number().int().positive(),
  tgid: z.number().int().positive(),
  nspid: z.array(z.number().int().positive()).max(32),
  starttime: z.string().regex(/^\d+$/u),
});
export const GpuLocalObservationSchema = z.object({
  rawDriverPid: z.number().int().positive(),
  captureStartedAt: z.number().int().nonnegative(),
  captureFinishedAt: z.number().int().nonnegative(),
  status: z.enum([
    "read",
    "missing-before",
    "missing-after",
    "permission",
    "reuse",
    "error",
    "limit",
    "unsupported",
  ]),
  before: GpuIdentityReadSchema,
  after: GpuIdentityReadSchema,
  processStatus: GpuIdentityReadSchema,
  namespace: GpuIdentityReadSchema,
  local: LocalIdentitySchema.optional(),
});
export const GpuProcessIdentitySchema = z.object({
  version: z.literal(1),
  sampleAt: z.number().int().nonnegative(),
  captureStartedAt: z.number().int().nonnegative(),
  captureFinishedAt: z.number().int().nonnegative(),
  driverBinding: z.literal("unknown"),
  bootId: GpuIdentityReadSchema,
  collector: GpuLocalObservationSchema,
  processes: z.array(GpuLocalObservationSchema).max(64),
  omittedProcesses: z.number().int().nonnegative(),
});
export const GpuStateSchema = z.object({
  schema: z.literal(1),
  attemptAt: z.number().int().nonnegative(),
  sampledAt: z.number().int().nonnegative().optional(),
  lastProbeAt: z.number().int().nonnegative().optional(),
  paused: z.literal(true).optional(),
  holder: z
    .object({
      slot: z.string().regex(/^gpu\.\d+\.\d+$/u),
      pid: z.number().int().positive(),
    })
    .optional(),
  unresponsiveSince: z.number().int().nonnegative().optional(),
  na: z.literal(true).optional(),
  stallEvidence: z.string().optional(),
  consecutiveProbeMisses: z.number().int().nonnegative().optional(),
  why: z.string().optional(),
  devices: z.array(GpuDeviceSchema).max(256),
  processes: z.array(GpuProcessSchema).max(65536),
  processIdentity: GpuProcessIdentitySchema.optional(),
  samples: z.array(GpuSampleSchema).max(MAX_SAMPLES),
});
export type GpuState = z.output<typeof GpuStateSchema>;
export async function readGpuState(
  path = gpuStatePath(),
): Promise<GpuState | undefined> {
  return attemptOr(async () => {
    const file = Bun.file(path);
    const text = file.size > MAX_BYTES ? "" : await file.text();
    const parsed = jsonOf(GpuStateSchema).safeParse(text);
    return parsed.success ? parsed.data : undefined;
  }, undefined);
}
export function gpuStateFailure(
  state: GpuState | undefined,
  now = Temporal.Now.instant().epochMilliseconds,
  maxAgeMs = GPU_FRESH_MS,
): string | undefined {
  if (state === undefined) return "stale (GPU sampler state unavailable)";
  if (state.unresponsiveSince !== undefined)
    return `GPU stall recorded since ${Temporal.Instant.fromEpochMilliseconds(state.unresponsiveSince).toString()} (${state.stallEvidence ?? "evidence unavailable"})`;
  if (state.sampledAt === undefined)
    return state.why ?? "stale (no GPU sample)";
  if (state.sampledAt > now || now - state.sampledAt > maxAgeMs)
    return "stale (GPU sample expired)";
  if (state.paused === true) return undefined;
  return state.why;
}
export type GpuRead =
  | { ok: true; value: GpuReading }
  | { ok: false; why: string };
export function gpuReadFromState(
  state: GpuState | undefined,
  now = Temporal.Now.instant().epochMilliseconds,
): GpuRead {
  const why = gpuStateFailure(state, now);
  if (why !== undefined) return { ok: false, why };
  const value = gpuEstimate(state?.samples ?? [], now);
  return value === "unknown"
    ? { ok: false, why: "stale (no GPU sample)" }
    : { ok: true, value };
}
/** Compatibility name: this reads only; it never samples or starts a process. */
export async function sampleGpu(
  options: {
    statePath?: string;
    now?: number;
    cwd?: string;
    path?: string;
    fallbacks?: string[];
    timeoutMs?: number;
    random?: () => number;
  } = {},
): Promise<GpuRead> {
  return gpuReadFromState(await readGpuState(options.statePath), options.now);
}
