---
name: documenting-software
description: >-
  Writes, reorganizes and reviews software doc sets readership first. Start from a job map, not the page
  inventory: for each reader, the jobs they come to do in order (start, try, decide or build, run, look
  up). The table of contents is that map, named by job, never by the writer's taxonomy (layers, packages,
  page kinds, record types). A task is a numbered path of pages, one step each, titled by the action
  ("Install the CLI", not "CLI setup"), each step written for it, ending with the next step; nesting is at most two levels and collapsed by default except the current
  page's group. A page that serves no step or decision stays off reader navigation, on a reference
  shelf listed last. Each page answers its job in its first two to four sentences. Separating contracts,
  decisions and records (SoC) decides where a statement is maintained, not what readers navigate. Accept
  a set only when a reader given just the navigation and each page's opening finds where to start and
  where to go next. Use for README, guides, API docs, specs and ADR/RFC.
---

# Documenting software

Own what the reader can do after reading. Three principles decide every structure question; the rest of
this file applies them.

## Three principles

1. **Readership first: navigate by the reader's job.** List the readers, the jobs each comes to do, and
   the order of those jobs (start → try → decide or build → look up). The table of contents is that order.
   Name entries by the job: a verb phrase for a step, the reader's question for a decision. Nest only a
   sequential task, one step per page, ending with the next step; a step with its own sub-steps (install
   on each OS) may nest one level more, never deeper. Nested groups are collapsed by default, and only the
   group holding the current page opens, so the top level stays one screen. Add entries from prior knowledge
   ("coming from X") when readers arrive with it. Layers, packages, page kinds and record types are the
   writer's categories; they never appear as navigation for readers. Start from the job map, not from the
   existing pages: sorting every page under a job is still an inventory. A page that serves no step or
   decision stays off reader navigation, on a reference shelf listed last; a missing step is written.
2. **Separate concerns for maintenance, not for reading (SoC).** A guarantee, a design reason, an
   implementation choice, a contributor rule and an audit record have different owners and change for
   different reasons, so each has one maintained home. That decides where a statement lives. A reader
   page states the conclusion in its own words and links the home for detail; it does not reproduce the
   home's structure. The reference shelf may be organized by system and sits last, for lookup.
3. **Check with a reader whose attention is limited.** Give an independent reader only the navigation
   and each page's first sentences, and the reader's job. Pass when the reader names where to start, what
   to do there and where to go next, without guessing. Reachability, coverage and fact checks are
   necessary and never sufficient: a set can pass every one of them with the writer's taxonomy as its
   table of contents.

## Design the job map before any page

1. Name each reader by what they come to do, with their starting knowledge.
2. For each reader, write the jobs in order. A job that is a sequence of actions becomes a numbered path;
   a job that is a choice becomes a page whose first sentences answer it and whose table compares the
   options by "what it is" and "when to use it".
3. Write the table of contents from the job map. Check it against principle 1 before writing pages: an
   entry named after a layer, package or page kind is a defect.
4. Write each page so its first two to four sentences answer its job. Send a reader who lacks a
   prerequisite to it first ("new to X? start with Y, then come back").
5. Only then place each statement in its maintained home (principle 2) and link it.

A worked model (docs.sui.io, read 2026-11-26): the getting-started navigation nests only "Hello, World!",
whose children are steps titled by verbs (Install Sui, Configure a Sui Client, Create a Sui Address, Get SUI
from Faucet, Build and Publish a Package, Connect a Frontend, Next Steps); the other entries are single pages
named by job, with "Ethereum → Sui" and "Solana → Sui" as entries from prior knowledge. The Sui Stack page
answers "what is it" in its first sentences, then gives one table: component, what it is, when to use it.

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
output as a density table: page, page kind (prose or reference), primary question, body characters, total table rows, headings, figures, largest table
(columns x rows), most sentences in one cell, most sentences in one paragraph. Body characters count the
page's text outside front matter and code blocks, tables included. Any value over the limit of its page kind is split, merged or rewritten, then measured again. Report the final values, not the first
draft. A page has exactly one kind, declared in the density table; a limit is changed by changing the
kind's rule here, not by a reason written on one page.

Every number below, including the page totals, is provisional: a working default of this skill, not a measured threshold. The reviewer's 9,000-character page (body and tables together) is the observed failure that motivated the totals, not a measured basis for their values. Treat one as
firm only where a basis is cited beside it; change it by evidence, not per page.

- **Question**: one primary reader question per page. Answer a second question by linking, not on the page.
- **Paragraph** (both kinds): at most four sentences and one claim. Split a paragraph that mixes a mechanism step with a condition or exception.
- **Figure**: where a mechanism has states, ordering, branching, concept relations or an enforcement boundary, give a state list, sequence or figure. A chain of arrows in prose does not replace it. Each figure passes four tests in `references/figure-tests.md`, loaded only when the set has figures: (a) the figure-only reader test: a reader of the title, the two-sentence conclusion and one figure can state the page's claim; (b) headings name parts of the figure; (c) no figure is drawn twice in the set, and the owning page draws it while others link to it; (d) box and edge labels use the reader's words, not internal IDs.

| Page kind | Body characters | Total table rows | Headings | Largest table | Cell |
|---|---|---|---|---|---|
| Prose (guide, concept, architecture) | At most 4,000 | At most 24 (two 12-row tables); split by reader question | At most 8 | At most six columns and twelve rows | At most two sentences; move a longer explanation below the table or to a linked page |
| Reference (API, Query/field, option, error and status-code lookup) | At most 12,000 | Unbounded | At most 20 | At most six columns; one table per object or reader question, never a whole data model | One sentence |

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
needed for understanding; set-level checks F and E under "Preserve precision and verify" test each
restatement and example against it. Use meaningful link labels; internal IDs may remain in traceability fields
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

Coverage has a second route, because reader questions cannot surface a topic no reader thought to ask about. Load
`references/topic-checklists.md` at this step only. Pick the set's document kind (platform/SDK or application/product),
then add each item of that kind's checklist to the same table: its row names the page that satisfies the item, or
`not needed: <reason>` where the reason is a property of this set. An unmapped item is an uncovered finding, like an
unanswered question. Pass only when both routes hold.

Before a multi-page set is called complete, run the set-level checks F (fact consistency), E (example contract)
and T (term mapping) in `references/set-checks.md`. They test consistency; they do not test principle 1.
Their tools are `scripts/fact-scan.ts`, `scripts/fact-judgments.ts` and `scripts/term-scan.ts`.

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
| `references/topic-checklists.md` | Coverage check of a multi-page set: the platform/SDK or application/product checklist items |
| `references/figure-tests.md` | The set has figures (diagram, state list drawn as a figure, concept map or enforcement boundary): the four figure tests with procedures and examples |

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
