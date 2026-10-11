---
name: driving-polysearch-v1
description: >-
  Drives the polysearch-v1 CLI to admit immutable statement, evidence, review, and run records.
  Use for polysearch-v1, init, note, review, ingest, run, read statement/graph/evidence/artifact,
  schema, help fragment, derived research status, or v1 refusal recovery. Applies only to v1;
  polysearch-v0 has its own skill and frozen records. The binary's --help is the grammar; this
  skill is the map. English skill; respond in the user's language.
---

# Driving polysearch-v1 — turn research acts into admitted graph records

> **Version**: 1.202610.5. The binary's `--help` is the grammar; this skill is the map.
> Grammar authority: `polysearch-v1 --help`; drift check: `skill_surface`.

## The model

1. There are two logical units: `statement` and `evidence`.
2. A statement mode is `observation`, `abduction`, `deduction`, or `definition`; a prediction is a `deduction` that `uses` an abduction.
3. Statement edges are `explains`, `uses`, `discriminates`, and `refines`; evidence edges are `supports`, `refutes`, `proves`, review/material links, and blob `produced_by`.
4. Status is derived from admitted objects and edges on read, never written into a fragment; empirical, proof, review, and abduction status remain distinct axes.
5. Every retained unit must have at least one graph edge, every edge target must exist, and every retained blob body must be referenced.

## Research act → command

| Act | Command and shape | What to supply |
|---|---|---|
| Initialize a store | `polysearch-v1 init [TARGET]` | TARGET defaults to the current directory. Use `--store` to select an existing configured store. |
| Register a definition | `polysearch-v1 note --statement TEXT --mode definition --context FILE` | Context carries the citation evidence and its edge; definitions have no `uses`. |
| Register an observation | `polysearch-v1 note --statement TEXT --mode observation --context FILE` | Context carries supporting evidence and edges. An unsupported observation is refused. |
| Register a hypothesis (abduction) | `polysearch-v1 note --statement TEXT --mode abduction --context FILE` | Context carries predictions and rival discrimination; the CLI will not make these up. |
| Register a prediction | `polysearch-v1 note --statement TEXT --mode deduction --uses HYPOTHESIS --context FILE` | Context supplies the prediction's `discriminates` edge and required prediction members. |
| Register a lemma | `polysearch-v1 note --statement TEXT --mode deduction --uses PREMISE --context FILE` | Context supplies a `proves` edge to citation or checker-run evidence. Hand derivation remains unverified. |
| Record an experiment run | `polysearch-v1 run --out DIR -- COMMAND ARG...` then `polysearch-v1 ingest --producer WHO DIR` | DIR is a caller-created output directory under sibling staging. Run emits a fragment; ingest admits it. Capture declared inputs/artifacts with run flags shown by `polysearch-v1 run --help`. |
| Review a statement | `polysearch-v1 review --id ID --verdict accept --by REVIEWER --words LOCATOR` | Verdict is `accept`, `revise`, or `reject`. LOCATOR is `id:<ref>`, `url:<url>#<sha256>`, `doi:<doi>`, or `repo:<path>@<commit>#L<a>-L<b>`; id locators need `--report-sha256`. |
| Read why a status holds | `polysearch-v1 read statement --id ID --why` | Returns the derived status and supporting reasons. |
| Read the graph | `polysearch-v1 read graph --all --include evidence` | Shows derived statement/evidence graph; `--all` includes statements without a derived status. |
| Read evidence or artifact bytes | `polysearch-v1 read evidence --id ID`; `polysearch-v1 read artifact --id DIGEST` | Artifact materialization is an explicit export to an existing empty directory via `--materialize DIR`. |
| Inspect the schema or a fragment example | `polysearch-v1 schema`; `polysearch-v1 help fragment` | Use help for the exact current grammar and fragment shape. |

`note` and `review` write fragment bytes to stdout. Pipe those bytes to `ingest` with an explicit
producer; do not hand-edit admitted store objects. `note --context` takes a complete context
fragment whose statement local id is `note`, and its flags must agree with its contents.

## Filter pipelines

- `polysearch-v1 note --statement TEXT | polysearch-v1 ingest --producer WHO -`
- `polysearch-v1 review --id ID --verdict accept --by REVIEWER --words LOCATOR | polysearch-v1 ingest --producer WHO -`
- `polysearch-v1 run --out DIR -- COMMAND ARG...` then `polysearch-v1 ingest --producer WHO DIR`
- `polysearch-v1 ingest --check --producer WHO INPUT` validates and reports admission without writing.

Each producer controls its own fragment and attribution. A filter refusal means repair the named
input and resubmit; it never adds missing evidence, relations, or status on the caller's behalf.

## Prediction ordering

A prediction must already be admitted in an earlier fragment before evidence can support or refute it. For that test, run evidence must be emitted by `run`, have `attested_by = "run"`, and have `started_at` later than the prediction's `recorded_at`; producer-authored run evidence cannot test a prediction.

## Refusal → next action

| Refusal | Next action |
|---|---|
| `INVALID_ARGUMENTS` | Compare the invocation with `polysearch-v1 <command> --help`; supply required arguments and remove unsupported or incompatible flags. |
| `STORE_MARKER_INVALID` | Fix the malformed nearest `polysearch-v1.toml`; resolution stops there and will not fall back to a parent or another store. |
| `INVALID_FRAGMENT_INPUT` | Correct TOML/schema/input details (UTF-8, NFC, final LF, valid values); duplicate members are invalid input. Re-run `polysearch-v1 ingest --check --producer WHO INPUT`. |
| `UNKNOWN_FIELD` | Remove the unrecognized field or use the exact fragment schema member; unknown fields are not forward-compatible. |
| `UNKNOWN_OR_ADMISSION_OWNED_FIELD` | Remove the unknown or derived/admission-owned field such as a hand-written status; ingest supplies admission metadata. |
| `EDGELESS_UNIT` | Add an explicit valid graph edge for every unit in the fragment; do not rely on inferred relations. |
| `DANGLING_EDGE` | Correct the target to an existing full object id or a valid local id in the same fragment. |
| `PREDICTION_ORDER_REFUSED` | Admit the prediction first, then start a new `run` and attach its emitted run evidence to the prediction; use a later start time. |
| `FILTER_DOES_NOT_ADMIT` | Add the missing explicit support, prediction/discrimination, edge, or mode-specific data in the context fragment; producers do not invent it. |
| `CITATION_LOCATOR_UNSAFE` / `CITATION_UNRESOLVED` | Use a normalized safe repository path or supported external locator, then make the referenced bytes/range match the recorded digest. |
| `INDEX_UNAVAILABLE` | Stop ingest retries and follow the reported index recovery; ordinary ingest does not silently scan or rebuild the index. |
| `LOCK_CONFLICT` | Retry the read/ingest after the concurrent writer or snapshot change ends. |

## Alpha limits

This alpha has no leaderboard, arena, candidate, reproduce, or `gc` workflow. `polysearch-v1 doctor`
and `polysearch-v1 index rebuild` report that those operations are unavailable. It does not migrate,
bridge, or reinterpret v0 records. For polysearch-v0 work, use the v0 skill and its frozen records
only; v0 and v1 coexist as separate stores and formats.

## Purpose cuts

| Need | Route |
|---|---|
| Which experiment to run next | `driving-bibifi-cycles` |
| Whether a number is sound benchmark evidence | `validating-experimental-evidence` |
| Where an artifact belongs and which launcher to use | `keeping-research-notebooks` |
| Changing the v1 implementation | `implementing-and-debugging` |
| Operating polysearch-v0 or reading its frozen records | `driving-polysearch` |

