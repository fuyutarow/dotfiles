# Workflow — frame the question, build & bias-audit the corpus, run the loop

> Scope: steps 1–3 of the pipeline — freeze ONE known-vs-unknown question, assemble a reproducible
> **bias-audited** corpus (PRISMA 2020 / Kitchenham / snowballing), report **threats-to-validity**,
> and drive it with the arxiv-MCP. Claim extraction lives in `ledger.md`; the dimension scheme in
> `taxonomy.md`; AI4S eligibility/leakage/quarantine in `ai4s-gates.md`; weighing/reconciling/grading
> in `synthesis.md`.

## 1. Frame: exactly one research question

An SoK has **one** load-bearing question, phrased as a knowledge-state, not a topic.

| Bad (topic) | Good (knowledge-state question) |
|---|---|
| "Scaling laws for LLMs" | "Under what data/compute regime does the compute-optimal token-to-parameter ratio hold, and where does it break?" |
| "Emergent abilities" | "Are reported emergent abilities a property of models, or of the evaluation metric?" |
| "Data leakage in ML4science" | "Which leakage types actually overturn published performance claims, and in which fields?" |

**Write the thesis as ONE known-vs-unknown sentence** (the SoK's spec, inherited from the legacy
prompt and made testable):

> Under **[scope/conditions]**, it is established that **[X]**; it remains open whether **[Y]**.

Filled in, reusing the scaling-law row: *"Under fixed compute with >100B-token corpora, it is
established that loss follows a power law in compute (Kaplan 2020; Hoffmann/Chinchilla 2022); it
remains open whether the compute-optimal token-to-parameter ratio is constant or drifts with scale."*

If you cannot write this sentence, the scope is too broad (a textbook) or unframed (a literature
dump). Every later section is checked against it: a paper that informs *neither* the established
**X** *nor* the open **Y** is out of scope by construction.

**Operationalize the sentence via PICO decomposition.** Break the topic into facets — each facet
becomes one **OR-group** of synonyms, AND-ed across facets (the search string in §2). For a
descriptive AI-method scope with no comparator, use **PICO with C dropped** (cf. PICo for qualitative
scoping, Cooke et al. 2012) — do not treat "PIO" as an established named framework:

| Facet | PICO (empirical) | AI-method scope (C dropped) | Example (in-context learning) |
|---|---|---|---|
| P | Population / Problem | Problem-class | `"in-context learning" OR ICL` |
| I | Intervention / Approach | Method / Architecture | `transformer OR "decoder-only"` |
| C | Comparison | *(omit if no comparator)* | `"few-shot" OR "smaller model"` |
| O | Outcome | Outcome-metric | `accuracy OR "emergence threshold"` |

**Freeze the question, PICO facets, and inclusion/exclusion criteria BEFORE any search**
(*protocol-before-search*, Kitchenham & Charters SLR Stage 1; PRISMA 2020). Reverse-fitting the
question to the conclusion you found is **HARKing** (Kerr 1998) applied to synthesis — it
manufactures false consensus from a filtered corpus, and the conclusion flips the moment a reviewer
re-runs the search. Write the protocol in this order: RQ → known-vs-unknown sentence → PICO facets
→ search strategy → inclusion/exclusion → extraction form → synthesis plan.

> **Precedence rule:** refuse to call `search_papers` until the scope sentence + PICO facets +
> inclusion/exclusion criteria exist in the protocol. An unframed search produces an unframeable
> corpus. (Protocol = `/REQUIREMENTS`; full stage map in §6.)

## 2. Build the corpus — PRISMA 2020 flow + Kitchenham protocol

Record the corpus as a **PRISMA 2020 flow** (Page et al. 2021) even for a lightweight SoK — it
makes the corpus *auditable* and exposes selection bias. The four named phases:

```
Identification        Screening              Eligibility            Included
(search hits/source) -> (title/abstract)  ->  (full text)        ->  (qualitative synthesis)
   N1                     N2 (excl: e_1…)      N3 (excl: e_2…)        N4
   + duplicates removed                        AI4S gates (ai4s-gates.md) fire HERE
```

- **Identification** — records from each source + duplicates removed.
- **Screening** — title/abstract excluded, with a **reason tally**.
- **Eligibility** — full-text assessed, excluded with reasons. Here run the AI4S admissibility gates:
  A leakage / B benchmark contamination / C scaling-law bookkeeping (Kaplan vs Hoffmann–Chinchilla) /
  D ablation isolation / E emergence-as-artifact (Schaeffer) / F compute-fairness — wired to the
  REFORMS / Kapoor–Narayanan leakage taxonomy. Distinguish **PRISMA exclusion** (out of corpus, in
  the tally) from **AI4S quarantine** (kept in corpus, admissibility-flagged, down-weighted, *never
  silently dropped*); `ai4s-gates.md` owns the verdict, this file only routes papers to it.
- **Included** — survives into qualitative synthesis.

Keep the running counts and **exclusion reasons**. The single most common SoK bias is the
**unrecorded screen**: a reader cannot tell whether "the field agrees" or "the dissenting papers
were silently dropped." State inclusion criteria explicitly (venue/date/method/has-quantitative-result).

**The flow renders as a Mermaid flowchart (quote every node label, per `/AA`) regenerated FROM the
ledger — never hand-counted.** Each `n` at every transition is emitted from the ledger's
`screen_decision` / `exclude_reason` columns (`ledger.md`); a count the ledger cannot reproduce is
a bug. Hand-writing a count once → it drifts from the reference list and the prose (see the
anti-pattern table and `grenza-doc-discipline`).

### Faceted Boolean search-string construction

Per PICO facet: collect synonyms, abbreviations, British/American spellings, and known
**author-coined terms**; join with **OR** inside the facet, **AND** across facets. Add `ANDNOT`
only for documented noise (e.g. `ANDNOT survey` when you want primary results). **Record the exact
string per database** — field codes differ (arXiv `ti:`/`abs:`/`au:` vs Scopus `TITLE-ABS-KEY`):
build one canonical string, then port it, logging each ported variant in the ledger.

### Recall over precision

**Design for recall, screen for precision later** (PRISMA/Cochrane). A missed relevant paper is
invisible and unrecoverable downstream; a captured irrelevant paper is cheaply discarded at
title/abstract screening. The error costs are asymmetric, so broad OR-groups beat narrow terms.
**Prove recall**: hold out a set of known-relevant **anchor papers** and confirm the string
captures all of them *before* you start screening for precision. A string that drops an anchor is
silently truncating the corpus toward your own vocabulary.

## 3. Search completeness, snowballing, saturation, bias

**Run the two independent recall tactics** — one source = a biased corpus.

- **Keyword search** across venues/arxiv (`search_papers` with `ti:`/`abs:` field qualifiers).
- **Backward + forward snowballing** (Wohlin 2014): from a seed set, BACKWARD = harvest reference
  lists; FORWARD = harvest citing papers. `citation_graph` returns both directions in one call.
  **Tag each entry with its snowball generation** (G0 = seed, G1, G2…). Wohlin shows snowballing
  can match or beat database search for recall, and catches vocabulary-mismatch / cross-disciplinary
  papers the keyword net misses — mandatory for fast-moving AI4S where terminology outpaces indexing.

`semantic_search` is **local-only** — it clusters already-downloaded papers by meaning, a
dedup/sameness aid, NOT a recall tactic: it cannot surface un-downloaded work and returns empty
until `download_paper` has run. The two recall tactics above are the only ones; `semantic_search`
feeds the later sameness test (`synthesis.md`), so order it AFTER ingest.

### Saturation is evidence-driven, not budget-driven

**Stop when one full snowball iteration adds no claim-changing paper AND the seminal-coverage check
passes** — never "I read N papers" or "I ran out of time" (theoretical saturation, Glaser & Strauss,
adapted). Operationally, "no claim-changing paper" means **no new taxonomy cells AND no new
moderators** (the two signals `writing.md`'s STOP-GATHERING gate consumes — identical vocabulary).
Adequacy is coverage of the *claim space*, not corpus cardinality. **Record the iteration at which
the stopping rule fired** in the ledger; if it never fired, report the corpus as explicitly
incomplete in the Threats-to-Validity block (§4). A budget-driven stop silently inherits whatever
the budget cut off, and recency/venue bias rides in undetected.

### Corpus bias — name it, counter it, budget for it

Every corpus carries bias. Unaudited, it is laundered into the synthesis *as if it were the state of
the field*. Name each, apply its counter, and report the residual (§4):

| Bias | Mechanism | Counter |
|---|---|---|
| **Venue** | only top conferences indexed | include grey literature, workshops, tech reports (with a quality flag) |
| **Recency** | new work over-sampled, old anchors missed | deliberate **old-anchor inclusion**; the dual-sort probe below |
| **Citation (Matthew)** | viral early claims dominate ranking | never make citation count an inclusion criterion; the dual-sort probe |
| **Language** | English-only index | note the language scope as a residual threat |
| **Survivorship (file-drawer)** | nulls / refutations unpublished | seek preprints, replication / refutation papers; retraction checks |

**The dual-sort probe** (the operational test for recency/citation bias): run the *same* search
`sort_by=relevance` AND `sort_by=date`, then **diff the two result sets** — papers present in one
ranking but not the other expose what each ranking buries. Log the difference as the bias probe.

**Grey literature / preprints / retractions are a protocol decision, not a per-paper one.** State
the policy up front (include preprints with a quality flag, or exclude with justification); check
every included paper against Retraction Watch / publisher notices; tag `retraction_status` in the
ledger and exclude or quarantine retracted work explicitly.

> **Standing example — Schaeffer emergence dynamic.** The loud early claim ("emergent abilities",
> Wei et al. 2022) travels fast and ranks high by citation; the quieter metric-artifact correction
> ("a mirage", Schaeffer et al. 2023, arXiv:2304.15004) lags. A citation-ranked corpus over-weights
> the first and buries the second. **Both must be in the corpus, weighted by GRADE, not by
> citations** (GRADE certainty: `synthesis.md`). This is the canonical case for every bias counter
> above — and reads as escalating specificity after the bias table and grey-literature policy.

> The synthesis dimensions / context-vector axes are derived by the **Nickerson method — see
> `taxonomy.md`**; this file owns corpus **identification**, `taxonomy.md` owns the **scheme**,
> `ledger.md` owns the **per-claim tags**.

## 4. Threats-to-Validity block (required closing deliverable)

Close the corpus section with an explicit Threats-to-Validity block (Kitchenham/Petersen reporting).
This is what upgrades the artifact from essay to SoK. Cover all four; for each residual bias state
its **DIRECTION** and the **condition under which the SoK's conclusion REVERSES** — never a bare
"unverified" (this is invariant #5 applied at the corpus level):

| Validity | Question | Concrete check |
|---|---|---|
| **Construct** | did the search string capture the concept? | anchor-set recall test (§2); list synonyms/facets used |
| **Internal** | are screening decisions reliable? | **solo re-screen** (the default for this agent) — see threshold below; inter-rater **Cohen's κ** only in the rare multi-screener case |
| **External** | does the corpus generalize to the field? | venue/date/language coverage vs the field's known span |
| **Conclusion** | could synthesis flip if the file-drawer holds nulls? | state the publication-bias direction and the null-rate that would invert each headline claim |

**Internal-validity threshold (an LLM-driven SoK is almost always solo; κ is undefined for one
rater).** Default path: re-screen a random **≥10% sample after a cooling-off pass**. Decision rule:
**>1 reversal per 10 (any reversal on a small sample) ⇒ the inclusion criteria are under-specified —
rewrite them and re-screen the full set, do not proceed.** Multi-screener exception: κ < 0.6
(below Landis–Koch "moderate", Landis & Koch 1977) ⇒ criteria are ambiguous; rewrite and re-screen.

Template per residual: *"Recency bias under-samples pre-2020 work (direction: inflates apparent
novelty of X); the 'X is established' conclusion reverses if a pre-2020 refutation with GRADE ≥
Moderate exists — searched, none found / one found → demote."* Reconciliation of any surfaced
contradiction is handled in `synthesis.md`.

## 5. arxiv-MCP corpus recipe

Tool names use the `mcp__arxiv__` namespace (bare names below). The canonical set is **SIX**:
`search_papers`, `get_abstract`, `download_paper`, `read_paper`, `citation_graph`, `semantic_search`
(`download_paper` is the ingest step that precedes `read_paper`). This table lists ONLY the
tool-specific mechanics not stated elsewhere — the methodology lives in §1–§3:

| Step | Tool | Tool-specific mechanics (methodology → back-pointer) |
|---|---|---|
| Seed search | `search_papers` | Field codes `ti:"exact phrase"` / `abs:` / `au:`, `ANDNOT survey`, category filters (`cs.LG`, `cs.CL`, `stat.ME`); `date_from`/`date_to`. 2–4 concepts, not keyword soup. *Dual-sort probe → §3.* |
| Triage | `get_abstract` | Read abstract + metadata BEFORE `download_paper` — the token-saving relevance gate. Record include/exclude + reason tag. *Screening transition → §2.* |
| Snowball | `citation_graph` | Forward (who cites this) + backward (what it cites) in one call; tag generation G0/G1/G2. *Generations + saturation → §3.* |
| Ingest | `download_paper` → `read_paper` | Only after `get_abstract` passes. `read_paper` returns markdown for claim extraction (`ledger.md`). |
| Dedup-by-meaning | `semantic_search` | Same-phenomenon-different-words clustering over the **downloaded corpus only** — empty until `download_paper` has run; order it AFTER ingest. Feeds the sameness test (`synthesis.md`). |

Always check abstracts before full download. **Treat abstract claims as *candidate* claims** —
extract the real claim (with its context vector) from the methods/results, not the abstract spin
(`ledger.md`).

**Log every query and each stage's keep/drop counts into the PRISMA flow.** Every `search_papers`
string (and its `sort_by`), every `get_abstract` decision, and every snowball generation lands in
the ledger so the flow diagram and counts regenerate FROM it (§2). This is the audit trail a
reviewer replays to reconstruct your identification set on the same date.

> **Staleness:** tool names/schemas verified live 2026-06-18; re-verify on MCP upgrade →
> `grenza-doc-discipline` (versioning / SOT).

## 6. Stage map & handoffs

The full loop and its mandatory **write → extract** edge live in **SKILL.md §CORE** (the canonical
pipeline); the terminal delivery **STOP gates** live in **`writing.md` §5**. This file does not
restate either. Its narrower exit criterion is in the closing *Pipeline position* block.

**Map the SoK stages to the user's doc pipeline** (protocol → schema → worklist) — this mapping
lives only here:

| SoK stage | User doc command |
|---|---|
| Protocol (RQ + PICO + inclusion criteria) | `/REQUIREMENTS` |
| Taxonomy + ledger schema | `/DESIGN` |
| Per-cell / per-claim synthesis work | `/TASKS` |

**One-line handoffs** (cross-reference, do not re-implement):

| Concern | Hand to |
|---|---|
| corpus ledger as SOT, `{yymm}.y.z` versioning, staleness | `grenza-doc-discipline` |
| final document structure (local non-repeating MECE) | `/MECE` |
| editorial narrative (topic-sentence flow) | `/REORG` |
| the PRISMA / systematization diagrams (quote node labels) | `/AA` |
| ruthless, evidence-demanding review pass | `/linus` |
| multi-agent execution: solo/fan-out/barrier map, agent contract, trust boundary | `orchestration.md` |

The corpus stage itself is the pipeline's most parallel joint: multi-modal search fan-out with the
loop-until-dry saturation rule (§3), then a dedup barrier, then per-paper screening — the full
execution map, including what must stay solo, lives in `orchestration.md` (one home; not restated
here).

## Anti-patterns (corpus-scoped) — name the failure AND the fix

| Anti-pattern | Fix |
|---|---|
| **Convenience corpus** — papers you already knew, dressed up as systematic | Run a protocol-driven search; retro-tag the query/snowball path that WOULD have found each. No path → keep it out or flag `expert-seeded` in the ledger + threats. |
| **Precision-tuned string truncating recall** | Build recall-first (broad OR-groups); prove on the held-out anchor set; only then screen for precision. |
| **Stopping at a paper-count / time budget** | Define the saturation rule (no new taxonomy cells + no new moderators in one full snowball iteration + seminal-coverage); record the iteration it fired. |
| **Citation-ranked corpus burying corrections** | Run the dual-sort probe; deliberately include dissenters/refutations; never make citation count an inclusion criterion. |
| **PRISMA numbers / reference list / prose drift** | Ledger is SOT; regenerate counts + diagram FROM it on every bump → `grenza-doc-discipline`. |
| **HARKing the synthesis** | Freeze RQ + PICO + inclusion/exclusion before screening; record the PRISMA flow so the corpus is reconstructible. |

## Pipeline position

Output of this file = a **frozen RQ + known-vs-unknown sentence**, an **auditable PRISMA-traced
included-paper set**, and a **Threats-to-Validity block**. Next: build the dimension scheme
(`taxonomy.md`), extract claims into the ledger (`ledger.md`), then relate/reconcile/grade
(`synthesis.md`).
