import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export type SandboxProbeResult = Readonly<{
  sandboxBus: boolean;
  hostBus: boolean;
  sandboxGpu: boolean;
  hostGpu: boolean;
}>;

export type SandboxProbe = (sandbox: string) => SandboxProbeResult;

let cached: SandboxProbeResult | undefined;

/** Probe a trivial command using the same sandbox mode Codex will use, once per process. */
export function probeSandboxResources(
  sandbox: string,
  run: (command: string, sandbox?: string) => boolean = defaultProbeCommand,
  hostBus: () => boolean = hostBusReachable,
  hostGpu: (path: string) => boolean = existsSync,
): SandboxProbeResult {
  if (cached !== undefined) return cached;
  const wsl = process.env.WSL_DISTRO_NAME !== undefined;
  const gpuPath = wsl ? "/dev/dxg" : "/dev/nvidia0";
  cached = {
    sandboxBus: run(
      'systemctl --user is-system-running || test -S "$XDG_RUNTIME_DIR/bus"',
      sandbox,
    ),
    hostBus: hostBus(),
    sandboxGpu: !hostGpu(gpuPath) || run(`test -e ${gpuPath}`, sandbox),
    hostGpu: hostGpu(gpuPath),
  };
  return cached;
}

export function resetSandboxProbeCacheForTests(): void {
  cached = undefined;
}

function hostBusReachable(): boolean {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime !== undefined && existsSync(`${runtime}/bus`)) return true;
  return (
    spawnSync("systemctl", ["--user", "is-system-running"], {
      stdio: "ignore",
      timeout: 2_000,
    }).status === 0
  );
}

function defaultProbeCommand(command: string, sandbox?: string): boolean {
  const result = spawnSync(
    process.env.AGENT_DISPATCH_CODEX_BIN ?? "codex",
    ["exec", "--sandbox", sandbox ?? "read-only", "--", command],
    { stdio: "ignore", timeout: 5_000 },
  );
  return result.status === 0;
}

export function sandboxResourceFallback(
  result: SandboxProbeResult,
): "bus" | "gpu device" | undefined {
  if (result.hostBus && !result.sandboxBus) return "bus";
  if (result.hostGpu && !result.sandboxGpu) return "gpu device";
  return undefined;
}

export function resourceBriefFallback(
  brief: string,
  sandbox: string,
  probe: SandboxProbe = probeSandboxResources,
): "bus" | "gpu device" | undefined {
  return /RESOURCE-ENVELOPE\s*\(/iu.test(brief)
    ? sandboxResourceFallback(probe(sandbox))
    : undefined;
}
