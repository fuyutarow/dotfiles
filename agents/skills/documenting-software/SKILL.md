---
name: documenting-software
description: >-
  Designs/reviews software docs and specs for reader decisions. Before rearranging a mixed
  paragraph, classify each claim: consumer guarantee, implementation/design choice, contributor
  coding/lint rule, or editorial record. Choosing a converter is implementation design; banning
  unsafe casts is coding policy; rejecting invalid input is a guarantee. Preserve binding rules
  when relocating them. Begin with the technical answer; move audience/kind/review-baseline
  bookkeeping out of its way. Report supported reader consequences, not missing checkboxes.
  Respect an exact API reference's declared scope: no demand for client initialization or a full
  tutorial unless its intended task needs them. Use for README, guides, API docs, specs and ADR/RFC.
  Adoption: growing-oss-adoption; structure: structuring-documents; prose: linting-prose.
---

# Documenting software

A reader should be able to make the intended decision using the document: whether the software
fits, how to use it, what it guarantees, or why it is designed this way. Begin with that answer.
Do not make the reader interpret your editorial process or reconstruct meaning from requirement IDs.

## Three principles

1. **Write for a decision, not a checklist.** Identify the reader's task and starting knowledge,
   then give the necessary concepts, example and next step. A heading, audience label, diagram,
   link or passing build is useful only insofar as it supports that task. Naming the reader is an
   authoring decision; it need not become a ritual sentence at the top of every page.
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
| What changed, was observed, or remains unresolved? | Change, audit or issue record: dated evidence and status, linked from the relevant claim when necessary |

For example, “reject data that does not match the approved schema” is a consumer guarantee;
“use this converter and type generator” is an implementation choice; “do not cast unvalidated
values to a trusted type” is a general coding rule. A syntax linter cannot by its existence prove
the consumer guarantee. Keep the invariant in the contract when relocating the implementation rule.

Keep platform and application scopes distinct. A library's operations are not the same set as one
application's business use cases. A logical responsibility is not a package or a runtime location.
State how they connect without presenting an application's policy as a library-wide restriction.

## Choose and connect the reader's path

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

## Review before rewriting

Start with a concrete reader question, not a general score. Read the relevant path, including linked
limits within the allowed scope. State what can be answered and where you must infer. Separate:

- a contradiction between explicit statements;
- a missing or hard-to-find explanation;
- a choice the contract genuinely leaves unspecified;
- an implementation observation not yet checked against its contract.

Lead findings with the blocked decision, cited location, reader consequence and acceptance condition.
A claim that the wording could mislead is a scoped reviewer judgment, not measured reader behavior.
Read the linked definitions and limits before escalating a finding. Avoid demanding
new behavior or every possible detail from a page with a narrower declared purpose.

Keep one authoritative home for a contract while allowing derived summaries and examples where
needed for understanding. Use meaningful link labels; internal IDs may remain in traceability fields
but must not substitute for definitions. Length, tables, repetition and forward links are not defects
on their own. Prefer repairing the explanation or reading order to accumulating disclaimers.

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

Use `structuring-documents` for relocation and coherent section order, and `linting-prose` for direct,
plain, inclusive sentences. Preserve the user's requested scope and technical guarantees. Do not
invent authority, rationale, measurements or requirements to fill a documentation gap.

## Conditional sources and owners

The evidence and local derivations for this revision are recorded in `tests/20261112-revision.md`.
The bounded derivation audit is sok_id `01a1ce2b-73bf-7019-8606-780aca6bc7b5`, a published draft
with semantic review not performed; its ledger-based conclusions do not establish reader effects.
The legacy XS classification is sok_id `01a1cb81-242a-711a-bbd1-bba3e95f2270`. It classifies source
recurrence and scope, not measured documentation quality. Local responsibility and reader checks
are operational guidance; do not attribute them to an unread standard or claim empirical benefit.
In the conditional references, XS-S identifies a structural pattern, XS-D a doctrine, XS-P an
inferred principle candidate and XS-C a scoped convention in that classification. These labels
identify source judgments, not requirements automatically adopted by this skill.

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

Source conventions apply only in their stated ecosystem; do not turn a template into a standard.
Version-number semantics belong to `designing-version-schemes`; memo cover/authority to
`issuing-technical-memoranda`; research-document lifecycle to `governing-research-documentation`;
corpus judgment to `systematizing-knowledge`; CLI contract content to `designing-cli-contracts`;
docs build/CI wiring to `wiring-repositories` and `wiring-mise-tasks`. Skill changes belong to
`forging-skills`, which owns their evidence and proportional verification.
