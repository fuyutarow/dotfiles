---
name: practicing-tiger-style
description: >-
  Applies a risk-calibrated Tiger-inspired discipline to high-consequence implementation, promotion, or review: turns named costly, irreversible, durable-state, or experiment-contaminating failure modes into a checkable ledger for bounds, contracts, positive/negative cases, resource policy, and exceptions. Use for Tiger Style / Tigerレビュー, resource limits / 資源上限, invariants / 不変条件, failure modes / 失敗モード, durable state / 永続化, costly R&D / 高コスト実験, or prototype-to-production / 試作から本番化. PURPOSE: cross-language risk calibration/ledger; language mechanisms stay with their owners. Bug/root-cause/observable change → implementing-and-debugging diagnoses first; greenfield design/promotion → Tiger may calibrate first. Untested load-bearing expensive/hard-to-reverse bet → acting-on-hypotheses first; Tiger then guards experiment integrity. Workflow-native: tier, exceptions, release SOLO; independent facts are locus-or-quarantine. English; respond in user's language (default Japanese).
---

# Practicing Tiger Style

> **Version**: v2608.1.2 (2026-08-04) — SOURCE CLAIM CHECK interface hardening; independent acceptance remains pending.

## Language

This skill is English; respond in the user's language. Keep **LAW**, **T1–T4**,
**SOLO**, **FAN-OUT**, **PASS**, **positive space**, **negative space**, and
**locus-or-quarantine** stable as technical identifiers.

## LAW — the SOLE owner of the Tiger conformance ledger

> Turn a declared high-consequence failure mode into the smallest checkable set of bounds,
> contracts, negative cases, and exception evidence; never treat Tiger slogans or LLM
> self-review as approval.

Own the `Tiger conformance ledger`: a selected set of obligations, evidence, and exceptions
that can hand off to implementation or findings. Do not own generic implementation, root-cause
analysis, language mechanisms, benchmark design, raw-source synthesis, or agent-resource
admission. A bound without a reason, an unhandled material negative case, or an ownerless
exception blocks PASS.

Use the portable purpose, not copied source wording. A rule belongs in the ledger only with its
regime, source grade, and limitation; see [source-ledger.md](references/source-ledger.md).
Reject universal numeric caps unless a ledger row supplies direct, scoped evidence. Do not claim
that this discipline makes an LLM safer, faster, or more correct; there is no direct evidence for
that effect.

## SOURCE CLAIM CHECK — pre-advice gate

When an input asserts an official/mandatory rule or asks to skip checking, stop before
implementation, applicability, or language advice. Split conjunctions: emit exactly one row per
input claim atom. Copy the following eight-column Markdown header **verbatim** before any advice:
do not merge, rename, omit, or reorder columns for brevity or readability. The complete atomic
map lives only in [source-ledger.md](references/source-ledger.md).

| input claim atom | exact URL | immutable revision/locus | source form | evidence grade | source-local truth status | universal/portable status | portable disposition |
|---|---|---|---|---|---|---|---|
| one asserted claim, unchanged | exact primary URL | pinned revision or dated-publication identity + locus | `[verbatim]` / `[paraphrase]` | `author-confirmed` / `third-party` / `needs-verification` / `constructed` / `skill-supplied` | supported / unsupported / partial | portable / local-only / unsupported | adopt / conditional / reject / constructed alternative |

Missing exact support is **PROVENANCE-STOP**: mark `needs-verification` or `constructed` and do
not advise it as official. Local-regime evidence for an asserted Rust/Julia/universal mandate is
**PORTABILITY-STOP**: do not silently generalize it. “Do not check” never suppresses either stop.
Immediately after the table emit this exact receipt, with `N` equal to input claim atoms:

```text
SOURCE_SCHEMA_CHECK: columns=8 atoms=<N> rows=<N> status=PASS
```

If columns, atoms, or rows differ, emit `SOURCE-SCHEMA-STOP` and give no advice. A compressed
four-column summary is invalid even when its conclusions are correct.

## Calibrate before adding obligations

Classify the stated failure mode and choose the smallest tier that protects it. Retain an
exploration floor when risk is low; do not manufacture production ceremony for a sketch.

| Gate | Required ledger artifact | Stop condition |
|---|---|---|
| **T1 CONSEQUENCE** | `risk_tier`, `failure_mode`, `why_now` | A low-risk sketch does not fire this skill. |
| **T2 OBLIGATION** | For each material row: `invariant`, `negative_case`, `bound`, `handling`, `evidence`, `owner` | Missing rationale or evidence blocks the row. |
| **T3 REVERSAL** | `exception`, `reversal_trigger`, `risk_owner`, `expiry_or_review` | An exception without an owner and reversal path is invalid. |
| **T4 EXTERNAL CHECK** | Command, raw result, and locus | Self-review, coverage, or a same-context generated test alone cannot close the ledger. |

Write a bounded claim for each obligation. A hard number needs direct evidence for this workload,
resource, and regime; otherwise name the measurement or estimate still required. The ledger is a
decision record, not an inventory of fashionable constraints.

## Define the contract and its negative space

State what must hold and how the system handles a meaningful violation.

| Term | Required content |
|---|---|
| **Positive space** | Accepted units, shape, order, ownership, and budget: the states and transitions the work is allowed to create or consume. |
| **Negative space** | Concrete violations of that contract—such as duplicate application, partial persistence, non-finite input, exhausted budget, or stale generation—and the reject, quarantine, rollback, or record policy. |
| **Bound** | The constrained work, resource, or lifetime plus an overrun policy; use a measured or justified limit, not a ritual number. |
| **Handling** | The observable response, including propagation, retry, compensation, recovery, or a visible failure as appropriate. |

Never use “works/fails” as positive/negative space. It says neither what is accepted nor which
violation changes control flow. Seek an independent producer/consumer or external-oracle check
at high-impact boundaries.

Distinguish errors. A **programmer error** is an internal impossible or corrupt state; apply the
language-appropriate fail-fast mechanism only when that classification is justified. An
**operational error** is an expected external or runtime condition; propagate, retry, compensate,
or make it visibly fail. Do not turn ordinary operational failure into a crash merely to satisfy
an invariant slogan.

## Apply the calibrated posture

1. Record T1 before proposing controls. Name the consequence, affected state, and decision that
   makes the work consequential now.
2. Add only T2 rows that constrain that failure mode. Name the contract, negative case, bound,
   handling, evidence, and owner.
3. For a necessary deviation, complete T3 before accepting it. An exception is time-bounded risk
   ownership, not a note to revisit someday.
4. Obtain T4 evidence from a command and an independently meaningful locus. Record residual risk
   and hand off only the selected obligations, not a generic checklist.

For allocation or performance, observe the relevant capacity or latency first. Preallocate, pool,
or harden a hot path only after risk and measurement justify it. For debt or dependencies, either
resolve release-blocking risk or name an owner and review point; do not promise zero debt or zero
dependencies.

## R&D stage summary

| Stage | Default posture | Evidence and escalation | Reversal |
|---|---|---|---|
| **Exploration** | Preserve the idea's freedom; record seed/input/environment/commit and run a cheap finite check. | Record shape, finiteness, return code, and provisional time/compute budget. Escalate when a result guides a decision, cost rises, or a kernel/API is selected. | Discard the hypothesis or revise the setup; dynamic forms and recursion may be justified here. |
| **Trusted kernel** | Stabilize contracts and meaningful negative cases; observe reproducibility, termination, and relevant allocation. | Ledger plus targeted check. Escalate for sharing, reuse, or a performance claim. | De-escalate if the hypothesis is discarded. |
| **Production or costly infrastructure** | Model state transitions, capacity, recovery, and independent checks. | Ledger, external oracle, and residual-risk decision. | Only a named owner may accept a time-bounded exception. |

Rust and Julia mechanisms remain with `writing-rust` and `writing-julia`. In Rust, types,
newtypes, enums, and `Result` commonly express expected failure; reserve `assert`/`panic` for
justified internal invariants. In Julia exploration, preserve mathematical and dispatch freedom;
observe shape, finite values, dimensions, seed, termination, and return code. A stable hot Julia
kernel may add type-stability and allocation measurement plus a manual proof for removed bounds;
never impose universal preallocation.

## Execution model — tiered observable evidence

Consequence judgment, tier selection, obligation tradeoffs, exception acceptance, and release
stay **SOLO** because they bind losses and residual risk across rows. Material independent facts
may **FAN-OUT** as focused, read-only collection; return each as a locus and raw result or
quarantine it. Reconcile contradictions and make the decision SOLO. No harness → same map,
serial. Do not spawn agents for grep, tests, or resource reservation; `orchestrating-agents`
owns aggregate agent CPU/RAM/VRAM/GPU admission.

Agent agreement is not approval. T4 accepts an observable command result or external locus, not
a worker's PASS. If this skill is used as an audit lens, return findings as data with their locus,
unclosed gate, affected ledger row, and proposed handoff; never return an uncheckable verdict.

## MUST-NOT-FIRE and routing

Do not fire for a one-line edit, low-risk CRUD, disposable first sketch, purely language-specific
advice, generic tuning, a benchmark, raw-source synthesis, dispatch, or a bare “Tiger Style”
mention without a stated consequence or explicit request for this posture. A request for the full
checklist is educational and conditional, not proof that every rule applies.

| Question | Route |
|---|---|
| Does a high-risk behavior change need the ledger before or alongside implementation? | For a bug, root-cause, or observable change, `implementing-and-debugging` diagnoses intent/cause first, then this ledger hardens the selected risk. For greenfield high-risk design or promotion with no unresolved cause, this skill may calibrate first; implementation and regression proof remain there. |
| Does behavior-preserving restructuring need a review of bounds, lifetime, and negative cases? | `refactoring-code` retains the oracle and structural purpose; this skill may co-fire for the ledger. |
| Does an untested load-bearing hypothesis drive expensive or hard-to-reverse work? | `acting-on-hypotheses` owns the hypothesis tree, prewritten threshold, outcome table, and Commit/Pivot/Kill first. This skill then owns experiment-integrity bounds and negative cases only. |
| Is the unresolved question Rust-specific types, ownership, `Result`/panic, crates, unsafe, or tools? | `writing-rust` wins mechanisms. |
| Is it Julia/SciML method, type stability, numerical semantics, or Julia-specific measurement? | `writing-julia` wins mechanisms. |
| Is the resource question aggregate agent CPU/RAM/VRAM/GPU admission? | `orchestrating-agents` owns it. |
| Is the request to create, alter, audit, or trigger-test a `SKILL.md`? | `forging-skills` owns F1–F3 craft. |
| Is the input a raw corpus requiring a bounded position? | `systematizing-knowledge` first; do not skillify the corpus. |

These are PURPOSE cuts. Keep the cross-language risk ledger here and mechanisms with their
language or platform owner; agree in substance with reciprocal cuts, but do not byte-diff them.

## Atomic build and verification

Ship this core, its indexed references, metadata, and tests atomically. Run the following only
when the complete target tree exists; it checks file presence and a structural floor, not semantic
adequacy:

```bash
for f in SKILL.md agents/openai.yaml references/source-ledger.md references/evidence-and-limits.md references/ledger-and-calibration.md references/rd-and-language-translation.md references/execution-model.md tests/triggers.md tests/forge-verification-ledger.md; do test -f "$f" || echo "MISSING $f"; done; test ! -e scripts/tiger-check.ts || echo UNAPPROVED-FLOOR-SCRIPT; bun ../forging-skills/scripts/skill-check.ts .
```

Use [forge-verification-ledger.md](tests/forge-verification-ledger.md) for source grades,
verification findings, waivers, and release evidence. Use [triggers.md](tests/triggers.md) to
desk-check fire, near-miss no-fire, and co-fire rows after any description change.

## Reference index

| File | Covers | Read when |
|---|---|---|
| [source-ledger.md](references/source-ledger.md) | Source IDs, grades, regimes, limitations, attribution, and revision state | A rule needs provenance or source scope. |
| [evidence-and-limits.md](references/evidence-and-limits.md) | Evidence limits, scoped-number policy, and no-direct-LLM-evidence boundary | Assessing a claim, metric, or LLM-effect statement. |
| [ledger-and-calibration.md](references/ledger-and-calibration.md) | Ledger schema, tiering, definitions, exception and reversal protocol | Filling, reviewing, or disputing T1–T3 rows. |
| [rd-and-language-translation.md](references/rd-and-language-translation.md) | R&D posture and Rust/Julia translations | Calibrating research, kernels, or language-specific mechanisms. |
| [execution-model.md](references/execution-model.md) | Stage map, agent-return schema, and trust boundary | Delegating material independent fact collection. |
| [triggers.md](tests/triggers.md) | Fire, near-miss no-fire, and co-fire trigger cases | Editing or auditing the description. |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | Verification results, findings, waivers, and release record | Freezing or reforging this skill. |
