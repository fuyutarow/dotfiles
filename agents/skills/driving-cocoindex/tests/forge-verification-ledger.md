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
