---
name: forging-novel-theses
description: >-
  Generate a BATCH of distinct, testable thesis CANDIDATES for a SELECTED problem/frame with no adequate
  thesis. Use for novel research hypothesis / 新規仮説 / 新しい研究アイデア / blind-spot candidate generation /
  premise breaking / negative-space seed / constraint inversion / structure transfer. Owns GENESIS
  only: typed search coordinates, transformation trace, and one collapse
  recovery. Problem choice and semantic dedup/ranking → directing-research; corpus/novelty evidence →
  systematizing-knowledge; tacit elicitation → surfacing-blind-spots; present facts → raising-resolution;
  expensive/irreversible test/commit/kill → acting-on-hypotheses; cheap reversible probe → domain/plain
  executor; agent topology → orchestrating-agents. Every
  output is exactly `Status: CANDIDATE`. No why-now, capital, portfolio, or paper verdict. Workflow-native:
  coordinate allocation and final packets stay SOLO; generators may fan out after the domain packet is
  fixed. English skill; answer in the user's language.
---

# Forging novel thesis candidates

> **Version**: v2607.4.0 (2026-07-30) — attested tacit provenance + typed collapse recovery.
> **Scope**: candidate construction only. Input is a selected problem/frame; output is one or more
> candidate packets. Selection, testing, commitment, and program steering are intentionally elsewhere.

```bash
for f in generation-engine boundaries lineage case-ledger; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/gate-check.ts || echo MISSING gate-check.ts; test -f tests/gate-check.test.ts || echo MISSING tests
```

## Language and stable tokens

Keep **CANDIDATE**, **RECIPES**, **search coordinates**, **grounded control**, **anti-default**,
**coverage-gap packet**, and **COVERAGE GAP** unchanged even in Japanese output.

## THE LAW — transform the frame, expose the transformation

> Unusual wording or a different recipe label does not make a candidate novel.
> Expose the seed source, target, operation, premise, and new discriminator.
> Every output remains a **CANDIDATE** until external evidence earns another status.

This skill never claims:

- that distant analogies are better than local ones;
- that more candidates imply more quality;
- that novelty implies truth, importance, or feasibility;
- that a generated kill experiment validates the candidate;
- that an agent's self-rating establishes novelty.

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

A transfer survives only if:

1. the source and target relations are named;
2. the mapping preserves the relevant relation;
3. the mapping yields a target prediction not already present in the input frame.

Similarity, metaphor, and topical distance alone do not pass.

## Candidate packet — the only output contract

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

Run `bun scripts/gate-check.ts <candidate.md>` for the mechanical floor.
It validates every candidate in a detected batch and derives the coverage matrix.
PASS cannot establish novelty, value, feasibility, or truth.

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
4. **Apply useful recipes.** Preserve the transformation trace while it is still visible.
5. **Derive the prediction and discriminator.** If the claim creates no new contrast, reject it as a
   paraphrase or decorative analogy.
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
| `tests/triggers.md` | changing this description or a sibling cut |
| `tests/forge-verification-ledger.md` | auditing the genesis-only reforge |
