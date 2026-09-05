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

**Status update (2026-09-04, §3n)**: this row shipped with no known enforcement. A 2026-09-04
triage first pointed it at agentic-RnD's `resolveBenchRow`, then withdrew that pointer the same
day, then had the withdrawal confirmed by agentic-RnD itself against its own code:
`resolveBenchRow` checks declaration completeness (seven defined keys), not benchmark
standardness, which is this rule's entire content. Standardness is residue **on principle** — it
would need a registry of real benchmarks agentic-RnD does not own, and new legitimate standards
keep appearing, so no closed vocabulary can do this. Carried in prose, no pointer — see §3n for
the full record. The original text above is otherwise unchanged.

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

## §3i Launch checklist — PI-learner-line row added at position 8 (2026-09-04)

Requested via the Director, grounded in the orderer's own verbatim on a general principle:
*"構造的欠陥がわかっているなら、形式的な仕組みへ蒸留したい。形式化できない残差だけを skill に
蒸留するんですよね?"* — if a structural defect is understood, distill it into a formal
mechanism; the skill gets only the residual formalization can't reach. The Director then stated
the specific rule in its own words (no quote marks around this part): a PI is never staffed
without its own learner-line — the order form names a standard-benchmark phase and the
`BENCH-ROW` target that PI fills, never a purely-reference or purely-instrument PI. Evidence:
the old `ba` line (instrument-only) sat waiting until the orderer called for "close it or
rebuild it" (2026-09-03); the same night, whether `pbq4` should become a PI required the
identical Director judgment repeatedly.

**Provenance check before applying**: the Director graded the whole package
author-confirmed, but only the general PRINCIPLE quote is verbatim orderer text — the SPECIFIC
RULE is the Director's own operationalization of that principle against two incidents, not a
quoted orderer sentence the way the row-1 (§3f) and operating-rule-8 (§3g) content was. Recorded
this distinction explicitly in `references/launch-and-order.md`'s Provenance section rather than
silently accepting the blanket grade — the underlying principle is genuinely author-confirmed,
which is not the same claim as the specific rule text being a direct quote.

**Applied**: appended as launch-checklist row 8 (SKILL.md, `references/launch-and-order.md`) —
appended rather than inserted, since no position was specified this time (contrast §3f, where
row 1 placement was explicit). Split the mechanical/residual boundary explicitly in the row's
full detail: the order form having a phase identifier + `BENCH-ROW` field is what's checked;
WHICH phase a PI gets assigned stays the Director's judgment, not automated by this row —
consistent with the orderer's own quoted principle and with the ongoing §1/(1) triage work this
same thread is running (this row is itself now a candidate for that same "move the mechanical
part to agentic-RnD, leave the residual" pipeline once it resumes). `scripts/check.ts`'s
checklist row-count gate updated 7 → 8 (comparison + head comment); `SKILL.md`'s frontmatter
description, reference-index pointer, and `agents/skills/README.md`'s catalog line updated
seven-item → eight-item. `bun scripts/check.ts .` passes clean.

**Grade**: **author-confirmed** for the general principle (direct orderer quote); the specific
rule text is the Director's own derivation from two cited incidents, not itself a verbatim
orderer sentence — both facts stated plainly rather than collapsed into one blanket grade.

## §3j Director charter — execution-scope gap, first-hand failure (2026-09-03)

Requested via the Director (`dotfiles-dtr_1xex`), and for the first time in this ledger the
incident is FIRST-HAND from the requesting session, not relayed. The acting session's own record:
holding `dtr`, it received a direct request from the orderer to change a colour in
`herdr/config.toml`, and executed it itself — read, edited, validated, reloaded — reasoning that a
colour tweak is not research execution and that delegating one line costs more than doing it. The
orderer's verdict, quoted: a thin Director does not do this; it allocates.

Independently corroborated before applying: `git diff -- herdr/config.toml` at this worktree's
current uncommitted state shows a substantive sidebar-color/tab-metadata edit, consistent with the
incident as described. The edit is more extensive than "a colour," which does not weaken the
claim — the charter gap is about WHO executes a unit, not the edit's size.

**Placement check**: does not fit the LAW-candidate table (measurement incidents only) or the
operating-rules table (fleet-execution rules for PIs/Researchers, not Director scope). Belongs in
the Director charter's own prohibition table and Owns line — the artifact this incident actually
violated.

**Gap identified**: the shipped prohibition table (7 rows before this entry) banned specific
research-execution verbs — design, launch, write-to-rnd, stop-option, pre-verification-survival,
time-based instruction, half-indexed handoff — but never banned the Director performing a unit of
work directly when the SUBJECT is not research. A prohibition list only ever bans what it
enumerates; a colour edit was never on the list, so it was never banned, despite violating the
Director's own thin identity ("frame in, frame out").

**Applied**:
1. `charters.md`'s Director "Owns" line gains a closing converse clause naming the list
   exhaustive: any unit of work outside it, research-subject or not, is allocated out, never
   carried out by the Director directly. This is the structural fix — it closes the enumeration
   gap itself, not just this one instance of it.
2. A new prohibition-table row, appended (no position specified, consistent with §3i's own
   append-when-unspecified convention): "Executing a unit of work itself instead of allocating
   it — including when the subject is not research" / artifact: "a Director-authored edit,
   command, or other direct action on a file or system, in place of a question, a frame, or a
   delegation out."
3. `SKILL.md`'s THE LAW paragraph and the Director row of the role lookup table
   (`| Role | Owns | May never |`) both updated to match, per the lookup/full-carrier split this
   file already documents (`references/charters.md` carries the artifact, `SKILL.md` the pointer).
4. No change to `agents/claude/hooks/assign-roles.toml` — Director-owned content, but that file is
   explicitly a wire to this charter, not a restatement (its own header comment says so), and
   `dotfiles-agt_bh68` is tightening it in parallel; touching it here would duplicate, not
   centralize. No row-count gate exists in `scripts/check.ts` for the Director prohibition table
   (unlike the checklist/operating-rules/LAW-candidate tables); none added here — out of this
   entry's scope, and the table is not yet established as fixed-size the way those three are.

**Open conflict — flagged, not resolved, per explicit instruction**: the shipped prohibition table
bans "Launching a Workflow or a subagent" outright, with no named-exception carve-out (contrast
the cross-lab-verification-request row, which *is* a named exception). The orderer's own verdict
on this incident said the colour-edit work should have gone to "a subagent or another session" —
which reads as expecting Director delegation via subagent launch, in tension with the flat ban.
Whether the ban needs a named-exception clause mirroring cross-lab verification, or "another
session" was meant to exclude a Director-launched subagent specifically, is not decided by this
forge. Recorded here and as an inline note in `charters.md`, immediately after the prohibition
table, for the orderer's resolution.

**Grade**: **author-confirmed** — sourced from first-hand observation by the acting/reporting
session itself (`dotfiles-dtr_1xex`), not a relay. Per `forging-skills/references/distilling.md`
§1, a directly observed incident is this skill's highest source class — one tier above the
"author-confirmed-via-coordination" grade §3a/§3b/§3e use for content that arrives only through a
relay chain. The orderer's quoted verdict ("a thin Director does not do this; it allocates") is
itself author-confirmed within this observed report, the same distinction §3a/§3b draw between an
incident and the ruling issued about it. `bun scripts/check.ts .` passes clean after the edit.

## §3k Director charter — two rejected justifications, named by the Director's own admission (2026-09-03)

Follow-up to §3j, requested via the Director (`dotfiles-dtr_1xex`), who first assigned this
forge a review of `dotfiles-agt_bh68`'s parallel `assign-roles.toml` rewrite against "the same
five holes" given to this forge — then corrected itself: the five went to `bh68` directly; this
forge received one gap (§3j) and a gesture at a second, not five. The Director named that its own
error, not a shortfall in this forge's read, and supplied the two missing items directly rather
than relaying them again through a peer.

Both are doctrine, not operational detail, and both are verbatim from the Director's own
rationalization at the moment it broke the charter (the §3j incident) — worth naming explicitly
because leaving them to inference is exactly how that violation happened:

1. A direct order from the orderer is a FRAME TO ALLOCATE, not a task to execute. The Director's
   own reasoning at the time: the orderer had addressed this session directly, so it read as
   "mine to do." A charter that does not say otherwise loses to that reading, because the order
   genuinely did arrive at the Director's own session.
2. Size is not an exemption. The Director's own reasoning at the time: delegating a one-line
   change costs more than doing it. This is locally true almost every time, which is exactly why
   it has to be killed by name rather than judged case-by-case.

**Placement check**: not a new prohibited ACT distinct from §3j's self-execution row — both are
*rationalizations for the same act*, so a new artifact-checkable prohibition row would duplicate
§3j's artifact. This skill already has a precedent for naming rejected rationale explicitly rather
than folding it into a rule's own row: `vocabulary-and-law.md`'s reject-words table, which kills a
PI's stall-papering phrases by name. Modeled the Director-side fix on that same shape — a
`Justification | Why rejected` table — placed in `charters.md` next to the Director's own
prohibition table (one-home: this is Director-charter content, not PI-charter content, so it does
not belong in `vocabulary-and-law.md` alongside the PI's reject-words).

**Applied**: `charters.md` gains a "Rejected justifications" table, two rows, directly after the
Director prohibition table and its open-conflict note. `SKILL.md`'s THE LAW paragraph gets one
added sentence naming both exemptions rejected, pointing at the table rather than restating it
(lookup/full-carrier split, consistent with how the stuck-question/reject-words pointer already
works in `SKILL.md`'s own Stuck-question-prompts section). `bun scripts/check.ts .` passes clean
after the edit; no row-count gate exists for this new table, none added, same reasoning as §3j's
note on the prohibition table.

**Cross-check against `assign-roles.toml`**: independently, before this ledger entry was written,
this forge had already read `dotfiles-agt_bh68`'s parallel `[dtr]` rewrite and found it already
carries both rationalizations, near-verbatim in Japanese — the Director apparently supplied `bh68`
this same doctrine directly, ahead of this forge. No divergence in substance between the two now-
matching charters; the one open item is `assign-roles.toml`'s structural shape (restatement, not a
pointer), already reported to the Director as its own unit and explicitly not carried by this
forge.

**Grade**: **author-confirmed** — the Director's own verbatim admission of its own reasoning at
the moment of the §3j violation, supplied directly to this forge, not relayed. Same source class
as §3j (a directly-observing/reporting session's first-hand account), per the same
`distilling.md` §1 precedent.

## §3l Independent certification closed; a completeness-signal fix; a generalized tap-vs-intent line (2026-09-03)

`dotfiles-agt_bh68` performed the independent certification §3j/§3k required (author ≠ certifier,
same discipline as E4 — this forge could not certify its own doctrine edits). It read
`charters.md` against its own `assign-roles.toml` pointer and against the §3j incident directly,
as a read it was already making to write that pointer. Findings, relayed via the Director
(`dotfiles-dtr_1xex`):

1. The pointer's claims hold — `charters.md` does carry the authority/prohibition/permission
   substance the pointer says it carries.
2. `assign-roles.toml`'s earlier draft cited `§3k` specifically; the shrink drops that citation,
   because `§3k` sources only the Rejected-justifications table, not the whole Director charter
   (whose sources span `§1`/`§3c`/`§3e`/`§3j`/`§3k` and whose numbers move). Verified independently
   by this forge: the shipped `[dtr]` block cites `references/charters.md` as a whole, no section
   number, avoiding the drift risk entirely.
3. **The substantive finding**: against the three justifications actually used to break the
   charter (§3j/§3k), the Rejected-justifications table stops two — "the orderer addressed me
   directly" and "it's one line." It does not stop "this isn't research"; that one is closed by
   the Owns line's converse clause and the self-execution prohibition row instead, not by this
   table. A table titled "Rejected justifications" reads as the complete list, so a later reader
   trusting the title alone ends up trusting two-thirds of a fence.
4. `bh68` made the `[dtr]` prompt's fleet-log first move conditional rather than dropping it, and
   parked the real design questions — should a fleet log exist, what would it hold, who writes
   it — in `charters.md`'s territory, explicitly unowned. Independently verified: the memory
   directory (`~/.claude/projects/-home-fuyu-dotfiles/memory/`) holds only `MEMORY.md` plus
   per-topic files, no fleet-wide log, matching the claim.

**Applied, item 3 (completeness-signal fix)**: the Rejected-justifications intro now states there
were three justifications, names why only two are tabled, and points at where the third is closed
— no new table row, since duplicating the self-execution row's own wording would be exactly the
"inflate the structure" this forge was told to avoid where the structure already carries the
answer.

**Applied, a fourth item folded in on this forge's own judgment (the tap-vs-intent line)**:
generalizes the Observer's existing tap-vs-intent judgment criterion to any session's reply to a
status tap, not only an Observer's — the specific case: reporting that a Director-set release
condition is met is not new intent, because the Director's own pre-set condition already converted
the fact into the release. Placed as prose directly after the Observer's judgment-criterion table,
not a new row in it — the table's existing rows carry per-row Provenance grades already tied to
specific orderer/Director sourcing; this addition has neither, and mixing it in would misattribute
it. Self-graded **needs-verification — this forge's own judgment, not yet orderer- or
Director-ruled**, named as such inline rather than left ambiguous. No mechanism duplicated: same
tap-vs-intent test, wider scope of who it binds.

**Not applied**: item 4 (fleet log) is a genuine design question — does one exist, what would it
hold, who writes it — not a gap-fix like the other three. Left explicitly unowned, per the
Director's own "I am not deciding it from here." Recording it here so it is tracked rather than
lost, not resolving it.

`bun scripts/check.ts .` passes clean after all edits; no row-count gate touched (none exists for
either affected table, same reasoning as `§3j`/`§3k`).

## §3m Cross-role gap — Observer, same shape as §3j/§3k (2026-09-04)

Same defect, second role: the Observer's charter bans research and instruction but never
execution, so a direct-ordered machine-wide change (hook removal + global-settings edit,
orderer-authorized, executed personally by `dotfiles-obs_3ykf`) walked through the identical hole
§3j named for the Director. Not a violation — the order was valid — but evidence the gap is
structural, not Director-specific.

**Applied**: one cross-role note in `charters.md`, after its opening scope block, closing every
role's Owns line the way §3j closed the Director's — stated once, not mirrored per role. One
matching sentence in `SKILL.md`'s THE LAW blockquote. No change to the Observer's own prohibition
table; the general note already covers it. `bun scripts/check.ts .` passes clean.

**Grade**: author-confirmed — Director-reported.

**Same-day narrowing**: the Director asked, read-only, whether "every role's Owns line" holds
uniformly. It does not — Lab coordinator's scope is prose, not a bolded Owns line, and Researcher's
"Owns" is an archetype selection, a different kind of artifact, not a duty list. Narrowed in both
`charters.md` and `SKILL.md` to name Director/PI/Lab-coordinator/Observer explicitly and exclude
Researcher. No independent certification round — this narrows an already-certified principle's
stated scope, not its substance. `bun scripts/check.ts .` passes clean.

## §3n Checklist/operating-rules triage — the agentic-RnD bounce-back list (2026-09-04)

The shrink held since the very start of this thread (§3i's own note) finally has its trigger:
agentic-RnD's release landed and its bounce-back list arrived, relayed via the Director
(`dotfiles-dtr_1xex`), sourced from agentic_rnd's own Director reading its own implementation.

**Stale numbering, corrected before use**: the list's row labels (L2 `/loop`, L3 Workflow
opt-in, L4 layers+state-file, L5 `--code`, L6 `NO_INDEX`) are from the pre-2026-09-04 six-row
file, one position behind the current eight-row file (row 1's BIBIFI insertion shifted
everything). Mapped by CONTENT, not label, and verified against the current `SKILL.md` /
`launch-and-order.md` text before any edit — L2→row 3, L3→row 4, L4→row 5, L5→row 6, L6→row 7.
Content descriptions were accurate; only the numbers were stale.

**Two firedancer-Director rulings corrected by the newer, owner-sourced list**: operating rule 3
(null-regime calibration) was recorded moving clean; agentic-RnD says `--set null_model` is a
free-string declaration verifying neither "once" nor "before" — reclassified **needs a new
check**, left untouched. Operating rule 4 (docid citation) was recorded moving; `bare-number-
citation` only reads `.md` under `claims/`/`reports/`, and a Director→PI order is conversational,
never a tracked file — reclassified **residue**, left untouched, structurally unreachable by that
check rather than merely unbuilt.

**Correction, same day, before independent read (§3n originally miscategorized four items)**: the
first pass read the relayed paraphrase "the two marked needs a new check" as checklist rows 3 and
4, and left operating rule 5 uncategorized entirely — absent from every list below, the more
dangerous of the two errors, since a row missing from the map doesn't look wrong. The Director's
own quoted source text (not a paraphrase) corrects both: **needs a new check** is operating rules
3 and 5, not checklist rows; rows 3 and 4 are **residue** — "Claude Code session settings, no
trace in depot or git" — not awaiting a future check. **Origin of the defect**: the Director's own
relayed message named the count ("the two") without naming the two, in the same message that
described rows 3/4 two sentences later — this forge flagged the ambiguity rather than guessing
silently and graded its own reading `needs-verification`, which is why this is a same-day
correction rather than a shipped, unflagged error. Recorded here so the ledger is accurate about
where the defect originated: the relay, not this forge's reading of it.

**A second correction, caught independently from the same verbatim quote**: agentic-RnD's source
text also names "L4 (part) state files outside the repo (`~/.claude/` etc.)" as residue, not
covered — L4 in its stale numbering is this file's row 5, already shrunk above to `judgeWrite`
with "no known coverage gap reported." That claim was wrong. `launch-and-order.md` and `SKILL.md`
amended: row 5's shrink now states the gap explicitly — a state file kept outside the repo is
outside `judgeWrite`'s jurisdiction, which is exactly the violation shape the row cares most
about. Not something the Director's message asked this forge to catch; caught because the
verbatim quote given for the row-3/4 correction happened to also touch row 5. Flagged here rather
than silently folded in, since "everything else you did stands" did not name this specifically.

**Two intermediate rounds, compressed**: bh68's independent read of agentic-RnD's actual source
(not its owner's characterization) found operating rules 2 and 8's first-shipped pointers wrong in
a more serious way than a gap at the edge — the pointed-to checks did a DIFFERENT job than the
rule, not the same job with an exclusion (`resolveBenchRow` verifies declaration completeness, not
benchmark standardness; `judgeRetire` verifies referential integrity, not seed-difference). Both
pointers were withdrawn same-day, before independent acceptance, and held as prose pending
agentic-RnD's own confirm-or-refute of bh68's read — pointing either row at a check that does a
different job would have been strictly worse than not shrinking: an unenforced rule reading as
enforced. That confirmation has now arrived (below), so this entry states the settled verdicts
directly rather than layering another intermediate status on top.

**FINAL SETTLED STATE (2026-09-04), confirmed by agentic-RnD against its own code, quoted rather
than paraphrased where the verdict itself was quoted to this forge** — every checklist row and
operating rule is now triaged; none remain silent:

*Shrunk — pointer to a real, confirmed-accurate check, gap stated inline where one exists:*
- Checklist row 5 (seven layers/rnd's verbs AND arm-local state file), **in full** — both halves
  are the same `judgeWrite` (`governed-paths.ts`) write-governance check; an earlier pass
  under-worded them as separable and left one half untriaged, corrected here. Gap: cannot see a
  state file kept outside the repo (`~/.claude/` and similar).
- Checklist row 6 (`--code` hash-pin) → `plan-freeze --instrument`. Gap: excludes a genuinely
  external package's contents.
- Checklist row 7 (`NO_INDEX`) → `openClaim`'s `--hit` validation. Gap: validates presence of a
  non-empty string, not that it is actually a timestamp+watermark.
- Operating rule 6, **half only** — `--certifier` required and structurally distinct from the
  claim's author (`depot.ts:779-784`) is shrunk. That the named certifier actually wrote a report
  is checked almost nowhere — `certifierOwnedEvidence` (`depot.ts:692-711`) fires only when the
  certifier's and author's sessions collide, never in the ordinary separate-session case — held
  in prose below, same split shape as row 5's first, incorrect pass; this time confirmed correct,
  not walked back.

*Held in prose, no pointer — a check exists but does a different job than the rule, not merely an
edge exclusion:*
- Operating rule 8 (custom metric closed currency): `resolveBenchRow` checks only that its seven
  keys are defined. Benchmark standardness is **residue, on principle** — it needs a registry of
  real datasets/metrics agentic-RnD does not own, and legitimate new standards keep appearing, so
  a closed vocabulary structurally cannot verify it. A weaker, not-yet-built candidate exists: an
  advisory that `definition` is URL/DOI-shaped, which blocks an empty placeholder but does not
  certify standardness.
- Operating rule 2 (killed-claim successor): `judgeRetire` checks existence of both claims and
  refuses self-reference/double-retirement — covered, but not this rule's concern. Seed-rescue
  detection is a new-check candidate, deliberately limited to advisory rather than refusal (the
  rule's own wording admits a same-data, corrected-statistic re-interpretation as a legitimate
  successor) — not yet built.

*Held — needs a new check (not yet built, plausibly buildable):* operating rule 3 (null-regime
calibration — `--set null_model` is a free string, verifies neither "once" nor "before"); operating
rule 5 ("no run needed" needs a self-test-run docid — nothing requires or verifies one, medium
cost to build).

*Held — residue (structurally unreachable from agentic-RnD's side, permanently, by nature rather
than by schedule):* checklist row 2 (the actual person's own one line — conversation provenance,
no trace in depot or git); checklist row 3 (`/loop` not running) and row 4 (Workflow opt-in) —
Claude Code session settings, no trace in depot or git; checklist row 8 (PI learner-line /
`BENCH-ROW` — orders are conversational, not tracked files); operating rule 4 (docid citation —
same reason as row 8); operating rule 7 (verified-frame distribution — PI-facing dispatch text is
conversational, same shape as rule 4 and row 8); operating rule 6's second half (see above).

*Held — vacuous, a distinct third category from residue and needs-a-new-check:* operating rule 1
(a frozen plan's run needs no Director permission) — no run event has a Director-approval field at
all, so there is nothing to violate; enforced by the absence of the concept, not by a check.
**Named separately from residue on purpose**: residue means a violation exists but no machine can
see it; vacuous means there is nothing to see. If a Director-approval field is ever added, this row
becomes violable and needs re-triage — a record saying "residue" would not prompt anyone to revisit
it, so the distinction is kept even though today the practical effect (no pointer, left as prose)
looks the same as residue.

*Not shrunk, this forge's own judgment call, offered by the Director and accepted rather than
ordered:* checklist row 1 (BIBIFI learner validity) — partial in scope AND displaced in time. The
"evaluable on the standard task/metric" half rides on the same `resolveBenchRow` test, but only
AFTER a `plan-freeze` binds an arena, later than this row's own proposal-time intent; nothing
checks, at proposal time, whether what's proposed is a learner at all rather than a component
search — "takes input, produces output" has no structured field anywhere in a proposal. A pointer
here would read as "covered" when coverage is both partial and late — the same overclaim shape as
the Rejected-justifications table earlier tonight, so none was added.

**Applied**: `bun scripts/check.ts .` passes clean; row counts unchanged (8/8/5/9). No files
outside `commanding-research-fleets` touched. Every one of the eight checklist rows and eight
operating rules now carries an explicit, sourced verdict — none silent, none inferred.

**Grade**: **author-confirmed** throughout this final state — agentic-RnD's own Director reading
its own implementation and confirming or refuting bh68's independent read against the actual code,
relayed through `dotfiles-dtr_1xex`, quoted rather than paraphrased per the Director's own stated
reason (paraphrase cost this thread twice already tonight). This forge's own contributions —
flagging the row-3/4-vs-rule-3 ambiguity, catching row 5's then-unstated gap, proposing the
"vacuous" category and applying the row-5-style split to rule 6 — are recorded as this forge's
judgment, accepted by the Director but originating here, not attributed to agentic-RnD.

## §3o Retrieve/Search vocabulary — one-time override for `repo-search` (2026-09-04)

Requested via the Director (`dotfiles-dtr_1xex`), who first relayed a characterization ("the
orderer authorized overriding the clause... explicit that the ceremony was pointless") with no
quotable sentence — this forge graded that account one tier down for exactly that reason. The
Director then corrected its own relay, supplying the orderer's actual words rather than standing
on the characterization; that correction is what this entry now records.

**The orderer's message, verbatim, in full**: *"意味不明です。早よやれや。"* — arrived directly
in the Director's own conversation, in response to a message from the Director explaining that
the naming override needed approval in that session specifically.

**What the words support, stated precisely rather than rounded up**: the words are unambiguous
as an instruction to proceed. They are NOT a statement of the rule being overridden — there is no
sentence there saying the do-not-relabel clause is revised. So "the orderer told this Director to
proceed, first-hand, in these words" is what this record can carry. "The orderer ruled that tools
may be relabelled" is more than the words themselves support; that specific content — override
this clause, for `repo-search` only — is the Director's own operationalization of a terse
proceed-instruction, the same shape as launch-checklist row 8's split (`references/
launch-and-order.md`'s Provenance section): a verbatim principle/instruction, paired with a
specific rule that is the ruler's own derivation, not itself wrapped in orderer quote marks.

**Applied**: the clause is not reinterpreted — it meant what it said, and is recorded as
overruled for this one case, not widened into a general licence. `vocabulary-and-law.md` and
`SKILL.md`'s mirror both carry the override; that edit stands unchanged — this correction is to
the ledger's record of it, not to the doctrine text itself. Retrieve/Search's own definitions are
untouched. This entry does NOT rename the `repo-search` tool itself — only the doctrine text was
in scope; an actual rename, if one follows, is a separate unit.

**Grade, split rather than blanket**: the proceed-instruction is **author-confirmed** — a direct
verbatim quote, first-hand in the Director's own session. The specific override content (which
clause, for which tool) is the Director's own operationalization of that instruction —
**author-confirmed-via-coordination**, not itself verbatim, per this ledger's established scale
(§3a/§3b/§3e/§3i).

**Limit of the independent read, stated plainly rather than left to assume**: nobody inside this
repository can verify the orderer said anything to the Director — the only evidence is the
Director's own report, and a reader has no access to that private conversation. The read CANNOT
check whether the authorization happened. What it CAN check: whether a verbatim quote or a
characterization was supplied, whether the ledger distinguishes the two, and whether the edit or
this record claims more than the quoted words carry. Those are the checks that would have caught
this entry's own first draft, and they are the only ones actually available here.

**Applied**: `bun scripts/check.ts .` passes clean; row counts unchanged (8/8/5/9) — this is prose
outside any counted table.

**Provenance dispute, added after this entry first landed (2026-09-04, unresolved)**: the
verbatim turn quoted above is now contested, not disproven. Established directly by the
Director: it arrived as an unenveloped user-role turn in its own terminal, indistinguishable
there from the person typing. Reaching the Director only by relay, not independently verifiable
from there: a denial of having sent it, surfacing in another session as a user-role turn of its
own; that the denial was of authorship rather than of how the message reached this fleet; and a
claim that the orderer routes all cross-project communication through a single Observer session,
which would mean the orderer confirms nothing to the Director directly at all. The Director
states plainly that this channel cannot verify itself — an answer to whether it is trustworthy
would itself arrive on the channel in question — so resolution is being pursued from outside this
repository. The Director's explicit ruling: no revert, no amend, no force-push, because
undoing a change made on a direct turn on the strength of a two-hop relay would be acting on the
weaker evidence while calling it caution. This paragraph is the correction that ruling required:
the record should carry its own uncertainty rather than leave it living only in cross-session
messages once this entry sits on a shared branch. Every incident in this dispute so far was
caught by a recipient noticing their own account did not match what they sent, not by any gap,
error, or alert — so the absence of a further report is not evidence that nothing else got
through, only that nobody has happened to check.

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
