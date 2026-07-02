# Ledger — claim normalization, the context vector, provenance & traceability (SOT)

> Scope: turning paper text into atomic, normalized, fully-sourced claims in a claim ledger that is
> the **Single Source of Truth** for the SoK — the atomic-claim grammar, the context vector, the
> machine-readable schema, and the REFORMS / model-info-sheet provenance fields.

## Why a ledger (not prose)

The claim ledger is the **Single Source of Truth**; the SoK prose is a *rendered view* of it. This
is the only structure that makes invariant #1 (provenance) and #3 (no ignored contradiction)
mechanically checkable: you can `grep` for orphan claims and for contradicting pairs. Defer the
ledger↔document versioning/sync/staleness discipline to the `grenza-doc-discipline` skill — this
file owns the *schema and extraction rules*.

## Claim normalization — the atomic-claim grammar

Extract **atomic** claims: one subject, one relation, one object, one context. A sentence with two
relations becomes two rows. Normalize so two papers asserting the same thing in different words
collide on the same canonical claim (prerequisite for both vote-counting avoidance and unification).

**Grammar:** `<quantity/behavior> <relation> <quantity/behavior> | under <context vector>`

| Raw text | Normalized atomic claim |
|---|---|
| "models suddenly acquire arithmetic at scale" | `task-accuracy(arithmetic) jumps sharply with params \| metric=exact-match, family=GPT-3, measure=accuracy` |
| "with a continuous metric the jump disappears" | `task-accuracy(arithmetic) rises smoothly with params \| metric=token-edit-distance, family=GPT-3` |
| "ML beats logistic regression for civil-war prediction" | `AUC(complex-ML) > AUC(LR) \| field=civil-war, split=??? (leakage-suspect)` |

Tag each claim's **direction** (↑/↓/=), **magnitude if given** (effect size — see `synthesis.md`),
and **claim type**: empirical-result / theoretical-result / definition / conjecture / methodological.

**Extract results, not gists.** For a load-bearing claim the MAGNITUDE (number + units + conditions)
and the locus (theorem/table/figure) are mandatory, pulled from methods/results — an abstract-level
gist is *spin inheritance* (§ANTI). A row still at `dir-only` with no recorded reason may not render
as a load-bearing sentence in prose (`resolution.md` owns this bar and its worked example).

## The context vector — the raw material for reconciliation

Every claim row carries a **context vector** on the Nickerson dimensions — the same axes the
taxonomy is built on (defined in `taxonomy.md`). This is non-negotiable: contradictions are
reconciled by *diffing the context vectors* of conflicting claims, and **the moderator that later
reconciles a contradiction is almost always a coordinate of this vector** (`synthesis.md`). A claim
logged without its context is un-reconcilable later.

Minimal axes: `setting · scale · metric · population/data · measure · method-family`. Add domain
axes as the taxonomy requires. Use `???` explicitly when a paper omits an axis — a missing split
or undisclosed metric is itself a finding (it caps the claim's GRADE — see `synthesis.md`).

## Ledger schema

The ledger is **machine-readable** (CSV / JSONL / YAML), one row per canonical claim, keyed by a
stable claim id AND keyed to its sources by stable **arXiv id / DOI** — so it is diffable,
countable, and version-controllable.

| Col | Meaning |
|---|---|
| `cid` | Stable claim ID (e.g. `C-014`) — what prose cites; never reused/renumbered |
| `claim` | Normalized atomic claim (grammar above) |
| `type` | empirical / theoretical / definition / conjecture / methodological |
| `context` | Context vector (setting/scale/metric/population/measure/method) |
| `source(s)` | Paper IDs (arxiv id / DOI / bibkey) + locus (§/fig/table) — **load-bearing**, never blank |
| `provenance` | How the paper entered the corpus: `query` \| `snowball-gen<N>` \| `seed` (`workflow.md`) |
| `screen_decision` | include / exclude (PRISMA screening outcome) |
| `exclude_reason` | reason tag when excluded — feeds the PRISMA reason-tally |
| `retraction_status` | clean / retracted / flagged (checked at screening; retracted → quarantine) |
| `direction` | ↑ / ↓ / = / non-monotone |
| `effect` | Effect size + CI if reported; `dir-only` if not |
| `independence` | Shared authors/data/benchmark with which other rows (for non-double-counting) |
| `grade` | GRADE certainty once assessed (`synthesis.md`) |
| `relations` | Links to other cids: confirms / extends / contradicts / conditions (`synthesis.md`) |
| `sok_section` | Which deliverable section / taxonomy cell this claim renders into |

**Synthetic (author-original) claims** get a cid too, with `source = AUTHOR-SYNTHESIS` and a list
of the supporting cids — so a reader can tell your inference from a cited result (invariant #1).

**The ledger is the SOT — counts derive FROM it, never the reverse.** Every PRISMA count, every
threats-to-validity statement, and every prose citation is generated FROM the ledger columns above
(this is the Pillar-2 "machine-readable corpus ledger as SOT" principle). Concretely: the PRISMA
Identification→Screening→Eligibility→Included tallies are `GROUP BY provenance / screen_decision /
exclude_reason` over the rows; the reference list is the distinct `source(s)` set. **If prose is
the source of a count, the PRISMA numbers and the reference list silently diverge** — nobody can
reconstruct which papers were screened out or why. Regenerate counts on every version bump and
defer that bump discipline to `grenza-doc-discipline`.

## Provenance instruments — REFORMS + model info sheets

For ML-based-science corpora, two canonical instruments make provenance concrete:

- **REFORMS** (Kapoor, Cantrell, Peng et al. 2024) — a **32-item extraction schema across 8
  sections** (study goals, computational reproducibility, data quality, data preprocessing,
  modeling, data leakage, metrics & uncertainty, claims & generalizability). Use its item set as
  the **extraction fields**: if a paper doesn't report a REFORMS item (e.g. train/test split
  discipline), record the gap in `context` as `???` — **an unreported item becomes `???` and caps
  the claim's GRADE** (`synthesis.md`).
- **Model info sheets** (Kapoor & Narayanan 2022, *Leakage and the Reproducibility Crisis*) — a
  per-claim sheet that forces disclosure of the train/test separation, precluding the 8 leakage
  types. Treat any performance claim whose model-info-sheet fields are unknown as
  **leakage-suspect** until shown otherwise; this is a GRADE risk-of-bias downgrade, not a footnote.

The **per-claim leakage clearance record lives here** (the model-info-sheet fields and the REFORMS
`???` tags are ledger columns). The **8-type leakage triage + the quarantine machinery** —
walking each claim through gates A–F and recording what fails — lives in `ai4s-gates.md`; do not
duplicate it. The ledger holds the *evidence*; `ai4s-gates.md` holds the *verdict*.

## Traceability rules

1. **No orphan claims.** Every sentence of synthesis prose cites ≥1 cid; every cid has ≥1 source
   (or `AUTHOR-SYNTHESIS` + supporting cids). A claim that cannot be traced is deleted or demoted.
2. **Locus, not just paper.** Cite the table/figure/section, so a reviewer can verify in one hop.
3. **One claim, one canonical row.** Multiple papers asserting it attach as multiple `source`
   entries on the *same* cid — this is what lets `synthesis.md` weigh them WITHOUT vote-counting.
4. **Contradictions are first-class row-relations**, not absences: when `C-014` contradicts
   `C-021`, both carry the link. The reconciliation lives in `synthesis.md`'s table, keyed by cid.

## Treat the ledger as code

Build the table FIRST and generate the prose AS A VIEW over it. Then invariants become greppable:

- **Orphan check** — find rows where `source(s)` is empty and `cid != AUTHOR-SYNTHESIS`; each is a
  delivery-blocking orphan (add a source id + locus, or delete / relabel `AUTHOR-SYNTHESIS`).
- **Unreconciled-contradiction check** — find cid pairs with a `contradicts` relation whose
  reconciliation row in `synthesis.md` has no named moderator; each is invariant #3 violated.
- **Count check** — regenerate every PRISMA number and the reference list from the columns; if a
  prose count disagrees with the `GROUP BY`, the prose is wrong, not the ledger.

## Anti-patterns (provenance-scoped)

| Anti-pattern | Fix |
|---|---|
| **Orphan claim** — assertion with no traceable source | Add source id + locus, or delete / relabel `AUTHOR-SYNTHESIS` with supporting cids. |
| **Spin inheritance** — claim extracted from the abstract's framing | Extract from methods/results, not the abstract; the abstract overstates the regime. |
| **Leakage-blind trust** — pooling a performance number with unknown train/test split | Run the model-info-sheet / REFORMS check → GRADE risk-of-bias downgrade (full triage + quarantine in `ai4s-gates.md`). |
| **Prose-as-source drift** — PRISMA counts / refs hand-written in prose | The ledger is SOT; regenerate counts FROM it on every bump (`grenza-doc-discipline`). |

## Cross-references

| Need | Go to |
|---|---|
| Dimensions / axes the context vector uses | `taxonomy.md` |
| Corpus provenance fields, PRISMA flow & screening | `workflow.md` |
| Weighing without counting, heterogeneity & GRADE grading | `synthesis.md` |
| 8-type leakage triage + quarantine table | `ai4s-gates.md` |
| The content bar: resolution grammar, magnitude/regime/anchor slots | `resolution.md` |
| Versioning, SOT sync, staleness audit | `grenza-doc-discipline` |
