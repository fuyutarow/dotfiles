# Methods, types and composable APIs

Scope: MS-*, ENUM-* and STRUCT-*.
The [source map](sources-and-adoption.md) links method resolution, struct visibility
and the official code-quality checklist.

## Methods

- **MS-001:** automatic method aliases depend on the first argument's type and defining
  module, not the spelling `self`. Receivers can be by value or reference.
- **MS-002:** prefer readable method syntax when it resolves.
  Examples: `ctx.sender()`, `coin.value()`, `payment.split(amount, ctx)`,
  `v.length()`, `id.delete()`.
- **MS-003:** `use fun` can add aliases for externally defined types.
  Constructors without a receiver and calls clearer in module form can remain module calls.

Do not exclude `TxContext`, `Clock` or `Coin` wholesale.
Inspect the actual function signature and alias availability.
In particular, `Coin::split` needs a transaction context; do not drop it when converting syntax.
A conventional receiver name may be a house preference, not a resolution requirement.

## Types and matching

- **ENUM-001:** validate variant forms against the target compiler.
- **ENUM-002:** match coverage is required; a wildcard can provide coverage.
  Prefer explicit variants when a new variant must force review.
  Do not call every wildcard a compiler error.
- **ENUM-003:** PascalCase variant names are style guidance.
- **ENUM-004:** published enum changes require an upgrade-compatibility review.
  Do not prescribe adding variants or V2 migration without checking the package policy.

**STRUCT-003:** Sui recommends ability order `key, copy, drop, store`.
Include only abilities the fields support and the design needs.
This ordering does not authorize `key, copy, drop` on an object containing `UID`.
The compiler and Sui verifier enforce ability/field constraints.

## API and file organization

**STRUCT-001–002:** use project section layout and group by purpose/user flow;
the old universal section/visibility sequence is not a compiler contract.

Prefer `public(package)` for package-only cooperation over legacy friend declarations.
Prefer public functions that return composable values; use intentional endpoint wrappers
when transfer to a recipient is part of the API.
The checklist recommends avoiding redundant `public entry`; it is a lint/style issue,
not a claim that the combination is illegal.

Typical readable parameter order is primary object, capability, values, Clock, TxContext.
Authorization still depends on validating the capability, not its position in a signature.
Before narrowing/removing a published public API, check upgrade compatibility and external callers.
An absence of callers inside the package is insufficient evidence that an API is unused.
