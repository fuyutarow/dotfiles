import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "./zod.ts";
import type { DiskEntry } from "./storage.ts";

const GiB = 1024 ** 3;
const WINDOW_MS = 300_000;
const MIN_WINDOW_MS = 30_000;
const SAMPLE_MS = 5_000;
const MAX_SAMPLES = 61;

const SampleSchema = z.object({
  at: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
});
export const DiskRateStateSchema = z.object({
  schema: z.literal(1),
  drives: z.record(
    z.string(),
    z.object({
      totalBytes: z.number().nonnegative(),
      samples: z.array(SampleSchema).max(MAX_SAMPLES),
    }),
  ),
});
export type DiskRateState = z.output<typeof DiskRateStateSchema>;
type Sample = z.output<typeof SampleSchema>;

export function diskRateStatePath(): string {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
    "statusline",
    "disk-rate.json",
  );
}

// Least-squares over five minutes smooths short bursts without keeping an unbounded history.
// Five-second spacing preserves the >=30s baseline even when renders arrive every second.
// Centre both axes near zero to avoid subtracting enormous epoch/byte products.
function fillRate(samples: Sample[]): number | undefined {
  const first = samples[0];
  const last = samples.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    last.at - first.at < MIN_WINDOW_MS
  )
    return undefined;
  const points = samples.map((s) => ({
    x: (s.at - first.at) / 60_000,
    y: (s.freeBytes - first.freeBytes) / GiB,
  }));
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const variance = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  const covariance = points.reduce(
    (sum, p) => sum + (p.x - meanX) * (p.y - meanY),
    0,
  );
  return variance > 0 ? -covariance / variance : undefined;
}

export function updateDiskRates(
  entries: DiskEntry[],
  previous: DiskRateState | undefined,
  now: number,
): { entries: DiskEntry[]; state: DiskRateState } {
  const state: DiskRateState = { schema: 1, drives: {} };
  const updated = entries.map((d): DiskEntry => {
    if (d.kind === "miss" || d.path === undefined) return d;
    const totalBytes = d.totalG * GiB;
    const prior = previous?.drives[d.path];
    let samples = (prior?.totalBytes === totalBytes ? prior.samples : [])
      .filter((s) => s.at <= now && now - s.at <= WINDOW_MS)
      .toSorted((a, b) => a.at - b.at);
    const latest = samples.at(-1);
    // A backwards clock step or an expired window begins a new baseline.
    if (prior?.samples.some((s) => s.at > now) === true) samples = [];
    const current = { at: now, freeBytes: d.freeG * GiB };
    const append =
      latest === undefined ||
      now - latest.at >= SAMPLE_MS ||
      samples.length === 0;
    const measured = [...samples.filter((s) => s.at < now), current].slice(
      -MAX_SAMPLES,
    );
    state.drives[d.path] = {
      totalBytes,
      samples: append ? measured : samples,
    };
    // Keys for removed/unreadable drives are discarded on every write.
    return { ...d, rateGibPerMin: fillRate(measured) };
  });
  return { entries: updated, state };
}
