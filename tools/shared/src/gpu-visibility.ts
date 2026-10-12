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

export type GpuProbeResult =
  | { kind: "visible" }
  | { kind: "timeout" }
  | { kind: "absent"; exitCode: number | null; stderr?: string };

export function probeGpuVisibility(
  input: {
    requested: boolean;
    executableFound: boolean;
    path: string | undefined;
    isWsl: boolean;
  },
  probe: () => GpuProbeResult,
  delay: (milliseconds: number) => void = (milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  },
): string | undefined {
  if (!input.requested) return undefined;
  const missingTool = missingGpuToolDenial(input);
  if (missingTool !== undefined) return missingTool;

  let result: GpuProbeResult = { kind: "timeout" };
  const backoffMs = [100, 250, 500];
  for (const [index, waitMs] of backoffMs.entries()) {
    result = probe();
    if (result.kind === "visible") return undefined;
    if (index < backoffMs.length - 1) delay(waitMs);
  }
  if (result.kind === "timeout")
    return "GPU not visible in this unit: nvidia-smi probe timed out after 3 attempts";
  return (
    `GPU not visible in this unit: nvidia-smi reported no visible GPU after 3 attempts (exit=${result.exitCode ?? "unknown"})` +
    (result.stderr === undefined || result.stderr === ""
      ? ""
      : `; stderr=${JSON.stringify(result.stderr)}`)
  );
}
