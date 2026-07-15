# Model catalog & fast-moving facts — verified 2026-07-15

> Everything in this file rots; re-run `scripts/probe-models.sh` and re-fetch docs.x.ai on
> reforge. The durable rules (CATALOG-BY-PROBE, EXFIL-RISK, METERED, PLAN-IS-NOT-READONLY) live
> in SKILL.md — this file holds only the perishable facts, each carrying a provenance grade.

## Roster

`grok models` (free, local, no quota) shows only two entries on this account:

| Model | Status | Notes |
|---|---|---|
| `grok-4.5` | DEFAULT, PROBE-VERIFIED AVAILABLE | 500,000-token context, text+image in → text out, function calling / structured outputs / reasoning. Aliases `grok-4.5-latest`, `grok-build-latest`. $2/$6 per 1M input/output tokens under 200k prompt tokens, $4/$12 at/above, cached input $0.50/$1 [official-docs]. API Tier 0: 150 RPS, 50M TPM. |
| `grok-composer-2.5-fast` | listed, not individually probed | No first-party model card. "Composer" lineage likely Cursor/Anysphere, relevant given xAI/SpaceX's pending ~$60B Anysphere acquisition (announced 2026-06-16) [third-party, well-corroborated, not xAI-confirmed]. `--effort` ignored (no `supports_reasoning_effort` in its cache entry). |

Probe form: `grok -p 'Reply with exactly: OK' -m <id> --output-format json </dev/null` → exit 0 +
`.text == "OK"` = AVAILABLE. Verified this session for `grok-4.5`.

**Broader `-m`-reachable catalog** (docs.x.ai, not in the default `grok models` menu — candidates,
not confirmed-served): `grok-4.3` (1M context), `grok-4.20-0309-{reasoning,non-reasoning,multi-agent}`,
`grok-build-0.1` (absorbed the older `grok-code-fast-1` as a legacy alias) [official-docs]. An
unknown `-m` id is a FREE client-side RC=1 fast-fail: `Couldn't set model ...: Invalid params:
"unknown model id". Run 'grok models' to see available models.` — rejected against the local
`models_cache.json` before any API call, no quota consumed [probe-verified]. That cache carries
`fetched_at`/`etag`/`origin: https://cli-chat-proxy.grok.com/v1/models` — a delivery snapshot like
codex's, refreshed on use, authoritative in neither direction (CATALOG-BY-PROBE).

## METERED — the json usage envelope

`grok -p '...' --output-format json` returns the richest envelope of the house's three drive-*
targets (verbatim shape, probe-verified):

```json
{"text":"...", "stopReason":"...", "sessionId":"...", "requestId":"...", "thought":"...",
 "usage":{"input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0,"reasoning_tokens":0,"total_tokens":0},
 "num_turns":0,
 "modelUsage":{"<model>":{"inputTokens":0,"outputTokens":0,"cacheReadInputTokens":0,"modelCalls":0}}}
```

Plain `-p` (default `--output-format plain`) prints only the answer — no usage line anywhere.
`streaming-json` emits NDJSON `{type: thought|text|end}`; the terminal `end` event carries the
full envelope above. `--json-schema '<schema>'` implies `--output-format json` and additionally
returns a parsed `structuredOutput` object validated to the schema (probe-verified beyond the
shipped README's own example). ccusage support for grok: UNVERIFIED — do not assert a
`grok-daily`/`grok-monthly` ledger exists.

## EXFIL-RISK — the incident, in full

**Finding.** Wire-level analysis by independent researcher `cereblab` (grok 0.2.93) showed Grok
Build CLI packaging the workspace as a git bundle and POSTing entire tracked git repositories —
full history plus committed secrets, unredacted — through an in-process `POST /v1/storage` call to
an xAI-controlled Google Cloud Storage bucket
(`gs://grok-code-session-traces/repo_changes_dedup/v2/...`) at roughly **27,800×** the data
volume the actual task required, on ordinary prompts including a trivial "reply OK, read nothing"
request. Measured scale (editor-verified against the primary reporting): on a 12 GB test repo the
model-turn channel moved ~192 KB while the parallel `/v1/storage` channel moved **~5.1 GB across 73
chunks (~75 MB each), every one HTTP 200**. Synthetic API keys / DB passwords in a tracked
`.env`-style file were transmitted verbatim. This happened **regardless of the in-app `/privacy` toggle**, which affects only
server-side retention, not transmission — the upload fires whether or not the user opted out;
disabling "Improve the model" did not stop it either.

**Response.** Hit Hacker News's front page 2026-07-14; Elon Musk publicly promised a data purge.
xAI's mitigation is **server-side only**: flag `disable_codebase_upload: true` flipped
2026-07-13/14 — the upload code path reportedly remains in the shipped client binary, no
client-side fix, no formal statement or scope/retention account. This host runs 0.2.101
(post-incident, 2026-07-13 build): client capability presumed still present, mitigated
server-side only — re-verify before trusting the flag is still on. Top HN commentary converged on
this skill's own posture: untrusted-by-default for automated runs, keep secrets/trade-code out of
any reachable repo, until a client-side fix ships.

**Why sandboxing does not save you.** `--sandbox` (Landlock/Seatbelt) blocks **child-process**
network egress via seccomp only — the exfiltrating call rides grok's own **in-process** HTTP
channel (the same path the agent uses for the LLM API and `web_search`), which the sandbox must
leave open for the agent to function. No `--sandbox` flag closes this channel; only DATA-MINIMIZE
(THE LAW, SKILL.md) does — never point headless grok at a repo whose history/secrets you can't
afford at xAI.

**Graded sources** (net: third-party, heavily corroborated — 5 independent outlets + the primary
wire-capture converge; NOT first-party, so scope/retention/whether the client path is fully
closed stay open — re-check before any "this is fixed now" claim):

| Source | Grade |
|---|---|
| theregister.com/ai-and-ml/2026/07/14/musk-promises-purge... | third-party, tier-1 tech press |
| thehackernews.com/2026/07/grok-build-uploads-entire-git.html | third-party, tier-1 security press |
| cybernews.com/ai-news/grok-build-git-repository-upload/ | third-party, security press |
| gist.github.com/cereblab/dc9a40bc26120f4540e4e09b75ffb547 | third-party, primary wire-capture (original finding) |
| news.ycombinator.com/item?id=48877371 | third-party, community corroboration + mitigation consensus |

## PLAN-IS-NOT-READONLY

Probe-verified this session: `--permission-mode plan` in headless `-p` did **not** block a file
write — the call created the requested file exactly as asked (RC=0, correct content), directly
contradicting the Claude-Code-inherited naming convention that "plan" implies read-only. Treat
`--permission-mode` as prompt-policy, never as enforcement.

Real filesystem containment is `--sandbox <profile>` (env `GROK_SANDBOX`), applied to the
**entire grok process at startup** — not per-command, not reversible mid-run:

| Profile | Read | Write | Network |
|---|---|---|---|
| `off` (default) | everywhere | everywhere | allowed |
| `workspace` | everywhere | cwd + `/tmp` + `~/.grok/` | allowed |
| `read-only` | everywhere | `~/.grok/` only | child-process network BLOCKED |
| `strict` | cwd + system paths | cwd + system paths | BLOCKED |

`~/.ssh/`, `~/.aws/`, `~/.gnupg/`, `~/.grok/auth/` are write-protected under every profile incl.
`off`. Landlock (Linux ≥5.13) / Seatbelt (macOS) implements this, covering in-process tools and
spawned children (`bash`, `rg`) automatically. Network restriction is PARTIAL even at
`read-only`/`strict` — see EXFIL-RISK above: it stops only child-process egress, not the
in-process channel the upload rides. Sandboxing cannot substitute for DATA-MINIMIZE.

## AUTH

Four documented session-authentication methods [official-docs, docs.x.ai/build/enterprise]:

| Method | Invocation | Notes |
|---|---|---|
| **Browser OIDC** (default) | `grok login` | Tokens in `~/.grok/auth.json` (chmod 600), expire 7d, auto-refresh 5min before expiry (`GROK_AUTH_EARLY_INVALIDATION_SECS`) or on 401 |
| **Device code** | `grok login --device-auth` (RFC 8628) | URL + short code, for SSH/containers with no browser |
| **External auth provider** | `GROK_OIDC_ISSUER`/`GROK_OIDC_CLIENT_ID`, or a custom binary via `sh -c` (stdout = ONLY the token/JSON) | Corporate IdPs (Entra ID, Okta, Auth0…); pin via `force_login_team_uuid`; recommended for sandboxed VMs/CI/air-gapped hosts |
| **API key** | `XAI_API_KEY` env (or `model.api_key`) | **Takes precedence** over browser session; best for "scripts, CI/CD, headless automation" per xAI's own docs, e.g. `grok -p "..." --output-format json --always-approve` |

**This setup (R99)**: session auth (browser OIDC), `XAI_*`/`GROK_*` unset. A prior interactive
`grok login` persists and is reused by later `-p` calls.

**Subscription tiers** (required for CLI access at all): SuperGrok $30/mo ($300/yr), X Premium+
$40/mo, SuperGrok Heavy $300/mo (only tier with full Grok 4.5 + Grok 4 Heavy + max rate limits);
SuperGrok Lite $10/mo exists, Grok Build eligibility unconfirmed [third-party]. **CLI-plan usage
quotas are NOT published in any stable table** — xAI has reactively reset Beta limits account-wide
after caching bugs [third-party]; in-CLI only via interactive `/usage`/`/cost`. Separately, the
raw **xAI API** is pay-as-you-go, billed at Team level, rate-limited by cumulative spend tier —
T0 ($0, 150 RPS/50M TPM) through T4 ($5,000, 500 RPS/100M TPM), never downgrades, breach → HTTP
429, backoff is xAI's own guidance [official-docs]. These two quota systems are independent —
never conflate a subscription limit with an API rate-limit tier.

## Install/host

Cask `grok-build` (multi-platform: `macos-aarch64`, `linux-x86_64`), links two identical binaries
`grok`+`agent`. **This setup**: lives on **R99** (WSL2, `ssh R99-wsl`), **NOT the Mac** — binary
at `/home/linuxbrew/.linuxbrew/bin/grok`; non-login SSH lacks linuxbrew on PATH, use the full path
or `ssh R99-wsl 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"; grok ...'`. R99 runs
`grok 0.2.101 (5bc4b5dfad) [stable]`, installed 2026-07-15. 898 installs/30d per
`formulae.brew.sh/cask/grok-build` [probe-verified].

**Brewfile policy**: this repo's `Brewfile` tracks brew **formulae only** (`grep -c '^cask'
Brewfile` = 0, by design). `grok-build` is a cask — it is **NOT** Brewfile-managed; do not add a
lone `cask "grok-build"` line. Install/track it manually on whichever host needs it (R99, here).

## DON'T-CONFLATE

| Name | What it actually is | Conflation risk |
|---|---|---|
| `grok-build` (cask, `grok`+`agent`, this skill) | xAI's official terminal coding agent, https://x.ai/cli | — |
| `superagent-ai/grok-cli` | Unrelated community wrapper (2.4k–3.2k★) around the raw Grok chat API; "not affiliated with... xAI" | Same "grok-cli" search terms |
| `xai-org/grok-1` | 2024 Grok-1 **model weights** release — an LLM checkpoint, not a CLI | "grok is open source" claims actually cite this |
| Groq | Hardware/inference-chip company (spelling: Groq, no second "k") | Name collision in speech/typing |
| log-parsing `grok` (Logstash/Elasticsearch) | Decades-old regex-pattern DSL, zero relation to xAI | Same bare word "grok" in infra/logging context |
| `*-Grok-MCP` repos (Grok-MCP, xai-mcp-server, grok-mcp, claude-code-grok-mcp) | Wrap the **raw xAI API** as MCP servers, bypassing the CLI | Sound like this skill's territory but never invoke `grok` |
| `BasisSetVentures/grok-cli-mcp` (8★) | DOES subprocess-spawn real `grok-build`, but self-scoped "under 100 req/min," not production | Legitimate but thin — not a production bridge |

`grok-build` is closed-source, cask-distributed, **no confirmed public issue tracker** — unlike
`openai/codex`'s public repo, "known bugs" can't be sourced the same way; rely on
`~/.grok/CHANGELOG.md` (near-daily releases) and third-party wire analyses instead.

## Provenance grades

| Claim | Grade |
|---|---|
| roster probe, json usage envelope, unknown-model RC=1 string, plan≠readonly write, sandbox table, models_cache.json fields | probe-verified — R99 grok 0.2.101, this session + harvest fleet |
| `grok-4.5` context/pricing/rate-limit, broader `-m` catalog, auth 4-method list, API tiers T0–T4 | official-docs — docs.x.ai, fetched directly |
| EXFIL-RISK full incident | third-party, heavily corroborated — 5 outlets + primary wire-capture gist; no first-party xAI report exists |
| `grok-composer-2.5-fast` lineage (Cursor/Anysphere) | third-party, well-corroborated financial press, not xAI-confirmed |
| CLI-subscription usage quotas, SuperGrok Lite eligibility | third-party / UNVERIFIED — no stable official table |
| 898 installs/30d, 0-cask Brewfile policy | probe-verified — formulae.brew.sh + `grep -c '^cask' Brewfile` run directly |
| ccusage support for grok | UNVERIFIED — do not assert either way |
