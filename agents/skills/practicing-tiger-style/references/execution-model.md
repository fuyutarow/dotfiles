# Execution model — calibrated evidence, not a voting machine

> **Version**: v2608.1.0 (2026-08-03). Durable operating guidance from a frontier model (Fable 5, 2026-08) to whatever model executes this skill later — encodes failures observed in production. If a constraint here feels unnecessary, that feeling is the failure mode — follow the map.

This skill uses **TIERED-OBSERVABLE** evidence. Agents may relay current, checkable facts (a
source locus, command result, diff, or test artifact); they cannot establish future outcomes,
counterfactuals, or a TigerStyle causal effect on LLM reliability. Those claims are inadmissible
without a non-agent evidence owner. Limits: [`evidence-and-limits.md`](evidence-and-limits.md);
grades: [`source-ledger.md`](source-ledger.md).

## Stage map

| Stage | Mode | Why |
|---|---|---|
| Consequence and tier choice | SOLO | Materiality, reversibility, and exploration floor require connected judgment. |
| Obligations: bounds, contracts, positive/negative cases, handling | SOLO | Cross-row tradeoffs cannot be safely checklist-sharded. |
| Independent language/tool facts | FAN-OUT only when material | A manual/compiler fact is relayable as locus plus observable; never spawn for routine search/tests. |
| Reconciliation | BARRIER, then SOLO | Compare returned observables; contradictions/residual risk need one context. |
| Exceptions, owner/expiry/reversal, release | SOLO | These allocate loss; consensus cannot approve them. |

## Agent contract — by pointer, domain delta only

Use `orchestrating-agents` for the complete briefing, decision-rights, resource, and acceptance
contract; its reference remains that skill's owned surface.
A material fact pass adds only this schema:

```yaml
lens: rust-language-fact | julia-language-fact | tool-oracle-fact
scope: one named proposition and regime
read_only: true
return: [proposition, locus, observable, applicability_boundary, unverified]
forbidden: [tier-or-release-decision, causal-LLM-effect-claim, target-edit, confidence-as-evidence]
```

The author retains the Tiger ledger and acceptance decisions. Dispatch resource admission belongs
to `orchestrating-agents`; this skill never owns a resource envelope.

## Trust boundary — locus or quarantine

Accept a return only with a checkable locus and observable result. An agent `PASS`, confidence,
or agreement is not evidence. Missing locus, ambiguous regime, stale version, or future-reliability
conclusion is **quarantined**: record it unverified; do not close T2/T4 with it. A machine verdict
needs invocation plus raw locus and does not validate surrounding prose.

## Scale calibration

| Invocation size | Agents | Use |
|---|---:|---|
| **Modal: one implementation/review/promotion decision** | **0 — SOLO** | Make the tier and ledger directly; run targeted checks. |
| One material independent uncertainty | 1 focused pass | Relay one fact, then reconcile solo. |
| Several independent Rust/Julia/tool facts | 2–3 focused passes | Only when each changes an obligation/exception; compare at barrier. |
| Broad source update or contested high-consequence release | bounded read-only lenses | Separate source/sibling/oracle observations; author resolves. |

**No harness → same map, serial.** FAN-OUT becomes separate focused passes in sequence; SOLO
stages and the trust boundary remain unchanged.
