# Vast.ai recipe — pinned CLI, one rental end to end

> **Verified**: 2026-10-05 against the official CLI repo (`vast-ai/vast-cli`, its own
> `vastai/SKILL.md`), docs.vast.ai (billing, security FAQ, instances), and live
> `vastai search offers` runs with `vastai==1.8.3`. Re-check the version and flags on reforge.

## CLI

Not in Homebrew; it is a PyPI package. Run it pinned, never floating:

```sh
uvx --from vastai==1.8.3 vastai --version      # 1.8.3
alias vast='fnox exec -- uvx --from vastai==1.8.3 vastai'   # KEY-VIA-FNOX; use in an interactive shell
```

Search works without a key; everything account-bound needs `VAST_API_KEY` (the CLI reads that
variable before its key file). Store the key once per machine:

```sh
fnox set -g -p keychain VAST_API_KEY      # Mac (Keychain)
fnox set -g -p age VAST_API_KEY           # R99/WSL (age file)
```

Register the SSH public key BEFORE the first create (`vastai create ssh-key ~/.ssh/id_ed25519.pub`).

## 1. Search — tier and cap in the query

```sh
# throwaway, 500 円/日 class
vast search offers 'gpu_name=RTX_3090 num_gpus=1 verified=true rentable=true direct_port_count>=1 reliability>0.95 dph_total<=0.16' -o 'dph_total' --limit 10
# unpublished research: add datacenter=true (Secure Cloud)
vast search offers 'gpu_name=RTX_4090 num_gpus=1 verified=true datacenter=true rentable=true dph_total<=0.6' -o 'dph_total' --limit 10
```

| Field | Meaning |
|---|---|
| `verified=true` | Vast-verified machine (the default filter unless `-n`) |
| `datacenter=true` | Hosting type = datacenter: the "Secure Cloud" tier (ISO 27001, Tier 3/4) |
| `dph_total` | $/h including the storage you ask for (`--storage`, default 5 GB in pricing) |
| `reliability` | host's historical uptime ratio |
| `direct_port_count>=1` | direct SSH ports (no proxy hop) |
| `--raw` | JSON for scripts (`dph_total`, `storage_cost` $/GB/month, `reliability2`) |

Interruptible: `--type bid` shows `min_bid`, but create rents ON-DEMAND unless `--bid_price` is
passed. Outbid → `stopped` (storage keeps billing). Use bids only for restartable work.

## 2. Create — labelled, smallest disk that fits

```sh
vast create instance <OFFER_ID> --image <image:tag> --disk 30 --ssh --direct --label lab:<repo>:<task>
# → {"success": true, "new_contract": <INSTANCE_ID>}
```

The instance is an unprivileged Docker container: no Docker-in-Docker, no systemd. Pick an image
that already has the CUDA you need (`vastai search templates`), or install in the run script.
Storage bills from creation; GPU bills from `running`.

## 3. Wait — BOUNDED-WAIT

Poll `vast show instance <ID> --raw` for `actual_status == "running"` with a deadline (10 min is
generous). `exited`, `unknown`, `offline` never reach running: destroy and pick another offer.

Then prove it is REACHABLE, within 3 minutes: SSH to the direct port (`public_ipaddr`:
`direct_port_start`), falling back to the proxy (`ssh_host`:`ssh_port`), and from inside fetch an
external URL (`curl -sS -o /dev/null -w '%{http_code}' https://github.com`). `vast logs <ID>` that
show only `Ign:` lines from `apt` mean the container has no network — destroy at once, do not wait
(observed 2026-10-05: direct SSH timed out, the proxy refused, and it never recovered).

## 4. Ship — NOTHING-LEFT-BEHIND

```sh
git archive --format=tar HEAD <paths…> | ssh $(vast ssh-url <ID> | sed 's#ssh://##') 'mkdir -p /workspace/run && tar -x -C /workspace/run'
# or: vast copy local:./bundle/ <ID>:/workspace/run/
```

Ship a tree, not a checkout (`git archive` carries no `.git` history). Never write to `/` or `/root`
(it breaks the instance's ssh permissions). No keys, tokens, or `.env` files.

## 4b. House environment (dotfiles + `herdr --remote`), verified end to end 2026-10-05

One command as root on the fresh instance builds the core dev environment (a non-root user, the
`Brewfile.core` tools as mise-downloaded releases in ~/.local/bin, the agent CLIs, dotfile links);
toolchains such as Julia then come from the project's `mise.toml`. From the Mac, ONE task does all
of it — the root bootstrap, the gh login, each repo's clone / `mise install` / jj / setup / doctor,
and `doctor:remote` — and is a fast no-op on a finished box:

```sh
mise run box:init -- <alias> --root-host <host> --root-port <port> --repo owner/name [--repo …]
```

Logins come from the Mac via `mise run auth:push -- <alias>` (`box:init` runs it); credentials die with the container, so destroy it when finished rather than stopping it.

Add the `Host <alias>` block to `~/.ssh/config.local` first (the task prints the requirement and
stops if the alias does not answer); drop `--root-host/--root-port` once the box is bootstrapped.
What the bootstrap step runs, by hand if the task itself is the thing broken:

```sh
ssh -p <port> root@<host> 'curl -fsSL https://raw.githubusercontent.com/fuyutarow/dotfiles/alpha/scripts/bootstrap-linux.sh | bash'
```

`mise run box:init -- <alias>` also writes the agent-dispatch host declaration on this owner's rented box when its measured container and user-namespace checks pass.

Right after pushing a change to it, use the commit in the URL instead of `alpha`
(`…/dotfiles/<commit>/scripts/bootstrap-linux.sh`): raw.githubusercontent.com served the
pre-push version for several minutes (observed 2026-10-05). The traps it handles, seen on
`vastai/base-image`:

| Symptom | Cause | Fix |
|---|---|---|
| Homebrew: `mkdir /root/.cache: Permission denied` as the new user | `/etc/environment` sets `HOME=/root` for everyone | delete that line |
| `herdr --remote` cannot start the remote side | linuxbrew is not on a NON-interactive ssh PATH; `zsh/zshenv` adds only `~/.local/bin` and `~/.bun/bin` | `ln -s /home/linuxbrew/.linuxbrew/bin/herdr ~/.local/bin/herdr` |
| no direct ssh port on the offer (`direct_port_start: -1`) | host exposes only the proxy | `ssh_host:ssh_port` in a `Host` block of `~/.ssh/config.local` (never the public repo) |

Remove that `Host` block when the instance is destroyed.

## 5. Run, 6. Retrieve

Run under `nohup`-free supervision from the main loop (background Bash with `ssh`). Copy results
back with `vast copy <ID>:/workspace/run/out/ local:./out/` and check they landed (sizes, a hash).

## 7. Destroy, 8. Verify

```sh
vast destroy instance <ID> -y
vast show instances --raw    # expect no entry with label lab:<repo>:…
```

## Billing facts that shape the law

- Per-second GPU billing while running; storage per second while the instance exists (any state
  but offline); bandwidth per byte in any state.
- Prepaid credit. At $0 instances are stopped; without a card on file they and their data are
  deleted after a grace period sized by average daily spend.
- No documented disk wipe after destroy — hence ship minimal.
