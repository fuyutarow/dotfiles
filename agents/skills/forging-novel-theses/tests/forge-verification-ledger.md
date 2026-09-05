# Thesis-genesis reforge verification ledger — 2026-07-30

## Stage-1 trigger and prose reforge — v2608.2.0 (2026-08-02)

### KEEP decision and function map

KEEP the name and genesis-only function. The incumbent already owns candidate construction,
candidate packet schemas, selected-target correspondence, `MAPPING-BREAK`, and the packet checker.
A generic horizontal-transfer sibling would duplicate those artifacts and blur the stop condition.
Merging genesis into `directing-research` or `systematizing-knowledge` would erase the existing cuts.

```text
selected frame + no adequate thesis + provenance-bearing seed
  --construct thesis candidates--> CANDIDATE batch
selected frame + frozen target-agnostic DONOR SET
  --map source relations to the selected target--> CANDIDATE/UNTESTED | MAPPING-BREAK
frozen/deduplicated batch + one coverage-gap packet
  --regenerate once in the supplied missing cell--> recovered packet | COVERAGE GAP
all terminal genesis outputs
  --> directing-research freeze/dedup/admission
```

`systematizing-knowledge` remains the donor-discovery owner. `directing-research` remains the
problem-formulation, freeze/dedup, and admission owner. `acting-on-hypotheses` remains the owner of
an expensive selected tree's test and commitment rule. This skill never ranks, tests, admits, or
adopts its output.

### Exact stage-1 mismatch repaired

The prior description exposed the selected-frame/no-adequate-thesis entry and transfer result, but
omitted four load-bearing facts: a provenance-bearing seed or frozen donor set, the grounded control,
the post-freeze one-shot recovery with explicit `COVERAGE GAP`, and the rank/test/admit/adopt refusal.
Its routes named problem choice and donor discovery but did not expose the complete ordered handoff
back to freeze/dedup/admission.

The prior trigger regression also required body-only search-coordinate, tacit-seam, and orchestration
semantics. Those predicates could not be proved from the description that the model sees at stage 1.
Several positive fixtures omitted entry facts that the repaired description now requires. The new
fixtures state those facts, include collapse recovery, and retain near misses for missing frame, seed,
target, or genesis need.

The replacement description is 932 characters. Its regression predicate now names only text that is
actually present in that description. Packet fields and deeper execution rules remain body-level.

### Prose-debt disposition and history

Before this reforge:

```text
bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/forging-novel-theses
WARN agents/skills/forging-novel-theses: 16 prose sentences >120 chars (technical-communication debt)
```

After atomizing the same rules and moving enum-shaped material into a table:

```text
bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/forging-novel-theses
<silent: FAIL=0 WARN=0>
prose_sentences_over_120=0
```

There is no active prose-debt waiver. The historical 16-WARN waiver and earlier 10-WARN receipt remain
below; they are evidence of the prior states, not current exemptions. One older pointer called the
then-active receipt “15-WARN”; the command receipt was 16. This note corrects the mismatch without
deleting or rewriting the historical receipt.

### Verification receipts

- Codex `quick_validate.py` -> `Skill is valid!`.
- `skill-check.ts` -> silent, `FAIL=0 WARN=0`.
- `bun test agents/skills/forging-novel-theses/tests/gate-check.test.ts` ->
  `31 pass, 0 fail, 110 expect() calls`.
- Atomic build-order existence check -> exit 0, no missing artifact.
- Description measurement -> `description_chars=932`; all signed stage-1 predicates present.
- Trigger desk-check against current sibling descriptions -> 8 FIRES, 16 MUST-NOT-FIRE, and 11
  ordered routes pass. The checked routes include donor discovery -> mapping/genesis -> admission,
  problem formulation -> genesis, one collapse recovery only, and direct routing of an expensive
  selected tree to `acting-on-hypotheses`.
- Scoped `git diff --check` -> exit 0.
- Frozen base remained `97ec05e84f77068144ecbaca793cf6b3a9a22a12`.

The trigger desk-check is lexical human arbitration, not a live installed-skill invocation. The packet
tests and structural checker cannot establish novelty, semantic diversity, correspondence quality,
target fit, value, or truth. No historical receipt was erased, no sibling was edited, and no commit
was created by this author task.

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

## PROSE-DEBT waiver (2026-09-05)

Touched by the `forming-hypotheses-from-anomalies` forge: ONE reciprocal routing row added to
SKILL.md. F2 requires reciprocal pointers, the new skill's DECISIVE cut named this table, and the
row did not yet exist. SKILL.md body is at 0 prose-debt WARNs. `references/` carries 32 long
sentences (worst `generation-engine.md`, 14), all PRE-EXISTING and untouched by this edit.

**Waived**, per `forging-skills` `references/architecture.md` §5: full atomization is explicitly
NOT indicated for references' argued prose. Queue position: next reforge of this skill.
