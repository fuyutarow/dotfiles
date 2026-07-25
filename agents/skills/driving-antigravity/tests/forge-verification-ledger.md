# driving-antigravity — forge & verification ledger

> Forged 2026-07-14 under the `forging-skills` pipeline. This file is the F3 artifact:
> provenance, the PROBE LOG (verbatim), a calibration table, and the gemini-cli DROPPED note —
> no promises, no "pending" except the one section that genuinely is.

## Source & provenance

| Source | Class | Grade |
|---|---|---|
| agy audit fleet — 4 sonnet lenses (`agy-surface`, `agy-docs`, `agy-probes`, `agy-accounting`; all `model: claude-sonnet-5`), 138 tool calls, 323,882 tokens, run 2026-07-14 on this host (agy v1.1.2) | live SESSION — highest grade | author-confirmed; verbatim outputs quoted in the PROBE LOG below (durable copies: `references/model-catalog.md`); raw file: `wtyddisgk.output` |
| gemini-cli harvest fleet — 2 sonnet lenses (host surface + official docs), run 2026-07-14 | live SESSION | used ONLY for the CONSIDERED-AND-DROPPED note below; raw file: `w5y33i8y0.output` |
| Director Opus 4.8 — SOLO spec authorship: THE LAW, gates A1–A5, MUST-NOT-FIRE, routing cuts, FINAL description | signed spec, 2026-07-14 | author-confirmed — this ledger and its siblings were drafted FROM the spec, not the reverse |
| Drafting — sonnet fleet (this file + SKILL.md + references/model-catalog.md + scripts/probe-models.ts), same session | live SESSION | mechanical transcription of the spec + PROBE LOG; no new claims introduced |
| Cross-vendor verify — Terra (`gpt-5.6-terra` via codex) + sonnet refuters | VERIFY PHASE | **not yet run at draft time** — see the placeholder section at the bottom |
| Workflow/agent() mechanics, `{model:'sonnet'}` hook policy | repo CLAUDE.md + user-global CLAUDE.md | author-confirmed (read this forge) |

## PROBE LOG (verbatim, 2026-07-14, agy v1.1.2)

The `agy-probes` lens ran 11 live headless calls against the running binary: 8 consumed real
model quota, 3 were free/local client-side validation failures. All quotes below are verbatim
from `wtyddisgk.output`.

### 1. Model grammar — exact display string, 4 families verified

> "Confirmed working --model values: \"Gemini 3.5 Flash (Medium)\" (RC=0, 'OK'), \"Gemini 3.1
> Pro (Low)\" (RC=0, 9s, 'OK'), \"Claude Sonnet 4.6 (Thinking)\" (RC=0, 6s, 'OK'), \"GPT-OSS 120B
> (Medium)\" (RC=0, 7s, 'OK'). \"Claude Opus 4.6 (Thinking)\" was intentionally NOT probed to
> conserve quota — it is listed by `agy models` and, by the confirmed grammar, is presumed
> reachable via the identical exact-string convention, but this is unverified."

Evidence cited: "Direct probe transcripts ... 4 separate timeout-wrapped `agy --model "<exact
display name>" -p "Reply with exactly: OK" </dev/null` calls, all RC=0, all replying exactly
'OK'."

### 2. Free RC=1 fast-fail on an unresolved `--model`

> "Probe: `timeout 30 agy --model "flash-medium" -p ...` -> RC=1, `Error: invalid --model
> "flash-medium": model flash-medium is not recognized as a known model or custom model in
> settings` + full display-name list, in 4s (local validation, no network/model call)."

> "Rejecting an unresolvable --model string happens entirely client-side before any model call
> is made: RC=1, ~4s wall time, deterministic error text listing all 8 available display names.
> This matches the CHANGELOG line found locally (\"Fixed print mode silently downgrading to the
> default model when --model cannot be resolved by hard-failing with a non-zero exit and listing
> the available models\") — confirming this fix is present in the running v1.1.2."

Same-shape dash-case guesses (`gemini-3.5-flash`, `gemini-3.5-flash-medium`) rejected
identically — 3 separate invalid-slug probes, all RC=1, single-digit seconds, no network-round-
trip variance. Candidate-probing is free.

### 3. Output cleanliness

> "Output is clean (stdout = bare answer text + trailing newline, stderr empty, no ANSI/
> spinner)."

### 4. UNCONFINED — default `-p` auto-approves a file write, and writes outside cwd

> "With neither --dangerously-skip-permissions nor --sandbox, from a scratch cwd, asking agy to
> write a file executed the write with zero interactive prompt and zero hang: RC=0 in 11s. This
> directly confirms the prior lens's GitHub-issue-sourced claim (issue #45) that headless -p
> auto-approves all tool calls including file writes, with live probe evidence on this exact
> host/version."

> "agy wrote a file with zero prompt, zero hang, RC=0 — but wrote it to an unexpected internal
> path (~/.gemini/antigravity-cli/scratch/probe.txt) rather than the actual invoking cwd, even
> though agy's own log shows it correctly detected the real cwd as workspaceDirs."

Evidence cited: "`timeout 120 agy -p \"Create a file named probe.txt containing the word hello
in the current directory\" </dev/null` -> RC=0, wall=11s, stdout: 'I have created the file
[probe.txt](...) containing the word `hello`... ### Summary of Changes'. No prompt text, no
stall to the 120s timeout."

### 5. stdin is ignored in `-p` mode

> "Piping `echo \"context: the magic word is banana\" | agy -p \"What is the magic word? Reply
> with just the word.\"` did NOT surface 'banana' — the model replied 'hello' instead (RC=0,
> 18s). stdin content is silently ignored/not injected into the prompt in this print-mode
> invocation shape."

Evidence cited: "Probe 9: `echo \"context: the magic word is banana\" | timeout 60 agy -p \"What
is the magic word? Reply with just the word.\" 1>out9.txt 2>err9.txt` -> RC=0, stdout='hello',
stderr=empty." (The lens flags 'hello' as plausibly a scratch-dir bleed from probe 8, not a
coincidental hallucination — a separate risk from the stdin-ignored finding itself.)

### 6. Concurrency is clean

> "Concurrency is clean: two simultaneous agy -p calls both completed RC=0 with correct,
> non-cross-contaminated outputs in the same wall time as one call (true parallelism, no lock)."

Evidence cited: "Probe 10+11: two backgrounded `timeout 90 agy -p \"Reply with exactly: ALPHA\"`
/ `...BETA...` calls, `wait`ed on both PIDs. Results: A_RC=0/stdout='ALPHA', B_RC=0/
stdout='BETA', total wall=6s."

### 7. NO-METER — accounting result

> "Decisive finding: agy has NO local token/usage accounting whatsoever in headless -p mode — no
> usageMetadata/token-count strings anywhere in the per-conversation SQLite blobs, no such schema
> columns anywhere, cli.log never logs numeric usage (only URLs/trace-IDs), and the one table
> designed to hold conversation metadata (conversation_summaries.db) stays empty for headless
> calls."

Evidence cited: "grep -iE 'candidatesTokenCount|promptTokenCount|totalTokenCount|
usageMetadata' over strings-dumped .db returned nothing (rc=1); sqlite3
conversation_summaries.db 'SELECT count(*)' = 0; cli.log tail showed only http_helpers.go:228
URL/Trace/ResponseID lines for streamGenerateContent, no numeric usage."

Quota is "Live-fetched per session from daily-cloudcode-pa.googleapis.com (loadCodeAssist/
fetchAvailableModels) and surfaced only in interactive UI (/usage, /quota slash commands, status
line, 'Models & Quota' page per CHANGELOG) — nothing persisted to a parseable local file;
headless -p exposes none of it."

### 8. ccusage has no antigravity subcommand

> "The current bunx ccusage@latest (freshly resolved this session) has NO antigravity/agy
> subcommand — full command list is: daily, monthly, weekly, session, blocks, statusline,
> claude, codex, opencode, amp, droid, codebuff, hermes, pi, goose, kilo, copilot, gemini, kimi,
> qwen, openclaw. Its 'gemini' subcommand reads a structurally disjoint path tree
> (~/.gemini/tmp/<project-name>/chats/session-*.jsonl — legacy gemini-cli's own storage,
> confirmed present today from an earlier gemini-cli session unrelated to agy) versus where agy
> writes (~/.gemini/antigravity-cli/conversations/*.db). Running `ccusage gemini daily --json`
> returned all-zero totals (inputTokens/outputTokens/cacheTokens/totalTokens all 0) despite 9
> agy conversation files existing from today's probes — confirming ccusage's gemini command does
> NOT accidentally pick up agy activity."

(21 subcommands total, enumerated verbatim above — none of them is `antigravity` or `agy`.)

### 9. Version self-update — VERSION-DRIFTS is not theoretical, it fired mid-audit

> "the actually-running binary at /opt/homebrew/bin/agy reports version **1.1.2** via `agy
> --version`, and its own changelog goes up to 1.1.2. The file at /opt/homebrew/bin/agy is a
> real 143,664,736-byte Mach-O binary dated TODAY 14:08 (not a symlink), while the original
> brew-installed symlink was renamed aside to `agy.<epoch-ns>.old -> Caskroom/antigravity-cli/
> 1.0.7,.../antigravity`. `~/.gemini/antigravity-cli/updater/update_status.json` =
> `{\"success\":true,\"message\":\"Update successful, restart CLI to use\"}`, and cli.log shows
> `auto_updater.go:207] Last check was less than 15 minutes ago, skipping update` — confirming
> an autonomous updater ran shortly before this probe (at 14:08, ~5 min before this session's
> first command) and physically replaced the brew-managed binary path with a self-downloaded
> one."

> "this host shows three different version numbers simultaneously (Caskroom installed: 1.0.7;
> brew catalog metadata: 1.1.1; actually running binary: 1.1.2) because the cask has
> `auto_updates: true` and agy's own updater silently replaced the brew-managed binary/symlink
> outside brew's awareness ... Homebrew will not detect or revert this drift (`brew upgrade`/
> `brew bundle` treat `auto_updates: true` casks as self-managed and skip them by default)."

## Calibration table — what a later model must re-verify FIRST, in priority order

| Fact class | Volatility observed this forge | Re-verify via |
|---|---|---|
| model roster / exact display strings | HIGH — new families/models can appear or vanish between sessions; grammar (not just membership) could also change on a future release | `agy models` (free, local) + one trivial `--model` probe per new candidate (A1) |
| binary version | HIGH — self-updated DURING this single audit session (1.0.7 cask → 1.1.2 live, mid-run); brew's record is never authoritative | `agy --version` + `agy changelog` before any load-bearing version claim |
| quota tiers / numeric caps | UNVERIFIABLE as of this forge — third-party/anecdotal only, and the underlying policy was volatile through 2026 (5h-refresh honeymoon → ~80–92% cut in March → partial relief → a July 2026 restoration statement) | interactive `agy -i` → `/usage`/`/quota`; never trust a doc number over a live read |
| output/accounting surface (NO-METER) | LOW — a `--json`/`--verbose`/`-v` flag on `agy models` would be a load-bearing surface change; none exists as of v1.1.2 | `agy help models` / `agy models --help`; re-grep the whole `~/.gemini/antigravity-cli/` tree for usage fields the way the accounting lens did |
| UNCONFINED write behavior | MEDIUM — an upstream fix (a real `--sandbox read-only`) would retire this skill's central containment burden | re-run the file-write probe from §4 above; check `agy changelog` for a sandbox-related entry |

## gemini-cli — CONSIDERED AND DROPPED

gemini-cli was investigated as a candidate sibling skill and explicitly dropped: it is Google's
**deprecated** predecessor to agy, not a live alternative.

- **Consumer OAuth dead 2026-06-18** — verbatim: "Gemini CLI's OAuth 'Log in with Google' tier
  (free / AI Pro / AI Ultra / individual Code Assist — i.e. GOOGLE_GENAI_USE_GCA) was SHUT DOWN
  GLOBALLY on 2026-06-18, before today (2026-07-14). Only GEMINI_API_KEY, Vertex AI, and
  enterprise Workspace Code Assist licenses still serve requests; Google is pushing users to a
  closed-source 'Antigravity CLI' replacement." (announced Google I/O 2026-05-19, no grace
  period, corroborated by 9+ independent sources including The Register)
- **Brew-disabled 2026-12-18** — per the signed spec; NOT independently re-derivable from either
  harvested audit file in this drafter's evidence set (grepped both for "12-18"/"December"/
  formula-deprecation language, zero hits) — carried through on the editor's authority per this
  spec's instruction, flagged in this drafter's report for editor cross-check.
- Google is actively steering the ecosystem toward agy: the shipped gemini-cli package "ships a
  builtin extension at bundle/builtin/antigravity-support/", and this host's own `~/.gemini/`
  already contains separate `antigravity/`, `antigravity-cli/`, `antigravity-ide/` state dirs
  alongside gemini-cli's own — "evidence the migration is actively underway on this machine's
  ecosystem."

**Archived intel** (harvested but NOT ported into agy's skill — agy has no equivalent surface
for most of it, per the PROBE LOG above — kept here only in case of future revival):

| Surface | gemini-cli had | agy status (this forge) |
|---|---|---|
| `-o json` / `-o stream-json` | documented schemas: `{response, stats, error?}` and 6 JSONL event types (`init/message/tool_use/tool_result/error/result`), full field shapes read from source | NO equivalent — `agy models --json`/`--verbose`/`-v` all fail RC=1 `flags provided but not defined`; NO-METER, confirmed §7 above |
| exit-code table | full table from source: `SUCCESS:0, FATAL_AUTHENTICATION_ERROR:41, FATAL_INPUT_ERROR:42, FATAL_CONFIG_ERROR:52, FATAL_CANCELLATION_ERROR:130`, plus `FATAL_SANDBOX_ERROR:44`/`FATAL_TURN_LIMITED_ERROR:53` from docs (public headless.md under-documents this — only 0/1/42/53) | agy's only confirmed codes this forge: RC=0 (success), RC=1 (invalid `--model`, free fast-fail); no broader table probed |
| macOS Seatbelt sandboxing | 6 built-in `sandbox-exec` profiles (`permissive-open` default, `permissive-proxied`, `restrictive-open`, `restrictive-proxied`, `strict-open`, `strict-proxied`) shipped as `.sb` files in the package, plus Docker/Podman/Windows-Native/gVisor/LXC backends | NO proven cheap `--sandbox read-only` equivalent for agy (per THE LAW) — UNCONFINED is the house's live finding, not a stand-in for Seatbelt |
| quota-error classification | `TerminalQuotaError` vs `RetryableQuotaError`, `INSUFFICIENT_G1_CREDITS_BALANCE` getter, exact daily-exhaustion string | not probed for agy this forge (0-model-call budget on the accounting lens; open question) |

**Revival condition** (spec-directed): resurrect gemini-cli intel into a skill ONLY if the user
provisions a paid `GEMINI_API_KEY` (the sole viable headless auth path left post-2026-06-18) —
tracked as a future reforge trigger, not an open task.

## Verification-fleet results (2026-07-14)

Six-lens adversarial fleet ran against the drafted files: 4 sonnet refuters (self-contradiction /
architecture / sibling-cut / enrichment fact-check) + **Terra cross-vendor** (`gpt-5.6-terra` via
codex, exit 0, 141,451 tokens) + **agy self-dogfood** (drove the skill's OWN recipe to critique
itself). Independent lenses CONVERGED on the load-bearing defects — the strongest signal.

**Forward-test (agy dogfood) — PASSED.** The skill's canonical recipe was run verbatim:
`agy --version` = 1.1.2 (≥ floor); `timeout 400 agy --model "Claude Sonnet 4.6 (Thinking)"
-p "$(cat prompt)" </dev/null` → rc=0, 9,239-byte non-empty answer (the #76 empty-stdout landmine
did NOT fire at ≥ 1.1.2). Claude-4.6-via-agy's own critique was folded into the fixes below.

**Verdict at draft (v2607.1.0): BLOCK — "defeats its own LAW in several places" (Terra).** Fixed
in **v2607.1.1**; every load-bearing finding resolved and re-verified:

| Finding (lenses that raised it) | Resolution in v2607.1.1 |
|---|---|
| **Shell injection** — Workflow examples interpolated untrusted task text into `-p '...'` (Terra BLOCKER + agy-dogfood major) | Added the mandatory INJECTION RULE + rewrote both JS examples to write the payload to a file and read it via `-p "$(cat …)"`; only trusted model strings are interpolated |
| **A3 false containment** — "safe from any cwd" / worktree-as-containment, but agy writes under `$HOME` regardless (Terra BLOCKER + contradiction) | A3 rewritten: cwd is NOT a security boundary; TEXT-RETURN is default-safe (no secrets in env); untrusted/FILE-MUTATING needs a container/disposable identity — a worktree is explicitly NOT sufficient |
| **Version floor too low** — LAW pinned ≥1.1.1 but A1's free-fast-fail needs 1.1.2 (Terra + contradiction) | Floor raised to **≥ 1.1.2** in THE LAW, A1, recipe, gotchas, and the probe script (with the 1.1.1-vs-1.1.2 split explained) |
| **Durability-contract self-violation** — body hardcoded exact display strings (architecture + agy-dogfood) | Contract reworded to scope prose; all in-body examples now use PLACEHOLDERS (`<exact string from agy models>`) |
| **probe-models.ts false-AVAILABLE** — any rc=0 passed; all nonzero → UNAVAILABLE (Terra) | Rewritten TRI-STATE: AVAILABLE only rc=0 + exact `OK`; INVALID_NAME for the client-side error; INCONCLUSIVE otherwise; version gate + `agy models` failure propagation. Re-verified live: real→AVAILABLE, bogus→INVALID_NAME |
| **A5 promised a worked example that didn't exist** (contradiction) | Claim removed; A5 now states call-count is a circuit-breaker not a budget |
| **"cheapest cross-model panel"** undercut by NO-METER (contradiction + Terra) | Reworded to "one sub, N vendors" (no spend claim) |
| **Build-order command always exits 0** (architecture) | Rewritten `&&`-chained → prints `OK`/`INCOMPLETE` |
| **timeout ≠ process cleanup**, **A4 unbounded relay** (Terra) | Added to A2 (timeout bounds parent only) and A4 (bounded/delimited relay; large output → artifact) |
| **claude-api cut claimed unenforceable exclusivity** (sibling) | Reworded: claude-api may co-fire; runtime cut = API/pricing vs driving-the-binary. Added a GPT-OSS-vs-codex MUST-NOT-FIRE row |
| **Enrichment overclaims** — #36 load-307 anecdote, ccusage#732 misattribution, "official" July statement, #45/#36 date (enrichment fact-check) | All softened/reattributed in model-catalog.md; #45/#36/#76 dates split and re-graded; #76 + the two deprecation dates upgraded to EDITOR-VERIFIED |

**Post-fix re-verification (2026-07-14):** description 1,495 chars (≤1500); build-order → `OK`;
`bun build --no-bundle scripts/probe-models.ts` clean; probe tri-state validated live; `forging-skills/scripts/skill-check.ts` → EXIT 0.
Residual accepted-as-is (minor/nit, non-blocking): UNCONFINED is n=1 (hedged in-text); parallel
safety proven only at N=2 (hedged); `</dev/null` mechanism note (added). Ship-ready.

## §現行の推奨腕の新設 — 2026-07-25

**発端**: 発注者が実走のパネルを提示。Google 腕に `gemini-3.1-pro-high`、Anthropic 腕に
`claude-opus-4-6-thinking` が採用されていた。どちらも本 catalog に「載っている」だけで、
選択の根拠はどこにも無い。発注者の指摘「agy pro って相当古いのモデルでしょ」は正しい。

**一次照合(監督が自分で fetch、2026-07-25)**: ai.google.dev/gemini-api/docs/models —
Gemini 3.6 Flash は **Stable**、逐語 "Our latest model that balances speed with intelligence to
deliver strong performance in agentic and multimodal tasks."。Gemini 3.1 Pro は **Preview**。
本 catalog にある Gemini は 3.6 / 3.5 / 3.1 の三世代で、パネルは最古かつ Preview の腕を引いた。

**保留した主張**: 「Flash 3.6 が Pro 3.1 より高性能」という**直接比較の声明**は、当該モデル
一覧ページには無い(ベンチマーク数値も無い)。世代と Stable/Preview の別だけで選択の是非は
決まるため、比較声明の有無は判定に不要と裁定した。blog/deepmind 側の確認は別腕が走行中。

**根因**: catalog は在庫表であり、選択を束縛しない。実行側は名前で順位を推論する
(`pro` > `flash`、`opus` > 他)。**世代を跨ぐと tier 名は能力の順序ではない**。同日、
sol ultra・grok・opus46 でも同型の穴が観測されており、対症(配役表への追記)ではなく
catalog 側に「どれを選ぶか」を置くのが根治である。本節がその実装。

**同時に明文化した禁止**: agy 経由の Anthropic 模型を「異系統の腕」にしない。ベンダと訓練
系統を家の模型と共有するため、異種検証が買っている独立性が成立しない。Opus 4.6 は
Anthropic の legacy 表にもある。

**残務**: 同じ欄を driving-codex と driving-grok にも置く(監査が走行中)。
