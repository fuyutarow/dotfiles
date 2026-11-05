import { hostname } from "node:os";
import { fromAsyncThrowable } from "neverthrow";
import type { ActionResult, Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";

export function isWslRuntime(facts: {
  platform: string;
  distroName: string | undefined;
  procVersion: string;
  interop: boolean;
}): boolean {
  return (
    facts.platform === "linux" &&
    (facts.distroName !== undefined ||
      facts.procVersion.toLowerCase().includes("microsoft") ||
      facts.interop)
  );
}

async function runningInWsl(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  const [versionResult, interop] = await Promise.all([
    fromAsyncThrowable(() => Bun.file("/proc/version").text())(),
    Bun.file("/proc/sys/fs/binfmt_misc/WSLInterop").exists(),
  ]);
  return isWslRuntime({
    platform: process.platform,
    distroName: process.env["WSL_DISTRO_NAME"],
    procVersion: versionResult.unwrapOr(""),
    interop,
  });
}

// The guest that runs the planner is itself the Windows host's WSL guest when
// interop reaches powershell.exe; probing ssh back to the host then only adds a
// second, unauthenticated path to the same disk.
const localInterop = (): boolean => Bun.which("powershell.exe") !== null;

export type Method = {
  name: "Optimize-VHD" | "diskpart";
  steps: (vhdx: string, distro: string) => string[];
};
export function pickMethod(optimize: boolean): Method {
  return optimize
    ? {
        name: "Optimize-VHD",
        steps: (v, d) => [
          "wsl.exe --shutdown",
          `wsl.exe --manage ${d} --set-sparse false`,
          `Optimize-VHD -Path "${v}" -Mode Full`,
        ],
      }
    : {
        name: "diskpart",
        steps: (v, d) => [
          "wsl.exe --shutdown",
          `wsl.exe --manage ${d} --set-sparse false`,
          `'select vdisk file="${v}"','attach vdisk readonly','compact vdisk','detach vdisk' | Set-Content -Encoding ASCII "$env:TEMP\\compact.txt"; diskpart /s "$env:TEMP\\compact.txt"`,
        ],
      };
}
export type VhdxRunner = (
  host: string,
  script: string,
  signal?: AbortSignal,
) => Promise<{ code: number; out: string; timedOut: boolean }>;

// The probe lists every WSL registration with its VHDX logical size. The distro
// is chosen in TypeScript (see resolveVhdx) so an unmatched name fails closed.
export const VHDX_PROBE = String.raw`$ErrorActionPreference='SilentlyContinue'; "optimize_vhd="+[bool](Get-Command Optimize-VHD -ErrorAction SilentlyContinue); foreach($k in Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'){$p=Get-ItemProperty $k.PSPath; if($p.DistributionName -and $p.BasePath){$b=$p.BasePath.TrimEnd('\'); "lxss="+$p.DistributionName+"|"+$b; $v=$b+'\ext4.vhdx'; if(Test-Path -LiteralPath $v){"lxss_logical="+$p.DistributionName+"|"+(Get-Item -LiteralPath $v).Length}}}`;
const encodedProbe = (): string =>
  Buffer.from(VHDX_PROBE, "utf16le").toString("base64");

async function capture(
  argv: string[],
  signal: AbortSignal | undefined,
): Promise<{ code: number; out: string; timedOut: boolean }> {
  const bounded =
    signal === undefined
      ? AbortSignal.timeout(5000)
      : AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    signal: bounded,
    killSignal: "SIGKILL",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    code,
    out: `${out}${err}`.replaceAll("\r", ""),
    timedOut: bounded.aborted,
  };
}

const sshRunner: VhdxRunner = async (host, script, signal) => {
  if (signal?.aborted === true)
    return { code: 1, out: "SSH probe cancelled", timedOut: false };
  if (Bun.which("ssh") === null)
    return { code: 127, out: "ssh executable unavailable", timedOut: false };
  const command =
    script === "$probe"
      ? `powershell.exe -NoProfile -EncodedCommand ${encodedProbe()}`
      : `bash -lc ${JSON.stringify(script)}`;
  return capture(
    [
      "ssh",
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectionAttempts=1",
      "-o",
      "ConnectTimeout=3",
      host,
      command,
    ],
    signal,
  );
};

// Local interop: powershell.exe for the probe, the guest's own shell for measurements.
const localRunner: VhdxRunner = async (_host, script, signal) => {
  if (signal?.aborted === true)
    return { code: 1, out: "local probe cancelled", timedOut: false };
  const argv =
    script === "$probe"
      ? ["powershell.exe", "-NoProfile", "-EncodedCommand", encodedProbe()]
      : ["bash", "-c", script];
  if (Bun.which(argv[0] ?? "") === null)
    return {
      code: 127,
      out: `${argv[0] ?? "command"} executable unavailable`,
      timedOut: false,
    };
  return capture(argv, signal);
};

const runner: VhdxRunner = (host, script, signal) =>
  host === "local"
    ? localRunner(host, script, signal)
    : sshRunner(host, script, signal);

export function probeFailure(
  r: { code: number; out: string; timedOut: boolean },
  host: string,
): string | null {
  const where = host === "local" ? "interop powershell.exe" : `ssh ${host}`;
  if (r.timedOut) return `cannot reach the host: ${where} timed out`;
  const said = r.out.trim().split("\n").slice(0, 5).join("\n  ");
  if (r.code !== 0)
    return `cannot reach the host: ${where} exited ${r.code}${said.length > 0 ? `:\n  ${said}` : ""}`;
  return said.length === 0
    ? `cannot reach the host: ${where} returned nothing`
    : null;
}

export type LxssProbe = {
  optimize: boolean;
  registrations: { name: string; base: string }[];
  logical: Map<string, number>;
};
export function parseLxssProbe(text: string): LxssProbe {
  const probe: LxssProbe = {
    optimize: false,
    registrations: [],
    logical: new Map(),
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "optimize_vhd=True") probe.optimize = true;
    const registration = /^lxss=([^|]+)\|(.+)$/u.exec(line);
    if (registration?.[1] !== undefined && registration[2] !== undefined)
      probe.registrations.push({
        name: registration[1],
        // The registry may carry the \\?\ long-path prefix; the vhdx path must not.
        base: registration[2].replace(/^\\\\\?\\/u, ""),
      });
    const size = /^lxss_logical=([^|]+)\|(\d+)$/u.exec(line);
    if (size?.[1] !== undefined && size[2] !== undefined)
      probe.logical.set(size[1], Number(size[2]));
  }
  return probe;
}

// Resolves the distro's ext4.vhdx from its Lxss BasePath. Names are matched
// case-insensitively; an unmatched name is an error that lists what is registered.
export function resolveVhdx(
  text: string,
  distro: string,
):
  | {
      ok: true;
      name: string;
      path: string;
      logical: number | null;
      optimize: boolean;
    }
  | { ok: false; error: string } {
  const probe = parseLxssProbe(text);
  const match = probe.registrations.find(
    (registration) => registration.name.toLowerCase() === distro.toLowerCase(),
  );
  if (match === undefined) {
    const names = probe.registrations.map((r) => r.name).join(", ");
    return {
      ok: false,
      error: `no WSL registration named ${distro}; registered: ${names.length > 0 ? names : "none"}`,
    };
  }
  return {
    ok: true,
    // The registry's own spelling goes into the operator procedure, not the probed name.
    name: match.name,
    path: `${match.base.replace(/\\+$/u, "")}\\ext4.vhdx`,
    logical: probe.logical.get(match.name) ?? null,
    optimize: probe.optimize,
  };
}

// The guest names itself: WSL_DISTRO_NAME when set, otherwise the hostname. The
// Lxss lookup then decides; nothing defaults to a fixed distro name.
export function distroName(
  env: Record<string, string | undefined> = process.env,
  host: string = hostname(),
): string | null {
  const fromEnv = env["WSL_DISTRO_NAME"];
  const name = fromEnv !== undefined && fromEnv !== "" ? fromEnv : host;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) ? name : null;
}

const unknownCandidate = (
  reason: string,
  checks: Candidate["checks"],
): Candidate => ({
  id: "vhdx-compaction",
  path: null,
  verdict: "ASK",
  reason,
  checks,
  bytes: null,
  bytes_kind: "estimate",
  action: { kind: "command", argv: [] },
  result: null,
});

export function createVhdxTarget(options: {
  runner: VhdxRunner;
  host?: string;
  probe?: () => Promise<string>;
  distro?: () => string | null;
}) {
  const distroFor = options.distro ?? (() => distroName());
  const hostFor = async (ctx: Context): Promise<string> =>
    ctx.host ??
    options.host ??
    ((await runningInWsl()) && localInterop() ? "local" : "r99");
  return {
    name: "vhdx",
    tier: "plan-only",
    available: async (ctx: Context) => {
      if (!(await runningInWsl()))
        return { available: false, skip_reason: "vhdx planner requires WSL" };
      const host = await hostFor(ctx);
      if (host === "local") return { available: true, skip_reason: null };
      const connection = await ctx.remoteProbes?.get(host);
      return connection?.available === false
        ? connection
        : { available: true, skip_reason: null };
    },
    plan: async (ctx: Context) => {
      const host = await hostFor(ctx);
      const distro = distroFor();
      if (distro === null)
        return [
          unknownCandidate(
            "cannot name this WSL distro: WSL_DISTRO_NAME and hostname are not valid registration names",
            [
              {
                name: "distro-named",
                ok: false,
                detail: "no usable WSL_DISTRO_NAME or hostname",
              },
            ],
          ),
        ];
      const hostResult =
        options.probe !== undefined
          ? { code: 0, out: await options.probe(), timedOut: false }
          : await options.runner(host, "$probe", ctx.signal);
      const failure = probeFailure(hostResult, host);
      if (failure !== null)
        return [
          unknownCandidate(failure, [
            { name: "host-probe", ok: null, detail: failure },
          ]),
        ];
      const resolved = resolveVhdx(hostResult.out, distro);
      if (!resolved.ok)
        return [
          unknownCandidate(resolved.error, [
            { name: "vhdx-resolved", ok: false, detail: resolved.error },
          ]),
        ];
      const { name, path, logical } = resolved;
      const method = pickMethod(resolved.optimize);
      const procedure = method.steps(path, name).join("; ");
      // Measurements run in the guest only when it is local; a remote host has no
      // declared guest alias for this distro, so guest-used stays unknown.
      const measure = (command: string) =>
        host === "local"
          ? options.runner("local", command, ctx.signal)
          : Promise.resolve({
              code: 2,
              out: "guest measurement needs a local WSL guest",
              timedOut: false,
            });
      const mount = toMntPath(path);
      const [usedResult, allocatedResult] = await Promise.all([
        measure("df -B1 --output=used / | awk 'NR==2{print $1}'"),
        mount === null
          ? Promise.resolve({
              code: 2,
              out: "unmapped vhdx path",
              timedOut: false,
            })
          : measure(`du -B1 -s "${mount}" | awk '{print $1}'`),
      ]);
      const used =
        usedResult.code === 0 && !usedResult.timedOut
          ? numeric(usedResult.out.trim())
          : null;
      const allocated =
        allocatedResult.code === 0 && !allocatedResult.timedOut
          ? numeric(allocatedResult.out.trim(), true)
          : null;
      const gap =
        allocated === null || used === null
          ? null
          : Math.max(0, allocated - used);
      // A sparse disk always allocates less than its logical size. Allocation that
      // reaches the logical size means a preallocated (fixed) or fully written disk,
      // where the sparse-compaction premise does not hold and nothing is proven.
      const preallocated =
        allocated !== null && logical !== null && allocated >= logical;
      const caveat = preallocated
        ? "; allocated reaches logical, so the disk may be preallocated: no sparse gap is proven, and deletion or fstrim do not return space to C:; verify the VHDX type before the operator step"
        : "";
      const measured = `allocated ${gb(allocated)} logical ${gb(logical)} guest-used ${gb(used)}`;
      const c: Candidate = {
        id: "vhdx-compaction",
        path: null,
        verdict: "KEEP",
        reason: `plan only: vhdx=${path}; ${measured}; reclaimable gap ${gb(gap)}${caveat}; elevated procedure: ${procedure}`,
        checks: [
          {
            name: "procedure-planned",
            ok: true,
            detail: "never execute from disk-reclaim",
          },
        ],
        bytes: gap,
        bytes_kind: "estimate",
        action: { kind: "command", argv: method.steps(path, name) },
        result: null,
      };
      return [c];
    },
    act: (_candidate: Candidate, _ctx: Context): ActionResult => ({
      ok: false,
      bytes_freed: null,
      error: "vhdx is plan-only",
    }),
  } satisfies Target;
}

const numeric = (
  value: string | undefined,
  positive = false,
): number | null => {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && (!positive || n > 0) ? n : null;
};
const gb = (bytes: number | null): string =>
  bytes === null ? "?" : `${(bytes / 1024 ** 3).toFixed(1)}GB`;
const toMntPath = (path: string): string | null => {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(path);
  return match?.[1] === undefined || match[2] === undefined
    ? null
    : `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
};
export const vhdx = createVhdxTarget({ runner });
