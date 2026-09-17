import { cli } from "cleye";

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

const HOST_DEFAULT = "r99";
const GUEST_DEFAULT = "r99-wsl";
const DISTRO_DEFAULT = "Ubuntu-24.04";
const HOST_MS = 90_000;
const GUEST_MS = 60_000;

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

type Ran = { code: number; out: string; timedOut: boolean };

async function run(cmd: string[], ms: number): Promise<Ran> {
  const sig = AbortSignal.timeout(ms);
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", signal: sig });
  const work = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([out, err, code]) => ({ code, out: `${out}${err}` }));
  const aborted = new Promise<null>((resolve) => {
    sig.addEventListener("abort", () => resolve(null), { once: true });
  });
  const done = await Promise.race([work, aborted]);
  if (done === null) return { code: -1, out: "", timedOut: true };
  return { ...done, out: done.out.replace(/\r/g, ""), timedOut: false };
}

function encodePs(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

async function ps(host: string, script: string, ms: number): Promise<Ran> {
  return run(
    [
      "ssh",
      "-o",
      "ConnectTimeout=10",
      host,
      `powershell.exe -NoProfile -EncodedCommand ${encodePs(script)}`,
    ],
    ms,
  );
}

export type Method = {
  name: "Optimize-VHD" | "diskpart";
  steps: (vhdxPath: string) => string[];
};

// Choose the compaction method for this Windows edition. Optimize-VHD is preferred where present
// (one command, native VHD compaction); diskpart is the universal fallback that needs no Hyper-V,
// which is why Home relies on it. Pure and injectable so the edition branch is tested without a
// host. `optimizeVhdAvailable` is what the probe reports from Get-Command Optimize-VHD.
export function pickMethod(optimizeVhdAvailable: boolean): Method {
  if (optimizeVhdAvailable) {
    return {
      name: "Optimize-VHD",
      steps: (v) => [
        "wsl.exe --shutdown",
        `Optimize-VHD -Path "${v}" -Mode Full`,
      ],
    };
  }
  return {
    name: "diskpart",
    steps: (v) => [
      "wsl.exe --shutdown",
      // diskpart reads a script file; compact needs the vdisk attached read-only first. The path
      // is written with its own double-quotes because it contains spaces.
      `'select vdisk file="${v}"','attach vdisk readonly','compact vdisk','detach vdisk' | Set-Content -Encoding ASCII "$env:TEMP\\compact.txt"; diskpart /s "$env:TEMP\\compact.txt"`,
    ],
  };
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
    const m = /^([a-z_]+)=(.*)$/.exec(line.trim());
    if (m !== null && !kv.has(m[1])) kv.set(m[1], m[2]);
  }
  return kv;
}

async function guestUsedBytes(guest: string): Promise<number | null> {
  const r = await run(
    [
      "ssh",
      "-o",
      "ConnectTimeout=10",
      guest,
      "df -B1 --output=used / | awk 'NR==2{print $1}'",
    ],
    GUEST_MS,
  );
  if (r.timedOut || r.code !== 0) return null;
  const n = Number(r.out.trim());
  return Number.isFinite(n) ? n : null;
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
    throw new UsageError(`Unexpected argument '${parsed._[0]}'`);
  }
  const { host, guest, distro } = parsed.flags;

  if (!Bun.which("ssh")) {
    console.log("no ssh on PATH");
    process.exit(1);
  }

  const probe = await ps(host, hostProbe(distro), HOST_MS);
  if (probe.timedOut || probe.out.trim() === "") {
    console.log(`cannot reach ${host} (ssh timed out or returned nothing)`);
    process.exit(2);
  }
  const h = parseHost(probe.out);
  const vhdxPath = h.get("vhdx_path");
  if (vhdxPath === undefined) {
    console.log(`could not resolve the ext4.vhdx path for ${distro}`);
    process.exit(2);
  }
  const logical = h.has("vhdx_logical") ? Number(h.get("vhdx_logical")) : null;
  const used = await guestUsedBytes(guest);
  const method = pickMethod(h.get("optimize_vhd") === "True");
  const state = h.get("state") ?? "?";

  console.log(`distro:  ${state}`);
  console.log(`vhdx:    ${vhdxPath}`);
  console.log(
    `size:    logical ${logical === null ? "?" : gb(logical)}   guest-used ${used === null ? "?" : gb(used)}`,
  );
  if (logical !== null && used !== null) {
    console.log(
      `gap:     ~${gb(Math.max(0, logical - used))} recoverable by compaction`,
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
  for (const step of method.steps(vhdxPath)) console.log(`  ${step}`);
  console.log("then re-check with: mise run wsl:audit");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
