import type { ActionResult, Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";

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
) => Promise<{ code: number; out: string; timedOut: boolean }>;
const VHDX_PROBE = `$ErrorActionPreference='SilentlyContinue'; $env:WSL_UTF8=1; $state=((wsl.exe -l -v|Out-String)-split "\`n"|Select-String 'Ubuntu-24.04') -replace "\\s+"," "; "state="+$state.Trim(); "optimize_vhd="+[bool](Get-Command Optimize-VHD -ErrorAction SilentlyContinue); $lx=Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'; foreach($k in $lx){$p=Get-ItemProperty $k.PSPath;if($p.DistributionName -eq 'Ubuntu-24.04' -and $p.BasePath){$v=($p.BasePath -replace '^\\\\\\\\\\?\\\\','')+'\\ext4.vhdx';"vhdx_path="+$v;if(Test-Path $v){"vhdx_logical="+(Get-Item $v).Length}}}`;
const sshRunner: VhdxRunner = async (host, script) => {
  const command =
    script === "$probe"
      ? `powershell.exe -NoProfile -EncodedCommand ${Buffer.from(VHDX_PROBE, "utf16le").toString("base64")}`
      : `bash -lc ${JSON.stringify(script)}`;
  const proc = Bun.spawn(["ssh", "-o", "ConnectTimeout=10", host, command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: `${out}${err}`.replaceAll("\r", ""), timedOut: false };
};
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
export function createVhdxTarget(options: {
  runner: VhdxRunner;
  host?: string;
  probe?: () => Promise<string>;
}) {
  return {
    name: "vhdx",
    tier: "plan-only",
    available: () => ({
      available:
        process.platform === "linux" &&
        process.env.WSL_DISTRO_NAME !== undefined,
      skip_reason: "vhdx planner requires WSL",
    }),
    plan: async (_ctx: Context) => {
      const host = options.host ?? "r99";
      const hostResult =
        options.probe !== undefined
          ? { code: 0, out: await options.probe(), timedOut: false }
          : await options.runner(host, "$probe");
      const failure = probeFailure(hostResult, host);
      if (failure !== null)
        return [
          {
            id: "vhdx-compaction",
            path: null,
            verdict: "ASK",
            reason: failure,
            checks: [{ name: "host-probe", ok: null, detail: failure }],
            bytes: null,
            bytes_kind: "estimate",
            action: { kind: "command", argv: [] },
            result: null,
          },
        ];
      const text = hostResult.out;
      const path = /^vhdx_path=(.*)$/mu.exec(text)?.[1] ?? "unknown";
      const logical = numeric(/^vhdx_logical=(\d+)$/mu.exec(text)?.[1]);
      const method = pickMethod(/^optimize_vhd=True$/mu.test(text));
      const procedure = method.steps(path, "Ubuntu-24.04").join("; ");
      if (path === "unknown")
        return [
          {
            id: "vhdx-compaction",
            path: null,
            verdict: "ASK",
            reason: "could not resolve ext4.vhdx",
            checks: [
              {
                name: "procedure-planned",
                ok: false,
                detail: "host did not report a vhdx path",
              },
            ],
            bytes: null,
            bytes_kind: "estimate",
            action: { kind: "command", argv: [] },
            result: null,
          },
        ];
      const guest = options.host === "local" ? "local" : "r99-wsl";
      const [usedResult, allocatedResult] = await Promise.all([
        options.runner(guest, "df -B1 --output=used / | awk 'NR==2{print $1}'"),
        ((): Promise<Awaited<ReturnType<VhdxRunner>>> => {
          const mount = toMntPath(path);
          return mount === null
            ? Promise.resolve({
                code: 2,
                out: "unmapped vhdx path",
                timedOut: false,
              })
            : options.runner(guest, `du -B1 -s "${mount}" | awk '{print $1}'`);
        })(),
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
      const measured = `allocated ${gb(allocated)} logical ${gb(logical)} guest-used ${gb(used)}`;
      const c: Candidate = {
        id: "vhdx-compaction",
        path: null,
        verdict: "KEEP",
        reason: `plan only: ${measured}; reclaimable gap ${gb(gap)}; elevated procedure: ${procedure}`,
        checks: [
          {
            name: "procedure-planned",
            ok: true,
            detail: "never execute from disk-reclaim",
          },
        ],
        bytes: gap,
        bytes_kind: "estimate",
        action: { kind: "command", argv: method.steps(path, "Ubuntu-24.04") },
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
export const vhdx = createVhdxTarget({ runner: sshRunner });
