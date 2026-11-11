---
name: documenting-software
description: >-
  Designs, lays out and reviews professional software documentation and specifications: picks the
  document kind from the reader's need (learning, task, reference, understanding), lays out its
  sections, declares normative strength, keeps documents with the code, and writes specs and
  decision records. Use for README/guide/API reference/spec/ADR/RFC work: 技術文書, 仕様書, 設計決定記録,
  文書の種類, 適合性, 要求レベル, どの文書を書くべきか. Cuts: one memo's cover/authority/addressee →
  issuing-technical-memoranda; one document's section graph → structuring-documents; sentence wording
  → linting-prose; version-number semantics → designing-version-schemes; corpus synthesis →
  systematizing-knowledge; document portfolio → governing-research-documentation; CI wiring →
  wiring-repositories. English skill; respond in the user's language.
---

# Documenting software

Scope: the documents and specifications that describe software for its readers — kind, sections,
normative strength, placement with the code, specifications, and decision records. Each rule below
cites the row of the cross-source classification it rests on.

**XS** is the cross-source classification of software documentation and specification findings
(sok_id `01a1cb81-242a-711a-bbd1-bba3e95f2270`; its claim ledger has the same sok_id). Row ids are
`XS-P` principles, `XS-D` doctrines, `XS-S` skeletons and `XS-C` conventions. Its limits bind this
skill: the six source documents it classifies declare themselves guidance or templates unless they
say otherwise; the ISO/IEC/IEEE normative bodies were not read; no source measures that following a
rule improves a document. This skill claims no measured effect, no adoption and no standard status.

## The law — principles (XS-P)

1. Name the reader and the reader's need before choosing a kind, sections or words. [XS-P02]
2. State the document's own normative strength; do not leave it to the reader to infer. [XS-P01]
3. Keep one home for each fact; elsewhere, link to that home. [XS-P03]
4. Keep the document in the same version control and review path as the code it describes, and pass
   it through automatic checks before it is taken in. [XS-P04]
5. Check a specification's claims with an executable test or implementation at a stage the document
   names. [XS-P05]
6. Record a decision with its context and its rationale, including the alternatives considered. [XS-P06]
7. A document about a versioned thing states the version it describes and its scope. [XS-P07]
8. A change that harms readers is named in the record the readers see before the thing is removed. [XS-P08]
9. Write sentences addressed directly to the reader, active voice first, plainly. Sentence-level
   edits go to `linting-prose`. [XS-P09]
10. Choose words that do not exclude readers by culture, gender or ability. [XS-P10]

The principles are the single law of this skill. Where a doctrine, skeleton or convention seems to
conflict with them, the principle governs and the conflict is reported.

## Priority orderings for conflicting goods (XS-D)

- **Teaching and doing are separate documents.** When a learner's need and a doer's need compete
  for one page, split the page; do not subordinate one need to the other. [XS-D01] The source
  that states this is a template set, so treat it as guidance, not a standard.
- **Change freedom ranks above the stability promise until adoption; the promise ranks above
  change after adoption.** Before a feature is adopted, change and feedback come first; once adopted,
  the stated contract is frozen. Where a status ladder exists, the document names the rung it is on
  and what changes at the next one. [XS-D02] The order is explicit in one source and read from the
  stage descriptions in the other.

## Document kinds and their skeletons (XS-S)

Choose the kind from the reader's need, then lay out sections as below. The four-way split is the
cross-source core; the names of its members vary by source, so state the name you use and do not
map names across sources as if they were equal. [XS-S01]

| Kind (reader's need) | Section layout | Row |
|---|---|---|
| Learning — a guided first success | Kind only; the classification gives no section layout for it | [XS-S01] |
| Task — a goal the reader already has | Purpose or overview first, then numbered ordered steps | [XS-S03] |
| Reference — look up an interface element | Structured, scannable entries, one per item (setting, field, command, endpoint) | [XS-S02] |
| Understanding — why the system is as it is | Kind only; the classification gives no section layout for it | [XS-S01] |
| Decision record — why a choice was made | Context or motivation; decision or specification; rationale and alternatives considered; status; open questions | [XS-S04] |
| Version change record | Entries under a version heading or date, noting notable changes | [XS-S05] |
| API item | One-sentence summary first, detail after | [XS-S06] |

Notes that bind the table:

- A learning document and a task document are separate even when they cover the same feature. [XS-D01]
- The decision-record headings are a cross-source pattern, not one author's standard. Sources that
  give them do not all use the same names; state yours. [XS-S04]
- An internal memo that is a decision record gets its wrapper from `issuing-technical-memoranda` and
  its body layout from the decision-record row here. Do not extend that to memos that are not
  decision records. [XS-S04]

## Declared choices where the sources disagree

The sources disagree on the points below. The writer must make the choice and declare it in the
document (a conformance or conventions line). Do not take a source's answer as the default for the
whole house. [XS-P01 through XS-P09, XS-S01, XS-S04, XS-S06]

| Point | Choose and declare | Read |
|---|---|---|
| Keyword marking for requirement levels | the keyword set and its marking | `references/normative-language.md` |
| Version-number patch meaning | the semantics; they are owned elsewhere | `designing-version-schemes` |
| Kind names and their correspondence | the kind names used | `references/process-and-checks.md` |
| Decision status values | the value set of this document; do not map to another source's set | `references/decision-record-layouts.md` |
| When a test is required in a proposal | the stage at which the check is required | this file, principle 5 |
| Summary-line form for API items | the form of the language in use | `references/api-doc-comments.md` |
| Passive voice | the house rule; the sentence check is `linting-prose` | `linting-prose` |
| Changelog grouping | the category set of the repository | `references/changelog-and-commit-grammars.md` |
| Same organization, different strengths | the source a rule is taken from, named | the reference of that ecosystem |
| Version of a cited standard | the version cited, with its date | `references/standards-scope.md` |

## Procedure

1. Name the reader and the need (principle 1). If several readers need different things, plan
   separate documents (XS-D01).
2. Choose the kind from the table, then write the skeleton's sections in order.
3. State normative strength in the document (principle 2). If you use requirement keywords, read
   `references/normative-language.md`.
4. Place each fact once. Cross-references point to that home (principle 3). Keep the document in
   the code's version control and checks (principle 4).
5. For a specification, name the stage at which each claim is checked and how (principle 5).
6. For a decision record, record context, rationale, alternatives, status and open questions
   (principle 6). Keep withdrawn and rejected records (`references/decision-record-layouts.md`).
7. For a versioned document, state the version and scope (principle 7). Before removing something
   readers use, name the removal in the record they read (principle 8).
8. Check sentences for direct address and inclusive words (principles 9–10); the sentence pass is
   `linting-prose`.
9. Read a reference for an ecosystem only when that ecosystem applies (table below).

## References — read only when the condition holds

| File | Read when |
|---|---|
| `references/normative-language.md` | writing a specification or conformance section with requirement levels, or extension naming |
| `references/changelog-and-commit-grammars.md` | the repository declares a changelog or commit-message grammar |
| `references/repository-documents.md` | creating repository-level README, contribution or security documents for a hosted or OpenSSF-targeted project |
| `references/api-doc-comments.md` | writing doc comments for Rust, Python or Go code |
| `references/house-style-guides.md` | writing for a named style guide (Kubernetes, MDN, Django, Google, GitLab) |
| `references/decision-record-layouts.md` | writing an ADR, RFC or PEP-style record in a named lineage |
| `references/process-and-checks.md` | deciding a document's kind names, checks, update cadence or template use |
| `references/standards-scope.md` | citing an ISO/IEC/IEEE document |

Conventions in these files are single-source unless labelled otherwise. Apply a convention only in
its ecosystem; do not restate it as a general rule.

## Boundaries with neighbouring skills

| Ask or part of a document | Owner | Seam with this skill |
|---|---|---|
| Cover, authority line, addressee, release of one internal memo | `issuing-technical-memoranda` | the wrapper is theirs; the decision-record section layout is ours, applied inside a memo only when it is a decision record |
| Section graph of one document: MECE, backward references, moving facts | `structuring-documents` | principle 3 here states the single-home rule; the move of content is theirs |
| Sentence, word, register, tone edits in place | `linting-prose` | principles 9–10 are here as reader rules; the rewrite is theirs |
| Version-number semantics, compatibility, release order, ranges | `designing-version-schemes` | principle 7 requires the version and scope; what the numbers mean is theirs |
| Synthesising a source corpus into a position | `systematizing-knowledge` | this skill documents software; it does not synthesise literature |
| Admission, authority, retirement or deletion of a document portfolio | `governing-research-documentation` | lifecycle of a document set is theirs |
| Content and grammar of a CLI's contract | `designing-cli-contracts` | a reference-kind layout (XS-S02) for its items is ours |
| Docs build, CI and hook wiring for a repository | `wiring-repositories`, `wiring-mise-tasks` | principle 4 is ours: the document lives with the code and passes checks; the wiring is theirs |
| Slides and decks | `designing-presentations` | not documentation in this sense |
| Trade-offs among distributed actors who cannot confer | `codifying-doctrine` | doctrines here are orderings of goods inside one document |
| Japanese prose mechanics and the 木下 workflow | `writing-technical-japanese` | that entrypoint dispatches to the owners above |
| Writing or revising a skill file | `forging-skills` | a skill is not a software document of this kind |

## Limits

- This skill does not decide whether a given document conforms to a rule; a source states only what
  it states.
- A row's reason is often an inference the classification records; a principle is a candidate
  proposition, not a required practice of any project.
- No effect of these rules on document quality or adoption is claimed or measured.
