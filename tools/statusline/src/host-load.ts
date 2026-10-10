// Host load — CPU · RAM · VRAM · Disk — read and rendered as the statusline's Sys row. Consumers:
// tools/statusline/src/statusline.ts (row 5) and `s` in zsh/aliases.zsh (one row, now).
// Split out of the former Claude statusline (2026-10-06): reading host load used to require the whole
// statusline (a stdin payload, sessions, rate limits), and the GPU sampler re-executed the
// statusline itself; now the sampler re-executes THIS file (same SAMPLE_ENV, cache and lock).
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  statSync,
} from "node:fs";
import {
  mkdir as mkdirAsync,
  readFile,
  rmdir as rmdirAsync,
  stat as statAsync,
} from "node:fs/promises";
import { dirname } from "node:path";
import { cpus, totalmem } from "node:os";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { diskReadings, diskSegment, type DiskEntry } from "./storage.ts";
import { cgroupMemory } from "./cgroup-memory.ts";
import { z } from "./zod.ts";
import { CccIndexSchema, cccBadge, sampleCccIndexing } from "./ccc-indexing.ts";
import {
  findGpuExecutable,
  findGpuExecutableAsync,
  sampleGpu,
} from "../../shared/src/gpu-samples.ts";
import { ESC, RST, naSegment, pctFmt, roles } from "./ansi.ts";
import {
  ENRICHMENT_TIMEOUT_MS,
  execAsyncBounded,
  type ExecFailure,
  execBounded,
  failWhy,
  readJson,
  readJsonAsync,
  within,
  writeCache,
  writeCacheAsync,
} from "./bounded.ts";

const HOME = process.env.HOME ?? "";

// Shared shape for a "used/total" memory-style reading (RAM, VRAM): both the fraction string
// AND the percentage, since render() needs the percentage to threshold-color the segment the
// same way every other percentage in this file is colored (pctFmt) — a plain fraction alone
// cannot drive that.
export const MemReadingSchema = z.object({
  frac: z.string(), // e.g. "16.2/54.9G"
  pct: z.number(), // used/total*100, unrounded — pctFmt() rounds at render time
  gpuAvg15: z.number().nullable().optional(),
  gpuSamples15: z.number().optional(),
  cccIndexing: CccIndexSchema.optional(),
  // Set only when this is the last GOOD sample served because the fresh one failed (VRAM only):
  // how old it is and why the fresh one failed. render() prints it, so an old number is never
  // shown as if it were current.
  stale: z.object({ secs: z.number(), why: z.string() }).optional(),
});
export type MemReading = z.output<typeof MemReadingSchema>;
export function memReading(
  usedG: number,
  totalG: number,
): MemReading | undefined {
  if (!Number.isFinite(usedG) || !Number.isFinite(totalG) || totalG <= 0)
    return undefined;
  return {
    // used right-aligned to the total's width, so 9.6/170.9 and 19.6/170.9 take the same columns
    frac: `${usedG.toFixed(1).padStart(totalG.toFixed(1).length)}/${totalG.toFixed(1)}G`,
    pct: (usedG / totalG) * 100,
  };
}

// Called on EVERY render now (Sys row, below), not just while a job is admitted — the one
// subprocess call among the three Sys readings, bounded like every other enrichment here.
// nvidia-smi is ~170 ms of a ~200 ms render (measured 2026-10-01) and its answer is host-wide, so
// one sample is shared by every session for GPU_SAMPLE_TTL_MS. That is what lets settings.json run
// the bar every 5 s (statusLine.refreshInterval) — the cadence a Remote Control connect needs to
// show up promptly, since the bridge attaches after the command's own render.
export const GPU_CACHE = `${HOME}/.cache/claude/statusline-gpu.json`;
export const GPU_SAMPLE_TTL_MS = 5_000;
// The sampler's bound. Measured 2026-10-05 under load average 22-26 (24 samples): nvidia-smi
// p50 2.6 s, p90 5.6 s, max 12.6 s, 15 of 24 over the old 2 s bound. Above the
// worst seen, so a slow answer is an answer; below "hung", so a dead driver is still named.
// STATUSLINE_GPU_SAMPLE_TIMEOUT_MS lets the tests exercise the timeout without waiting it out.
export const GPU_SAMPLE_TIMEOUT_SCHEMA = z.coerce
  .number()
  .int()
  .min(100)
  .max(120_000);
const gpuSampleTimeout = GPU_SAMPLE_TIMEOUT_SCHEMA.safeParse(
  process.env.STATUSLINE_GPU_SAMPLE_TIMEOUT_MS,
);
export const GPU_SAMPLE_TIMEOUT_MS = gpuSampleTimeout.success
  ? gpuSampleTimeout.data
  : 20_000;
// A last-good sample older than this is a claim about a moment too far back to still be useful;
// beyond it the reading becomes n/a instead of a stale number.
export const GPU_STALE_MAX_MS = 30 * 60_000;
// A last-good sample younger than this is shown without the `stale` marker (see memSegment).
export const STALE_SHOW_S = 60;
// `reading`: the newest sample, set when it succeeded. `why`: set when it failed — a failure is
// cached for the TTL like a success, so a hung nvidia-smi costs one bounded render per 5 s, not
// every render. `good`: the newest SUCCESSFUL sample, kept across failures. The pre-2026-10-03
// shape wrote `reading: null` for ANY failure ("no GPU"), which is how a timeout under load made
// VRAM disappear; that shape carries no `why`, so it is simply treated as expired.
export const GpuCacheSchema = z.object({
  at: z.number().optional(),
  reading: MemReadingSchema.nullish(), // `null` is the pre-fix "no GPU" marker
  why: z.string().optional(),
  good: z.object({ at: z.number(), reading: MemReadingSchema }).optional(),
});
export type GpuCache = z.output<typeof GpuCacheSchema>;
// SAMPLING IS OFF THE RENDER PATH (Tiger ledger O4, 2026-10-05). The bar used to run nvidia-smi
// inside the render under a 2 s bound. Under load (load average 26 on 12 cores, plus the per-job
// nvidia-smi pollers of agent-resource-run) nvidia-smi takes 2-10 s, so a bound shorter than its
// service time failed nearly every attempt, and VRAM sat 264 s stale: an attempt-deadline below the
// service time is starvation, not a timeout. Now the render only READS the cache and, when it has
// expired, makes sure one sampler is running; the sampler is this same file started with
// SAMPLE_ENV set, gets GPU_SAMPLE_TIMEOUT_MS (above the worst latency measured), and writes the cache.
// The render never waits for it.
// An environment variable, not argv: this file has no command line of its own (its input is the
// stdin payload), so the mode is an internal channel between the render and the process it starts.
export const SAMPLE_ENV = "STATUSLINE_SAMPLE_GPU";
// What a reading is marked with while the newest attempt has not finished (or there is none yet).
export const SAMPLING_WHY = "sampling in progress";
// ONE nvidia-smi in flight host-wide (Tiger ledger O3). The lock is a directory because mkdir is
// atomic (EEXIST for every loser) and needs no flags or libraries. The render that wins it hands
// it to the sampler it starts (the sampler releases it when it ends), so while a sampler runs no
// other session starts a second one — at 40 sessions that is the difference between one process and
// a herd feeding the load that made nvidia-smi slow. Its owner is not recorded: a lock older than
// GPU_LOCK_STALE_MS (the sample bound + start-up margin) is a crashed sampler's, and is broken.
export const GPU_LOCK = `${HOME}/.cache/claude/statusline-gpu.lock`;
export const GPU_LOCK_STALE_MS = GPU_SAMPLE_TIMEOUT_MS + 19_000;
export interface GpuLock {
  release(): void;
}
// Sync lock API remains for sync readHostLoad callers; the Claude renderer uses its async twin.
export function acquireGpuLock(): Result<GpuLock, string> {
  const take = (): boolean =>
    fromThrowable(() => {
      mkdirSync(dirname(GPU_LOCK), { recursive: true });
      mkdirSync(GPU_LOCK);
    })().isOk();
  const lock: GpuLock = {
    release: () => {
      fromThrowable(() => {
        rmdirSync(GPU_LOCK);
      })();
    },
  };
  if (take()) return ok(lock);
  const held = fromThrowable(() => statSync(GPU_LOCK).mtimeMs)();
  const now = Temporal.Now.instant().epochMilliseconds;
  // Stale = OLD, nothing else. within() also rejects a timestamp in the future (right for a cache,
  // where it means a stepped-back clock), but a lock dir created a moment ago has a sub-ms mtime that
  // can sit a fraction of a ms past this integer `now` — and was then "broken" as stale, starting a
  // second sampler (the O3 flake: ~1 in 10 renders of 6, before and after the host-load split).
  if (held.isOk() && now - held.value >= GPU_LOCK_STALE_MS) {
    lock.release();
    if (take()) return ok(lock);
  }
  return err("another sampler holds the lock");
}
// Render side: make sure a sampler is in flight, and return at once. Ok = one is running or was
// just started; err = it could not be started (the reason is shown beside the reading).
export function ensureSampler(): Result<void, string> {
  const lock = acquireGpuLock();
  if (lock.isErr()) return ok(undefined); // one is already in flight: that is the goal
  // Re-check under the lock (O3: one sample per TTL). The caller judged the cache expired BEFORE
  // taking the lock; a sampler can finish and release in between, and this render would then start
  // a second one for a sample that just landed — seen as 2 nvidia-smi runs for 6 concurrent renders
  // (statusline-explicit-absence.test.ts O3, ~1 in 10 before the split, ~3 in 10 after it, because
  // the sampler now starts faster).
  // "Landed" means what vramFrac calls fresh: inside the TTL AND saying something (a reading, or why
  // there is none) — the pre-2026-10-03 `{reading: null}` says neither and must not stop a sample.
  const now = Temporal.Now.instant().epochMilliseconds;
  const c = readJson(GPU_CACHE, GpuCacheSchema);
  const says =
    (c?.reading !== null && c?.reading !== undefined) || c?.why !== undefined;
  if (c?.at !== undefined && within(c.at, now, GPU_SAMPLE_TTL_MS) && says) {
    lock.value.release();
    return ok(undefined);
  }
  const started = fromThrowable(
    () => {
      const child = spawn(process.execPath, [import.meta.path], {
        stdio: "ignore",
        env: { ...process.env, [SAMPLE_ENV]: "1" },
      });
      child.once("error", () => {
        lock.value.release();
      });
      child.unref(); // the render exits without waiting; the child is bounded by its own timeout
    },
    (e): string => `sampler not started (${failWhy(e, "bun")})`,
  )();
  if (started.isErr()) lock.value.release();
  return started;
}
interface AsyncGpuLock {
  release(): Promise<void>;
}
async function acquireGpuLockAsync(): Promise<Result<AsyncGpuLock, string>> {
  const take = async (): Promise<boolean> =>
    mkdirAsync(dirname(GPU_LOCK), { recursive: true })
      .then(() => mkdirAsync(GPU_LOCK))
      .then(() => true)
      .catch(() => false);
  const lock: AsyncGpuLock = {
    release: async () => {
      await rmdirAsync(GPU_LOCK).catch(() => null);
    },
  };
  if (await take()) return ok(lock);
  const held = await statAsync(GPU_LOCK)
    .then((value) => value.mtimeMs)
    .catch(() => null);
  const now = Temporal.Now.instant().epochMilliseconds;
  if (held !== null && now - held >= GPU_LOCK_STALE_MS) {
    await lock.release();
    if (await take()) return ok(lock);
  }
  return err("another sampler holds the lock");
}
/** Async render-path lock and cache check; the sampler still owns the lock after spawn. */
async function ensureSamplerAsync(): Promise<Result<void, string>> {
  const lock = await acquireGpuLockAsync();
  if (lock.isErr()) return ok(undefined);
  const now = Temporal.Now.instant().epochMilliseconds;
  const cached = await readJsonAsync(GPU_CACHE, GpuCacheSchema);
  const says =
    (cached?.reading !== null && cached?.reading !== undefined) ||
    cached?.why !== undefined;
  if (
    cached?.at !== undefined &&
    within(cached.at, now, GPU_SAMPLE_TTL_MS) &&
    says
  ) {
    await lock.value.release();
    return ok(undefined);
  }
  const started = fromThrowable(
    () => {
      const child = spawn(process.execPath, [import.meta.path], {
        stdio: "ignore",
        env: { ...process.env, [SAMPLE_ENV]: "1" },
      });
      child.once("error", () => {
        void lock.value.release();
      });
      child.unref();
    },
    (e): string => `sampler not started (${failWhy(e, "bun")})`,
  )();
  if (started.isErr()) await lock.value.release();
  return started;
}
// Sampler side (`STATUSLINE_SAMPLE_GPU=1 bun tools/statusline/src/host-load.ts`): take ONE sample under the long bound
// and record it. `good` is the previous last-good sample, carried over a failure so a transient
// miss can still be shown (marked stale) instead of turning into n/a. Returns the exit code; the
// caller exits AFTER this returns, so the lock is released by `using` first. Refuses to run
// without the lock: ensureSampler starts it and hands the lock over.
// The separate sampler child uses this sync entry; renderer calls return before sampling starts.
export async function runSampler(): Promise<number> {
  if (!existsSync(GPU_LOCK)) {
    process.stderr.write(
      `statusline: ${SAMPLE_ENV} is set by the statusline, which holds ${GPU_LOCK}; refusing to run without it\n`,
    );
    return 2;
  }
  using _held: Disposable = {
    [Symbol.dispose]: () => {
      fromThrowable(() => {
        rmdirSync(GPU_LOCK);
      })();
    },
  };
  const good = readJson(GPU_CACHE, GpuCacheSchema)?.good;
  const sampled = sampleVram();
  const cccIndexing = sampled.isOk()
    ? await sampleCccIndexing({
        cachePath: `${HOME}/.cache/claude/statusline-ccc-indexing.json`,
      })
    : undefined;
  const reading = sampled.map((value) =>
    Object.assign({}, value, { cccIndexing }),
  );
  // Stamped AFTER the sample returns, so the TTL runs from when the answer exists.
  const at = Temporal.Now.instant().epochMilliseconds;
  writeCache(
    GPU_CACHE,
    reading.match(
      (value) => ({ at, reading: value, good: { at, reading: value } }),
      (failure) => ({ at, why: failure.why, good }),
    ), // JSON drops an undefined `good`
  );
  return 0;
}
// A Mac with no nvidia-smi has no discrete VRAM to read: Apple silicon's GPU shares the RAM the
// row already shows. That is "does not exist", which the EXPLICIT-ABSENCE law keeps silent. On
// Linux a missing nvidia-smi stays n/a — there it is a broken GPU box, not a GPU-less one.
export function vramGated(): Result<MemReading, string> | undefined {
  const vram = vramFrac();
  const absent =
    process.platform === "darwin" &&
    vram.isErr() &&
    vram.error === "no nvidia-smi";
  return absent ? undefined : vram;
}
export function vramFrac(): Result<MemReading, string> {
  // A missing tool needs no sampler to be known, and a Mac without one has no VRAM row (vramGated).
  if (findGpuExecutable() === undefined) return err("no nvidia-smi");
  // A file that is missing or fails GpuCacheSchema is an empty cache. Read BEFORE taking `now`: the
  // sampler is another process and may land a sample at any moment, and an entry stamped a few ms
  // after a `now` taken first reads as "from the future" (within() rejects it, as it must for a
  // stepped-back clock) — the reading would vanish for exactly one render (seen live, 2026-10-05).
  const cached: GpuCache = readJson(GPU_CACHE, GpuCacheSchema) ?? {};
  const now = Temporal.Now.instant().epochMilliseconds;
  // Fresh = an entry that says something (a reading, or why there is none) and is inside the TTL.
  // The pre-2026-10-03 `{reading: null}` says neither, so it counts as expired.
  const fresh =
    cached.at !== undefined &&
    within(cached.at, now, GPU_SAMPLE_TTL_MS) &&
    ((cached.reading !== null && cached.reading !== undefined) ||
      cached.why !== undefined);
  if (fresh && cached.reading !== null && cached.reading !== undefined)
    return ok(cached.reading);
  // Expired: refresh in the background and answer from what is cached NOW. A cached miss inside
  // the TTL is served as-is, without starting another sampler (one attempt per TTL, not per render).
  const started = fresh ? ok(undefined) : ensureSampler();
  const why = started.isErr() ? started.error : (cached.why ?? SAMPLING_WHY);
  // A last-good sample is still better than nothing, provided its age and the reason the newer
  // one is missing are printed beside it (memSegment marks it from STALE_SHOW_S on); otherwise
  // the reading is plainly n/a.
  const good = cached.good;
  if (good !== undefined && within(good.at, now, GPU_STALE_MAX_MS)) {
    const secs = Math.round((now - good.at) / 1000);
    return ok({ ...good.reading, stale: { secs, why } });
  }
  return err(why);
}
// Runs in the sampler, under GPU_SAMPLE_TIMEOUT_MS — never inside a render.
export function sampleVram(): Result<MemReading, ExecFailure> {
  const result = sampleGpu({ timeoutMs: GPU_SAMPLE_TIMEOUT_MS });
  if (!result.ok) return err({ why: result.why, stderr: "", ran: true });
  const device = result.value;
  const reading = memReading(device.memUsedGiB, device.memTotalGiB);
  return reading === undefined
    ? err({ why: "nvidia-smi output unparsable", stderr: "", ran: true })
    : ok({
        ...reading,
        gpuAvg15: device.avg15Pct,
        gpuSamples15: device.samples15,
      });
}

// Host RAM, Linux only (reads /proc/meminfo — instant, no subprocess). MemAvailable (not
// MemFree) is what "used" is measured against: it already accounts for reclaimable page cache,
// which MemFree does not, so MemFree would read as chronically "almost full" on a healthy box.
// macOS host RAM: `vm_stat` (a few ms, no privileges) for the page counts, os.totalmem() for the
// size. "Used" is Activity Monitor's Memory Used — app memory (anonymous minus purgeable pages) +
// wired + compressed — NOT total minus "Pages free": macOS keeps free pages near zero by caching
// files, so that would read as chronically full, the same trap MemFree is on Linux. Not `top -l 1`:
// its PhysMem "used" counts that file cache too, and it costs a full process-table pass.
export const VmStatPage = z.string().regex(/^\d+$/u).transform(Number);
export function macRam(): Result<MemReading, string> {
  return execBounded("vm_stat", "vm_stat", [], ENRICHMENT_TIMEOUT_MS)
    .mapErr((f) => f.why)
    .andThen((raw) => {
      const size = raw.match(/page size of (\d+) bytes/u)?.[1];
      const pages = (label: string): number | undefined => {
        const line = raw.split("\n").find((l) => l.startsWith(`${label}:`));
        const v = VmStatPage.safeParse(
          line?.split(/\s+/u).pop()?.replace(/\.$/u, ""),
        );
        return v.success ? v.data : undefined;
      };
      const wired = pages("Pages wired down");
      const compressed = pages("Pages occupied by compressor");
      const anonymous = pages("Anonymous pages");
      const purgeable = pages("Pages purgeable");
      if (
        size === undefined ||
        wired === undefined ||
        compressed === undefined ||
        anonymous === undefined ||
        purgeable === undefined
      )
        return err("vm_stat output unparsable");
      const usedBytes =
        (wired + compressed + Math.max(0, anonymous - purgeable)) *
        Number(size);
      const GiB = 1024 ** 3;
      const reading = memReading(usedBytes / GiB, totalmem() / GiB);
      return reading !== undefined
        ? ok(reading)
        : err("vm_stat output unparsable");
    });
}
/** A small kernel file's text, or undefined when it does not exist here (cgroup-memory's reader). */
const readIfPresent = (path: string): string | undefined =>
  fromThrowable(() => readFileSync(path, "utf8"))().unwrapOr(undefined);
// macOS has no /proc: see macRam().
export function ramFrac(): Result<MemReading, string> {
  if (process.platform === "darwin") return macRam();
  return fromThrowable(
    () => readFileSync("/proc/meminfo", "utf8"),
    () => "no /proc/meminfo",
  )().andThen((raw) => {
    let totalKb: number | undefined;
    let availKb: number | undefined;
    for (const line of raw.split("\n")) {
      if (line.startsWith("MemTotal:")) totalKb = Number(line.split(/\s+/u)[1]);
      else if (line.startsWith("MemAvailable:"))
        availKb = Number(line.split(/\s+/u)[1]);
      if (totalKb !== undefined && availKb !== undefined) break;
    }
    if (totalKb === undefined || availKb === undefined)
      return err("meminfo lacks MemTotal/MemAvailable");
    // Inside a container /proc/meminfo is the HOST; the cgroup limit is what this box can use
    // (lib/cgroup-memory.ts says how Vast read 42% at the brink of an OOM kill). Marked "cgroup".
    const GiB = 1024 ** 3;
    const cg = cgroupMemory(readIfPresent, totalKb * 1024);
    if (cg !== undefined) {
      const capped = memReading(cg.usedBytes / GiB, cg.limitBytes / GiB);
      return capped !== undefined
        ? ok({ ...capped, frac: `${capped.frac} cgroup` })
        : err("cgroup memory unparsable");
    }
    const usedKb = totalKb - availKb;
    const reading = memReading(usedKb / 1024 / 1024, totalKb / 1024 / 1024);
    return reading !== undefined ? ok(reading) : err("meminfo unparsable");
  });
}

// One /proc/stat snapshot alone cannot give a CPU percentage — its counters are cumulative
// jiffies since boot, so a percentage needs the DELTA between two snapshots. Each statusline
// render is a fresh process (see this file's header note), so that second snapshot has to be
// the previous render's, kept on disk — same shape as AGENT_NAME_CACHE / RC_PROBE_CACHE above.
export const CPU_CACHE = `${HOME}/.cache/claude/statusline-cpu.json`;
export const CpuSampleSchema = z.object({
  total: z.number(),
  idle: z.number(),
  at: z.number().optional(), // epoch ms the sample was taken; only the cached baseline carries it
});
export type CpuSample = z.output<typeof CpuSampleSchema>;
export const CPU_BASELINE_MIN_MS = 2_000;
export const CPU_BASELINE_MAX_MS = 60_000;
// Aggregate "cpu  ..." line (not a per-core "cpu0 ..." line): user+nice+system+idle+iowait+
// irq+softirq+steal[+guest+guest_nice]. idle time is idle+iowait; total is the sum of every
// field. On macOS (no /proc) the same cumulative counters come from os.cpus() — libuv's
// host_processor_info, per-core ms since boot — summed over cores: no subprocess, and the same
// two-sample delta. Not `top -l 2`: its first sample is the since-boot average, so a real
// percentage costs a second sample ~1 s later (measured 1.9 s), most of ENRICHMENT_TIMEOUT_MS.
// The units differ (jiffies vs ms) but a host only ever diffs against its own kind.
export function macCpuSample(): Result<CpuSample, string> {
  const cores = cpus();
  if (cores.length === 0) return err("os.cpus() returned no cores");
  let total = 0;
  let idle = 0;
  for (const { times } of cores) {
    total += times.user + times.nice + times.sys + times.idle + times.irq;
    idle += times.idle;
  }
  return total > 0 ? ok({ total, idle }) : err("os.cpus() counters are zero");
}
export function readCpuSample(): Result<CpuSample, string> {
  if (process.platform === "darwin") return macCpuSample();
  return fromThrowable(
    () => readFileSync("/proc/stat", "utf8"),
    () => "no /proc/stat",
  )().andThen((raw) => {
    const line = raw.split("\n").find((l) => l.startsWith("cpu "));
    if (line === undefined || line === "")
      return err("/proc/stat has no cpu line");
    const fields = line.trim().split(/\s+/u).slice(1).map(Number);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    return Number.isFinite(idle) && total > 0
      ? ok({ total, idle })
      : err("/proc/stat cpu line unparsable");
  });
}
export function cpuPct(): Result<number, string> {
  const sampled = readCpuSample();
  if (sampled.isErr()) return err(sampled.error); // no /proc (mac) / malformed line
  const sample = sampled.value;
  const now = Temporal.Now.instant().epochMilliseconds;
  const prev = readJson(CPU_CACHE, CpuSampleSchema); // undefined: no usable baseline file
  // Best-effort write of THIS render's sample for the NEXT render to diff against, unconditional
  // on whether this render itself can show a value — same "write regardless, return what we
  // have" shape as agentName()'s cache-miss path above. EXCEPT a baseline younger than
  // CPU_BASELINE_MIN_MS is kept: the file is shared by every session, so overwriting it each
  // render shrank the window to the gap since ANOTHER session's render (a few ms -> a coarse 0%
  // or 100%).
  const keep =
    prev?.at !== undefined && within(prev.at, now, CPU_BASELINE_MIN_MS);
  if (!keep) {
    writeCache(CPU_CACHE, { ...sample, at: now });
  }
  if (prev === undefined) return err("no earlier sample to diff against"); // first render on this host
  // A baseline with no timestamp (pre-2026-10-03 file), from the future (clock stepped back) or
  // older than CPU_BASELINE_MAX_MS would be an average over some other period than "now".
  if (prev.at === undefined || !within(prev.at, now, CPU_BASELINE_MAX_MS))
    return err("no earlier sample from the last 60s");
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  // dTotal<=0 means no jiffies elapsed between two renders (or a counter reset) -> a division
  // here would be by ~0 or negative, not a real rate; say so rather than show a bogus number.
  if (dTotal <= 0) return err("no ticks since the last sample");
  return ok(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)));
}
// Sys row: "CPU NN% · RAM NN% (X.X/Y.YG) · VRAM NN% (X.X/Y.YG) · Disk …" — each reading a value
// or `n/a (<why>)` — host resource usage, always its own row like Job (never folded into Rate, which is API budget, not host load). All three
// percentages share the same green/yellow/red pctFmt threshold as every other percentage in
// this file; the fraction rides alongside each, dimmed, as supporting detail — same
// percent-then-dim-detail shape rl5Segment/rl7Segment already use for their reset countdowns.
export function memSegment(label: string, m: MemReading): string {
  const { text: pct, col } = pctFmt(m.pct);
  let seg = `${roles.label(label)} ${roles.value(`${pct}%`, col)} ${roles.secondary(`(${m.frac})`)}`;
  if (m.gpuAvg15 !== undefined && m.gpuAvg15 !== null)
    seg += ` ${roles.secondary(`GPU≈${Math.round(m.gpuAvg15)}%/15m n=${m.gpuSamples15 ?? 0}`)}`;
  const badge = cccBadge(
    m.cccIndexing,
    Temporal.Now.instant().epochMilliseconds,
  );
  if (label === "VRAM" && badge !== undefined)
    seg += ` ${roles.secondary(badge)}`;
  // A number old enough to mislead carries supporting detail: `stale`, its age, and why.
  // Under STALE_SHOW_S it is not marked (owner ruling 2026-10-05): with the bar refreshing every 5 s
  // and one session sampling for all, a reading tens of seconds old is the normal case, and the
  // marker there was noise that buried the cases that matter.
  if (m.stale !== undefined && m.stale.secs >= STALE_SHOW_S)
    seg += ` ${roles.secondary(`stale ${m.stale.secs}s (${m.stale.why})`)}`;
  return seg;
}
// Disks: WHICH filesystems and at what free space they turn yellow/red are not decided here —
// Every reading is a Result: ok renders the value, err renders `<label> n/a (<why>)` — see the
// EXPLICIT-ABSENCE law at the top. The row therefore always carries CPU, RAM and VRAM.
export function sysSegment(
  cpu: Result<number, string>,
  ram: Result<MemReading, string>,
  vram: Result<MemReading, string> | undefined,
  disks: Result<DiskEntry[], string>,
): string {
  const parts: string[] = [
    cpu.match(
      (v) => {
        const { text: pct, col } = pctFmt(v);
        return `${roles.label("CPU")} ${roles.value(`${pct}%`, col)}`;
      },
      (why) => naSegment("CPU", why),
    ),
    ram.match(
      (m) => memSegment("RAM", m),
      (why) => naSegment("RAM", why),
    ),
    ...(vram === undefined
      ? []
      : [
          vram.match(
            (m) => memSegment("VRAM", m),
            (why) => naSegment("VRAM", why),
          ),
        ]),
    ...disks.match(
      (ds) => ds.map((disk) => diskSegment(disk)),
      (why) => [naSegment("Disk", why)],
    ),
  ];
  return parts.join(roles.separator());
}

/** Every Sys reading, each a value or the reason it could not be taken (EXPLICIT-ABSENCE). */
export interface HostLoad {
  cpuPct: Result<number, string>;
  ram: Result<MemReading, string>;
  vram: Result<MemReading, string> | undefined; // undefined: this host has no discrete VRAM
  disks: Result<DiskEntry[], string>;
}
// Sync host-load API remains for the standalone `s` command; statusline uses readHostLoadAsync.
export function readHostLoad(): HostLoad {
  return {
    cpuPct: cpuPct(),
    ram: ramFrac(),
    vram: vramGated(),
    disks: diskReadings(),
  };
}
/** Async render-path sample; host readings run independently and retain explicit unknowns. */
export async function readHostLoadAsync(): Promise<Omit<HostLoad, "disks">> {
  const [cpu, ram, vram] = await Promise.all([
    cpuPctAsync(),
    ramFracAsync(),
    vramGatedAsync(),
  ]);
  return { cpuPct: cpu, ram, vram };
}
async function readCpuSampleAsync(): Promise<Result<CpuSample, string>> {
  if (process.platform === "darwin") return macCpuSample();
  const raw = await readFile("/proc/stat", "utf8").catch(() => null);
  if (raw === null) return err("no /proc/stat");
  const line = raw.split("\n").find((part) => part.startsWith("cpu "));
  if (line === undefined || line === "")
    return err("/proc/stat has no cpu line");
  const fields = line.trim().split(/\s+/u).slice(1).map(Number);
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
  const total = fields.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Number.isFinite(idle) && total > 0
    ? ok({ total, idle })
    : err("/proc/stat cpu line unparsable");
}
async function cpuPctAsync(): Promise<Result<number, string>> {
  const sampled = await readCpuSampleAsync();
  if (sampled.isErr()) return err(sampled.error);
  const sample = sampled.value;
  const now = Temporal.Now.instant().epochMilliseconds;
  const prev = await readJsonAsync(CPU_CACHE, CpuSampleSchema);
  const keep =
    prev?.at !== undefined && within(prev.at, now, CPU_BASELINE_MIN_MS);
  if (!keep) await writeCacheAsync(CPU_CACHE, { ...sample, at: now });
  if (prev === undefined) return err("no earlier sample to diff against");
  if (prev.at === undefined || !within(prev.at, now, CPU_BASELINE_MAX_MS))
    return err("no earlier sample from the last 60s");
  const dTotal = sample.total - prev.total;
  const dIdle = sample.idle - prev.idle;
  if (dTotal <= 0) return err("no ticks since the last sample");
  return ok(Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)));
}
async function ramFracAsync(): Promise<Result<MemReading, string>> {
  if (process.platform === "darwin") {
    const rawResult = await execAsyncBounded("vm_stat", "vm_stat", [], 2000);
    if (rawResult.isErr()) return err(rawResult.error.why);
    const raw = rawResult.value;
    const size = raw.match(/page size of (\d+) bytes/u)?.[1];
    const pages = (label: string): number | undefined => {
      const line = raw.split("\n").find((part) => part.startsWith(`${label}:`));
      const value = VmStatPage.safeParse(
        line?.split(/\s+/u).pop()?.replace(/\.$/u, ""),
      );
      return value.success ? value.data : undefined;
    };
    const wired = pages("Pages wired down");
    const compressed = pages("Pages occupied by compressor");
    const anonymous = pages("Anonymous pages");
    const purgeable = pages("Pages purgeable");
    if (
      size === undefined ||
      wired === undefined ||
      compressed === undefined ||
      anonymous === undefined ||
      purgeable === undefined
    )
      return err("vm_stat output unparsable");
    const usedBytes =
      (wired + compressed + Math.max(0, anonymous - purgeable)) * Number(size);
    const reading = memReading(usedBytes / 1024 ** 3, totalmem() / 1024 ** 3);
    return reading === undefined
      ? err("vm_stat output unparsable")
      : ok(reading);
  }
  const raw = await readFile("/proc/meminfo", "utf8").catch(() => null);
  if (raw === null) return err("no /proc/meminfo");
  let totalKb: number | undefined;
  let availKb: number | undefined;
  for (const line of raw.split("\n")) {
    if (line.startsWith("MemTotal:")) totalKb = Number(line.split(/\s+/u)[1]);
    else if (line.startsWith("MemAvailable:"))
      availKb = Number(line.split(/\s+/u)[1]);
    if (totalKb !== undefined && availKb !== undefined) break;
  }
  if (totalKb === undefined || availKb === undefined)
    return err("meminfo lacks MemTotal/MemAvailable");
  const cgPaths = [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory.current",
    "/sys/fs/cgroup/memory.stat",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    "/sys/fs/cgroup/memory/memory.stat",
  ];
  const cgTexts = await Promise.all(
    cgPaths.map((path) => readFile(path, "utf8").catch(() => null)),
  );
  const cgMap = new Map<string, string>();
  cgTexts.forEach((text, index) => {
    const path = cgPaths[index];
    if (text !== null && path !== undefined) cgMap.set(path, text);
  });
  const cg = cgroupMemory((path) => cgMap.get(path), totalKb * 1024);
  if (cg !== undefined) {
    const capped = memReading(
      cg.usedBytes / 1024 ** 3,
      cg.limitBytes / 1024 ** 3,
    );
    return capped === undefined
      ? err("cgroup memory unparsable")
      : ok({ ...capped, frac: `${capped.frac} cgroup` });
  }
  const reading = memReading(
    (totalKb - availKb) / 1024 / 1024,
    totalKb / 1024 / 1024,
  );
  return reading === undefined ? err("meminfo unparsable") : ok(reading);
}
async function vramFracAsync(): Promise<Result<MemReading, string>> {
  if ((await findGpuExecutableAsync()) === undefined)
    return err("no nvidia-smi");
  const cached: GpuCache =
    (await readJsonAsync(GPU_CACHE, GpuCacheSchema)) ?? {};
  const now = Temporal.Now.instant().epochMilliseconds;
  const fresh =
    cached.at !== undefined &&
    within(cached.at, now, GPU_SAMPLE_TTL_MS) &&
    ((cached.reading !== null && cached.reading !== undefined) ||
      cached.why !== undefined);
  if (fresh && cached.reading !== null && cached.reading !== undefined)
    return ok(cached.reading);
  const started = fresh ? ok(undefined) : await ensureSamplerAsync();
  const why = started.isErr() ? started.error : (cached.why ?? SAMPLING_WHY);
  const good = cached.good;
  if (good !== undefined && within(good.at, now, GPU_STALE_MAX_MS)) {
    const secs = Math.round((now - good.at) / 1000);
    return ok({ ...good.reading, stale: { secs, why } });
  }
  return err(why);
}
async function vramGatedAsync(): Promise<
  Result<MemReading, string> | undefined
> {
  const vram = await vramFracAsync();
  return process.platform === "darwin" &&
    vram.isErr() &&
    vram.error === "no nvidia-smi"
    ? undefined
    : vram;
}
/** The Sys row exactly as the statusline prints it. */
export function sysRow(h: HostLoad): string {
  return `${ESC}[38;5;74mSys:${RST} ${sysSegment(h.cpuPct, h.ram, h.vram, h.disks)}`;
}

// Standalone (`s`): one row, now. A render reads what the last render left (CPU needs a baseline,
// VRAM a finished sample), so the first read of a cold host would be all n/a; a person asking
// "now" waits for both, boundedly — never longer than one GPU sample, and whatever is still
// missing then prints as n/a with its reason.
async function main(): Promise<void> {
  const first = readHostLoad();
  const cold = first.cpuPct.isErr() || (first.vram?.isErr() ?? false);
  if (!cold) {
    process.stdout.write(`${sysRow(first)}\n`);
    return;
  }
  const deadline = performance.now() + GPU_SAMPLE_TIMEOUT_MS;
  await Bun.sleep(500);
  while (existsSync(GPU_LOCK) && performance.now() < deadline)
    await Bun.sleep(100);
  process.stdout.write(`${sysRow(readHostLoad())}\n`);
}

// Sampler mode (started by ensureSampler with SAMPLE_ENV): one GPU sample, then exit.
if (process.env[SAMPLE_ENV] === "1") process.exit(await runSampler());
if (import.meta.main) await main();
