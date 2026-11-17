---
name: documenting-software
description: >-
  Writes, reorganizes and reviews software doc sets so readers can explain the mechanism and decide
  for themselves. Each reader question is answered on exactly one page; the coverage table has no
  unanswered question and no orphan page. Each page has one primary question, paragraphs of at most four
  sentences, prose tables of at most six columns and twelve rows (reference pages: own limits), and a state
  list or figure for stateful mechanisms. Provenance (run IDs, hashes, who checked what) stays on
  records pages; decision-relevant status (unverified, undecided, unimplemented) stays on reader pages. The entry page
  states guarantees, version and scope affirmatively and routes each reader to a first page. Derive
  reader questions, then coverage, then page responsibilities, then directories. Teach from a familiar
  problem through a worked input and result/refusal; examples stay within the source contract; mark
  inference and uncertainty. API reference serves lookup; it need not teach the whole system. Use for README, guides, API docs, specs and ADR/RFC.
---

# Documenting software

Own what the reader can understand, explain and decide after reading. Bridge their starting
knowledge to a usable model; derive its necessary questions without waiting for the user to ask.
A reader should reason through a new case without reconstructing meaning from internal IDs.

## Three principles

1. **Teach a model the reader can use.** Infer the task, starting knowledge and natural doubts.
   Start with a familiar problem; work a concrete input through the mechanism to its result or
   refusal, then change a condition to expose assumptions and limits. Adapt entry paths and depth
   to different backgrounds. This responsibility prescribes no universal lecture, audience
   preamble or diagram.
2. **Separate statements by what they govern.** A guarantee, a reason for a design, a chosen
   implementation technique, a contributor rule and an audit observation have different owners
   and change for different reasons. Separate mixed claims before assigning their homes. Link
   those homes through a useful explanation; do not merely rename the file or add scope warnings.
   A project-mandated implementation choice remains binding after relocation; changing its home
   does not authorize changing the requirement.
3. **Check the reader's conclusion against evidence.** Trace a representative decision or operation
   using only the permitted documents and their available context. Identify the actual wording
   behind a supposed defect, its consequence and the contract that contradicts or leaves it open.
   Credit boundaries that already prevent the mistake. Missing evidence is uncertainty, not proof
   that software is broken or a reference page needs a complete tutorial.

## Place information by responsibility

Use this distinction when material is mixed; it does not prescribe a directory tree or one file per row.

| Statement answers | Maintained home and connection |
|---|---|
| What must users/consumers be able to rely on? | Requirements or interface contract: inputs, outcomes, effects, refusal, limits and scope |
| How does the system work, and why this design? | Architecture/design explanation and decisions: responsibilities, runtime flow, alternatives, consequences |
| How is this particular mechanism implemented? | Implementation design or a focused decision: chosen library, algorithm, adapter, constraints and replacement conditions |
| How must contributors write and check code? | Contributor/coding/tool guidance: rule rationale, applicability, exceptions and the configuration/test that enforces it |
| What changed, or who observed what and when? | Change, audit or issue record: dated evidence, linked from the relevant claim when necessary; a status the reader must know (unverified, undecided, unimplemented) is also stated on the reader page |

For example, “reject data that does not match the approved schema” is a consumer guarantee;
“use this converter and type generator” is an implementation choice; “do not cast unvalidated
values to a trusted type” is a general coding rule. A syntax linter cannot by its existence prove
the consumer guarantee. Keep the invariant in the contract when relocating the implementation rule.

Keep platform and application scopes distinct. A library's operations are not the same set as one
application's business use cases. A logical responsibility is not a package or a runtime location.
State how they connect without presenting an application's policy as a library-wide restriction.

## Choose and connect the reader's path

Choose each page's reader question, intended understanding/action, concepts it owns and detail it
delegates before proposing files or directories. Broad readership needs connected paths with
different starting knowledge, not every topic on every page.

| Reader needs to | Build the path around |
|---|---|
| Decide whether to adopt | Audience/problem, reasons to choose or decline, dependencies/limits, evidence and a small trial; use `growing-oss-adoption` |
| Learn a first use | A bounded working example with prerequisites and a recognizable result |
| Complete a known task | Required input/setup, ordered actions, expected result and relevant recovery |
| Understand behavior | Concepts and boundaries, one concrete operation, effects/failure states and design trade-offs |
| Look up a contract | Scannable exact entries; API items start with a short summary, then details and contextual links |
| Understand a decision (decision record) | Context, chosen option, reasons and alternatives, consequences, status and unresolved questions |

For a stateful operation, connect actor/input, business decision, dependency, reads/signatures/writes,
completion and consequential failure. Explain which component supplies each capability and what the
caller must still provide. A component inventory or a Query/Mutation name is not this explanation.
An intended benefit is not a measured advantage; an adoption page must not invent competitor claims.

Preserve the distinction between an explanation and a reference. A narrow reference with a usable
example is legitimate; do not demand that it repeat the whole system. A conceptual page needs a
coherent answer even when the exact contract is elsewhere. An analogy must mark its limits.
Show enough local context for someone arriving from search; defer detail without hiding a constraint
that changes the adoption or action decision.

## Bound each page's load and keep the reader path clean

Before a set is published, measure the final draft of every page and include the measurements in the
output as a density table: page, page kind (prose or reference), primary question, largest table
(columns x rows), most sentences in one cell, most sentences in one paragraph. Any value over the limit of
its page kind is split, merged or rewritten, then measured again. Report the final values, not the first
draft. A page has exactly one kind, declared in the density table; a limit is changed by changing the
kind's rule here, not by a reason written on one page.

Every number below is provisional: a working default of this skill, not a measured threshold. Treat one as
firm only where a basis is cited beside it; change it by evidence, not per page.

- **Question**: one primary reader question per page. Answer a second question by linking, not on the page.
- **Paragraph** (both kinds): at most four sentences and one claim. Split a paragraph that mixes a mechanism step with a condition or exception.
- **Figure**: where a mechanism has states, ordering or branching, give a state list, sequence or diagram. A chain of arrows in prose does not replace it.

| Page kind | Table | Cell |
|---|---|---|
| Prose (guide, concept, architecture) | At most six columns and twelve rows; split by reader question | At most two sentences; move a longer explanation below the table or to a linked page |
| Reference (API, Query/field, option, error and status-code lookup) | Rows unbounded, at most six columns; one table per object or reader question, never a whole data model | One sentence |

Provenance stays on records pages: audit and review history, run IDs, hashes, commit references,
open-question logs, design comparisons, negotiation points, and first-person narration of who checked what
and when. Link the record from the claim that needs provenance (see the table above); do not copy its entries
into the page.

Status that changes what a reader will decide or do stays on the reader page, stated as a property of the
thing it qualifies: unverified, undecided, unimplemented, planned ("X is undecided"; "Y is not implemented").
Put it beside the claim or in a status column or row, without who, when or how. Moving a record page out of the
published set must not hide such a status; keep it on the reader page and link the record for provenance.
Test: would the reader choose differently if they knew? Then it is status; otherwise it is provenance.
Write reader pages as impersonal statements about the system.

An entry page passes when it affirmatively states what the set guarantees and its version and scope; gives
one concrete worked example or the adoption route; names each reader it serves with a first page for that
reader; lists every page with its question; and contains no process record. Negative limits belong beside the
statement they qualify, not as the page's opening.

A glossary serves the reader who meets an unfamiliar term: each entry gives the term, its meaning in this set
and the page that defines it. A writer's banned-synonym or wording list is an authoring tool and does not
belong on a reader page.

## Review before rewriting

In an explanatory or site review, include a short walkthrough of a concrete input and what follows
when a condition changes. Show where the reader must guess how it works, why it works that way,
or whether the changed case is supported. Derive these questions before giving a general score;
do not stop at checking existing headings or the user's examples. Read linked definitions and
limits within scope. Separate:

- a contradiction between explicit statements;
- a missing or hard-to-find explanation;
- a choice the contract genuinely leaves unspecified;
- an implementation observation not yet checked against its contract.

Lead findings with the blocked decision, cited location, consequence and acceptance condition.
A wording risk is a scoped reviewer judgment, not observed reader behavior. Do not demand new
behavior or every possible detail from a page with a narrower declared purpose.

Keep one authoritative home for a contract while allowing derived summaries and examples where
needed for understanding. Use meaningful link labels; internal IDs may remain in traceability fields
but must not substitute for definitions. Repetition and forward links serve the reader's path when they
are placed by the load limits above; judge length and density by those checks, not by taste. Prefer
repairing the explanation or reading order to accumulating disclaimers.

## Preserve precision and verify

Declare normative strength where needed to interpret requirements. State version and scope where
they affect use. Preserve source/decision history, but place editorial provenance outside the main
explanation unless it changes the immediate decision. No universal preamble, disclaimer or heading
order follows from those obligations.

Keep documentation with the code's version/review process; run its applicable checks. Name when and
how specification claims are checked against executable behavior. A link check, generated site or
test name proves neither reader understanding nor implementation correctness. Re-run the reader's
question after a change, plus a relevant boundary case. Keep rejected/withdrawn decisions when the
project's record policy requires them; disclose breaking changes before removal.

For a multi-page set, build a question x page coverage table before the set is called complete, and include
it in the output. List the reader questions of each named reader, one per row, and mark the single primary
page that answers each. Pass only when no question lacks a primary page and every page answers at least one
question. A question with no page is an uncovered finding; a page that answers none is an orphan to merge or
remove. Every page must also be reachable from an entry route.

Use `structuring-documents` for relocation and coherent section order, and `linting-prose` for direct,
plain, inclusive sentences. Preserve the user's requested scope and technical guarantees. Do not
invent authority, rationale, measurements or requirements to fill a documentation gap.

## Conditional sources and owners

Revision evidence, corpus identifiers and their limits are in `tests/20261112-revision.md`.
Description-only results cover the recorded tasks, not every body procedure; the shorter description
has not revalidated the earlier mixed-claim classification behavior.
The referenced source classification and audit do not establish reader effects or general
documentation quality. Local reader checks are operational guidance, not empirical findings.
In conditional references, XS-S means structural pattern, XS-D doctrine, XS-P inferred principle
candidate and XS-C scoped convention. These source judgments are not automatically adopted rules.

| Read | When |
|---|---|
| `references/normative-language.md` | Requirement levels, keyword marking or extension naming |
| `references/process-and-checks.md` | Source-specific kinds, templates, checks or cadence |
| `references/decision-record-layouts.md` | A named ADR/RFC/PEP lineage and status set |
| `references/api-doc-comments.md` | Rust, Python or Go API-comment conventions |
| `references/repository-documents.md` | Repository document placement and hosted-project requirements |
| `references/changelog-and-commit-grammars.md` | A declared change/commit grammar |
| `references/house-style-guides.md` | The project adopts a named ecosystem guide |
| `references/standards-scope.md` | A claim about ISO/IEC/IEEE standards; normative bodies are not covered |

Japanese notation has two owners. The engine is `linting-prose`'s machine floor (textlint
ja-technical-writing and prh). The policy (又は/または, とき/時, 書込/書き込み, katakana or Latin terms) is per
repository. When reorganizing a doc set, decide each notation once, record it as an entry in that repository's
own prh dictionary (replacing the floor's bundled prh-house.yml examples), and wire the floor as the gate over
the set. Follow its order ADOPT > CONFIGURE > AUTHOR: adopt a published preset or dictionary, configure rule
options, and author an entry only for a decision neither covers. This skill does not restate the rules; it
decides only whether a term or gloss serves the reader.

Source conventions apply only in their stated ecosystem; do not turn a template into a standard.
Version-number semantics belong to `designing-version-schemes`; memo cover/authority to
`issuing-technical-memoranda`; research-document lifecycle to `governing-research-documentation`;
corpus judgment to `systematizing-knowledge`; CLI contract content to `designing-cli-contracts`;
docs build/CI wiring to `wiring-repositories` and `wiring-mise-tasks`. Skill changes belong to
`forging-skills`, which owns their evidence and proportional verification.
