---
name: systematizing-knowledge
description: >-
  Systematizes a source CORPUS into a known/uncertain/disputed/missing position. Use for SoK,
  survey / literature review / 文献レビュー, evidence maps, conflicting studies, and field-level
  claims. Also compiles a target-agnostic `DONOR SET` from cross-domain source relations; target
  correspondence/prediction/thesis → forging-novel-theses. Cuts: one fact → raising-resolution;
  one-paper appraisal → arguing-research-papers; premise audit → surfacing-blind-spots; program
  judgment → directing-research; expensive selected tree → acting-on-hypotheses; settled IA →
  structuring-documents; agent dispatch → orchestrating-agents; document authority/lifecycle →
  governing-research-documentation. If both are requested, this skill signs the corpus position first;
  governing-research-documentation then decides admission and authority. Search/extraction may fan out;
  adjudication and terminal artifact stay SOLO. English skill; answer in the user's language.
---

# Systematizing knowledge — method-fit evidence synthesis

> **Version**: v2608.1.2 (2026-08-02) — DONOR SET locator, heading, and target-leakage floor hardened.
> Reforged around method selection, separate evidence units, traceability, and preserved uncertainty.

Run from this skill directory; success prints nothing:

```bash
for f in framing-and-corpus evidence-ledger taxonomy synthesis ai4s-gates delivery orchestration sources transfer-sources; do
  test -f "references/$f.md" || echo "MISSING references/$f.md"
done
for f in scripts/check-ledger.ts scripts/check-donor-set.ts tests/check-ledger.test.ts tests/check-donor-set.test.ts tests/triggers.md tests/forge-verification-ledger.md assets/claim-ledger.example.jsonl; do
  test -f "$f" || echo "MISSING $f"
done
for stale in genre workflow ledger resolution writing; do
  test -e "references/$stale.md" && echo "STALE references/$stale.md"
done
:
```

## Language and stable tokens

Write the deliverable in the user's language. Keep these human-facing identifiers stable:

```text
review mode | coverage contract | claim ledger | source claim | synthesis claim | DONOR SET
not reported | not applicable | not comparable | unresolved | SOLO
```

Machine-readable ledgers use the exact hyphenated enums in the ledger and AI4S references.

## THE LAW

> Select the method from the decision question and evidence type before selecting artifacts.
> Every load-bearing conclusion must be reconstructible through a coverage contract, evidence
> records, and a claim ledger. Missing evidence stays missing. Never turn `not reported` into
> demonstrated bias. Never turn failed support for C into support for not-C. Never turn unexplained
> disagreement into an invented moderator.

The ordinary output is a calibrated position. The bounded transfer-source branch instead returns one
target-agnostic `DONOR SET`; it never smuggles in a target correspondence, prediction, thesis, or
support claim. Its certainty never exceeds the evidence; its scope never exceeds the `coverage
contract`. Taxonomies, PRISMA diagrams, GRADE labels, meta-analysis, and hero figures are
conditional instruments. They are not badges of rigor.

For that branch, a page number or bare DOI is not a donor locus. Retain `file:line`, or a DOI/URL
paired with an exact page, section, table, figure, or fragment anchor. The mechanical floor rejects
an explicit positive target claim hidden in `Known` or a donor-record cell. `Missing` and `Handoff`
retain the inverse prohibition as the required ownership boundary.

## Gates — each leaves an artifact

Artifacts may be durable files or explicit tables in the response. Do not create files merely to
satisfy the names below.

| Gate | Decision | Required artifact |
|---|---|---|
| **K1 FIT** | What decision must this synthesis support, and which review mode fits it? | `review plan`: question, audience/decision, corpus origin, `coverage contract`, review mode, synthesis operator, appraisal approach, intended output |
| **K2 TRACE** | Can every load-bearing conclusion be reconstructed without counting claim rows as papers? | separate corpus/evidence records plus a `claim ledger`; run `scripts/check-ledger.ts` for a durable JSONL ledger |
| **K3 CALIBRATE** | Did each method run only where applicable, with unknown and non-comparable states preserved? | method-applicability table plus discrepancy/appraisal records; unsupported claims are not negated |
| **K4 CHALLENGE** | What counterevidence or alternative interpretation could change the position? | counterevidence attack and adjudication log within the `coverage contract`; a novelty claim also gets an authorized mechanism-synonym kill search |
| **K5 DONOR (conditional)** | Is the requested output a source-side relation seed rather than a target claim? | one checked `DONOR SET`: stable donor IDs, distinct exactly located evidence units, comparison or explicit `SINGLE-DONOR LIMIT`, and handoff stopping before target mapping |

No artifact means the corresponding gate is not passed. A small bounded synthesis may use a
compact inline table. A publication-grade systematic review needs durable records.

## Adaptive pipeline

1. **Name the decision.** State who will use the answer and what would change because of it.
2. **Choose the review mode and coverage contract.** Corpus origins license different claims.
   Distinguish supplied, rapid, systematic, iterative theory-building, and venue-SoK work.
3. **Freeze only what the mode requires.** Systematic work pre-specifies eligibility, sources,
   screening, extraction, appraisal, and synthesis. Exploratory modes keep an amendment log.
4. **Retrieve and screen evidence.** Keep records, reports, studies/artifacts, and results separate.
5. **Extract source claims at their exact locus.** Preserve the original estimand, scope, design,
   measurement, uncertainty, and missing fields.
6. **Appraise by claim type.** Use a field-appropriate tool or an explicitly named local profile;
   do not relabel an adaptation as official GRADE.
7. **Select and run the synthesis operator.** Aggregate comparable effects or configure concepts.
   For other questions, explain mechanisms or critically evaluate and contextualize a field.
8. **Adjudicate discrepancies.** First test comparability. Then consider uncertainty, bias,
   measurement, and scope. Pre-specified or theory-backed moderators may calibrate a headline.
   Labeled post-hoc candidates stay exploratory. `unresolved` is a valid result.
9. **Choose the terminal artifact.** For an evidence-state question, write a calibrated position.
   For a target-independent transfer-search question, compile a `DONOR SET` under
   `references/transfer-sources.md` and stop before target mapping. Do not infer a priority from an
   empty cell alone.
10. **Attack the artifact.** Verify load-bearing loci, search for counterevidence, and loop to the
   earliest stage invalidated by a finding.

Load `references/framing-and-corpus.md` before steps 1–4 and
`references/evidence-ledger.md` before step 5. If the requested terminal artifact is a `DONOR SET`,
load `references/transfer-sources.md` before retrieval. Select later references by the index below.

## Execution model

The evidence type is **CITATION-RELAY**. An agent may return a source observation only with a stable
identifier and exact locator. Search, screening after frozen criteria, extraction, and independent
verification may fan out. The editor keeps review-mode selection and protocol amendments SOLO.
Synthesis-operator choice, discrepancy adjudication, and the final position also stay SOLO.
Generic briefing, dispatch, and acceptance belong to `orchestrating-agents`. This skill owns only
the evidence-synthesis stage map and schemas. No harness means the same stages run serially.
If the position must become durable or canonical, finish and sign it here first.
Then `governing-research-documentation` decides `DOC ADMISSION`, authority, and lifecycle.

## MUST-NOT-FIRE and sibling routing

| Ask | Route |
|---|---|
| Verify or extract one bounded factual claim from one paper, file, or dataset | `raising-resolution` — one citable observation there; a corpus position here |
| Neutrally summarize one paper | answer directly, applying `raising-resolution`'s citation gate silently; no specialist skill owns this |
| Critically appraise one paper's argument, method, or validity | `arguing-research-papers` reviewer red-team — one paper's review there; corpus synthesis here |
| Expose only implicit premises, ignored exceptions, or human tacit constraints in an existing synthesis plan | `surfacing-blind-spots` — premise surface there; evidence-state synthesis here |
| Position and defend the governing claim of one manuscript | `arguing-research-papers` — PURPOSE: the manuscript's argument there; the field's evidence state here |
| Construct/select/formulate research problems or rank/allocate across >=2 future directions | `directing-research` — future program judgment there; corpus evidence state here |
| Generate thesis candidates beyond the bounded corpus position | `forging-novel-theses` — genesis there; nearest-prior evidence here |
| Find relation-level source donors for a selected or selected-for-probe frame, without mapping them to the target | **HERE** — return a target-agnostic `DONOR SET`; then `forging-novel-theses` maps or records `MAPPING-BREAK` |
| Map a `DONOR SET` to a selected target frame, derive a target prediction, or write a transfer thesis | `forging-novel-theses` — source discovery stops here; correspondence and candidate/break are there |
| Test, commit, pivot, or kill one expensive/irreversible selected future hypothesis tree | `acting-on-hypotheses` — hard-gated tree there; corpus state here |
| Run one deterministic, bounded, reversible probe with no expensive downstream exposure | domain/plain executor; return `EXECUTOR RESULT` to `directing-research` |
| Reorder or deduplicate a review whose evidence judgments are settled | `structuring-documents` — FIX-LOCALITY: document architecture there; evidence derivation here |
| Govern admission, authority, evidence lineage, review, retirement, or deletion across research documents | `governing-research-documentation` — corpus position is signed HERE first; portfolio authority/lifecycle follows there |
| Find passages in an indexed local corpus without synthesizing them | `driving-cocoindex` — locate there; synthesize here |
| Turn a raw paper corpus into a skill | Run this skill first, then `forging-skills`; never distill unreconciled papers |
| Decide how to brief, dispatch, and accept work across agents | `orchestrating-agents`; co-fire only when a synthesis also needs a fleet |
| Reforge this `SKILL.md` | `forging-skills`; the domain skill is the audit subject, not the craft owner |

The complete fire/no-fire regression set is `tests/triggers.md`.

## Reference index — load only the branch in use

| File | Sole ownership | Read when |
|---|---|---|
| `references/framing-and-corpus.md` | review-mode and `coverage contract` selection; protocol, search, screening, corpus units, amendments, stopping | starting any synthesis; making a completeness claim |
| `references/evidence-ledger.md` | evidence-unit model, source/result/synthesis claims, claim-ledger schema, provenance floor | extracting evidence; building or checking the ledger |
| `references/synthesis.md` | synthesis-operator selection, comparability, quantitative/configurative/explanatory/critical synthesis, discrepancy adjudication, confidence language | combining source claims into conclusions |
| `references/taxonomy.md` | optional taxonomy and comparison-matrix branch; Nickerson use and validation | only when classification answers the question or is the SoK contribution |
| `references/ai4s-gates.md` | optional ML-based-science appraisal; applicability, leakage, benchmarks, scaling, emergence, compute, distribution shift | a scientific claim uses ML performance as evidence |
| `references/delivery.md` | genre-shaped deliverables, gaps, visual artifacts, stop-writing and adversarial audit | drafting or updating the output |
| `references/orchestration.md` | synthesis-specific stage map, worker schemas, trust boundary, duplicate work, scale | using subagents/workflows on a corpus |
| `references/sources.md` | dated primary-method sources, applicability notes, and local adaptations | verifying a method claim; reforging this skill |
| `references/transfer-sources.md` | target-agnostic donor discovery, multi-source relation comparison, `SINGLE-DONOR LIMIT`, and the frozen `DONOR SET` handoff | a selected frame needs an external relation seed but no target correspondence has been constructed |
| `scripts/check-ledger.ts` | non-semantic JSONL provenance/reference floor | after editing a durable claim ledger |
| `scripts/check-donor-set.ts` | non-semantic `DONOR SET` shape, locator, cardinality, and ownership-stop floor | before handing a donor set to `forging-novel-theses` |
| `assets/claim-ledger.example.jsonl` | copyable valid source-claim and synthesis-claim rows | starting a ledger |
| `tests/forge-verification-ledger.md` | source grades, audit findings, red/green receipts, maintenance triggers | auditing or reforging this skill |

## Exit conditions

Deliver only when:

- K1–K4 artifacts exist at the treatment tier the task warrants; a transfer-source branch also has K5;
- each load-bearing synthesis claim resolves through claims and/or exact-locator direct sources;
- selected methods are applicable; and
- counterevidence has been adjudicated.

State the coverage boundary plainly. A transparent bounded position or target-agnostic `DONOR SET`
is complete. A vague claim of completeness, a target mapping, or a source-success-to-target-support
leap is not.
