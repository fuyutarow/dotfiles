# Auditability lenses

Each applicable lens has exactly one verdict: `EVIDENCED`, `VIOLATED`, `NOT-EVIDENCED`, or
`NOT-APPLICABLE`. Every non-`NOT-APPLICABLE` verdict cites an evidence locator and a bounded
limitation. A locator establishes provenance, not causal truth.

| Lens | Question | Boundary when evidence is absent |
|---|---|---|
| Frame/problem co-evolution | Could observations revise the stated problem/frame? | `NOT-EVIDENCED`, not "the frame caused failure" |
| Generation/evaluation separation | Was the candidate denominator frozen before comparative evaluation? | `NOT-EVIDENCED` if timing/freeze is absent |
| Terminal denominator | Are admitted, failed, stopped, aborted, and excluded runs retained? | `UNAUDITABLE` / `NOT-EVIDENCED` if incomplete |
| Premise/alternative breadth | Were load-bearing premises and alternatives explicit? | no claim about omitted alternatives |
| Discriminating action | Did possible results entail different next actions? | no claim that a test was vanity without its rule |
| Surprise uptake | Were controls, leakage, missingness, and instrumentation checked? | no discovery claim from surprise alone |
| Audit independence | Was a load-bearing result separated from its generator? | role labels alone are `NOT-EVIDENCED` |
| Negative-result retention | Were nulls, breaks, exclusions, and stops retained with scope? | no broad-space retirement inference |

Process and outcome remain separate. Do not average lens verdicts into a quality or creativity
score. A positive result cannot repair a process violation; a negative result cannot establish one.
