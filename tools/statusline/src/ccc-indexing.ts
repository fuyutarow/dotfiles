// Replaces detect-ccc-gpu-hold's prompt/Bash advisory. In September 2026, catch-up indexing
// held the GPU for over an hour: generated records, archives and frozen copies dominated
// index scope. A long index is useful context for GPU contention and include/exclude review.
// Idle model residency is acceptable; never suggest stopping ccc. GPU utilisation is host-wide,
// especially on WSL, and is not attributed to the daemon by this badge.
// Only the existing GPU sampler calls this module. Renderer reads its cached observation.
// A streak means consecutive observations, not continuous measurement between probes.
import { readFile } from "node:fs/promises";
import { findGpuExecutableAsync } from "../../shared/src/gpu-samples.ts";
import {
  execAsyncWithin,
  readJsonAsync,
  within,
  writeCacheAsync,
} from "./bounded.ts";
import { z } from "./zod.ts";

export const CCC_PROBE_TTL_MS = 60_000;
export const CCC_INDEX_THRESHOLD_MS = 15 * 60_000;
export const CccIndexSchema = z.object({
  at: z.number().int().nonnegative(),
  pid: z.number().int().positive().nullable(),
  since: z.number().int().nonnegative().nullable(),
});
export type CccIndex = z.output<typeof CccIndexSchema>;

export function cccObservation(
  previous: CccIndex | undefined,
  pid: number | null,
  indexing: boolean,
  now: number,
): CccIndex {
  const continuing =
    previous !== undefined &&
    previous.pid === pid &&
    previous.since !== null &&
    previous.since <= now &&
    within(previous.at, now, CCC_PROBE_TTL_MS + 30_000);
  let since: number | null = null;
  if (pid !== null && indexing) since = continuing ? previous.since : now;
  return { at: now, pid, since };
}

export function cccBadge(
  observation: CccIndex | undefined,
  now: number,
): string | undefined {
  if (
    observation === undefined ||
    observation.pid === null ||
    observation.since === null ||
    !within(observation.at, now, CCC_PROBE_TTL_MS + 15_000)
  )
    return undefined;
  const elapsed = now - observation.since;
  return elapsed > CCC_INDEX_THRESHOLD_MS
    ? `ccc indexing ${Math.floor(elapsed / 60_000)}m`
    : undefined;
}

type Options = {
  cachePath: string;
  nvidia?: string;
  ccc?: string;
  procRoot?: string;
  now?: () => number;
  boundMs?: number;
};

async function daemonPid(options: Options): Promise<number | null> {
  const nvidia = options.nvidia ?? (await findGpuExecutableAsync());
  if (nvidia === undefined) return null;
  const apps = await execAsyncWithin(
    "nvidia-smi",
    nvidia,
    ["--query-compute-apps=pid", "--format=csv,noheader"],
    options.boundMs ?? 2_000,
  );
  if (apps.isErr()) return null;
  // Bound /proc reads even if a driver reports a pathological number of processes.
  const candidates = apps.value.slice(0, 65_536).split("\n").slice(0, 256);
  for (const candidate of candidates) {
    const parsed = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(candidate.trim());
    if (!parsed.success) continue;
    const cmdline = await readFile(
      `${options.procRoot ?? "/proc"}/${parsed.data}/cmdline`,
      "utf8",
    ).catch(() => "");
    if (/\bccc run-daemon\b/u.test(cmdline.replaceAll("\0", " ")))
      return parsed.data;
  }
  return null;
}

async function isIndexing(
  options: Options,
  pid: number | null,
): Promise<boolean> {
  if (pid === null) return false;
  const status = await execAsyncWithin(
    "ccc",
    options.ccc ?? "ccc",
    ["daemon", "status"],
    options.boundMs ?? 2_000,
  );
  return status.isOk() && status.value.includes("[indexing]");
}
/** Two bounded probes, cached including failures; called under the existing sampler lock. */
export async function sampleCccIndexing(options: Options): Promise<CccIndex> {
  const clock = options.now ?? (() => Temporal.Now.instant().epochMilliseconds);
  const previous = await readJsonAsync(options.cachePath, CccIndexSchema);
  const now = clock();
  if (previous !== undefined && within(previous.at, now, CCC_PROBE_TTL_MS))
    return previous;
  const pid = await daemonPid(options);
  const indexing = await isIndexing(options, pid);
  const observation = cccObservation(previous, pid, indexing, clock());
  await writeCacheAsync(options.cachePath, observation);
  return observation;
}
