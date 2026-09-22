import { cli } from "cleye";

// Reap ORPHANED sshd processes on the Windows host under WSL2. Consumer: human/agent running
// `mise run wsl:reap`; output is verdict lines. READ-ONLY plan by default; --execute stops them.
// Exit: 0 nothing to reap, or every orphan reaped / 1 orphans found (plan) or some survived
// (--execute) / 2 host unreachable, usage error, or FATAL.
//
// WHY. Twice on r99 sshd left per-connection `sshd -R` processes spinning after C: had filled:
// 2026-09-09, 7 processes held 6.8 of 16 cores for 3 days; 2026-09-22, 9 processes at ~58,000 s
// of CPU each. Measured shape on 2026-09-22: parent = the sshd SERVICE, `-R` on the command line,
// NO child process, NO TCP socket, 2 threads — all born in one 9-minute window while connections
// kept arriving at a full disk. The inbox OpenSSH 9.5p2 busy-loops in that error path instead of
// exiting. wsl:audit sees them only as "host processes past 3600 s CPU" and points here.
//
// THE PREDICATE, and why it is not CPU time. A live session always has a `sshd -z` child (which
// owns the user's shell) and a socket; an orphan has neither. So selection is structural: parent
// is an sshd service process AND `-R` AND no child AND no socket. CPU time is REPORTED, never
// used to select — a days-long herdr session legitimately accumulates CPU and must never match.
// Every probe error leans SAFE: a stale ParentProcessId that happens to equal an orphan's pid
// reads as "has a child" and keeps it; an unreadable socket table keeps everything.
//
// THE PROCESS MODEL CHANGED WITH THE BINARY. Inbox 9.5p2 re-executes sshd.exe itself per
// connection (`sshd.exe -R`, child `sshd.exe -z`). OpenSSH 10.0 — r99 since 2026-09-22 — splits
// that out: the per-connection process is `sshd-session.exe -R` with child `sshd-session.exe -z`
// (plus sshd-auth.exe during authentication). Measured on r99 the same day; a probe that looked
// only for sshd.exe saw ONE process and reported "no orphans" while blind. Both images are
// probed, and the predicate is the same structural test for either.
//
// THE SERVICE NAME IS NOT ASSUMED. r99's server was renamed sshd -> sshd10 on 2026-09-22 to escape
// pending CBS operations. The parent test accepts ANY service whose image is sshd.exe.
//
// A PID IS NOT AN IDENTITY. Between probe and kill a pid can be reused — by a NEW live session,
// the one process this must never touch. --execute sends (pid, creation time) pairs; the host
// stops a process only if both still match, and a second probe then proves the orphans are gone.
//
// ALIASES, NOT ADDRESSES. --host is an ssh alias (default r99), same rule as reclaim-host.ts.

const HOST_DEFAULT = "r99";
const HOST_MS = 90_000; // a CIM process walk over ssh; 90 s is a hang bound, not an estimate

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

export type SshdProc = {
  name: string;
  pid: number;
  ppid: number;
  isR: boolean;
  hasChild: boolean;
  hasSocket: boolean;
  cpuSeconds: number;
  bornMs: number;
};

/** The orphan predicate. Pure, so the one decision that can kill a process is unit-tested. */
export function classifyOrphans(
  procs: SshdProc[],
  servicePids: Set<number>,
): SshdProc[] {
  return procs.filter(
    (p) => servicePids.has(p.ppid) && p.isR && !p.hasChild && !p.hasSocket,
  );
}

// One `svc=<pid>` per running sshd.exe service, `sock_ok=0|1`, and one
// `proc=<image>|<pid>|<ppid>|<isR>|<hasChild>|<hasSocket>|<cpuSeconds>|<bornMs>` per sshd.exe or
// sshd-session.exe process.
// Creation time via DateTimeOffset: subtracting DateTimes of different Kind silently ignores the
// offset (a 9-hour error in JST), and this value is compared for identity.
const PROBE = `
$ErrorActionPreference = 'SilentlyContinue'
foreach ($s in @(Get-CimInstance Win32_Service | Where-Object { $_.ProcessId -gt 0 -and $_.PathName -match 'sshd\\.exe' })) { "svc=" + $s.ProcessId }
$tcp = Get-NetTCPConnection
"sock_ok=" + $(if ($null -ne $tcp) { 1 } else { 0 })
$sock = @{}; foreach ($c in $tcp) { $sock[[string]$c.OwningProcess] = $true }
$par = @{}; foreach ($p in (Get-CimInstance Win32_Process)) { $par[[string]$p.ParentProcessId] = $true }
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='sshd.exe' OR Name='sshd-session.exe'")) {
  $cpu  = [int64]((Get-Process -Id $p.ProcessId).CPU)
  $born = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds()
  $r = [int]($p.CommandLine -match '(^|\\s)-R(\\s|$)')
  $k = [int]$par.ContainsKey([string]$p.ProcessId)
  $s = [int]$sock.ContainsKey([string]$p.ProcessId)
  "proc=$($p.Name)|$($p.ProcessId)|$($p.ParentProcessId)|$r|$k|$s|$cpu|$born"
}
`;

export function parseProbe(out: string): {
  procs: SshdProc[];
  servicePids: Set<number>;
} {
  const servicePids = new Set<number>();
  const procs: SshdProc[] = [];
  let sockOk = false;
  for (const line of out.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    const svc = /^svc=(\d+)$/.exec(t);
    if (svc !== null) {
      servicePids.add(Number(svc[1]));
      continue;
    }
    if (t === "sock_ok=1") {
      sockOk = true;
      continue;
    }
    const m =
      /^proc=(sshd(?:-session)?\.exe)\|(\d+)\|(\d+)\|([01])\|([01])\|([01])\|(\d+)\|(\d+)$/i.exec(
        t,
      );
    if (m === null) continue;
    procs.push({
      name: m[1],
      pid: Number(m[2]),
      ppid: Number(m[3]),
      isR: m[4] === "1",
      hasChild: m[5] === "1",
      hasSocket: m[6] === "1",
      cpuSeconds: Number(m[7]),
      bornMs: Number(m[8]),
    });
  }
  // An unreadable socket table means "cannot prove any process is socketless": keep them all.
  if (!sockOk) for (const p of procs) p.hasSocket = true;
  return { procs, servicePids };
}

/** The host-side kill: stop a pid only if its creation time still matches the plan. */
export function killScript(orphans: SshdProc[]): string {
  const lines = orphans.map(
    (o) =>
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${o.pid}"; ` +
      `if ($p -and @('sshd.exe','sshd-session.exe') -contains $p.Name -and ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() -eq ${o.bornMs}) ` +
      `{ Stop-Process -Id ${o.pid} -Force; "stopped=${o.pid}" } else { "skipped=${o.pid}" }`,
  );
  return `$ErrorActionPreference = 'SilentlyContinue'\n${lines.join("\n")}\n`;
}

type Ran = { code: number; out: string; timedOut: boolean };

// Same shape as reclaim-host.ts: drain both pipes with the exit in ONE Promise.all, raced against
// the abort — killing ssh does not close a pipe a grandchild still holds.
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
  return { ...done, timedOut: false };
}

async function ps(host: string, script: string): Promise<Ran> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return run(
    [
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      host,
      `powershell.exe -NoProfile -OutputFormat Text -EncodedCommand ${encoded}`,
    ],
    HOST_MS,
  );
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function describe(o: SshdProc, now: number): string {
  const ageH = ((now - o.bornMs) / 3_600_000).toFixed(1);
  return `${o.name} pid=${o.pid} cpu=${o.cpuSeconds}s age=${ageH}h`;
}

async function probe(host: string) {
  const r = await ps(host, PROBE);
  if (r.timedOut || !/sock_ok=/.test(r.out)) return null;
  const parsed = parseProbe(r.out);
  return {
    ...parsed,
    orphans: classifyOrphans(parsed.procs, parsed.servicePids),
  };
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "wsl-reap.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Reap orphaned per-connection sshd processes (sshd.exe or sshd-session.exe with -R, no child, no socket) on the Windows host. READ-ONLY plan by default; --execute stops them.",
      },
      flags: {
        host: { type: String, default: HOST_DEFAULT },
        execute: {
          type: Boolean,
          default: false,
          description: "stop the orphans (default is a read-only plan)",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    throw new UsageError(`Unexpected argument '${parsed._[0]}'`);
  }
  const { host, execute } = parsed.flags;
  if (!Bun.which("ssh")) throw new UsageError("no ssh on PATH");

  const before = await probe(host);
  if (before === null) {
    say(`cannot reach ${host} (ssh timed out or returned no probe)`);
    return 2;
  }
  const now = Date.now();
  say(
    `${host}: ${before.procs.length} sshd process(es), service pid(s) ${[...before.servicePids].join(",") || "none"}`,
  );
  if (before.orphans.length === 0) {
    say("no orphaned sshd -R");
    return 0;
  }
  for (const o of before.orphans)
    say(`  ${execute ? "stop " : "would stop "} ${describe(o, now)}`);

  if (!execute) {
    say("---");
    say(
      `${before.orphans.length} orphan(s); re-run with --execute to stop them (mise run wsl:reap -- --execute)`,
    );
    return 1;
  }

  const kill = await ps(host, killScript(before.orphans));
  const skipped = kill.out.split("\n").filter((l) => l.startsWith("skipped="));
  for (const s of skipped)
    say(`  ${s.trim()} (pid gone or reused — left alone)`);

  const after = await probe(host);
  if (after === null) {
    say("stopped, but the re-probe failed — run wsl:reap again to confirm");
    return 1;
  }
  const planned = new Set(before.orphans.map((o) => `${o.pid}:${o.bornMs}`));
  const survivors = after.orphans.filter((o) =>
    planned.has(`${o.pid}:${o.bornMs}`),
  );
  say("---");
  if (survivors.length > 0) {
    say(
      `${survivors.length} orphan(s) survived: ${survivors.map((o) => o.pid).join(",")}`,
    );
    return 1;
  }
  say(
    `reaped ${before.orphans.length - skipped.length} orphan(s); live sessions untouched (${after.procs.length} sshd remain)`,
  );
  return 0;
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(
        `FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(2);
    });
}
