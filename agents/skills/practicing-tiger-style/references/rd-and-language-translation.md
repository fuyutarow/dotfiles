# Research stages and language handoff

> **SOLE owner:** stage transitions and what to hand to a language owner.
> Ledger tiers and exception validity remain in `ledger-and-calibration.md`.

## Stage selection

| Stage | Do now | Escalate when |
|---|---|---|
| Exploration | Preserve inputs, stochastic seed, environment, status, and a cheap work budget | A result guides a decision or a component is retained |
| Trusted kernel | Stabilize its input/output and failure contract; test relevant negatives | Shared use, performance claim, or durable service dependency |
| Production / costly infrastructure | Check recovery, capacity, and state transitions through T0–T4 | Exposure or resource regime changes |

Do not impose static allocation or a recursion ban on an exploratory algorithm without a specific reason.
If non-finite or unstable behavior is the research subject, tag it according to the experiment protocol.
A discarded result cannot later be cited as a validated production input.

## Promotion record

Attach this to the existing ledger or experiment record:

```text
candidate / revision:
stage_from -> stage_to:
contract_now_relied_on:
design_ids / obligation_ids:
new_checks_and_observed_results:
remaining_assumptions:
```

Add a check when a consumer starts relying on a new property.
Do not validate a prototype solely by relabeling its stage.
Use a meaningful rerun or independent oracle before trusting reproducibility claims.

## Language handoff

| Target | Pass to the owner | Owner supplies |
|---|---|---|
| Rust | State transitions, external failures, ownership/cancellation, persistence, capacity | `writing-rust`: types, errors, allocation, unsafe boundaries and relevant tools |
| Julia | Numerical domain, shape, solver status, stochastic inputs, hot-path budget | `writing-julia`: numerical and dispatch semantics, runtime checks and measurements |
| Julia device code | Kernel contract and reference outputs, device work/storage bounds | `optimizing-julia-gpu-kernels` after host discipline |
| Other language or platform | The selected design and obligation rows | Applicable domain skill or verified target documentation |

Do not duplicate the language owner's tool catalog here.
Check whether a chosen mechanism survives the target build/optimization mode.
Keep operational failure handling distinct from internal invariant detection.
