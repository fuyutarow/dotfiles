# Candidate-packet calibration cases

These are synthetic structure checks, not historical proof that a recipe or coordinate cell creates
successful research.

## PASS-shaped packet

```markdown
## Candidate C1

- Input problem/frame: Endpoint assays miss transient interactions.
- Generation recipe (optional): representation change
- Seed provenance: OBSERVATION — cited endpoint/trace mismatch
- Transformation target: REPRESENTATION
- Operation: SUBSTITUTE
- Premise challenged: NONE — grounded control
- Transformation trace: static endpoint state -> SUBSTITUTE with time-indexed transition log -> reconstruct transient relation
- Thesis claim: Time-indexed interaction traces reveal transient complexes absent from endpoint assays.
- New testable prediction: Reconstruction identifies a reproducible class of complexes not recovered by endpoint assays.
- New discriminator: Under matched samples, the trace account predicts transient-complex recovery while the endpoint account predicts no recovery.
- Nearest prior / novelty delta: endpoint interaction assays -> adds event-level temporal reconstruction [UNVERIFIED until corpus check]
- Frame update flag: YES — the object changes from stable state to transition process.
- Status: CANDIDATE
```

Why it passes the **mechanical** floor: provenance, target, operation, control premise, before/after
trace, claim, prediction, and discriminator are visible. It may still be unimportant, infeasible,
non-novel, or false.

## Failure cases

| Failure | Bad field | Earliest repair |
|---|---|---|
| recipe-label theater | `Generation recipe: brainstorming` is the only diversity record | allocate distinct coordinate cells; recipes are not coverage |
| paraphrase | `Transformation trace: use a more innovative and holistic approach` | name the before-state, operation, and changed relation |
| generic prediction | `New testable prediction: Research results will improve.` | state a scoped observable that follows from the transformation |
| decorative analogy | `Generation recipe: cells are like cities` | map a source relation and derive a target prediction |
| closed-set coercion | `Operation: OTHER` | name the open-set value, e.g. `OTHER — TEMPORAL-INTERLEAVE` |
| fake anti-default | `Premise challenged: conventional wisdom` | name the concrete load-bearing premise |
| fake discriminator | `New discriminator: results will be different` | contrast the candidate outcome with the prior/account outcome |
| hidden frame mutation | claim changes the population but `Frame update flag: NO` | set YES and state the change |
| novelty laundering | `Nearest prior: nobody has done this` without locator | name a prior or use `UNVERIFIED` |
| result-shaped thesis | prediction merely repeats an observed residual | derive a new regime, contrast, or boundary prediction |
| validation laundering | `Status: VALIDATED` | reset to exactly `CANDIDATE`; testing belongs elsewhere |
| owner leak | packet contains kill threshold, withdrawal, capital fit, or selection score | remove and route to the owning skill |
| simulated tacit fact | `Seed provenance: TACIT — operators probably compensate for drift` | require an answered handoff row with `HUMAN:<owner>@<attestation-locus>` provenance or use another seed type |

## PASS-shaped batch header

```markdown
## Batch contract
- Requested candidate count: 3
- Grounded control candidate: C1
- Premise-breaking anti-default candidate: C2
- Collapse recovery: ONE targeted regeneration in an unoccupied legitimate cell; then COVERAGE GAP
```

The three candidate packets must produce at least three distinct derived matrix cells, and the unique
batch must not share one target or one discriminator throughout. The same recipe on C1 and C2 is
irrelevant if their functional coordinates differ.

## Batch collapse

Three packets that all use `Transformation target: REPRESENTATION` and the same discriminator have not
covered the search space merely because their recipe labels differ. `gate-check.ts` rejects this
mechanical collapse. Semantic paraphrases that survive the floor remain the responsibility of
`directing-research`; when its dedup result crosses the collapse rule, this skill gets one targeted
regeneration and then must say `COVERAGE GAP`.

## Human-tacit PASS / FAIL seam

PASS:

```markdown
- Seed provenance: TACIT — Blind-spot packet research/blind-spots.md, Probe P3, HUMAN:line-operator@conversation:user-turn-7; recovery begins only after the controller reset.
```

FAIL: the probe says `UNELICITED`, the packet's `Handoff` does not name this skill, or the answer was
reconstructed from an `INFERRED` assumption. Never fill the missing answer from model plausibility.
