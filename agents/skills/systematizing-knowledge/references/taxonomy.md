# Taxonomy & comparison matrix — the analytical spine that IS the SoK

> Scope: building the classification scheme + comparison matrix that IS the SoK contribution —
> Nickerson 2013 method, faceted vs hierarchical, the 5-quality gate, dimension selection, the
> capability-matrix schema, empty-cell gap mining. `workflow.md` owns *which* dimensions exist at
> the corpus level; this file owns *how* the scheme is built, audited, and rendered as the matrix.

**Precedence — a taxonomy is the deliverable, not a byproduct.** Strip out the classification
scheme and the comparison matrix, and the document degrades to per-paper summaries — i.e. a survey
(SKILL §CORE: an SoK is NOT an anthology). The taxonomy is the systematization contribution. The
operational acceptance test: a reader must be able to place a **new, unseen** work into a cell and
*read off its properties* from the cell's axis-values. If the scheme cannot classify the next paper,
it is a post-hoc label spreadsheet, not a taxonomy.

## 1. Fix the meta-characteristic FIRST

Per Nickerson, Varshney & Muntermann (2013), choose ONE **meta-characteristic** before enumerating
any dimension: *the most comprehensive characteristic, the basis for the choice of all others*,
derived from the taxonomy's **purpose + expected users**. Every dimension must be a logical
consequence of it; a dimension that does not serve the meta-characteristic is decorative and is cut.

- Purpose-driven, not data-driven. Bad meta-characteristic: "attributes we could extract." Good:
  "the property that determines how a system behaves on the outcome the SoK is about."
- Worked example (Herremans, Chuan & Chew 2017, *ACM Comput. Surv.* 50(5), music-generation
  taxonomy): the *function/purpose* axis was chosen as meta-characteristic over the *method* axis
  precisely because function carries the analytical weight (it exposes grand-challenge gaps);
  method-based slicing is decorative there.
- The meta-characteristic is the single test that converts "interesting fact about a paper" into
  "load-bearing axis." Without it you get the kitchen-sink failure (§6, §ANTI).

## 2. The Nickerson 7-step loop

The default backbone for ANY SoK taxonomy. Run it as an explicit loop, not a one-shot pass:

1. **Determine the meta-characteristic** from purpose + users (§1).
2. **Set ending conditions up front** — both objective and subjective (§3). Declaring them after the
   fact is HARKing the taxonomy.
3. **Pick the iteration type for THIS pass**: conceptual-to-empirical (**C2E**, top-down — when
   theory already partitions the space) OR empirical-to-conceptual (**E2C**, bottom-up — when you
   have a corpus but weak theory).
4. **Deduce or induce** dimensions + values (the deduce/induce labels are a mnemonic gloss, not
   Nickerson's own terms): (4a) C2E — conceptualize dimensions from theory (deductive in flavor),
   then check they fit observed objects; (4b) E2C — examine objects first, identify shared
   characteristics, then group them into a dimension and name it (inductive).
5. **Create / revise** the taxonomy.
6. **Test ending conditions** (§3). If unmet, loop to step 3.
7. **Loop.** Alternate C2E and E2C across passes — top-down alone leaves empty cells and
   unclassifiable objects; bottom-up alone overfits the corpus.

**Document which iteration type each pass used and why.** A `/linus` reviewer will ask "is this axis
from theory or from the data?" — an axis with no recorded provenance is unfalsifiable. Start E2C when
you have many papers and weak theory; start C2E when a parent theory already partitions the space.

## 3. Ending conditions = acceptance gates

Stop only when BOTH gate sets pass. These are pass/fail gates, not aspirations.

**Objective ending conditions** (validity — each pass/fail):

| Condition | Pass test | Fail signal |
|---|---|---|
| Non-empty dimensions/values | every value has ≥1 object OR is a labeled gap (§8) | a value no object ever takes, unlabeled |
| No collapsing dimension | each dimension splits the corpus (§6 discrimination) | ~all objects share one value |
| Every object classifiable | every corpus object lands in exactly one cell per axis | an unclassifiable object → fails COMPREHENSIVE |
| Stability | **no dimension added/merged/split in the last pass** | scheme still churning → keep iterating |
| Intended distinctions resolved | every pair of works the SoK MEANS to distinguish has a different axis-tuple | two works you want to separate share a tuple → an axis is missing or non-discriminating (§6) |

**Subjective ending conditions — the 5 qualities** (usefulness — run each as pass/fail):

| Quality | Pass test | Most common failure |
|---|---|---|
| **CONCISE** | a Miller-style handful of axes (~5–7), not 30 | kitchen-sink (§6) |
| **ROBUST** | axes actually differentiate objects of interest | near-zero-entropy axis (§6) |
| **COMPREHENSIVE** | every relevant object is classifiable | hold-out object unclassifiable (§9) |
| **EXTENDIBLE** | a new dimension/value adds without rebuild | new paper forces a restructure |
| **EXPLANATORY** | the cell explains WHY objects differ, not merely THAT | label-spreadsheet cells |

**EXPLANATORY is the most-failed and most-diagnostic.** The test: does knowing an object's cell
*predict anything about its behavior/outcome*? If not, the axis is decorative — cut it or reframe it
around the behavior it governs. A taxonomy that organizes thought passes EXPLANATORY; one that merely
sorts labels does not.

## 4. Faceted vs hierarchical — pick by orthogonality

| Representation | When | Signal to switch |
|---|---|---|
| **HIERARCHICAL** (one IS-A tree, single root, parent-child) | one dominant split; categories genuinely nest — "kinds of X" | an object "should" sit under two parents → the tree is forcing a faceted reality |
| **FACETED** (multiple independent axes; object = tuple of facet-values) | **DEFAULT for SoKs** — real systems mix-and-match properties that vary independently | a facet starts nesting strictly → a sub-hierarchy may live inside one facet |

Faceted is the SoK default because the morphological box it produces is generative. The
**morphological box** (Zwicky): facets as rows, possible values per facet as cells; **any column-pick
(one value per facet) is a candidate configuration**, and EMPTY combinations are candidate research
gaps (§8). The switch signal is concrete: the moment an object duplicates across two branches of a
draft tree, that duplicated subtree is *proof* the property is an independent facet — split it. Hand
the *rendering* of the box (tree/mindmap vs table) to `/AA`; always quote Mermaid node labels.

## 5. MECE per axis — within, not across

Within a SINGLE dimension the values must be:
- **Mutually exclusive** — an object lands in exactly one value.
- **Collectively exhaustive** — every object lands *somewhere*; add an explicit `Other / None` value
  rather than leaving a gap. (Overlap between values of one axis is the #1 taxonomy bug — §ANTI.)

**Critical nuance:** faceted classification *deliberately* uses MULTIPLE orthogonal axes. MECE is
required **WITHIN each facet, NOT across facets** — facets are *meant* to co-vary independently (that
is what makes them facets). An object having a value on every axis is correct, not a MECE violation.

This is the **schema-level** MECE; it complements the user's `/MECE` command, which enforces
**prose-level** non-repetition (each fact stated once, backward-only references) in the written
document. Run schema-MECE here; route prose-MECE to `/MECE`.

## 6. Dimension-selection scoring rubric

Score each candidate axis 0–2 on four criteria; keep, demote, or cut by the rule below.

| Axis (candidate) | (a) DISCRIMINATION | (b) EXPLANATORY | (c) ORTHOGONALITY | (d) DECIDABILITY | Verdict |
|---|---|---|---|---|---|
| *splits corpus?* | *value predicts outcome/behavior?* | *low corr. with kept axes?* | *assignable from paper w/o guessing?* | |
| e.g. eval-metric type | 2 | 2 | 2 | 2 | KEEP (lead axis) |
| e.g. publication year | 2 | 0 | 1 | 2 | demote → metadata column |
| e.g. "author's intent" | 1 | 1 | 1 | 0 | CUT (unverifiable) |

- **(a) DISCRIMINATION** — quantify it. An axis where ~95% of works share one value has low
  normalized Shannon entropy (a 95/5 binary split is H_norm ≈ 0.29) → drop or merge its rare values.
  Threshold: H_norm below a low cutoff (house default ~0.3; illustrative, tune to corpus size — NOT
  a Nickerson constant) is non-discriminating *unless* the rare value marks the SoK's novelty, in
  which case keep it and make it the lead finding.
- **(b) EXPLANATORY link** — does the value predict the outcome/behavior of interest (Nickerson
  EXPLANATORY)? This is what separates a carrying axis from a descriptive one.
- **(c) ORTHOGONALITY** — low correlation with already-kept axes. A perfectly-correlated pair is
  redundant: keep the more explanatory one and **cite the correlation as a finding** (it is a real
  result about the field, not a bug).
- **(d) DECIDABILITY** — can you assign a value from the paper *without guessing*? An axis you cannot
  fill reliably poisons every downstream comparison.

**Rule:** keep axes scoring high on **a+b**; demote **a-only** axes (year, venue, dataset size) to
metadata columns; **cut** axes failing **d** as unverifiable. Apply whenever the draft has >5–7 axes
(CONCISE pressure) or a reviewer flags a kitchen-sink table.

## 7. The capability / comparison matrix — the primary artifact this file specifies the SCHEMA for

The capability/comparison table is what readers screenshot and cite — design it FIRST and let it
**discipline the taxonomy**: an all-yes or all-no column is a dead axis (§6); two indistinguishable
rows mean the scheme fails to discriminate those works. Build it before finalizing prose; the
narrative serves the table (route narrative to `/REORG`).

**Template (column order is load-bearing):**

```
| Work | Ref | Year | <Dim 1> | <Dim 2> | <Dim 3> | <Capability A> | <Capability B> |
|------|-----|------|---------|---------|---------|----------------|----------------|
  rows = corpus works   ──metadata block──   ──taxonomy dimensions──   ──capability columns──
```

Rules:
- **Closed 3-value cell legend with a key**, e.g. `● full / ◐ partial / ○ none / — N/A`. **Never free
  text in capability cells** — free text defeats column-wise comparison.
- **Every non-trivial cell carries a section/citation anchor** (e.g. `●[§4.2, 12]`) — auditable, not
  vibes. A green check with no source is claim-laundering (§ANTI).
- **Where an axis is quantitative, cells carry the value, not a symbol** — `10⁻³ @ d≤8`, not `●`.
  A `●` where the source states a number is a low-resolution cell (`resolution.md`); reserve the
  closed symbol legend for genuinely categorical capabilities.
- Add a final **"our framework / this work"** row if the SoK proposes one — but the Ours row is held
  to the SAME citation-anchor + GRADE + leakage gates as every other row (no self-awarded `●` without
  §-anchored evidence; it is the single most-gamed cell). Route it through the §9 hold-out / `/linus`
  adversarial pass before freezing.
- **Sort rows by the most explanatory axis** so clusters are visually adjacent.

**Worked 4-row example** (rows = methods; `●`/`◐`/`○`/`—`; metric type is the lead/sort axis):

| Work | Ref | Year | Metric type (lead) | Scale regime | Leakage-checked | Reproducible | OOD-tested |
|---|---|---|---|---|---|---|---|
| Method-A | [12] | 2021 | continuous | <1B | ◐[§3] | ●[§5] | ○ |
| Method-B | [19] | 2022 | continuous | 1–10B | ○[§4] | ◐[§6] | ○ |
| Method-C | [27] | 2022 | thresholded | <1B | ○ | ○ | — |
| Ours | — | 2026 | continuous | 1–100B | ●[§7] | ●[§7] | ●[§8] |

The Method-C row's thresholded metric + no leakage check is exactly where a "SOTA" claim should be
down-weighted (§10). Rendering choice — table vs figure, Mermaid vs markdown — is delegated: see
`/AA` and `writing.md`. **This file owns the SCHEMA of the matrix; `writing.md` owns making it the
single hero figure** that carries the thesis.

## 8. Empty-cell gap mining

The faceted morphological box (§4) turns the matrix into a *generative* artifact. Enumerate the
**Cartesian product** of facet-values; subtract the configurations that actually appear in the corpus;
the remainder splits into two kinds — and you MUST distinguish them explicitly:

| Empty cell kind | What it is | Where it goes |
|---|---|---|
| (i) **Genuine gap** | a plausible configuration nobody has built/studied | → research agenda; hand to `writing.md` gap analysis (importance × tractability + barrier) |
| (ii) **Impossible combination** | the facet-values are mutually exclusive in reality | → state WHY it is impossible — *that justification is itself a contribution* |

A descriptive table lists what exists; a gap-mined table also tells the reader what *should* exist and
doesn't. This is how the matrix sources the Open-Questions section with evidence instead of guesses.

## 9. Hold-out stress test

The taxonomy analogue of a test set — guards against overfitting the scheme to the corpus it was
built on. This is a **pre-freeze confirmatory gate**, not a post-done check: before freezing, **hold
out 2–3 corpus works + 1 deliberately weird edge case** and classify them **cold**. The taxonomy is
done only when the hold-out passes COMPREHENSIVE and EXPLANATORY (§3 Stability); a hold-out failure
reopens the loop (§2):

| Symptom on hold-out | Quality gate it fails | Action |
|---|---|---|
| Unclassifiable | COMPREHENSIVE | iterate — add a value or an `Other` (§5) |
| Lands in two cells of one axis | MECE / ROBUST | that axis is two facets — split it (§4, §5) |
| Cell mispredicts its behavior | EXPLANATORY | reframe the axis around the behavior, or cut it (§3) |

**Re-run the hold-out whenever a paper is added** to the corpus (living-SoK discipline → `writing.md`,
versioning → `grenza-doc-discipline`). Pair it with a `/linus` adversarial pass before freezing.

## 10. Evidence-grading overlay on cells

Where matrix columns encode **CLAIMS** (performance, superiority) rather than mere features, the cell
is only as trustworthy as the evidence behind it. Annotate the cell or a companion column with a
**GRADE tag** (High/Mod/Low/Very-low) — see `synthesis.md` — and run the leakage / REFORMS check (the
Kapoor–Narayanan 8-type leakage taxonomy; `ai4s-gates.md`) so a "SOTA" cell is not silently
undermined by data leakage or a thresholded metric. This prevents the matrix from **laundering
irreproducible results into apparent fact**.

Do NOT duplicate the GRADE table or the leakage taxonomy here — name them and point: certainty →
`synthesis.md`; admissibility/leakage → `ai4s-gates.md`. A cell whose claim fails an admissibility
gate is down-weighted in-place (`◐`/`○` with a note), never silently shown as `●`.

## Anti-patterns (taxonomy-scoped; global index in SKILL.md's "Anti-pattern quick list")

| Anti-pattern | Fix |
|---|---|
| **Overlapping categories** — an object legitimately in two values of ONE axis | That axis is actually two facets — split into independent faceted dimensions, each MECE on its own (§4, §5) |
| **Kitchen-sink axes** — 25 columns, every extractable attribute | Dimension-selection rubric (§6): keep high a+b; demote pure-description (year, venue) to a metadata block; target ~5–7 carrying axes |
| **Non-discriminating taxonomy** — near-zero-entropy axis, or two perfectly correlated axes | Measure the per-axis value distribution; drop/merge the low-entropy axis; for a correlated pair keep the more explanatory one and cite the correlation as a finding (§6) |
| **Empty/collapsing cells ignored** — values no object takes; a "partial" bucket that swallows everything ambiguous | Gap-mine (§8: label gap-or-impossible); tighten the `partial` decision rule with an explicit threshold so it stops being a dumping ground |
| **Hierarchy forced onto faceted reality** — one IS-A tree where objects need two parents | Switch to the morphological box (§4); **threshold**: if ≥1 corpus object needs two parents, the property is a facet — split it; one forced object is enough proof |
| **Post-hoc / overfit scheme** — reverse-engineered to fit exactly the surveyed papers; a new paper is unclassifiable | Hold-out stress test with an edge case (§9); derive at least the top axis from theory via a C2E pass (§2), not only from the corpus |
| **Descriptive-not-explanatory cells** — the cell tells you THAT an object differs, not WHY or with what consequence | Tie each axis to a mechanism/outcome (EXPLANATORY gate, §3); if a value changes no prediction about behavior, cut the axis |
| **Unauditable cells / claim-laundering** — green checks with no source; "SOTA" cells resting on leaked or thresholded results | Every non-trivial cell carries a section/citation anchor (§7); overlay GRADE + leakage checks so contested claims are visibly down-weighted (§10) |

**Cautionary axis-selection note (Schaeffer et al. 2023).** A poorly chosen *measurement* dimension
can MANUFACTURE a category that does not exist: "emergent abilities" are an artifact of nonlinear/
discontinuous metrics — under a continuous metric the same capability scales smoothly, so the
"emergent vs not" axis was measuring the *ruler*, not the *object*. Test that every discriminating
axis reflects a property of the object, not of the measurement procedure. `synthesis.md` owns the
emergence claim's reconciliation/GRADE; **this file owns only the consequence for AXIS SELECTION** —
never let a measurement procedure define a discriminating axis (`synthesis.md`, `ai4s-gates.md`
gate E).

## Cross-references

| Hand-off | Goes to |
|---|---|
| Taxonomy dimensions ARE the ledger context-vector axes | `ledger.md` |
| Empty-cell genuine gaps → gap analysis (importance × tractability) | `writing.md` |
| Cell certainty (GRADE) on claim-columns | `synthesis.md` |
| Cell leakage/admissibility check (REFORMS, metric-artifact) | `ai4s-gates.md` |
| Matrix rendering (table vs figure, Mermaid) + making it the hero | `/AA`, `writing.md` |
| Prose-level non-repetition of dimensions | `/MECE` |
| Adversarial stress-test of the scheme | `/linus` |
| Versioning the taxonomy as it iterates (SOT) | `grenza-doc-discipline` |
