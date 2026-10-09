---
name: renting-cloud-gpus
description: >-
  Rents a cloud GPU for an experiment and leaves nothing behind — Vast.ai first (vastai CLI),
  RunPod/Lambda as dated alternatives. Use for GPU を借りる, クラウドGPU, vast.ai, vastai,
  RunPod, Lambda, GPU 実験を外で回す, R99 の GPU が使えない, 500円/日, 借りっぱなし, インスタンスの
  消し忘れ, ソースコードを残したくない. LAW: DESTROY-NOT-STOP (stop still bills storage and keeps
  the code); NOTHING-LEFT-BEHIND (ship only what runs, no credentials, results back, destroy, verify
  none left); TIER-BY-SECRECY (unpublished work on datacenter hosts only); BUDGET-IN-QUERY; KEY-VIA-
  FNOX. Cuts: local CPU/RAM/VRAM admission → orchestrating-agents; the R99 host itself →
  operating-wsl2-on-windows; Python tool install → running-python-tools. English skill; respond in
  the user's language (default Japanese).
---

# Renting cloud GPUs — rent, run, retrieve, destroy

> **Version**: v2610.1.0 (2026-10-05) — first forge from a primary-source survey and live
> `vastai search offers` measurements. Perishable facts (prices, CLI version, fields) live only in
> `references/`; sources and checks in `tests/forge-verification-ledger.md`.

```sh
test -f references/vast-recipe.md && test -f references/providers.md && test -f tests/forge-verification-ledger.md
```

## Language

Keep these tokens stable: **DESTROY-NOT-STOP**, **NOTHING-LEFT-BEHIND**, **TIER-BY-SECRECY**,
**BUDGET-IN-QUERY**, **KEY-VIA-FNOX**, **BOUNDED-WAIT**.

## THE LAW

> A rented GPU is someone else's computer that bills by the second. The run is not finished when
> the experiment ends; it is finished when the results are home and the instance is DESTROYED and
> a listing shows none of ours left.

| Law | Rule | Why (observed in the vendor's own docs) |
|---|---|---|
| **DESTROY-NOT-STOP** | End every rental with `destroy -y`. `stop` is never the end state. | A stopped instance keeps billing storage for every second it exists, keeps the disk (and the code on it), and bandwidth bills in any state. Outbid interruptible instances also go to *stopped*, not destroyed. |
| **NOTHING-LEFT-BEHIND** | Ship only the files the run needs (no `.git`, no secrets, no dotfiles); write under `/workspace`; copy results back; destroy; then list instances and confirm zero with our label. A `gh auth login` on the box stores a PLAINTEXT token (`~/.config/gh/hosts.yml`, observed 2026-10-05): prefer a repo-scoped fine-grained token, and `gh auth logout` before destroy. | The vendor documents no disk wipe after destroy, so what was never shipped is the only thing guaranteed not to remain. |
| **TIER-BY-SECRECY** | Throwaway/public → `verified=true`. Unpublished research → `verified=true datacenter=true` (Secure Cloud: ISO 27001, Tier 3/4). Secrets, keys, or code that must not leak → do not rent. | Instances are unprivileged Docker containers, but the host owns the machine; provider security "varies significantly" outside Secure Cloud. |
| **BUDGET-IN-QUERY** | Put the price cap in the search (`dph_total<=X`), never in your head. | A sorted list with no cap invites "just this once" upgrades. |
| **KEY-VIA-FNOX** | `VAST_API_KEY` comes from fnox (`fnox exec -- vastai …`); never `vastai set api-key`, never on the instance. | `set api-key` writes the key to a plaintext file; the instance is not ours. |
| **BOUNDED-WAIT** | Every poll for `running` has a deadline and a destroy branch. `running` is not reachable: within 3 minutes of `running`, SSH must answer and the instance must reach the internet, or it is destroyed and another machine rented. | `exited`, `unknown`, `offline` never become `running`; an unbounded loop bills storage forever. 2026-10-05: an instance reported `running` with no network in either direction (logs showed only `apt … Ign:` lines); waiting did not fix it. |

## The lifecycle — one run

```text
choose tier + cap → search → create (label) → wait + prove reachable (bounded)
  → `mise run box:init -- <alias> [--root-host H --root-port P] [--gh] [--repo owner/name …]`
      (bootstrap, gh login, clone + mise install + jj + setup + doctors, doctor:remote)
  → herdr --remote → run → retrieve → destroy → remove the alias → verify none left
```

`box:init` (run from the Mac, idempotent, `~/.ssh/config.local` alias block still yours to add) is
the whole "rented box → experiments can resume" step; the codex/claude browser logins it leaves as
a WARN are the one human step. The bootstrap and the dotfiles/mise split are dotfiles' own operating
principle (README *Design* invariant 7, *Setup → Throwaway Linux box*). This skill only rents,
proves reachability, and destroys.

Copyable commands, the pinned CLI version and the field reference: `references/vast-recipe.md`.
Every step that can fail goes to **destroy**, not to "retry later".

Label every instance `lab:<repo>:<task>` so the final listing (and any leak sweep) can tell ours
from anything else. A leak sweep is `vastai show instances --raw` filtered by that prefix; anything
found is retrieved if needed and destroyed — never stopped.

## Picking an offer — hard filters in code, rank in code, judgment last

1. **Pull everything that could qualify**: one `search offers … --raw` with the hard limits and NO
   `gpu_name` filter. Never build the candidate list by hand or from a screenshot of the web UI —
   both silently drop offers (2026-10-05: a hand-picked list missed every RTX 5060 Ti, the fastest
   card inside the budget).
2. **Hard constraints are code, not judgment**: price cap, reliability floor, VRAM, disk, excluded
   regions. A judge never weighs the budget.
3. **Rank deterministically** inside the survivors (DLPerf, or the metric the workload needs).
4. **Only then** a judgment call (Jev, or the human) on what conditions cannot express.

`datacenter=true` buys security, not uptime: the cheapest datacenter RTX 4090 measured 73.5%
reliability. Filter on `reliability` for stability.

## Choosing where to rent

| Need | Choice |
|---|---|
| Cheapest throwaway runs, budget ≈ 500 円/日 | Vast.ai `verified=true`, an RTX 3090-class card (measured ≈ $0.14/h minimum) |
| Unpublished research | Vast.ai `datacenter=true`, or RunPod Secure Cloud / Lambda |
| Interactive dev box for days | RunPod Secure Cloud or Lambda (fewer moving parts than a marketplace host) |

Dated prices and the measurement behind them: `references/providers.md`. Re-measure before
quoting a price; marketplace prices move daily.

## Execution model

Tier, cap, what to ship, and the destroy decision stay **SOLO** in the main loop. Long runs on
the instance are background Bash from the main loop (observable; see the user-global execution
rule). Parallel rentals multiply both cost and leak risk: one label per rental, one destroy per
rental, one final listing.

## MUST-NOT-FIRE and cuts

| Ask | Route |
|---|---|
| Local CPU/RAM/VRAM admission for parallel work | `orchestrating-agents` P7 |
| The R99 Windows/WSL host itself (GPU driver, wake, disk) | `operating-wsl2-on-windows` |
| Installing a Python CLI in general | `running-python-tools` |
| Which model/worker runs a task | the dispatch roster (`agx`) |
| Validity of the experiment's numbers | `validating-experimental-evidence` |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/vast-recipe.md` | Pinned CLI, auth via fnox, search fields, create/wait/ship/retrieve/destroy commands, interruptible rules, container limits | Any Vast.ai rental |
| `references/providers.md` | Dated prices: Vast.ai (measured), RunPod, Lambda (official pages); monthly arithmetic | Choosing a provider or quoting a cost |
| `tests/forge-verification-ledger.md` | Sources, live measurements, checks, open items | Reforging this skill |
