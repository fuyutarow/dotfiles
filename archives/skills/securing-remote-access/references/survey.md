# Survey: the modern state of secure remote shell access (2026)

This is the "why" layer behind `SKILL.md`. It was produced by a fan‑out web survey
across seven dimensions, with the load‑bearing claims independently fact‑checked. Where
a claim was found *nuanced* or *misattributed*, the correction is folded in below — trust
this file over folk memory on version numbers and platform limits.

## Table of contents
1. The four generations (full narrative)
2. Gen 3 vs Gen 4 — a fair fight (per‑tool killer feature + real limits)
3. The decision framework
4. Adversarially‑verified claims (with sources)

---

## 1. The four generations of secure remote access

Additive, not exclusive. Every real 2026 setup runs a blend. The point is to see *what
limit forced the next jump*, because that tells you what each tool is actually for.

### Gen 1 — Password + host‑trust (cleartext → first encryption)
telnet, rlogin, rsh — then SSH‑1 (Tatu Ylönen, 1995, written after a password‑sniffing
attack on the Helsinki University of Technology network). SSH‑1 introduced the two ideas
we still use: an encrypted channel, and **Trust‑On‑First‑Use (TOFU)** host‑key pinning.
**Solved:** credentials/sessions in the clear. **Limit that forced Gen 2:** SSH‑1's
integrity model was structurally weak (the 1998 CRC‑32 insertion weakness, whose
"Compensation Attack Detector" fix itself carried an integer overflow exploited for remote
root in 2001). SSH‑1 was deprecated after SSH‑2 (RFCs 4251/4252/4253, 2006), build‑time‑
removable in OpenSSH 6.5 (2014), disabled by default around 7.6/7.8 (2017–2018), later
removed entirely.

### Gen 2 — Public‑key auth + `authorized_keys` (today's de‑facto baseline)
SSH‑2 with a per‑user keypair (`ssh-keygen -t ed25519`), public half appended to
`~/.ssh/authorized_keys` on each target. No shared secret crosses the wire; the private
key can sit passphrase‑protected in an agent. Still the OpenSSH default and what almost
everyone runs. **Solved:** the shared‑secret‑on‑the‑wire problem — a genuine leap.
**Limit that forced Gen 3 — *permanence*:**
- `authorized_keys` entries **never expire** by default → orphaned "ghost" keys accumulate
  as silent backdoors and lateral‑movement vectors ("key sprawl").
- Distribution and revocation are manual and don't track joiner/mover/leaver.
- Host verification is still TOFU → users click through fingerprint prompts blindly.
- The daemon usually listens on a public port. The systemic cost was dramatized by
  **regreSSHion / CVE‑2024‑6387** (1 Jul 2024): unauthenticated remote‑root via a
  signal‑handler race, sshd 8.5p1–<9.8p1 on glibc Linux, ~14M exposed instances. *No auth
  or crypto setting stops a pre‑auth bug.*

### Gen 3 — Short‑lived certificates + hardware‑bound keys
The direct attack on standing secrets, via two complementary techniques.
- **SSH certificates** — a *native, non‑X.509* OpenSSH format. A CA signs your public key
  into a short‑lived cert carrying identity (`-I`), principals (`-n`), and a validity window
  (`-V +5m`). Hosts trust the CA via `TrustedUserCAKeys`; host certs + `@cert-authority`
  lines kill host‑key TOFU. Expiry replaces revocation.
- **Hardware‑bound keys** — OpenSSH 8.2 (2020‑02‑14) added FIDO2 key types `ed25519-sk` /
  `ecdsa-sk` whose private half never leaves the device, requiring a physical touch.
  (`-O verify-required` / per‑use PIN is **8.4**, not 8.2.)

**Solved:** "no standing secrets" — certs die in minutes; the residual secret is
non‑exfiltrable hardware. **Limit that forced Gen 4:** the CA private key becomes your
crown jewel; revocation is coarse (KRLs must be pushed to every host — *reintroducing the
distribution problem certs were meant to kill*); and you still run a port and built the
SSO plumbing yourself.

### Gen 4 — Zero‑trust identity mesh (SSH becomes "just the terminal")
The BeyondCorp model Google built after the 2009 Operation Aurora intrusion, codified
vendor‑neutrally in **NIST SP 800‑207** (Aug 2020): no network location is trusted; every
request is authenticated and authorized per‑resource on identity + device posture + policy,
enforced near the resource. In practice (Tailscale SSH, Teleport, Cloudflare Access,
Boundary) there are **no open SSH ports and no standing keys**. An IdP authenticates the
human, posture is checked, and the system either mints an ephemeral cert or *terminates the
SSH connection itself* over a WireGuard mesh. **The 2024–2026 frontier:** Gen 4 is
collapsing Gen 3's "short‑lived certs vs the network layer" distinction — Tailscale
terminates SSH over WireGuard with no certs at all (GA 2024‑03‑22).

> **Throughline:** every generation answers the *permanence* and *exposure* of the previous
> one. regreSSHion and xz are the cautionary tales that keep driving the migration forward.

---

## 2. Gen 3 vs Gen 4 — a fair fight

Each is genuinely good at one thing and genuinely annoying at another.

**SSH Certificate Authorities (native OpenSSH / Vault / step‑ca)**
- *Killer feature:* stock OpenSSH everywhere, but no key outlives your workday; host certs
  finally kill the TOFU prompt at fleet scale; issuance gateable behind SSO.
- *Real limits:* you run and fiercely protect a CA (HSM advised); revocation is honestly weak
  ("don't revoke, expire"); easy to misconfigure (forget `-V` → a non‑expiring cert).
  `TrustedUserCAKeys` does **not** disable `authorized_keys`; "principal = login" is the
  default‑config behavior only.
- *For:* self‑managed fleets that want to keep OpenSSH and kill key sprawl + TOFU.

**Tailscale SSH (WireGuard identity mesh)**
- *Killer feature:* zero open ports *and* zero SSH keys. `tailscale up --ssh` makes
  `tailscaled` the SSH server; the peer's identity is already known from the WireGuard
  session, so authorization is just an ACL decision. `action:check` forces IdP re‑auth
  (default 12h). Lowest latency here (direct P2P).
- *Real limits:* **server runs only on Linux + open‑source macOS — not the App Store/Standalone
  macOS app, not Windows/iOS/Android.** Port 22, tailnet only. Depends on Tailscale's
  coordination plane (or self‑hosted **Headscale**, single‑tailnet, no OIDC‑group ACLs).
  **Embedded SSH server lagged stock OpenSSH on IDE remoting (#5295 broke VS Code Remote‑SSH; CLOSED — see §4).**
- *For:* teams/homelabs wanting the simplest no‑keys‑no‑ports zero‑trust SSH *to Linux/macOS
  hosts, for interactive shells.*

**Cloudflare Access for Infrastructure**
- *Killer feature:* global edge front door, outbound‑only `cloudflared` tunnels (zero inbound
  ports), short‑lived certs from a Cloudflare‑managed CA, per‑request identity + device posture;
  SSH command logs HPKE‑encrypted client‑side.
- *Real limits:* the legacy browser/short‑lived‑cert path is deprecated‑direction (product
  churn); the modern path needs WARP in Traffic+DNS mode with RFC1918 split‑tunnel surgery,
  **no port/agent/X11 forwarding**, ~10h session cap; hard SaaS dependency.
- *For:* orgs already on Cloudflare Zero Trust.

**Teleport (identity‑aware access proxy)**
- *Killer feature:* the most complete audit story — own CA, RBAC to per‑login, per‑session
  WebAuthn MFA, BPF session recording with replay, unified across SSH/K8s/DB/web. Short‑lived
  certs (12h default).
- *Real limits:* heaviest to operate (HA auth+proxy cluster); the proxy is itself a
  high‑value target — **CVE‑2025‑49825 (CVSS 9.8)**, a remote SSH auth‑bypass in self‑hosted
  ≤17.5.1 (patch to 17.5.2/16.5.12/…). Per‑session MFA with raw `ssh` needs VNet (macOS/Windows).
- *For:* mid‑to‑large / regulated orgs. Overkill for one box.

**Hardware‑bound keys (FIDO2 sk‑keys / Secure Enclave / 1Password)**
- *Killer feature:* the private key is *non‑exfiltrable*. Malware reading `~/.ssh`, a stolen
  disk, a leaked backup, a poisoned dependency — all defeated. Per‑use touch/PIN/biometric
  defeats *silent* abuse of an unlocked agent.
- *Real limits:* it's a *credential*, not an architecture — doesn't solve expiry, central
  authz, or exposure, and does **not** stop a pre‑auth daemon bug. Agent forwarding remains
  the sharp edge. Platform caps: Apple Secure Enclave (Secretive) is **P‑256 ECDSA only,
  non‑backupable**; 1Password is **Ed25519/RSA only, no ECDSA**.
- *For:* protecting human privileged keys; strongest *combined with* certs (hardware‑bound
  *and* short‑lived).

**mosh (the odd one out — a transport, not an auth model)**
- *Killer feature:* predictive local echo over UDP → typing feels instant on cellular/
  satellite/transcontinental links; transparent roaming across IP changes and laptop sleep.
- *Real limits:* syncs only the *visible* screen — **no scrollback** (use tmux); needs UDP
  open; lightly maintained (1.4.0, Oct 2022); **VS Code Remote‑SSH cannot use it.**
- *For:* roaming terminal sessions on flaky links, alongside tmux and over a mesh.

---

## 3. Decision framework

The single most useful heuristic: **pick the lightest tool whose blast radius you can
tolerate.** Push auth into your IdP and reachability into a mesh; reach for a heavy access
plane only when audit/compliance is the actual requirement. (Full table in `SKILL.md`.)

---

## 4. Adversarially‑verified claims (with sources)

**regreSSHion — CVE‑2024‑6387** — *confirmed.* Disclosed 2024‑07‑01. Unauthenticated RCE as
root via a signal‑handler race in sshd's `LoginGraceTime` path on glibc Linux; a regression
of CVE‑2006‑5051 (reintroduced in 8.5p1). Affects 8.5p1 through (not including) 9.8p1 (and
pre‑4.4p1); fixed in 9.8p1. Qualys estimated ~14M internet‑exposed potentially‑vulnerable
instances. OpenBSD unaffected. Exploitation is hard (lab: ~6–8h on 32‑bit), but it's pre‑auth.
- https://blog.qualys.com/vulnerabilities-threat-research/2024/07/01/regresshion-remote-unauthenticated-code-execution-vulnerability-in-openssh-server
- https://nvd.nist.gov/vuln/detail/CVE-2024-6387

**SSH certificates are a native non‑X.509 format** — *confirmed.* `ssh-keygen -s ca -I id
-n principals -V +5m key.pub`; servers trust the CA via `TrustedUserCAKeys`, authorize via
`AuthorizedPrincipalsFile`; clients kill host‑key TOFU via `@cert-authority` known_hosts lines
+ `HostCertificate`. (Directives live in `sshd_config(5)`.)
- https://man.openbsd.org/ssh-keygen
- https://en.wikibooks.org/wiki/OpenSSH/Cookbook/Certificate-based_Authentication
- https://lwn.net/Articles/913971/

**FIDO2 sk‑keys in OpenSSH 8.2** — *nuanced (corrected).* 8.2 (2020‑02‑14) added `ed25519-sk`
/ `ecdsa-sk` (private half non‑exportable), default touch‑to‑sign with `-O no-touch-required`
to opt out, and `-O resident` (discoverable creds retrievable via `ssh-keygen -K`). **But
`-O verify-required` (per‑use PIN) is an OpenSSH 8.4 feature, not 8.2** — a common misattribution.
- https://www.openssh.org/txt/release-8.2  ·  https://www.openssh.org/txt/release-8.4
- https://developers.yubico.com/SSH/Securing_SSH_with_FIDO2.html

**`TrustedUserCAKeys` replaces `authorized_keys`** — *nuanced.* A CA‑signed cert whose
principals include the login name is accepted with no per‑user `authorized_keys` entry —
**but** setting `TrustedUserCAKeys` does *not* disable `AuthorizedKeysFile`; both pathways
coexist unless you set `AuthorizedKeysFile none`. "Principal == login" holds only without
`AuthorizedPrincipalsFile`/`Command`.
- https://man.openbsd.org/sshd_config.5  ·  https://smallstep.com/blog/use-ssh-certificates/

**Host certs + `@cert-authority` eliminate TOFU** — *nuanced.* True, but trust is gated by
(a) the known_hosts hostname pattern, (b) the cert's principals (host principals are hostnames),
and (c) the validity window — an expired host cert falls back to ordinary known_hosts and the
prompt can reappear. Not literally "any host, no warning, ever."
- https://man.openbsd.org/sshd.8  ·  https://man.openbsd.org/ssh-keygen.1

**Cert revocation strategy is expiry, not KRLs** — *confirmed.* `RevokedKeys` is a per‑server
file with no native distribution (and if unreadable, *all* pubkey auth is refused). Teleport
"relies on time to do the job"; step‑ca/Vault default to short TTLs. Active revocation exists
but is the emergency path, not the default.
- https://goteleport.com/learn/what-are-short-lived-certificates/
- https://developer.hashicorp.com/vault/docs/secrets/ssh/signed-ssh-certificates

**Tailscale SSH mechanics** — *confirmed.* `tailscale up --ssh` makes `tailscaled` the SSH
server, authorizing from tailnet identity + ACL `ssh` rules without touching
`/etc/ssh/sshd_config` or `~/.ssh/authorized_keys` (uses SSH auth type `none` because identity
is already known from WireGuard). Server platform limits (Linux/OSS‑macOS only) and the VS Code
Remote‑SSH breakage (#5295 — CLOSED, fixed 2026‑04‑07 via PR #19006, embedded SSH fork replaced) are the load‑bearing caveats.
- https://tailscale.com/docs/features/tailscale-ssh
- https://github.com/tailscale/tailscale/issues/5295

**xz/liblzma backdoor — CVE‑2024‑3094** — supply‑chain compromise of a compression library in
the sshd dependency chain; the lesson is attack‑surface/supply‑chain, reinforcing "reduce
exposure, patch, don't just tune ciphers."
- https://www.cisa.gov/news-events/alerts/2024/03/29/reported-supply-chain-compromise-affecting-xz-utils-data-compression-library-cve-2024-3094
