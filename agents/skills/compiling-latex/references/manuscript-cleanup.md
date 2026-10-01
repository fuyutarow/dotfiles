# Manuscript cleanup — format only, proven by output (清書・マクロ断捨離)

> SOLE home for a format-only cleanup of an existing LaTeX manuscript.
> In scope: macro purge, preamble hygiene, engine change, float and markup repair.
> Argument and claims → `arguing-research-papers`. Prose wording → `linting-prose`.
> Where the paper lives in a notebook repo → `keeping-research-notebooks` homes §0.
> Evidence tool: `scripts/tex-oracle.ts` (census, boxes, words, paras).

## LAW

> "Format only" is a claim about the typeset output, so the output proves it — never a reading of
> the diff. Every rewrite belongs to exactly one of two stages. Stage 1 must leave the page
> word-box identical. Stage 2 changes the page only as listed in advance. A rewrite
> that changes the page while sitting in the identical stage is a defect, however small.

## Gates MC0–MC5

| Gate | Predicate before acting | Artifact | Deny |
|---|---|---|---|
| **MC0 BASELINE** | The CURRENT source rebuilt with its ORIGINAL engine and packages. A committed PDF is not a baseline: check its `CreationDate` against the source's mtime. | Baseline PDF + the exact build command. | Comparing against a stale shipped PDF. |
| **MC1 CENSUS** | `tex-oracle.ts census` over the main file and every `\input`. | Uses per name; REDEFINED and TRAP lines read. | Deleting or renaming a macro by eye. |
| **MC2 STAGE 1 IDENTICAL** | Same engine and same packages as MC0. Source-only rewrites: dead code, unused macros, renames to identical expansions, `\def`→`\newcommand`, `\cal`→`\mathcal`. | `tex-oracle.ts boxes baseline.pdf stage1.pdf` → BOXES IDENTICAL. | Pixel diff or plain-text diff as the oracle (see §3). |
| **MC3 PACKAGES** | Drop packages only after MC2; bisect leave-one-out and pairwise for side effects. | One line per dropped package: no effect, or the visible effect and its stage. | Dropping a package "because nothing uses it" without the bisect. |
| **MC4 STAGE 2 LISTED** | Visible fixes, each named before it is applied, each with an expected hit count. | `words` diff explained token by token; `paras` equal; a page-image review. | A visible change discovered only after the fact. |
| **MC5 CONTENT BOUNDARY** | A defect in what the paper SAYS is reported, not fixed. | A list: empty `\cite{}`/`\ref{}`, duplicated words, missing indices, notation mixes. | "Fixing" a typo in an equation inside a format task. |

## §1 Stages — which rewrite goes where

| Rewrite | Stage | Why it is there |
|---|---|---|
| delete commented-out code, unused macros, unused packages that MC3 cleared | 1 | no output |
| rename to an identical expansion (`\v`→`\bv`, `\sfF`→`\bv{F}`, `\I`→`\im`, `\bbr`→`\R`) | 1 | same tokens after expansion |
| `{\cal X}`→`\mathcal{X}`, `\rm`→`\mathrm`, `\mbox`→`\text` in math | 1 | same glyphs; confirm with `boxes` |
| engine change (pLaTeX/upLaTeX + dvipdfmx → pdfLaTeX for a revtex/APS target) | between 1 and 2 | glyph extraction changes; the oracle is line breaks (`words` + a page check), not boxes |
| `\mathbb` glyph source (bbold/bbm → amssymb) | 2 | different glyphs |
| `X{}^\dagger{}`→`X^\dagger`, `{}^{-1}{}`→`^{-1}` | 2 | superscript attaches to its base |
| `[H]` + negative `\vspace` hacks → class float placement | 2 | floats move |
| `{\scriptsize\mqty(...)}`→`\smqty(...)` | 2 | delimiters shrink with the matrix |
| leaked markup (`\label[x]` printing "x]"), stray `\sf` in math | 2 | the page changes, the content does not |
| ties before `\ref`/`\cite`, `\label` right after `\caption`, `\ldots`, `\@` after a capital sentence end, no vertical rules with booktabs | 2 | line breaks may move |
| `tex-fmt` | any | verified output-preserving with `boxes` |

## §2 Traps met in practice — each one broke a "harmless" rewrite

| Trap | Symptom | Rule |
|---|---|---|
| A macro body wrapped in `{...}` makes an Ord atom; `\left…\right` alone is Inner | Re-implementing a bracket macro without the outer braces adds thin spaces and moves line breaks pages later | Keep the outer group when the old expansion had it: `\newcommand{\inner}[2]{{\left\langle #1\,,\,#2\right\rangle}}` |
| `\def\cH{{\cal H}}` braces a group | `\cH_d` subscript sits on a group, not a glyph | Usually no visible change; `boxes` decides, not intuition |
| `{}^\dagger{}` can be load-bearing | `L^{(\lambda)}_{i}^\dagger` → "Double superscript" | Attach to the base only where the base has no superscript; elsewhere keep `{}^\dagger` explicitly |
| A size command "invalid in math mode" still acts | Removing `{\scriptsize …}` around `\mqty` widened an align by 16pt | A warning is not a no-op; check the page, then use the construct the author meant (`\smqty`) |
| A loaded package replaces glyphs or adds whatsits | bbold swapped every `\mathbb`; color/xcolor shifted list labels 0.04pt | MC3 leave-one-out AND pairwise: packages substitute for each other (tikz loads xcolor) |
| Last definition wins | `\Re` defined in the macro file and again in the main file | Census REDEFINED shows the site in force; expand THAT one |
| `\def\e1{…}` | Looks like a name `\e1`; it is `\e` delimited by `1` | Census TRAP line; delete if unused, never "rename" it |
| A new name collides with a package | `\ip`, `\comm`, `\acomm`, `\Re`, `\tr` belong to physics | `\newcommand` only (it errors on collision); never `\def`/`\renewcommand` to win |
| A regex deleting a line with `\s*\n` | Ate the following blank line and merged two paragraphs | Use `[ \t]*\n`; run `paras` after every stage |
| Engine change alters text extraction | `ﬁ` vs `fi`, `⟨` extracted as `h`, math order | Cross-engine oracle is prose words and line breaks, never raw `pdftotext` equality |
| `[H]`→`[htbp]` in revtex twocolumn | "A float is stuck" | Add `floatfix`; confirm every float is placed near its first reference |
| A prose fix applied inside a narrow table | "Kind I (triangle)" overflowed Table II by 2.1pt | Scope spacing fixes to prose; re-read the Overfull list after every stage |
| A hard-wrapping formatter | `tex-fmt` with `wrap = true` broke lines inside inline math and macro arguments | `wrap = false`: one sentence per line is the layout; the formatter only indents |

## §3 Oracles — pick by what must hold

| Must hold | Command | Pass |
|---|---|---|
| Stage 1 changed nothing on the page | `tex-oracle.ts boxes base.pdf s1.pdf` | BOXES IDENTICAL |
| A package drop is invisible | `boxes` on the build with vs without it | IDENTICAL, or the effect listed under MC3 |
| Engine change kept the layout | prose line breaks per page and column, ligatures normalized | same lines; leftover differences are math extraction only |
| Stage 2 kept the words | `tex-oracle.ts words s1.pdf s2.pdf` | every only-in token explained in the MC4 list |
| No paragraph merged or split | `tex-oracle.ts paras s1.tex s2.tex` | equal counts |
| Nothing new overflows | the log's Overfull lines, compared with the baseline's | no new entries |

Pixel diff (`compare -metric AE`) is a locator, not an oracle: anti-aliasing flags sub-point shifts on every page.
Use it to find WHERE `boxes` differs, then crop both renders and look.

## §4 Target conventions for a cleaned manuscript

| Concern | Convention |
|---|---|
| Engine | the venue's: revtex/APS and arXiv → pdfLaTeX; (u)pLaTeX only when the text is Japanese |
| revtex front matter | class option `reprint` (not `twocolumn`); one `\author` per person; `\email` right after its author; one shared `\affiliation` after them |
| Packages | each one used, in a stated order when it matters (`braket` before `physics`); no `here`, `bbold`/`bbm` only for an intended glyph |
| Macros | semantic notation only (`\supm`, `\BQs`, `\inner`); no aliases of a single built-in (`\be`, `\ds`, `\del`); grouped and commented by role |
| Definitions | `\newcommand`/`\DeclareMathOperator`; no `\def`; no redefinition of kernel commands (`\v`, `\Re`) |
| Floats | class placement; `\label` right after `\caption`; booktabs without vertical rules |
| Figures | `\graphicspath`, no extensions in `\includegraphics` |
| Source layout | one sentence per line; `tex-fmt` with `wrap = false` (indent only) |
| Bibliography | keep the author's `thebibliography` in a format task; moving to `.bib` + the venue style changes rendering and needs missing metadata (content) |
