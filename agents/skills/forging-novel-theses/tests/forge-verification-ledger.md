# Thesis-genesis reforge verification ledger — 2026-07-30

## Transfer-route reforge — v2608.1.0 (2026-08-02)

### Ownership and stop condition

The collection retains its existing owners rather than creating a generic horizontal-transfer skill:

```text
systematizing-knowledge: target-agnostic donor relation search -> DONOR SET
forging-novel-theses: selected target + frozen DONOR SET -> CANDIDATE | MAPPING-BREAK
directing-research: preserve and decide the TRANSFER DISPOSITION denominator
```

This skill cannot select donors, create a target-independent transfer search, decide adoption or
retirement, or promote source success to target evidence. `MAPPING-BREAK` is a required preserved
output when no admissible correspondence preserves the invariant; it is not an invitation to fabricate
a candidate.

### Artifact and mechanical floor

For every transfer attempt, the packet declares:

```text
Donor set: path=<frozen donor-set path>; sha256=<lowercase digest>
Donor IDs: <IDs present in that artifact>
```

Run `bun scripts/gate-check.ts --donor-set <same-path> <packet>`. The mechanical floor checks the
declared path/digest and donor-ID membership, relation-level correspondence, non-correspondence,
boundary, precision loss, target-side evidence exactly `UNTESTED`, and a target-side counterexample.
It cannot establish source correctness, semantic mapping quality, target fit, novelty, feasibility,
or truth.

### Evidence calibration

| Grade | Inputs | Retained rule | Non-claim |
|---|---|---|---|
| P2 | Gentner (1983); Gick & Holyoak (1983); Gentner et al. (2003) | compare source relations and make correspondence explicit | their bounded theory/tasks do not validate this packet, research discovery, or a target conclusion |
| P2 | Holyoak & Koh (1987) | separate retrieval cues from structural use | surface resemblance or retrieval does not establish a usable target relation |
| P2 | Hargadon & Sutton (1997); Dunbar/Schunn | retain source scope and avoid provenance myths | neither supports a monotonic distance/contact effect or felt analogy as causal evidence |
| LOCAL | `DONOR SET` digest handoff, `MAPPING-BREAK`, field schema | make the attempt auditable and retain failures | not validated interventions for creativity, documentation, or wiki-mediated transfer |

### Regression receipts

The transfer fixtures in `tests/gate-check.test.ts` cover a complete transfer candidate, a complete
`MAPPING-BREAK`, invalid upstream `DONOR SET`, digest/path mismatch, unknown or duplicate donor ID,
duplicate attempt ID, donor-success laundering, exact frozen source-locator retention, section-local
duplicate/missing fields through heading depths 2–6, single-donor/cardinality mismatch, missing dependency or upstream checker,
realpath-equivalent symlink, transfer fields leaked into a non-transfer candidate, and candidate
fields leaked into a break. Trigger rows add selected-target mapping as a FIRE, source-only donor
search as NO-FIRE, and an ordered SoK -> genesis -> disposition route.

```text
bun test agents/skills/forging-novel-theses/tests/gate-check.test.ts
31 pass, 0 fail, 110 assertions
```

The receipt establishes parser and handoff invariants only; it does not establish correspondence
quality, target fit, novelty, value, or truth.

The final governance re-audit added the reciprocal persistence seam: transient packets remain HERE,
while durable locus, review, supersession, and retirement route to `governing-research-documentation`
without transferring mapping or `MAPPING-BREAK` semantics.

**PROSE-DEBT waiver (2026-08-02).** `skill-check.ts` reports 16 long-sentence WARNs after this
transfer-contract reforge. The sentences carry field-level contract and ownership limits; the next
prose-only pass must reduce them without moving schema or cut semantics into an unowned file. This
waiver covers no validator, trigger, or evidence-boundary failure.

## Trigger

The broad request “how can I do creative research?” exposed a collection-level race. The prior version
of this skill owned both thesis genesis and survival/testing mechanics, duplicating
`acting-on-hypotheses` and overlapping `directing-research`.

## Ownership decision

| Responsibility | Owner after reforge |
|---|---|
| selected-frame thesis candidate generation | `forging-novel-theses` |
| problem construction, selection, formulation, candidate admission, why-now, portfolio | `directing-research` |
| expensive/irreversible selected tree's threshold, experiment, commitment, pivot, kill | `acting-on-hypotheses` |
| deterministic, bounded, reversible probe with no expensive downstream exposure | domain/plain executor |
| corpus position / novelty evidence | `systematizing-knowledge` |
| present anomaly verification | `raising-resolution` |
| agent topology and acceptance | `orchestrating-agents` |

No new **thesis-generation** skill was created in this local reforge; the incumbent was narrowed because
that territory already had owners. The collection-level EXPOSE ownership void was separately filled by
the new `surfacing-blind-spots` skill.

## Functional-coordinate reforge

A comparative forward test found that the six generation routes increased lateral output but did not
prove blind-spot coverage: route labels overlap, tacit knowledge had no elicitation seam, and
semantically deduplicated batches had no recovery branch. The architecture remains genesis-only and
changes the machinery:

- the six routes are RECIPES, explicitly neither MECE nor diversity proof;
- provenance, target, operation, challenged premise, and discriminator are independently typed;
- every broad batch carries a grounded control and premise-breaking anti-default, or a precise EXEMPT;
- `gate-check.ts` derives a coverage matrix from packet fields rather than trusting route counts;
- `directing-research` owns semantic dedup and may return one coverage-gap packet;
- this skill performs one targeted regeneration, then emits `COVERAGE GAP`;
- human-tacit facts enter only through sourced, answered rows handed off by `surfacing-blind-spots`.

## Removed overlap

- deleted the local control-loop reference;
- removed kill experiment, threshold, withdrawal, runway, capital-fit, and why-now gates;
- deleted the book chapter-to-gate source map;
- changed the validator from “survival” gates to candidate-packet completeness;
- forced every output to `Status: CANDIDATE`.

## Mechanical regression

`tests/gate-check.test.ts` proves:

1. a complete coordinate-bearing packet passes by file and stdin;
2. every candidate in an auto-detected batch is checked;
3. a batch with grounded control, anti-default, and three occupied cells passes;
4. shared target/discriminator and too few distinct cells fail as batch collapse;
5. the demonstrated vague route/trace/prediction false positive fails;
6. a bare `OTHER`, blank novelty delta, and non-`CANDIDATE` status fail;
7. explicit `UNVERIFIED` remains visible and passes mechanically with a warning;
8. a bare seed label and a `TACIT` seed without packet/probe/
   `HUMAN:<owner>@<attestation-locus>` provenance fail;
9. one candidate cannot bypass a declared multi-candidate batch contract;
10. old kill/withdrawal packets fail and CLI misuse exits 2.

## Verification receipts

- `bun test agents/skills/forging-novel-theses/tests/gate-check.test.ts`
  → 14 pass, 0 fail, 51 assertions.
- `bun agents/skills/writing-bun-scripts/scripts/script-check.ts
  agents/skills/forging-novel-theses/scripts/gate-check.ts`
  → `floor: FAIL=0 WARN=0`.
- Codex `quick_validate.py` → `Skill is valid!`.
- Build-order existence check → exit 0 with no missing artifact.

**HISTORICAL PROSE-DEBT receipt (2026-07-30; superseded).** `skill-check.ts` reported 10
long-sentence WARNs after the safe splits in that reforge. The active waiver is the 15-WARN receipt
in the 2026-08-02 transfer-route section above. Neither receipt covers validator, trigger, or
boundary failures.

The supervisor's post-forge negative controls added the bare-seed, counterfeit-`TACIT`, and
underfilled-singleton batch fixtures. The regression tests were red because those invalid fixtures
were accepted before the checker repair; they are green afterward. No semantic gate was weakened.

## Semantic regression

Re-run `tests/triggers.md` after any description change. A regression exists if this skill independently
emits a problem-selection verdict, selection score, test threshold, commit/kill verdict, capital gate,
human-tacit elicitation, semantic-dedup verdict, or orchestration contract.

## Evidence limits

The RECIPES are evidence-informed but not a MECE or end-to-end validated causal theory of creativity.
The coordinates are skill-supplied bookkeeping axes. Case examples and gate checks are mechanical
fixtures, not success evidence; they cannot establish novelty, value, or truth.
