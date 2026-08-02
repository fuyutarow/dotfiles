---
name: forging-novel-theses
description: >-
  Generates a BATCH of testable thesis CANDIDATES for a SELECTED problem/frame with no adequate thesis.
  Use for 新規仮説 / 新しい研究アイデア, premise breaking, negative-space seeds, or structural transfer.
  Owns GENESIS: search coordinates, transformation trace, and selected-target `DONOR SET`
  correspondence. Transfer emits `Status: CANDIDATE` with target evidence `UNTESTED`, or
  `Status: MAPPING-BREAK`; donor success is never target evidence. Problem choice/dedup →
  directing-research; corpus/donor discovery → systematizing-knowledge; tacit elicitation →
  surfacing-blind-spots; facts → raising-resolution; testing → acting-on-hypotheses; topology →
  orchestrating-agents. Allocation and final packets stay SOLO. English skill; answer in the user's language.
---

# Forging novel thesis candidates

> **Version**: v2608.1.0 (2026-08-02) — donor-set correspondence and explicit mapping-break.
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

Keep **CANDIDATE**, **MAPPING-BREAK**, **DONOR SET**, **RECIPES**, **search coordinates**,
**grounded control**, **anti-default**, **coverage-gap packet**, and **COVERAGE GAP** unchanged even
in Japanese output.

## THE LAW — transform the frame, expose the transformation

> Unusual wording or a different recipe label does not make a candidate novel.
> Expose the seed source, target, operation, premise, and new discriminator. For `TRANSFER`, expose
> the donor-set locus/digest, correspondence, non-correspondence, boundary, and precision loss.
> A successful source is not target evidence: a transfer ends as **CANDIDATE** with target-side
> evidence `UNTESTED`, or as **MAPPING-BREAK** when the invariant cannot be preserved.

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
4. the requested output is candidate generation, not selection or testing.

If the problem itself is still being found, compared, or formulated, route to `directing-research`.
If novelty relative to a literature corpus is unknown, mark it `UNVERIFIED` and route the evidence work
to `systematizing-knowledge`; do not invent a prior.

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

Record these field **types independently**. They are orthogonal bookkeeping axes, not a claim that
their values are statistically independent.

- **Seed provenance** — where the material came from:
  `TOKEN — specific seed/source`, where `TOKEN` is
  `OBSERVATION | ACCOUNT | CONSTRAINT | ANALOGY | TACIT | NEGATIVE-SPACE | OTHER`.
- **Transformation target** — what part of the frame changes:
  `OBJECT | RELATION | REPRESENTATION | REGIME | EVIDENCE | CONSTRAINT | OTHER — named kind`.
- **Operation** — what transformation is applied:
  `INVERT | REMOVE | SUBSTITUTE | TRANSFER | DECOMPOSE | COUPLE | GENERALIZE | BOUND | OTHER — named kind`.
- **Premise challenged** — one specific premise, or exactly `NONE — grounded control`.
- **New discriminator** — a concrete contrast against the input, nearest prior, or competing account.

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

The RECIPES are constraint inversion, result generalization, competing-account synthesis,
structural transfer, representation change, and atypical recombination. Their mechanics and rejection
tests live in `references/generation-engine.md`.

### Structural transfer is not decoration

A transfer starts only from a frozen `DONOR SET` from `systematizing-knowledge` and a selected target
frame. Compare the named donor records, then map roles rather than surface nouns. The attempt must
name: source relation/locator, target relation before transfer, at least two correspondence pairs,
the preserved relation, concrete non-correspondence, break condition, precision loss, and a target-side
counterexample. Similarity, metaphor, topical distance, source success, or a shared tool name never
passes this gate.

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
- Handoff: directing-research — preserve this attempt in TRANSFER DISPOSITION denominator; no disposition here
- Status: MAPPING-BREAK
```

`MAPPING-BREAK` contains no thesis claim, prediction, discriminator, selection, or test verdict. It is
a negative result in the transfer route, not a weak candidate.

Run `bun scripts/gate-check.ts <candidate.md>` for ordinary packets. Every `TRANSFER` candidate or
`MAPPING-BREAK` must instead run:

```bash
bun scripts/gate-check.ts --donor-set path/to/donor-set.md path/to/transfer-bundle.md
```

The declared `Donor set` field must resolve to the same frozen artifact as `--donor-set` and carry its
SHA-256. Each declared `Donor ID` must occur there, and `Source relation / locator` must retain that
record's exact source locator. Do not validate a transfer packet against a replacement donor set or
substitute an unrelated source behind a valid donor ID.

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

`directing-research` owns semantic deduplication. It sends a coverage-gap packet when either condition
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
3. **Allocate coordinate cells before drafting.** Include the grounded control and anti-default; choose
   premise, target, operation, and intended discriminator independently of recipe labels.
4. **Apply useful recipes.** For `TRANSFER`, read the frozen `DONOR SET`, compare donors, and write
   correspondence/non-correspondence before drafting a claim. Preserve the transformation trace while
   it is still visible.
5. **Derive the prediction and discriminator.** A transfer candidate keeps target-side evidence
   exactly `UNTESTED`; if its relation cannot survive the target, emit `MAPPING-BREAK`. If a candidate
   creates no new contrast, reject it as a paraphrase or decorative analogy.
6. **Name the nearest prior.** State the exact delta; when evidence is missing, use `UNVERIFIED`.
7. **Flag frame changes.** A candidate may reveal that the problem's object or relation should change.
   Do not silently mutate the input; set the flag so `directing-research` can decide.
8. **Run the batch floor.** Reject coordinate collapse before return; never substitute recipe-counting.
9. **Return packets without ranking.** `directing-research` freezes and semantically deduplicates them.
10. **Honor at most one coverage-gap packet.** Regenerate once in its unoccupied cell or emit
   `COVERAGE GAP`; do not loop.

## Quality floor inside generation

Reject a candidate before return if any is true:

- it restates the input problem as a solution-shaped sentence;
- the transformation trace contains only adjectives (“more adaptive”, “AI-powered”, “holistic”);
- the new prediction was already entailed by the input;
- the discriminator says only “better”, “different”, or “improved” without contrasting outcomes;
- the analogy maps objects but not relations;
- a `TRANSFER` field uses donor success as target-side evidence or omits its non-correspondence,
  boundary, precision loss, or target counterexample;
- a failed correspondence is hidden, rewritten as a candidate, or treated as proof that no other
  source relation can work;
- the candidate merges two accounts without preserving a discriminator;
- `TACIT` was inferred, simulated, or copied from an `UNELICITED` probe;
- a claimed prior or fact has no locator and is not marked `UNVERIFIED`;
- the status claims `VALIDATED`, `SUPPORTED`, or `READY`.

These are **generation-completeness** failures, not comparative selection.

## One-home boundaries

| Ask / state | Route |
|---|---|
| “Which research problem should I choose?” | `directing-research` |
| “What does this literature establish, and is the idea actually novel?” | `systematizing-knowledge` |
| “Find source-side relations across fields, without choosing target correspondences.” | `systematizing-knowledge` — it returns a frozen target-agnostic `DONOR SET` |
| “Admit, test, adopt, retire, or otherwise decide a transfer attempt.” | `directing-research` — it owns `TRANSFER DISPOSITION`; target evidence arrives through its downstream routes |
| “Persist, review, supersede, or retire this frozen packet or transfer bundle.” | `governing-research-documentation` — govern durable locus, lineage, review, and lifecycle only; mapping and `MAPPING-BREAK` meaning stay HERE |
| “What are we not seeing, and what does the practitioner know but not write down?” | `surfacing-blind-spots` |
| “Is this residual real or an artifact?” | `raising-resolution` |
| “Generate distinct thesis candidates for this selected frame.” | **HERE** |
| “Which candidate is important/feasible enough to admit?” | `directing-research` |
| “Design a precommitted falsifying experiment for this expensive/irreversible chosen thesis.” | `acting-on-hypotheses` |
| “Run this deterministic, bounded, reversible check.” | domain/plain executor; return `EXECUTOR RESULT` to `directing-research` |
| “Should we commit, pivot, or withdraw?” | `acting-on-hypotheses` for one gated expensive/irreversible tree; `directing-research` for a portfolio |
| “Who should generate, critique, and accept, and when?” | `orchestrating-agents` |
| “Write the paper claim from completed evidence.” | `arguing-research-papers` |

## Execution model — genesis stays signed in one context

Coordinate allocation, tacit-seed admission, collapse adjudication, and final packet signing stay SOLO.
The domain packet and coordinate cells are fixed here. If multiple generators are useful,
`orchestrating-agents` owns:

- blind initial generation versus visible collaboration;
- subgroup topology and evidence visibility;
- how generators remain blind until `directing-research` declares its domain batch frozen, and when
  critique becomes visible after that transition;
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
