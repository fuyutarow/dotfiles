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

Run both set-level checks before a multi-page set is called complete. Record each check's table in the output.
A check passes only when its pass condition holds for every row.

**F — fact consistency.** A fact is any claim a reader can take from more than one place: a value, guarantee,
effect, status, signature, definition, version or scope. Summaries, status tables, glossary entries and examples count.
1. Run the statement scan over the published set (materialize its Markdown and TOML pages in one directory):
   `bun scripts/fact-scan.ts <doc-dir> --glossary <glossary-file> > scan.md` (paths relative to this skill's directory)
   The unit is a statement: one sentence or table row that states (a) a number with a unit, (b) a status word
   (未確認 未決 未実装 実装済み 予定 解消済み 欠落 決まっていない していません していない unverified undecided unimplemented implemented planned deprecated resolved missing "not yet" "not decided") with the subject
   it qualifies, or (c) a definition ("X は … です", "X とは", "X: …", "X is a …", a glossary row). A table cell is grouped under its row label (and its column header when the label alone is ambiguous); a cell in a status column counts as a status; a reference-table row names its term, so each line that mentions a CamelCase term joins its row. A sentence that states N items (N つ/個/件/項目/items/steps) yields a count-vs-enumeration row when the list or table right after it has a different number of entries. Statements are
   grouped by subject: for a number, the noun phrase before it, its unit family (time, size, or the unit itself;
   no conversion) and each glossary term in the sentence; for a status, the row label or sentence subject, the names
   around it (glossary terms, Latin identifiers, the previous sentence) and a TOML table's name; for a definition,
   the defined term, a glossary term or alias that is the sentence topic or row label. Subjects drop particles and
   case. A group found in two or more files is one row: subject, kinds, location count and each statement with its file:line.
   A word occurrence is not a statement: a glossary headword alone makes no row. stderr gives the group count and the
   total location count. Keep the table as the record of this step. An empty table is a valid result. The scan does
   not judge, and a fact whose sentence the subject rules miss is the hand pass's.
   Bound each judge by locations, not rows: `--max-locations <m>` packs contiguous groups (stable order) so a shard
   has at most m locations, reports every shard's location count on stderr and puts a group larger than m in a shard
   of its own, reported there. Save each shard with `--shard <k>`. Measure the first shard's locations judged per
   minute and set m so that a judge finishes within 600 s; start at m = 150 when nothing is measured.
   Term check (separate; F does not judge it): `--terms --glossary <glossary-file>` prints, per glossary headword,
   every file:line where it occurs, as input for a check of each use against the glossary entry.
2. Judge each row in a judgment table (Markdown, one row per judged location, eight columns):
   `row term | fact | scope | owner (file:line) | location (file:line) | verdict | quote of owner | quote of location`.
   Name one owning page for the fact. `scope` gives the subject, scope and time both statements are about:
   `same` when they agree, otherwise `differs: <owner's scope> / <location's scope>`.
   The verdict is `mismatch` only when both statements are about the same subject, scope and time and their values
   (value, predicate: guarantee or effect, status, or definition) cannot both hold, even when it is not yet clear which
   is right. It is also `mismatch` when the location states the same fact without linking and the values cannot both hold.
   - A summary that only omits detail is `match`. A summary that drops a limiting condition and so widens a guarantee is `mismatch`.
     Positive example (mismatch): owner "Retries happen only on 503 responses, up to 3 attempts." / location "Requests are retried on failure." Both limits are dropped.
     Negative example (match): owner "The retry policy is set in `retry.toml`: up to 3 attempts, on 503 responses only." / location "Retries follow `retry.toml`." The location omits detail and conflicts with nothing.
   - When `scope` says `differs`, the verdict is not `mismatch`: use `match`, or `qualifier-omitted` when the location links to the owner and omits a qualifier.
   - A difference of sense for one word (the same word used in two senses) is verdict `to-T`. It is carried to check T's table, not dropped.
   `qualifier-omitted` when it links to the owner and only omits a qualifier (not a defect); otherwise `match`.
   A judged row has every one of its locations judged (each is the judged location or the owner), each with a
   verdict, file:line on both sides and a quote of the statement on both sides. A row without a quote is
   unjudged: a verdict alone is not a judgment. Decide the owner per fact, not per shard or per term. When a location is a table row, compare every cell of that row with the owner, not only the subject cell.
   - Sharded tables: one judge per shard, in parallel, each within 600 s. A judge validates its own shard
     (`bun scripts/fact-judgments.ts --scan shard-<k>.md --docs <doc-dir> [--glossary <glossary-file>] judgments-<k>.md`)
     and reports only when it exits 0; a record that does not validate is not a judgment.
   - Hand pass (a fact outside the scan's statement shapes is not in it): read every sentence that states a
     guarantee, a refusal, who can read or write something, or a status. Compare each with the other pages that
     state the same thing, and record the comparison in the same table with row term `(hand)`. This pass covers those
     four kinds and enforcement sentences (below).
     An enforcement sentence says that something is enforced, checked, guaranteed or judged (強制・検査・保証・判定;
     enforce, check, guarantee, judge). It is a defect unless it names the component where that happens, the actor who
     performs it, and who can bypass it (or says that nobody can). Record each such sentence as a `(hand)` row whose owner
     and location are that same line, with verdict `mismatch` and fact `enforcement claim without component, actor or bypass`.
     Remove the row once the sentence names all three.
3. Pass: run `bun scripts/fact-judgments.ts --scan scan.md --docs <doc-dir> [--glossary <glossary-file>] judgments-*.md`.
   It must exit 0: judged = total, every judgment row complete with its quotes found on the cited lines, and no
   location given two owners for the same fact. The validator also rejects a `mismatch` whose `scope` says `differs`.
   For each owner conflict, decide the one owner per fact and correct the rows. Then correct every `mismatch` in the
   pages, re-run step 1, delete the judgment rows whose quotes no longer occur, judge the rows the validator lists as
   unjudged, and run it with `--closed` until it exits 0 (no mismatch left). `to-T` rows are complete judgments and do
   not fail the gate; the validator prints their count and lists them for check T. `--closed` fails on `mismatch` only.
   Report F as done only with that final output (its judged/total line, the to-T count and exit status).

**E — example contract.** Every operation, field and argument an example calls must exist in the contract it cites.
1. For each example, list each call, field and argument, and the contract it cites.
2. Resolve each name against the declaration source of that contract (its schema, interface or signature file), not
   against prose describing it. Use a lookup that prints the declaration, and record the declaration found.
3. Pass: each call resolves to one declaration whose arguments match in count, order and required context (such as a
   session or handle). An undefined name, a missing required argument or an extra argument is a defect. Correct the
   example or the contract, and record which one changed.
4. An example whose contract is outside the set's sources is marked unverified, not passed. A name the example
   uses that the contract does not declare may be marked disclosed only with a verdict row that quotes the
   disclosure line (file:line and the quoted text); the undeclared name must appear in that quoted line. A
   disclosure that does not name it leaves the example unverified.
5. Also report the names the contract omits (contract-side gaps): each operation, field or argument that the
   set's examples or pages use as part of the contract but its declaration source does not declare, with the cited line.

**T — term mapping.** One term keeps one sense and one name across the set: body text, navigation labels,
page titles, headings and the repository's own conventions agree, or the page qualifies the other sense at each use.
1. Run the listing over the published set, with the glossary, the navigation config and each convention file or directory
   (paths relative to this skill's directory):
   `bun scripts/term-scan.ts <doc-dir> --glossary <glossary-file> [--labels <nav-config>] [--convention <file-or-dir>]... [--max-units <m> --shard <k>] > terms.md`
   The listing has three kinds of unit. (a) A glossary headword's body uses, one unit per (term, file), with the count and up
   to two representative lines. (b) Each label, title, heading or convention line, as its own unit. A label's name also
   gets its body group, so the label is judged against the page that holds it. (c) A variant cluster: names that normalize
   to one key (case folded, separators removed, a loanword table such as サーバー/server) or share a head word with a bare
   name (CoralbaseCore, move/core and 鍵 server join core and server). A name differing from another only by case is not a
   cluster. Non-glossary names get no body groups otherwise. stderr gives the unit total, its breakdown (glossary body groups,
   label-linked body groups, label/title/heading rows, convention rows, variant clusters) and the cluster count. The listing
   does not judge. Kanji-only terms without a glossary entry are not listed; read the labels and headings for them.
2. Judge each unit into a table with the columns `term | sense | page:line | quote | defect kind`. A body group is judged once
   per file and its `sense` covers every use in that file; `page:line` is its first line. A label, title, heading or convention
   unit is judged on its own line. A variant cluster is one unit: its candidate defect kind is `two names for one referent`,
   and the judge confirms it or splits it, with the files and counts listed in the row. The defect kind is one of: `two senses
   unqualified` (one name carries two senses and the use does not qualify which); `two names for one referent` (one referent
   has two or more names in the set); `clash with upstream or convention` (the use's sense differs from the upstream
   specification or a named convention file for the same name); `label contradicts content or facts` (a navigation label,
   title or heading names a kind, audience, license or availability that the page's content or stated facts contradict); or
   `—` when the use has none of these. A label passes only if it matches the content's kind and the stated facts.
   Shard the units by `--max-units <m>`: one judge per shard, each within 600 s, validated against its own shard. Start at
   m = 150 when nothing is measured; after the first shard, measure units judged per minute and set m so that a judge
   finishes within 600 s.
3. Pass: every unit's defect kind is `—`, or it is corrected in the page, the label or the convention reference. Correct,
   re-run step 1, and re-judge the changed units. Report T as done with the total unit count, the breakdown on stderr and
   the judged table's defect count. T is a set-level check; run it with F and E before a multi-page set is called complete.

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
