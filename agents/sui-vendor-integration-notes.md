# Sui vendor integration

Applies to MystenLabs/skills commit `15f9e20110e4e4deeb3090209dd8f4776ebf4f69`,
verified 2026-10-14. These notes are supporting documentation, not a discoverable skill.
Remove a correction when a later imported revision fixes it and primary-source checks pass.

## One owner per task

| Task | Installed owner |
|---|---|
| Move/framework fundamentals, abilities, context, initialization, events and coins | `sui-move` |
| 2024 expressions, methods, literals, macros | `modern-move-syntax` |
| Naming conventions | `naming-conventions` |
| Composable signatures, parameter order, return/transfer patterns | `composable-move-functions` |
| Ownership, object lifecycle, dynamic fields, storage/collections | `sui-object-model` |
| Authorization, invariants, capability relationships and upgrade governance | `move-security` |
| Writing tests, assertions, contexts/scenarios and expected failures | `move-unit-testing` |
| Move.toml and dependency/package setup | `sui-move-project` |
| Running build/test/coverage commands | `sui-build` |

Use the narrow owner; load core fundamentals only when needed.
A multi-concern task may compose owners without duplicating their explanations.
Upstream calls the object directory `object-model` and the build directory `sui-build-test`;
the installed identities are `sui-object-model` and `sui-build`.
PTB execution, publishing, frontend/SDK, DeFi, Walrus and other ecosystem packages were not
installed by this source-development change. An upstream cross-reference to them is not
evidence they are installed. Consult their primary documentation or import a distinct
capability when a task needs it.

## Verified corrections to the pinned advice

These corrections take precedence over contradictory passages in the imported packages.
They do not claim that the rest of the packages have been exhaustively audited.

| Upstream passage | Apply instead | Primary evidence |
|---|---|---|
| modern-move-syntax, “Public Structs” | `public` exposes the type, not external field access, packing or unpacking. In Move 2024 do not omit `public` for encapsulation. | [Structs / Visibility](https://move-book.com/reference/structs/#visibility) |
| sui-move Rules, “No as casts” | Numeric `as` casts are legal; out-of-range casts abort rather than truncate. Inspect the range and failure contract; do not invent Rust-style conversion APIs. | [Integers / Casting](https://move-book.com/reference/primitive-types/integers/#casting) |
| sui-move move.md, ability combinations including `key, store, drop` | Objects containing `UID` cannot have `drop` or `copy`: UID has only `store`. | [object::UID](https://docs.sui.io/references/framework/sui_sui/object#struct-uid) |
| sui-move move.md, “Callers never pass TxContext explicitly” | Runtime injection applies at the transaction entry boundary. Ordinary Move calls pass their context argument explicitly, as `payment.split(amount, ctx)` does. | [coin::split source](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/crates/sui-framework/packages/sui-framework/sources/coin.move#L194-L196) |
| object model collection advice, “under approximately 100” | Treat this as a heuristic, not a compiler rule or universal gas crossover. Preserve ordering/cleanup/visibility semantics and measure the target workload. | [VecMap implementation](https://github.com/MystenLabs/sui/blob/435a6b1dcbff9bbe86dc7e4b8dcbe929a4ddf5c5/crates/sui-framework/packages/sui-framework/sources/vec_map.move#L25-L33) |
| project setup, mandatory full-stack templates / automatic lock deletion | Preserve the requested project and inspect its resolver/toolchain before migration. Do not create a frontend or discard lock/published metadata merely to follow an example. | [Minimal package](https://docs.sui.io/develop/write-move#what-is-a-move-package), [package metadata](https://docs.sui.io/develop/write-move/move-best-practices#package) |

Module labels, methods and naming are upstream style advice unless a compiler contract says otherwise.
Error identification comes from the current Clever Errors reference, not declaration-order numbering.
For the underlying adjudication use the corpus below; avoid maintaining another tutorial here.

## BCS and corpus knowledge

BCS decoder review has no independent local skill.
Read the canonical position's “BCS の適用手順” when reviewing a byte protocol:
`urn:uuid:01a1380c-4295-76fc-9c22-eb1545f23c6e`,
presentation path `knowledge/sok-sui_move_review_evidence_boundaries.md` in the soks checkout.
Its protocol and claim ledger use IDs
`01a1380c-4295-76fc-9c22-eb16c14feb6d` and
`01a1380c-4295-76fc-9c22-eb17bf7ecb4a`.
Primary fallback: [BCS format and decoding](https://move-book.com/programmability/bcs/).
The corpus owns field order, remainder policy, malformed input and schema compatibility;
these notes only locate that knowledge.

## Provenance and maintenance

Imported through `mise run skills:add` with nine explicit frontmatter names.
The pinned CLI could not clone a commit SHA as a branch; importing main succeeded.
Before adding local files, `diff -rq` confirmed all nine imported directories byte-identical
to the previously downloaded archive of the commit above.
The CLI discovered 31 packages; the catalog/tree contains 33 including nested packages.
Only the nine requested identities entered this repository.

The former `agents/skills-lock.json` recorded upstream folder hashes and paths. Those hashes describe
the upstream material, not the locally annotated installation.
Local changes are limited to this file, one precedence link in each entrypoint, and a copy
of upstream Apache-2.0 LICENSE in each selected package.
Retain upstream names as vendor identities; authored skill naming conventions do not rename
third-party package identities.

The former authored `linting-sui-move` is archived; no new authored selector replaces it.
No vendor descriptions or substantive reference bodies were rewritten.
On re-import, compare the source snapshot, restore the documented integration links and
recheck corrections before relinking. No onchain execution is authorized by these notes.

## Former entrypoint integration pointer

The local Sui package copies each added this pointer near the top of its `SKILL.md`:

> Local integration: read Sui integration notes (`../sui-move/LOCAL-NOTES.md`) before applying this package. Its routing and pinned corrections take precedence.

This pointer was present in all nine selected packages: `sui-move`, `modern-move-syntax`,
`naming-conventions`, `composable-move-functions`, `sui-object-model`, `move-security`,
`move-unit-testing`, `sui-move-project`, and `sui-build`. The note now lives at
`agents/sui-vendor-integration-notes.md`; `agents/README.md` links it.
