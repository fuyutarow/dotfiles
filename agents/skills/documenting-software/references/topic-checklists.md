# Topic checklists

**Read when:** the coverage step of "Preserve precision and verify" runs for a multi-page set. Not read
for a single page, a review of existing wording or any other step.

**Status: provisional.** These lists are a working default of this skill, not measured thresholds. They are
to be measured on public open-source doc sets (tests/20261118-fe-eval-plan.md, Addendum 3, not yet registered
in this worktree). Change an item by evidence, not per set.

## Why a second route

Reader questions come from the reader's starting point. A missing topic that no reader would think to ask
about never becomes a question, so it never appears as an unanswered row. Each item below is a topic that a
doc set of this kind should answer whether or not a reader asked. Each item is phrased as the reader need,
and states the condition that satisfies it.

## How to apply

1. Pick the set's document kind: platform/SDK (a library, runtime, protocol or infrastructure others build on)
   or application/product (an app whose users act through it). A set that is both gets both lists; a topic
   appearing in both is mapped once.
2. For each item, add one row to the coverage table: item id, then the page that satisfies it, or
   `not needed: <reason>`.
3. The reason is a property of this set, not a deferral. "No operator runs the service in this set's scope"
   is a reason; "later" or "not yet written" is not.
4. An item with no mapped page and no recorded reason is an uncovered finding, as an unanswered reader
   question is.
5. A satisfying condition is a minimum. A page that meets it is enough for coverage; depth is set by the
   page-kind limits in SKILL.md.

## Platform / SDK

| Id | Reader need | Satisfied when |
|---|---|---|
| P1 | What the main objects are and how they relate | A diagram or table names each main object and its relations; one page explains each object in one paragraph |
| P2 | Which mechanisms come from upstream and which the project owns | A boundary statement lists each upstream mechanism the design relies on and each project-owned mechanism, with a link to the upstream's own documentation |
| P3 | Which external services are in use, who operates each, and under what contract | A table per service gives the operator, what is sent and received, the contract or terms it falls under, and the failure behaviour; or the page states that none is used |
| P4 | What it costs to run and use | Each cost category states its unit and who pays it, with the date and source of any number; or the page states that the project bears no cost and why |
| P5 | What runs day to day and what an operator must do regularly | A page lists the recurring operator tasks with their frequency; or states that none exist |
| P6 | What to do when it fails | A page lists, per failure class, the symptom, the first action, who to contact and the recovery; or states that no procedure is defined |
| P7 | Who is responsible for each part once deployed | A table maps each component to its owner (project, upstream, or the deployment's operator) and names the handover point |
| P8 | What is trusted, and what checks what | A page names each trust boundary, what crosses it, what verifies it and the residual trust assumption |
| P9 | What the limits are and what happens beyond them | Each limit gives a value and unit, and the refusal behaviour when exceeded |
| P10 | Which versions are compatible and how to move between them | The page states the version scheme, what is compatible, and the migration steps or that none exist yet |
| P11 | What the terms mean in this set | Each term used on more than one page has a glossary entry giving its meaning in this set and the page that defines it |
| P12 | What is implemented, verified or planned right now | Each capability carries a status (implemented, unverified, unimplemented, planned) and the environment it applies to |

## Application / product

| Id | Reader need | Satisfied when |
|---|---|---|
| A1 | Who the product is for and which decisions they make with it | The page names each audience and the decisions it supports |
| A2 | What each core operation does, when it is refused and what it returns | Each operation gives its precondition, result and refusal |
| A3 | Who may perform which operation | A role-by-operation table, or a link to the contract that declares it |
| A4 | What data the product holds, where, and who can see it | A table of data class, storage location and readers |
| A5 | Which platform guarantees the product relies on and what it adds itself | A boundary statement links each relied-on guarantee to the platform page |
| A6 | How to check that it works as described | A procedure with an expected result the reader can observe |
| A7 | How it is deployed, run and supported | A page states who runs it and what to do when it fails; or states that it is not deployed by this set |
| A8 | Which environments and features are available now | A status table per feature and environment |
| A9 | What the business terms mean | A glossary entry per term used on more than one page |
