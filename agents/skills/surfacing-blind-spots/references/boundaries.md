# Boundaries — SOLE detailed home of sibling cuts

> **Scope**: decide who owns the next operation. The parent SKILL.md carries the short routing
> surface; this file owns the rationale, handoff payload, and negative space. The canonical
> question is: **are we excavating premises in one existing artifact, or changing/acting on what
> that artifact says?**

## Runtime cuts

| Sibling | Typed cut | Handoff from this skill |
|---|---|---|
| `directing-research` | **PURPOSE** — construct, compare, select, or steer research frames/programs → there. Excavate hidden premises in one already-articulated frame or program artifact → here. | Send `Decision at stake`, affected `Assumption ledger` rows, `Discoveries`, and `Open-set residual` when frame damage is `FRAME` or program choice must reopen. |
| `forging-novel-theses` | **PURPOSE** — generate structurally distinct thesis candidates for a selected frame → there. Expose what the selected frame presupposes without generating a candidate → here. | Enter generation only when `Handoff` names it. Human-tacit seeds come solely from answered probe rows whose provenance is `HUMAN:<owner>@<attestation-locus>`. |
| `raising-resolution` | **DECISIVE by time/evidence** — inspect whether a present fact, claim, source, or artifact is true → there. Identify which hidden premise requires that inspection → here. | Send the assumption ID, exact present-tense claim, available locator, and missing evidence. Do not report an `INFERENCE` row as inspected fact. |
| `acting-on-hypotheses` | **PURPOSE** — map and test one expensive/irreversible load-bearing forward bet, prewrite its threshold, or decide commit/pivot/kill → there. A cheap deterministic reversible probe with no downstream exposure uses the domain/plain executor. Surface premises before either operation → here. | Send `Decision at stake`, the load-bearing row, and the affected discriminator. Do not design the experiment or threshold here. |
| `systematizing-knowledge` | **OBJECT/PURPOSE** — synthesize many sources into a field position → there. Expose premises in one already-written review protocol or evidence map without synthesizing the corpus → here. | Send affected ledger/protocol rows; do not adjudicate studies here. |
| `arguing-research-papers` | **PURPOSE** — appraise, calibrate, position, review, or rebut a written paper claim → there. Emit only a premise packet for one manuscript artifact, with no claim verdict → here. | Send premise rows and provenance; the paper owner decides claim damage. |
| `forging-skills` | **PURPOSE** — create, audit, or reforge an Agent Skill → there. A skill-craft task may ask this skill for a premise-only sub-pass only after `forging-skills` fixes the artifact and decision. | Return the packet to the craft owner; do not change SKILL.md or decide its boundary here. |
| `orchestrating-agents` | **PURPOSE** — agent roles, visibility, topology, barriers, and acceptance authority → there. Domain premise excavation and human questions → here. | Send the artifact, independent evidence surfaces, and required return locators. No agent may stand in for the human owner. |

These seams agree in substance with sibling descriptions; do not require byte-identical wording.
Recheck this file when any sibling's runtime question changes.

## `/dig` seam

`/dig` is a design source, not a collection owner. Its context-first and depth-following
interview pattern informs this skill. This skill deliberately removes three broader behaviors:

1. it does not claim completeness after a checklist;
2. it does not write solutions or decisions back into the source plan;
3. it does not own lateral generation.

Premise excavation stays here. New research-frame construction routes to `directing-research`;
new thesis generation routes to `forging-novel-theses`.

## Handoff rules

1. Name one next owner, or `NONE`.
2. Name the exact packet fields the owner may consume.
3. Preserve provenance. `INFERENCE`, `HUMAN:<owner>@<attestation-locus>`, and `ARTIFACT:<locus>` are not
   interchangeable.
4. Preserve `UNELICITED`; a downstream skill may ask the human, but may not fill the slot.
5. Preserve **OPEN — NON-EXHAUSTIVE**. A downstream route does not retroactively close the set.

## Existing transfer-artifact audit

When the object under review is a transfer candidate or `MAPPING-BREAK`, this skill audits only what
that artifact already claims. Its four load-bearing inspection lenses are:

| Slot | Audit question | Handoff field |
|---|---|---|
| **OBJECT** | Which donor/target role, unit, or boundary was silently omitted? | affected assumption row + artifact locator |
| **RELATION** | Which claimed preserved relation or correspondence is merely assumed? | affected invariant/correspondence premise |
| **REGIME** | Which precondition, scale, precision-loss, or failure regime is absent? | boundary row + provenance |
| **OBSERVATION** | What target-side signal is missing, disputed, or still `UNTESTED`? | target-evidence row + locator or `UNELICITED`/`NONE` |

Do not create a correspondence map, select a donor, repair a `MAPPING-BREAK`, or decide whether the
target claim holds. Hand the premise packet to `forging-novel-theses` for mapping/break work or to
`acting-on-hypotheses` for a selected hard-gated target test. This is a house audit profile, not a
claim that the four slots are exhaustive or empirically sufficient.

## Near-miss examples

| Ask | Owner | Why not here |
|---|---|---|
| “Invent three alternative framings of this research area.” | `directing-research` | the output changes/constructs frames |
| “Use the hidden premise to propose a novel mechanism.” | `forging-novel-theses` | the output is a thesis candidate |
| “Check whether the cited benchmark actually measured latency.” | `raising-resolution` | the task is present-fact inspection |
| “Design a precommitted kill test for this expensive/irreversible bet.” | `acting-on-hypotheses` | the hard gate fires and the task commits to a threshold |
| “Run this deterministic 30-second reversible check.” | domain/plain executor | no AOH hard gate; return the observed result to the domain owner |
| “Review whether this paper's governing claim is overclaimed.” | `arguing-research-papers` | the output is a paper-claim verdict, not premise-only exposure |
| “Turn these 40 papers into an evidence map.” | `systematizing-knowledge` | the object is a corpus |
| “Audit and reforge this SKILL.md.” | `forging-skills` | skill craft owns the decision and edits |
| “Have five agents independently brainstorm omissions.” | `orchestrating-agents` after this skill fixes the domain packet | topology and independence are the requested decision |

## Boundary failure predicates

This skill has leaked ownership if its packet contains:

- a newly selected research frame or program;
- a thesis claim or solution candidate;
- an asserted present fact without inspection provenance;
- a test threshold or commit/pivot/kill verdict;
- an agent-role contract;
- a simulated human answer.
