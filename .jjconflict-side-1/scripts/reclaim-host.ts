import { cli } from "cleye";

// Reclaim disk on the WINDOWS HOST under WSL2 — the space WSL leaves on C: that the guest-side
// reclaim tasks cannot reach. Consumer: human/agent running `mise run reclaim:host`; output is a
// plan, or a report of what was freed. Default is READ-ONLY (--plan); --execute frees.
//
// WHY A HOST-SIDE TASK AT ALL. reclaim:clean / reclaim:builds / reclaim:system all run INSIDE the
// guest and free guest bytes; but the guest's ext4.vhdx is sparse, so freeing guest bytes does not
// always return them to C: (fstrim was measured a no-op on this box — the blocks were already
// deallocated). The bytes this task targets are Windows-side and invisible from the guest:
//   * ORPHANED swap.vhdx — WSL writes a swap.vhdx under %TEMP%\<guid>\ for the RUNNING instance,
//     and a fresh distro launch mints a NEW guid without deleting the old one. Measured on r99
//     2026-09-16: three swap.vhdx totalling 31 GB, two of them from dead instances (17 GB
//     reclaimable). This is the recurring one — every restart can orphan another.
//   * winget's download cache — small here (~0.9 GB) but pure regenerable waste.
//
// THE SAFETY IS THE OS, NOT THE HEURISTIC. The live instance holds its swap.vhdx OPEN, so Windows
// REFUSES to delete it — Remove-Item fails with a sharing violation and the file survives. So even
// if the newest-is-live heuristic below were wrong, --execute cannot delete the swap in use: the
// lock is the backstop. That is why this deletes rather than rip-to-graveyard (a graveyard on the
// same volume frees nothing) and why it is safe to run against a live box.
//
// ALIASES, NOT ADDRESSES. --host is an ssh ALIAS (default r99); HostName lives only in the
// untracked ~/.ssh/config.local (public repo). Same rule as wsl-wake.ts / wsl-audit.ts.

const HOST_DEFAULT = "r99";
const HOST_MS = 90_000; // a Get-ChildItem over %TEMP% + a few Remove-Item; 90s is a hang bound

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

async function ps(host: string, script: string): Promise<Ran> {
  return run(
    [
      "ssh",
      "-o",
      "ConnectTimeout=10",
      host,
      `powershell.exe -NoProfile -EncodedCommand ${encodePs(script)}`,
    ],
    HOST_MS,
  );
}

export type Swap = { path: string; mtimeMs: number; bytes: number };

// Split swap.vhdx files into the one to KEEP and the orphans to reclaim. The live instance writes
// its swap continuously, so the newest mtime is the live one; every older file is from a dead
// instance. This is a heuristic, and it does not need to be more than that: --execute relies on
// the OS lock (see header), so a wrong guess here cannot delete the live swap — it only changes
// which files are ATTEMPTED. With 0 or 1 swap present there is nothing to reclaim.
export function classifySwaps(swaps: Swap[]): {
  live: Swap | null;
  orphans: Swap[];
  reclaimBytes: number;
} {
  if (swaps.length === 0) return { live: null, orphans: [], reclaimBytes: 0 };
  const byNewest = [...swaps].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const [live, ...orphans] = byNewest;
  return {
    live: live ?? null,
    orphans,
    reclaimBytes: orphans.reduce((sum, s) => sum + s.bytes, 0),
  };
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

// The probe emits one `swap=<mtimeMs>|<bytes>|<path>` line per swap.vhdx, plus winget_cache and C:
// figures. Pipe-delimited because a Windows path contains spaces and backslashes.
const PROBE = `
$ErrorActionPreference = 'SilentlyContinue'
$env:WSL_UTF8 = 1
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
"c_free=" + $c.FreeSpace
"c_total=" + $c.Size
Get-ChildItem $env:TEMP -Recurse -Filter swap.vhdx -File | ForEach-Object {
  "swap=" + [int64]($_.LastWriteTime.ToUniversalTime() - (Get-Date '1970-01-01Z')).TotalMilliseconds + "|" + $_.Length + "|" + $_.FullName
}
$wg = "$env:LOCALAPPDATA\\Microsoft\\WinGet"
if (Test-Path $wg) {
  "winget_cache=" + ((Get-ChildItem $wg -Recurse -File | Measure-Object -Property Length -Sum).Sum + 0)
}
`;

function parseProbe(out: string): {
  swaps: Swap[];
  cFree: number | null;
  cTotal: number | null;
  wingetCache: number | null;
} {
  const swaps: Swap[] = [];
  let cFree: number | null = null;
  let cTotal: number | null = null;
  let wingetCache: number | null = null;
  for (const line of out.split("\n")) {
    const t = line.trim();
    const [, mtime, bytes, path] = /^swap=(\d+)\|(\d+)\|(.+)$/.exec(t) ?? [];
    if (mtime !== undefined && bytes !== undefined && path !== undefined) {
      swaps.push({ mtimeMs: Number(mtime), bytes: Number(bytes), path });
      continue;
    }
    const kv = /^(c_free|c_total|winget_cache)=(\d+)$/.exec(t);
    if (kv === null) continue;
    if (kv[1] === "c_free") cFree = Number(kv[2]);
    else if (kv[1] === "c_total") cTotal = Number(kv[2]);
    else wingetCache = Number(kv[2]);
  }
  return { swaps, cFree, cTotal, wingetCache };
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "reclaim-host.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Reclaim Windows-host disk under WSL2: orphaned swap.vhdx and the winget cache. READ-ONLY by default; --execute frees.",
      },
      flags: {
        host: { type: String, default: HOST_DEFAULT },
        execute: {
          type: Boolean,
          default: false,
          description: "actually delete (default is a read-only plan)",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    throw new UsageError(`Unexpected argument '${parsed._[0]}'`);
  }
  const { host } = parsed.flags;

  if (!Bun.which("ssh")) {
    console.log("no ssh on PATH");
    process.exit(1);
  }

  const probe = await ps(host, PROBE);
  if (probe.timedOut || probe.out.trim() === "") {
    console.log(`cannot reach ${host} (ssh timed out or returned nothing)`);
    process.exit(2);
  }
  const { swaps, cFree, cTotal, wingetCache } = parseProbe(probe.out);
  const { live, orphans, reclaimBytes } = classifySwaps(swaps);

  if (cFree !== null && cTotal !== null) {
    console.log(
      `C: ${gb(cFree)} free of ${gb(cTotal)} (${((cFree / cTotal) * 100).toFixed(1)}%)`,
    );
  }
  console.log(`swap.vhdx: ${swaps.length} present`);
  if (live !== null)
    console.log(`  live (kept):   ${gb(live.bytes)}  ${live.path}`);
  for (const o of orphans)
    console.log(`  orphan:        ${gb(o.bytes)}  ${o.path}`);
  if (wingetCache !== null && wingetCache > 0) {
    console.log(`winget cache:  ${gb(wingetCache)}`);
  }
  console.log(`reclaimable:   ${gb(reclaimBytes + (wingetCache ?? 0))}`);

  if (!parsed.flags.execute) {
    console.log("---");
    console.log(
      "read-only plan; re-run with --execute to free the orphans and the winget cache",
    );
    return;
  }

  if (orphans.length === 0 && (wingetCache ?? 0) === 0) {
    console.log("nothing to reclaim");
    return;
  }

  // Delete, not rip: a graveyard on C: frees no C:. The OS lock protects the live swap even if the
  // newest-is-live guess is wrong, so passing every orphan to Remove-Item -Force is safe.
  const removals = orphans
    .map(
      (o) => `Remove-Item -Force -LiteralPath '${o.path.replace(/'/g, "''")}'`,
    )
    .join("; ");
  const cleanWinget =
    (wingetCache ?? 0) > 0
      ? `Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\WinGet" -Recurse -File | Remove-Item -Force`
      : "";
  const exec = await ps(
    host,
    `$ErrorActionPreference='Continue'; $env:WSL_UTF8=1; ${removals}; ${cleanWinget}
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
"c_free_after=" + $c.FreeSpace`,
  );
  const after = /c_free_after=(\d+)/.exec(exec.out);
  console.log("---");
  if (after !== null && cFree !== null) {
    const freed = Number(after[1]) - cFree;
    console.log(
      `done: C: now ${gb(Number(after[1]))} free (+${gb(Math.max(0, freed))}). A locked (live) swap is left in place by design.`,
    );
  } else {
    console.log("done — re-run --plan or wsl:audit to confirm C: free");
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
