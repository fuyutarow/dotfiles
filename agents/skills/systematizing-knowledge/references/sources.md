# Sources — primary method map and local adaptations

> Checked 2026-07-30. **SOLE owner** of dated external method links and the distinction between
> published guidance and this skill's local operating artifacts. Venue calls, handbooks, and tool
> versions can change; verify the live primary source before claiming current compliance.

## Method-source classes

| Class | Meaning | Permitted use |
|---|---|---|
| **official** | official guideline, handbook, standards project, or venue call | state the source's current scope and requirements |
| **primary** | peer-reviewed primary methods/research paper | state what that paper proposes or demonstrates within scope |
| **house** | an operating convention constructed for this skill | use transparently; never rename it as a validated external method |

## Review conduct and reporting

| Source | Class | What it supports here | Applicability boundary |
|---|---|---|---|
| [PRISMA official site](https://www.prisma-statement.org/), [2020 statement](https://doi.org/10.1136/bmj.n71), and [explanation](https://doi.org/10.1136/bmj.n160) | official + primary | reporting why a systematic review was done, what methods were used, and what was found | primarily reporting for systematic reviews of intervention effects; choose an applicable extension; not a substitute for conduct design |
| [PRISMA-ScR](https://doi.org/10.7326/M18-0850) and the [JBI scoping-review manual](https://jbi-global.atlassian.net/wiki/spaces/MANUAL/pages/355862533/10.1+Introduction+to+Scoping+reviews) | official + primary | PCC framing, scoping-review conduct, and transparent reporting of evidence mapping | scoping reviews and systematic maps are neighbors, not universal synonyms; appraisal depends on the stated purpose |
| [Cochrane Handbook ch. 4](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04) | official | searching/selecting, high-sensitivity retrieval, report-to-study linking, and studies rather than reports as the review unit | written for intervention reviews; transfer the unit distinction, not every domain-specific procedure |
| [Cochrane Handbook ch. 5](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-05) and [ch. 7](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-07) | official | data collection and consequential risk-of-bias judgments, including duplicate critical stages | intervention-review guidance; outside that scope, duplicate work is a conservative local choice unless a field standard requires it |
| [Cochrane Handbook ch. 10](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-10) | official | statistical meta-analysis, heterogeneity, and model/sensitivity considerations | only commensurable quantitative outcomes under defensible assumptions |
| [Cochrane Handbook ch. 12](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-12) | official | structured synthesis when meta-analysis is unavailable; limits of vote counting | significance-based or subjective tallies are unacceptable; direction-based methods are a limited conditional fallback, not a default |
| [Cochrane Handbook ch. 14](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14) and the [GRADE guidance book](https://book.gradepro.org/guideline/overview-of-the-grade-approach) | official | certainty assessment for a defined body of evidence about an outcome | do not transfer GRADE labels to formal proofs, taxonomies, or arbitrary CS/ML rubrics |
| [SWiM guideline](https://www.bmj.com/content/368/bmj.l6890) | primary | reporting syntheses of quantitative intervention effects without meta-analysis | not a generic narrative-review method and not a license to combine incompatible outcomes |
| [RAMESES realist-synthesis standards](https://link.springer.com/article/10.1186/1741-7015-11-21) | primary | transparent reporting of theory-driven realist synthesis | use for realist synthesis; do not impose context–mechanism–outcome slots on descriptive reviews |

## SoK, taxonomy, and conceptual synthesis

| Source | Class | What it supports here | Applicability boundary |
|---|---|---|---|
| [IEEE Security & Privacy 2027 call](https://sp2027.ieee-security.org/cfpapers.html) | official | one venue's SoK contribution test: evaluate/systematize/contextualize through a viewpoint, belief test, or convincing taxonomy | date- and venue-specific; it demonstrates that taxonomy is one contribution route, not a universal SoK requirement |
| [Nickerson, Varshney, and Muntermann](https://doi.org/10.1057/ejis.2012.26) ([open repository copy](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/deliver/index/docId/93439/file/93439.pdf)) | primary | iterative conceptual-to-empirical / empirical-to-conceptual taxonomy development with ending conditions | use only when classification serves the question; label changed ending conditions or validation as an adaptation |

## Cross-domain relation comparison and translation

| Source | Class | What it supports here | Applicability boundary |
|---|---|---|---|
| [Gentner (1983), *Structure-Mapping*](https://doi.org/10.1207/s15516709cog0702_3) | primary theory | distinguish relational/systematic structure from object attributes when recording a source-side relation | a theory of analogy, not validation of a `DONOR SET`, a discovery method, or target fit |
| [Gick & Holyoak (1983), *Schema induction and analogical transfer*](https://doi.org/10.1016/0010-0285(83)90002-6) | primary experiment | comparison of examples can support schema induction in bounded problem-solving tasks | laboratory transfer does not show that one source generalizes, that target correspondence is valid, or that a scientific thesis follows |
| [Gentner, Loewenstein & Thompson (2003)](https://doi.org/10.1037/0022-0663.95.2.393) | primary experiment | explicit comparison can improve learning/transfer in the studied negotiation setting | bounded educational/negotiation task; do not convert its effect into a claim about research-repository workflows or real scientific discovery |
| [Star & Griesemer (1989)](https://doi.org/10.1177/030631289019003001), [Carlile (2002)](https://doi.org/10.1287/orsc.13.4.442.2953), and [Bechky (2003)](https://doi.org/10.1287/orsc.14.3.312.15162) | primary field/organization studies | preserve local meanings, provenance, and translation/break conditions at boundaries | they do not establish that shared vocabulary, a wiki, or any one artifact resolves boundary work |

## ML-based-science appraisal

| Source | Class | What it supports here | Applicability boundary |
|---|---|---|---|
| [REFORMS](https://pmc.ncbi.nlm.nih.gov/articles/PMC11092361/) and its [project site](https://reforms.cs.princeton.edu/) | official + primary | reporting/design questions for scientific claims that use ML performance as evidence | relevance is item-specific; it is not a universal scorecard for ML engineering or methods papers |
| [Leakage and the reproducibility crisis in ML-based science](https://pmc.ncbi.nlm.nih.gov/articles/PMC10499856/) | primary | leakage/dependence failure modes and their consequences for scientific inference | scope is ML-based science; inspect the actual split/dependence mechanism rather than inferring leakage from poor reporting alone |

## House artifacts — never attribute these to the sources above

The following are deliberately constructed for this skill:

- K1–K4 gate names and artifacts;
- the `coverage contract` wording;
- R/P/S/E/C/Y/Q identifier prefixes;
- the JSONL claim-ledger schema and `check-ledger.ts`;
- the plain assessment states `supported`, `supported-with-limitations`, `uncertain`,
  `not-comparable`, and `unsupported`;
- `CITATION-RELAY`, SOLO/FAN-OUT stage assignments, and workload heuristics;
- `DONOR SET`, its exact fields, `SINGLE-DONOR LIMIT`, target-agnostic stop, and
  `check-donor-set.ts`.
- the optional AI4S status vocabulary `not-applicable`, `low-concern`, `some-concern`,
  `high-risk`, and `not-reported`.

These conventions make work inspectable. They have not been psychometrically validated, do not
create numeric evidence grades, and must not be cited as PRISMA, GRADE, SWiM, Nickerson, or REFORMS.
The transfer artifact is likewise a house schema, not an empirically validated mechanism for
cross-domain discovery, wiki-mediated translation, or target-side support.

## Maintenance triggers

Recheck this file when:

- a target venue publishes a new call;
- PRISMA, Cochrane, GRADE, SWiM, RAMESES, or REFORMS issues a new version or extension;
- a local status or gate is renamed;
- a method-specific reference starts carrying more than one review mode; or
- a live failure shows that a published rule was overgeneralized during transfer.
