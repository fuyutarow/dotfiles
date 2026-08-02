# Generation engine — coordinate search with reusable recipes

This file owns candidate construction mechanics. The coordinate field types and enum values live in
`SKILL.md`; candidate ranking and testing live elsewhere.

## Shared preparation

Copy the input frame verbatim. Extract:

- source-located observations, accounts, constraints, analogies, and negative space;
- entities / units;
- relations;
- assumed constraints;
- observed regularities and residuals;
- current representation;
- nearest known accounts.

Do not “improve” this extraction. It is the before-state used by every transformation trace.

For a `TACIT` seed, accept only the `surfacing-blind-spots` handoff defined in `SKILL.md`. Carry the
packet locus, probe ID, and `HUMAN:<owner>@<attestation-locus>` in the seed field. A plausible story
about what a practitioner “probably knows” is synthetic model output, not tacit evidence.

## Allocate functional search coordinates first

Build candidate slots before writing claims:

```markdown
| Candidate | Seed provenance | Target | Operation | Premise challenged | Intended discriminator |
|---|---|---|---|---|---|
| C1 | [...] | [...] | [...] | NONE — grounded control | [...] |
| C2 | [...] | [...] | [...] | [specific anti-default premise] | [...] |
```

Treat each row as a cell to execute. The row is not a score and does not imply that all combinations are
legitimate. Reject a cell when its operation cannot act on its target, its seed lacks provenance, or its
premise change violates a fixed fact without changing the question. Name an open-set value with `OTHER`
rather than coercing it into a near label.

The grounded control transforms the frame without challenging a premise; it prevents a batch from
confusing contrarianism with novelty. The anti-default changes a specific load-bearing premise; it
prevents the control from becoming the entire search neighborhood.

## Recipes are operators, not bins

The following six RECIPES are reusable ways to execute a coordinate cell. They overlap: constraint
inversion can also be representation change, while structural transfer can also couple two accounts.
Never count recipe labels as coverage.

## Recipe A — constraint inversion

For each constraint, classify it:

| Class | Examples | Allowed move |
|---|---|---|
| physical / mathematical | conservation law, identifiability limit | cannot hand-wave away; change the question or derive a bound |
| measurement / access | sensor resolution, missing regime | propose an observation or representation that changes access |
| institutional / conventional | standard workflow, benchmark convention | invert only with provenance and a mechanism |
| unknown | unsupported “cannot” | mark `UNVERIFIED`; do not classify by confidence |

Trace:

```text
claimed constraint -> class + provenance -> permissible inversion -> changed relation -> prediction
```

Reject a candidate that treats an inconvenient physical limit as a convention.

## Recipe B — result generalization

Start from a controlled result or systematic residual:

```text
observation in regime A
-> proposed relation explaining it
-> boundary conditions
-> prediction in regime B
```

Maintain artifact alternatives. An anomaly does not contain its explanation. If the observation itself
is not verified, route it to `raising-resolution` and mark the candidate dependent on that result.

## Recipe C — competing-account synthesis

Given accounts A and B:

1. name where they disagree;
2. preserve the mechanisms that explain different observations;
3. propose a combined or higher-level relation;
4. derive an observation distinguishing the synthesis from A and B.

`A + B is holistic` is not a synthesis. The new account must risk a different prediction.

## Recipe D — structural transfer

Use a frozen `DONOR SET` from `systematizing-knowledge`, not a remembered source anecdote. Its path,
SHA-256, and selected IDs are inputs. Compare the donor records before selecting a relation; two
surface-similar source labels are not two relation-level donors.

Write the correspondence before writing a thesis:

```markdown
- Donor set: path=<same path passed to --donor-set>; sha256=<digest>
- Donor IDs: D1, D2
- Source comparison:
- Source relation / locator:
- Target relation before transfer:
- Correspondence map: source role -> target role; source role -> target role
- Preserved relation:
- Non-correspondence:
- Transfer boundary:
- Precision loss:
- Target-side evidence: UNTESTED
- Target-side counterexample:
```

Run the transfer packet with the exact frozen source artifact:

```bash
bun scripts/gate-check.ts --donor-set path/to/donor-set.md path/to/transfer-bundle.md
```

The packet's `Donor set` declaration must be `path=<same path>; sha256=<digest>`; the checker verifies
the digest and that every selected donor ID is actually present. Do not switch donor files after
drafting or use a donor's source-domain result as target support.

Comparing multiple source examples may help abstract a source-side schema; distance alone does not.
For a single donor, carry its `SINGLE-DONOR LIMIT` exactly. If no admissible correspondence preserves
the relation, emit `MAPPING-BREAK` with the failed invariant and evidence locus; do not invent a
candidate. Reject object-name substitution, metaphor, and transfers that predict nothing new.

## Recipe E — representation change

Transform one representational choice:

- object -> relation;
- static state -> transition or trajectory;
- individual -> interaction or population;
- average -> distribution or tail;
- forward model -> inverse problem;
- point estimate -> identifiable set;
- one scale -> multi-scale coupling.

Trace both visibility and cost:

```text
old representation hides X
-> new representation exposes relation Y
-> prediction Z becomes expressible
-> information or assumptions discarded
```

Changing notation without changing an expressible relation is not a thesis.

## Recipe F — atypical recombination

Anchor the candidate in a conventional component that is known to function. Add one bounded atypical
component and state the mechanism connecting them.

```text
grounded base + atypical component -> interaction mechanism -> new prediction
```

Avoid novelty stacks in which every component is unverified. Bibliometric association between atypical
combinations and impact does not show that atypicality causes truth or value.

## Batch discipline

Before drafting:

```markdown
- Requested count:
- Coordinate allocation:
- Grounded control ID:
- Anti-default ID, or precise EXEMPT:
- Stop condition:
```

During generation:

- keep each candidate independent until its packet exists;
- do not rank candidates live;
- preserve failed transformations in the denominator;
- derive the matrix key from premise, target, operation, and discriminator;
- ignore recipe labels when checking coverage;
- stop when the declared count/limit is reached.

Run `gate-check.ts` over the complete file. The script auto-detects multiple `## Candidate ...` sections,
checks each packet, emits the derived matrix, and rejects mechanically collapsed batches. If any
section is `TRANSFER` or `MAPPING-BREAK`, pass the frozen donor artifact through `--donor-set`.
This is a pre-dedup floor; it cannot detect semantic paraphrases, relation correctness, or target fit.

After return, `directing-research` owns freezing and semantic deduplication. It returns a coverage-gap
packet only when the unique batch has collapsed:

```markdown
## Coverage-gap packet
- Requested count:
- Unique count after semantic dedup:
- Shared coordinate: [PREMISE | TARGET | DISCRIMINATOR, with value]
- Occupied legitimate cells:
- Target unoccupied legitimate cell: [premise × target × operation × discriminator, or NONE + reason]
```

Accept at most one packet for the same batch. When a target cell is named, generate exactly one new
candidate in that cell while retaining all packet fields. When the target is `NONE`, the cell proves
illegitimate during construction, or the new packet still fails the gap condition, return:

```markdown
COVERAGE GAP: [missing coordinate/cell] — [why no legitimate candidate was produced]
```

Do not create a second regeneration round. Do not rank, select, design a test, or change the fixed frame
to make the gap disappear.

## Prediction and discriminator test

A candidate's “new testable prediction” passes the generation floor only if:

1. it is not already entailed by the input frame;
2. it follows from the stated transformation;
3. a possible observation could differ from the nearest prior or competing account;
4. it is scoped enough for a discriminating action; `directing-research` later routes that action
   to `acting-on-hypotheses` only at the expensive/irreversible hard gate, otherwise to the
   domain/plain executor.

The “new discriminator” then states the contrast explicitly:

```text
under condition X: this candidate predicts Y; the input/prior/account predicts Z
```

The two fields are related but not duplicates: the prediction states what follows; the discriminator
states which alternative outcome makes that consequence informative. This does not prove feasibility or
design the experiment.
