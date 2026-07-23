# driving-codex — forge & verification ledger

> Forged 2026-07-12 (Fable 5) under the `forging-skills` pipeline. This file is the F3 artifact:
> provenance, calibration, and the ACTUAL verification results below — no promises, no "pending".

## Source & provenance (distilling §1/§3)

| Source | Class | Grade |
|---|---|---|
| Live probes run during this forge: availability × 5 models, bogus-model error shape, `--json` event stream, `-o` behavior, git-check + stdin failures, config defaults, cache mtime refresh | live SESSION — highest grade | author-confirmed; verbatim outputs appended in §Results below (durable copies: the tables in `references/model-catalog.md`) |
| Live Workflow run during this forge: one `{model:'sonnet'}` agent drove `codex exec` via Bash and relayed the C3 triple | live SESSION | author-confirmed — result in §Results |
| User-pasted transcripts (their successful `gpt-5.6-sol` xhigh run; flagless run header showing `danger-full-access`; the prior session's "cache lacked the 5.6 family" report) | user transcript / user-relayed | labeled per-claim in the catalog; never upgraded to author-confirmed |
| Second session's production trace (user-pasted, 2026-07-12): bare-`sol` probe read as a negative, `$?` read through a pipe — drove the v2607.1.1 reforge | user-pasted transcript of another session | its two failure claims re-grounded by this forge's own `-m sol` probe (author-confirmed) and by shell pipe semantics; verbatim excerpt in the reforge section |
| CLI ≥0.144.0 floor, staged rollout, plan eligibility | third-party (ChatGPT answer relayed by the user, 2026-07-12) | labeled third-party; DO-NOT-FABRICATE beyond it |
| Workflow/agent() mechanics, `{model:'sonnet'}` hook policy | repo CLAUDE.md + user-global CLAUDE.md | author-confirmed (read this forge) |

## Calibration inversion (distilling §4)

| | Source's audience | This skill's agent consumer |
|---|---|---|
| dominant error | (source is our own observed failure) an agent asserted "sol/terra/luna don't exist" from its model cache + training memory | SAME direction: over-claiming live rollout state from stale internal knowledge; plus under-specifying flags (sandbox/model/effort inherited silently) |
| corrective bias | — | CATALOG-BY-PROBE + the C2 explicit-flag triplet, both first-class in SKILL.md |
| prominence | — | LAW leads with probe-over-memory; MUST-NOT-FIRE kept tight (six near-miss rows) because "codex" is a distinctive token with low over-fire risk |

## F2 placement notes

- PURPOSE cut vs `operating-the-harness` ("which binary is being configured") written in BOTH
  this description and the SKILL.md routing table. **Reciprocal pointer into
  operating-the-harness's description: DEFERRED** — its description is near the listing budget
  and editing a flagship trigger surface deserves its own desk-check; owner: next
  operating-the-harness reforge (fuyu). Race risk judged low and desk-checked below.
- Family finding (out of scope, recorded): `prompting-llms` cuts "OpenAI prompting routes to
  openai-docs" but no `openai-docs` skill exists in `agents/skills/` or `~/.claude/skills/`
  (checked 2026-07-12) — a dangling sibling pointer to fix on its reforge.
- Durability-contract exemptions declared in SKILL.md header: description trigger tokens and F3
  quoted example asks may carry dated model names as trigger/test bait — re-verify on reforge.

## Results — floor (run 2026-07-12)

- `skill-check.ts driving-codex` (post-fix): **PASS** — no FAIL, no WARN (pre-fix run WARNed
  `description 1502 chars > 1500`; fixed by dropping a weak katakana doublet).
- Strict YAML parse (`uv run --with pyyaml`): **PASS** — `name= driving-codex`, description is a
  single folded string, 1494 chars.
- Build-order one-liner from the skill dir: **PASS** (`build-order OK`).
- `scripts/probe-models.ts` seen GREEN and RED in one run (verbatim):

```
RESULT: AVAILABLE gpt-5.6-luna (9,093 tokens)
RESULT: UNAVAILABLE gpt-9.9-bogus (exit 1)
  ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-9.9-bogus' model is not supported when using Codex with a ChatGPT account."}}
probe exit=1
```

- Main-loop availability probes (verbatim RESULT lines, `--sandbox read-only`, effort low):

```
RESULT: AVAILABLE gpt-5.6-sol   (9,486 tokens)
RESULT: AVAILABLE gpt-5.6-terra (9,278 tokens)
RESULT: AVAILABLE gpt-5.6-luna  (9,120 tokens)
RESULT: AVAILABLE gpt-5.5       (11,799 tokens)
RESULT: AVAILABLE gpt-5.4-mini  (10,766 tokens)
```

(5 probed AVAILABLE; `gpt-5.4` cache-listed but not probed — the catalog table says so.)

- `--json` usage event (verbatim): `{"type":"turn.completed","usage":{"input_tokens":19257,"cached_input_tokens":9984,"output_tokens":5,"reasoning_output_tokens":0}}`
- `-o` last-message file content: `OK`.

## Results — Workflow wrapper proof (run 2026-07-12, run id wf_4a417a32-2e4)

One-phase Workflow; single `agent(..., {model:'sonnet'})` ran the SKILL.md recipe against a
catalog model and returned, via schema:

```json
{"exit_code":0,"tokens_used":"9,878","last_message":"WRAPPER-OK"}
```

The sonnet-wrapper pattern (SKILL.md §Embedding) is author-confirmed end-to-end: Workflow →
sonnet worker → Bash `codex exec` → C3 triple relayed. Wall clock ~25 s for a trivial ping.

## Results — trigger desk-check (sonnet, read-only, descriptions-only view)

13/13 rows matched expectation: 6 fire, 6 no-fire (each resolving to the intended sibling or
model-native), 1 co-fire (`operating-the-harness` first). No description race found on the fire
set; `claude-api`'s provider-named SKIP clause and this skill's front-loaded PURPOSE cuts kept
the no-fire set clean. One soft spot reported: the bare trigger token `codex` could tempt a
naive matcher on the definitional "what is Codex?". **Resolution: accepted as-is** — the
TRIGGERING LAW (trivial asks are answered directly, skills fire on asks the model would fumble)
covers it; re-check on reforge.

## Results — refuter lens (sonnet, read-only; 14 findings, editor-signed resolutions)

| # | Finding (compressed) | Resolution |
|---|---|---|
| A1 | cache-refresh narrative claimed as observed; before-state not in this forge's evidence | FIXED — catalog bullet split: mtime refresh author-confirmed; pre-rollout absence re-graded [user-relayed] |
| A2 | `danger-full-access` "observed" but no flagless run in forge evidence | FIXED — re-graded [user transcript, 2026-07-12] |
| A3 | effort enum `high\|xhigh` unsupported by probes | FIXED — per-value grading (low=probe, medium=config, xhigh=user transcript, high=unverified) |
| A4/A6 | bogus-model error string / RED-probe claim had no on-disk artifact | FIXED — verbatim outputs appended in §Results (the runs happened in the main loop; the refuter's artifact set predated them) |
| A5 | "6 models AVAILABLE" — actually 5 probed + 1 cache-only | FIXED — counts corrected here and cross-checked with the catalog |
| A7 | stdin fix "not demonstrated" | REJECTED — refuter compared the EDITED script against the pre-edit run's output: run 1 (no `</dev/null`) showed the message, run 2 (with it) did not; SKILL.md row now states the both-ways observation |
| B1 | model ID hardcoded in body F3 table violates the durability contract | FIXED — contract amended with two declared exemptions (trigger tokens, F3 quoted asks as dated bait) rather than de-realizing the test queries |
| B2 | ledger promised "appended below" with nothing appended | FIXED — this rewrite |
| C1 | Gotchas table restated the catalog's exact error strings (two homes) | FIXED — body rows trimmed to symptom-class + fix; catalog declared owner of exact strings in the table header |
| D1 | probe script masks exit 127/124 as a model verdict | FIXED — `command -v codex` FATAL pre-check + rc-124/127 annotations |
| E1 | lineage/immunization header is "bloat" | REJECTED — mandated verbatim by forging-skills execution-models §B (components f+g); the refuter was not given that bar |
| E2 | "Proven in production" weakly grounded | FIXED — re-proved live this forge (Workflow run above); SKILL.md line now cites the ledger record |
| E3 | C3 rule stated three times | FIXED — Gates table is the sole owner; wrapper step 3 and the execution-model paragraph reduced to pointers |

Post-fix floor re-run: PASS (see the `Post-fix verification` line below, appended after the
final re-run).

## Post-fix verification (v2607.1.0 state)

- `skill-check.ts`: PASS, 0 FAIL 0 WARN.
- Strict YAML parse: PASS.
- `bun build --no-bundle scripts/probe-models.ts`: PASS.
- Deployed via `mise run link:skills`; symlink `~/.claude/skills/driving-codex` verified; the
  description subsequently appeared in a live session's skill listing (end-to-end smoke test).

## Reforge v2607.1.1 — same-day production trace from a SECOND session (2026-07-12)

Staleness trigger fired: "an observed in-session failure the skill should have prevented" — the
highest-grade source. A second session (different project) loaded this skill to correct its own
"sol/terra/luna don't exist" claim and, in doing so, exposed failures v2607.1.0 did not block:

| # | Exposed failure (from the trace) | Verdict | Fix |
|---|---|---|---|
| R1 | Its first probe hit the BARE short name `sol` and read a confident negative | skill gap — C1 taught probe-over-memory but not the probe's own epistemics | C1 rewritten with the ASYMMETRY (AVAILABLE = proof; 400 = ambiguous) + mandatory ID resolution; recipe gains Step 0; LAW gains the asymmetry sentence; the Gotchas 400-row rewritten to state the ambiguity; probe script now prints an AMBIGUOUS note on the 400 path |
| R2 | It captured the exit code via `$?` after a pipe (`… \| tail`), reading the wrong command's status | skill gap — the forger AVOIDED this trap deliberately at forge time (`out=$(…); rc=$?`) yet never encoded it | new Gotchas row: pipe-`$?` trap + the two correct capture forms |
| R3 | No step forced "resolve the exact ID BEFORE probing" | skill gap | recipe Step 0 + C1 artifact now includes "where the ID came from" |
| R4 | The second session independently extended CATALOG-BY-PROBE to model SELECTION (measure a head-to-head before promoting a standard auditor) | adopted — correct extension the skill lacked | new **Selection** bullet in the wrapper section (probe proves availability, never rank) |

Trace excerpt (verbatim, user-pasted): 「私の最初のプローブは『裸のsol』を叩き、パイプ越しの
$?で終了コードまで取り違えていた」 — the two failures R1/R2 encode.

Grounding probe for R1 (verbatim, 2026-07-12): `-m sol` → exit 1,
`warning: Model metadata for 'sol' not found…` →
`ERROR {"type":"error","status":400,…"The 'sol' model is not supported when using Codex with a ChatGPT account."}`
— byte-identical shape to the nonexistent `gpt-9.9-bogus`, while `gpt-5.6-sol` runs fine. The
400 cannot distinguish typo from rollout; the asymmetry is author-confirmed.

Description UNCHANGED in this reforge (body-only edits) — the 13-row desk-check was not re-run;
its verdicts stand.

### v2607.1.1 verification fleet (two sonnet lenses, read-only Workflow run wf_672b7d85-b21) — findings & editor-signed resolutions

| # | Finding (compressed) | Resolution |
|---|---|---|
| T1 | probe script named ONLY in the reference index — C1/Step 0 said "run the probe" abstractly, inviting hand-rolled probes (the trace's exact failure); the v2607.1.1 C1 rewrite had even dropped the script invocation from the artifact cell | FIXED — script invocation restored to C1's artifact cell; Step 0 now names the script and forbids hand-rolling |
| T2 | pipe-`$?` fix was reactive (Gotchas only); the recipe block never showed safe capture | FIXED — capture idiom added as the recipe's first companion bullet; no gate added (a `$?` misuse is not per-call greppable — proportionate as recipe + gotcha), editor-signed |
| T3 | Selection rule buried as a wrapper-section bullet; not reachable from LAW/Gates for a non-Workflow promotion decision | FIXED — RANK-BY-MEASUREMENT added to LAW + Language tokens; new C4 SELECT gate; bullet kept as the procedure (tagged C4) |
| F1 | reforge section ended on a dangling "see final line below" — the SAME defect class as B2 | FIXED — this section replaces it with actual results |
| F2 | the trace (the reforge's own highest-grade source) absent from the Source table, no verbatim excerpt | FIXED — source row + excerpt added above |
| F3 | ledger row A3 had an unescaped pipe in `high\|xhigh`, breaking the 3-column table | FIXED — escaped |
| F4 | asymmetry rule argued in four places (C1, Step 0, catalog 400-row, script note) | FIXED — C1 is the sole arguing home; Step 0 tightened to a pointer+procedure; catalog row now states fact + pointer; script note marked as a deliberate synced seam (comment) |
| F5 | LAW ("400 proves THAT STRING is not served") vs C1 ("NO verdict") readable as contradictory | FIXED — C1 now says "a verdict about the STRING, not the model" |
| F6 | ledger R1 fix-cell omitted the rewritten Gotchas 400-row, making the row count unverifiable | FIXED — R1 cell corrected |

Post-fix floor (v2607.1.1 final): `skill-check.ts` PASS 0 FAIL 0 WARN; strict YAML parse PASS
(description unchanged, 1494 chars); `bun build --no-bundle probe-models.ts` PASS; description confirmed live
in a session's skill listing (smoke test, 2026-07-12).

## Revision v2607.1.2 — user-directed: sonnet baseline arm + cost-by-measurement (2026-07-12)

User ask: make 使い分け evaluation fair across sol/terra/luna/sonnet-5, and add cost awareness
(their hypothesis: codex effectively cheaper because OpenAI absorbs subscription losses).

| Change | Where |
|---|---|
| C4 SELECT now REQUIRES the house baseline arm (sonnet worker) in every head-to-head; artifact extended to wall time + ccusage quota drain both sides | SKILL.md Gates + Selection bullet |
| RANK-BY-MEASUREMENT extended to COST in LAW ("cheaper" is a hypothesis until both ledgers are read) | SKILL.md LAW |
| Accounting section: both-ledger costing (ccusage `daily` vs `codex-daily`), `claude -p` `total_cost_usd`, quota-not-dollars framing | SKILL.md Output contracts |
| New catalog section: cost model, the user hypothesis graded UNVERIFIED with a C4 decision procedure, and a dated n=1 smoke benchmark | references/model-catalog.md |
| Description: "tracking codex spend with ccusage" → "codex spend / モデル使い分け・コスト比較 (ccusage)"; new F3 fire row 「sol と sonnet5、監査にはどっち？コスパも見て」 | SKILL.md frontmatter + F3 |

Grounding runs (2026-07-12, artifacts: session scratchpad `bench/`):

- `claude -p --model sonnet --output-format json` headless probe: exit 0, trivial ping usage
  in 12,993 / cache-read 23,314 / out 4, `total_cost_usd` 0.0823 — the symmetric sonnet arm works
  and self-reports API-equivalent cost.
- 4-arm planted-bug smoke bench (codex arms read-only/medium; Claude arm defaults): ALL FOUR
  correct (exact expression + mechanism); wall 10/10/9/8 s; codex blended tokens 9,643 / 8,914 /
  9,321; sonnet-5 $0.0908. Verdict: ceiling effect — recorded as a C4 WORKED EXAMPLE, explicitly
  NOT a ranking; caveats (effort mismatch, non-comparable token units, n=1) written next to the
  table in the catalog.
- The user's subsidy hypothesis is graded user-hypothesis/UNVERIFIED in the catalog's provenance
  table — encoding it as fact would be the same failure class this skill was forged to kill
  (asserting live vendor economics from belief).

Description edit desk-check (solo re-run over the now-14-row F3 set, stage-1 view): the token
swap removes no load-bearing keyword (q6 still fires on "codex spend"/"ccusage"); the added
使い分け・コスト比較 tokens capture row 14; no new race — `claude-api` still owns Anthropic
pricing FACTS (its SKIP yields when codex/GPT is the working provider), `operating-the-harness`
unaffected. Verdict: GREEN.

Post-revision floor (v2607.1.2 final, run 2026-07-12): `skill-check.ts` PASS 0 FAIL 0 WARN;
strict YAML parse PASS (description 1498 chars ≤ 1500); `bun build --no-bundle probe-models.ts` PASS; the
revised description confirmed live in a session's skill listing (smoke test).

## 2026-07-22 深夜: LONG-RUN 法の追加実測(2件成功)

- 主ループ背景の codex effort=high(gpt-5.6-sol)を2回実行、いずれも完走:
  (1) 命題の敵対的検査+実装の連鎖律監査(-o 経由 318 行、交絡表と判別実験つき)、
  (2) 水平思考の相談(680 行)。累計成功 3/3——wrapper 埋め込みの 2/7 と対照的。
- 追加の教訓: timeout パラメタ(Bash tool)は run_in_background でも効くため、
  sol 級には 600000ms を渡さず shell の timeout 1800 だけで包む方が安全。
