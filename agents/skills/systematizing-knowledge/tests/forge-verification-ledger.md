# systematizing-knowledge — forge verification ledger

## Transfer-source reforge — v2608.1.0 (2026-08-02)

### Ownership decision

No new horizontal-transfer skill was created. `systematizing-knowledge` owns one terminal,
target-agnostic source artifact:

```text
transfer search question -> compare source relations -> DONOR SET -> forging-novel-theses
```

It stops before any target correspondence, prediction, thesis, test verdict, or target-side support.
`forging-novel-theses` owns selected-target correspondence and returns either `CANDIDATE` or
`MAPPING-BREAK`; `directing-research` later admits and disposes the whole attempt denominator.

### New evidence and calibration

| Grade | Source | Retained operational consequence | Explicit non-claim |
|---|---|---|---|
| P2 primary theory | Gentner (1983) | record roles and relations rather than selecting decorative object similarity | it does not prove a target mapping or the house schema |
| P2 primary experiments | Gick & Holyoak (1983); Gentner, Loewenstein & Thompson (2003) | compare distinct donor evidence units before naming a common source-side relation | bounded laboratory/negotiation transfer is not a real-science or wiki-workflow effect |
| P2 organization studies | Star & Griesemer (1989); Carlile (2002); Bechky (2003) | retain provenance, local meaning, and failure/boundary fields | no claim that jargon removal, shared vocabulary, a wiki, or contact resolves translation |
| LOCAL | `DONOR SET`, `SINGLE-DONOR LIMIT`, checker, and frozen digest handoff | make source-side scope and stop conditions inspectable | these are not externally validated creativity or transfer interventions |

### Verification receipts

`bun test tests/check-donor-set.test.ts` is the mechanical floor for: exact table shape, located and
distinct donor evidence units, multi-donor comparison, single-donor non-generalization, and rejection
of target mapping/support leakage. The checker deliberately cannot establish relation correctness,
source independence in a scientific sense, common-schema quality, or target fit.

The trigger desk-check gained F8/N8/C6. Re-run it against only names and descriptions after a
description or sibling-cut change. A regression exists if this skill emits a target mapping,
prediction, thesis, or a source-success-to-target-support claim.

Reforge: v2607.3.0, 2026-07-30. Editor: Codex root. Domain owner:
`systematizing-knowledge`; craft owner: `forging-skills`; generic delegation owner:
`orchestrating-agents`.

## Trigger and live failure

The user inspected the existing skill and called it “だいぶ稚拙,” asking whether it could be
reforged. The old artifact was operationally overconfident: it selected named methods before
testing applicability and turned several useful conditional techniques into universal gates.

## Source grades

| Grade | Inputs used | Licensed conclusion |
|---|---|---|
| **OBSERVED** | old skill text, baseline runs, red/green checker tests, fresh-scenario simulations | what this repository artifact actually required or failed to enforce |
| **P1 official** | PRISMA site, Cochrane Handbook, GRADE book, JBI manual, IEEE S&P 2027 call | current scope of official guidance or one venue's SoK criteria |
| **P2 primary** | SWiM, RAMESES, Nickerson taxonomy method, REFORMS, leakage study | what each published method proposes within its stated domain |
| **LOCAL** | K1–K4, coverage-contract wording, claim-ledger schema/statuses, citation-relay deltas | inspectability conventions constructed for this skill, not validated external methods |

The dated URL map and applicability caveats are in `references/sources.md`.

## Baseline findings

Three independent read-only audits and one editor inspection found:

1. The “not an SoK” gate had no complete lightweight or closed-corpus branch.
2. Claim rows were overloaded as papers/studies, so they could not support valid flow counts or
   dependence judgments.
3. GRADE, taxonomy construction, moderator explanations, flip conditions, and all AI4S checks were
   imposed beyond their domains.
4. Contradictions were forced into moderator stories instead of permitting sampling error, bias,
   mismatched estimands, `not-comparable`, or `unresolved`.
5. Significance/direction vote counting was banned without the limited direction-of-effect
   fallback recognized by applicable guidance.
6. The skill duplicated a generic five-field agent brief that now belongs to
   `orchestrating-agents`.
7. The skill had no executable provenance/reference floor, no test fixtures, and no forward-test
   artifact.

Baseline mechanical receipt:

```text
skill-check: 30 prose sentences >120 chars; version header 14 lines; no hard FAIL
checker red run: 0 pass, 8 fail because the checker and example did not exist
```

## Editor-signed architecture

The reforge replaced nine diffuse references with eight one-home references:

```text
framing-and-corpus | evidence-ledger | synthesis | taxonomy
ai4s-gates | delivery | orchestration | sources
```

Key decisions:

- choose `review mode`, synthesis operator, and appraisal from question/evidence type;
- separate record, report, study/artifact, result, source claim, and synthesis claim;
- make taxonomy, GRADE, SWiM, realist synthesis, and AI4S appraisal conditional branches;
- preserve `not reported`, `not applicable`, `not comparable`, `uncertain`, and `unresolved`;
- allow a closed supplied corpus to finish without unauthorized external search;
- move generic delegation contracts to `orchestrating-agents` and retain only synthesis deltas;
- add a zero-dependency Bun checker that validates structure but deliberately passes absurd
  semantics when provenance shape is complete.

## Adjudicated verification findings

| Finding | Resolution |
|---|---|
| Direct-source synthesis was allowed by schema but forbidden by exit/delivery text | all surfaces now allow derived claims and/or exact-locator direct sources |
| `unresolved` had no ledger representation | it is a discrepancy verdict mapped to assessment status `uncertain` |
| missing AI4S information could be both `not-reported` and `high-risk` | missing stays `not-reported`; critical absence drives claim verdict `not-decisive`; `high-risk` requires observed defect |
| empty taxonomy cell conflated gap existence with priority | feasible in-scope absence may establish a bounded gap; value and tractability govern priority |
| coextension was mislabeled “same definition” | definitional identity and extensional equivalence now have separate tests |
| closed-corpus K4 silently required external search | counterevidence attacks are bounded by the coverage contract; external novelty search requires authorization |
| generic five-field brief was stale | target and reciprocal sibling pointers now route to the complete `orchestrating-agents` contract |
| “strength never exceeds evidence and coverage” compared unlike quantities | certainty is bounded by evidence; scope is bounded by coverage |
| checker allowed self-relations despite “another row” | self-relations now fail with a row-specific finding |
| recursive derivation scan overflowed near 60,000 claims | iterative traversal plus a 60,001-claim acyclic stress test |

## Mechanical and behavioral receipts

Current completed receipts:

```text
bun test tests/check-ledger.test.ts
15 pass, 0 fail, 44 assertions

bun scripts/check-ledger.ts assets/claim-ledger.example.jsonl
PASS; claims=2; load-bearing=2

bun ../forging-skills/scripts/skill-check.ts .
PASS with 0 FAIL and 0 WARN

biome format/check on the checker and test
formatted; subsequent check clean

bun ../writing-bun-scripts/scripts/script-check.ts scripts/check-ledger.ts tests/check-ledger.test.ts
FAIL=0, WARN=0

skill-creator's quick_validate.py, run through uv with pyyaml
Skill is valid
```

The checker suite includes forward references, every documented enum, malformed nested data,
dangling references, derivation cycles, blank ledgers, exit-code separation, and a semantically
absurd row that must pass. That last fixture is the negative control against turning the script into
a truth oracle.

Independent edge re-verification also passed:

- a self-relation exits `1`;
- a 60,001-claim acyclic chain exits `0` without recursion overflow;
- all normalized arrays have missing-field coverage; and
- test subprocesses have a 10-second timeout.

## Comparative forward tests

Fresh-context verifiers read the OLD HEAD and NEW working-tree artifacts without the editor's
rationale or forge ledger.

| Scenario | OLD | NEW |
|---|---|---|
| 12 supplied mixed-metric papers; no external search; bounded decision brief | FAIL on supplied-corpus boundary, ceremony, and bounded output; SCOPE-LIMITED on missing states | PASS on all four frozen criteria |
| ~80-paper IEEE S&P 2027 belief-challenge SoK; taxonomy not requested | PASS venue fit; FAIL forced methods; SCOPE-LIMITED on threat-model traceability, counterexample logic, and scope | PASS on all five frozen criteria |

The first verifier observed that the new closed-corpus branch stops at the supplied twelve, keeps
incompatible metrics `not-comparable`, and allows `unresolved`. The second observed that the
security branch records threat model, attacker capability, preconditions, target version, and
result loci. It also treats one valid counterexample as capable of defeating a universal claim,
without forcing taxonomy, GRADE, or AI4S appraisal.

## Final acceptance

- Final independent cross-link/one-home audit: PASS, no blocker or major.
- Target `skill-check.ts`: 0 FAIL, 0 WARN.
- Full authored-skill scan: no hard failure in the target or reciprocal seam edits. The scan still
  exits `1` on six pre-existing unindexed references in `turnstile-spin`; that unrelated debt was
  not changed here.
- Build-order check: all eight references, checker, asset, and tests present; five retired
  references absent.
- `mise run link:skills`: PASS.
- `~/.agents/skills` and `~/.claude/skills/systematizing-knowledge` resolve to this repository, and
  both deployed `SKILL.md` files byte-match the source.

## Fire / no-fire desk check

`tests/triggers.md` freezes seven FIRES, seven near-miss NO-FIRE cases, and five ordered CO-FIRE
cases. An editor read only the eight plausible sibling descriptions and adjudicated all 19 rows as
expected. The sharp cuts are cardinality, object, time direction, and fix locality. Re-run the
stage-only check after any description edit.

## Maintenance triggers

Reforge again when:

- a current venue or method source changes the applicability boundary;
- a real synthesis cannot represent a missing, incomparable, or unresolved state;
- the checker rejects a legitimate extension or begins making semantic judgments;
- a sibling moves a generic contract without reciprocal pointer repair; or
- a fresh-context comparison shows the old behavior surviving under new wording.

## Transfer checker hardening — v2608.1.2 (2026-08-02)

Independent harness audit found that the initial locator predicate accepted a bare DOI or page,
that the ownership-stop check saw only dedicated field headings, and that a later notes section
could lend fields or a donor table to the canonical artifact. The mechanical floor now isolates one
`# DONOR SET` and its exact named sections. It accepts a donor locator only as `file:line` or DOI/URL
plus page, section, table, figure, or fragment anchor. It validates each donor ID as a stable token
and rejects target correspondence fields plus explicit positive target mapping, support, prediction,
or thesis claims found in `Known` or donor-record prose. It preserves the required negative boundary
sentences in `Missing` and `Handoff`; the checker is still not a semantic target-fit or source-truth
oracle.

Red fixtures cover bare page, bare DOI, malformed or duplicate donor IDs, positive target
mapping/support in `Known`, prediction in a table cell, forbidden correspondence fields, and required
content hidden in a later `Notes` section. Heading-depth regressions prove that H3–H6 notes nested
inside `Comparison` cannot lend a required field. A green fixture preserves explicit “no target
mapping / support / prediction / thesis” boundary text in `Missing` and `Handoff`.

Final receipt:

```text
bun test agents/skills/systematizing-knowledge/tests/check-donor-set.test.ts
14 pass, 0 fail, 50 assertions
```

The suite also rejects a negative boundary sentence followed by a positive target claim, duplicate
donor evidence disguised as two rows, surface-only selection, and CLI misuse. These receipts prove
only the declared mechanical boundary; they do not validate a common schema or target fit.
