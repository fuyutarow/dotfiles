# driving-cocoindex — forge & verification ledger

> Forged 2026-07-13 (Fable 5) under the `forging-skills` pipeline. This file is the LEDGER
> half of the F3 artifact (provenance, calibration, adversarial-verification findings); the
> other half — the fire/no-fire trigger set — lives inline in SKILL.md's F3 tables. One
> token, two components, per forging-skills' own gate definition.

## Source & provenance

Two survey waves, both under a design frozen SOLO before any harvest result (skeleton +
template choice = `driving-codex`, decided by the editor before dispatch — see the forge
design notes; this ordering means gate/routing shape was NOT reverse-engineered from
convenient facts). Wave 1 was aborted overnight by API stalls — **0 results returned**, but
its live-trial artifacts (the starlette trial checkout, partial command transcripts) survived
on disk and were reused rather than re-run from scratch. Wave 2: 6/6 agents completed —
official-docs, live-trial, host-reality, mcp-wiring, framework-versions, siblings.

**Live-trial protocol** (starlette corpus, 100 files, 1205→1206 chunks, macOS, shared daemon
also serving `qoed`): (a) head-to-head — 6 natural-language queries run through both
`ccc search` and `rg`, each independently verdicted ccc-wins / rg-wins / tie, plus one
adversarial exhaustive-enumeration query; (b) staleness proof — append a marker function,
confirm a miss with zero reindex, confirm the miss persists after a 16s wait with no watcher
activity, run `ccc index`, confirm the hit; (c) `ccc reset` — confirm DB-only deletion vs
`--all`, and the daemon's own auto-rebuild-after-reset (flagged UNVERIFIED mechanism, §below).

**Primary ground truth**: direct read of the installed package's own Python source
(`cli.py`, `server.py`, `settings.py`, `daemon.py`, `client.py` under the uv-tool site-packages
tree) — ranked above the docs site (never raw-fetched this forge) and the GitHub README (only
ever fetched via a summarizer). Design (name, template, gate letters CC1–CC4, section skeleton,
scope line) was an editor-SOLO decision made before dispatching the survey, per the forge
design notes (`wf_3fa238fe-709`) — harvest confirmed rather than generated the gate shapes.

## Source-grade table

| Source | Class | Grade |
|---|---|---|
| Direct command output (`ccc doctor`/`daemon status`/`status`/`--help`, `ps`, `launchctl`) + raw `curl`/`gh api` (PyPI JSON, GitHub REST) | live SESSION, direct | author-confirmed |
| Docs-site content and issue claims relayed only via WebFetch's small-model summary (GitHub README, releases/issues pages, `cocoindex.io/cocoindex-code/` — never raw-fetched) | summarized fetch | CONSENSUS, flagged per claim — never upgraded to fact |
| WebFetch page-summary rendered 2026 release dates as "2025" (both `cocoindex-code` and `cocoindex` release tables) | trap caught mid-forge, cross-checked against raw PyPI/GitHub API JSON | recorded; discard the WebFetch year, keep the raw-API date |
| Daemon auto-rebuild observed immediately after `ccc reset` (no `ccc index` run) | observed once, live trial | UNVERIFIED mechanism — body's Gotchas row says so explicitly and prescribes the operator action only |
| Same-dimension embedding-model swap silently mixes stale/fresh vectors | two grades, split: the ABSENCE of any model-change guard is a **verified negative** (author-confirmed source grep across daemon/client/indexer/settings — no fingerprint/mismatch/invalidate path); the mixing CONSEQUENCE is source-reasoned, not observed | body states the unconditional RULE (`ccc reset && ccc index` on any model change) with full confidence — justified by the verified-negative, not by the reasoned consequence |
| Head-to-head verdicts, `ccc search` vs `rg`/`ccc grep` | author-measured | n=6 queries + 1 adversarial + 1 grep-pattern pair, ONE corpus (starlette, 100 files) — scope stated, not generalized to "ccc beats rg" as a universal claim |

## Calibration

Model failure is dual, same shape as the sibling `driving-codex` inversion: **(a) under-use**
— an agent grep-flails or fans out an Explore agent on a concept-shaped ask instead of reaching
for `ccc search`, the adoption problem motivating this skill; **(b) over-trust** — treating a
plausible top-k as exhaustive or current when the index is stale (no watcher, no staleness
field in `ccc status`) or when the query shape was wrong for semantic search (the adversarial
`get_route_path` case: 5/8 top hits were false positives with zero literal match). Corrective
bias: CC3 ROUTE and CC2 FRESH are placed first-class and early in the body (not buried under
setup mechanics), mirroring driving-codex's placement of CATALOG-BY-PROBE ahead of flags/output
parsing — the routing/freshness decisions are the load-bearing ones, not the invocation syntax.

## VERIFICATION FINDINGS — 2026-07-13, resolutions signed by the editor

Fleet: 4 sonnet lenses (coherence+architecture, sibling-cuts+trigger desk-check,
spec-fidelity, live fact re-check) + 1 codex hostile audit (gpt-5.5 xhigh, read-only, run
solo by the editor). 22 sonnet findings + 10 codex findings.

**Headline**: live fact re-check 10/10 PASS on the assigned load-bearing claims — including a
fresh stdio MCP handshake reproducing the catalog's `search` schema byte-consistent, and a
live confirmation of the uptime-undercount gotcha. Two incidental numeric errors found and
fixed (release count 29→43/44 — an unpaginated first count; framework cadence span 11→24 days).

**Fixed (editor-signed)**: the codex-found LAW-vs-MCP-section contradiction ("every verb works
in any cwd" → rewritten: the CLI's advantage is per-call cwd CONTROL, not gate escape);
durability leftovers purged from bodies (~seconds, 30+, few-hundred-ms → catalog); the
dangling counts-pointer now resolves (35/35 log evidence landed in catalog's known-issues
row); CC3's gate pointer re-aimed at the actual QUERY-SHAPE ladder; SKILL.md's MCP section
deduplicated to a pointer at operations.md §7 (one home); Workflow example hardened against
shell injection (quoted path + sanitization note); `ccc grep`'s scans-everything-outside-a-
project caveat promoted into the recipe row; F3 restructured — the MCP-tools-missing case
moved out of MUST-NOT-FIRE into an explicit CO-FIRE-ORDERED-SECOND table; the upstream-
contribution route now co-fires implementing-and-debugging FIRST per writing-python's own
cut; FIRES examples made lexically independent of the description's bait and the bare
「embedding モデル変えたい」/「インデックス作成」 tokens qualified with ccc/コード context
(anti-race vs writing-python's wandb/ML territory); serena row labeled "(MCP toolset, not a
Skill)"; install-commands-vs-scope tension resolved as a DECLARED SEAM in operations.md §1
(command shown for locality, verb ownership → running-python-tools); init mutation/rollback
checklist, CC1/CC2 success-evidence shapes, secrets rule (envs = literal injection, never
commit keys), and the Linux/WSL log-path fallback (UNVERIFIED, find-based) added to
operations.md; ledger F3-token gloss + the same-dim/auto-rebuild grade split (this section's
own header block).

**Adjudicated, NOT changed**: bare `ccc`/`cocoindex` stay as description tokens (real asks
name the tool; the MUST-NOT-FIRE rows that contain them are dominated by their own routing
tokens — install/MCP/what-is); the reset-auto-rebuild row STAYS in Gotchas (its Fix cell is
operator-action-only, which is exactly the demotion codex asked for); the one-sided co-fire
with operating-the-harness is declared hub-and-spoke convention (same asymmetry as
driving-codex, recorded here rather than editing that skill's over-budget description —
its BODY gains a generic MCP dead-server gotcha instead); compound concept+enumeration asks
resolve in the body's ccc→serena pipeline note, accepted as a description-budget trade.

**Reciprocal edits landed at ship**: running-python-tools (driving-* carve-out clause),
raising-resolution (ccc/cocoindex owner row), operating-the-harness (body gotcha:
MCP config present ≠ server live).

---

## Reforge v2607.2.0 (2026-07-13) — markdown-corpus + LANGUAGE-WALL trial

**Trigger**: user asked whether ccc is effective on markdown, and whether that answer was
distilled into the skill. It was not — markdown appeared only as the doc-over-code bias's
noise source, never as a target corpus; the assistant's own first-pass answer ("your
markdown vault is an ideal ccc target") was then partially REFUTED by measurement, which is
exactly what earned the reforge.

**Source & grade**: live trial, this host, all probes direct command output (grade HIGH) —
md-only mirror of `agents/skills/` (526 files / 5,432 chunks) + 1 planted unique-topic JA
note = 527 files / 5,434 chunks; 2 EN→EN concept queries with known ground truth, 4 wall
probes (one an EN-language query testing EN→JA), then raw-model cosine matrices via the ccc
uvx env (arctic-embed-xs vs granite-107m-multilingual) to isolate model-level cause from
ccc plumbing. Full numbers → `references/catalog.md` §Markdown-corpus
trial. One probe INVALIDATED mid-trial and redone: the first JA→JA ground truth
(courting-on-apps) turned out to be absent from the corpus (private skill, not in dotfiles)
— replaced with an in-corpus truth + the plant. Lesson re-learned: verify ground-truth
presence BEFORE scoring recall (CC1's spirit applied to eval design).

**Findings folded in**: (1) EN→EN prose concept recall usable but truth ranks #3–#4 with
flat score bands → "top-k is a candidate set" rule (SKILL.md §Markdown, operations §4b.1);
(2) LANGUAGE-WALL — new LAW clause (d), new stable token, new Gotchas row, 2 new FIRES rows,
1 new no-fire row: the default model's topical signal is EN-only, established at the MODEL
level (wrong-doc-beats-right-doc 0.593>0.545; no EN↔JA bridging; symmetric-encode control);
post-fleet refinement: code-switching onto a mixed note's EN tokens is a MEASURED craft fix
(truth #1 @ 0.763), pure-JA paraphrases unreliable; (3) fix candidate
granite-107m-multilingual restores JA + cross-lingual at the raw-model pairwise level
[end-to-end ranking UNVERIFIED], and is SAME-DIM (384) — ties directly into §6's
silent-mixing hazard, swap is global (no per-project embedding override, source-verified in
v2607.1.0) so it re-embeds every registered project; its CODE-search effect UNVERIFIED,
flagged in catalog.

**Adjudicated, NOT changed**: description keeps code-first framing (code search remains the
dominant ask); the doc-over-code Gotchas row unchanged (still correct for mixed corpora);
no per-project model workaround invented (none exists — checked ProjectSettings schema in
v2607.1.0 source read).

**Verification**: skill-check floor (exit 0) + read-only fleet, 4 sonnet lenses
(claims-vs-evidence refuter, JA-degeneracy methodologist, trigger desk-check, one-home
consistency) → 21 findings: 2 blocker / 7 major / 9 minor / 3 nit. All adjudicated; the two
blockers were resolved by NEW MEASUREMENT, not wording:

- **Blocker "rephrasing does not help" was FALSE as shipped** — 3 rephrase probes run
  post-fleet: a code-switched query (the note's own EN technical tokens) put the truth at
  #1 @ 0.763 sweeping the top-8; pure-JA paraphrases stayed unreliable (1 of 2 recovered to
  #3, 1 missed). The shipped sentence was replaced by the measured CODE-SWITCH craft rule —
  the refuter improved the content, not just the wording. LANGUAGE-WALL refined from
  "EN-only model" to "topical signal flows through EN tokens only."
- **Blocker structural-hunt F3 row unsupported by description** (pre-existing since
  v2607.1.0): trigger token added (multi-line/構造検索 → ccc grep) + the description's
  literal-string Cuts clause qualified so it no longer steers the structural case away.
- **JA exact-token miss re-attributed**: an EN exact-token control (`CoRNStack`, unique to
  one file) missed identically → general CC3 limitation in both languages, REMOVED from
  LANGUAGE-WALL evidence (was double-counting a non-language-specific phenomenon).
- **granite downgraded to raw-model-verified**: an end-to-end ccc re-run with granite was
  adjudicated NOT RUN — the model is global (dotfiles-symlinked settings) and a swap
  re-embeds every registered project; consent-gated, flagged [UNVERIFIED at ranking level].
- **P2 recast as ranking success + anomaly** (cross-query score comparison is not
  commensurable evidence; the raw-model matrix is the cleaner plank); verdict bands
  restated to cite only tabled values; the symmetric-encode counter-probe (rules out
  `prompt_name` asymmetry) published in catalog; probe-count caveat corrected; Q2 rg
  control added; adjacent-diff band widened to include exact ties; §4b.4's wrong (§3)
  pointer repointed to LAW (b)/§2; SKILL.md §Markdown trimmed to directive+pointer
  (one-home); §7's unverifiable "client timeout" comparison dropped; corpus-size/plant
  provenance noted in catalog.
- **New sibling cut** (desk-check): systematizing-knowledge / structuring-documents —
  SEARCH-vs-SYNTHESIS on the shared 「メモ/ノート」 vocabulary; 全文検索 added to the
  markdown no-fire row.

**Adjudicated, NOT changed (fleet round)**: description keeps the unconditional 純和文
posture despite the single-corpus caveat — calibration inversion: the executor's default
failure is overpromising JA search, so the fail-safe direction is stated flat (LAW (d)
carries the caveat); the MEMORY.md-single-known-file near-miss is left to CC1's Grep
fallback (rated minor); bare `ccc`/`cocoindex` tokens stand per the v2607.1.0 adjudication
above.
