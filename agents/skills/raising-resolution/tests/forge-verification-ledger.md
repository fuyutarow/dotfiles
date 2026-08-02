# Forge verification ledger

## 2026-07-30 — factual-grounding boundary reforge

This reforge makes bounded single-source extraction the owned case, keeps neutral one-paper summary
direct, routes paper-level argument appraisal to `arguing-research-papers`, and sends future action
through the expensive/irreversible gate rather than treating every probe as a hypothesis tree.

Independent cross-skill audit: PASS-to-freeze. The core SBS/DR/FNT regression suites passed 46/46;
Codex `quick_validate.py` passed; `skill-check.ts` exited 0.

**PROSE-DEBT waiver (2026-07-30).** Measured debt is 36 prose sentences over 120 characters and one
table cell over 400 characters. Queue position: after the shared functional-map freeze, before the
next feature reforge; split the reference narrative while preserving its single-home contract.

## 2026-08-02 — present-state inspection boundary repair — KEEP

Frozen input: `97ec05e84f77068144ecbaca793cf6b3a9a22a12`.
Decision: `KEEP`; no split, merge, rename, or retirement.
The unique operator remains the citation gate over ONE factual row of an existing artifact.

### Exact collisions and clearing conditions

| Collision ask | Old collision | Clearing condition |
|---|---|---|
| “Raise the resolution of this research problem; formulate and select it.” | “problem artifact” plus 解像度 could make this skill claim research-frame construction. | `directing-research` owns problem-frame construction, formulation, selection, why-now, and program steering. This skill may supply only a silent cited observation about a fixed present-state row. |
| “Assign agents to inspect these rows and accept the result.” | The harness note could be read as ownership of actors, visibility, and acceptance. | `orchestrating-agents` owns agent/visibility/dependency/veto/verification/acceptance topology. This skill owns only the cited observation passed across that boundary. |
| “Will this library scale after adoption?” | Present inspection and a future bet could remain fused. | Inspect knowable present capabilities first. Costly or irreversible residual bets go to `acting-on-hypotheses`; cheap reversible residual probes go to the domain/plain executor. |
| “Keep investigating until the whole tree is certain.” | The long narrative obscured the bounded stop rule. | Citation gate and cheapest-rung order remain intact. Fire at zero citations and stop at one citation per blocking claim. |

### Verification and debt closure

- description: 1019 Unicode characters; 1024以下。
- `skill-check.ts agents/skills/orchestrating-agents agents/skills/raising-resolution`: exit 0,
  `FAIL=0`, `WARN=0`.
- The 2026-07-30 waiver is closed: 36 long-sentence WARN sources and the one long table cell are gone.
- Codex `quick_validate.py agents/skills/raising-resolution`: `Skill is valid!`.
- Relevant sibling regression: 75 pass / 0 fail across directing-research, surfacing-blind-spots,
  and continuing-long-running-tasks tests.

Reopen this `KEEP` decision if the skill starts selecting research frames, assigning actors,
owning acceptance, extending beyond one citation per claim, or running future-bet policy itself.

## 2026-08-02 — R2 Japanese formulation collision repair

Classification: stage-1 boundary repair. The `KEEP` decision and citation gate remain unchanged.

- The prior description overmatched standalone 「解像度」 against research-problem formulation.
- Standalone 「解像度」 now fires here only for a factual present-state inspection of an existing artifact.
- Research-problem resolution, concretization, and formulation route to `directing-research`.
- This skill still stops after one citation for the blocking claim and hands off the observation.
- The description shrank from 1019 to 954 Unicode characters.

The shared lexical contract passed its Japanese positive/negative pair and present-fact stop rule.
Codex `quick_validate.py` returned `Skill is valid!`. House `skill-check.ts` was silent:
`FAIL=0 WARN=0`. The directing-research suite passed 81 tests and 254 assertions.
