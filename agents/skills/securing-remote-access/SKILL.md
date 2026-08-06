---
name: securing-remote-access
description: >-
  Practical intelligence for designing, setting up, hardening, and debugging
  secure remote shell access the modern way — choosing between SSH keys,
  certificates, hardware-bound keys, and zero-trust identity meshes instead of
  defaulting to the obvious sshd+authorized_keys. Use this WHENEVER the user is
  setting up or asking about remote access to a machine: configuring sshd or ssh
  keys/authorized_keys, hardening or exposing an SSH server, a bastion/jump host,
  reaching a home/remote/dev box from a laptop, Tailscale or any zero-trust /
  WireGuard mesh access, SSH certificates or a CA (step-ca, Vault, Teleport),
  FIDO2 / YubiKey / Secure-Enclave / 1Password SSH keys, VS Code Remote-SSH or
  JetBrains Gateway, mosh, ~/.ssh/config, remote access into WSL2, or which shell
  a Windows SSH session lands in (cmd.exe vs PowerShell, DefaultShell). Trigger
  even on a bare "how do I ssh into X", "set up ssh on my server", or a tool name
  like "Tailscale" — this skill picks the right architecture for the situation
  and hands over verified, current (2026) recipes and the gotchas that bite.
---

# Secure Remote Access (the modern way)

## The one idea that reorganizes everything

SSH stopped being one technology and became **three independent layers stacked on
top of each other**:

1. **Transport** — carries the bytes (the SSH protocol; or mosh; or WireGuard underneath).
2. **Authentication** — decides *who you are* (a key on disk; a hardware token; an identity provider).
3. **Reachability / network fabric** — decides *whether the host is even addressable* (an open port on the internet; a NAT'd LAN; a mesh).

Classic "just run sshd and add my key" collapses all three into the SSH protocol
on a public port. **The modern move is to pull authentication out into an identity
provider and reachability out into a WireGuard mesh, so SSH degrades to "just the
terminal."** Almost every recommendation below is an application of that principle:
*push the security decision out of the SSH protocol.*

When advising, name which layer the user's problem actually lives in. "I can't
connect" is usually a *reachability* problem (NAT/firewall), not an auth problem.
"Is this secure enough" is usually an *auth + exposure* problem, not a cipher problem.

## The four generations (this is the spine — use it to locate any tool)

These are **additive, not exclusive**. Real setups blend them. The value of the model
is that each generation exists to fix the *specific limit* of the one before — so naming
the generation tells you what problem a tool is actually solving.

| Gen | What it is | Solved | The limit that forced the next gen |
|---|---|---|---|
| **1** | Password + host trust (telnet → SSH‑1) | Cleartext creds/sessions on the wire | Weak integrity; SSH‑1 is dead, removed from OpenSSH |
| **2** | Public key + `authorized_keys` (today's default) | Shared secret crossing the wire | **Permanence**: keys never expire (sprawl/ghost keys), TOFU clicked through blindly, public port = attack surface |
| **3** | Short‑lived **certificates** + **hardware‑bound keys** | Standing secrets | CA private key is a crown jewel; revocation is coarse (KRL distribution); you still run a port and build all SSO plumbing yourself |
| **4** | **Zero‑trust identity mesh** (Tailscale SSH, Teleport, Cloudflare Access) | Open ports + standing keys | The frontier. SSH becomes the byte‑carrier; auth/transport/authz/audit move to a control plane |

> **The engine driving all of it:** Gen 2's never‑expiring keys, blind TOFU, and public
> port. Two 2024 events made the cost concrete and are worth citing when a user waves off
> exposure: **regreSSHion (CVE‑2024‑6387)** — unauthenticated remote‑root in sshd on glibc
> Linux, ~14M exposed instances — and the **xz/liblzma backdoor (CVE‑2024‑3094)**. The
> lesson both teach: *no auth or cipher setting stops a pre‑auth bug; only patching and
> not being exposed do.*

For the full narrative, citations, and the adversarially‑verified claims behind every
number above, read `references/survey.md`.

## How to actually decide (don't just reach for sshd + key)

**Governing heuristic: pick the lightest tool whose blast radius you can tolerate.**
Push auth into an IdP and reachability into a mesh; only reach for a heavy access plane
(Teleport, Cloudflare) when **audit/compliance is the actual requirement**, because those
planes are themselves high‑value targets (Teleport shipped a CVSS 9.8 SSH auth‑bypass,
CVE‑2025‑49825, in 2025).

| Situation | Recommend | Why |
|---|---|---|
| Solo dev, 1–3 personal machines you control | Keyed OpenSSH (ed25519) **+ Tailscale** as transport | A CA is more risk than it removes at this scale; the mesh removing the public port is the real win |
| Personal box, want the strongest credential | Above **+ FIDO2 `ed25519-sk`** (touch/PIN) | Non‑exfiltrable key; fully compatible with mesh + VS Code Remote‑SSH |
| Roaming laptop, flaky/mobile links | Tailscale + keyed SSH **+ mosh + tmux** | Mesh fixes reachability, mosh fixes latency/echo + survives sleep/roam, tmux fixes persistence and mosh's missing scrollback |
| Small team, all Linux/macOS hosts, no compliance burden | **Tailscale SSH** (keyless, ACL‑driven) | No keys, no ports, IdP‑gated `check` mode — the cleanest "most modern" answer *when the platform constraints fit* |
| Self‑managed fleet, keep stock OpenSSH, kill key sprawl + TOFU | **SSH certificates** via step‑ca or Vault, SSO‑gated | Short‑lived user+host certs; expiry‑as‑revocation; stock OpenSSH on the wire |
| Mid/large or regulated, need audit + session replay | **Teleport** (or Cloudflare Access if already on Cloudflare) | RBAC, per‑session MFA, searchable recordings — you're buying the audit story. Patch discipline mandatory |
| AWS‑only fleet, API‑level audit is enough | **AWS SSM Session Manager** | No ports/keys/bastion; IAM is the control. (Caveat: SSH‑tunneled sessions can't be content‑logged) |
| Editor‑driven remote dev (VS Code / JetBrains) | **Stock OpenSSH** as the server, over a mesh | IDE remoting is built/tested against real OpenSSH; embedded SSH servers (incl. Tailscale SSH historically) break it |
| **Must** expose a public sshd (no mesh possible) | `PasswordAuthentication no` + `AuthenticationMethods publickey` + **patch religiously** + `PerSourcePenalties` | Pubkey‑only kills the brute‑force economy; patching is the only defense against pre‑auth RCE; everything else is noise reduction |

After picking, open `references/playbooks.md` for the concrete config of the chosen approach.

## The "most modern" answer, stated honestly

In principle the purest Gen‑4 design is **Tailscale SSH** (`tailscale up --ssh`): SSH
terminated over WireGuard, **no keys and no open ports**, authorized purely on tailnet
identity + ACLs, with `check` mode forcing periodic IdP re‑auth. That's THE most modern
*design*.

But "most modern" and "most practical for this user" frequently diverge, and the honest
answer respects the divergence. The big disqualifiers to check before recommending
Tailscale SSH:

- **Its SSH server runs only on Linux and the open‑source macOS build — never the Windows
  client, never iOS/Android.** Port 22 over the tailnet only.
- **Embedded SSH servers lag stock OpenSSH on IDE‑remoting edges** — Tailscale's #5295 broke VS
  Code Remote‑SSH for a long time (since fixed; date/PR in `survey.md`). Verify your editor against
  the specific build rather than assuming parity.

So for an editor‑driven or Windows‑involved target, the most‑modern‑*yet‑practical* stack
is **mesh for reachability + real OpenSSH for the server + FIDO2 for the credential**.
You get the zero‑port, identity‑meshed, hardware‑anchored posture and give up only the
keyless/ACL convenience the platform ruled out anyway.

## Gotchas that bite (verified — state these proactively)

- **OpenSSH version caveats.** `ed25519-sk`, default touch‑to‑sign, and `-O resident` are
  OpenSSH **8.2** (2020‑02‑14). But `-O verify-required` (per‑use PIN) is **8.4**, not 8.2 —
  a commonly repeated error. `ssh-rsa`/SHA‑1 has been off by default since **8.8**; DSA is
  gone in **10.0** (2025‑04), which also defaults to the post‑quantum hybrid KEX
  `mlkem768x25519-sha256`. `PerSourcePenalties` (in‑daemon rate‑limiting, makes fail2ban
  largely optional) arrived in **9.8**. Treat these as feature‑availability floors, not the
  current release — the OpenSSH series as of mid‑2026 is 10.3.
- **Certificates don't auto‑replace `authorized_keys`.** Setting `TrustedUserCAKeys` makes
  the daemon *also* accept CA‑signed certs; `authorized_keys` stays active unless you
  explicitly set `AuthorizedKeysFile none`. And "principal == login name" holds only in the
  default config (changes with `AuthorizedPrincipalsFile`/`Command`).
- **Cert revocation is weak by design.** The philosophy is "don't revoke, expire" because
  KRLs reintroduce the per‑host distribution problem certs were meant to kill. Lean on short
  TTLs; keep an active‑revocation path only for emergencies.
- **Hardware‑key platform limits.** Apple Secure Enclave (via Secretive) is **P‑256 ECDSA
  only and non‑backupable**; the 1Password SSH agent is **Ed25519/RSA only, no ECDSA**. Pick
  the key type the target and the agent both accept.
- **Agent forwarding is the sharp edge of hardware keys.** Forwarding any agent lets root on
  the remote *use* your identity onward for the session (it can't exfiltrate the bytes).
  Prefer `ProxyJump` over `ForwardAgent`; FIDO2 `verify-required` / 1Password per‑use prompts
  blunt the risk.
- **mosh has no scrollback** (it syncs only the visible screen — pair with tmux), needs UDP
  60000–61000 open, is maintenance‑only (last release 1.4.0, Oct 2022 — check for newer activity before leaning on it), and **VS Code Remote‑SSH cannot
  use it.** It's a terminal complement, never the editor's transport.
- **WSL2 is the gotcha factory** for "reach my home box": no init by default (enable systemd),
  and the *idle‑shutdown trap* where the VM (and the sshd inside it) dies on `vmIdleTimeout`.
  `vmIdleTimeout=-1` keeps the VM but a regression (through WSL 2.7.x as of mid‑2026; microsoft/WSL #13291, #13416 open) still suspends in‑VM services — you
  need a Task Scheduler keep‑alive. See `references/wsl2-mac.md`.
- **WSL2 host‑interop gotchas (learned the hard way — see `references/wsl2-mac.md`).** Reaching
  a Linux env *inside* Windows adds its own layer:
  - **`ssh.socket` silently overrides your `Port`.** Ubuntu 24.04 enables `ssh.socket`
    (listening on 22); a custom `Port 2222` in `sshd_config` is ignored until you
    `systemctl disable --now ssh.socket && systemctl enable --now ssh.service`.
  - **Enabling systemd in WSL can break `wsl.exe -e <cmd>`** (non‑interactive exec) with
    `Wsl/Service/E_UNEXPECTED "Catastrophic failure"` — which also breaks **VS Code Remote‑WSL**.
    Interactive shells still work. Fix with `wsl --update`; and prefer **Remote‑SSH** to the WSL
    sshd over Remote‑WSL — the SSH path is independent of `wsl -e`, which is exactly why the
    mesh+OpenSSH design keeps working when the `wsl -e` plumbing doesn't.
  - **`appendWindowsPath=false`** (a common clean‑PATH choice) means Windows tools (`code`,
    `winget.exe`) are *not* on `PATH` inside WSL — by design, not breakage. Flip to `true` to
    inherit (it's *appended*, so Linux tools keep precedence), or add only the dirs you want.
  - **The "Failed to start the systemd user session" warning is benign** — sshd is a *system*
    service and is unaffected.
- **A Windows SSH session lands in cmd.exe unless you say otherwise**, so scripted
  `ssh host 'a; b'` echoes instead of running (`;` isn't a cmd separator). Switching the default
  shell to PowerShell takes **two** registry values — set `DefaultShell` without
  `DefaultShellCommandOption="-c"` and interactive login still looks fine while every
  non‑interactive command breaks. scp/sftp are unaffected by the change on OpenSSH ≥ 9.0
  (subsystem, not the login shell) — see `references/playbooks.md` §9b.

## Reference router

- `references/survey.md` — The full four‑generations narrative, the Gen‑3‑vs‑Gen‑4 fair
  fight (cert CAs, Tailscale SSH, Cloudflare Access, Teleport, hardware keys, mosh — killer
  feature + real limits each), and the adversarially‑verified claims with sources. Read when
  the user wants the *why*, the trade‑offs, or citations.
- `references/playbooks.md` — Copy‑paste recipes: hardened keyed‑sshd `sshd_config` drop‑in,
  ed25519 + FIDO2 key generation, `~/.ssh/config` patterns with `ControlMaster`, host‑key/TOFU
  handling, Tailscale‑as‑transport, an OpenSSH CA starter, mosh+tmux, and **the Windows host as
  an always‑on OpenSSH + Tailscale anchor** (incl. §9b, the `DefaultShell` cmd‑vs‑PowerShell
  decision and its `/c` trap). Read when implementing.
- `references/wsl2-mac.md` — The applied worked example: the **robust Mac ↔ Windows ↔ WSL
  full chain**. The key move — make the always‑on anchor a *Windows service* (Tailscale +
  native OpenSSH), not WSL, so you're never locked out — plus reaching WSL behind it via
  `ProxyJump` + `localhostForwarding` (no mirrored/portproxy), systemd, the idle/auto‑start
  fix, the Windows `administrators_authorized_keys` gotcha, why **not** Tailscale SSH here, an optional direct in‑WSL tailnet node (plain `sshd:2222`, or
  Tailscale SSH if keyless wanted; installed via apt), and the keep‑alive trigger rationale
  (onlogon, never SYSTEM). A **Field notes** section of everything that actually bit during a
  real deployment. Read for
  any task exposing a host OS *and* a guest Linux from one machine.
