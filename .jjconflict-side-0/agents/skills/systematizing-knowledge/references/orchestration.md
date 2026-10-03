# Orchestration — synthesis-specific stage map and evidence relay

> **SOLE owner** of this skill’s stage map, worker schemas, and citation-relay trust boundary.
> Generic scope, briefing, dispatch, capacity, and acceptance mechanics belong to
> `orchestrating-agents`. Use that skill's complete delegation contract; do not mirror it here.

## 1. Evidence type

This skill uses **CITATION-RELAY** evidence. A worker can retrieve an observable from a source, but
its conclusion is not evidence by itself. The relay must preserve:

```text
source identifier | exact locator | extracted observation | evidence unit |
scope/estimand | unresolved fields
```

The editor decides how the observation changes a synthesis claim.

## 2. Stage map

| Stage | Default mode | Why |
|---|---|---|
| Decision question, review mode, coverage contract | **SOLO** | one coherent judgment licenses every downstream claim |
| Search strategy design | **SOLO + specialist review** | independent searchers do not fix a defective strategy |
| Retrieval across independent sources/routes | **FAN-OUT** when scale warrants | routes are separable and benefit from vocabulary diversity |
| Deduplication and report-to-study linking | **BARRIER** | identity and dependence require the complete candidate set |
| Screening after criteria are frozen | **PIPELINE / duplicate when required** | each record is local; publication-grade eligibility needs independent review and adjudication |
| Result extraction | **PIPELINE per study/result** | structured local work; preserve separate results |
| Critical appraisal | **independent duplicate when consequential** | a second judgment can expose missed bias; disagreements remain data |
| Claim clustering/comparability candidates | **ASSISTED** | workers can propose clusters; the editor confirms construct/estimand alignment |
| Synthesis-operator selection and discrepancy adjudication | **SOLO** | the whole claim graph and decision context must remain together |
| Source verification and counterevidence search | **FAN-OUT, read-only** | lenses can attack separate claims and search spaces |
| Final position and scope language | **SOLO** | one signer owns inference strength and coverage |

The map is conditional. A six-paper supplied corpus is usually solo. Do not spawn an agent to run a
grep, copy one table cell, or simulate independent evidence.

## 3. Synthesis-specific additions to the canonical brief

First load `orchestrating-agents`, then use its `references/delegation-contracts.md` brief. Add only
these domain fields:

- the `coverage contract`;
- what the worker must mark `not reported`, `not accessible`, or `uncertain`;
- the exact source/result identifiers and maximum evidence set;
- whether the phase is discovery, extraction, appraisal, verification, or refutation; and
- one local output schema from the next section.

Search verification, appraisal, and audit remain read-only. Do not name the expected finding in an
extraction prompt.

## 4. Worker schemas

### Retrieval

```json
{
  "query_id": "QRY-03",
  "source": "database or citation route",
  "query": "exact query",
  "run_at": "ISO date",
  "records": [
    {
      "record_id": "R-019",
      "stable_source_id": "doi/arxiv/url",
      "title": "verbatim title",
      "retrieval_route": "query or cited-by source"
    }
  ],
  "limitations": []
}
```

### Result extraction

```json
{
  "report_id": "P-011",
  "study_id": "S-006",
  "results": [
    {
      "result_id": "E-014",
      "locator": "Table 2, row X",
      "observation": "source-faithful result",
      "scope": "estimand/construct and bounds",
      "missing": ["not-reported fields"],
      "candidate_claims": []
    }
  ]
}
```

Candidate claims are optional and never enter the ledger until the editor checks the locator and
normalization.

### Verification

```json
{
  "claim_id": "Y-004",
  "verdict": "confirmed | challenged | uncertain | not-accessible",
  "evidence": [
    {
      "source_id": "stable id",
      "locator": "exact locus",
      "observation": "what the source shows"
    }
  ],
  "reason": "relationship between observation and claim",
  "follow_up": "specific next check"
}
```

`uncertain` is a valid verdict. Never instruct a verifier to default to `refuted` when evidence is
unclear.

## 5. Epistemic rules

- Agent agreement is not independent empirical evidence.
- Diversify retrieval routes and failure lenses, not identical prompt count.
- Extraction prompts name fields, not expected content.
- A bibliographic, priority, or numeric fact needs a primary locator.
- A worker’s “PASS” without observable evidence has no weight.
- A challenged claim is not automatically false; the editor adjudicates the source and scope.
- Correlated workers using the same model, prompt, index, and source are one computational
  observation, not several.

## 6. Trust boundary

Nothing crosses worker-to-editor as a load-bearing fact without a stable source identifier and
locator. Put unlocatable returns in a verification queue; do not quietly paraphrase them into the
deliverable.

The editor personally checks:

- all headline synthesis claims;
- sources carrying a unique or surprising result;
- cells/marks in the central visual artifact;
- any claim with `challenged`, `uncertain`, or `not-accessible` verification;
- all “first,” “only,” “no prior work,” and bibliographic assertions.

Audit workers remain read-only. Apply fixes in a separate editor-signed phase so the evidence trail
does not change under the auditor.

## 7. Duplicate work where the review mode requires it

Where the applicable review standard requires independent duplicate work, use it for full-text
eligibility, critical outcome extraction, and consequential appraisal, followed by adjudication.
Two agents running in the same inherited context are not independent; give each only the protocol,
raw source, and output schema.

For rapid or bounded work, a single pass may be the declared trade-off. Do not represent it as
independent validation.

## 8. Scale

| Work size | Default |
|---|---|
| Supplied corpus under roughly ten items | solo, with targeted source probes |
| Moderate corpus with repeated extraction | fan out retrieval/extraction; synthesis solo |
| Publication-grade systematic review | specialist search review, duplicate critical stages, structured adjudication |
| Large living review | cached record/report/study graph; process only deltas; re-adjudicate affected synthesis claims |

These are workload heuristics, not quality thresholds. Use `orchestrating-agents` for capacity and
portfolio decisions.

No harness means the same stage map runs serially as focused passes.
