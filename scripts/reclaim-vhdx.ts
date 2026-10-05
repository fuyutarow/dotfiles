import { cli } from "cleye";

import { type Leg, ps, sh, toMntPath } from "./wsl-audit.ts";

// Plan the offline COMPACTION of a WSL2 ext4.vhdx — the single largest C: lever, and the one the
// other reclaim tasks cannot touch. Consumer: human/agent running `mise run reclaim:vhdx`; output
// is the reclaimable gap, the right method for this Windows edition, and the exact elevated
// procedure to run. READ-ONLY: it measures and prints; it does not compact.
//
// WHY THIS IS A PLANNER, NOT AN EXECUTOR. Compaction needs two things this script cannot supply
// safely: ADMIN elevation (Optimize-VHD and diskpart both require it, and a PowerShell-over-ssh
// session is not elevated — no UAC), and a STOPPED distro (`wsl --shutdown` kills every running
// job first). So the honest shape is to do the hard, safe part — resolve the vhdx, measure the
// gap, pick the method for THIS edition — and hand over a verified procedure the operator runs in
// an elevated shell when the box is idle. Encoding the measurement and the edition branch is the
// value; pretending to execute what cannot be tested from here is not.
//
// WHY COMPACTION AND NOT fstrim / set-sparse. Both were measured INERT on this box:
//   fstrim /            reported 481 GiB "trimmed", C: moved +0.9 GB — the blocks were already
//                       deallocated, so the trim was a no-op (reclaim-system.ts records this).
//   --set-sparse true   the vhdx already carries the sparse attribute (dotfiles' wslconfig.win
//                       sets sparseVhd=true), so this is a no-op — confirmed via fsutil 2026-09-17.
// A sparse vhdx still holds allocated extents its logical size no longer needs; only an offline
// compaction returns them. Measured gap on r99 2026-09-16: logical 572.5 GB vs guest-used ~440 GB
// after cleanup = ~130 GB recoverable.
//
// METHOD BY EDITION. Optimize-VHD ships with the Hyper-V PowerShell module — present on Pro/
// Enterprise, ABSENT on Home (this box is Home, SKU 101). diskpart's `compact vdisk` is the
// universal fallback and needs no Hyper-V. The planner detects which is available and prints that
// one.
//
// ALIASES, NOT ADDRESSES. --host is an ssh ALIAS (default r99); HostName lives only in the
// untracked ~/.ssh/config.local. Same rule as wsl-wake.ts / wsl-audit.ts / reclaim-host.ts.
// `local` for either leg runs it HERE — the host leg through interop powershell.exe — on
// wsl-audit.ts's own transport, so an agent inside the distro needs no ssh at all.

const HOST_DEFAULT = "r99";
const GUEST_DEFAULT = "r99-wsl";
const DISTRO_DEFAULT = "Ubuntu-24.04";
const HOST_MS = 90_000;
const GUEST_MS = 60_000;

export type Method = {
  name: "Optimize-VHD" | "diskpart";
  steps: (vhdxPath: string, distro: string) => string[];
};

// Choose the compaction method for this Windows edition. Optimize-VHD is preferred where present
// (one command, native VHD compaction); diskpart is the universal fallback that needs no Hyper-V,
// which is why Home relies on it. Pure and injectable so the edition branch is tested without a
// host. `optimizeVhdAvailable` is what the probe reports from Get-Command Optimize-VHD.
//
// SPARSE MUST BE CLEARED FIRST. Both Optimize-VHD and diskpart's `compact vdisk` REFUSE a sparse
// vhdx — "Virtual hard disk files ... must not be sparse" — and this box's vhdx is sparse by
// default (wslconfig.win `sparseVhd=true`). So every method begins by clearing the attribute with
// `wsl --manage <distro> --set-sparse false` after the shutdown. Re-enabling sparse afterwards is
// deliberately NOT scripted: since WSL 2.5.6 `--set-sparse true` is gated behind `--allow-unsafe`
// and carries documented data-corruption reports (microsoft/WSL#13075), so that is a decision for
// the operator, not a step this planner prints.
export function pickMethod(optimizeVhdAvailable: boolean): Method {
  if (optimizeVhdAvailable) {
    return {
      name: "Optimize-VHD",
      steps: (v, d) => [
        ...clearSparse(d),
        `Optimize-VHD -Path "${v}" -Mode Full`,
      ],
    };
  }
  return {
    name: "diskpart",
    steps: (v, d) => [
      ...clearSparse(d),
      // diskpart reads a script file; compact needs the vdisk attached read-only first. The path
      // is written with its own double-quotes because it contains spaces.
      `'select vdisk file="${v}"','attach vdisk readonly','compact vdisk','detach vdisk' | Set-Content -Encoding ASCII "$env:TEMP\\compact.txt"; diskpart /s "$env:TEMP\\compact.txt"`,
    ],
  };
}

function clearSparse(distro: string): string[] {
  return [
    "wsl.exe --shutdown",
    `wsl.exe --manage ${distro} --set-sparse false`,
  ];
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

// Host probe: resolve the vhdx path + logical size from the registry, read distro state, and
// detect Optimize-VHD. Emits key=value lines; the vhdx path is on its own key because it contains
// spaces.
function hostProbe(distro: string): string {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$env:WSL_UTF8 = 1
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
"c_free=" + $c.FreeSpace
$state = ((wsl.exe -l -v | Out-String) -split "\`n" | Select-String "${distro}") -replace "\\s+"," "
"state=" + $state.Trim()
"optimize_vhd=" + [bool](Get-Command Optimize-VHD -ErrorAction SilentlyContinue)
$lx = Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'
foreach ($k in $lx) {
  $p = Get-ItemProperty $k.PSPath
  if ($p.DistributionName -eq '${distro}' -and $p.BasePath) {
    $v = ($p.BasePath -replace '^\\\\\\\\\\?\\\\','') + '\\ext4.vhdx'
    "vhdx_path=" + $v
    if (Test-Path $v) { "vhdx_logical=" + (Get-Item $v).Length }
  }
}
`;
}

function parseHost(out: string): Map<string, string> {
  const kv = new Map<string, string>();
  for (const line of out.split("\n")) {
    const [, key, value] = /^([a-z_]+)=(.*)$/u.exec(line.trim()) ?? [];
    if (key !== undefined && value !== undefined && !kv.has(key))
      kv.set(key, value);
  }
  return kv;
}

async function guestUsedBytes(guest: Leg): Promise<number | null> {
  const r = await sh(
    guest,
    "df -B1 --output=used / | awk 'NR==2{print $1}'",
    GUEST_MS,
  );
  if (r.timedOut || r.code !== 0) return null;
  const n = Number(r.out.trim());
  return Number.isFinite(n) ? n : null;
}

// ALLOCATED bytes of the vhdx, measured by the guest with `du` over /mnt/c — never the host's
// Get-Item.Length, which on a sparse file is the logical high-water mark (653.9 GB apparent vs
// 624.4 GB allocated on 2026-09-27). Compaction can only return what is allocated, so a gap taken
// from Length overstates the win by the sparse holes. Null when the path cannot be mapped or read.
async function allocatedBytes(
  guest: Leg,
  vhdxPath: string,
): Promise<number | null> {
  const mnt = toMntPath(vhdxPath);
  if (mnt === null) return null;
  const r = await sh(guest, `du -B1 -s "${mnt}" | awk '{print $1}'`, GUEST_MS);
  if (r.timedOut || r.code !== 0) return null;
  const n = Number(r.out.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Why the host probe produced no usable answer, or null when it did. The exit code is read BEFORE
// the output is parsed: on 2026-09-27 `ssh r99` was refused, the ssh error became the probe's
// output, no key parsed, and the run reported "could not resolve the ext4.vhdx path" — blaming
// the registry lookup for a transport that never connected. Pure, so that ordering is tested.
export function probeFailure(
  r: { code: number; out: string; timedOut: boolean },
  host: string,
): string | null {
  const where = host === "local" ? "interop powershell.exe" : `ssh ${host}`;
  if (r.timedOut) return `cannot reach the host: ${where} timed out`;
  const said = r.out.trim().split("\n").slice(0, 5).join("\n  ");
  if (r.code !== 0) {
    return `cannot reach the host: ${where} exited ${r.code}${said !== "" ? `:\n  ${said}` : ""}`;
  }
  if (said === "") return `cannot reach the host: ${where} returned nothing`;
  return null;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "reclaim-vhdx.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Plan the offline compaction of a WSL2 ext4.vhdx: measure the reclaimable gap and print the elevated procedure. READ-ONLY.",
      },
      flags: {
        host: { type: String, default: HOST_DEFAULT },
        guest: { type: String, default: GUEST_DEFAULT },
        distro: { type: String, default: DISTRO_DEFAULT },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    process.stderr.write(`FATAL: Unexpected argument '${parsed._[0]}'\n`);
    process.exit(2);
  }
  const { host, guest, distro } = parsed.flags;

  const hostLeg: Leg = host === "local" ? null : host;
  const guestLeg: Leg = guest === "local" ? null : guest;

  if ((hostLeg !== null || guestLeg !== null) && Bun.which("ssh") === null) {
    console.log(
      "no ssh on PATH (inside the distro, use --host local --guest local)",
    );
    process.exit(1);
  }

  const probe = await ps(hostLeg, hostProbe(distro), HOST_MS);
  const failed = probeFailure(probe, host);
  if (failed !== null) {
    console.log(failed);
    process.exit(2);
  }
  const h = parseHost(probe.out);
  const vhdxPath = h.get("vhdx_path");
  if (vhdxPath === undefined) {
    console.log(
      `the host answered, but no Lxss registry entry named ${distro} has a BasePath (list them: wsl.exe -l -v)`,
    );
    process.exit(2);
  }
  const logical = h.has("vhdx_logical") ? Number(h.get("vhdx_logical")) : null;
  const [used, allocated] = await Promise.all([
    guestUsedBytes(guestLeg),
    allocatedBytes(guestLeg, vhdxPath),
  ]);
  const method = pickMethod(h.get("optimize_vhd") === "True");
  const state = h.get("state") ?? "?";

  console.log(`distro:  ${state}`);
  console.log(`vhdx:    ${vhdxPath}`);
  const gbOr = (n: number | null): string => (n === null ? "?" : gb(n));
  console.log(
    `size:    allocated ${gbOr(allocated)}   logical ${gbOr(logical)}   guest-used ${gbOr(used)}`,
  );
  if (allocated !== null && used !== null) {
    console.log(
      `gap:     ~${gb(Math.max(0, allocated - used))} recoverable by compaction (allocated - guest-used)`,
    );
  } else {
    console.log(
      "gap:     ? — allocated size unmeasured; the logical size would overstate it",
    );
  }
  console.log(`method:  ${method.name} (this edition)`);
  console.log("---");
  if (state.includes("Running")) {
    console.log(
      "the distro is RUNNING — `wsl --shutdown` below kills every job in it first; run when idle",
    );
  }
  console.log(
    "run these in an ELEVATED PowerShell ON THE HOST (admin; ssh is not elevated):",
  );
  for (const step of method.steps(vhdxPath, distro)) console.log(`  ${step}`);
  console.log("then re-check with: mise run wsl:audit");
  console.log(
    "note: --set-sparse false clears the attribute compaction requires; re-enabling sparse needs",
  );
  console.log(
    "      `--allow-unsafe` (WSL 2.5.6+) and carries data-corruption reports, so it is left to you.",
  );
}

if (import.meta.main) {
  await main().then(undefined, (err: unknown) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
