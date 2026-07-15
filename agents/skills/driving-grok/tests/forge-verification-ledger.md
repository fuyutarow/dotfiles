# driving-grok — forge & verification ledger

> Forged 2026-07-15 under the `forging-skills` pipeline. This file is the F3 artifact:
> provenance, the PROBE LOG (verbatim evidence), calibration, and verification-fleet results —
> no promises, no "pending" left unresolved once the verify phase closes.

## Source & provenance

| Source | Class | Grade |
|---|---|---|
| Orchestrator ground truth (SOLO probes on R99, `grok 0.2.101`): metered json envelope, roster, sandbox flags, auth shape, subcommand list | live SESSION — highest grade | author-confirmed; verbatim excerpts below |
| Harvest fleet, 3 parallel sonnet lenses (`{model:'sonnet'}`): **r99-surface** (deep CLI + shipped `~/.grok/README.md`, 4 budgeted model probes), **official-docs** (docs.x.ai fetched directly), **community** (GitHub/HN/press) | live SESSION, fanned out | probe-verified rows author-confirmed; shipped-readme/official-docs rows first-party-quoted; third-party rows graded per-row below |
| Draft fleet: sonnet drafters, one per SKILL.md/model-catalog.md/probe-models.sh/this ledger, against the editor's SIGNED SPEC | live SESSION | this file is one such draft |
| Verify fleet: sonnet refuters (read-only) + Terra (`gpt-5.6-terra` via `codex exec`, cross-vendor adjudication) + a grok self-dogfood pass (grok reviewing its own skill) | scheduled, this forge | **results not yet in — see Verification-fleet results below** |
| Director: Opus 4.8, SOLO — wrote the SIGNED SPEC, the four PER-FILE CONTRACTS, and will resolve refuter/Terra/grok findings in FIX | live SESSION | author-confirmed (the spec itself) |

## PROBE LOG — decisive facts, verbatim

Nine items, each: the claim, the verbatim evidence excerpt behind it, and its grade. These are the
facts the LAW and Gates in SKILL.md are built on — cross-check any SKILL.md line against this log
before trusting it past a reforge.

**1. METERED — the full json usage envelope.** Ground truth: `-p '...' --output-format json`
returns `{text, stopReason, sessionId, requestId, thought, usage:{input_tokens,
cache_read_input_tokens, output_tokens, reasoning_tokens, total_tokens}, num_turns,
modelUsage:{<model>:{inputTokens, outputTokens, cacheReadInputTokens, modelCalls}}}`. Verified:
`grok -p 'Reply with exactly: OK' --model grok-4.5 --output-format json` → RC=0, exact envelope
above. Grade: probe-verified. Richer than codex's blended usage line; the opposite of agy's
NO-METER.

**2. `--json-schema` adds a parsed `structuredOutput`.** r99-surface: `grok -p 'Give me name=Bob
age=3' --json-schema '{...}' --model grok-4.5` returns the documented envelope PLUS an extra key:
`structuredOutput: {"name":"Bob","age":3}`. Verbatim capture: `{"text":"{\"name\":\"Bob\",\"age\":3}",
"stopReason":"EndTurn", "sessionId":..., "usage":{...}, "modelUsage":{...},
"structuredOutput":{"name":"Bob","age":3}}`. RC=0. Grade: probe-verified. Not documented in the
shipped README's Output Formats section, nor found on docs.x.ai by the official-docs lens.

**3. `streaming-json` NDJSON events, `end` carries full usage.** r99-surface: emits
`{"type":"thought","data":"<token>"}` (reasoning trace), `{"type":"text","data":"<token>"}`
(answer), then one `{"type":"end",...,"usage":{...},"num_turns":1,"modelUsage":{...}}`. Verbatim
run: "Captured 13 thought events, 3 text events ('Hello'/' streaming'/' world'), then one end
event with usage.input_tokens:12409, reasoning_tokens:34, modelUsage.grok-4.5.modelCalls:1. RC=0."
Grade: probe-verified — richer than the README's own minimal doc example (README shows only
`stopReason`/`sessionId`/`requestId` on the end event).

**4. PLAN-IS-NOT-READONLY — the decisive contradiction.** r99-surface: `grok -p "create a file
test.txt with the content hello" --permission-mode plan --output-format json --model grok-4.5`
**created the file** (RC=0, num_turns:2, modelUsage.grok-4.5.modelCalls:2). Verbatim: `{"text":
"Created \`test.txt\` with the content \`hello\`.", "stopReason":"EndTurn", ...}`; `ls -la`
afterward showed `test.txt` present (6 bytes); `cat` confirmed content `hello`; file cleaned up
after verification. Grade: probe-verified. Directly contradicts the Claude-Code-inherited naming
convention that "plan" implies read-only — the README's Options table gives this flag zero
enum/semantics beyond "Permission mode for tool approvals."

**5. Unknown `--model` is a free client-side RC=1.** r99-surface: `grok -p 'hello' --model
definitely-not-a-real-model-xyz` prints "Couldn't set model ...: Invalid params: \"unknown model
id\". Run 'grok models' to see available models." to stdout and as an `Error:` line, exits RC=1,
never reaches the model — "rejected against the local models_cache before any API call — no
modelUsage/quota consumed." Grade: probe-verified (RC captured via `echo "---RC=$?---"` on the
next line, not through a pipe).

**6. `grok agent` ≠ `-p`.** r99-surface: `grok agent [OPTIONS] [COMMAND]` has subcommands `stdio`
(JSON-RPC for IDEs), `headless` (WebSocket relay), `serve`, `leader` — "It has NO -p/--single
flag... 'grok agent -p ...' is therefore not a valid invocation — single-prompt headless work is
exclusively via top-level grok -p." README §Agent Mode: "Run Grok as an ACP (Agent Client
Protocol) agent for integration with IDEs, editors, and custom tooling." Grade: shipped-readme +
probe-verified `--help` text.

**7. Sandbox is real OS enforcement: Landlock/Seatbelt.** r99-surface, README §Sandbox verbatim:
`--sandbox <PROFILE>` applies Landlock (Linux ≥5.13) or Seatbelt (macOS) to "the ENTIRE grok
process at startup," covering in-process tools and child processes. Profiles: `off`(default,
unrestricted), `workspace`(write cwd+/tmp+~/.grok, network allowed), `read-only`(write only
~/.grok/, network blocked), `strict`(cwd+system paths, network blocked). Sensitive paths
(~/.ssh/, ~/.aws/, ~/.gnupg/, ~/.grok/auth/) always write-protected. Sandbox is irreversible once
applied. Network restriction is explicitly PARTIAL: "restrict_network profiles block
child-process network... via seccomp, but in-process tool calls (web_search, and the LLM API call
itself) are NOT blocked — 'the agent needs network access to function.'" Grade: shipped-readme.
This last clause is the technical basis for the LAW's "you cannot `--sandbox` your way out" of
EXFIL-RISK.

**8. Auth — four documented methods, this host = session.** Ground truth: "AUTH = session —
logged in via grok.com (OAuth-style); `~/.grok/auth.json` (chmod 600, keyed
`https://auth.x.ai::<uuid>`). NOT an API key by default." official-docs, docs.x.ai/build/enterprise:
"Grok Build supports four session authentication methods: Browser OIDC, Device code, External
auth provider, and API key" — OIDC default (`grok login`), device-code for SSH/containers (RFC
8628), external corporate IdP (Entra ID/Okta/Auth0-style, refreshable), `XAI_API_KEY` for
CI/scripts. Grade: official-docs (method enumeration) + probe-verified (this host's method +
file path).

**9. EXFIL-RISK — the 2026-07 data-exfiltration incident, first-hand web-verified.** community
lens: "Wire-level analysis by researcher 'cereblab' (grok 0.2.93) showed Grok Build CLI uploading
entire tracked git repos — full history plus committed secrets — to a Google Cloud Storage bucket
(gs://grok-code-session-traces/repo_changes_dedup/v2/...) at ~27,800x the data volume the task
needed, regardless of the /privacy toggle (which only affects retention, not transmission). Hit
Hacker News front page 2026-07-14 with Musk promising a data purge. xAI's fix so far: server-side
flag `disable_codebase_upload:true` flipped 2026-07-13; upload code reportedly remains in the
shipped binary; no published scope/retention account." Sources cited by the lens: theregister.com
(2026/07/14, "Musk promises purge..."), thehackernews.com (2026/07, "Grok Build uploads entire
git..."), cybernews.com ("Grok Build git repository upload"), gist.github.com/cereblab (the raw
wire-capture writeup), news.ycombinator.com (item 48877371, front-page thread). Grade: third-party,
heavily corroborated — four independent outlets plus the primary researcher's own gist, none of
them xAI. Community mitigation consensus (top HN comment, verbatim-summarized): "OS-level
sandboxing (bubblewrap with unshared namespaces, read-only binds of system paths), restricting
network egress to approved LLM endpoints, and keeping secrets/trade-code out of any repo the
agent can access — treat grok as untrusted-by-default for automated/unattended runs until xAI
resolves the disclosure." **No client-side fix and no formal xAI statement as of 2026-07-15** —
the mitigation is a server-side flag only, which is why DATA-MINIMIZE (never sandboxing alone) is
the LAW's containment strategy.

## Calibration table — re-verify FIRST on any reforge

| Fact | State captured this forge (2026-07-15) | Re-verify how |
|---|---|---|
| Model roster | `grok models` (free/local) shows `grok-4.5` (default) + `grok-composer-2.5-fast`; broader `-m`-reachable catalog (grok-4.3, grok-4.20-0309-*, grok-build-0.1) per docs.x.ai only, not in the local roster | `scripts/probe-models.sh` no-arg + `grok models`; diff against `references/model-catalog.md`'s dated header |
| CLI version | `grok 0.2.101 (5bc4b5dfad) [stable]`, dated 2026-07-13, near-daily self-updating point releases | `grok --version` + `~/.grok/CHANGELOG.md` before any load-bearing version claim |
| EXFIL-RISK client capability | server-side flag `disable_codebase_upload:true` flipped 2026-07-13; **upload code path reportedly still present client-side**; no client fix, no formal xAI statement, no full post-incident report as of 2026-07-15 | search for an xAI post-incident report / changelog entry naming a client-side fix; re-check the cited HN thread (item 48877371) and gist.github.com/cereblab for updates; do NOT downgrade EXFIL-RISK without a first-party or independently-corroborated fix, and do not upgrade its severity without new evidence either |
| CLI usage quota (subscription-tier, not API $-tier) | NOT published in a stable table by xAI; third-party reports (basenor.com) describe a reactive account-wide reset after a caching-inefficiency bug — CLI-plan quotas graded UNVERIFIED throughout | re-search for a published Grok Build plan-quota table; if still absent, keep the UNVERIFIED grade rather than inferring a number |
| `--sandbox read-only` vs the plan-mode write | PLAN-IS-NOT-READONLY is probe-verified (item 4 above); `--sandbox read-only` blocking the SAME write was flagged by the r99-surface lens as NOT independently probe-verified this forge (budget was spent on 4 assigned probes) | run the r99-surface lens's own suggested follow-up: repeat the item-4 file-write probe with `--sandbox read-only` substituted for `--permission-mode plan` and confirm the write is blocked |

## Verification-fleet results

`TO BE FILLED IN VERIFY PHASE`

(Placeholder — the sonnet refuters, Terra (`gpt-5.6-terra` via `codex exec`), and the grok
self-dogfood pass have not yet run against the drafted SKILL.md/catalog/script. This section is
the required landing zone for their findings + the editor's signed resolutions, in the same
`# | Finding (compressed) | Resolution` table shape driving-codex's ledger uses, followed by a
`Post-fix floor` verification block: `skill-check.sh` PASS/FAIL, strict YAML parse of the
frontmatter, `bash -n scripts/probe-models.sh`, and the build-order one-liner from the SIGNED
SPEC's version header.)
