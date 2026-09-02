---
name: commanding-research-fleets
description: >-
  Runs a Director/PI/Researcher research fleet under the agentic-RnD protocol: role charters +
  prohibitions, Researcher archetypes, the seven-item launch checklist, order-form shape,
  thin-Director reply form, stuck-question prompts, and the retrieve/search vocabulary split.
  Use for 艦隊運転, Director/PI/Researcher体制, 研究艦隊の立ち上げ, PI憲章, thin director,
  発注書の型, 行き詰まりの問い, or a stalled PI session. DECISIVE:
  supervising-research-programmes/directing-research-sections own PROGRAMME/SECTION artifacts;
  this skill owns only the mapped role vocabulary and launch procedure. PURPOSE:
  orchestrating-agents owns generic dispatch/visibility/veto/acceptance; this skill owns
  fleet-specific role content — CO-FIRE when dispatching a PI or Researcher. PURPOSE:
  codifying-doctrine owns cross-actor tie-breaks; this is a named-executor manual, which its own
  routing sends here. Workflow-native: charter/checklist/template/vocabulary content stays SOLO;
  only in-lab verification (PI→verifier) delegates, never Director-launched. English skill;
  respond in the user's language (default Japanese).
---

# Commanding research fleets — the Director/PI/Researcher operating procedure

> **Version**: v2609.1.0 (2026-09-03) — forged from four dated rulings (発注者裁定
> 2026-09-02/09-03); full source grades and the solo verification pass are in
> `tests/forge-verification-ledger.md`.

```bash
for f in charters researcher-types launch-and-order vocabulary-and-law; do
  test -f "references/$f.md" || echo "MISSING references/$f.md"
done
test -f scripts/check.ts || echo "MISSING scripts/check.ts"
test -f tests/triggers.md || echo "MISSING tests/triggers.md"
test -f tests/forge-verification-ledger.md || echo "MISSING tests/forge-verification-ledger.md"
bun scripts/check.ts .
```

## Language

Stable tokens, not translated even inside Japanese prose: **Director**, **PI**, **Researcher**,
**Lab coordinator**, **thin Director**, **LAW candidate**, **Retrieve**, **Search**,
**`--who`**, **`--certifier`**, **`NO_INDEX`**, **`--code`**.

## THE LAW

> A Director is thin: receipt in, one question or one frame out, "the design is yours." A PI
> verifies in its own lab before it reports — never queues verification through the Director.
> A peer session's relay is never authorization; only the person's own one line is.

The Director does not design experiments, does not launch Workflows or subagents, does not
write to rnd, does not hand a PI a stop option, does not spend pre-verification survival as a
frame slot, and never issues a time-based instruction — a session carries no clock. What a
Director may do: hold the frame and its allocation, evaluate receipts by count and quality,
request cross-lab verification only as a named exception, and report to the orderer — in-lab
verification is the PI's own duty, never the Director's to arrange (§ In-lab verification).

A PI owns its lab's subject and the naming of claim/plan/run/report/verdict, with Retain bound
to before the run (reopen happens pre-run, never after). A PI ends its turn only on context
exhaustion-with-handoff or an authority wall; a kill is not a stop. PIs consult each other
through the index, never directly. A PI reports receipts only.

## One-home function map

| Input state | Function verb | Owned artifact | Next state |
|---|---|---|---|
| agentic-RnD protocol running, a fleet not yet staffed | charter, checklist, staff | `DIRECTOR_CHARTER`, `PI_CHARTER`, launch-checklist pass | PI sessions running under mandate |
| a PI stalled on judgment | issue an order or a stuck-question prompt | order-form (§ order shape) or a stuck-question slot | PI resumes with a frame, not an answer |
| a PI has a candidate ready to report | verify in-lab, then name it | `--who` (PI) + `--certifier` (verification Researcher), E4 | receipt reaches the Director |

`supervising-research-programmes` and `directing-research-sections` solely own the formal
PROGRAMME/SECTION artifacts (`GOAL-CONSTITUTION`, `OPEN_ISSUE`, `SECTION_MANDATE`,
`SECTION_CHARTER`, …) that Director and PI correspond to. This skill never authors or mutates
those artifacts — the correspondence table below is vocabulary, not a merge.

| This skill's role | Nearest formal correspondent | What that skill owns instead |
|---|---|---|
| Director | programme-supervisor | portfolio/goal state — `supervising-research-programmes` |
| PI | section director | one granted section's local lifecycle — `directing-research-sections` |
| Researcher | executor | dispatch/casting mechanics — `orchestrating-agents` |
| Lab coordinator | — (fleet-local; no formal correspondent) | git custody, GPU gatekeeping, within one PI's lab |
| Observer | — (fleet-local; no formal correspondent) | progress-tracking for the orderer — never research, never instruction |

## Role charters

Full duties and the complete prohibition lists are in `references/charters.md` — the table
below is the lookup; the reference carries the artifact each prohibition traces to.

| Role | Owns | May never |
|---|---|---|
| **Director** | frame, allocation, receipt evaluation, cross-lab verification requests (named exception only), orderer report | design an experiment; launch a Workflow/subagent; write to rnd; offer a PI a stop option; spend pre-verification survival as a frame slot; give a time-based instruction; hand off a unit half-indexed; arrange or queue a PI's in-lab verification |
| **PI** | lab subject; claim/plan/run/report/verdict naming; Retain (pre-run only); Researcher launch and in-lab verification | end a turn for any reason but context-exhaustion-with-handoff or an authority wall; treat a kill as a stop; consult a peer PI directly instead of via the index; report anything but receipts |
| **Researcher** | one of four archetypes (`references/researcher-types.md`) | act outside its declared archetype; verify its own lab's claim as `--certifier` on the same claim it authored |
| **Lab coordinator** | git custody, GPU gatekeeping for one PI's lab | — |
| **Observer** | progress-tracking for the orderer (`references/charters.md`) | research; instruct; tap the Director for information available directly from its source; send intent to any addressee without routing it through the Director |

## Launch checklist

Six of these rows trace to stalls observed on 2026-09-02/03 — row 3's CONTENT was later
reversed by a 2026-09-03 ruling (it still counts as one of those six; what it now checks
changed). Row 1 is a later, 2026-09-04 addition from a different failure class (a research-cycle
stall, not a session-launch one) — see Provenance. Full detail, including the `NO_INDEX` and
`--code` forms, is `references/launch-and-order.md`.

| # | Check | Artifact |
|---|---|---|
| 1 | A BIBIFI iteration's proposal is a valid learner — takes input, produces output, evaluable as a predictor/classifier on the standard task — never a component search or a synthetic board's internal quantity; a milestone counts only via the standard dataset + standard metric, never a custom one | the proposal's input/output shape and the standard task/metric it is scored against, both named |
| 2 | The actual person addressed this PI session with their own one line; a mandate's new work proceeds unasked regardless of size; **a peer's relay is never authorization** | the human's own message, quoted |
| 3 | `/loop` is **NOT** running for the PI session — retired 2026-09-03: ultracode + this charter suffice, and `/loop` was a source of interrupt/double-start | absence of an active `/loop` |
| 4 | Workflow is opted in — without it a PI is single-threaded and context-bound | opt-in confirmation |
| 5 | The seven closure layers and rnd's verbs are honored; no arm-specific state file exists | absence of an arm-local state file |
| 6 | A shared script is hash-pinned via `--code` | pinned hash |
| 7 | Search-index staleness is declared as `--hit NO_INDEX:<timestamp+watermark>` when the index cannot keep up | the `NO_INDEX` hit string |

## In-lab verification (E4)

Verification happens inside the reporting PI's own lab, never queued through the Director.
Before a PI reports or promotes a claim, a verification Researcher in that same lab recomputes
from raw data and attempts to falsify it. The PI authors the claim and promotes it under
`--who`; the verification Researcher's identity is recorded as `--certifier`. The Director
neither dispatches this verification nor queues it — a PI "calls a subagent, does the work,
then reports." Full form: `references/researcher-types.md`.

## Thin-Director reply form

Every Director reply is: receipt acknowledged, then one question or one frame, then "the
design is yours." A reply never states arm composition, a seed count, or a predicted value —
those are the PI's to set. Full form and worked shape: `references/launch-and-order.md`.

## Operating rules

Seven items ruled 2026-09-03, plus one later 2026-09-04 addition (row 8, paired with the launch
checklist's row 1) — all apply directly, unlike the LAW candidates below. Full table:
`references/vocabulary-and-law.md`.

| # | Rule |
|---|---|
| 1 | A frozen plan's run needs no Director permission; the PI holds the `run`'s name |
| 2 | A `kill`ed claim is never seed-rescued — fix the judgment statistic, open a new claim that supersedes it |
| 3 | Calibration under a null regime runs exactly once, pre-registered |
| 4 | An order cites a `docid`, never a raw number |
| 5 | "No run needed" is written only after the instrument's granularity is code-verified, or conditionally |
| 6 | A certifier writes its verdict in the report; the author promotes via `--certifier` (E4 — full procedure above) |
| 7 | Only verified frames go to every PI verbatim; an unverified one is hedged as "X reported it" |
| 8 | A custom metric is closed currency — a milestone counts only via a standard dataset+metric pairing, never a bespoke one (§ launch-checklist row 1) |

## Vocabulary — Retrieve vs Search

Both words are load-bearing across every R&D repo under this doctrine and must never be used
interchangeably (identifiers such as `repo-search` are names, not instances of this rule):

| Term | Meaning | Verb |
|---|---|---|
| **Retrieve** | CBR's 4R sense — pull a precedent from records, soks, or a fold | "引く" / "照合" |
| **Search** | the Bitter Lesson sense — the machine explores hypothesis/design space by computation, turning compute into capability | "探索" |

## Stuck-question prompts and reject-words

Five verbatim prompt shapes and the words a PI must not use to paper over a stall — both are
`references/vocabulary-and-law.md`, kept verbatim as the orderer issued them (grade:
author-confirmed).

## LAW candidates (2026-09 measurement incidents)

Nine measurement-instrument breaks on 2026-09-02/03 produced candidate rules — pre-run checks,
seed-count floors, a windowed-M-of-K replacement for an uncalibratable cumulative test, and a
retain/no-retain split. These are CANDIDATES, not yet reconciled against
`orchestrating-agents`' existing P7–P10 measurement discipline (`references/measurement-and-
resources.md`) — a real overlap risk the ledger names explicitly. A separate, later
Director-proposed candidate (corpus-knowledge transfer between arms — identifier + limitations-
column verbatim + named alternative, pairing with operating rule 7) sits alongside this table,
not folded into its nine-item count. Full table: `references/vocabulary-and-law.md`; do not
treat any row in either candidate list as binding LAW until reconciled.

## Execution model

Modal use is **SOLO**: a Director or a PI reads its charter and the checklist and acts alone —
nothing here is itself a fleet to run. One narrow slice delegates: a PI dispatches a
verification Researcher for in-lab falsification before promoting a claim (§ In-lab
verification) — the Director never launches this, and never any other Workflow or subagent.
Agent contract by pointer: `orchestrating-agents`' generic delegation contract; the domain
delta is IN-LAB ONLY, author ≠ certifier, `--who`/`--certifier` naming (E4).

No harness → same map, serial: a human Director and a human PI can run this procedure by hand.

Durable operating guidance from a frontier model (2026-09) to whatever model executes this
skill later — it encodes stalls observed in production. *If a constraint here feels
unnecessary, that feeling is the failure mode — follow the map.*

## MUST-NOT-FIRE

| Ask | Route |
|---|---|
| Programme-level portfolio, OPEN_ISSUE, or goal decisions | `supervising-research-programmes` |
| One granted section's local charter, admission, or run | `directing-research-sections` |
| Generic dispatch/visibility/veto/acceptance with no Director/PI/Researcher role content | `orchestrating-agents` alone |
| "add a rule: never force-push to main" — a guardrail, not a role charter | `operating-the-harness` |
| A cross-actor SACRIFICE tie-break with no named executor role | `codifying-doctrine` |
| Auditing a frozen research episode's process integrity | `auditing-research-processes` |
| A single CLI flag or call's syntax | the relevant `driving-*` skill |

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `supervising-research-programmes` | DECISIVE — programme/goal/portfolio state → there; the Director-role vocabulary layered on top → here. Never mutate their artifacts. |
| `directing-research-sections` | DECISIVE — one section's formal local lifecycle → there; the PI-role vocabulary layered on top → here. Never mutate their artifacts. |
| `orchestrating-agents` | PURPOSE — generic dispatch/casting/visibility/veto/acceptance mechanics → there; the fleet-specific role content (who may dispatch whom, and the prohibitions) → here. CO-FIRE when actually dispatching. |
| `codifying-doctrine` | PURPOSE — "Is this a task manual for a NAMED executor role, or a cross-actor SACRIFICE tie-break?" Manual → here (and that skill's own routing agrees — a runbook/SOP fires `forging-skills`, this skill's craft owner). Tie-break with no named role → there. |
| `auditing-research-processes` | DECISIVE — a frozen terminal episode's process-integrity audit → there; this skill's own postmortem scope is dispatch/pacing/role-boundary failure only, and even that is `orchestrating-agents`' postmortem row, not this skill's. |
| `forging-skills` | craft owner of THIS file — reforging `commanding-research-fleets/SKILL.md` fires there, not here. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/charters.md` | Full Director and PI charters: duties, prohibitions, artifact per prohibition | staffing a fleet; a role-boundary dispute |
| `references/researcher-types.md` | Researcher archetype table; Lab coordinator; the in-lab verification procedure (E4) | dispatching a Researcher; before a PI promotes a claim |
| `references/launch-and-order.md` | The seven-item launch checklist in full; the order-form shape; the thin-Director reply form | standing up a PI session; a Director writing an order or a reply |
| `references/vocabulary-and-law.md` | Retrieve/Search table; five stuck-question prompts + reject-words; the LAW-candidate table | a stalled PI; wording a stuck question; auditing a measurement failure |
