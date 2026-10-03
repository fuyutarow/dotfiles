# Evidence ledger — separate evidence units and preserve the inference chain

> **SOLE owner** of result-to-claim modeling, source-claim and synthesis-claim grammar, JSONL claim
> schema, locator policy, and the deterministic ledger floor. Record/report/study search and
> screening records live in `framing-and-corpus.md`; appraisal and synthesis semantics live in
> `synthesis.md`.

## 1. Two linked ledgers, not one overloaded table

Keep:

1. a **corpus/evidence ledger** for the record/report/study graph from `framing-and-corpus.md` and
   its result records; and
2. a **claim ledger** for source claims and synthesis claims.

A paper can report several studies and many results. A study can have several reports. A synthesis
claim can draw from several source claims. Collapsing those units into one “canonical claim row”
destroys flow counts, independence, and result-level context.

Use stable identifiers:

```text
R-*  search records
P-*  reports/publications
S-*  studies or artifacts
E-*  results/effect estimates
C-*  source claims
Y-*  synthesis claims
Q-*  open questions
```

The prefixes are a house convention, not a scientific standard. Stability matters more than the
letters: never renumber identifiers merely to make them sequential.

## 2. Extract source claims, not paper summaries

A source claim records one proposition at one scope:

```text
<claim> | scope: <population/system, intervention/exposure, comparator, outcome/construct,
setting, time, measurement> | source: <stable id + exact locator>
```

Split claims when their proposition, scope, evidence type, or assessment differs. Do not merge
semantically similar prose until `synthesis.md` has tested that the estimands or constructs align.

### Exact locator

Every source link needs a locator a verifier can reach in one hop:

- quantitative result: table, figure, result paragraph, appendix, or dataset row;
- theorem: theorem/lemma number plus assumptions;
- definition: section/page or standards clause;
- security result: threat model plus experiment, trace, or artifact locus;
- bibliographic fact: title page, proceedings record, DOI metadata, or repository history.

An abstract is a triage source, not a sufficient locator for a load-bearing result when full text is
available. If only the abstract is accessible, record that limitation.

## 3. Preserve result fields without making them universal

Attach the fields that the claim actually depends on:

| Claim type | Extract when applicable |
|---|---|
| Quantitative effect | estimand, comparison, estimate, uncertainty, units, sample, follow-up, analysis set |
| Predictive performance | target population/distribution, split unit, dataset version, metric, baseline, tuning/compute budget, uncertainty |
| Qualitative finding | participant/context, analytic method, theme/construct, supporting excerpt, author reflexivity |
| Theory/proof | assumptions, definitions, statement, proof status, domain, approximation or limiting regime |
| Security claim | threat model, attacker capability, preconditions, target version, success criterion, reproduction/artifact |
| Taxonomy/definition | purpose, object class, decision rule, boundary cases, provenance |

Use explicit values such as `not reported`, `not applicable`, `not accessible`, or `unclear`.
Do not encode all four as `???`; they imply different next actions.

## 4. Claim-ledger JSONL schema

One JSON object per line. Every row requires the scalar fields shown below and the normalized
`sources`, `derived_from`, and `relations` arrays, even when an array is empty. `assessment` is
required only when `load_bearing` is true and is validated whenever present. Extra fields are
allowed for claim-type-specific extensions.

```json
{
  "claim_id": "C-001",
  "claim": "The exact proposition, not a topic label.",
  "claim_type": "empirical",
  "scope": "Population/system, comparison, outcome/construct, setting, and relevant bounds.",
  "load_bearing": true,
  "sources": [
    {
      "source_id": "doi:10.xxxx/example",
      "locator": "Fig. 3 and Methods §2.4",
      "role": "supports"
    }
  ],
  "derived_from": [],
  "assessment": {
    "status": "supported-with-limitations",
    "basis": "Direct estimate under the stated scope; no external validation.",
    "limitations": ["single site", "wide interval"]
  },
  "relations": [
    {
      "target": "C-002",
      "type": "qualifies",
      "basis": "Uses the same outcome under an out-of-distribution setting."
    }
  ]
}
```

Allowed `claim_type` values:

```text
empirical | theoretical | definition | methodological | synthesis | open-question
```

Allowed `assessment.status` values:

```text
supported | supported-with-limitations | uncertain | not-comparable | unsupported
```

`unsupported` means the current evidence does not support the proposition. It does not assert the
negation. Use an explicit source claim for the negation when evidence supports it.

Allowed relation types:

```text
supports | extends | qualifies | conflicts | not-comparable
```

The relation label is a synthesis judgment and therefore requires `basis`. A relation need not be
symmetrical: “A qualifies B” can coexist with “B is qualified by A” in prose without duplicate rows.

`role` is an optional, non-empty source-note string; the checker does not impose a role vocabulary.
Blank JSONL lines are ignored, identifiers need not encode claim type, and forward references are
allowed when they resolve within the same file. Unknown fields are retained for extensions. Core
strings and string-array items must be non-empty after trimming; `assessment.limitations` contains
strings and may be empty. A file containing no claim rows fails the deterministic floor.

### Provenance rule

- Source claims (`empirical`, `theoretical`, `definition`, `methodological`) require at least one
  `sources` entry with `source_id` and `locator`.
- `synthesis` and `open-question` claims require at least one `derived_from` claim or direct source.
- A `load_bearing` claim requires an `assessment` with status, basis, and a limitations array.
- Every `derived_from` and relation target must resolve to another row.
- Derivation links must be acyclic.

The copyable example is `assets/claim-ledger.example.jsonl` from the skill root.

## 5. Synthesis claims

A synthesis claim states what the editor infers from source claims:

```text
Y-004 | claim: <bounded position> | scope: <where it holds> |
derived_from: [C-011, C-019, C-023] |
assessment: <status + evidence-specific basis + limitations>
```

Do not make the synthesis claim sound as though a cited paper stated it. `derived_from` marks the
editorial inference and keeps the sources’ original propositions intact.

When a conclusion depends on a judgment outside the literature, add that judgment to
`assessment.basis`: value trade-offs, stakeholder priorities, or an author assumption must not
masquerade as empirical evidence.

## 6. Discrepancy preservation

Keep discrepant source claims separate until synthesis has answered:

1. Are they about the same construct or estimand?
2. Are populations, settings, comparators, measures, and time windows aligned?
3. Are uncertainty and dependence represented?
4. Is one result at materially higher risk of bias?

If any answer is no, `not-comparable` may be the correct relation. If aligned results still differ,
use `conflicts` and let `synthesis.md` adjudicate. Do not normalize away the difference during
extraction.

## 7. Deterministic floor

Run:

```bash
bun scripts/check-ledger.ts path/to/claims.jsonl
```

The checker validates JSONL shape, allowed enums, unique identifiers, provenance routes,
load-bearing assessments, resolved references, and acyclic derivations. It does **not** decide
whether a source supports a claim, whether the locator is accurate, or whether an appraisal is
scientifically valid. It checks one ledger file per invocation; references resolve inside that
file.

Exit contract:

- `0`: structural provenance/reference floor clean;
- `1`: ledger findings;
- `2`: usage or environment failure.

After a green floor, a human or source-verification agent must still read the load-bearing loci.

## 8. Traceability queries

For a durable review, be able to answer:

- Which source results support each synthesis claim?
- Which conclusions depend on an inaccessible or abstract-only source?
- Which studies share datasets, participants, checkpoints, authors, or benchmarks?
- Which load-bearing claims are `uncertain`, `not-comparable`, or `unsupported`?
- Which reports map to the same study/artifact?
- Which protocol amendment changed a claim’s evidence set?

These are database queries or small scripts once the ledgers exist. Do not claim they are
mechanically checked unless a command actually ran.
