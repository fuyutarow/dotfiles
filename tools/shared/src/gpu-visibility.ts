import { gpuStateFailure, readGpuState } from "./gpu-samples.ts";
/** Visibility is a freshness-bounded observation, never an active driver probe. */
export async function probeGpuVisibility(input: {
  requested: boolean;
  statePath?: string;
}): Promise<string | undefined> {
  if (!input.requested) return undefined;
  const state = await readGpuState(input.statePath);
  const why = gpuStateFailure(state);
  if (why !== undefined) return `GPU visibility unavailable: ${why}`;
  return state !== undefined && state.devices.length > 0
    ? undefined
    : "GPU absent in sampler state";
}
