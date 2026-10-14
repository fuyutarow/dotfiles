# Source survey and adoption decision

Survey: `survey-2610.1`, 2026-10-14.
The user-supplied label is not a resolved corpus revision.
The technical corpus was landed at `d2b05e32071190811bfc6bb38d9834913f68e8b7`.

## Canonical technical position

In the canonical soks checkout, these documents share one question and one unit.
They contain the six-domain partition, capture lineage, claim dispositions and search limitations:

| Role | Identity | Presentation path relative to the soks checkout |
|---|---|---|
| Position | `urn:uuid:01a1380c-4295-76fc-9c22-eb1545f23c6e` | `knowledge/sok-sui_move_review_evidence_boundaries.md` |
| Protocol | `urn:uuid:01a1380c-4295-76fc-9c22-eb16c14feb6d` | `knowledge/pro-sui_move_review_evidence_boundaries.md` |
| Ledger | `urn:uuid:01a1380c-4295-76fc-9c22-eb17bf7ecb4a` | `knowledge/led-sui_move_review_evidence_boundaries.md` |

Eleven evidence captures cover the catalog, language, conventions, storage, BCS,
security and tools. Corpus semantics do not depend on this skill.
Distribution-specific comparisons below belong here, not in the technical position.
The corpus guard rejects harness-file names and repository locators;
the rejected draft was kept outside the corpus, and the guard was not changed.

## Official distribution

[Sui's catalog](https://docs.sui.io/skills) identifies MystenLabs/skills and lists 33 entries.
The repository tree at `15f9e20110e4e4deeb3090209dd8f4776ebf4f69` also contains 33 entrypoints.
Eight relevant entrypoints were read; security/access-control and object/collection
supporting references were inspected too.

| Official package | Relevance / adoption |
|---|---|
| [modern-move-syntax](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/modern-move-syntax/SKILL.md) | Distill method, literal and macro advice; reject its field-visibility explanation. |
| [naming-conventions](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/naming-conventions/SKILL.md) | Distill naming advice; qualify error typing/identity against Clever Errors. |
| [composable-move-functions](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/composable-move-functions/SKILL.md) | Distill return-oriented APIs and parameter order as advice, not syntax laws. |
| [object-model](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/object-model/SKILL.md) | Distill representation choices; do not universalize its approximately 100-entry threshold. |
| [move-security](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/move-security/SKILL.md) | Distill access/invariant checks; go to primary security guidance for specialized surfaces. |
| [sui-build-test](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/sui-build-test/SKILL.md) | Distill build/test workflow and version-aware help checks. |
| [sui-move-project](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/sui-move-project/SKILL.md) | Distill minimal manifest; do not impose a full-stack template or blind lock deletion on existing projects. |
| [move-unit-testing](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/move-unit-testing/SKILL.md) | Distill context/scenario choice and precise expected failures; check APIs in the target release. |

## Reassessment: what deserves a local owner?

The initial decision to prefer a complete local synthesis was insufficiently justified.
Overlap calls for choosing a maintained source; it does not establish that the local copy
should be that source. One upstream error does not justify rejecting the whole distribution.

A follow-up read inspected the official
[sui-move entrypoint](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/sui-move/SKILL.md),
its [security checklist, clever errors and field privacy sections](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/sui-move/move.md#L324-L389),
and the [publish/upgrade entrypoint](https://github.com/MystenLabs/skills/blob/15f9e20110e4e4deeb3090209dd8f4776ebf4f69/sui-publish/SKILL.md).
These were targeted section reads, not a new full audit of the distribution.
The official sui-move reference already shows explicit error codes and correctly describes
field privacy. Those facts are not unique local capabilities.

| Consumer task | Official coverage in the inspected snapshot | Local value / disposition |
|---|---|---|
| Write idiomatic syntax, names, APIs and tests | Dedicated guides and examples already cover these jobs | Prefer the official knowledge owner; a second general tutorial adds maintenance cost. |
| Review capabilities, shared state and upgrade authority | sui-move and move-security already provide concrete checklists; publish guidance goes beyond this local guide | Do not claim a local security-coverage advantage. |
| Review a hand-written BCS payload decoder | The inspected Move review guides do not provide a decoder-completeness and old/new-schema review procedure | Retain a narrow supplement for field order, malformed tags/lengths, remaining bytes and compatibility test pairs. This is a bounded coverage observation, not a claim that official docs lack BCS. |
| Select a container at an actual gas crossover | Official collection guidance gives representations and approximate size advice, but no workload-specific measurements | The old local cutoffs were no better. The rewritten local guide requests measurement but supplies no benchmark, so superiority is untested. |
| Resolve conflicting or stale upstream instructions | modern-move-syntax contradicts the correct field-privacy description in sui-move | Keep version-pinned errata and primary-source arbitration; this is a maintenance supplement, not grounds to rewrite every upstream guide. |
| Produce evidence-backed defect findings | Official material provides checklists, while the local guide classifies findings | General evidence/reporting discipline already belongs to implementing-and-debugging and related review skills; do not use it alone to justify another broad Sui owner. |

**Recommendation:** use official packages as the knowledge base for ordinary Sui work.
Retire the idea of maintaining an independent comprehensive local tutorial.
Preserve the useful local material as a narrow Sui review supplement, chiefly BCS protocol
boundaries and temporary, version-specific errata. Generic measurement/review rules stay with
their existing owners. The current broad local rewrite has not demonstrated an advantage
over that arrangement and should not be treated as a validated final architecture.

This reassessment changes the adoption judgment, not installation state.
No official package has been installed yet; no runtime comparison has been performed.
The proposed split still requires a scoped import/supplement change before claiming it deployed.

The syntax package's “Public Structs” section says:
> The `public` keyword on structs controls visibility of the struct's fields.

The [struct reference](https://move-book.com/reference/structs/#visibility) explicitly keeps
fields, construction and destruction internal.
The official package's “String Literals” section also labels one `to_string` expression
both discouraged and valid. These are reasons to inspect primary contracts before adoption.

No vendor bytes were installed; do not add a fictitious vendor-lock entry.
If a future task needs a distinct official capability, use the repository's importer:
`mise run skills:add -- MystenLabs/skills --skill <frontmatter-name> --dry-run`,
inspect the selected content, then import only that capability.
The importer, not an upstream CLI writing into live discovery paths, owns installation.
Do not assume upstream folder names equal skill names:
`sui-build-test` declares `sui-build`; `object-model` declares `sui-object-model`.
A selected import must satisfy the local naming/catalog/wiring checks before deployment.

## Primary contract map

| Claim family | Exact primary locus |
|---|---|
| Struct visibility | [Structs / Visibility](https://move-book.com/reference/structs/#visibility) |
| Receiver resolution | [Methods / Functions in the Defining Module](https://move-book.com/reference/method-syntax/#functions-in-the-defining-module) |
| Braces remain accepted | [parser syntax.rs L4554–4564](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/external-crates/move/crates/move-compiler/src/parser/syntax.rs#L4554-L4564) |
| Error identity | [Clever Errors / Explicit Error Codes](https://move-book.com/reference/abort-and-assert/clever-errors/#explicit-error-codes) |
| Style, aliases, macros | [Code Quality Checklist](https://move-book.com/guides/code-quality-checklist/) |
| Ability order, mutable getters, event suffix | [Move Best Practices / Naming conventions](https://docs.sui.io/develop/write-move/move-best-practices#naming-conventions) |
| Collections | [VecMap source](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/crates/sui-framework/packages/sui-framework/sources/vec_map.move#L25-L33), [Table source](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/crates/sui-framework/packages/sui-framework/sources/table.move#L4-L18) |
| Byte layout and decoder | [BCS / Format](https://move-book.com/programmability/bcs/#format), [Sui decoder source](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/crates/sui-framework/packages/sui-framework/sources/bcs.move) |
| Mutable API counterexample | [coin::balance_mut L135–137](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/crates/sui-framework/packages/sui-framework/sources/coin.move#L135-L137) |
| Security boundaries | [Security Best Practices / Access control](https://docs.sui.io/develop/security/best-practices#access-control) |
| Commands and tiers | [Running Lints](https://move-book.com/testing/linting/#running-lints) |
| Minimal manifest | [Writing Move Packages](https://docs.sui.io/develop/write-move#what-is-a-move-package) |

Compiler/framework source is pinned to `435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5`.
Web documents are dated observations, not release-pinned contracts.
The current source branch is not proof of support in every deployed CLI.

## Verification limits

This is a bounded single-editor source review, not a systematic ecosystem survey.
The semantic duplicate-search battery was refused for a stale soks index;
declared lexical routes found only the existing Sui/Rust boundary evidence.
No corpus-wide absence claim is made.

No Sui executable was available in the task environment.
No Move build, test, exploit reproduction or gas benchmark was run.
The cases in [review-cases.md](../tests/review-cases.md) are source-backed desk checks,
not independent model-selection or execution measurements.
