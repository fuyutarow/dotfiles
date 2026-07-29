# Fire / no-fire desk-check — systematizing-knowledge

Re-run after any `description:` edit. **Stage-only protocol:** read only the `name:` and
`description:` fields of this skill and plausible siblings, then decide FIRE / NO-FIRE / CO-FIRE.
Do not use body knowledge to rescue an ambiguous description.

## FIRES

| # | Ask | Why this skill |
|---|---|---|
| F1 | “Synthesize these 40 papers into what the field knows, disputes, and still cannot answer.” | a corpus must become a field-level, evidence-bounded position |
| F2 | 「渡した12本は同じ手法を評価しているのに結論が割れている。比較可能性を見て、何が言えるか統合して」 | a closed corpus plus discrepancy adjudication |
| F3 | “Build a defensible taxonomy of authentication failures from this literature, including boundary cases.” | classification is the requested corpus-level contribution |
| F4 | “Plan a reproducible systematic review and meta-analysis of this intervention outcome.” | review-mode, coverage, appraisal, and synthesis-operator selection |
| F5 | 「この領域の系統的レビューを更新して、どの結論が新しい研究で変わったか追跡して」 | living-review evidence and claim-graph update |
| F6 | “I have papers, standards, and benchmark reports with incompatible metrics; tell me who actually agrees and how confident we should be.” | multi-source synthesis without a headline keyword |
| F7 | “Does the security literature support the belief that memory-safe rewrites eliminate this attack class, or are there scoped counterexamples?” | venue-style SoK belief test and threat-model comparison |

## MUST NOT FIRE

| # | Ask | Route |
|---|---|---|
| N1 | “Explain this one paper and check Table 3.” | `raising-resolution` — one artifact |
| N2 | “Help defend the central claim of my manuscript against reviewers.” | `arguing-research-papers` — one manuscript’s argument |
| N3 | 「次の半年で賭ける研究テーマを3案から選びたい」 | `directing-research` — future research bets |
| N4 | “Reorder this completed review and remove duplicate sections; the evidence judgments are settled.” | `structuring-documents` — document architecture |
| N5 | “Find every mention of data leakage in my indexed notes.” | `driving-cocoindex` — retrieval, not synthesis |
| N6 | “Debug the split leakage in my own training pipeline.” | `raising-resolution`, then `implementing-and-debugging` if a fix is requested |
| N7 | “Create a reusable skill from this already-reconciled operating manual.” | `forging-skills` — skill craft |

## CO-FIRE — order matters

| # | Ask | Order |
|---|---|---|
| C1 | “Use several agents to synthesize 300 papers into an SoK.” | `systematizing-knowledge` selects review mode, schemas, and SOLO judgments → `orchestrating-agents` runs generic briefing/dispatch/acceptance → this skill adjudicates and signs the position |
| C2 | “Synthesize the field, then turn the result into our paper’s governing claim.” | `systematizing-knowledge` establishes the bounded evidence state → `arguing-research-papers` chooses and defends the manuscript claim |
| C3 | “Map the evidence gaps, then decide which research direction deserves funding.” | `systematizing-knowledge` identifies evidence-specific gaps without ranking them → `directing-research` makes the forward-looking bet |
| C4 | “Reforge systematizing-knowledge because its rules are crude.” | `forging-skills` owns the reforge → `systematizing-knowledge` is the domain artifact under audit; use `operating-the-harness` when executable checks are added |
| C5 | “Turn a raw paper corpus into a durable synthesis skill.” | `systematizing-knowledge` reconciles the corpus first → `forging-skills` distills the settled operating knowledge |

## Sharp cuts

- **Cardinality:** one external artifact goes to `raising-resolution`; multiple sources supporting
  a knowledge-state claim come here.
- **Object:** a manuscript’s argument goes to `arguing-research-papers`; the field’s evidence state
  comes here.
- **Time direction:** what existing evidence licenses comes here; which future bet deserves effort
  goes to `directing-research`.
- **Fix locality:** settled prose architecture goes to `structuring-documents`; unsettled evidence
  derivation stays here.
