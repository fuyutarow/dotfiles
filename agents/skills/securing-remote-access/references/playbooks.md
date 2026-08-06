# Playbooks: concrete recipes

Copy‑paste starting points. Adapt usernames/hosts. Verified against current OpenSSH
behavior — note the version caveats inline (they're load‑bearing).

## Table of contents
1. Hardened keyed OpenSSH server (the Gen‑2 baseline, done right)
2. Modern keys: ed25519 and FIDO2 hardware‑bound keys
3. `~/.ssh/config` patterns + ControlMaster multiplexing
4. Host‑key / TOFU handling
5. Tailscale as transport (mesh reachability, stock sshd)
6. Tailscale SSH (Gen‑4 keyless) — and when to refuse it
7. OpenSSH certificate authority — a minimal starter
8. mosh + tmux (roaming + persistence)
9. Windows host: native OpenSSH anchor + Tailscale (the Windows side of a mesh)
   — 9b: which shell the session lands in (cmd.exe vs PowerShell) + the `/c` trap

---

## 1. Hardened keyed OpenSSH server

The 2024 lessons (regreSSHion, xz) say: **reduce attack surface and pre‑auth exposure;
don't fetishize cipher lists.** Pubkey‑only auth collapses the entire commodity brute‑force
economy. Modern OpenSSH already defaults to good crypto — *subtract* weak algorithms rather
than paste a giant block.

Use a drop‑in so upgrades don't clobber you. `/etc/ssh/sshd_config.d/10-hardening.conf`:

```
# --- authentication ---
PasswordAuthentication no
KbdInteractiveAuthentication no
AuthenticationMethods publickey
PubkeyAuthentication yes
PermitRootLogin no
# Optionally scope who can log in at all:
# AllowUsers you

# --- exposure reduction ---
X11Forwarding no
AllowAgentForwarding no          # turn on only per-host in client config if needed
AllowTcpForwarding no            # leave on if you rely on port-forwards / VS Code tunnels
LoginGraceTime 20                # smaller window for pre-auth races
MaxAuthTries 3
MaxSessions 4

# --- modern OpenSSH (>=9.8) gives you in-daemon rate limiting; fail2ban becomes optional ---
# PerSourcePenalties is on by default in 9.8+, no config needed.
```

Apply: `sudo sshd -t && sudo systemctl reload ssh` (`sshd -t` validates before you lock
yourself out — always run it). Keep a second session open until you've confirmed the new
config lets you back in.

> **Ubuntu 23.10+/24.04 gotcha (this bit a real deploy):** the package enables **`ssh.socket`**
> (socket activation on port 22), which *overrides* a custom `Port` in `sshd_config`. If you set
> a non‑default port, run `sudo systemctl disable --now ssh.socket && sudo systemctl enable --now
> ssh.service`, otherwise the daemon keeps listening on 22 and silently ignores your drop‑in.

**Crypto, if you must touch it:** prefer subtracting. On OpenSSH ≥10.0 the post‑quantum hybrid
`mlkem768x25519-sha256` is already the default KEX; `ssh-rsa`/SHA‑1 is off by default since
8.8; DSA is gone in 10.0. Only pin algorithms if a compliance scanner demands it, e.g.
`KexAlgorithms sntrup761x25519-sha512@openssh.com,curve25519-sha256` — and revisit on upgrade.

**The real rule: patch.** No `sshd_config` setting stops a pre‑auth bug. If you can't put the
daemon behind a mesh, automate security updates (`unattended-upgrades`).

## 2. Modern keys: ed25519 and FIDO2

**Software key (fine for personal use, especially behind a mesh):**
```bash
ssh-keygen -t ed25519 -C "you@mac-$(date +%Y%m)"
```

**FIDO2 hardware‑bound key (non‑exfiltrable — the strongest practical credential):**
```bash
# ed25519-sk needs OpenSSH >=8.2 on BOTH ends and a FIDO2 authenticator
# (YubiKey firmware >=5.2.3 for ed25519-sk; older keys fall back to ecdsa-sk).
ssh-keygen -t ed25519-sk -O resident -O verify-required -C "you-yubikey"
#   -O resident         => credential stored on the token, re-derivable elsewhere via `ssh-keygen -K`
#   -O verify-required  => PIN on every use   (NOTE: this flag needs OpenSSH >=8.4, not 8.2)
#   default behavior     => physical touch required to sign
```
Copy the `.pub` to the target's `~/.ssh/authorized_keys` exactly like a normal key. Now an
attacker who steals the on‑disk key file gets a useless handle; signing requires the physical
token + touch (+ PIN).

**Platform agents (keys with no key file on disk):**
- *Apple Secure Enclave* via [Secretive](https://github.com/maxgoedjen/secretive) — key never
  leaves the enclave, Touch‑ID to sign. **P‑256 ECDSA only, non‑backupable** (enroll a backup
  key elsewhere).
- *1Password SSH agent* — keys in the vault, biometric approval, also signs git commits.
  **Ed25519/RSA only, no ECDSA.** Point clients at its `IdentityAgent` socket.

## 3. `~/.ssh/config` patterns + ControlMaster

A good client config is half the ergonomics. `~/.ssh/config`:

```
Host *
    # macOS: load keys from Keychain and keep them in the agent
    AddKeysToAgent yes
    UseKeychain yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
    # Reuse one TCP/auth connection for many sessions — huge for VS Code/scp/git,
    # and you touch your FIDO2 key only once per master connection.
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 15m

Host devbox
    HostName devbox.tailnet-name.ts.net   # a stable mesh name works on-LAN and remote
    User you
    # IdentityAgent ~/.1password/agent.sock   # if using 1Password
    # IdentitiesOnly yes

# Jump through a bastion WITHOUT agent forwarding (safer than ForwardAgent):
Host internal
    HostName 10.0.0.5
    ProxyJump bastion.example.com
```

`ControlMaster` is the highest‑leverage line here: VS Code Remote‑SSH opens many short
connections, and multiplexing makes them instant *and* prompts for the hardware‑key touch only
once per persistent master.

## 4. Host‑key / TOFU handling

With stock OpenSSH you still manage `known_hosts`. Options, least → most rigorous:
- **Accept once:** verify the fingerprint out‑of‑band the first time, then it's pinned.
- **Pre‑seed it:** `ssh-keyscan -t ed25519 host >> ~/.ssh/known_hosts` (only meaningful if the
  network path is trusted at scan time).
- **Kill TOFU entirely with host certificates** (see §7): one `@cert-authority` line trusts
  every host the CA signs — no prompt on first connect, no scary warning when a box is rebuilt,
  *within* the cert's hostname pattern, principals, and validity window.

## 5. Tailscale as transport (recommended for solo/home)

This keeps **stock OpenSSH as the server** (full VS Code / scp / rsync / agent‑forwarding
compatibility) and uses Tailscale only to make the host reachable with **no open ports** —
the single biggest security win for a home box.

```bash
# On the server (Linux host or a Linux box like WSL2):
curl -fsSL https://tailscale.com/install.sh | sh     # or apt repo / winget / brew per platform
sudo tailscale up                                    # browser auth via your IdP
tailscale status                                     # note the MagicDNS name, e.g. devbox.<tailnet>.ts.net

# On the client (Mac):
brew install --cask tailscale && tailscale up        # join the same tailnet
ssh you@devbox.<tailnet>.ts.net                      # routes over WireGuard; no port forwarding, no firewall holes
```
MagicDNS gives a name that's identical on‑LAN and remote, so one `~/.ssh/config` entry and one
VS Code Remote‑SSH host work everywhere. NAT traversal succeeds directly the large majority of
the time (DERP relay only as fallback). The `100.x.y.z` tailnet IP also works as a `HostName`
and is the most foolproof choice when MagicDNS is being fussy. For Windows + WSL2 specifically,
the host‑vs‑in‑WSL placement decision matters — see `wsl2-mac.md`.

## 6. Tailscale SSH (Gen‑4 keyless) — and when to refuse it

If the target is a **Linux or open‑source‑macOS** node and you don't need an IDE's SSH:
```bash
sudo tailscale up --ssh        # tailscaled becomes the SSH server; no keys, no authorized_keys
```
Authorization is an ACL decision in the tailnet policy file, e.g.:
```jsonc
"ssh": [{
  "action": "check",                 // force IdP re-auth periodically (default 12h); "accept" to skip
  "src":    ["autogroup:member"],
  "dst":    ["autogroup:self"],
  "users":  ["autogroup:nonroot", "you"]
}]
```
**Refuse it when:** the server would be a Windows client (unsupported — it can only run on a
Linux node, e.g. inside WSL2, which Tailscale itself recommends against), or the user needs
VS Code/JetBrains remote (embedded SSH servers lag stock OpenSSH on IDE remoting; Tailscale's
#5295 was a long-standing example, since fixed — verify your build). In those cases use §5
(mesh transport) + stock OpenSSH instead.

## 7. OpenSSH certificate authority — minimal starter

Worth it for a *fleet* (kills key sprawl + TOFU); usually over‑engineering for 1–3 personal
boxes. Native OpenSSH, no extra software:

```bash
# --- one-time: create CA keys (PROTECT user_ca like a crown jewel; ideally on an HSM/offline) ---
ssh-keygen -t ed25519 -f user_ca -C "user CA"
ssh-keygen -t ed25519 -f host_ca -C "host CA"

# --- sign a USER key: short validity + principals = the logins this cert may use ---
ssh-keygen -s user_ca -I you@mac -n you -V +8h id_ed25519.pub
#   -V +8h  => self-expiring (this is your revocation strategy; DON'T forget it)

# --- server trusts user certs, and presents its own host cert to kill client TOFU ---
ssh-keygen -s host_ca -I devbox -h -n devbox.example.com -V +52w /etc/ssh/ssh_host_ed25519_key.pub
# sshd_config:  TrustedUserCAKeys /etc/ssh/user_ca.pub
#               HostCertificate   /etc/ssh/ssh_host_ed25519_key-cert.pub
# client known_hosts:  @cert-authority *.example.com <contents of host_ca.pub>
```
Caveats: `TrustedUserCAKeys` does **not** turn off `authorized_keys` (set `AuthorizedKeysFile
none` to enforce certs‑only); "principal == login" is the default only. For SSO‑gated issuance
without running this by hand, use **step‑ca** (`step ssh`) or **Vault**'s SSH secrets engine.

## 8. mosh + tmux (roaming + persistence)

```bash
# both ends:
brew install mosh        # mac;  sudo apt install mosh on the server
# connect (rides your Tailscale path; survives Mac sleep, Wi-Fi->cellular, IP changes):
mosh you@devbox.<tailnet>.ts.net -- tmux new -A -s main
```
mosh needs UDP 60000–61000 reachable (the mesh handles this). It syncs only the visible
screen — **run tmux for scrollback and session persistence.** mosh is terminal‑only; VS Code
still uses the OpenSSH path from §5.

## 9. Windows host: native OpenSSH anchor + Tailscale (the Windows side of a mesh)

When the target is a Windows box — or a Linux env *inside* Windows (WSL2) — put the always‑on
entry point on **Windows services**. Run in an **elevated** PowerShell (the title says
*Administrator* and it opens in `C:\WINDOWS\system32`; a window that opens in `C:\Users\you` is
**not** elevated — a real, time‑wasting gotcha that makes `Add-WindowsCapability` misbehave).

Native OpenSSH Server is a Feature on Demand. The install can look like a no‑op — **verify**:
```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Get-WindowsCapability -Online -Name OpenSSH.Server* | Format-Table Name,State   # expect Installed
Get-Service sshd | Format-Table Name,Status,StartType                           # the service must now EXIST
Set-Service sshd -StartupType Automatic; Start-Service sshd
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True `
  -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

Tailscale for reachability — use the **exact** winget id (a bare `winget install tailscale`
matches multiple packages and aborts):
```powershell
winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
```
After install the `tailscale` CLI is **not on PATH in the same shell** — open a NEW window, or
just use the GUI tray. The tray showing *Connected* + a `100.x.y.z` address **is** `tailscale up`
already done; that `100.x` IP is the most foolproof `HostName`. Turn on *Preferences → Run
unattended* so the node is up before login.

Key placement on Windows (the classic trap): for an **Administrator** account, OpenSSH reads
`C:\ProgramData\ssh\administrators_authorized_keys` (NOT `~\.ssh\authorized_keys`), and the file
must be locked down:
```powershell
$f="$env:ProgramData\ssh\administrators_authorized_keys"
Add-Content $f "ssh-ed25519 AAAA... you@laptop"
icacls $f /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```
The SSH login name for Windows is the **Windows account** (`whoami` → the part after `\`), which
is usually different from the WSL Linux user. To chain this anchor into a WSL Linux env behind
it, see `wsl2-mac.md`.

### 9b. Which shell the session lands in — and the `/c` trap that breaks every scripted command

Windows OpenSSH defaults to **cmd.exe** whenever `HKLM\SOFTWARE\OpenSSH\DefaultShell` is absent.
Check before assuming — a missing key IS the answer, not an error:
```powershell
reg query "HKLM\SOFTWARE\OpenSSH" /v DefaultShell   # "unable to find" => cmd.exe
```
This matters most for **non‑interactive** use (`ssh host '<cmd>'`, i.e. every agent‑ and
script‑driven call): under cmd, `;` is **not** a separator, so `ssh host 'whoami; hostname'`
echoes the string instead of running it — chain with `&`. If the Windows side exists only as the
"do what WSL can't" console (`wsl --shutdown`, services, GPU/driver state), that work is
PowerShell‑shaped anyway, so switching the default shell usually pays.

**Set BOTH registry values or you break the host for scripting.** `DefaultShell` alone leaves
sshd passing cmd's `/c` to PowerShell; `DefaultShellCommandOption` overrides it to `-c`:
```powershell
reg add "HKLM\SOFTWARE\OpenSSH" /v DefaultShell /t REG_SZ ^
  /d "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" /f
reg add "HKLM\SOFTWARE\OpenSSH" /v DefaultShellCommandOption /t REG_SZ /d "-c" /f
```
Diagnostic signature of the omission: **interactive login looks perfect while every
`ssh host '<cmd>'` fails** — the split is what identifies it. HKLM writes need an elevated
(Administrators‑account) session. Existing sessions keep the old shell; test on a NEW connection.
`pwsh` (PowerShell 7) is **not** present on stock Windows — the path above is Windows PowerShell
5.1 unless the box has 7 installed.

Verify the switch by the three things it buys, not by the banner:
```bash
ssh host 'whoami; hostname; $PSVersionTable.PSVersion.ToString()'   # ; now chains
ssh host 'exit 3'; echo $?                                          # => 3, exit codes propagate
ssh host 'Get-Service sshd | Select-Object Name,Status | ConvertTo-Json -Compress'  # parseable
```

**"Changing DefaultShell breaks scp" is stale folklore — check before believing it.** sshd
launches the transfer server as a *subsystem*, bypassing the login shell entirely, and OpenSSH
**≥ 9.0** `scp` speaks the SFTP protocol. So on a modern host the shell change is transfer‑safe:
```powershell
ssh -V                                                    # >= 9.0 => scp uses SFTP
findstr /i "subsystem" C:\ProgramData\ssh\sshd_config     # expect: Subsystem sftp sftp-server.exe
```
The folklore holds only where a legacy `scp` still rides the login shell, or a PowerShell
**profile prints** on startup and corrupts the stream — keep the profile silent either way.
(Verified 2026‑07‑28 on `OpenSSH_for_Windows_9.5p2`, Windows 11 26200: default shell flipped to
5.1, then a scp round‑trip and the three checks above all passed.)
