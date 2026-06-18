# Applied: the robust Mac ↔ Windows ↔ WSL full chain

A worked example of the whole skill, tuned for **robustness with no compromise on Linux
access**. Goal: from a Mac, reach a home Windows box's native shell *and* its WSL2 Linux
environment, on‑LAN and remotely, with VS Code Remote‑SSH into either — and never get locked
out. The lessons generalize to "expose both a host OS and a guest Linux behind one entry point."

> This file carries a **Field notes** section at the bottom: the concrete things that bit
> during a real 2026‑06 deployment. If you're retreading this, read those first.

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
$k = "ssh-ed25519 AAAA... fuyu@mac"     # your Mac's public key (FIDO2 sk-key recommended)
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
printf '%s\n' 'ssh-ed25519 AAAA... fuyu@mac' >> ~/.ssh/authorized_keys
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

## Setup 4 — WSL auto‑start (so the inner hop is usually ready)

The Windows anchor is always up; WSL only needs to be running for `ssh wsl`. Boot it at logon
and pin it so systemd/sshd stay live. Task Scheduler:
```bat
schtasks /create /tn "WSL-autostart" /sc onlogon /rl highest /f ^
  /tr "wsl.exe -d Ubuntu-24.04 -u root -e /usr/bin/tail -f /dev/null"
```
(GUI equivalent: trigger *At log on*, action `wsl.exe` args `-d Ubuntu-24.04 -u root -e tail -f
/dev/null`, tick **Hidden**.) `tail -f /dev/null` never exits, keeping the VM and your sshd
alive for the session. Even if this fails, you're not locked out — `ssh win` then `wsl` recovers.

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
    User fuyu                         # the WSL Linux user (often DIFFERENT from the Windows account)
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
roaming terminal work: `mosh fuyu@<win-tailnet-name>` (to Windows) or run mosh+tmux inside
WSL after jumping in.

## Why NOT Tailscale SSH (`--ssh`) here — both verified

1. **Platform:** its SSH server runs only on Linux + open‑source macOS — never the Windows
   client. It can't be the anchor on a Windows box.
2. **VS Code:** Tailscale's embedded SSH server historically broke VS Code Remote‑SSH
   (`unknown channel type`, issue #5295); fixed only **2026‑04‑07**, and stock OpenSSH is still
   what the IDE is built against.

Let Tailscale do only what it's unbeatable at — reachability with no open ports — and keep
stock OpenSSH as both the Windows anchor and the WSL server.

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
- **`ssh.socket` overrides your `Port`.** Ubuntu 24.04 ships socket activation on `:22`; you only
  see `:2222` after `systemctl disable --now ssh.socket` + `enable --now ssh.service`. This is the
  single most confusing WSL‑sshd gotcha.
- **Windows user ≠ WSL user.** `ssh win` → the Windows account (`fuyutarow`); `ssh wsl` → the
  Linux user (`fuyu`). Mixing them fails auth with no clear reason.
- **Enabling systemd broke `wsl.exe -e <cmd>`** with `Wsl/Service/E_UNEXPECTED "Catastrophic
  failure"` — which *also* broke **VS Code Remote‑WSL** (it shells out via `wsl -e`). Interactive
  `wsl` was fine. `wsl --update` clears it. Crucially `ssh wsl` (Remote‑SSH) was unaffected — it
  rides localhostForwarding, not `wsl -e` — so **when Remote‑WSL is flaky, use Remote‑SSH to the
  `wsl` host instead.**
- **"Failed to start the systemd user session for 'fuyu'" is benign** — sshd is a *system*
  service. (`sudo apt install dbus-user-session` + `wsl --shutdown` often silences it; optional.)
- **`appendWindowsPath=false` hides Windows tools in WSL** (`code`, `winget.exe` → "command not
  found"). That's the setting working as intended, not breakage. `=true` inherits them (appended →
  Linux still wins); or add just the dir you need, in `wsl/.zprofile` per a clean dotfiles layout.
- **zsh does NOT treat `#` as an inline comment by default.** A command pasted with a trailing
  `… # note` sends the comment as arguments (you'll see `Invalid unit name "#"` etc.). When handing
  zsh users something to paste, omit inline comments.
- **Editing WSL files when `wsl -e` is down:** reach them from Windows at
  `\\wsl.localhost\<distro>\home\<user>\…` — the 9p file share works even when command‑exec
  (`wsl -e`) is throwing `E_UNEXPECTED`.
- **Quoting through Windows → wsl → bash is lossy:** a `VAR="…"` assignment passed as a `wsl … -e`
  argument can silently arrive empty. Pipe data over **stdin** instead:
  `printf '%s\n' '<value>' | wsl -d <distro> -- bash -c 'cat > file'`.
