# Construction and verification boundaries

## SOLE owner — D3 construction coverage

Inspect actual paths; do not equate a private field or a parser name with complete construction control.

| Path | Question | Required action if the predicate is not established |
|---|---|---|
| Public constructor, factory, builder, default | Can it produce a value outside the predicate? | Restrict, validate, or name a separate unchecked representation. |
| Deserialization, DB hydration, FFI, cache reload | Does it call the checked constructor or bypass it? | Route through checked conversion or explicitly revalidate before trusted use. |
| Setters, interior mutation, writable aliases | Can the value become invalid after checking? | Preserve the predicate on mutation, freeze/copy, or reduce the claimed lifetime. |
| Cast, brand assertion, `any`, unsafe conversion | Is the caller asserting rather than establishing a fact? | Isolate and document the assumption; do not count it as validation evidence. |
| External authority or changing database fact | Can permission, existence, balance, or reservation expire? | Name a recheck or transaction at the use point. |

“Check once” applies only while the same predicate remains preserved in the same trusted scope.
Do not repeat stable checks on every internal call; do not skip checks after mutation or a new trust boundary.
For schema transformations, distinguish accepted input from produced output; consumers receive the parsed output.
Normalization is part of the contract: make trimming, coercion, unknown-key handling, and lossy conversion explicit.

## SOLE owner — D4 derivation direction

| Existing authority / consumer | Design action | Verification |
|---|---|---|
| External schema already defines a wire protocol | Preserve it unless migration is requested. Generate or map internal types. | Compare real parser behavior and supported constraints with the schema. |
| Checked domain API already owns the invariant | Preserve its construction boundary. Export a wire representation if needed. | Check serialization/reload and document constraints the export cannot express. |
| Several hand-written definitions drift | Choose one authority for the shared contract; make mappings explicit. | Regenerate reproducibly and reject stale derived output in CI. |
| Generator cannot express a domain refinement | Keep that refinement at a named boundary. | Supply an input that passes the wire schema but fails the domain predicate. |

Wire types and domain types can legitimately differ; a single authority does not require identical representations.
Record generator inputs/options/version when its output is relied upon.
For independently deployed consumers, test the relevant old/new combinations and identify the compatibility direction.
Do not infer deployment compatibility merely because all current source files compile together.

## SOLE owner — D5 discriminating checks

| Claimed guarantee | Positive control | Negative or boundary check |
|---|---|---|
| Distinct semantic IDs cannot be interchanged | Intended ID accepted at the consumer | Wrong ID fails there for the intended type mismatch. |
| State payload is required | Each intended state can be constructed | Missing payload fails at the actual constructor or parser. |
| A predicate survives decoding | Valid external value yields the constrained value | Malformed and schema-valid/domain-invalid inputs are rejected. |
| Call order is restricted | Legal transition sequence is expressible | Forbidden call fails; direct state construction does not bypass the rule. |
| Branch handling is exhaustive | Existing variants handled | An added variant fails at the consumer; unrelated errors do not count. |
| Derived contract matches its authority | Regeneration is reproducible | Intentional authority change exposes stale or incompatible output. |

Select the few checks that distinguish the claimed property; use existing compiler/test tools.
A heading-presence checker cannot establish semantic validity; do not build one as a substitute.
For compile-fail checks, retain the relevant diagnostic and a compiling control.
For design-only work, present these as acceptance cases without claiming execution.

## SOLE owner — residual obligations of state and effects

| Observation | Consequence for the contract |
|---|---|
| A state method returns `Paid` | Establish where payment success came from; a caller-supplied label is not external confirmation. |
| A transition consumes a value | Do not infer eventual consumption, cleanup, or completion. Inspect failure/cancellation paths. |
| A pure function returns an effect description | Name the executor and failure handling separately from the decision test. |
| A function returns `Result` | Do not infer purity, absence of other failures, rollback, or delivery guarantees. |
| Replaying an effect can repeat a write | Hand delivery/recovery to the runtime owner; identify the relevant transaction/idempotency requirement. |

Escalate only the unresolved recovery/resource question to `practicing-tiger-style` when consequences warrant it.
Do not mandate an outbox, workflow engine, or particular architecture for every boundary.
