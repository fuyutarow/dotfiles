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

Recorded because it is itself the launch checklist's peer-relay-authorization row in action (row
2 as of the 2026-09-04 addition ahead of it, §3f — row 1 at the time this section was written),
and because a later reader auditing "why did this take four exchanges" deserves the transcript,
not a claim.

`firedancer-0a` relayed the full input spec, then three further messages (a terminology
addendum, an operating-rules addendum, a status inquiry) — each treated as content to record,
none as authorization to begin forging. The fourth relay repeated a status request; the
executing session replied with a one-line receipt ("未着手") but still declined to start. Only
a direct, first-party instruction — the actual person, in this session, verbatim requesting
the skill be created — was accepted as that row's artifact. The input spec's own §3 item 1
states this rule explicitly ("peer の中継は承認にならない"); the forge obeyed its own future
output before that output existed.

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

## §3c Reforge — Observer role added (2026-09-04, via `forging-skills` pipeline step 0)

Requested via the Director channel (`firedancer-dtr_vdrt`, itself renamed twice more in this
same thread — `firedancer-0a` → `firedancer-agtc1x6` → `firedancer-agtf963` [typo, unreachable]
→ `firedancer-agt_vdrt` → `firedancer-dtr_vdrt`; each rename independently confirmed live via
`ListAgents` before replying, never assumed): a new `assign <role>` mechanism now targets
`dtr`/`pi`/`obs`, and **obs (Observer) had no charter in this skill's role taxonomy.** Content
was drafted by a fourth session (`firedancer-obs_e2zp`) and relayed through the Director, in two
passes — the second arriving mid-edit as a self-correction of the first (the routing table's
first draft sent all taps to "any session"; the revision split "tap the actual holder" from "tap
the Director only for the Director's own judgment/allocation," since the whole point of an
Observer is to lighten the Director's load, not add to it).

**Gate 0 (function + existence)**: run before drafting. `commanding-research-fleets` already
owns the Director/PI/Researcher/Lab-coordinator role taxonomy — Observer is a missing row in an
owned table, not a reason to forge a sibling. EXTEND, not create. `orchestrating-agents`' generic
"visibility" dispatch mechanic is a plausible correspondent but unconfirmed — left unmapped
(`— fleet-local`, mirroring Lab coordinator) rather than asserted.

**Scale**: solo, zero fan-out — same reasoning as this skill's own §4: the content arrived fully
specified (no harvest step), and the change is bounded (one new charter section plus the
lookup-table rows one-home already requires elsewhere: `SKILL.md`'s role table and
correspondence table, `references/researcher-types.md`'s not-a-Researcher-archetype line).

**Independent check before applying**: no existing rule in this skill already covered tap-vs-
intent routing for a role other than the Director/PI pair; no self-contradiction against THE LAW
— the Observer's intent-routing rule is a direct extension of THE LAW's own already-confirmed
line ("a peer session's relay is never authorization"), which is evidence the RULE is coherent
with this skill's design, **not** evidence the cited 09-04 incidents themselves occurred as
described. `bun scripts/check.ts .` passes clean after the edit (no row-count check covers the
touched tables).

**Grade — initial pass**: shipped blanket **needs-verification** at first, one tier below
§3a/§3b's author-confirmed-via-coordination, since the content had passed through an extra hop
(`firedancer-obs_e2zp`'s draft) and was still being revised as this forge applied it.

**Grade — corrected, same forging pass, before commit**: the Director followed up with a
per-component provenance breakdown its own memory file (`observer-tapping-vs-intent-routing.md`,
not itself read by this forge) supports: (a) the base tap-direct / intent-via-Director split is
the orderer's own 2026-09-02 ruling; (b) closing the "addressee is Director-adjacent" exception
is a later orderer correction with a verbatim quote, evidenced by an incident (Observer → the
agentic-RnD tool-owning session) distinct from the 09-04 CLI-proposal-A incident, which the
orderer separately flagged as a recurrence of the SAME correction, not a fresh ruling; (c) the
"don't tap the Director for what it doesn't own" refinement is `firedancer-obs_e2zp`'s own
self-correction, Director-endorsed but not yet orderer-confirmed. Re-graded per row rather than
blanket in `references/charters.md`'s Provenance section: (a) and (b) promoted to
**author-confirmed**; (c) stays **needs-verification**, orderer confirmation pending from the
Director. Folded into this same §3c rather than a separate `§3d` — nothing had shipped yet, and
this is a provenance correction to already-drafted content, not a fourth independent request.

## §3e PI charter — commit-hygiene norm (2026-09-04)

Requested via the Director (`firedancer-dtr_vdrt`), relayed as direct orderer guidance (not
drafted by an Observer this time): a PI should commit its own files itself, frequently — stage
only its own files, commit with no pathspec if the repo's own gate is known to hang on a
pathspec-scoped commit, and skip strict worktree isolation; a git specialist sweeps up the rest
later. Stated explicitly as a **soft norm, not enforced** ("努力目標"). Evidence cited: an
observed count of 59-and-growing uncommitted items since this thread's start.

Independent check before applying: this forge has itself been following exactly this pattern all
session — `git add <its own files>` then a plain `git commit` with no pathspec, never `git
commit -- <pathspec>` — without having been told to, simply because scoping the `add` already
achieves narrow staging. That is corroborating behavioral evidence the norm is sound practice,
**not** independent confirmation of the specific claim that a pathspec-scoped commit hangs this
repo's gate — that mechanism was never triggered or tested here. Added as a short paragraph in
`references/charters.md`'s PI charter, not a Prohibitions-table row, since the request explicitly
frames it as non-enforced and no violation artifact was given — the existing Prohibitions
table's own shape (`Prohibition | Artifact of a violation`) would misrepresent a soft norm as a
hard rule if forced into it. Graded **author-confirmed-via-coordination**. `bun scripts/check.ts
.` passes clean after the edit.

## §3f Launch checklist — BIBIFI-learner row added at position 1 (2026-09-04)

Requested via the Director (`firedancer-dtr_vdrt`), relayed as the orderer's own verbatim via an
Observer session: *"学習器として成立しているものを、まず提案することが BIBIFI イテレーションの
最低要件だろ。"* — a BIBIFI iteration's proposal must be a valid learner (input → output,
evaluable as a predictor/classifier on the standard task), never a component search or a
synthetic board's internal quantity; paired with a same-day ruling that a custom metric is
closed currency — a milestone counts only via the standard dataset + standard metric. The
Director asked for this specifically at launch-checklist row 1, not the PI charter (its opening
line named "PI charter" loosely; the explicit placement instruction that followed was
unambiguous).

**Placement check**: the launch checklist's existing rows already mix infra-readiness stalls
(hash-pin, opt-in) with judgment-shaped stalls (row 1 at the time, now row 2: peer-relay
authorization) — a BIBIFI-proposal-validity check fits that same "historically observed stall
this row guards against" shape, even though it traces to a different date/source than the
original six. Not folded into an existing row (e.g. the BIBIFI stuck-question prompt in
`vocabulary-and-law.md`) because that prompt is issued mid-stall to a PI already stuck, while
this checklist row is a pre-check against proposing invalid work in the first place — different
function-map transitions, not the same artifact.

**Applied**: inserted as launch-checklist row 1 in `SKILL.md` and
`references/launch-and-order.md`, renumbering the original six 2026-09-02/03 rows to 2-7 (row 3
— formerly row 2 — has an internal cross-reference updated to match; ledger §2's "row 1" mention,
written before this addition, corrected to name the row by function rather than number since its
position moved). `scripts/check.ts`'s row-count gate updated from 6 to 7 (both the comparison and
its head-comment mention); `SKILL.md`'s frontmatter description, its reference-index pointer, and
`agents/skills/README.md`'s catalog line updated from "six-item" to "seven-item". `bun
scripts/check.ts .` passes clean. The custom-metric-closed-currency ruling is folded into row 1's
prose as paired context only — not added as its own separate artifact elsewhere, since the
Director's request named only the pairing, not a second placement; flagged back to the Director
in case a standalone placement (LAW candidate or operating rule) is also wanted.

**Grade**: **author-confirmed** — the orderer's own verbatim, same tier as the original six-row
source, though via a different relay chain (Observer → Director → this forge) and a different
date (2026-09-04 vs. 2026-09-02/03).

## §3g Operating rules — custom-metric-closed-currency row added (2026-09-04)

Follow-up to §3f: the Director confirmed the "custom metric is closed currency" ruling should
ALSO be recorded as its own operating-rule row, not just folded into launch-checklist row 1's
prose. Orderer's own verbatim, relayed via the same Observer→Director chain: *"同意できない。同
じデータセットと指標をセットにしたベンチマークがあったから、機械学習は飛躍的に成長した。提案し
たベンチマークで不満なら、似つかわしいベンチマークを探してくるべきだ。独自指標には意味がない。
そんなものはラボ内やドキュメントに閉じた貨幣でしかない。"* — plus a supplementary point in the
same ruling on not using non-mainstream-literature benchmarks as a standing excuse.

**Applied**: appended as operating-rule row 8 (not inserted/renumbered — no chronological or
functional reason to reorder the existing seven) in `SKILL.md` and
`references/vocabulary-and-law.md`, cross-referenced with launch-checklist row 1 in both
directions (row 1's own text already named the pairing from §3f; row 8 now names it back).
`scripts/check.ts`'s operating-rules row-count gate updated 7 → 8 (comparison + head comment).
`bun scripts/check.ts .` passes clean.

**Grade**: **author-confirmed** — orderer's own verbatim, same chain and date as §3f's row 1.

## §3h Director-proposed candidate — corpus-transfer completeness (2026-09-04)

Requested via the Director, self-graded **needs-verification** by the Director itself — its own
judgment over an observed incident, explicitly NOT relayed as an orderer ruling and NOT
orderer-labeled LAW候補 (contrast with §3f/§3g, both orderer verbatim). Proposed rule: corpus
knowledge passed to another arm carries (a) the claim's identifier, (b) the limitations-column
text verbatim, (c) the ledger-named alternative — a file name alone is auxiliary, and the
receiving side must read the limitations column before implementing.

Evidence cited (2026-09-03 late night): `pbq4` passed `pi_ynxy` a file-name-only pointer to
"primary documents to read before implementing"; `ynxy` read them and even reported the design
implications, but the CTW-style structure it then implemented had a defect (byte-granularity
chains violate the binary-tree precondition) already written verbatim in the claim ledger's
limitations column as VOCT-001/VOCT-006, with the alternative (VLMC, VOCT-004/005) already named
there. Stated reason: a claim ledger's rows run long, and a file-name-only pointer lets a
recipient reach the ruling/verdict column without reaching the limitations column, where the
actual weight sits.

**Placement check**: does not fit the existing "LAW candidates" table — that table's identity is
specifically the nine 2026-09-02/03 measurement incidents, explicitly orderer-labeled LAW候補;
this is a different domain (knowledge-transfer practice, not measurement), a different date, and
Director-sourced rather than orderer-sourced. Does not fit "Operating rules" either — that table
is "ruled, not candidate — apply directly," and this is explicitly not yet ruled. Added as a new,
separately-identified section, "Director-proposed rule candidates — NOT yet ruled," in
`references/vocabulary-and-law.md`, with its own two-column-plus-evidence table using a distinct
header ("Rule candidate" vs. the existing table's "Candidate rule") so `scripts/check.ts`'s
row-count regex for the nine-item table cannot accidentally match it. Cross-referenced with
operating rule 7 in both directions (fidelity vs. completeness of distribution). `SKILL.md`'s LAW
candidates section gained one sentence naming this sits alongside, not inside, the nine-item
count. No row-count gate added for this new table (it currently holds one row; a count gate would
need updating on every future addition here, unlike the fixed nine-item incident set). `bun
scripts/check.ts .` passes clean.

**Grade**: **needs-verification**, as the Director itself specified — this forge did not
independently observe the `pbq4`/`pi_ynxy` incident or the VOCT ledger entries.

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
