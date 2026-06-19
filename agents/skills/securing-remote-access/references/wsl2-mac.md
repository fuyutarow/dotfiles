# Applied: the robust Mac ↔ Windows ↔ WSL full chain

A worked example of the whole skill, tuned for **robustness with no compromise on Linux
access**. Goal: from a Mac, reach a home Windows box's native shell *and* its WSL2 Linux
environment, on‑LAN and remotely, with VS Code Remote‑SSH into either — and never get locked
out. The lessons generalize to "expose both a host OS and a guest Linux behind one entry point."

> **Identities & placeholders used throughout** (they genuinely differ — confirm with `whoami` on
> each side): `<windows-account>` = your Windows login (this deployment: `fuyutarow`); `<wsl-user>`
> = your Linux user inside the distro (`fuyu`); `<distro>` = the distro name from `wsl.exe -l -q`
> (`Ubuntu-24.04`). The example values are this box's, not constants. There is also a **Field
> notes** section at the bottom — the concrete things that bit during a real 2026‑06 deployment;
> if you're retreading this, read those first.

## Design principle: make the always‑on anchor a Windows *service*, not WSL

WSL2 is fragile *as an always‑on server* (idle‑shutdown trap, no init by default, suspends
services on recent builds). The fix is to stop making WSL the thing that must stay up. Put the
always‑on entry point on **Windows services** (Tailscale + native OpenSSH), and reach WSL
*behind* that anchor, starting it on demand.

```
       ┌─ ssh win  ───────────────────────▶ Windows shell (native)
Mac ──Tailscale──▶ Windows host
   (always-on)     (native OpenSSH = a Windows service = always-on anchor)
       └─ ssh wsl  (ProxyJump win → 127.0.0.1:2222) ─▶ WSL Ubuntu sshd (real Linux)
                    localhostForwarding bridges Windows→WSL; no mirrored net, no portproxy
```

**Why this is robust — you are never locked out.** Both the reachability layer (Tailscale,
a Windows service) and the entry SSH (native OpenSSH, a Windows service) come up at boot,
before login, independent of WSL. If WSL is down, `ssh win` still works and you start WSL from
there. The thing that used to strand you (WSL dying) can no longer block access — it only
delays the inner hop, which you can trigger on demand. This independence is also why the chain
survives the `wsl.exe -e` breakage that systemd can introduce (see Field notes).

## Reachability mechanics (why the inner hop needs no mirrored mode)

- WSL runs sshd on `0.0.0.0:2222` (a *different* port from the Windows sshd on `:22`, so they
  don't clash).
- With **NAT networking + `localhostForwarding=true`** (the default WSL mechanism), a Windows
  process can reach a WSL listener at `127.0.0.1:<port>`. So on the Windows host,
  `127.0.0.1:2222` reaches WSL's sshd.
- `ssh wsl` uses `ProxyJump win`: it connects to the Windows sshd over Tailscale, then from
  Windows opens a forwarded channel to `127.0.0.1:2222` → WSL sshd. No mirrored networking, no
  `netsh portproxy`, no Tailscale‑inside‑WSL, no host→WSL IP bookkeeping.
- *Fallback if `localhostForwarding` is flaky on your build* (it sometimes needs a
  `wsl --shutdown` to reset): either `networkingMode=mirrored` (then target the host name:2222
  directly) or a boot‑time `netsh interface portproxy` refresh. Prefer fixing localhostForwarding
  first — it's the least‑moving‑parts path.

## Setup 1 — Windows host (run in an **elevated** PowerShell)

An admin PowerShell opens in `C:\WINDOWS\system32` with *Administrator* in the title; a window
opening in `C:\Users\you` is **not** elevated and these commands will misbehave.

```powershell
# Tailscale (reachability, no open ports) — installs as an auto-start service.
# EXACT winget id; bare `winget install tailscale` is ambiguous and aborts.
winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
# `tailscale` is NOT on PATH in this same shell after install — open a NEW window, or use the
# GUI tray (Connected + a 100.x.y.z address == `tailscale up` already done). Note that 100.x IP.

# Native OpenSSH Server (the always-on SSH anchor) — a real Windows service.
# The capability install can look like a no-op; VERIFY the service exists afterward.
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Get-Service sshd | Format-Table Name,Status,StartType     # must EXIST; if absent, the FoD didn't land
Set-Service sshd -StartupType Automatic; Start-Service sshd
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True `
  -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

**authorized_keys on Windows has a gotcha:** if the login user is an Administrator, OpenSSH reads
`C:\ProgramData\ssh\administrators_authorized_keys` (NOT `~/.ssh/authorized_keys`), and that file
must be owned by Administrators/SYSTEM with no other write access:
```powershell
$k = "ssh-ed25519 AAAA... <wsl-user>@mac"   # your Mac's public key (FIDO2 sk-key recommended)
$f = "$env:ProgramData\ssh\administrators_authorized_keys"
Add-Content $f $k
icacls $f /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

## Setup 2 — WSL (run inside the Ubuntu distro)

```bash
# systemd (so sshd survives a WSL boot): write /etc/wsl.conf, preserving [interop]
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true

[interop]
enabled=true
appendWindowsPath=true
EOF

sudo apt update && sudo apt install -y openssh-server
sudo tee /etc/ssh/sshd_config.d/10-wsl.conf >/dev/null <<'EOF'
Port 2222
ListenAddress 0.0.0.0
PasswordAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
EOF
sudo ssh-keygen -A
# install the Mac key (no sudo needed — it's your own file)
install -d -m 700 ~/.ssh
printf '%s\n' 'ssh-ed25519 AAAA... <wsl-user>@mac' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
sudo sshd -t           # validate before relying on it
```
Then, from Windows, `wsl --shutdown` to apply systemd. Re‑open Ubuntu and enable sshd — but
**disable `ssh.socket` first**, or socket activation keeps listening on `:22` and your `Port 2222`
drop‑in is ignored (a real trap on Ubuntu 24.04):
```bash
sudo systemctl disable --now ssh.socket
sudo systemctl enable  --now ssh.service
sudo ss -tlnp | grep 2222     # confirm 0.0.0.0:2222 before moving on
```

> `appendWindowsPath=true` above is a choice: it lets `code` / `winget.exe` resolve inside WSL.
> If you prefer a clean PATH (`=false`), Windows tools won't be on PATH in WSL by design — add
> just the dirs you want (ideally in `wsl/.zprofile`, not shared rc files).

## Setup 3 — `.wslconfig` (`%UserProfile%\.wslconfig`, under `[wsl2]`)

```ini
networkingMode is left at default (NAT) — do NOT set mirrored here
localhostForwarding=true     # bridges Windows 127.0.0.1:2222 → WSL sshd
vmIdleTimeout=-1             # compute server: don't idle the VM out
```

## Setup 4 — keep WSL pinned so the inner hop is ready

The Windows anchor is always up; WSL only needs to be *running* for `ssh wsl`. As of mid‑2026
(through WSL 2.7.x, verified on 2.7.8.0) a regression introduced around 2.5.7 still **suspends
in‑VM services even with `vmIdleTimeout=-1`** (microsoft/WSL #13291, #13416 — open), so the VM
needs a never‑exiting in‑distro process to stay resident. (If a future WSL keeps services resident
on its own, this step becomes optional — re‑check those issues.) Pin it at logon:

```bat
:: Created as — and runs as — your interactive Windows user; that is the requirement (see below).
:: <distro> from `wsl.exe -l -q` (this box: Ubuntu-24.04). No /ru or /rl highest needed.
schtasks /create /tn WSL-keepalive /sc onlogon /f ^
  /tr "C:\Windows\System32\wsl.exe -d <distro> -u root --exec /usr/bin/tail -f /dev/null"
```

`tail -f /dev/null` never exits, holding the VM (hence systemd → sshd) alive. **An onlogon task
does not fire when created** — trigger it once with `schtasks /run /tn WSL-keepalive` (or log
out/in), then confirm with `wsl.exe -l --running` and, inside the distro, `ss -tlnp | grep 2222`.
Even if the task never runs you're not locked out — `ssh win` then `wsl` recovers.

**Trigger choice — a real decision:**

- **`onlogon` (above)** runs in your real interactive logon. WSL hands each Windows user its own
  session/instance (the utility VM is shared machine‑wide, but `WslService` gives each user its own
  `LxssUserSession`), and your inbound SSH rides *your* logged‑in user's instance. `onlogon` pins
  exactly that — from a **non‑elevated** shell, with **no stored credential**. "Locked" still counts
  as "logged on". Limit: after a fully *unattended* reboot it won't fire until someone logs in, but
  `ssh win` still reaches the box to poke WSL (enable autologon if it must self‑heal).
- **`onstart`** fires at boot with no session, but "run whether logged on or not" as a user needs a
  **stored password** (fails for passwordless / Hello‑only accounts), and wants `powercfg /h off`
  (elevated; disables hibernation machine‑wide) so hybrid‑shutdown doesn't make the boot trigger
  fire inconsistently. None of that is needed for `onlogon`.
- **Never `SYSTEM`.** `wsl.exe` from session 0 is unsupported — Access‑denied or a throwaway temp
  instance (microsoft/WSL #9271, #9231) — so a SYSTEM task can't pin the instance your interactive
  logon and SSH actually use.

> `/ru <windows-account> /rl highest` also works but must be created from an **elevated** shell and
> buys nothing for a `tail -f /dev/null` pin — prefer the minimal form above. Use absolute
> `/usr/bin/tail` with `--exec` so `-f /dev/null` isn't parsed as wsl's own flags.

## Setup 5 — Mac `~/.ssh/config`

```
Host win
    HostName 100.x.y.z                # the host's Tailscale IP (or MagicDNS name); LAN IP works too
    User <windows-account>           # your WINDOWS username (e.g. fuyutarow) — NOT the WSL user; confirm with `whoami`
    AddKeysToAgent yes
    UseKeychain yes
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 15m

Host wsl
    HostName 127.0.0.1
    Port 2222
    User <wsl-user>                   # the WSL Linux user (often DIFFERENT from the Windows account)
    ProxyJump win
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 15m
```
`ssh win` → Windows; `ssh wsl` → WSL Ubuntu (jumped through Windows). Both names are stable
on‑LAN and remote. In VS Code: Remote‑SSH → "Connect to Host" → `win` for Windows, `wsl` for
Linux. The WSL one installs the VS Code server inside Ubuntu = full Linux remote dev. (Use
Remote‑**SSH** here, not Remote‑WSL — see Field notes.)

For the strongest credential, make the Mac key a FIDO2 hardware key (`ssh-keygen -t ed25519-sk
-O resident -O verify-required`) and put *that* `.pub` in both authorized_keys files. For
roaming terminal work: `mosh <wsl-user>@<win-tailnet-name>` (to Windows) or run mosh+tmux inside
WSL after jumping in.

## Tailscale placement — anchor on stock OpenSSH; the in‑WSL node is additive

Tailscale is unbeatable at **reachability with no open ports** — let it do only that, and keep
**stock OpenSSH** as the server on both ends. Two reasons not to lean on **Tailscale SSH**
(`--ssh`) as the load‑bearing server here:

1. **Platform:** its SSH server runs only on Linux and the open‑source macOS build — never the
   Windows client — so it can't be the anchor on a Windows box (Tailscale FR #14942, still open).
2. **Editor remoting:** embedded/forked SSH servers lag stock OpenSSH on IDE‑remoting edge cases
   (Tailscale's #5295 broke VS Code Remote‑SSH for a long time, since fixed). Verify your editor
   against the specific build rather than assuming parity — stock OpenSSH is what IDE remoting is
   primarily developed and tested against. (Citation/date live in `survey.md`, not restated here.)

**Putting Tailscale *inside* WSL is still worth it — as an additive convenience, not the primary.**
Once WSL has a TUN device (`ls /dev/net/tun` exists → kernel mode, no userspace fallback), a Mac
can reach Linux **directly**, skipping the Windows jump and `localhostForwarding`. Keep it additive:
the in‑WSL daemon lives in the same VM that suspends (Setup 4), so when the VM dies the node goes
*offline* — it can't be the always‑on anchor, and Setup 4's keep‑alive is what keeps it reachable.
There are two ways to expose it; **prefer path 1**:

- **Path 1 — plain sshd over the tailnet IP (verified, editor‑safe).** Just put the node on the
  tailnet (`tailscale up`, *without* `--ssh`); WSL gets its own `100.x` address and your existing
  `0.0.0.0:2222` sshd (Setup 2) is reachable at `<wsl-tailnet-ip>:2222` with the **same key already
  in `authorized_keys`** — no new auth surface, fully compatible with editors and Claude Code. This
  is what the live deployment runs (`RunSSH=false`).
- **Path 2 — Tailscale SSH (`--ssh`), only if you want keyless tailnet‑identity auth.** Then the
  ACL matters: authorize with `action: "accept"`, **not** `check` (on a headless/automated box
  `check`'s periodic IdP re‑auth blocks non‑interactive reconnects — Claude Code, tmux‑resume,
  cron), and **never tag this node** (an untagged node is authorized via `autogroup:self`; adding
  any tag drops it and the SSH rule silently evaporates — a no‑error lockout).

**Install `tailscaled` with apt, not Homebrew** — a systemd question, not taste. apt ships a **root
system unit** (`/usr/lib/systemd/system/tailscaled.service`) that starts at boot, which is what a
headless daemon and the Setup 4 chain need; `brew services` on Linux *defaults* to a **`--user`**
unit that can't own the TUN device and needs `loginctl enable-linger` to survive logout. Treat
`tailscaled` as system infrastructure (apt), not a Brewfile CLI.

```bash
# In WSL as root. Codename comes from the distro itself, so this isn't pinned to one release:
. /etc/os-release          # sets $VERSION_CODENAME (e.g. noble on Ubuntu 24.04)
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" \
  -o /usr/share/keyrings/tailscale-archive-keyring.gpg
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.tailscale-keyring.list" \
  -o /etc/apt/sources.list.d/tailscale.list
apt update && apt install -y tailscale
systemctl enable --now tailscaled
tailscale up                                    # add --ssh only for Path 2
```

## Field notes (from a real 2026‑06 Mac ↔ Win ↔ WSL deployment)

Things that actually bit, roughly in order — fold these into any retread:

- **Run the Windows steps *elevated*.** Admin PowerShell opens in `C:\WINDOWS\system32` (title
  says *Administrator*); a window opening in `C:\Users\you` is not elevated, and
  `Add-WindowsCapability` / `New-NetFirewallRule` then misbehave.
- **OpenSSH Server can "install" and still not be there.** `Add-WindowsCapability` may print
  nothing useful and `Get-Service sshd` still says *Cannot find any service* — re‑run / check
  `Get-WindowsCapability -Online -Name OpenSSH.Server*` shows `Installed`. Always verify the
  service exists before moving on.
- **winget id must be exact.** `winget install tailscale` is ambiguous (also matches a
  Command‑Palette add‑on); use `--id Tailscale.Tailscale -e`. After install, `tailscale` isn't on
  PATH in the same shell — new window, or use the tray (which already shows it Connected + 100.x).
  (The `ssh.socket`‑overrides‑`Port` and `appendWindowsPath` traps are covered inline in Setup 2.)
- **Windows user ≠ WSL user.** `ssh win` → the Windows account (`<windows-account>`); `ssh wsl` →
  the Linux user (`<wsl-user>`). Mixing them fails auth with no clear reason.
- **Enabling systemd broke `wsl.exe -e <cmd>`** with `Wsl/Service/E_UNEXPECTED "Catastrophic
  failure"` — which *also* broke **VS Code Remote‑WSL** (it shells out via `wsl -e`). Interactive
  `wsl` was fine. `wsl --update` clears it. Crucially `ssh wsl` (Remote‑SSH) was unaffected — it
  rides localhostForwarding, not `wsl -e` — so **when Remote‑WSL is flaky, use Remote‑SSH to the
  `wsl` host instead.**
- **"Failed to start the systemd user session for '<wsl-user>'" is benign** — sshd is a *system*
  service. (`sudo apt install dbus-user-session` + `wsl --shutdown` often silences it; optional.)
- **zsh does NOT treat `#` as an inline comment by default.** A command pasted with a trailing
  `… # note` sends the comment as arguments (you'll see `Invalid unit name "#"` etc.). When handing
  zsh users something to paste, omit inline comments.
- **Editing WSL files when `wsl -e` is down:** reach them from Windows at
  `\\wsl.localhost\<distro>\home\<wsl-user>\…` — the 9p file share works even when command‑exec
  (`wsl -e`) is throwing `E_UNEXPECTED`.
- **Quoting through Windows → wsl → bash is lossy:** a `VAR="…"` assignment passed as a `wsl … -e`
  argument can silently arrive empty. Pipe data over **stdin** instead:
  `printf '%s\n' '<value>' | wsl -d <distro> -- bash -c 'cat > file'`.
- **Claude Code honors `ProxyCommand`, not `ProxyJump`** (anthropics/claude-code#44838). The
  `Host wsl` block uses `ProxyJump win` — correct for OpenSSH and VS Code. If you also drive this
  host from Claude Code, give it an equivalent entry with `ProxyCommand ssh win -W %h:%p`, or it
  won't traverse the jump.
- **Auto-attaching tmux on inbound SSH must exclude the break-glass relay.** If you wrap logins in
  tmux so long jobs survive drops, gate it so the **:2222 relay always yields a raw shell** (your
  recovery path), skip when `$SSH_ORIGINAL_COMMAND` is set (editor / Claude Code bootstrap shells
  must not be wrapped), and bound the calls with `timeout … || true` so a wedged tmux server can
  never hang the login.
