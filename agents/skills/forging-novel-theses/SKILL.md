---
name: forging-novel-theses
description: >-
  Generates a BATCH of testable thesis CANDIDATES only when a problem/frame is selected, no adequate
  thesis exists, and a provenance-bearing seed or frozen target-agnostic DONOR SET is supplied. Use for
  新規仮説 / 新しい研究アイデア, premise breaking, grounded control, structural transfer, or one-shot
  coverage-gap recovery after a frozen/deduplicated batch collapses. Owns GENESIS and selected-target
  mapping: a transfer returns Status: CANDIDATE with target evidence UNTESTED, or MAPPING-BREAK.
  Recovery regenerates once in the supplied missing cell; if diversity cannot be restored, it returns
  explicit COVERAGE GAP. Never ranks, tests, admits, adopts, or discovers donors. Donor discovery →
  systematizing-knowledge; problem formulation → supervising-research-programmes; local freeze/dedup
  and admission → directing-research-sections; an expensive selected tree → acting-on-hypotheses.
  Allocation and final packets stay SOLO. English skill;
  answer in the user's language (default Japanese).
---

# Forging novel thesis candidates

> **Version**: v2608.2.0 (2026-08-02) — honest stage-1 genesis and collapse-recovery surface.
> **Scope**: candidate construction only. Input is a selected problem/frame; output is one or more
> candidate packets. Selection, testing, commitment, and program steering are intentionally elsewhere.

```bash
for f in \
  references/generation-engine.md references/boundaries.md references/lineage.md \
  references/case-ledger.md scripts/gate-check.ts tests/gate-check.test.ts \
  tests/triggers.md tests/forge-verification-ledger.md; do
  test -f "$f" || echo "MISSING $f"
done
```

## Language and stable tokens

Keep these stable tokens unchanged, including in Japanese output:

- `CANDIDATE`, `MAPPING-BREAK`, `DONOR SET`, `RECIPES`, and `search coordinates`

- `grounded control`, `anti-default`, `coverage-gap packet`, and `COVERAGE GAP`

## THE LAW — transform the frame, expose the transformation

> Unusual wording or a different recipe label does not make a candidate novel.
> Expose the seed source, target, operation, premise, and new discriminator. For `TRANSFER`, expose
> the donor-set locus/digest, correspondence, non-correspondence, boundary, and precision loss.
> A successful source is not target evidence.
> A valid transfer ends as **CANDIDATE** with target-side evidence `UNTESTED`.
> Emit **MAPPING-BREAK** when the invariant cannot be preserved.

This skill never claims:

- that distant analogies are better than local ones;

- that more candidates imply more quality;

- that novelty implies truth, importance, or feasibility;

- that a generated kill experiment validates the candidate;

- that an agent's self-rating establishes novelty;

- that source-domain success establishes target-side support, feasibility, or truth.

## Entry gate

Fire only when all are true:

1. a selected problem/frame exists;
2. its known observations and exclusions are stated;
3. no adequate thesis is already in hand;
4. a provenance-bearing seed is available, or `TRANSFER` has a frozen target-agnostic `DONOR SET`;
5. the requested output is candidate generation, not selection or testing.

If the problem itself is still being found, compared, or formulated, route to `supervising-research-programmes`.
If novelty relative to a literature corpus is unknown, mark it `UNVERIFIED`.
Route that evidence work to `systematizing-knowledge`; do not invent a prior.

## Input brief

```markdown
- Selected problem/frame:
- Observations it must explain:
- Competing accounts already known:
- Excluded cheap victories:
- Known prior position:
- What may be transformed:
- Blind-spot packet handoff, if any:
- Donor-set handoff (`path=...; sha256=...` + selected donor IDs), if `TRANSFER` is requested:
- Requested candidate count:
```

An absent field is a visible uncertainty. It is not permission to silently redefine the problem.

## Search coordinates — the functional partition

Record these field **types independently**. They are bookkeeping axes.
Do not claim their values are statistically independent.

| Field | Required record |
|---|---|
| **Seed provenance** | `TOKEN — specific seed/source`, where `TOKEN` is `OBSERVATION | ACCOUNT | CONSTRAINT | ANALOGY | TACIT | NEGATIVE-SPACE | OTHER` |
| **Transformation target** | `OBJECT | RELATION | REPRESENTATION | REGIME | EVIDENCE | CONSTRAINT | OTHER — named kind` |
| **Operation** | `INVERT | REMOVE | SUBSTITUTE | TRANSFER | DECOMPOSE | COUPLE | GENERALIZE | BOUND | OTHER — named kind` |
| **Premise challenged** | one specific premise, or exactly `NONE — grounded control` |
| **New discriminator** | a concrete contrast against the input, nearest prior, or competing account |

`OTHER` without a name fails. The open set prevents the taxonomy from turning current labels into a
closed theory of discovery.

### Human-tacit seam

Use `TACIT` only when a `Blind-spot packet` hands off to `forging-novel-theses`.

- The fact must come from a `Tacit-knowledge probes` row.
- Require `Provenance: HUMAN:<owner>@<attestation-locus>` and an `Answer` other than
  `UNELICITED`.
- Encode it as
  `TACIT — Blind-spot packet <locus>, Probe P<ID>, HUMAN:<owner>@<attestation-locus>`.
- Never complete `UNELICITED` or role-play a practitioner.
- `Assumption ledger: INFERENCE` and `Open-set residual` are exploration targets, not tacit facts.

## Generation RECIPES — useful, not MECE

The six existing routes are useful **RECIPES** for constructing transformations. They are not MECE.
Two recipe labels are not diversity proof. Allocate search-coordinate cells before selecting a recipe.
Reusing one recipe is valid when cells differ. Relabeling one cell changes nothing.

The RECIPES include constraint inversion, result generalization, and competing-account synthesis.
They also include structural transfer, representation change, and atypical recombination.
Their mechanics and rejection tests live in `references/generation-engine.md`.

### Structural transfer is not decoration

A transfer starts only from a frozen `DONOR SET` from `systematizing-knowledge` and a selected target
frame. Compare the named donor records, then map roles rather than surface nouns.
The attempt must name the source relation/locator and the target relation before transfer.
It must also name at least two correspondence pairs and the preserved relation.
Finally, name concrete non-correspondence, break condition, precision loss, and a target counterexample.
Similarity, metaphor, topical distance, source success, or a shared tool name never passes this gate.

When every admissible mapping breaks, preserve the failure as `MAPPING-BREAK`; do not force it into a
candidate. A candidate has `Target-side evidence: UNTESTED` until target evidence exists elsewhere.

## Candidate packet contract

Emit one packet per candidate:

```markdown
## Candidate [ID]

- Input problem/frame: [...]
- Generation recipe (optional): [...]
- Seed provenance: [TOKEN — specific seed/source and locator]
- Transformation target: [OBJECT | RELATION | REPRESENTATION | REGIME | EVIDENCE | CONSTRAINT | OTHER — named kind]
- Operation: [INVERT | REMOVE | SUBSTITUTE | TRANSFER | DECOMPOSE | COUPLE | GENERALIZE | BOUND | OTHER — named kind]
- Premise challenged: [specific premise, or exactly NONE — grounded control]
- Transformation trace: [old frame/relation -> operation -> transformed relation]
- Thesis claim: [one testable explanatory or prescriptive sentence]
- New testable prediction: [what follows that was not already in the input]
- New discriminator: [candidate outcome versus input/prior/competing-account outcome]
- Nearest prior / novelty delta: [prior + exact delta, or UNVERIFIED + search needed]
- Frame update flag: [NO, or YES + how this changes the problem frame]
- Status: CANDIDATE
```

For `Operation: TRANSFER`, add these fields to the same candidate packet:

```markdown
- Transfer attempt ID: [stable ID]
- Donor set: [path=<frozen donor-set path>; sha256=<lowercase 64-hex digest>]
- Donor IDs: [comma-separated IDs present in the supplied donor set]
- Source comparison: [explicit comparison, or SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established; no target transport established]
- Source relation / locator: [relation + exact source locus]
- Target relation before transfer: [pre-transfer target relation]
- Correspondence map: [source role -> target role; source role -> target role]
- Preserved relation: [bounded relation retained]
- Non-correspondence: [concrete unmapped property or constraint]
- Transfer boundary: [condition under which this mapping breaks]
- Precision loss: [what becomes weaker, approximate, or unidentifiable]
- Target-side evidence: UNTESTED
- Target-side counterexample: [target observation that would defeat this candidate]
```

If this relation-level attempt cannot preserve its invariant, emit this packet instead:

```markdown
## MAPPING-BREAK [ID]

- Transfer attempt ID: [stable ID]
- Input problem/frame: [...]
- Donor set: [path=<frozen donor-set path>; sha256=<lowercase 64-hex digest>]
- Donor IDs: [...]
- Source comparison: [...]
- Source relation / locator: [...]
- Target relation before transfer: [...]
- Attempted correspondence: [source role -> target role; source role -> target role]
- Non-correspondence axis: [OBJECT | RELATION | REPRESENTATION | REGIME | EVIDENCE | CONSTRAINT | OTHER — concrete mismatch]
- Failed invariant: [relation that cannot be preserved]
- Transfer boundary: [condition that breaks it]
- Evidence / locator: [source relation plus target mismatch locus]
- Handoff: directing-research-sections — preserve this attempt in TRANSFER DISPOSITION denominator; no disposition here
- Status: MAPPING-BREAK
```

`MAPPING-BREAK` contains no thesis claim, prediction, discriminator, selection, or test verdict. It is
a negative result in the transfer route, not a weak candidate.

Run `bun scripts/gate-check.ts <candidate.md>` for ordinary packets. Every `TRANSFER` candidate or
`MAPPING-BREAK` must instead run:

```bash
bun scripts/gate-check.ts --donor-set path/to/donor-set.md path/to/transfer-bundle.md
```

The declared `Donor set` must resolve to the same frozen artifact as `--donor-set` and carry its SHA-256.
Every declared `Donor ID` must occur in that artifact.
The `Source relation / locator` must retain the record's exact source locator.
Validate only against the declared frozen donor set.
Never substitute a different source behind a valid donor ID.

It validates every candidate in a detected batch and derives the coverage matrix.
PASS cannot establish novelty, value, feasibility, target fit, or truth.

## Batch contract and collapse recovery

For every multi-candidate batch, prepend:

```markdown
## Batch contract
- Requested candidate count: [integer]
- Grounded control candidate: [ID whose premise is exactly NONE — grounded control]
- Premise-breaking anti-default candidate: [ID]
- Anti-default EXEMPT: [omit, or EXEMPT — precise reason]
- Collapse recovery: ONE targeted regeneration in an unoccupied legitimate cell; then COVERAGE GAP
```

Require a grounded control and a premise-breaking anti-default. A precise, justified `EXEMPT` may
replace the anti-default.

The matrix key is `premise × target × operation × discriminator`. Candidate fields are its sole data
home. `gate-check.ts` derives the matrix. Recipe labels do not enter the key.

`directing-research-sections` owns local semantic deduplication. It sends a coverage-gap packet when either condition
holds:

- every unique candidate shares one premise, target, or discriminator;
- unique count is below `min(3, requested count)`.

The packet names occupied cells and one legitimate unoccupied cell. Regenerate **exactly once** in that
cell. If the attempt fails, emit `COVERAGE GAP` with the missing coordinate and reason. Never rank or
test during recovery.

## Procedure

1. **Restate the frame without improving it.** Preserve the input before transformation.

2. **Build the seed pool.** Label every seed's provenance. Enforce the human-tacit seam before admitting
   any `TACIT` seed.

3. **Allocate coordinate cells before drafting.** Include the grounded control and anti-default.
   Choose premise, target, operation, and intended discriminator independently of recipe labels.

4. **Apply useful recipes.** For `TRANSFER`, read the frozen `DONOR SET` and compare donors.
   Write correspondence and non-correspondence before drafting a claim. Preserve the visible trace.

5. **Derive the prediction and discriminator.** Keep transfer evidence exactly `UNTESTED`.
   Emit `MAPPING-BREAK` if the relation cannot survive the target. Reject candidates with no new contrast.

6. **Name the nearest prior.** State the exact delta. Use `UNVERIFIED` when evidence is missing.

7. **Flag frame changes.** A candidate may expose a needed change to the problem's object or relation.
   Do not mutate the input. Let `supervising-research-programmes` decide from the flag.

8. **Run the batch floor.** Reject coordinate collapse before return. Never substitute recipe-counting.

9. **Return packets without ranking.** `directing-research-sections` freezes and semantically deduplicates them.

10. **Honor at most one coverage-gap packet.** Regenerate once in its unoccupied cell or emit
    `COVERAGE GAP`. Do not loop.

## Quality floor inside generation

Reject a candidate before return if any is true:

- it restates the input problem as a solution-shaped sentence;

- the transformation trace contains only adjectives such as “adaptive”, “AI-powered”, or “holistic”;

- the new prediction was already entailed by the input;

- the discriminator says only “better”, “different”, or “improved” without contrasting outcomes;

- the analogy maps objects but not relations;

- a `TRANSFER` field uses donor success as target-side evidence;

- a `TRANSFER` omits non-correspondence, boundary, precision loss, or target counterexample;

- a failed correspondence is hidden or rewritten as a candidate;

- a local mapping failure is claimed to rule out every other source relation;

- the candidate merges two accounts without preserving a discriminator;

- `TACIT` was inferred, simulated, or copied from an `UNELICITED` probe;

- a claimed prior or fact has no locator and is not marked `UNVERIFIED`;

- the status claims `VALIDATED`, `SUPPORTED`, or `READY`.

These are **generation-completeness** failures, not comparative selection.

## One-home boundaries

| Ask / state | Route |
|---|---|
| “Which research problem should I choose?” | `supervising-research-programmes` |
| “What does this literature establish, and is the idea actually novel?” | `systematizing-knowledge` |
| “Find source-side relations across fields, without choosing target correspondences.” | `systematizing-knowledge` — it returns a frozen target-agnostic `DONOR SET` |
| “Admit, test, or otherwise decide one local transfer attempt in a granted section.” | `directing-research-sections` — it owns local `TRANSFER DISPOSITION`; target evidence arrives through its downstream routes |
| “Adopt, retire, reopen, or allocate across the programme.” | `supervising-research-programmes` — global programme disposition only |
| “Persist, review, supersede, or retire this frozen packet or transfer bundle.” | `governing-research-documentation` — govern durable locus, lineage, review, and lifecycle only; mapping and `MAPPING-BREAK` meaning stay HERE |
| “What are we not seeing, and what does the practitioner know but not write down?” | `surfacing-blind-spots` |
| “Is this residual real or an artifact?” | `raising-resolution` |
| “There is an anomaly the current account does not predict, and no frame is selected yet.” | `forming-hypotheses-from-anomalies` — it fixes the contrast, explains inside the current vocabulary first, and builds exactly ONE `HYPOTHESIS` packet; one typed `TRANSFER` with a non-empty `Introduced terms` row is a provenance-bearing seed for entry-gate item 4. It never ranks a batch, and this skill never routes back to it (2026-09-05, reciprocal of that skill’s DECISIVE cut) |
| “Generate distinct thesis candidates for this selected frame.” | **HERE** |
| “Which candidate is important/feasible enough to admit locally?” | `directing-research-sections` |
| “Design a precommitted falsifying experiment for this expensive/irreversible chosen thesis.” | `acting-on-hypotheses` |
| “Run this deterministic, bounded, reversible check.” | domain/plain executor; return `EXECUTOR RESULT` to `directing-research-sections` |
| “Should we commit, pivot, or withdraw?” | `acting-on-hypotheses` for one gated expensive/irreversible tree; `supervising-research-programmes` for a portfolio |
| “Who should generate, critique, and accept, and when?” | `orchestrating-agents` |
| “Write the paper claim from completed evidence.” | `arguing-research-papers` |

## Execution model — genesis stays signed in one context

Coordinate allocation, tacit-seed admission, collapse adjudication, and final packet signing stay SOLO.
The domain packet and coordinate cells are fixed here. If multiple generators are useful,
`orchestrating-agents` owns:

- blind initial generation versus visible collaboration;

- subgroup topology and evidence visibility;

- generator blindness until `directing-research-sections` declares its local batch frozen;

- critique visibility after that transition;

- who may deduplicate or veto;

- independent acceptance.

Do not use agent count as evidence of diversity. Preserve recipe, denominator, and duplicate records.
No harness → execute the same cells as serial focused passes.

## Reference index

| File | Load when |
|---|---|
| `references/generation-engine.md` | executing or debugging the generation routes |
| `references/boundaries.md` | a sibling could plausibly own the ask |
| `references/lineage.md` | checking evidence, provenance, and the limits of analogy/recombination claims |
| `references/case-ledger.md` | calibrating complete versus fake candidate packets |
| `scripts/gate-check.ts` | mechanically checking ordinary packets and frozen donor-bound transfer bundles |
| `tests/gate-check.test.ts` | changing packet grammar, frozen dependency checks, or exit semantics |
| `tests/triggers.md` | changing this description or a sibling cut |
| `tests/forge-verification-ledger.md` | auditing the genesis-only reforge |
