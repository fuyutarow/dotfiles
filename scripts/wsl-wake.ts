import { cli } from "cleye";

// Start the WSL distro on a Windows host that is sitting at its LOGON SCREEN, from the Mac.
// Consumer: human/agent running `mise run wsl:wake`; output is verdict lines.
//
// WHY THIS EXISTS, and why the obvious answer was wrong. When Windows Update reboots the box
// overnight it stops at the logon screen, and the two recovery tasks (WSL-keepalive, WSL-revive)
// are `onlogon`-triggered, so WSL never starts. That fact was read as "unattended recovery needs
// auto-logon", and a long detour followed: Sysinternals Autologon (winget build and the genuine
// download, both exit 1 over ssh and via scheduled task), then LsaStorePrivateData by P/Invoke
// (rc=0, AutoAdminLogon=1), then removing AutoLogonSID. None of it logged the machine in — the
// account is a MicrosoftAccount with Windows Hello (an Ngc container exists), a combination
// Microsoft deliberately makes hard to auto-logon.
//
// The detour was unnecessary. Measured 2026-09-12 with Windows parked at the logon screen:
// `wsl.exe` invoked over ssh STARTS THE DISTRO ANYWAY, exit 0, and the tailnet node comes back.
// The onlogon limitation belongs to Task Scheduler, not to WSL. Auto-logon was a means mistaken
// for the goal; the goal is a running distro, and this reaches it directly.
//
// THE ANCHOR IS NOT OPTIONAL. A bare `wsl.exe --exec /bin/true` returns, its attachment closes,
// and WSL shuts the distro down ~60s later — measured: Running, then Stopped after 60s. WSL
// counts a Windows-side wsl.exe attachment as "in use"; work INSIDE the distro does not count
// (see the r99-wsl-lifecycle memory). So this launches a detached `tail -f /dev/null` to hold one
// open. Verified: still Running 75s later with two wsl.exe processes alive, no logon session.
//
// Uses r99-lan (mDNS, LAN) rather than r99 (tailnet) BECAUSE the tailnet is exactly what is
// missing in this situation: Tailscale on Windows is a user-session GUI client, so its address is
// unreachable until someone logs in. sshd is a service and answers on the LAN throughout.

const HOST_DEFAULT = "r99-lan";
const DISTRO_DEFAULT = "Ubuntu-24.04";
const SSH_MS = 60_000; // interop on this host measured 0.85-1.9s; 60s is a bound, not an estimate
const SETTLE_MS = 5_000; // let the distro finish booting before the state read

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

// Every subprocess bounded, drain raced against the abort: killing ssh does not close a pipe a
// grandchild still holds, so awaiting the drain alone is unbounded (learned in wsl-reclaim.ts).
async function run(
  cmd: string[],
  ms: number,
): Promise<{ code: number; out: string; timedOut: boolean }> {
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
  return { ...done, out: done.out.replace(/\r/g, "").trim(), timedOut: false };
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "wsl-wake.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Start the WSL distro on a Windows host stuck at its logon screen, over the LAN. No logon required.",
      },
      flags: {
        host: { type: String, default: HOST_DEFAULT },
        distro: { type: String, default: DISTRO_DEFAULT },
        status: { type: Boolean, default: false },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    throw new UsageError(`Unexpected argument '${parsed._[0]}'`);
  }
  const { host, distro } = parsed.flags;

  if (!Bun.which("ssh")) {
    console.log("no ssh on PATH");
    process.exit(1);
  }

  // `-l -v` is the only state read that does not itself attach and thus keep the distro alive.
  const stateCmd = `$env:WSL_UTF8=1; (((wsl.exe -l -v | Out-String) -split "\`n" | Select-String "${distro}") -replace "\\s+"," ").Trim()`;
  const before = await run(
    ["ssh", "-o", "ConnectTimeout=10", host, stateCmd],
    SSH_MS,
  );
  if (before.timedOut || before.out === "") {
    console.log(`cannot reach ${host} (ssh timed out or returned nothing)`);
    console.log(
      "  If the LAN name does not resolve, override HostName in ~/.ssh/config.local.",
    );
    process.exit(1);
  }
  console.log(`before: ${before.out}`);

  if (parsed.flags.status) return;

  if (before.out.includes("Running")) {
    console.log("already running — nothing to do");
    return;
  }

  // Detached and hidden: the anchor must outlive this ssh session, and there is no desktop to
  // draw a window on at the logon screen anyway.
  const wakeCmd =
    `Start-Process -FilePath "C:\\Windows\\System32\\wsl.exe" ` +
    `-ArgumentList "-d ${distro} -u root --exec /usr/bin/tail -f /dev/null" -WindowStyle Hidden`;
  const wake = await run(
    ["ssh", "-o", "ConnectTimeout=10", host, wakeCmd],
    SSH_MS,
  );
  if (wake.timedOut) {
    console.log(
      `ssh timed out after ${SSH_MS / 1000}s while starting the distro`,
    );
    process.exit(1);
  }

  await Bun.sleep(SETTLE_MS);
  const after = await run(
    ["ssh", "-o", "ConnectTimeout=10", host, stateCmd],
    SSH_MS,
  );
  console.log(`after:  ${after.out}`);

  if (!after.out.includes("Running")) {
    console.log(
      `FAILED: ${distro} did not reach Running${wake.out ? ` — ${wake.out}` : ""}`,
    );
    process.exit(1);
  }
  console.log("---");
  console.log(
    "The distro holds itself up via a detached `tail -f /dev/null` attachment; WSL",
  );
  console.log(
    "would otherwise stop it ~60s after the last Windows-side wsl.exe detaches.",
  );
  console.log(
    "Its tailnet node returns within seconds — `herdr --remote` is usable again.",
  );
}

main().catch((err) => {
  console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(err instanceof UsageError ? 2 : 1);
});
