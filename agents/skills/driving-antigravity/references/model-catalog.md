# Model catalog & fast-moving facts — verified 2026-07-14, re-probed 2026-07-23

> Everything in this file rots. Each claim carries its provenance grade (§ bottom); on reforge,
> re-run `bun scripts/probe-models.ts` and re-fetch official docs instead of trusting this snapshot.
> The durable rules (NO-METER, UNCONFINED, CATALOG-BY-PROBE, VERSION-DRIFTS) live in SKILL.md —
> this file holds only the perishable facts. Binary: agy v1.1.5 as of 2026-07-23 (was v1.1.2;
> self-updated in place again — see VERSION-DRIFT below; do not trust `agy --version` from a stale
> memory).

## 現行の推奨腕 — WHICH slug to pick (2026-07-25)

This section exists because the roster below is an INVENTORY, and an inventory does not bind a
choice. Measured failure, 2026-07-25: a cross-vendor design panel picked `gemini-3.1-pro-high` as
its Google arm — the OLDEST generation in this file — and `claude-opus-4-6-thinking` as an
"Anthropic different-lineage" arm. Both were picked by NAME HEURISTIC (`pro` outranks `flash`,
`opus` outranks the rest), not by anything recorded here. Listing a slug is not recommending it.

| Job | Pick | Why |
|---|---|---|
| Google arm of a cross-vendor panel | `gemini-3.6-flash-<effort>` | Newest generation here, and the only 3.6 slug PROBE-VERIFIED on this binary. Google lists Gemini 3.6 Flash as **Stable** and its own positioning names agentic tasks: *"Our latest model that balances speed with intelligence to deliver strong performance in agentic and multimodal tasks."* (ai.google.dev/gemini-api/docs/models, fetched 2026-07-25) |
| anything else | re-probe first | CATALOG-BY-PROBE — a slug that is merely listed is a candidate, not an arm |

**Do NOT pick as a panel arm:**

| Slug | Why not |
|---|---|
| `gemini-3.1-pro-*` | Two generations behind the 3.6 line here. Google lists Gemini 3.1 Pro as **Preview**, not Stable (same source/date). A tier name (`pro`) is not a capability ordering ACROSS generations |
| `claude-opus-4-6-thinking`, `claude-sonnet-4-6` | Anthropic models reached through agy are NOT a different lineage from the house model — they share vendor and training lineage, which is precisely the independence that heterogeneous verification is buying. Opus 4.6 is additionally on Anthropic's published **legacy** list (2026-07-25). Never the "different-lineage" arm |
| any slug whose row says "not individually probed" | probe it, then use it |

Staleness: this section rots with the roster. Re-derive it on any reforge — re-run `agy models`,
re-probe the top candidate, and re-fetch the vendor's current model page before trusting the
Stable/Preview labels above.

## Roster — re-probed on THIS account, 2026-07-23 (agy v1.1.5)

`agy models` (free, local, no quota) lists the EXACT `--model` strings. **As of v1.1.5 these are
dash-case slugs** — `gemini-3.6-flash-medium`, `claude-sonnet-4-6`, `gpt-oss-120b-medium`. This
INVERTS the pre-1.1.5 grammar: v1.1.2's `agy models` emitted parenthesized display strings
(`Gemini 3.5 Flash (Medium)`) and rejected slugs (`gemini-3.1-pro` → RC=1). The 1.1.5 changelog is
explicit — *"Added stable, user-facing model slugs … accepted by `--model`, so you can pin a
specific model reliably across sessions."* Copy whatever `agy models` prints on the LIVE binary
verbatim; never carry a form across a version bump. An unresolvable `--model` is still a free
client-side fast-fail (RC=1, prints the valid list); candidate-probing costs NO quota.

| `--model` slug (verbatim, agy v1.1.5) | Probe status 2026-07-23 |
|---|---|
| `gemini-3.6-flash-medium` | PROBE-VERIFIED AVAILABLE (RC=0, `OK`) — NEW family this snapshot |
| `gemini-3.6-flash-high` / `-low` | listed by `agy models`; not individually probed |
| `gemini-3.5-flash-high` / `-medium` / `-low` | listed by `agy models`; not individually re-probed 2026-07-23 |
| `gemini-3.1-pro-high` / `-low` | listed by `agy models`; not individually re-probed 2026-07-23 |
| `claude-sonnet-4-6` | listed by `agy models`; not individually re-probed 2026-07-23 |
| `claude-opus-4-6-thinking` | listed by `agy models`; not individually probed |
| `gpt-oss-120b-medium` | listed by `agy models`; not individually re-probed 2026-07-23 |

Full 2026-07-23 roster (11 slugs, verbatim): `gemini-3.6-flash-{high,medium,low}`,
`gemini-3.5-flash-{high,medium,low}`, `gemini-3.1-pro-{high,low}`, `claude-sonnet-4-6`,
`claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. v1.1.5 also added `--effort` (and `/effort`) to
pick a model's reasoning-effort variant at launch — orthogonal to `--model`. The parenthesized
display strings and the old 2026-07-14 per-model probe times (Sonnet 4.6 6s, GPT-OSS 7s, 3.1 Pro
9s) were taken on v1.1.2 and are retired; only `gemini-3.6-flash-medium` was re-probed on v1.1.5.

Output is clean: probe 5 (`Gemini 3.1 Pro (Low)`, redirected to files) — `cat -A out.txt` showed
`OK$` only (no control sequences); `err.txt` = 0 bytes, `out.txt` = 3 bytes. stdin is IGNORED in
`-p` mode (v1.1.1+ stopped reading it to fix a hang — piped context never reaches the model).
Concurrency: two simultaneous `agy -p` calls both completed RC=0, correct, non-cross-contaminated,
in the same wall time as one call — true parallelism, no lock observed.

## NO-METER — the accounting dead end

No local file anywhere under `~/.gemini/antigravity-cli` names or contains quota/usage state:
`find -iname '*quota*'/'*usage*'` both empty; `grep -ri quota` across the whole tree hits only
`CHANGELOG.md` prose and log lines that never print a number. No `usageMetadata`/token-count
strings anywhere in the per-conversation SQLite blobs, no such schema columns anywhere, `cli.log`
never logs numeric usage (only URLs/trace-IDs). Quota is fetched live from
`daily-cloudcode-pa.googleapis.com` every session and surfaced ONLY via interactive-only UI:
`/usage`, `/quota` slash commands, a status line — none reachable from `-p` (agy's top-level
subcommands are only: `agent(s)`, `changelog`, `help`, `install`, `models`, `plugin(s)`, `update`
— no `usage`/`quota`).

`ccusage@latest` (freshly resolved 2026-07-14) has NO `antigravity`/`agy` subcommand. Full list of
the 21 it does support: `daily, monthly, weekly, session, blocks, statusline, claude, codex,
opencode, amp, droid, codebuff, hermes, pi, goose, kilo, copilot, gemini, kimi, qwen, openclaw`.
Its `gemini` subcommand reads a structurally DISJOINT path (`~/.gemini/tmp/<project>/chats/` —
legacy gemini-cli's own storage) versus where agy writes
(`~/.gemini/antigravity-cli/conversations/*.db`) — confirmed empirically: `ccusage gemini daily
--json` returned all-zero totals despite 9 fresh agy conversation files existing from probes run
the same session. ccusage's maintainers declined Antigravity support — the decline + the
near-verbatim "local files do not contain reliable token usage" reasoning live in ccusage's docs
(merged PR #1070, 2026-05-19), NOT in the feature request `ryoppippi/ccusage#732` (an early
duplicate closed with zero comments); the stance is under a live technical rebuttal as of this
snapshot [third-party].

What agy DOES persist well: conversation TEXT — a dedicated SQLite file per conversation plus a
clean `transcript.jsonl` (role/content/timestamp per line) — a transcript primitive, not a usage
primitive.

## UNCONFINED — evidence

With neither `--dangerously-skip-permissions` nor `--sandbox` set, from a scratch cwd, asking agy
to write a file executed the write with ZERO interactive prompt and ZERO hang: RC=0 in 11s — but
the file landed at `~/.gemini/antigravity-cli/scratch/probe.txt`, NOT the invoking shell's cwd,
even though agy's own `cli.log` correctly logged `workspaceDirs=[.../scratchpad/agy-probe]` for
that exact invocation. The model's own response text says it wrote to
`~/.gemini/antigravity-cli/scratch` — the divergence is the MODEL's path choice, not a
workspace-detection bug: agy detects the real cwd correctly but enforces no confinement forcing
writes to stay under it. Corroborated by open GitHub issue `google-antigravity/antigravity-cli#45`
("read-only / plan-mode equivalent for non-interactive -p runs"), filed 2026-05-20, still OPEN as
of the last comment (2026-06-19): "system did not block the tool call, and I did not refuse"
(verbatim from the issue repro). `--sandbox` is NOT a substitute boundary — it restricts only
terminal/shell tool calls, not `write_file`, and is itself bypassable when combined with
`--dangerously-skip-permissions` (open issue `#36`; a third-party commenter there claimed an unreaped
iPhone-simulator boot loop drove Mac load average to 307 [unverified promo-comment anecdote,
NOT part of the filed bug]). The reusable lesson is only that a shell `timeout` does not reap
agy's tool children. Never treat `--sandbox` alone as isolation for untrusted input.

## VERSION-DRIFT

This host showed THREE different version numbers simultaneously: Caskroom installed = 1.0.7
(2026-06-12); `brew info --cask antigravity-cli` catalog metadata = 1.1.1; actually-running binary
= **1.1.2** via `agy --version`. `/opt/homebrew/bin/agy` is a real 143,664,736-byte Mach-O binary
dated the SAME DAY 14:08 (not a symlink) — the original brew-managed symlink was renamed aside to
`agy.<epoch-ns>.old`. `cli.log` shows `auto_updater.go:207] Last check was less than 15 minutes
ago, skipping update` — an autonomous updater ran ~5 minutes before the probe session and
physically replaced the brew-managed binary path. `brew upgrade`/`brew bundle` will NOT detect or
revert this (the cask has `auto_updates: true`, so brew treats it as self-managed and skips it).

**Update 2026-07-23 (v1.1.5, self-updated again from v1.1.2).** `agy changelog` now runs to 1.1.5.
Two headless-relevant shifts, both quoted from the changelog (VENDOR PROSE — the containment one is
NOT yet re-probed):
- **1.1.5 added stable `--model` slugs** (verbatim: *"Added stable, user-facing model slugs … accepted
  by `--model`"*). This is why the roster above is now dash-case, inverting the v1.1.2 grammar snapshot.
  Also added `--effort`/`/effort` (reasoning-effort variants) and made headless honor `settings.json`.
- **CONTAINMENT is now CONTESTED — re-probe before trusting UNCONFINED either way.** 1.1.3: *"headless
  (-p) … now soft-denies [confirm-required] tools and prints a stderr notice naming the allow-rule
  needed"* + *"Fixed outside-of-workspace file writes being incorrectly auto-approved in always-proceed
  mode."* 1.1.5: *"Fixed headless (-p / --print) runs so they now honor persisted settings.json
  policies, including permissions, file access, sandbox mode, auto-execution, and artifact review."*
  If accurate, the UNCONFINED LAW (SKILL.md THE LAW / A3) is materially softened on ≥1.1.3 — default
  `-p` may no longer blanket-auto-approve, and `settings.json` may now be a real boundary. This is NOT
  probe-confirmed: the 2026-07-14 write-outside-cwd evidence was taken on v1.1.2. Run a fresh
  containment probe on v1.1.5 (does `-p` still write under `$HOME` past the cwd? does a `settings.json`
  deny/sandbox actually bind headless?) before relying on EITHER the old law or the new claim.

`agy changelog` is a rich, fully local, offline version history (1.0.0 → 1.1.5) — treat it as the
authoritative local history, not brew's version string. Headless-relevant entries: **1.0.5** added
`--model` and the `models` subcommand; **1.0.6** fixed `--sandbox` propagation in print mode;
**1.0.9** fixed a headless `-c`/`-p` resumption bug (was dumping the full transcript instead of
just the new reply); **1.1.1** fixed `agy -p` hanging in subprocess contexts (stopped reading
stdin when a prompt flag is given) AND print mode silently exiting 0/success on server-side
failure; **1.1.2** hard-fails print mode with nonzero exit + model list when `--model` can't be
resolved (previously silently downgraded). The host audited here started at 1.0.7 — 5+ point
releases behind, predating the 1.1.1 headless-correctness fixes — before self-updating mid-session
to 1.1.2.

## Install / provenance

- Cask: `antigravity-cli` (binary artifact `antigravity` → `agy`), installed on this host. This
  repo's `Brewfile` tracks `brew` FORMULAE only (zero casks as of 2026-07-14), so agy — like the
  other installed casks (`google-gemini`, `antigravity`) — is NOT Brewfile-managed here, and it
  self-updates out-of-band anyway (see VERSION-DRIFT). Do NOT add a lone `cask` line without first
  adopting a cask convention for the whole Brewfile.
- Distinct from cask `antigravity` (the 426MB desktop IDE, `Antigravity.app`) and from
  `google-gemini` (the separate consumer desktop app) — do not conflate the three.
- Google deprecation context: gemini-cli's consumer OAuth path died 2026-06-18; the cask is
  slated brew-disabled 2026-12-18. agy is the named official successor (closed-source Go binary,
  distributed via installer/issue-tracker repo `google-antigravity/antigravity-cli` — no public
  source). Google's transition post cites multi-agent orchestration beyond terminal-only tooling
  as the sunset rationale and lists preserved capabilities (Skills, Hooks, Subagents,
  Extensions-as-plugins); it makes NO claim about headless-mode production-readiness and never
  mentions Claude/GPT-OSS availability [official-docs, but silent on this skill's exact question].

## Quota tiers — MARKED unverified / open question

Do NOT assert numeric caps. On record, all [third-party / unverified]: quota policy has been
volatile through 2026 (a 5-hour-refresh "honeymoon" → reported ~80–92% cut to a weekly cap in
March → partial relief → scattered UNVERIFIED July 2026 user reports, e.g. a single X post, that
5-hour refresh was restored for Pro/Ultra tiers) — no OFFICIAL Google statement of exact caps
found anywhere. Claude and GPT-OSS models draw from the
SAME shared credit pool as Gemini (no separate pool) at a materially higher, undocumented rate —
anecdotally Claude Opus burns ~4x the credits of an equivalent Gemini call, Sonnet intermediate,
with one commenter noting Flash/Flash-Lite calls don't draw against Pro-tier quota the same way —
implying at least a coarse tier split, but no first-party multiplier table exists. Separately,
Google is running a live, unexplained wave of 403 "Terms of Service violation" account bans on its
own developer forum through July 2026, with no published criteria distinguishing automation from
abuse — a real risk for unattended agy workflows, on top of the UNCONFINED gap. Re-verify against
the user's actual plan tier before any load-bearing budget decision.

## Provenance grades

| Claim | Grade |
|---|---|
| 2026-07-23 re-probe: agy v1.1.5, 11-slug roster, `gemini-3.6-flash-medium` AVAILABLE (RC=0) | probe-verified — direct `agy --version` + `agy models` + `agy -p` this session, 2026-07-23 |
| slug grammar added in 1.1.5 (inverts the v1.1.2 "no slug grammar" claim) | vendor-prose corroborating a probe — `agy changelog` 2026-07-23 + the live roster now being slugs |
| 1.1.3/1.1.5 headless containment claims (settings.json honored, soft-deny, no outside-cwd auto-approve) | vendor-prose, UNVERIFIED — `agy changelog` 2026-07-23; flagged CONTESTED, needs a fresh containment probe before trusting |
| roster probe table (4/5 families), free RC=1 fast-fail, output cleanliness, stdin-ignored, concurrency-clean | probe-verified — direct `agy -p` calls, 2026-07-14 (parenthesized names, v1.1.2 — grammar since superseded) |
| NO-METER filesystem/log sweep, ccusage 21-subcommand list + disjoint `gemini` path + zero-totals run | author-confirmed — direct filesystem/process inspection + live `ccusage` run, 2026-07-14 |
| UNCONFINED direct write-outside-cwd probe | probe-verified — direct `agy -p` call + `cli.log` cross-check, 2026-07-14 |
| GitHub issues #45 / #36 (no plan-mode; sandbox bypass) | third-party — `gh` view; both OPEN — #45 last comment 2026-06-19, #36 last comment 2026-07-14; the #36 load-307 figure is an unverified promo-comment anecdote (reattributed in-text) |
| antigravity-cli#76 (agy -p drops stdout on non-TTY; fixed 1.1.1) | EDITOR-VERIFIED — `gh api` shows the public issue, title "agy --print / -p silently drops stdout when run with a non-TTY", closed 2026-07-12; corroborated by local `agy changelog` |
| VERSION-DRIFT (three version numbers, self-update timestamp, changelog entries) | author-confirmed — direct `brew info`, `agy --version`, `agy changelog`, filesystem timestamps, 2026-07-14 |
| gemini-cli consumer OAuth death 2026-06-18 | official-docs — Google transition blog, editor-fetched 2026-07-14 (developers.googleblog.com, "Shutdown Date: June 18, 2026") |
| gemini-cli brew-disable 2026-12-18 | EDITOR-VERIFIED — `brew info gemini-cli` prints "It will be disabled on 2026-12-18" (2026-07-14) |
| official transition-post sunset rationale | official-docs (Google transition post), but silent on headless production-readiness |
| quota tiers, numeric caps, Claude/GPT-OSS multiplier | third-party / UNVERIFIED — anecdotal forum/issue evidence only; no first-party numbers found; do not assert as fact |
| `Claude Opus 4.6 (Thinking)` availability | inferred by grammar symmetry — NOT probed, quota deliberately conserved |
