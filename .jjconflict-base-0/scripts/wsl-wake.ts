import { cli } from "cleye";

// Start the WSL distro on a Windows host, and leave the GUEST actually reachable, from the Mac.
// Consumer: human/agent running `mise run wsl:wake`; output is verdict lines.
//
// WHY THIS EXISTS, and why the obvious answer was wrong. When Windows Update reboots the box
// overnight it stops at the logon screen, and the two recovery tasks (WSL-keepalive, WSL-revive)
// are `onlogon`-triggered, so WSL never starts. That fact was read as "unattended recovery needs
// auto-logon", and a long detour followed (Sysinternals Autologon, LsaStorePrivateData by
// P/Invoke, AutoLogonSID removal) — none of it logs in a MicrosoftAccount that has Windows Hello.
// Measured 2026-09-12 with Windows parked at the logon screen: `wsl.exe` over ssh STARTS THE
// DISTRO ANYWAY, exit 0. The onlogon limit belongs to Task Scheduler, not to WSL.
//
// TWO ROUTES, TRIED IN ORDER — the 2026-09-17 fix. The host is reached over an ssh ALIAS, and the
// right alias depends on a state this script cannot know in advance:
//   r99-lan (mDNS, LAN)   works at the LOGON SCREEN, where Windows Tailscale — a user-session GUI
//                         client — is down, but sshd (a service) answers on the LAN. FAILS when
//                         the caller is not on the same LAN segment (measured: off-subnet, the
//                         mDNS name did not resolve and `wsl:wake` failed outright).
//   r99 (tailnet)         works from ANYWHERE once the box is logged in or Tailscale runs
//                         unattended. Down at the logon screen with attended Tailscale.
// Neither covers both situations, so this tries r99-lan first, then r99. `--host X` pins one.
//
// THE ANCHOR IS NOT OPTIONAL. A bare `wsl.exe --exec /bin/true` returns, its attachment closes,
// and WSL shuts the distro down ~60s later — measured. WSL counts a Windows-side wsl.exe
// attachment as "in use"; work INSIDE the distro does not (see the r99-wsl-lifecycle memory). So
// this launches a detached `tail -f /dev/null` to hold one open.
//
// RUNNING IS NOT REACHABLE — the second 2026-09-17 fix. The distro can be Running while `ssh
// <guest>` still times out, because ssh.service inside WSL did not come up (measured: distro up
// 3h, ss showed nothing on the sshd port, `systemctl start ssh` fixed it). Its tailnet node
// answers regardless of Windows logon once the distro's own tailscaled is up, so the guest is the
// right thing to verify. This ends by probing the guest and, if it is silent, starting sshd
// through the host before re-checking — the distro being Running is a means, a reachable guest is
// the goal.

const HOST_FALLBACK = ["r99-lan", "r99"]; // r99-lan for the logon screen, r99 for everywhere else
const GUEST_DEFAULT = "r99-wsl";
const DISTRO_DEFAULT = "Ubuntu-24.04";
const SSH_MS = 60_000; // interop on this host measured 0.85-1.9s; 60s is a bound, not an estimate
const GUEST_MS = 15_000; // a guest `true` is a TCP connect + trivial exec; 15s catches a hang
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

type Ran = { code: number; out: string; timedOut: boolean };

// Every subprocess bounded, drain raced against the abort: killing ssh does not close a pipe a
// grandchild still holds, so awaiting the drain alone is unbounded (learned in reclaim-system.ts).
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
  return { ...done, out: done.out.replace(/\r/g, "").trim(), timedOut: false };
}

// The host inventory is machine-local (public repo); an explicit --host pins ONE alias, otherwise
// the fallback list is tried in order. Exported so a test can assert the pin-vs-fallback choice
// without reaching for ssh.
export function hostCandidates(hostFlag: string | undefined): string[] {
  return hostFlag === undefined || hostFlag === "" ? HOST_FALLBACK : [hostFlag];
}

// Return the first host whose probe yields usable output, paired with that output. `probe` is
// injected so the selection logic — try in order, first non-empty wins, all-fail is null — is
// testable without a network. A timed-out or empty probe is "not reachable", never a false win.
export async function firstReachable(
  hosts: string[],
  probe: (host: string) => Promise<string | null>,
): Promise<{ host: string; out: string } | null> {
  for (const host of hosts) {
    const out = await probe(host);
    if (out !== null && out !== "") return { host, out };
  }
  return null;
}

// `-l -v` is the only distro-state read that does not itself attach and thus keep the distro alive.
function stateCmd(distro: string): string {
  return `$env:WSL_UTF8=1; (((wsl.exe -l -v | Out-String) -split "\`n" | Select-String "${distro}") -replace "\\s+"," ").Trim()`;
}

async function probeState(
  host: string,
  distro: string,
): Promise<string | null> {
  const r = await run(
    ["ssh", "-o", "ConnectTimeout=10", host, stateCmd(distro)],
    SSH_MS,
  );
  // Non-zero exit is a REACHABILITY failure, not distro state: ssh exits 255 with the error on
  // stderr when a name will not resolve or the port will not connect, and run() folds stderr into
  // `out`. Returning that string as if it were state made the LAN alias's "Could not resolve"
  // look like a successful probe, so the tailnet fallback never ran (measured off-subnet
  // 2026-09-17). Only a clean exit with output that names the distro counts as reached.
  if (r.timedOut || r.code !== 0) return null;
  return r.out.includes(distro) ? r.out : null;
}

async function guestReachable(guest: string): Promise<boolean> {
  const r = await run(
    ["ssh", "-o", "ConnectTimeout=8", guest, "true"],
    GUEST_MS,
  );
  return !r.timedOut && r.code === 0;
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
          "Start the WSL distro and leave the guest ssh-reachable. Tries the LAN alias then the tailnet alias; no logon required.",
      },
      flags: {
        host: {
          type: String,
          default: "",
          description:
            "pin ONE ssh alias for the host; default tries r99-lan then r99",
        },
        guest: { type: String, default: GUEST_DEFAULT },
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
  const { guest, distro } = parsed.flags;

  if (!Bun.which("ssh")) {
    console.log("no ssh on PATH");
    process.exit(1);
  }

  const candidates = hostCandidates(parsed.flags.host);
  const reached = await firstReachable(candidates, (h) =>
    probeState(h, distro),
  );
  if (reached === null) {
    console.log(`cannot reach the host via ${candidates.join(" or ")}`);
    console.log(
      "  The LAN alias needs the same subnet; the tailnet alias needs the box logged in or",
    );
    console.log(
      "  Tailscale unattended. Override HostName in ~/.ssh/config.local if the name will not resolve.",
    );
    process.exit(1);
  }
  const { host } = reached;
  console.log(`host:   ${host}`);
  console.log(`before: ${reached.out}`);

  if (parsed.flags.status) {
    console.log(
      `guest:  ${(await guestReachable(guest)) ? "reachable" : "unreachable"}`,
    );
    return;
  }

  if (!reached.out.includes("Running")) {
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
    const after = await probeState(host, distro);
    console.log(`after:  ${after ?? "(state read failed)"}`);
    if (after === null || !after.includes("Running")) {
      console.log(
        `FAILED: ${distro} did not reach Running${wake.out ? ` — ${wake.out}` : ""}`,
      );
      process.exit(1);
    }
  } else {
    console.log("already running");
  }

  // Running is not reachable. Give the guest a moment (a fresh boot needs sshd + tailscaled), then
  // verify; if it is silent, start sshd through the host — the distro being up is not the goal.
  if (await guestReachable(guest)) {
    console.log(`guest:  ${guest} reachable`);
    return;
  }
  console.log(`guest:  ${guest} not answering — starting sshd via ${host}`);
  await run(
    [
      "ssh",
      "-o",
      "ConnectTimeout=10",
      host,
      `wsl.exe -d ${distro} -u root --exec /usr/bin/systemctl start ssh`,
    ],
    SSH_MS,
  );
  await Bun.sleep(SETTLE_MS);
  if (await guestReachable(guest)) {
    console.log(`guest:  ${guest} reachable after sshd start`);
    return;
  }
  console.log(
    `guest:  ${guest} STILL unreachable — distro is Running but ssh is not; check tailscaled inside the guest`,
  );
  process.exit(1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
