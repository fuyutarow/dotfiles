---
name: designing-by-contract
description: >-
  Designs software contracts: preconditions, postconditions, invariants, allowed state transitions,
  type safety, parse don't validate, runtime enforcement, assertions, and Design by Contract (DbC).
  Use for negative-space enforcement, illegal states, domain types, schema authority,
  typestate, stale permissions, or check/use races. Owns the invariant-to-enforcer design
  across static and runtime boundaries. Implementation uses repository instructions and writing-*;
  full TigerStyle uses practicing-tiger-style; CLI protocol and configuration authority keep
  their domain owners. Not legal or smart-contract business design. Respond in the user's language.
---

# Designing by Contract

> Version: v2610.1.0 (2026-10-26). Consolidates designing-type-contracts and runtime enforcement design.

**Use type safety for what types can preserve; enforce the remaining conditions at runtime.**
Every material prohibition needs an actual enforcement boundary and a check that can expose its violation.
A warning, boolean preflight, type name, or post-effect assertion does not by itself prevent an unsafe effect.

## Purpose and boundaries

Input: a domain requirement or negative space plus the proposed/current values, calls, state, and effects.
Output: one scoped contract defining the allowed behavior, responsible parties, enforcement, and verification.
Keep it in the existing code/design/review; no new file or report schema is required.

The domain owner decides which behavior is required and what losses are unacceptable.
This skill decides how that contract is established and preserved.
Language owners implement the chosen mechanism; domain owners keep CLI behavior, configuration authority,
security policy, and scientific meaning. TigerStyle keeps its complete source-based coding discipline.

Design by Contract specifies caller preconditions, supplier postconditions, and invariants.
Types, parsers, and assertions can express or check them.
Runtime Enforcement adds control over execution so a forbidden effect is rejected before it occurs.
These are related mechanisms, not synonyms or a claim that classic DbC alone supplies concurrency control.
[Sources and limits](references/sources.md) separate established methods from this operational synthesis.

## Design the contract

1. **State the predicate.** Name the caller/supplier, allowed example, nearest forbidden example,
   preconditions, postconditions, invariants, allowed transitions, and supported failure outcomes.
   Distinguish a correctness condition from an expected external/input failure.
   For substitutable implementations, do not strengthen caller preconditions or weaken promised postconditions.
2. **Choose enforcement.** Prefer a representation that excludes the forbidden value or call.
   Decode external data into checked values. For remaining dynamic facts, name the authoritative owner
   and mechanism coupling authorization to the effect.
3. **Trace every path.** Constructors, decoding, mutation, aliases, FFI/casts, persistence reload,
   concurrency, suspension, crash, cancellation, and retry must preserve the claimed predicate,
   or remain an explicit unsupported path. Name when external evidence expires.
4. **Check both spaces and their boundary.** Pair an allowed control with the forbidden construction,
   transition, interleaving, or failure. Use source/consumer checks where independent paths help.
   For a generated/shared contract, keep one declared authority and verify derivation and deployed compatibility.
5. **Report the supported scope.** Identify the enforcer, its covered callers/writers, residual assumptions,
   and actual check results. If the runtime cannot mediate an effect or external writer, do not claim prevention.

Select only the mechanisms needed for the named requirement.
No mandatory brand, transaction, workflow engine, or global redesign follows from the word “contract.”
An implementation request continues through implementation and checks within its existing authorization.

## Choose the enforcer

| Failure to exclude | Mechanism | Remaining obligation |
|---|---|---|
| Invalid combinations or missing state payload | Sum type/discriminated union; controlled construction | Check decoding, mutation, casts, and direct construction bypasses. |
| Confusing semantic quantities or roles | Distinct types or explicit named arguments | Same-typed positions can still swap; names do not prove user intent. |
| Invalid external value | Fallible parser/smart constructor returning the constrained value | Pass the parsed output downstream; preserve normalization and predicates after mutation. |
| Illegal operation order | Typestate or a state-transition API | Establish correspondence with real state; cover reload, cancellation, and concurrent actors. |
| Internal programmer contradiction | Preconditions/postconditions/invariant assertions, with paired checks where useful | Assertions detect bugs; an assertion after an irreversible effect does not undo it. |
| Revoked permission, stale availability, concurrent update | Transaction, ownership, lock, reservation, fencing, or another authoritative transition mechanism | Cover every competing writer and effect path; specify failure and evidence lifetime. |
| Retry or crash duplicates an external effect | Effect-specific deduplication, durable ordering, reconciliation, or explicit containment | The external provider and failure windows must actually support the claim. |
| Missing variant handling | Exhaustive matching | Prove the actual consumer rejects a newly unhandled variant. |
| Divergent wire/schema consumers | One authority with generated or explicit mappings | Test old/new deployed consumers, refinements outside the schema, and stale output. |
| Hard-to-test decision entangled with effects | Pure decision with explicit inputs plus a named executor | Purity and Result do not establish rollback, delivery, or completion. |

Stable checks need not be repeated while their predicate remains preserved in the trusted scope.
Changing external facts require a mechanism at use, not repeated checks by habit.
A parsed `SafeToDelete` observation cannot stop a worker from acquiring the workspace later.
A shared reservation can enforce exclusion only if both use and deletion obey it.
Test that interleaving, including a bypassing writer; do not infer complete mediation from a lock name.

## Expected errors, contradictions, and effects

Invalid user input, a busy lock, revoked authority, and I/O failure are expected outcomes with explicit handling.
An internal violated invariant is a program defect; apply the runtime's assertion/containment policy.
Do not replace normal error handling with assertion crashes.

Distinguish prevention, detection, and recovery.
A precondition can guard an action only if it remains true through the relevant effect boundary.
Suspension or another writer can invalidate it. A postcondition can detect a bad result after damage.
For persistent effects, specify what can be acknowledged, retried, reconciled, recovered, or quarantined.
Do not claim exactly-once or full rollback from a type, Result, lease, or successful local test alone.

Read [construction and verification boundaries](references/boundaries-and-verification.md)
when reviewing construction coverage, derivation, or effect residuals.

## What to leave with the consumer

For each material invariant, preserve the following information in the existing artifact:

- Contract: predicate, parties, legal transitions, and allowed/forbidden examples.
- Enforcement: declaration, compiler/parser/runtime entry point, and responsible owner.
- Coverage: construction, mutation, reload, writers, and bypass paths; evidence expiration.
- Failure: rejection, internal contradiction, partial effect, cancellation, and recovery behavior.
- Verification: compiling/allowed control plus rejected case or interleaving; observed result or unrun plan.
- Residual: external authority, unmediated paths, and unsupported guarantees.

An unenforced requirement stays unresolved. A passing parser test does not certify the whole effect path.
A design can be complete with planned checks; that is not runtime acceptance.

## Neighboring owners

| Question | Owner |
|---|---|
| Required behavior and policy | The domain's design/specification owner |
| How a value/call/state/effect invariant is enforced | This skill, across static and runtime boundaries |
| Full Safety/Performance/DX discipline, including naming and formatting | practicing-tiger-style |
| CLI grammar, streams, exits, and compatibility | designing-command-line-interfaces |
| Configuration authority, layering, and integrity | governing-configuration-systems |
| Scientific validity, benchmark footing, and information-flow meaning | validating-experimental-evidence |
| Representation/enforcement-preserving restructuring | refactoring-code |
| Language mechanisms and authorized behavior changes | Repository instructions and writing-* |
| Generic legal contracts or smart-contract business requirements | Their domain owner; no automatic invocation here |

[Behavior cases](tests/triggers.md) exercise static and dynamic enforcement together.
[Revision evidence](tests/forge-verification-ledger.md) preserves the predecessor's provenance and scoped checks.
