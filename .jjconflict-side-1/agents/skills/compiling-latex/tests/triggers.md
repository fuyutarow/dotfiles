# compiling-latex — fire / no-fire set for the manuscript-cleanup extension (F3)

Desk-check with the name and description only, against every plausibly matching description.

## Fires

| Ask | Expected |
|---|---|
| 「この LaTeX 原稿、癖が強くて汚い。内容は変えずに format を top tier にして」 | FIRE: manuscript cleanup MC0–MC5. |
| 「マクロを断捨離してほしい」 (a .tex manuscript) | FIRE: MC1 census, then stages. |
| "Clean up this paper's preamble without changing the PDF" | FIRE: MC2 boxes oracle. |
| 「platex + dvipdfmx の原稿を pdflatex に移したい。見た目は変えずに」 | FIRE: engine change between stage 1 and 2; line-break oracle. |
| "After removing unused packages the blackboard-bold letters look different" | FIRE: MC3 package bisect (bbold). |
| 「latexmk がエラーで落ちる」 | FIRE: build recovery (existing scope). |
| 「NOTATION.md の禁止パターンで原稿を lint して、AI の編集が記法を崩していないか見て」 | FIRE: MC6, `tex-oracle.ts lint --contract` (§6). |
| "Prepare this revtex paper for APS and arXiv: .bbl, 80 columns, figures" | FIRE: §4 venue rows and the packaging oracle. |

## Near-miss no-fire

| Ask | Route |
|---|---|
| 「この論文の主張と新規性を査読に耐える形に」 | `arguing-research-papers`. |
| 「この段落の英語を自然に、LLM っぽさを消して」 | `linting-prose`. |
| 「研究リポジトリのどこに論文を置く？」 | `keeping-research-notebooks` homes §0. |
| "Make a slide deck from this paper" | `designing-presentations`. |
| 「mise のタスク名を揃えて」 | `wiring-mise-tasks`. |
