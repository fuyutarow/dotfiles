import {
  CCC_PROBE_TTL_MS,
  CccIndexSchema,
  type CccIndex,
} from "./ccc-model.ts";
export {
  CCC_PROBE_TTL_MS,
  CCC_INDEX_THRESHOLD_MS,
  CccIndexSchema,
  cccBadge,
} from "./ccc-model.ts";
export type { CccIndex } from "./ccc-model.ts";
// Replaces detect-ccc-gpu-hold's prompt/Bash advisory. In September 2026, catch-up indexing
// held the GPU for over an hour: generated records, archives and frozen copies dominated
// index scope. A long index is useful context for GPU contention and include/exclude review.
// Idle model residency is acceptable; never suggest stopping ccc. GPU utilisation is host-wide,
// especially on WSL, and is not attributed to the daemon by this badge.
// Only the existing GPU sampler calls this module. Renderer reads its cached observation.
// A streak means consecutive observations, not continuous measurement between probes.
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gpuStateFailure,
  readGpuState,
} from "@dotfiles/shared/src/gpu-samples.ts";
import {
  execAsyncWithin,
  readJsonAsync,
  within,
  writeCacheAsync,
} from "./bounded.ts";
import { z } from "./zod.ts";

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

type Options = {
  cachePath: string;
  statePath?: string;
  ccc?: string;
  procRoot?: string;
  now?: () => number;
  boundMs?: number;
  policyStatusPaths?: string[];
};

const PolicyStatusSchema = z.object({
  at: z.number().int().nonnegative(),
  pid: z.number().int().positive(),
  deferring: z.boolean(),
  reason: z.string().nullable(),
});

function policyStatusPaths(): string[] {
  const runtime = process.env["XDG_RUNTIME_DIR"];
  const uid = process.getuid?.() ?? "unknown";
  const directories = [
    join(tmpdir(), `agent-resource-control-${uid}`),
    `/run/user/${uid}/agent-resource-control`,
  ];
  if (runtime !== undefined && runtime.startsWith("/"))
    directories.push(join(runtime, "agent-resource-control"));
  return [...new Set(directories)].map((directory) =>
    join(directory, "ccc-gpu-status.json"),
  );
}

async function daemonPid(options: Options): Promise<number | null> {
  const state = await readGpuState(options.statePath);
  if (
    state === undefined ||
    gpuStateFailure(state, options.now?.()) !== undefined
  )
    return null;
  for (const candidate of state.processes.slice(0, 256)) {
    const cmdline = await readFile(
      `${options.procRoot ?? "/proc"}/${candidate.pid}/cmdline`,
      "utf8",
    ).catch(() => "");
    if (
      /\bccc run-daemon\b|\bccc-daemon-launch\.py(?:\s|$)/u.test(
        cmdline.replaceAll("\0", " "),
      )
    )
      return candidate.pid;
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
  // Read the launcher's policy signal even when ccc has no NVIDIA context (CPU fallback).
  // A crashed/idle writer's observation expires; never turn old state into a live warning.
  const paths = options.policyStatusPaths ?? policyStatusPaths();
  const policies = await Promise.all(
    paths.map((path) => readJsonAsync(path, PolicyStatusSchema)),
  );
  const policy = policies
    .filter((item) => item !== undefined)
    .filter((item) => within(item.at, now, CCC_PROBE_TTL_MS + 15_000))
    .toSorted((a, b) => b.at - a.at)[0];
  if (
    policy !== undefined &&
    policy.deferring &&
    policy.reason !== null &&
    within(policy.at, now, CCC_PROBE_TTL_MS + 15_000)
  ) {
    const observation = {
      at: policy.at,
      pid: policy.pid,
      since: null,
      deferring: policy.reason,
    };
    await writeCacheAsync(options.cachePath, observation);
    return observation;
  }
  // A cached deferral cannot outlive or override its launcher's current policy state.
  if (previous?.deferring !== undefined) previous.deferring = undefined;
  if (previous !== undefined && within(previous.at, now, CCC_PROBE_TTL_MS))
    return previous;
  const pid = await daemonPid(options);
  const indexing = await isIndexing(options, pid);
  const observation = cccObservation(previous, pid, indexing, clock());
  await writeCacheAsync(options.cachePath, observation);
  return observation;
}
