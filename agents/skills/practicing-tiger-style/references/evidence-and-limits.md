# Evidence and limits

> **Scope / SOLE declaration:** This is the SOLE home for empirical scope, causal limits,
> and revalidation triggers. `source-ledger.md` owns source-rule dispositions.

## Bottom line

**NO DIRECT LLM EVIDENCE:** no located primary study or official evaluation compares coding
agents using this Tiger-inspired skill with a control. TigerBeetle's style is a methodology,
not an agent evaluation. Do not claim improved LLM correctness, speed, safety, exploration
throughput, or lower rework from using it.

## Adjacent evidence, not a causal bridge

| Mechanism | Measured regime | What it supports | Causal / external-validity limit |
|---|---|---|---|
| Public tests + remediation ([Mathews & Nagappan 2024](https://arxiv.org/html/2402.13521v2)) | Python function/contest benchmarks with an execution oracle | tests can constrain candidate search | not repository, production, security, or TigerStyle evidence |
| Human-validated generated tests ([Fakhoury et al. 2024](https://arxiv.org/html/2404.10100v2)) | short Python tasks; human validation | test intent needs an independent validator | not autonomous long-horizon development evidence |
| Contracts ([ContractEval 2026](https://aclanthology.org/2026.findings-acl.2112/)) | 364 HumanEval+/MBPP+-derived tasks | explicit preconditions expose a distinct check | contracts alone remained insufficient; no assertion-density result |
| Test quality ([Haroon et al. 2026](https://arxiv.org/abs/2603.23443), [MUTGEN 2025](https://arxiv.org/abs/2506.02954)) | LLM unit-test generation and mutation | coverage/self-generated tests are weak sole oracles | mutation is not incident, security, or delivery-speed evidence |
| Error handling ([Yuan et al. 2014](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-yuan.pdf)) | five distributed data systems, reported failures | operational errors require explicit handling | not all software; supports neither crash-all-errors nor LLM causality |
| Assertions ([MSR-TR-2006-54](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2006-54.pdf)) | two Microsoft components, file-level observation | meaningful assertions merit review | correlation only; does not validate pairs or `2/function` |
| P10/Tiger allocation and control-flow | safety-critical C or fixed-resource TigerBeetle/Zig | bounded designs can ease analysis in their stated regime | no universal recursion, allocation, LOC, or performance rule |

## Rule limits that remain mandatory at interpretation time

Assertions must distinguish programmer error from operational error: external failure needs
propagation, retry, compensation, or a visible failure—not an unconditional crash. Assertions,
tests, coverage, and same-context self-review do not independently close a high-impact claim;
use a compiler, type checker, targeted test, static analysis, differential/property/fuzz check,
or independent review appropriate to the risk.

P10/Tiger control-flow and allocation rationales are externally valid only when the workload,
resource model, language/runtime, and failure cost match their stated regimes. They do not
justify fixed counts or universal prohibitions. Keep `2 assertions/function`, `70 lines`,
`90%`, `1000x`, literal zero debt/dependencies, a universal recursion ban, and a universal
post-init allocation ban rejected or conditionally scoped as recorded in the source ledger.

For disposable R&D, retain cheap execution, observable failures, seed/input/environment capture,
and a provisional time/compute bound. Stronger contracts and independent checks are a
risk-preference policy for durable, shared-state, security-sensitive, irreversible, or costly
work—not measured proof that they make experiments faster. Escalate only when a result guides a
decision, cost rises, or code becomes a selected kernel/API.

## Revalidate before asserting more

Re-audit this file when: a direct controlled TigerStyle-agent evaluation appears; the target
language/runtime or workload changes; an exception expires or a real failure exposes a gap; an
external oracle is unavailable or repeatedly non-discriminating; or a source revision changes.
Record the new study's regime, comparator, outcome, and limit before altering a rule. A null or
mixed result still blocks an LLM-effect promise.
