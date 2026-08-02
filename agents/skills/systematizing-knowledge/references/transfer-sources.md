# Transfer-source synthesis — compile a target-agnostic DONOR SET

> **SOLE owner** of bounded donor discovery, source-located relation extraction, cross-source
> comparison, and the `DONOR SET` handoff. Target mapping, target prediction, and thesis genesis
> belong to `forging-novel-theses`; route admission and later disposition belong to
> `directing-research`.

## Entry and stop boundary

Use this branch only when a selected or selected-for-probe research frame needs an external
relation seed and the relevant source corpus is not already supplied in a checked form. The input
is a **transfer search question stated without target-object correspondences**. The output is one
target-agnostic `DONOR SET`.

This branch stops before answering any of these questions:

- Which source role maps to which target role?
- Does the relation hold in the target?
- What target prediction follows?
- Is the resulting thesis worth testing or adopting?

Those are not unfinished SoK work. They are later owners' work.

## Search for relations, not decorative distance

Search by the unresolved relation, constraint, or observable consequence. Use mechanism synonyms,
older terminology, and adjacent disciplines. Surface vocabulary and object names may retrieve a
candidate source, but they never admit it into the donor set.

For each candidate source, extract:

```text
source locus | source domain and scope | roles/entities | relation |
preconditions | observable consequence | boundary/failure
```

Do not select a source because its domain is farther away, fashionable, or metaphorically vivid.
Do not infer that a broker, wiki, shared jargon, or physical contact makes a relation transferable.

## Compare before abstracting

Prefer at least two distinct donor evidence units when claiming a common relational schema. Compare
their roles, relation, preconditions, consequences, and failures explicitly. Two rows copied from
one result or one locator are one donor evidence unit, not two.

A single located donor is legal only as:

```text
SINGLE-DONOR LIMIT — hypothesis seed only; no abstract schema established;
no target transport established
```

Its `Common relational schema` field begins `HYPOTHESIS SEED —`. Never prohibit a useful lone
source; prohibit its silent promotion into a general schema or target-side support.

## DONOR SET contract

```markdown
# DONOR SET

- Transfer search question: [target-independent relation question]
- Coverage contract: [corpus origin, search route, date/bounds, and no completeness overclaim]
- Selection rule: [relation/precondition fit, explicitly not surface names/vocabulary/distance]

## Donor records

| Donor ID | Source / locator | Source domain | Source scope | Roles / entities | Relation | Preconditions | Observable consequence | Boundary / failure |
|---|---|---|---|---|---|---|---|---|
| D1 | [...] | [...] | [...] | [...] | [...] | [...] | [...] | [...] |

## Comparison

- Common relational schema: [common relation, or HYPOTHESIS SEED — ...]
- Non-common structure: [what differs across donors and must not be transported silently]
- Retrieval-only cues: [surface features that helped search but do not justify transfer]
- Single-donor limit: [NONE — why multiple evidence units were compared, or SINGLE-DONOR LIMIT — ...]

## Knowledge state

- Known: [...]
- Uncertain: [...]
- Disputed: [...]
- Missing: [target correspondence/evidence is normally here]

## Handoff

- Handoff: forging-novel-theses — [donor IDs, relations, scopes, and boundaries];
  no target mapping, target prediction, thesis, or test verdict
```

Run:

```bash
bun scripts/check-donor-set.ts path/to/donor-set.md
```

The checker verifies the shape, stable donor IDs, exact source locators, distinct evidence units,
single-donor limit, and ownership stop. A locator is either `path/file.md:line` or a DOI/URL paired
with a page, section, table, figure, or fragment anchor; a bare DOI or page number is not enough.
It also rejects an explicit positive target mapping, support, prediction, or thesis claim hidden in
`Known` or a donor-record cell. `Missing` and `Handoff` may state the inverse prohibition (for
example, “no target mapping”) because that is the required ownership boundary. The checker cannot
decide whether the extracted relation is correct, whether the sources are independent in a
scientifically important sense, or whether the relation can survive the target.

## Handoff semantics

`forging-novel-theses` receives the frozen donor-set path and SHA-256 plus selected donor IDs. Its
packet declares `Donor set: path=<same path>; sha256=<digest>` and is checked with
`gate-check.ts --donor-set <path-to-the-same-resolved-artifact> <packet>`, which verifies the digest,
donor IDs, and each selected record's exact source locator against this artifact. It may return a
relation-level transfer candidate or `MAPPING-BREAK`. It may not rewrite
this source record to hide a failed mapping. `directing-research` later preserves every transfer
attempt in its `TRANSFER DISPOSITION` denominator.

If no source survives the source-side evidence and relation floor, return an honest bounded no-donor
position. Do not manufacture an analogy to keep the transfer route alive.

## Evidence boundary

Structure-mapping and analogical-encoding studies motivate explicit relational comparison. Their
tasks do not validate this artifact schema, real scientific discovery, or a target-side conclusion.
Boundary-object and knowledge-translation studies motivate preserving local meaning, provenance,
and break conditions. They do not prove that a wiki or shared vocabulary resolves a research
boundary. Exact source grades and limitations live in `sources.md`.
