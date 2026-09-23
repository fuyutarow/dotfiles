---
name: designing-type-contracts
description: >-
  Designs type-as-spec contracts: 型設計, 仕様としての型, domain modeling, schema-first,
  parse don't validate, illegal states, smart constructors, newtypes, and typestate.
  Use when choosing which invariants types, parsers, or state APIs must enforce.
  Stops at a scoped TYPE CONTRACT and verification plan; implementation → implementing-and-debugging
  plus writing-*; configuration authority/signing → governing-configuration-systems;
  consequential recovery/resource constraints → practicing-tiger-style. Not for routine annotations,
  syntax explanations, or generic architecture reviews. Workflow-native: contract decisions SOLO;
  construction-path inspection may fan out. English skill; respond in the user's language.
---

# Designing type contracts

> **Version**: v2609.1.0 (2026-09-23). Provenance and scope: `tests/forge-verification-ledger.md`.

```sh
test -f references/boundaries-and-verification.md
test -f tests/triggers.md && test -f tests/forge-verification-ledger.md
test -f agents/openai.yaml
```

## Language

Keep **LAW**, **TYPE CONTRACT**, **invariant**, **enforcer**, and **residual** stable as field names.
Use the reader's language for their contents.

## LAW — name the predicate before choosing its representation

> For every claimed guarantee, identify the rejected value or call, its enforcer, and its boundary.
> Carry established facts in the returned representation; inspect every way that representation is created or changed.
> A type name, successful compilation, or schema generator is insufficient evidence of domain correctness.

These are this skill's design rules, not a universal definition of executable specification.
Use the smallest representation that rejects the named failure and remains readable at call sites.
Do not add brands, state parameters, validators, or dependencies without a distinct invariant they enforce.

## Function map — SOLE owner of invariant placement

```text
domain rule + consumers + current/proposed data flow
  → assign each invariant to a representation and enforcement boundary
  → TYPE CONTRACT + selected shape/signatures + discriminating checks
  → implementation handoff or bounded design findings
```

Keep this contract in the existing design note, review, or response; no mandatory new file.
For design-only requests, leave checks as planned, not observed.
For authorized implementation, continue with the change owner and language skill after the design is settled.

## Gates — use only rows material to the requested design

| Gate | Action | Observable result |
|---|---|---|
| **D1 PREDICATE** | Write an allowed example and the nearest forbidden value or operation. | A predicate more precise than “valid” or “type-safe.” |
| **D2 PLACEMENT** | Choose a representation with the table below. | Named enforcer and callers/inputs it covers. |
| **D3 CONSTRUCTION** | Trace constructors, decoding, persistence reload, mutation, and escape paths. | Each relevant path establishes or preserves the predicate, or is a named gap. |
| **D4 AUTHORITY** | For generated/shared contracts, name the authored source and its consumers. | Derivation direction, regeneration check, and version/compatibility assumptions. |
| **D5 DISCRIMINATION** | Exercise the stated rejection boundary and an allowed control. | Actual command/result, or explicitly unrun plan and remaining obligation. |

If a rejected example still enters the trusted representation, reopen D2/D3.
If the predicate depends on changing external state, identify the runtime check and when its evidence expires.

## Choose the representation

| Failure to exclude | Candidate mechanism | Additional check before claiming it works |
|---|---|---|
| Impossible combinations of flags and optional payloads | Sum type / discriminated union with per-state payloads | Attempt the forbidden combination through actual construction and decoding paths. |
| Two different meanings share one primitive | Distinct newtypes/brands with controlled construction | Check assignment and conversion; two arguments of the same `UserId` still swap. |
| A value must satisfy a predicate | Fallible parser/smart constructor returning a constrained value | Check all construction/mutation routes; validation success must reach downstream as the checked value. |
| An operation is legal only in one state | State-indexed API / typestate | Inspect who can construct each state and how transitions correspond to external state. |
| Declared variants require complete handling | Exhaustive matching at the consumer | Add a variant; check the intended consumer rejects the omission rather than taking a wildcard. |
| Wire consumers must agree | Schema/type derivation with a declared source | Test the deployed parser/client against compatible and incompatible payloads. |
| A decision should be testable without I/O | Pure decision function with explicit inputs/outputs | Assign effect execution, failures, and recovery to the shell; purity alone does not deliver effects. |

This table is a selection aid, not an exhaustive taxonomy or a mandatory linear pipeline.
Keep syntax decoding, structural checks, domain predicates, and normalization distinguishable even if one parser combines them.

## TYPE CONTRACT — compact output, not a second specification

For each material invariant record:

```text
invariant: predicate + allowed/forbidden example
declaration: authored source + selected type/schema/API shape
enforcer: compiler/parser/runtime and actual checking entry point
boundary: covered callers/inputs + construction/mutation/escape paths
residual: external facts, effects, or unsupported constraints
verification: positive control + forbidden case + command/result or planned check
```

Add a source→generator→consumer map only for generated or shared contracts.
Preserve an existing source of truth unless a concrete consumer or fidelity problem justifies changing it.
Treat schema-first versus type-first as a contextual design choice, not a measured universal ranking.

Read [boundaries-and-verification.md](references/boundaries-and-verification.md) at D3–D5.
It covers stale predicates, unsafe construction, generated contracts, and effect obligations.
Language APIs, package selection, and code idioms stay with the language skills.

## Execution model

Contract choices and acceptance remain **SOLO**; the usual invocation needs no agents.
Use `orchestrating-agents` only for separately scoped construction-path inspection or verification.
Require returns to name the path, predicate, command/source locus, observation, and untested cases.
Compiler success proves only the checked static claim; agent agreement supplies no additional proof.
No harness → same map, serial.

## MUST-NOT-FIRE and sibling cuts

| Request | Owner / boundary |
|---|---|
| Choose invariant representation or audit what a type/schema actually enforces | Here. |
| Implement/fix the parser, feature, or behavior | `implementing-and-debugging` first; consult here only for unresolved invariant placement. |
| Preserve behavior while restructuring existing code | `refactoring-code`; changed accepted inputs or public construction paths require change discipline. |
| Language syntax, library choice, or ordinary annotation | `writing-rust`, `writing-typescript`, `writing-python` or the language owner; no extra contract ceremony. |
| Configuration overrides, effective authority, signing or canonical bytes | `governing-configuration-systems`; here only for an unresolved value invariant. |
| Consequential capacity, concurrency, durable state or recovery design | `practicing-tiger-style`; its ledger may link to this contract. |
| General FC/IS, CQS, or ROP explanation | Plain answer; this skill uses them only when delimiting a typed contract's effect obligations. |
| Literature or claims about defect reduction | `systematizing-knowledge`; no percentages inferred from a compiler example. |

Routing seams agree in substance, not byte identity; revisit when the ownership question changes.

## Reference index

| File | Covers | Read when |
|---|---|---|
| [boundaries-and-verification.md](references/boundaries-and-verification.md) | Construction paths, freshness, generation and runtime residuals | Applying D3–D5 |
| [triggers.md](tests/triggers.md) | Fire/no-fire cases and behavioral exercises | Changing routing or rules |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | Source grades, placement, calibration, checks | Reforging or auditing this skill |
