import { gpuStateFailure, readGpuState } from "./gpu-samples.ts";
export function missingGpuToolMessage(
  path: string | undefined,
  isWsl: boolean,
): string {
  return `GPU not visible in this unit: nvidia-smi not found on PATH=${path ?? ""}${isWsl ? "; expected /usr/lib/wsl/lib" : ""}`;
}

export function missingGpuToolDenial(input: {
  requested: boolean;
  executableFound: boolean;
  path: string | undefined;
  isWsl: boolean;
}): string | undefined {
  return input.requested && !input.executableFound
    ? missingGpuToolMessage(input.path, input.isWsl)
    : undefined;
}

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
