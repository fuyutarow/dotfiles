import { readdir, stat } from "node:fs/promises";

import { cli } from "cleye";

// READ-ONLY resource evidence for a WSL2 guest AND the Windows host underneath it, in one shot,
// with a threshold verdict. Consumer: human/agent running `mise run wsl:audit`; output is a table
// plus verdict lines (or --json).
//
// WHY BOTH HALVES, ALWAYS. Every r99 outage this repo has debugged was invisible from inside the
// guest. Measured 2026-09-07..09-12:
//   * C: hit 1.08 MB free while the guest reported 38% used — the vhdx max (1007 GB) is LARGER
//     than C: itself (931 GB), so a healthy-looking guest can fill the whole Windows system drive.
//   * 7 spinning sshd/pwsh processes burned 6.8 of 16 host cores for 3 days. Guest loadavg and
//     PSI showed nothing: the vCPUs were starved from outside. Killing them took WSL's CPU share
//     from 417% to 916%.
//   * NvContainerLocalSystem crash-looped every 8s for 3 days (exit 14109). A host event-log
//     count would have caught it on day one.
// A guest-only monitor would have reported "fine" through all three. So the host columns are not
// a nicety here; they are the half that carries the signal.
//
// TRANSPORT. Two independent legs, each either local or over ssh, so this runs from the Mac
// (both legs over ssh) or from inside the distro (guest local, host via interop powershell.exe).
// The PowerShell payload is IDENTICAL in both cases — only the argv prefix differs — because it
// is passed as -EncodedCommand. That is not a style choice: every attempt to inline PowerShell in
// an ssh argument on this host was mangled by one layer or another ($( ) pre-expanded by the
// local shell, backticks eaten, `<` redirected, multi-line dropped). UTF-16LE + base64 is the one
// form that survives both legs unchanged.
//
// ALIASES, NOT ADDRESSES. The defaults are ssh ALIASES. This repo is public, so HostName/Port/User
// live only in the untracked ~/.ssh/config.local that ssh/config Includes first. Same rule as
// wsl-wake.ts.
//
// MEASURE THE VHDX WITH `du`, NEVER WITH PowerShell's Get-Item.Length. On a sparse file Length is
// the LOGICAL high-water mark — 540 GB apparent vs 430 GB actually allocated on this very file.
// Reading Length as disk usage produced two confident wrong conclusions in one week. So the vhdx
// leg is deliberately crooked: the host names the path (registry), the GUEST measures it (du over
// /mnt/c). That is why it is a second guest round-trip and not one more PowerShell line.

const GUEST_DEFAULT = "r99-wsl";
const HOST_DEFAULT = "r99";
const DISTRO_DEFAULT = "Ubuntu-24.04";

// Bounds, not estimates. Measured round-trips on r99 over the tailnet 2026-09-12: a guest shell
// command 0.9-2.1s; a PowerShell -EncodedCommand round-trip 5-15s (CIM providers and Get-WinEvent
// dominate, and "Preparing modules for first use" adds several seconds on a cold session). The
// bounds are ~30x and ~6x those, wide on purpose: a bound exists to turn a HANG into a reported
// failure, not to police variance on a link whose uplink is ~7 Mbps.
const GUEST_MS = 60_000;
const HOST_MS = 90_000;

// Thresholds. Each is anchored to something this machine actually did, not to a round number.
// CRIT = the failure has happened here before at this level; WARN = the margin is gone.
const C_FREE_CRIT_PCT = 8; // C: reached 1.08 MB (0.0%) on 2026-09-07; 8% ~= 75 GB of runway
const C_FREE_WARN_PCT = 20; // the vhdx can still outgrow C:, so 20% is not comfortable
const GUEST_DISK_WARN_PCT = 90;
const MEM_AVAIL_WARN_GB = 4; // below this the guest starts reclaiming instead of working
const SWAP_USED_WARN_GB = 1; // swap use means the .wslconfig memory= cap is being hit
// Judged on the MEAN of several samples, never on one reading. Win32_Processor.LoadPercentage —
// what this used at first — is a cached point-in-time value from the WMI provider and swings
// wildly: 4, 20, 35, 54, 56, 79, 87 across successive polls on an otherwise steady r99, and the
// 87 raised a WARN while the real sustained load, measured as 6 samples of
// Win32_PerfFormattedData_PerfOS_Processor _Total 2s apart, was 17-28%. It also partly measures
// the probe itself: PowerShell's cold start and WmiPrvSE are load this script creates.
// Same error as the memory-PSI threshold — a noisy instantaneous number treated as evidence of a
// sustained condition. 80% of a 3-sample mean is a real saturation signal; 80% of one sample is a
// coin flip. host_cpu_max is carried alongside so a genuine spike stays visible without warning.
const HOST_CPU_WARN_PCT = 80;
// Judged on the 5-MINUTE window (some avg300), displayed as the 10-second one. avg10 tracks the
// workload, not a fault: ccc indexing pushed guest IO PSI avg10 to 20.42 and raised a WARN while
// the same instant read avg60=6.24 and avg300=3.39 — a burst, over before anyone could look. That
// was the third noisy-threshold false positive in this file after memory PSI and host CPU, all the
// same mistake: an instantaneous number used as evidence of a sustained condition. avg10 stays in
// the report because it is exactly what you want when diagnosing "why does herdr feel slow right
// now"; it is just not something to wake anyone for.
// Applies to CPU and IO only — memory PSI raises nothing at all on WSL2; see judge().
//
// SEPARATE FLOORS, because CPU and IO PSI have completely different normal ranges on this host and
// one shared number was inside one of them. Observed across 2026-09-13..14 under known-good load
// (firedancer writing tens of GB, ccc indexing, julia pinning a core):
//     CPU PSI some avg300    0.08 - 0.62
//     IO  PSI some avg300    0.00 - 23.57
// The shared floor of 20 therefore sat INSIDE the IO range: it fired at 23.57 while the only
// D-state task on the box was ccc, doing the indexing it is supposed to do, and avg300 was already
// decaying (19.99 -> 16.26 over 60s) from work that had finished. A 5-minute window lags by five
// minutes; that is the point of it, and it means a floor inside normal range alarms on echoes.
//
// Both floors now sit above the highest value observed under heavy WANTED work. Honest limit: no
// pathological IO sample has ever been captured on this machine, so the IO floor is constructed
// (above observed-normal), not measured against a real fault. Revisit it the first time a genuine
// IO pathology is seen, and put the number here.
const CPU_PSI_WARN = 20; // ~30x the observed maximum
const IO_PSI_WARN = 60; // ~2.5x the observed maximum; see the caveat above

// The host-starvation floor, and the one failure mode this file had no alarm for at all.
// .wslconfig caps WSL at memory=56GB on this 63.9GB box specifically to leave Windows ~6GB,
// because memory=60GB measurably destabilised it on 2026-09-06. So "Windows is below its own
// headroom budget" is the condition, and 4GB is two thirds of that budget gone.
//
// AVAILABLE, never FreePhysicalMemory: Windows drives free memory to near zero by design, and
// FreePhysicalMemory read 0.2GB on this host while 4.5GB was genuinely available. Corroborated by
// HARD PAGE READS rather than by the gauge alone, for the same reason the memory-PSI row is
// corroborated — measured 2026-09-14 while the host recovered from a firedancer burst:
//     avail_gb       0.7   2.28   3.29   4.28   4.49     <- climbing back on its own
//     pages_sec    32661 116185 163016  30923      0     <- includes dirty-page WRITEBACK
//     pagereads/s   2861     15     11      7      0     <- the reads that actually block
// Pages/sec spikes after any large write and says nothing about pressure; page READS are the
// system fetching back what it had to evict. Low available memory that is not forcing reads is a
// busy cache, not a shortage.
const HOST_AVAIL_WARN_GB = 4;
const HOST_PAGEREADS_WARN = 100; // /s; the recovering host settled to 0-15, the squeezed one 2861

const SPIN_CPU_SECONDS = 3600; // the 2026-09-09 zombies had each burned >70h of CPU
const CRASH_WARN = 1; // NvContainer crash-looped ~29,000 times; one per hour is already wrong

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

// Every subprocess goes through here. The drain is RACED against the abort rather than merely
// awaited: killing ssh does NOT close a pipe that a grandchild (the remote shell's child, or
// powershell.exe under interop) still holds open, so `await text()` alone is unbounded and the
// bound silently never fires. Learned the hard way in reclaim-system.ts, where an 80s run under a
// 60s bound exited 124 from an EXTERNAL timeout.
async function run(
  cmd: string[],
  ms: number,
  env?: Record<string, string>,
): Promise<Ran> {
  const sig = AbortSignal.timeout(ms);
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    signal: sig,
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
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

// A leg is "where do I run this": null = right here, a string = through ssh to that alias.
type Leg = string | null;

async function sh(leg: Leg, script: string, ms: number): Promise<Ran> {
  const cmd =
    leg === null
      ? ["bash", "-c", script]
      : ["ssh", "-o", "ConnectTimeout=10", leg, script];
  return run(cmd, ms);
}

// -EncodedCommand takes UTF-16LE base64. Node/Bun's Buffer does the encoding directly, so this
// needs no iconv and behaves identically on macOS and inside the distro.
function encodePs(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

// WSL interop from an sshd-spawned session is BROKEN BY DEFAULT, and the symptom names nothing:
// every Windows binary exits with a bare "Invalid argument". It is not PATH (powershell.exe
// resolves), not binfmt (the WSLInterop node reports enabled), and not the symlink. WSL_INTEROP
// names a PER-SESSION unix socket under /run/WSL/, created by whichever wsl.exe attachment
// started that session — and sshd inherits none, so the variable is simply unset.
// Measured on r99 2026-09-13:
//     WSL_INTEROP unset                    -> "Invalid argument"
//     WSL_INTEROP=/run/WSL/19234_interop   -> works
// So the local host leg borrows a live socket. Newest first, and more than one attempt, because
// a socket FILE outlives the session that created it and a stale one fails identically.
const INTEROP_TRIES = 4;

async function interopSockets(): Promise<string[]> {
  const names = await readdir("/run/WSL").catch(() => [] as string[]);
  const stamped = await Promise.all(
    names
      .filter((n) => n.endsWith("_interop"))
      .map(async (n) => {
        const path = `/run/WSL/${n}`;
        const st = await stat(path).catch(() => null);
        return { path, mtime: st === null ? 0 : st.mtimeMs };
      }),
  );
  return stamped
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, INTEROP_TRIES)
    .map((e) => e.path);
}

function usable(r: Ran): boolean {
  return !r.timedOut && r.code === 0 && r.out.trim() !== "";
}

async function ps(leg: Leg, script: string, ms: number): Promise<Ran> {
  const enc = encodePs(script);
  if (leg !== null) {
    return run(
      [
        "ssh",
        "-o",
        "ConnectTimeout=10",
        leg,
        `powershell.exe -NoProfile -EncodedCommand ${enc}`,
      ],
      ms,
    );
  }

  const argv = ["powershell.exe", "-NoProfile", "-EncodedCommand", enc];
  const direct = await run(argv, ms);
  // An inherited WSL_INTEROP that works needs no help, and one the caller set deliberately is not
  // ours to override — in both cases the direct result stands.
  if (usable(direct) || process.env.WSL_INTEROP !== undefined) return direct;

  for (const sock of await interopSockets()) {
    const retry = await run(argv, ms, { WSL_INTEROP: sock });
    if (usable(retry)) return retry;
  }
  return direct;
}

// Both probes emit `key=value` lines and nothing else, so one parser serves both. Anything that
// is not a bare key=value (PowerShell's CLIXML progress noise, ssh banners, a stray warning) is
// dropped rather than parsed — the probes are the contract, the transport is not.
export function parseKv(out: string): Map<string, string> {
  const kv = new Map<string, string>();
  for (const line of out.split("\n")) {
    const m = /^([a-z0-9_]+)=(.*)$/.exec(line.trim());
    if (m !== null) kv.set(m[1], m[2]);
  }
  return kv;
}

const GUEST_PROBE = `
echo "nproc=$(nproc)"
awk '{print "load1="$1; print "load5="$2; print "load15="$3}' /proc/loadavg
awk '/^some/{for(i=1;i<=NF;i++){split($i,kv,"="); if(kv[1]=="avg10")a=kv[2]; if(kv[1]=="avg300")b=kv[2]}; print "cpu_psi="a; print "cpu_psi300="b}' /proc/pressure/cpu 2>/dev/null || echo "cpu_psi=na"
awk '/^some/{for(i=1;i<=NF;i++){split($i,kv,"="); if(kv[1]=="avg10")a=kv[2]; if(kv[1]=="avg300")b=kv[2]}; print "mem_psi="a; print "mem_psi300="b}' /proc/pressure/memory 2>/dev/null || echo "mem_psi=na"
awk '/^some/{for(i=1;i<=NF;i++){split($i,kv,"="); if(kv[1]=="avg10")a=kv[2]; if(kv[1]=="avg300")b=kv[2]}; print "io_psi="a; print "io_psi300="b}' /proc/pressure/io 2>/dev/null || echo "io_psi=na"
awk '/^MemTotal:/{print "mem_total="$2*1024}
     /^MemAvailable:/{print "mem_avail="$2*1024}
     /^SwapTotal:/{print "swap_total="$2*1024}
     /^SwapFree:/{print "swap_free="$2*1024}' /proc/meminfo
_pg() { awk '$1=="pgscan_kswapd"||$1=="pgscan_direct"{s+=$2} END{print s+0}' /proc/vmstat; }
_pg1=$(_pg); sleep 2; _pg2=$(_pg)
echo "pgscan=$_pg2"
echo "pgscan_rate=$(( (_pg2 - _pg1) / 2 ))"
df -B1 --output=size,used,avail / | awk 'NR==2{print "disk_total="$1; print "disk_used="$2; print "disk_avail="$3}'
ps -eo pcpu=,rss=,comm= --sort=-pcpu 2>/dev/null | awk 'NR<=3{printf "top%d=%s %s %sMB\\n", NR, $3, $1"%", int($2/1024)}'
`;

// $_ and $env: survive because this never passes through a POSIX shell — it is base64 before it
// reaches ssh. Do not "simplify" this by inlining it into the ssh argument.
const HOST_PROBE = `
$ErrorActionPreference = 'SilentlyContinue'
$env:WSL_UTF8 = 1
$os = Get-CimInstance Win32_OperatingSystem
"host_ram_total=" + ($os.TotalVisibleMemorySize * 1024)
"host_ram_free=" + ($os.FreePhysicalMemory * 1024)
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
"host_c_total=" + $c.Size
"host_c_free=" + $c.FreeSpace
$cpuSamples = @(); $availSamples = @(); $readSamples = @()
1..3 | ForEach-Object {
  $p = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' }
  $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  $cpuSamples += $p.PercentProcessorTime
  $availSamples += $m.AvailableMBytes
  $readSamples += $m.PageReadsPersec
  if ($_ -lt 3) { Start-Sleep -Milliseconds 700 }
}
"host_cpu_pct=" + [int](($cpuSamples | Measure-Object -Average).Average)
"host_cpu_max=" + [int](($cpuSamples | Measure-Object -Maximum).Maximum)
"host_cpu_n=" + @($cpuSamples).Count
"host_ram_avail=" + [int64]([int](($availSamples | Measure-Object -Average).Average)) * 1048576
"host_pagereads=" + [int](($readSamples | Measure-Object -Average).Average)
$vm = Get-Process -Name vmmemWSL
"host_vmmem=" + $(if ($vm) { ($vm | Measure-Object -Property WorkingSet64 -Sum).Sum } else { 0 })
$spin = Get-Process -Name sshd,pwsh,powershell,conhost | Where-Object { $_.CPU -gt ${SPIN_CPU_SECONDS} }
"host_spin=" + @($spin).Count
"host_spin_names=" + (@($spin | ForEach-Object { $_.ProcessName + ":" + [int]$_.CPU + "s" }) -join " ")
$ev = Get-WinEvent -FilterHashtable @{LogName='System'; Id=7031,7034; StartTime=(Get-Date).AddHours(-1)}
"host_crashes_1h=" + @($ev).Count
"host_uptime_h=" + [int]((New-TimeSpan -Start $os.LastBootUpTime -End (Get-Date)).TotalHours)
$lx = Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'
foreach ($k in $lx) {
  $p = Get-ItemProperty $k.PSPath
  if ($p.DistributionName -eq '__DISTRO__' -and $p.BasePath) { "host_vhdx_base=" + $p.BasePath }
}
`;

// Windows hands back \\?\C:\Users\... ; the guest needs /mnt/c/Users/... . Returning null (rather
// than guessing) is deliberate: a wrong path would make `du` report 0 and read as "vhdx is tiny",
// which is exactly the class of confident-wrong number this script exists to prevent.
export function toMntPath(winPath: string): string | null {
  const m = /^(?:\\\\\?\\)?([A-Za-z]):\\(.*)$/.exec(winPath.trim());
  if (m === null) return null;
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

// A reading we could not take renders as "?", NEVER as a zero or an omitted field — this
// script exists because a confident-looking number that was never measured is what produced
// the wrong calls. One home for that rule also keeps the report lines free of the nested
// ternaries that scripts/*.ts bans.
function gbOr(bytes: number | null): string {
  return bytes === null ? "?" : gb(bytes);
}

function num(kv: Map<string, string>, key: string): number | null {
  const raw = kv.get(key);
  if (raw === undefined || raw === "" || raw === "na") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// `key` is a STABLE identifier for the condition; `text` carries the live numbers. They are
// separate fields because a watcher needs to answer "is this the same finding as last cycle?",
// and the message cannot answer it: "guest memory PSI some avg10 = 34.28" differs from itself on
// every poll, so keying on the text makes an unchanged condition look new every time and trains
// the reader to ignore the alert.
export type FindingKey =
  | "c-free"
  | "guest-disk"
  | "mem-avail"
  | "swap-used"
  | "host-cpu"
  | "psi-cpu"
  | "psi-io"
  | "host-spin"
  | "host-crashes"
  | "host-mem";

export type Finding = {
  level: "CRIT" | "WARN";
  key: FindingKey;
  text: string;
};

export function judge(
  g: Map<string, string>,
  h: Map<string, string>,
): Finding[] {
  const f: Finding[] = [];

  const cFree = num(h, "host_c_free");
  const cTotal = num(h, "host_c_total");
  if (cFree !== null && cTotal !== null && cTotal > 0) {
    const pct = (cFree / cTotal) * 100;
    if (pct < C_FREE_CRIT_PCT) {
      f.push({
        level: "CRIT",
        key: "c-free",
        text: `C: ${pct.toFixed(1)}% free (${gb(cFree)}) — the vhdx max exceeds C: itself, so the guest can finish the job`,
      });
    } else if (pct < C_FREE_WARN_PCT) {
      f.push({
        level: "WARN",
        key: "c-free",
        text: `C: ${pct.toFixed(1)}% free (${gb(cFree)}) — below ${C_FREE_WARN_PCT}%; reclaim:system / reclaim:builds are the levers`,
      });
    }
  }

  const dUsed = num(g, "disk_used");
  const dTotal = num(g, "disk_total");
  if (dUsed !== null && dTotal !== null && dTotal > 0) {
    const pct = (dUsed / dTotal) * 100;
    if (pct > GUEST_DISK_WARN_PCT) {
      f.push({
        level: "WARN",
        key: "guest-disk",
        text: `guest / at ${pct.toFixed(0)}% used`,
      });
    }
  }

  const avail = num(g, "mem_avail");
  if (avail !== null && avail < MEM_AVAIL_WARN_GB * 1024 ** 3) {
    f.push({
      level: "WARN",
      key: "mem-avail",
      text: `guest memory available ${gb(avail)}`,
    });
  }

  const swapTotal = num(g, "swap_total");
  const swapFree = num(g, "swap_free");
  if (swapTotal !== null && swapFree !== null) {
    const used = swapTotal - swapFree;
    if (used > SWAP_USED_WARN_GB * 1024 ** 3) {
      f.push({
        level: "WARN",
        key: "swap-used",
        text: `guest swap in use ${gb(used)} — the .wslconfig memory= cap is being hit`,
      });
    }
  }

  const cpu = num(h, "host_cpu_pct");
  if (cpu !== null && cpu > HOST_CPU_WARN_PCT) {
    f.push({
      level: "WARN",
      key: "host-cpu",
      text: `host CPU ${cpu}% mean of ${h.get("host_cpu_n") ?? "?"} samples (max ${h.get("host_cpu_max") ?? "?"}%) — host saturation starves the vCPUs invisibly from inside the guest`,
    });
  }

  const hostAvail = num(h, "host_ram_avail");
  const reads = num(h, "host_pagereads");
  if (
    hostAvail !== null &&
    hostAvail < HOST_AVAIL_WARN_GB * 1024 ** 3 &&
    reads !== null &&
    reads > HOST_PAGEREADS_WARN
  ) {
    f.push({
      level: "WARN",
      key: "host-mem",
      text: `Windows down to ${gb(hostAvail)} available with ${reads} hard page reads/s — WSL is squeezing the host below the headroom .wslconfig reserves for it`,
    });
  }

  for (const [probe, key, label, floor] of [
    ["cpu_psi300", "psi-cpu", "CPU", CPU_PSI_WARN],
    ["io_psi300", "psi-io", "IO", IO_PSI_WARN],
  ] as const) {
    const v = num(g, probe);
    if (v !== null && v > floor) {
      f.push({
        level: "WARN",
        key,
        text: `guest ${label} PSI some avg300 = ${v} (sustained)`,
      });
    }
  }

  // MEMORY PSI IS A DIAGNOSTIC HERE, NOT AN ALARM.
  //
  // .wslconfig leaves autoMemoryReclaim unset, whose default is dropCache: WSL periodically drops
  // the guest page cache to hand memory back to Windows. Every dropped page that is touched again
  // REFAULTS, and a refault stalls the task, which is exactly what memory PSI counts. So a
  // file-heavy workload produces sustained memory PSI on a guest with tens of GB free.
  //
  // Measured on r99 2026-09-13 over a 20s window, with memory PSI some avg10 rising 37.9 -> 44.6
  // and full avg10 at 28.8:
  //     workingset_refault_file  +3041      <- the only counter that moved
  //     pswpin / pswpout            +0
  //     pgscan_kswapd / _direct     +0      <- the kernel never reclaimed at all
  //     allocstall_*                 0
  //     MemAvailable            42.45 GB of 54.93, swap 0 B used
  // Zero pgscan with heavy refaults is the signature: pages left the cache without passing
  // through LRU reclaim, i.e. something dropped them. Nothing was short of memory.
  //
  // SO IT RAISES NOTHING — the conclusion of three attempts to make it an alarm, kept here as the
  // reason not to attempt a fourth. Each fix removed one false positive and left another:
  //   corroborate it            -> pgscan TOTAL is cumulative, so the gate opened once and stayed
  //                                open (8,358,408 total while the rate was 0 pages/s)
  //   read the rate, not total  -> reclaim at 12000 pages/s with MemAvailable 41.5 GB of 54.9,
  //                                which is the kernel recycling cache under a write load, i.e.
  //                                the system working
  // Firing on every ordinary firedancer job is what it amounted to, and a warning its reader
  // learns to skip costs more than it can ever return.
  //
  // What a real guest memory shortage DOES is exhaust MemAvailable or push pages to swap, and
  // both already raise their own findings above. Memory PSI adds only "stalling while
  // availability looks fine", which on WSL2 is the dropCache artifact by construction. It stays
  // in the report, where it is exactly what you want when asking why herdr feels slow right now.

  const spin = num(h, "host_spin");
  if (spin !== null && spin > 0) {
    const names = h.get("host_spin_names") ?? "";
    f.push({
      level: "WARN",
      key: "host-spin",
      text: `${spin} host process(es) past ${SPIN_CPU_SECONDS}s CPU${names ? ` — ${names}` : ""}; the 2026-09-09 set held 6.8 of 16 cores for 3 days`,
    });
  }

  const crashes = num(h, "host_crashes_1h");
  if (crashes !== null && crashes >= CRASH_WARN) {
    f.push({
      level: "WARN",
      key: "host-crashes",
      text: `${crashes} unexpected service termination(s) in the last hour (System 7031/7034)`,
    });
  }

  return f;
}

function report(
  g: Map<string, string>,
  h: Map<string, string>,
  vhdx: { alloc: number | null; apparent: number | null },
): void {
  const line = (k: string, v: string) => console.log(`  ${k.padEnd(10)}${v}`);

  console.log("GUEST (WSL2)");
  const nproc = g.get("nproc") ?? "?";
  line(
    "cpu",
    `nproc=${nproc}  load ${g.get("load1")} ${g.get("load5")} ${g.get("load15")}  PSI some avg10=${g.get("cpu_psi")}`,
  );
  const mt = num(g, "mem_total");
  const ma = num(g, "mem_avail");
  const st = num(g, "swap_total");
  const sf = num(g, "swap_free");
  line(
    "mem",
    `available ${gbOr(ma)} of ${gbOr(mt)}` +
      `   swap ${st === null || sf === null ? "?" : `${gb(st - sf)} / ${gb(st)}`}` +
      `   PSI ${g.get("mem_psi")}` +
      // The reclaim RATE sits next to memory PSI on purpose: PSI alone cannot distinguish a
      // shortage from WSL's dropCache refaults, and a rate of 0 is what settles it. See judge().
      `   pgscan ${g.get("pgscan_rate") ?? "?"}/s`,
  );
  const du = num(g, "disk_used");
  const dt = num(g, "disk_total");
  const da = num(g, "disk_avail");
  line(
    "disk",
    du === null || dt === null || da === null
      ? "?"
      : `/ ${gb(du)} used of ${gb(dt)} (${((du / dt) * 100).toFixed(0)}%)   avail ${gb(da)}   IO PSI ${g.get("io_psi")}`,
  );
  for (const k of ["top1", "top2", "top3"]) {
    const v = g.get(k);
    if (v !== undefined && v !== "") line(k === "top1" ? "top" : "", v);
  }

  console.log("HOST (Windows)");
  const cpu = h.get("host_cpu_pct");
  // The mean is the judged number; max is shown so a spike is visible and not actionable.
  line(
    "cpu",
    `${cpu ?? "?"}% mean of ${h.get("host_cpu_n") ?? "?"} (max ${h.get("host_cpu_max") ?? "?"}%)` +
      `   uptime ${h.get("host_uptime_h") ?? "?"}h`,
  );
  const rt = num(h, "host_ram_total");
  const rf = num(h, "host_ram_avail");
  const vm = num(h, "host_vmmem");
  // AVAILABLE, not free. Windows keeps free memory near zero by design (it caches
  // aggressively), so FreePhysicalMemory reads alarmingly low on a perfectly healthy host —
  // it showed 0.2GB here while 4.5GB was actually available. Hard page reads/s sits beside it
  // because that, not the gauge, is what a memory shortage does to you.
  line(
    "mem",
    `available ${gbOr(rf)} of ${gbOr(rt)}   vmmemWSL ${gbOr(vm)}` +
      `   hard page reads/s ${h.get("host_pagereads") ?? "?"}`,
  );
  const cf = num(h, "host_c_free");
  const ct = num(h, "host_c_total");
  line(
    "C:",
    cf === null || ct === null
      ? "?"
      : `free ${gb(cf)} of ${gb(ct)} (${((cf / ct) * 100).toFixed(1)}%)`,
  );
  line(
    "health",
    `spinning=${h.get("host_spin") ?? "?"}   service crashes/1h=${h.get("host_crashes_1h") ?? "?"}`,
  );

  // Printed together on one line precisely because printing either alone is what misleads.
  line(
    "vhdx",
    vhdx.alloc === null && vhdx.apparent === null
      ? "n/a (path not resolved)"
      : `allocated ${gbOr(vhdx.alloc)}   apparent ${gbOr(vhdx.apparent)}` +
          `   (allocated is the one that matters)`,
  );
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "wsl-audit.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "READ-ONLY resource evidence for a WSL2 guest and the Windows host under it, with a threshold verdict.",
      },
      flags: {
        guest: {
          type: String,
          default: GUEST_DEFAULT,
          description: "ssh alias for the WSL guest; 'local' to run here",
        },
        host: {
          type: String,
          default: HOST_DEFAULT,
          description:
            "ssh alias for the Windows host; 'local' to use interop powershell.exe",
        },
        distro: { type: String, default: DISTRO_DEFAULT },
        json: { type: Boolean, default: false },
        strict: {
          type: Boolean,
          default: false,
          description: "exit 1 when a threshold is breached (for monitoring)",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    throw new UsageError(`Unexpected argument '${parsed._[0]}'`);
  }

  const guestLeg: Leg =
    parsed.flags.guest === "local" ? null : parsed.flags.guest;
  const hostLeg: Leg = parsed.flags.host === "local" ? null : parsed.flags.host;

  if ((guestLeg !== null || hostLeg !== null) && !Bun.which("ssh")) {
    console.log("no ssh on PATH");
    process.exit(1);
  }

  // The two legs are independent, so they go concurrently: the host leg is the slow one (5-15s of
  // CIM providers) and there is no reason for the guest to wait behind it.
  const [gRan, hRan] = await Promise.all([
    sh(guestLeg, GUEST_PROBE, GUEST_MS),
    ps(hostLeg, HOST_PROBE.replace("__DISTRO__", parsed.flags.distro), HOST_MS),
  ]);

  const g = parseKv(gRan.out);
  const h = parseKv(hRan.out);

  // A leg that returned nothing is reported as a leg failure, never as healthy zeros. The whole
  // point of this script is that a half-blind reading is what produced the wrong calls before.
  const dead: string[] = [];
  if (gRan.timedOut || g.size === 0) {
    dead.push(
      `guest leg (${parsed.flags.guest}): ${gRan.timedOut ? `timed out after ${GUEST_MS / 1000}s` : "no parsable output"}`,
    );
  }
  if (hRan.timedOut || h.size === 0) {
    dead.push(
      `host leg (${parsed.flags.host}): ${hRan.timedOut ? `timed out after ${HOST_MS / 1000}s` : "no parsable output"}`,
    );
  }

  // Second guest round-trip, and only if the host named a path. See the header: the host owns the
  // path, the guest owns the measurement.
  let alloc: number | null = null;
  let apparent: number | null = null;
  const base = h.get("host_vhdx_base");
  const mnt = base === undefined ? null : toMntPath(base);
  if (mnt !== null && !(gRan.timedOut || g.size === 0)) {
    const vRan = await sh(
      guestLeg,
      `f="${mnt}/ext4.vhdx"; [ -f "$f" ] && { echo "alloc=$(du -B1 -s "$f" | awk '{print $1}')"; echo "apparent=$(du -B1 -s --apparent-size "$f" | awk '{print $1}')"; }`,
      GUEST_MS,
    );
    const v = parseKv(vRan.out);
    alloc = num(v, "alloc");
    apparent = num(v, "apparent");
  }

  const findings = dead.length > 0 ? [] : judge(g, h);

  if (parsed.flags.json) {
    console.log(
      JSON.stringify(
        {
          guest: Object.fromEntries(g),
          host: Object.fromEntries(h),
          vhdx: { allocated: alloc, apparent },
          unreachable: dead,
          findings,
        },
        null,
        2,
      ),
    );
  } else {
    report(g, h, { alloc, apparent });
    console.log("---");
    for (const d of dead) console.log(`UNREACHABLE  ${d}`);
    for (const f of findings) console.log(`${f.level}  ${f.text}`);
    if (dead.length === 0 && findings.length === 0) {
      console.log("OK  every threshold clear");
    }
  }

  // Exit codes. This task's JOB is to measure, so a successful measurement exits 0 EVEN WHEN it
  // found something — a WARN is the deliverable, not a failure, and letting a finding exit 1 made
  // `mise run wsl:audit` print "ERROR task failed" after a run that worked perfectly. That is the
  // misleading-output failure mode this repo keeps hunting, so the default is 0 and monitoring
  // opts in with --strict.
  //
  // An unreachable leg is always 2, and is never folded into 1: "I could not see" and "I saw a
  // problem" are different answers, and collapsing them is how a dead probe reads as a healthy
  // machine.
  if (dead.length > 0) process.exit(2);
  if (parsed.flags.strict && findings.length > 0) process.exit(1);
}

// Guarded so the test file can import judge/parseKv/toMntPath without this script reaching for
// ssh on import — the house pattern (reclaim-clean.ts, reclaim-toolchains.ts).
if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
