# Storage costs, byte protocols and mutable state

Scope: PERF-*, MACRO-*, BCS-* and SEC-*.
Primary implementation snapshots and limitations live in the
[source map](sources-and-adoption.md).

## Collections and gas

**PERF-001–003 / PERF-ANTI-001:** choose by bounded size, access pattern, ordering,
value abilities, child-object visibility and cleanup requirements.
VecMap stores entries inline and documents linear map operations.
Table stores entries through dynamic fields rather than inside its handle.
ObjectTable/ObjectBag preserve independently accessible object values when needed.

No universal crossover at 100 or 1000 elements is established.
A numeric rule from a package or benchmark must carry its workload and toolchain.
Do not translate a storage representation into a constant-gas or hash-load-factor guarantee.
Measure entries touched, bytes stored/read and transaction limits on the target network/version.
A Table's `==` compares its handle representation, not logical map contents.

**PERF-ANTI-002:** ordered vector removal shifts following entries.
Repeated front/middle removal can become quadratic.
Use `swap_remove` only if order may change; otherwise consider a one-pass reconstruction.
Batch sizes, secondary indexes and deletion strategies are design choices requiring a measured bound.
Keep dynamic-field cleanup in the collection's lifecycle contract.

## Vector and Option macros

**MACRO-001–003:** prefer a supported macro when it makes the traversal clearer.
Check consuming vs borrowing forms and element ability constraints.
`map!` and `map_ref!` differ in ownership; `filter!` requires discardable rejected elements.
A one-pass aggregate can help, but neither tuple folding nor a specific sorting cutoff is universal.
Never invent a macro name from another framework or release.

## BCS

- **BCS-001–002:** BCS is canonical but not self-describing.
  Decode the agreed types and field order; names and type tags are not included for struct fields.
- **BCS-003–004:** inspect the actual `peel_*` API. Short buffers, invalid tags and malformed
  lengths can abort; one top-level minimum-length check cannot validate arbitrary nested input.
- **BCS-005:** design version dispatch and migration explicitly.
  Appending `Option<T>` still requires a presence tag, so it does not automatically decode
  an old message with no trailing bytes.
- **BCS-006:** validate ranges before narrowing integers.
  Compare semantic validity and encoding size before optimizing bytes.

For a complete-message decoder, reject unexpected remainder bytes.
For a prefix decoder, return/consume the remainder under an explicit protocol contract.
This completeness rule is a review decision derived from the residual-byte API.
Test malformed/truncated input, invalid tags, trailing bytes and old/new schema combinations.
Decoding proves neither authorization nor signature validity; signed payloads need a separate
domain/intent/replay contract.

## Security {#security}

**SEC-001:** public mutable-reference APIs are legitimate framework patterns.
Trace whether a caller can alter protected state, mint value, change authority or violate
an invariant without the required capability. Report that path, not the return type alone.
Check capability/object IDs match and validate authorization on privileged shared-state paths.

**SEC-002:** minimize unintended public surface, but preserve deliberate library APIs
and published upgrade obligations. Local non-use does not establish global non-use.

Protect UpgradeCap and other privileged capabilities according to the package's governance.
A successful build verifies neither economic invariants nor access-control completeness.
For randomness, external oracle inputs or offchain signatures, inspect the current specialized
primary guidance; this review guide does not claim a complete audit of those domains.
