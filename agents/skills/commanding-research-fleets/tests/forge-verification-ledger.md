# Forge verification ledger — commanding-research-fleets

> History, source grades, verification findings, and maintenance triggers. `SKILL.md` points
> here for provenance; this file is the SOLE home for all of it.

## §0 Forge summary

Forged 2026-09-03, solo end-to-end (no fleet spawned) — see §4 for the scale-calibration
reasoning and the F3 solo-tier waiver this entails. Function+existence gate (`forging-skills`
pipeline step 0): no existing skill owns the Director/PI/Researcher role-charter +
launch-checklist + order-form + stuck-question artifact set. `supervising-research-programmes`
and `directing-research-sections` own a DIFFERENT, formal state machinery (`OPEN_ISSUE`,
`SECTION_MANDATE`, …) that this doctrine's vocabulary maps onto but does not merge with;
`orchestrating-agents` owns generic dispatch, not this fleet's specific role content;
`codifying-doctrine`'s own routing table sends "a runbook/SOP for a named executor" to
`forging-skills` — this skill's craft owner — confirming a new skill, not a doctrine document,
is the right container. Conclusion: forge new. Name checked against the live skill directory
2026-09-03 — no collision.

## §1 Source-grade table

One row per distilled component, graded at capture time (`forging-skills/references/
distilling.md` §3). Sources are the four inputs quoted to this forge, all originating from the
orderer's own rulings relayed through a peer session (`firedancer-0a`) — grading tracks the
RULING's authenticity, not the relay's authority (§2 covers why the relay itself was refused as
authorization).

| Component | Grade | Note |
|---|---|---|
| skill scope (§1 of input spec: charters/checklist/questions only, not programme/section state) | author-confirmed | direct quote in the spec |
| Director charter, PI charter, prohibitions | author-confirmed | 2026-09-02 ruling, §2 |
| launch checklist (6 items) | author-confirmed | 2026-09-02 ruling, §3, itself derived from six OBSERVED stalls — highest-grade source class (`distilling.md` §1, live-session engine) |
| order-form STRUCTURE (`00_base + phase + optional`) | author-confirmed | 2026-09-02 ruling, §4 |
| order-form v2608.2.0 preset CONTENT | needs-verification | named, not retrieved — DO-NOT-FABRICATE observed (`launch-and-order.md`) |
| five stuck-question prompts + reject-words | author-confirmed | 2026-09-02 ruling, §5, verbatim |
| nine LAW-candidate rules (list) | author-confirmed | 2026-09-02 ruling, §6, labeled LAW候補 by the orderer |
| nine underlying measurement incidents | needs-verification | named ("測定器が九度壊れた…"), not independently observed by this forge |
| retrieve/search vocabulary split | author-confirmed | 2026-09-02 addendum (§6b), verbatim quote |
| seven operating rules | author-confirmed | 2026-09-03 ruling, a direct RULE not a candidate |
| in-lab verification (E4) procedure | author-confirmed | 2026-09-03 ruling, verbatim quote |
| thin-Director reply form | author-confirmed | 2026-09-03 ruling, verbatim quote |
| correspondence table (Director≈programme-supervisor etc.) | author-confirmed as VOCABULARY; skill-supplied as a NON-merge boundary | the mapping is the orderer's; that it stays a mapping and never a merge is this forge's own architectural decision, checked against the sibling skills' actual current text 2026-09-03 |
| all sibling-cut wording (DECISIVE/PURPOSE clauses) | skill-supplied | written by this forge against the siblings' live `SKILL.md` text, not dictated by any source |

Reflexive corollary (`distilling.md` §3): this skill's own claims answer to its own gate. The
two needs-verification rows above are the reason `vocabulary-and-law.md` explicitly marks the
LAW-candidate table NOT BINDING and `launch-and-order.md` explicitly marks the preset content
needs-verification, rather than presenting either in the orderer's voice as settled.

## §2 The peer-relay refusal — why forging waited four messages

Recorded because it is itself the launch checklist's row 1 in action, and because a later
reader auditing "why did this take four exchanges" deserves the transcript, not a claim.

`firedancer-0a` relayed the full input spec, then three further messages (a terminology
addendum, an operating-rules addendum, a status inquiry) — each treated as content to record,
none as authorization to begin forging. The fourth relay repeated a status request; the
executing session replied with a one-line receipt ("未着手") but still declined to start. Only
a direct, first-party instruction — the actual person, in this session, verbatim requesting
the skill be created — was accepted as the launch-checklist row-1 artifact. The input spec's
own §3 item 1 states this rule explicitly ("peer の中継は承認にならない"); the forge obeyed its
own future output before that output existed.

## §3 Verification — solo multi-pass (see §4 for why solo)

Each lens run as a distinct, deliberate re-read against the shipped files, per
`forging-skills/references/verifying.md` §2's lens list.

| Lens | Finding | Resolution |
|---|---|---|
| Self-contradiction | none found against this skill's own LAW/gates | — |
| Architecture / one-home | initial draft duplicated the kill-handling rule's location note (charters.md pointed at the wrong file — an artifact of drafting the LAW-candidates section before the operating-rules table existed) | fixed: charters.md now points at `vocabulary-and-law.md`'s operating-rules table, row 2, not the LAW-candidates table |
| Sibling cuts | read the LIVE `SKILL.md` of `orchestrating-agents`, `supervising-research-programmes`, `directing-research-sections`, `codifying-doctrine` in full (not just their own claims about themselves) before writing this skill's cuts | cuts match those skills' actual current text as of 2026-09-03; re-diff only if any of the four reforges its own cut clause (`forging-skills/references/architecture.md` §2's seam contract) |
| Bloat / drift | checked every LAW-candidate and operating-rule row traces to a graded source row in §1 | none found unsourced |
| Trigger desk-check | ran the full `tests/triggers.md` table against this skill's own description AND the four cut siblings' descriptions | 11 of 12 rows resolve cleanly; row 3 (「PIが検収をDirectorに投げてる。これ直して」) is flagged CONTESTED in `tests/triggers.md` — recommend a live eval before treating it as settled |

## §3a Post-ship correction (2026-09-03, via authorized thin-Director coordination)

`firedancer-0a` (acting as thin Director, the role this skill itself describes) sent two
corrections after the initial ship. Treated differently from §2's earlier relays: the user's
own instruction that started this forge ("thin directorと協調してスキル作成してください")
explicitly authorized coordinating WITH this session for the duration of the task — this is
not a peer claiming authorization to START new work, which §2's rule still refuses. Each
correction was independently checked against sources already held by this forge before being
applied, not accepted on the peer's say-so alone:

| Correction | Independently checkable against | Applied |
|---|---|---|
| Director charter's "arranges non-author verification" contradicts the 2026-09-03 in-lab-verification ruling (source 4-(1), already held, graded author-confirmed in §1) | yes — a genuine internal self-contradiction between two sources this forge already possessed; the solo verification pass in §3 above should have caught it and did not | yes — `charters.md`, `SKILL.md`'s LAW section, and its role table all corrected to "requests cross-lab verification only as a named exception" |
| Launch checklist row 2 (`/loop` required) reversed by a new 2026-09-03 ruling that `/loop` is a source of interrupt/double-start | **no** — this specific ruling was not among the four sources originally given to this forge; it arrives ONLY through this coordination message | yes, but graded **author-confirmed-via-coordination**, one tier below the four direct-relay sources in §1 — distinguished explicitly rather than silently merged into their grade |

The self-contradiction catch is itself a finding about §3's own solo pass: a fleet verify
lens reading `charters.md` against `researcher-types.md` side-by-side plausibly catches
same-skill contradictions a single sequential reader misses. Recorded as evidence for §4's
scale-calibration choice, not yet acted on by re-running with a fleet.

## §3b Post-ship correction (2026-09-03, session handoff to `dotfiles-agtt105`)

The forging session (`dotfiles-aa`) was lost mid-task. The user directly instructed the
successor session (`dotfiles-agtt105`) to take over and relay that handoff to `firedancer-0a`
— its own one line, satisfying launch-checklist row 1 for the takeover itself, and continuing
the same "coordinate with thin Director for the duration of the task" authorization §3a already
established. `firedancer-0a` (thin Director) then reported the two §3a-requested fixes already
applied (confirmed by re-reading `references/launch-and-order.md` and this file's §3a table:
both present) and relayed one new item, sourced from an **in-lab observation, not a ruling**:
today's verifier Researchers checked recomputation match but not reference-value freshness,
and a promote against arm6's pre-calibration reference values (1.8 / 10.8) was later withdrawn
— the day's second such incident.

Independently checked before applying: the gap is real given the procedure as shipped — step 3
(as it read before this correction) named only "recomputes from raw data and attempts to
falsify," which a stale-but-internally-consistent reference value passes cleanly. No existing
row in `references/researcher-types.md` or `vocabulary-and-law.md`'s operating rules already
covered docid/calibration currency for a *comparison* value (rule 4 there covers citing a
`docid` in an order, a different artifact). Applied as a new step 4 in the in-lab verification
procedure (`references/researcher-types.md`, renumbering the old steps 4–5 to 5–6); graded
**author-confirmed-via-coordination**, matching §3a's grading discipline for content that
arrives only through this relay rather than one of the four original direct sources.

## §4 Scale calibration and the F3 solo-tier waiver

Per `forging-skills/references/verifying.md` §7: this is a **Standard** skill by content
(four reference files, one new fleet-role vocabulary), but was forged **solo, zero fan-out
agents**, for two stated reasons: (1) all four sources arrived already fully specified in the
forging request — no harvest step existed to fan out; (2) the sibling audit and the trigger
desk-check are both small, bounded reads a single careful pass covers without correlated-error
risk (the fan-out risk verifying.md §2 warns against is IDENTICAL prompts returning correlated
errors — a single deliberate multi-lens pass by one reader is a different failure mode, not a
free pass, and is named here rather than left implicit).

**F3 solo-tier waiver**: the fire/no-fire set (`tests/triggers.md`) was desk-checked solo, not
cross-verified by an independent reader. One row is explicitly flagged CONTESTED rather than
silently marked resolved (§3). This waiver is written here per the solo-tier allowance
(`verifying.md` §7); it does not exempt the skill from a live eval on the contested row before
the description is next touched.

## §5 Staleness triggers

Any ONE of these forces a reforge (`forging-skills/references/verifying.md` §6):

| Trigger | What to re-run |
|---|---|
| The v2608.2.0 order-form preset becomes available in full | replace `launch-and-order.md`'s needs-verification note; bundle as `assets/order-form-v2608.2.0.md` |
| The nine measurement incidents (§1) become independently verifiable | re-grade `vocabulary-and-law.md`'s LAW-candidate table row-by-row; reconcile against `orchestrating-agents`' P7–P10 as that table already flags |
| `.claude/agents/` authorization for the Researcher type lands | extend `researcher-types.md` with the concrete agent-file mapping; this is currently out of scope by the input spec's own §7 placement, not an oversight |
| Any of the four cut siblings reforges its own routing/cut text | re-run §3's sibling-cuts lens across this whole family |
| `tests/triggers.md` row 3 gets a live-eval result | record the result here; promote from CONTESTED to a settled verdict |
| A new fleet stall is observed that no existing checklist row would have caught | add the row; this is the highest-grade source class available to this skill |

## §6 Ship record

`mise run link:skills` deploys into `~/.claude/skills` and `~/.agents/skills`. Live-reload
smoke test (the new description appearing in the next session's skill listing) is deferred to
the shipping commit's own verification — record the result here once run, per `verifying.md`
§6's ship step.
