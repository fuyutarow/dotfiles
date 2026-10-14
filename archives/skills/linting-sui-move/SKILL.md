---
name: linting-sui-move
description: >-
  Review Sui Move 2024 code and Move.toml: syntax, naming, methods, collections,
  BCS and mutable APIs. Distinguish compiler errors, style advice and
  defects. Excludes Aptos and deployment-only tasks.
---

# Reviewing Sui Move

Version: v2610.1.0 (2026-10-14). Primary-source survey: `survey-2610.1`.
This is an authored synthesis of official Sui guidance, not a Mysten Labs package.
Source versions, official-package assessment and corpus links live in
[references/sources-and-adoption.md](references/sources-and-adoption.md).

## Start with the target

Inspect project guidance, `Move.toml`, lock/published metadata and the declared CLI version.
Use the package's own check tasks where available. Otherwise, from its package directory:

```sh
sui --version
sui move --help
sui move build
sui move test
```

Current documentation also provides `sui move lint --test`; check the installed help
before choosing it or a supported `--lint` equivalent.
Build/test run default lints; explicit linting adds extra checks.
Use `--warnings-are-errors` only when the project requires a warning-free gate.
If the toolchain or dependencies are unavailable, report the unexecuted checks.
Never turn source inspection into a claim that code compiled.

## Classify before reporting

- **Compiler error:** cite the actual diagnostic and target toolchain.
- **Style advice:** cite project policy or a named upstream recommendation.
  A preference does not become a language requirement.
- **Correctness/security defect:** show reachable inputs, affected invariant and consequence.
- **Performance concern:** identify the scaling operation and bound, then measure relevant
  sizes before claiming gas savings or a collection crossover.

For an actionable finding, report file/line, violated contract, evidence and a scoped fix.
Retain rule IDs below for continuity; severity follows consequence rather than the old label.
Read only the reference needed by the review:

| Review question | Reference |
|---|---|
| Manifest, syntax, names, errors | [language-spec.md](references/language-spec.md) |
| Methods, abilities, match, API composition | [types-and-structure.md](references/types-and-structure.md) |
| Collections, BCS and authorization | [performance-and-bcs.md](references/performance-and-bcs.md) |

## Corrections that prevent false findings

- `module p::m;` is preferred style; brace form remains accepted.
- `public struct` publishes a type, not its fields or constructor.
- Method receivers need not be named `self`; `ctx.sender()` and coin methods are valid.
- Clever errors are not declaration-order numbering. Explicit error codes are supported.
- No universal 100/1000-element container threshold or constant-gas promise is established.
- A public `&mut` return is not automatically a vulnerability.
  Check whether it exposes protected state without the intended authorization.
- Appending an `Option` field does not automatically make a BCS schema backward compatible.

## Testing and boundaries

Test the behavior affected: unauthorized callers, wrong capability/object pair,
boundary amounts, malformed bytes, version mismatches and collection growth as applicable.
Use a simple context for local tests; use scenario tests when senders or transactions matter.
Preserve the expected abort's identity/location so a different failure cannot satisfy the test.

Applies to Sui Move source and source review. Aptos, frontend/SDK integration and deployment-only
operations are outside this guide. For behavior changes, combine with
`implementing-and-debugging`; for structure-only changes, use `refactoring-code`.
This guide is not a complete smart-contract audit.

Source-based regression decisions and verification limits:
[tests/review-cases.md](tests/review-cases.md).
