---
name: practicing-tiger-style
description: >-
  Applies TigerBeetle's TigerStyle faithfully across safety, performance, and developer
  experience, including naming, variable scope, assertions, bounds, allocation, control flow,
  cache invalidation, off-by-one errors, formatting, dependencies, and tooling.
  Use for Tiger Style implementation, design, or review, including ordinary code and naming.
  Preserve the pinned source rules and distinguish explicit adaptations from literal conformance.
  Contract enforcement design uses base-usecase-first; language mechanics use writing-*.
  Skill revision uses forging-skills. Respond in the user's language.
---

# Practicing Tiger Style

> Version: v2610.2.0 (2026-10-26). Authority: the pinned upstream guide, not a local risk framework.

Apply safety, performance, and developer experience in that order, preserving all three.
TigerStyle covers concrete code as well as design. Naming and formatting are part of its scope.

## Source and completeness

Read [the upstream guide](references/upstream-tiger-style.md) in full for an unqualified
Tiger Style request or a full audit. For a specifically scoped request, read its relevant sections
and keep the result scoped. [The coverage map](references/source-coverage.md) identifies every
source rule and its original location; it is navigation, not a replacement for the source.

The guide is an unchanged Apache-2.0 source capture at commit
`0450c32b2c3c3ab6114f3402cc601341cc8192aa`.
[Source provenance](references/source-ledger.md) records hashes, licensing, coverage, and update policy.
Do not silently follow a moving branch or substitute TigerBeetle architecture articles for TigerStyle.

## How to apply it

1. Identify whether the user requested design, implementation, review, or explanation.
   Inspect the affected code, project instructions, language, and execution model.
2. Walk the applicable source sections below. For a full review, cover every section, including DX.
   Distinguish a satisfied rule, a violation, an inapplicable rule, an explicit adaptation, and an untested claim.
3. Make authorized changes or report findings with the rule's source locus and the actual code locus.
   For a conflict, preserve what the source says and name the higher-priority project constraint.
4. Run the relevant formatter, compiler/linter, and behavioral or boundary checks.
   Report what was checked and what remains unknown. Planned checks are not executed evidence.

These steps organize application; they are not additional TigerBeetle rules.
No risk tier, T0–T4 ledger, fixed report schema, or new document is required.

## Apply all source sections

| Source section | Obligations to retain |
|---|---|
| Essence; why style; simplicity and elegance | Treat style as design serving the three ordered goals. Invest thought before implementation; simplicity requires revision. Preserve the source's exploratory and small-system perspective. |
| Technical debt | Preserve the source's zero-debt policy and refusal to ship known showstoppers. A missing feature is preferable to an implemented feature that violates the design goals. |
| Safety: control and bounds | Simple explicit control flow, no recursion, bounded loops/queues, explicit nonterminating-loop intent, fixed-width integers. |
| Safety: assertions | Programmer errors versus operational errors; argument/result and pre/post/invariant assertions; average assertion density of at least two per function; paired checks on different paths; useful self-evident assertions; split predicates and explicit implications; compile-time relationships; positive and negative space; mental model and review before fuzzing. |
| Safety: memory and locality | Startup-only allocation; smallest variable scopes and few live variables; functions at most 70 lines; hourglass shape; parent-owned branching/state with simple leaf helpers; strict compiler warnings. |
| Safety: external interaction | Control the pace of external work; simplify compound branches, cover both sides, express invariants positively, handle all errors, explain why, and pass library options explicitly. |
| Performance | Estimate network/disk/memory/CPU bandwidth and latency before choosing the design. Prioritize frequency-adjusted slow resources; separate control/data planes; batch work; make execution predictable; expose hot loops and primitive inputs rather than hoping for compiler optimization. |
| DX: naming | Accurate nouns/verbs, snake_case, deliberate abbreviations and acronym spelling, units/qualifiers last, meaningful lifetime names, symmetric related names, caller-prefixed helpers, callbacks last, top-down source order, unambiguous shared vocabulary, names usable in prose, named ambiguous arguments, ordered dependencies, descriptive commits, and comments explaining why and how. |
| DX: cache invalidation | Avoid duplicate state/aliases, preserve the source's large-value pointer and in-place construction rules, minimize scope and check/use distance, simplify interfaces, avoid suspension invalidating preconditions, initialize padding, and group allocation with cleanup. |
| DX: off-by-one | Distinguish index/count/size and their conversions; choose division rounding deliberately. |
| DX: style by the numbers | zig fmt, four-space indentation, a hard 100-column limit, formatter-driven wrapping, and braces except for a one-line if. |
| DX: dependencies and tooling | Preserve the zero-dependencies policy apart from Zig, and the small standardized Zig toolbox, including Zig scripts. |
| Last stage | Preserve experimentation, enjoyment, humility, and smallness; do not replace them with a compliance ceremony. |

The table preserves source prescriptions; it does not make their numbers empirical laws.
For exact exceptions, examples, wording, and numeric context, use the source and coverage map.

## Literal rules and explicit adaptations

In a TigerBeetle/Zig context, apply the source's actual prescriptions.
Do not dilute “no recursion,” startup-only allocation, zero dependencies, or hard numeric limits into
unspecified preferences. Do not inflate an average assertion-density rule into two assertions in every function.
The performance discussion's 1000x and 90% figures are design motivation, not measured acceptance thresholds.

For another language or repository, honor the user's request and project policy.
State any necessary mapping or departure: for example, Rust-required usize, a managed runtime,
a repository formatter, or this repository's Bun tooling.
A departure remains a departure from the literal source rule; record its reason and retained intent.
Do not label adapted code as full literal TigerStyle conformance or silently erase the original rule.
Do not impose Zig syntax on another language, add meaningless assertions, or rename stable APIs
without considering compatibility and the authorized change scope.

## Contract design and neighboring owners

TigerStyle's assertions, paired checks, positive/negative space, and check/use locality stay visible here
because they are source rules.
Use `base-usecase-first` when the task needs a detailed choice among types, parsers, assertions,
and runtime enforcement. Refer to its contract instead of maintaining a second enforcement procedure here.

| Question | Owner |
|---|---|
| Full TigerStyle or source-faithful coding review, including naming | This skill |
| Preconditions, postconditions, invariants, construction paths, and enforcement boundaries | base-usecase-first |
| Language APIs, formatter commands, ownership syntax, and implementation | Repository instructions and writing-* |
| Behavior-preserving restructuring | refactoring-code |
| Benchmark footing, leakage, or score validity | validating-experimental-evidence |
| Agent dispatch and shared compute admission | orchestrating-agents |
| Skill content, source coverage, or reorganization | forging-skills |

See [behavior cases](tests/triggers.md) for known drift traps and
[revision evidence](tests/forge-verification-ledger.md) for verification limits.
