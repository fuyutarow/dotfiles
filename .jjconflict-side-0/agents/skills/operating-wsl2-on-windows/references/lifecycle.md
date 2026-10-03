# Lifecycle — why the box goes unreachable, and how to bring it back

This owns RECOVERY: the box is down or unreachable, diagnose which layer and restore it. It does NOT
own the standing config that keeps it reachable. The ssh anchor, Tailscale placement, the keepalive
pin, and unattended Tailscale are **prevention config**. That is owned by `securing-remote-access`,
in its `wsl2-mac.md` Setup 4. This file points there, not duplicates it. The cut: configure it to
stay up → there; it went down anyway → here.

## The three ways it goes unreachable

| Cause | Mechanism | Signal |
|---|---|---|
| idle-terminate | WSL stops a distro with no live Windows-side attachment ~seconds after the last one detaches; work INSIDE the guest does not count as "in use" | host ssh works, `wsl -l -v` shows Stopped |
| logon-screen reboot | Windows Update reboots overnight and parks at the logon screen; the recovery scheduled tasks are `onlogon`, so they never fire | the box is unreachable over the tailnet, was rebooted |
| C: exhaustion | a full host drive wedges the guest with no guest-side error | everything hangs; wsl:audit shows C: near zero |
| boot blocked on a systemd job | systemd holds `sysinit.target` until one running job ends; ssh and tailscaled wait behind it | distro Running, `systemctl is-system-running` = `initializing` for minutes, guest ssh down |
| VM death / crash-loop | the whole WSL VM dies, not a graceful stop — a crash-looping in-VM subsystem (e.g. a GUI/weston component) can take it down even with zero GUI users | `wsl -l -v` shows Stopped, but it re-dies right after a wake; host event log shows repeated service terminations |

**Wake vs revive.** `wsl:wake` attaches a Stopped-but-healthy VM once. A VM that keeps dying needs
the death fixed first (e.g. `guiApplications=false` for a weston crash-loop) — a periodic re-wake
would only automate the loop. Fix the death, then wake.

## Why the logon screen is not the trap it looks like

The `onlogon` limit belongs to **Task Scheduler, not to WSL**. Measured: `wsl.exe` invoked over ssh
STARTS THE DISTRO ANYWAY at the logon screen, exit 0. A long detour into auto-logon was wasted
(Sysinternals Autologon, LsaStorePrivateData by P/Invoke, AutoLogonSID). None of it logs in a
MicrosoftAccount with Windows Hello, and none of it was needed. The goal is a running distro, and
`wsl.exe` over ssh reaches it directly.

## The anchor — why a bare wake does not hold

`wsl.exe --exec /bin/true` returns, its attachment closes, and WSL stops the distro ~60s later. So a
wake must leave a **detached attachment** open — a hidden, detached `tail -f /dev/null` under
`wsl.exe -u root`. Verified: still Running 75s later with no logon session.

## Running is not reachable

The distro can be Running while `ssh <guest>` still times out. Measured: distro up 3 h, ssh.service
inside WSL never started, `systemctl start ssh` fixed it. Tailscale-in-WSL is a userspace service;
it comes up on its own regardless of Windows logon. So the guest's tailnet node is what to verify. A
wake that stops at "Running" is only half done.

**`initializing` that does not end is a job, not a slow boot.** Find the one job in state `running`:

```powershell
wsl.exe -d Ubuntu-24.04 -u root --exec systemctl list-jobs --no-pager   # the row whose STATE is "running"
wsl.exe -d Ubuntu-24.04 -u root --exec systemctl kill --signal=SIGKILL <that-unit>
```

Killing it lets boot finish; ssh and tailscaled then start. Polling `is-system-running` changes nothing.

| Running job | Why it blocks | Safe to kill? |
|---|---|---|
| `systemd-tmpfiles-setup.service` | Ubuntu's `D /tmp` rule deletes `/tmp` at boot; `/tmp` is ext4 here, not tmpfs | yes — the rest is removed next boot |
| anything else | read `systemctl status <unit>` first | decide per unit |

## Before any restart — measure, in this order

1. **C: free.** A nearly full host drive explains a hung guest, hung `wsl.exe`, and a stuck boot at once.
2. **`wsl -l -v`**, with a timeout. Stopped → `wsl:wake`. Running → step 3.
3. **`systemctl is-system-running`** via `wsl.exe -u root`. `initializing` → the job table above.

Bound every `wsl.exe` call over ssh and send ONE at a time. Retrying a hung call stacks processes.
Measured: eight `wsl.exe` piled up on r99 while an agent kept retrying.

## Never keep state in the guest's /tmp

`/tmp` survives a restart on disk, then boot deletes all of it (`D /tmp` in `tmpfiles.d/tmp.conf`).
Two costs follow. Everything there is gone, and deleting it can block boot for many minutes.
Claude Code's per-session scratchpad lives under `/tmp/claude-<uid>/` on Linux.
So worktrees or run state created there are lost at the next restart; put them under `$HOME`.

## Passing a script from the host into the guest

Quotes do not survive ssh → PowerShell → `wsl.exe` → `sh`. Base64 the script instead:

```bash
G=$(base64 < script.sh | tr -d '\n')
printf '%s' "wsl.exe -d Ubuntu-24.04 -u root --exec /bin/sh -c 'echo $G | base64 -d | sh'" > run.ps1
ssh <host> "powershell -NoProfile -EncodedCommand $(iconv -f UTF-8 -t UTF-16LE run.ps1 | base64 | tr -d '\n')"
```

## The two routes to the host

| Route | Works when | Fails when |
|---|---|---|
| LAN alias (mDNS) | at the logon screen, where Windows Tailscale (a GUI client) is down but sshd (a service) answers | you are off the box's subnet — the mDNS name will not resolve |
| tailnet alias | the box is logged in, or Tailscale runs unattended — from anywhere | at the logon screen with attended Tailscale |

Neither covers both, so try the LAN alias first, then the tailnet alias. A non-zero ssh exit is a
reachability failure, not distro state. Do not read an unresolvable-host error as a successful probe
— that bug made the fallback never run.

Both aliases are ssh config entries (HostName/Port/User) in the untracked `~/.ssh/config.local`, not
in this repo. Provisioning them is access config, owned by `securing-remote-access` (its
`wsl2-mac.md`) — that includes the LAN-specific alias `wsl:wake`'s first route needs. If the LAN
route is absent, that alias was never set up; `wsl:wake` still works via the tailnet alias alone.

## wsl:wake encodes all of it

`mise run wsl:wake` (`scripts/wsl-wake.ts`) does all of it. It tries the LAN route then the tailnet
route. It wakes a Stopped distro with the detached anchor. Then it verifies the guest and starts
sshd through the host if the guest is silent. `--status` reports only; `--host` pins one route.

Its wake and sshd-start both invoke `wsl.exe -d <distro> -u root --exec …` into the guest. That is
the same primitive the keepalive schtask uses (`securing-remote-access`, Setup 4). A distro rename
or exec-path change must be mirrored in both.

## The durable prevention (owned elsewhere — apply it once)

To stop the logon-screen row recurring, set Tailscale on Windows to run unattended:
`tailscale set --unattended=true`. The tailnet node then survives with no user session, so the LAN
route stops being the only off-subnet option. This is reachability config; the how and its
trade-offs live in `securing-remote-access`. This skill only names it as the fix that retires the
recurring failure.
