#!/usr/bin/env bun
// Sole nvidia-smi owner. Run this foreground entrypoint under the host's supervisor.
// Recover a crashed owner only after /proc proves both owner and driver absent.
// Retired owner directories prevent delayed reclaimers from moving a successor lock.
import { attempt, attemptOr } from "./attempt.ts";
import { z, jsonOf } from "./zod.ts";
import { cli } from "cleye";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  rm,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  GPU_INTERVAL_MS,
  GpuDeviceSchema,
  GpuProcessSchema,
  MAX_BYTES,
  RETAIN_MS,
  gpuStatePath,
  readGpuState,
  type GpuState,
} from "./gpu-samples.ts";

const tag = (xml: string, name: string): string | undefined =>
  new RegExp(`<${name}>([^<]*)</${name}>`, "u").exec(xml)?.[1]?.trim();
const section = (xml: string, name: string): string =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "u").exec(xml)?.[1] ?? "";
function quantity(text: string | undefined, unit: string): number | undefined {
  if (
    text === undefined ||
    !new RegExp(`^\\d+(?:\\.\\d+)?\\s*${unit}$`, "u").test(text)
  )
    return undefined;
  return Number(text.slice(0, -unit.length).trim());
}
function parseProcesses(body: string): GpuState["processes"] | undefined {
  const processes: GpuState["processes"] = [];
  for (const row of section(body, "processes").matchAll(
    /<process_info>([\s\S]*?)<\/process_info>/gu,
  )) {
    const processXml = row[1] ?? "";
    const pid = tag(processXml, "pid");
    const parsed = GpuProcessSchema.safeParse({
      pid: pid !== undefined && /^\d+$/u.test(pid) ? Number(pid) : undefined,
      usedMiB: quantity(tag(processXml, "used_memory"), "MiB") ?? null,
    });
    if (!parsed.success) return undefined;
    processes.push(parsed.data);
  }
  return processes;
}
/** One XML snapshot includes all devices and compute processes without a second probe. */
export function parseGpuXml(
  xml: string,
): Pick<GpuState, "devices" | "processes"> | undefined {
  if (!xml.includes("<nvidia_smi_log>")) return undefined;
  const devices: GpuState["devices"] = [];
  const processes: GpuState["processes"] = [];
  for (const match of xml.matchAll(/<gpu\s+id="[^"]*">([\s\S]*?)<\/gpu>/gu)) {
    const body = match[1] ?? "";
    const memory = section(body, "fb_memory_usage");
    const minor = tag(body, "minor_number");
    const device = GpuDeviceSchema.safeParse({
      id:
        minor !== undefined && /^\d+$/u.test(minor)
          ? Number(minor)
          : devices.length,
      totalMiB: quantity(tag(memory, "total"), "MiB"),
      usedMiB: quantity(tag(memory, "used"), "MiB"),
      utilPct: quantity(tag(section(body, "utilization"), "gpu_util"), "%"),
      powerWatts: quantity(tag(body, "power_draw"), "W"),
    });
    if (!device.success) return undefined;
    devices.push(device.data);
    const parsedProcesses = parseProcesses(body);
    if (parsedProcesses === undefined) return undefined;
    processes.push(...parsedProcesses);
  }
  return devices.length > 0 ? { devices, processes } : undefined;
}

/** Include zombies and D-state tasks. Never infer that timeout or SIGKILL reaped a child. */
export async function hostHasNvidiaSmi(procRoot = "/proc"): Promise<boolean> {
  if (process.platform !== "linux") return true; // no verified host process inventory: fail closed
  const names = await readdir(procRoot);
  const rows = await Promise.all(
    names
      .filter((n) => /^\d+$/u.test(n))
      .map(async (pid) => {
        const observed = await attempt(async () => {
          const [comm, cmdline] = await Promise.all([
            readFile(join(procRoot, pid, "comm"), "utf8"),
            readFile(join(procRoot, pid, "cmdline"), "utf8").catch(() => ""),
          ]);
          const argv = cmdline.split("\0");
          return (
            comm.trim() === "nvidia-smi" ||
            argv.slice(0, 2).some((arg) => basename(arg) === "nvidia-smi")
          );
        });
        if (observed.ok) return observed.value;
        const error = z.object({ code: z.string() }).safeParse(observed.error);
        return !error.success || error.data.code !== "ENOENT";
      }),
  );
  return rows.some(Boolean);
}
async function executable(
  path = process.env.PATH ?? "",
  fallbacks = ["/usr/lib/wsl/lib/nvidia-smi", "/usr/bin/nvidia-smi"],
): Promise<string | undefined> {
  for (const candidate of [
    ...path
      .split(":")
      .filter(Boolean)
      .map((p) => join(p, "nvidia-smi")),
    ...fallbacks,
  ]) {
    if (
      await access(candidate, constants.X_OK).then(
        () => true,
        () => false,
      )
    )
      return candidate;
  }
  return undefined;
}
async function writeState(path: string, state: GpuState): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await using _temp = {
    [Symbol.asyncDispose]: () => unlink(temp).catch(() => {}),
  };
  await Bun.write(temp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temp, path);
}
async function boundedOutput(
  stream: ReadableStream<Uint8Array>,
): Promise<string | undefined> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) return Buffer.concat(chunks).toString();
    size += result.value.length;
    if (size > MAX_BYTES) {
      void reader.cancel();
      return undefined;
    }
    chunks.push(result.value);
  }
}
const OwnerSchema = z.object({
  pid: z.number().int().positive(),
  token: z.uuid(),
});
async function ownerPidGone(pid: number): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const result = await attempt(() => access(`/proc/${pid}`));
  if (result.ok) return false;
  const error = z.object({ code: z.string() }).safeParse(result.error);
  return error.success && error.data.code === "ENOENT";
}
async function acquireOwner(
  lock: string,
  procRoot?: string,
): Promise<(() => Promise<void>) | undefined> {
  const token = randomUUID();
  const candidate = `${lock}.candidate-${token}`;
  await mkdir(candidate, { mode: 0o700 });
  await using _candidate = {
    [Symbol.asyncDispose]: () =>
      rm(candidate, { recursive: true, force: true }),
  };
  await Bun.write(
    join(candidate, "owner.json"),
    JSON.stringify({ pid: process.pid, token }),
    { mode: 0o600 },
  );
  const take = () =>
    rename(candidate, lock).then(
      () => true,
      () => false,
    );
  const exists = await access(lock).then(
    () => true,
    () => false,
  );
  if (exists || !(await take())) {
    const text = await Bun.file(join(lock, "owner.json"))
      .text()
      .catch(() => "");
    const owner = jsonOf(OwnerSchema).safeParse(text);
    if (!owner.success || !(await ownerPidGone(owner.data.pid)))
      return undefined;
    if (await hostHasNvidiaSmi(procRoot)) return undefined;
    // All reclaimers of this owner use ONE nonempty destination. Keep it: a delayed
    // reclaimer must fail even if a successor has already acquired the live path.
    const retired = `${lock}.dead-${owner.data.token}`;
    const moved = await rename(lock, retired).then(
      () => true,
      () => false,
    );
    if (!moved || !(await take())) return undefined;
  }
  return async () => {
    // Move our directory off the live path before deleting its owner record.
    await rename(lock, candidate);
    await rm(candidate, { recursive: true, force: true });
  };
}
export type SamplerOptions = {
  statePath?: string;
  path?: string;
  fallbacks?: string[];
  timeoutMs?: number;
  /** Consecutive missed probe deadlines required before recording a GPU stall. */
  stallMisses?: number;
  procRoot?: string;
  now?: () => number;
};

export type GpuSamplerCheckOptions = {
  statePath?: string;
  procRoot?: string;
};

type ProcFinding = {
  dxgTasks: string[];
  zombies: Set<number>;
  errors: string[];
};

let hasUnknownFlag = false;
function rejectPrototypeFlag(type: string, _flag: string): boolean {
  if (type !== "unknown-flag") return false;
  hasUnknownFlag = true;
  return true;
}

function processState(statText: string): string | undefined {
  // comm is parenthesized and may itself contain spaces or closing parentheses.
  return /^\d+ \(.*\) ([A-Z]) /u.exec(statText)?.[1];
}

async function inspectProcesses(procRoot: string): Promise<ProcFinding> {
  const finding: ProcFinding = { dxgTasks: [], zombies: new Set(), errors: [] };
  if (process.platform !== "linux") {
    finding.errors.push("process inventory is available only on Linux");
    return finding;
  }
  const inventory = await attempt(() => readdir(procRoot));
  if (!inventory.ok) {
    finding.errors.push(`cannot read ${procRoot}: ${String(inventory.error)}`);
    return finding;
  }
  await Promise.all(
    inventory.value
      .filter((name) => /^\d+$/u.test(name))
      .map(async (pidText) => {
        const pid = Number(pidText);
        const stat = await attempt(() =>
          readFile(join(procRoot, pidText, "stat"), "utf8"),
        );
        if (!stat.ok) {
          const code = z.object({ code: z.string() }).safeParse(stat.error);
          if (code.success && code.data.code === "ENOENT") return;
          finding.errors.push(
            `cannot read ${procRoot}/${pidText}/stat: ${String(stat.error)}`,
          );
          return;
        }
        const state = processState(stat.value);
        if (state === undefined) {
          finding.errors.push(`cannot parse ${procRoot}/${pidText}/stat`);
          return;
        }
        if (state === "Z") finding.zombies.add(pid);
        if (state !== "D") return;
        const waitChannel = await attempt(() =>
          readFile(join(procRoot, pidText, "wchan"), "utf8"),
        );
        if (!waitChannel.ok) {
          const code = z
            .object({ code: z.string() })
            .safeParse(waitChannel.error);
          if (!code.success || code.data.code !== "ENOENT")
            finding.errors.push(
              `cannot read ${procRoot}/${pidText}/wchan: ${String(waitChannel.error)}`,
            );
          return;
        }
        const wchan = waitChannel.value.trim();
        if (/dxg/iu.test(wchan))
          finding.dxgTasks.push(
            `${pid} (wchan ${wchan !== "" ? wchan : "unknown"})`,
          );
        else if (wchan === "" || wchan === "0")
          finding.errors.push(
            `cannot identify wait channel for D-state process ${pid}`,
          );
      }),
  );
  return finding;
}

/** Read-only recovery gate. Every condition is independently reported for the owner. */
export async function checkGpuSampler(
  options: GpuSamplerCheckOptions = {},
): Promise<{ ok: boolean; failures: string[] }> {
  const path = options.statePath ?? gpuStatePath();
  const procRoot = options.procRoot ?? "/proc";
  const [state, proc] = await Promise.all([
    readGpuState(path),
    inspectProcesses(procRoot),
  ]);
  const failures: string[] = [];

  if (proc.dxgTasks.length > 0)
    failures.push(`D-state process(es) in dxg: ${proc.dxgTasks.join(", ")}`);
  if (proc.errors.length > 0)
    failures.push(`process inventory incomplete: ${proc.errors.join("; ")}`);

  if (state === undefined) {
    failures.push(
      `GPU sampler state unavailable or invalid: ${path}`,
      "cannot verify GPU-holding zombies without a valid GPU sampler state",
      "last GPU probe did not succeed (state unavailable)",
      "cannot verify unresponsiveSince without a valid GPU sampler state",
    );
  } else {
    const gpuZombies = state.processes
      .map((gpuProcess) => gpuProcess.pid)
      .filter((pid) => proc.zombies.has(pid));
    if (gpuZombies.length > 0)
      failures.push(`GPU-holding zombie process(es): ${gpuZombies.join(", ")}`);
    if (proc.errors.length > 0 && state.processes.length > 0)
      failures.push(
        "cannot fully verify GPU-holding zombies because process inventory is incomplete",
      );
    if (
      state.sampledAt === undefined ||
      state.sampledAt < state.attemptAt ||
      state.why !== undefined
    )
      failures.push(
        "last GPU probe did not succeed (latest attempt has no successful sample)",
      );
    if (state.unresponsiveSince !== undefined)
      failures.push(`unresponsiveSince is set (${state.unresponsiveSince})`);
  }
  return { ok: failures.length === 0, failures };
}

export async function runGpuSampler(
  options: SamplerOptions = {},
): Promise<string> {
  const path = options.statePath ?? gpuStatePath();
  const lock = `${path}.lock`;
  const clock = options.now ?? (() => Temporal.Now.instant().epochMilliseconds);
  await mkdir(dirname(path), { recursive: true });
  const release = await acquireOwner(lock, options.procRoot);
  if (release === undefined) return "refused: sampler lock exists";
  await using _lock = { [Symbol.asyncDispose]: release };
  return await attemptOr(async () => {
    const previous = await readGpuState(path);
    if (previous === undefined && (await Bun.file(path).exists()))
      return "refused: corrupt sampler state";
    const now = clock();
    const base: GpuState = previous ?? {
      schema: 1,
      attemptAt: 0,
      devices: [],
      processes: [],
      samples: [],
    };
    if (await hostHasNvidiaSmi(options.procRoot)) {
      const consecutiveProbeMisses = (base.consecutiveProbeMisses ?? 0) + 1;
      const stalled = consecutiveProbeMisses >= (options.stallMisses ?? 2);
      await writeState(path, {
        ...base,
        attemptAt: now,
        consecutiveProbeMisses,
        ...(stalled
          ? {
              unresponsiveSince: base.unresponsiveSince ?? now,
              stallEvidence: `${consecutiveProbeMisses} consecutive sampler starts found nvidia-smi still running`,
            }
          : { unresponsiveSince: undefined, stallEvidence: undefined }),
      });
      return stalled
        ? "unresponsive: nvidia-smi persists"
        : "slow sample: nvidia-smi exists";
    }
    // A future timestamp also refuses: clock rollback must not bypass the minimum interval.
    if (
      previous !== undefined &&
      now - Math.max(previous.attemptAt, previous.sampledAt ?? 0) <
        GPU_INTERVAL_MS
    )
      return "refused: 60s interval";
    const binary = await executable(options.path, options.fallbacks);
    if (binary === undefined) {
      await writeState(path, { ...base, attemptAt: now, why: "no nvidia-smi" });
      return "no nvidia-smi";
    }
    // Persist BEFORE spawn. A crash cannot erase the cooldown or make the old sample look live.
    const pending = {
      ...base,
      attemptAt: now,
    };
    await writeState(path, pending);
    const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
    const child = Bun.spawn([binary, "-q", "-x"], {
      stdout: "pipe",
      stderr: "ignore",
      signal,
      timeout: options.timeoutMs ?? 20_000,
      killSignal: "SIGKILL",
    });
    child.unref();
    const timedOut = new Promise<undefined>((resolve) => {
      signal.addEventListener(
        "abort",
        () => {
          resolve(undefined);
        },
        { once: true },
      );
    });
    const completed = Promise.all([boundedOutput(child.stdout), child.exited])
      .then(([output, exit]) =>
        exit === 0 && output !== undefined ? parseGpuXml(output) : undefined,
      )
      .catch(() => {});
    // Do not await exited after the deadline: an unkillable D-state process may never exit.
    const snapshot = await Promise.race([completed, timedOut]);
    if (snapshot === undefined || signal.aborted) {
      const consecutiveProbeMisses = (base.consecutiveProbeMisses ?? 0) + 1;
      const stallMisses = options.stallMisses ?? 2;
      const stalled = consecutiveProbeMisses >= stallMisses;
      await writeState(path, {
        ...pending,
        attemptAt: clock(),
        consecutiveProbeMisses,
        ...(stalled
          ? {
              unresponsiveSince: base.unresponsiveSince ?? clock(),
              stallEvidence: `${consecutiveProbeMisses} consecutive probe deadlines missed (deadline ${options.timeoutMs ?? 20_000} ms)`,
            }
          : { unresponsiveSince: undefined, stallEvidence: undefined }),
      });
      return stalled ? "unresponsive" : "slow sample";
    }
    const at = clock();
    const first = snapshot.devices[0];
    if (first === undefined) {
      const consecutiveProbeMisses = (base.consecutiveProbeMisses ?? 0) + 1;
      const stalled = consecutiveProbeMisses >= (options.stallMisses ?? 2);
      await writeState(path, {
        ...pending,
        attemptAt: at,
        consecutiveProbeMisses,
        ...(stalled
          ? {
              unresponsiveSince: base.unresponsiveSince ?? at,
              stallEvidence: `${consecutiveProbeMisses} consecutive invalid probe results`,
            }
          : { unresponsiveSince: undefined, stallEvidence: undefined }),
      });
      return stalled ? "unresponsive" : "slow sample";
    }
    const sample = {
      ts: at,
      nextTs: at + GPU_INTERVAL_MS,
      utilPct: first.utilPct,
      memUsedGiB: first.usedMiB / 1024,
      memTotalGiB: first.totalMiB / 1024,
    };
    await writeState(path, {
      schema: 1,
      attemptAt: now,
      sampledAt: at,
      consecutiveProbeMisses: 0,
      ...snapshot,
      samples: [
        ...base.samples.filter((s) => at - s.ts <= RETAIN_MS),
        sample,
      ].slice(-721),
    });
    return "sampled";
  }, "unresponsive");
}
async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "gpu-sampler",
      flags: {
        check: {
          type: Boolean,
          description: "Run the read-only recovery check",
        },
      },
      parameters: [],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (
    hasUnknownFlag ||
    Object.keys(parsed.unknownFlags).length > 0 ||
    parsed._.length > 0
  ) {
    process.stderr.write("Usage: bun gpu-sampler.ts [--check]\n");
    process.exitCode = 2;
    return;
  }
  if (parsed.flags.check === true) {
    await reportCheck();
    return;
  }
  const result = await attempt(() => runGpuSampler());
  if (result.ok) process.stdout.write(`${result.value}\n`);
  else {
    process.stderr.write(`GPU sampler: ${String(result.error)}\n`);
    process.exitCode = 1;
  }
}

async function reportCheck(): Promise<void> {
  const result = await checkGpuSampler();
  if (result.ok) {
    process.stdout.write("GPU sampler recovery check: OK\n");
  } else {
    emitFailures(result.failures);
    process.exitCode = 1;
  }
}

function emitFailures(failures: string[]): void {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`);
}

if (import.meta.main) await main();
