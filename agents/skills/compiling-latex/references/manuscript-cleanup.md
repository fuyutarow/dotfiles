# Manuscript cleanup — format only, proven by output (清書・マクロ断捨離)

> SOLE home for a format-only cleanup of an existing LaTeX manuscript, and for its NOTATION contract (§6).
> In scope: macro purge, preamble hygiene, engine change, float and markup repair, venue packaging.
> Argument and claims → `arguing-research-papers`. Prose wording → `linting-prose`.
> Where the paper lives in a notebook repo → `keeping-research-notebooks` homes §0.
> Evidence tool: `scripts/tex-oracle.ts` (census, boxes, words, paras, lint).
> Evidence ids end each row: `S3#29` is survey S3 row 29, `V2#n` a verification finding.
> `P` is a failure observed in practice. The ledger entries of 2026-10-01 resolve every id.

## LAW

> "Format only" is a claim about the typeset output, so the output proves it — never a reading of
> the diff. Every rewrite belongs to exactly one of two stages. Stage 1 must leave the page
> word-box identical. Stage 2 changes the page only as listed in advance. A rewrite
> that changes the page while sitting in the identical stage is a defect, however small.

## Gates MC0–MC6

| Gate | Predicate before acting | Artifact | Deny |
|---|---|---|---|
| **MC0 BASELINE** | The CURRENT source rebuilt with its ORIGINAL engine and packages. A committed PDF is not a baseline: check its `CreationDate` against the source's mtime. (P) | Baseline PDF + the exact build command. | Comparing against a stale shipped PDF. |
| **MC1 CENSUS** | `tex-oracle.ts census` over the main file and every `\input`. (P) | Uses per name; REDEFINED and TRAP lines read. | Deleting or renaming a macro by eye. |
| **MC2 STAGE 1 IDENTICAL** | Same engine and same packages as MC0. Source-only rewrites: dead code, unused macros, renames to identical expansions, `\def`→`\newcommand`, `\cal`→`\mathcal`. (P) | `tex-oracle.ts boxes baseline.pdf stage1.pdf` → BOXES IDENTICAL. | Pixel diff or plain-text diff as the oracle (see §3). |
| **MC3 PACKAGES** | Drop packages only after MC2; bisect leave-one-out and pairwise for side effects. (P) | One line per dropped package: no effect, or the visible effect and its stage. | Dropping a package "because nothing uses it" without the bisect. |
| **MC4 STAGE 2 LISTED** | Visible fixes, each named before it is applied, each with an expected hit count. (P) | `words` diff explained token by token; `paras` equal; a page-image review. | A visible change discovered only after the fact. |
| **MC5 CONTENT BOUNDARY** | A defect in what the paper SAYS is reported, not fixed. (P, V2#12–V2#17) | A list: empty `\cite{}`/`\ref{}`, duplicated words, missing indices, notation mixes. | "Fixing" a typo in an equation inside a format task. |
| **MC6 CONTRACT** | The paper has `NOTATION.md` (§6); every edit, human or AI, ends with the lint gate. (V2#18, house) | `tex-oracle.ts lint main.tex --contract NOTATION.md` → LINT CLEAN. | A new macro or raw spelling with no NOTATION.md row in the same change. |

## §1 Stages — which rewrite goes where

| Rewrite | Stage | Why it is there |
|---|---|---|
| delete commented-out code, unused macros, unused packages that MC3 cleared | 1 | no output (P) |
| rename to an identical expansion (`\v`→`\bv`, `\sfF`→`\bv{F}`, `\I`→`\im`, `\bbr`→`\R`) | 1 | same tokens after expansion (P) |
| `{\cal X}`→`\mathcal{X}`, `\rm`→`\mathrm`, `\mbox`→`\text` in math | 1 | same glyphs; confirm with `boxes` (P) |
| move the macro block verbatim into `notation.tex` + `\input{notation}` | 1 | a pure move; confirm with `boxes` (house) |
| engine change (pLaTeX/upLaTeX + dvipdfmx → pdfLaTeX for a revtex/APS target) | between 1 and 2 | glyph extraction changes; the oracle is line breaks (`words` + a page check), not boxes (P) |
| add `\mathopen{}` after the inner `\delimsize\vert` of `\braket` | 1 iff no second argument starts with a sign or binary operator (search the arguments first); else 2 | Ord-after-Ord spacing is unchanged; a following `-` becomes a sign (S1#6, S1#7) |
| remove `\centering` inside revtex floats | `boxes` decides: IDENTICAL → 1, else 2 | REVTeX centers floats itself (S4#44) |
| `\mathbb` glyph source (bbold/bbm → amssymb) | 2 | different glyphs (P) |
| raw `\|x\|` or `\lvert x\rvert` → a paired-delimiter macro (`\abs`, `\norm`) | 2 | the `\mathclose` fence raises superscripts (S1#13, S1#18) |
| physics → mathtools paired delimiters | 2; list each site that needs `[\big]` or `[\Big]` | auto-sized fences become fixed and inner-atom spacing changes (S1#22, S1#13, V2#2–V2#5) |
| `X{}^\dagger{}`→`X^\dagger`, `{}^{-1}{}`→`^{-1}` | 2 | superscript attaches to its base (P) |
| `[H]` + negative `\vspace` hacks → class float placement | 2 | floats move (P) |
| `{\scriptsize\mqty(...)}`→`\smqty(...)` | 2 | delimiters shrink with the matrix (P) |
| leaked markup (`\label[x]` printing "x]"), stray `\sf` in math | 2 | the page changes, the content does not (P) |
| ties before `\ref`/`\cite`, `\ldots`, `\@` after a capital sentence end, no vertical rules with booktabs | 2 | line breaks may move (P) |
| `\label` position: revtex → inside `\caption{...}`; other classes → right after `\caption` | 2 until `boxes` shows IDENTICAL | the APS guide's best practice for revtex (S4#45) |
| `tex-fmt` | any | verified output-preserving with `boxes` (P) |

## §2 Traps met in practice — each one broke a "harmless" rewrite

| Trap | Symptom | Rule |
|---|---|---|
| A macro body wrapped in `{...}` makes an Ord atom; `\left…\right` alone is Inner | Re-implementing a bracket macro without the outer braces adds thin spaces and moves line breaks pages later | Keep the outer group when the old expansion had it: `\newcommand{\inner}[2]{{\left\langle #1\,,\,#2\right\rangle}}` (P) |
| `\def\cH{{\cal H}}` braces a group | `\cH_d` subscript sits on a group, not a glyph | Usually no visible change; `boxes` decides, not intuition (P) |
| `{}^\dagger{}` can be load-bearing | `L^{(\lambda)}_{i}^\dagger` → "Double superscript" | Attach to the base only where the base has no superscript; elsewhere keep `{}^\dagger` explicitly (P) |
| A size command "invalid in math mode" still acts | Removing `{\scriptsize …}` around `\mqty` widened an align by 16pt | A warning is not a no-op; check the page, then use the construct the author meant (`\smqty`) (P) |
| A loaded package replaces glyphs or adds whatsits | bbold swapped every `\mathbb`; color/xcolor shifted list labels 0.04pt | MC3 leave-one-out AND pairwise: packages substitute for each other (tikz loads xcolor) (P) |
| Last definition wins | `\Re` defined in the macro file and again in the main file | Census REDEFINED shows the site in force; expand THAT one (P) |
| `\def\e1{…}` | Looks like a name `\e1`; it is `\e` delimited by `1` | Census TRAP line. Unused → delete. Used in an APS paper → rewrite each use site to a `\newcommand` macro (stage 2 if the expansion differs); APS forbids `\def` (S3#29, P) |
| A new name collides with a package | `\ip`, `\comm`, `\acomm`, `\Re`, `\tr` belong to physics | `\newcommand` only (it errors on collision); never `\def`/`\renewcommand` to win (P) |
| A regex deleting a line with `\s*\n` | Ate the following blank line and merged two paragraphs | Use `[ \t]*\n`; run `paras` after every stage (P) |
| A regex with a backreference to an optional group (`align(\*)?…\end\{align\2\}`) | Python `re`: a backreference to a group that did not take part never matches, so every unstarred block was skipped silently | Handle the two forms separately; count hits per form against the plan before accepting the stage (V2#25) |
| An edit ledger (applied/skipped JSON) beside the manuscript | One edit reached the output while the ledger listed it as skipped | Replay the applied ledger on the stage input and diff against the output; any edit outside the ledger is a defect, even a correct one (V2#24) |
| A suggested fix uses `\mbox`, `\raisebox` or minipage in an APS paper | Reviewers and tools propose box fixes for line-break and panel problems | Reject it; re-lay out instead (move to a display, compose the figure in its script) (S3#30, V2#9) |
| Engine change alters text extraction | `ﬁ` vs `fi`, `⟨` extracted as `h`, math order | Cross-engine oracle is prose words and line breaks, never raw `pdftotext` equality (P) |
| `[H]`→`[htbp]` in revtex twocolumn | "A float is stuck" | Add `floatfix`; confirm every float is placed near its first reference (P, S4#39, S4#41) |
| A prose fix applied inside a narrow table | "Kind I (triangle)" overflowed Table II by 2.1pt | Scope spacing fixes to prose; re-read the Overfull list after every stage (P) |
| A hard-wrapping formatter on the authoring source | `tex-fmt` with `wrap = true` broke lines inside inline math and macro arguments | `wrap = false`: one sentence per line is the layout; the formatter only indents. Wrapping belongs to the APS packaging copy (§4) (P) |
| `chktex` exit status as a CI gate | Warnings exit 2 and errors 3 since 1.7.7, but a lone end-of-file warning 15 exits 0 | Gate on parsed output, not the exit code; project bans go in `UserWarnRegex` or the §6 contract (S5#27, S5#29) |
| `latexmk -cd sub/main.tex` | Reads the invocation directory's rc, not `sub/latexmkrc`; rc files are read before `-cd` acts | Run from the paper directory (mise `dir =` or `cd`) or pass `-r sub/latexmkrc`; relative `$out_dir` then resolves against `sub/` (S5#5–S5#8) |

## §3 Oracles — pick by what must hold

| Must hold | Command | Pass |
|---|---|---|
| Stage 1 changed nothing on the page | `tex-oracle.ts boxes base.pdf s1.pdf` | BOXES IDENTICAL |
| A package drop is invisible | `boxes` on the build with vs without it | IDENTICAL, or the effect listed under MC3 |
| Engine change kept the layout | prose line breaks per page and column, ligatures normalized | same lines; leftover differences are math extraction only |
| Stage 2 kept the words | `tex-oracle.ts words s1.pdf s2.pdf` | every only-in token explained in the MC4 list |
| No paragraph merged or split | `tex-oracle.ts paras s1.tex s2.tex` | equal counts |
| Nothing new overflows | the log's Overfull lines, compared with the baseline's | no new entries |
| The edit ledger is the whole edit | replay the applied entries on the stage input, then `diff` against the output (V2#24) | no difference |
| The NOTATION contract holds | `tex-oracle.ts lint main.tex --contract NOTATION.md` | LINT CLEAN, exit 0 |
| The APS packaging copy is the same paper | `boxes` authoring.pdf vs packaging.pdf; `awk 'length > 80 {print FILENAME ":" FNR}' *.tex` | IDENTICAL, and no line printed |

Pixel diff (`compare -metric AE`) is a locator, not an oracle: anti-aliasing flags sub-point shifts on every page.
Use it to find WHERE `boxes` differs, then crop both renders and look.

## §4 Target conventions for a cleaned manuscript

| Concern | Convention |
|---|---|
| Engine | the venue's: revtex/APS and arXiv → pdfLaTeX, since arXiv has no lualatex; the LaTeX team's LuaTeX advice is for new non-venue documents (S5#75, S2#58). (u)pLaTeX only when the text is Japanese |
| Tagging | no `\DocumentMetadata` or tagged PDF with revtex: CTAN tags revtex "Tagged PDF - incompatible" (S4#82) |
| revtex front matter | class option `reprint` (not `twocolumn`); one `\author` per person; `\email` right after its author; one shared `\affiliation` after them (P) |
| Packages revtex already loads | natbib (`sort&compress`), url, textcase: never `\usepackage{natbib}`. Not loaded: amsmath, bm, hyperref; load those yourself (S3#21–S3#25) |
| Packages that conflict with revtex | cite, mcite, multicol, endfloat (S3#28); caption, subcaption → `subfig[caption=false]` (S4#51) |
| `array`, `tabularx`, `dcolumn` with revtex | do not add: revtex with array fails on TL2025+ (S3#49, S3#51). Unavoidable → `\usepackage{array}[=2016-10-06]` or arXiv TL2023 (S3#50). That dcolumn loads array is unverified: check `\listfiles` |
| `cleveref` for an arXiv build | do not add: broken on TL2025, names collapse (S4#67). Write `Fig.~\ref{...}` per APS style |
| physics, braket | never beside mathtools paired delimiters: name collisions on `\bra`, `\ket`, `\braket`, `\tr`, `\abs`, `\norm`, `\qty`; physics declares with `\DeclareDocumentCommand`, which overwrites silently (S1#44–S1#49, S2#36) |
| Other packages | each one used; no `here`; `bbold`/`bbm` only for an intended glyph (P) |
| Macros | semantic notation only (`\supm`, `\BQs`, `\inner`) in `notation.tex` (§6); no aliases of a single built-in (`\be`, `\ds`, `\del`); grouped and commented by role (P) |
| Bracket macros | `\DeclarePairedDelimiter(X)` so `[\big]` works; inner bar `\,\delimsize\vert\,\mathopen{}`. Unstarred fixed size is the default; `\left/\right` only around two-story display fractions (S1#2–S1#8, S1#21, S1#23) |
| Definitions | `\newcommand`/`\DeclareMathOperator`/`\NewDocumentCommand` (kernel since 2020-10, no `xparse`) (S2#31). APS forbids `\def`, `\edef`, `\gdef` outright (S3#29). Flag `\DeclareDocumentCommand` (S2#36); no redefinition of kernel commands (`\v`, `\Re`) (P) |
| Floats | class placement; booktabs without vertical rules (P). revtex: no `\centering` inside floats (S4#44); `\caption{... \label{fig:x}}` (S4#45); `figure*`, never `widetext` for a wide figure (S4#43) |
| Boxes in an APS paper | no `\mbox`, `\parbox`, `\fbox`, `\raisebox`, `\rule`, minipage, `\newfont` (S3#30, S3#31) |
| Figures | `\graphicspath`, no extensions in `\includegraphics` (P). One format per submission (S3#44): arXiv pdfLaTeX takes pdf/png/jpg only (S4#74); a same-name `.pdf` beats `.png` (S4#71); names are case-sensitive (S4#75). Panels composed by the figure's script, not minipage (S3#30) |
| Source layout (authoring) | one sentence per line; `tex-fmt` with `wrap = false` (indent only) (P, S5#31) |
| Source layout (APS at acceptance) | a packaging copy: ASCII only, lines ≤ 80 characters (S3#41). Make it in a separate directory whose own `tex-fmt.toml` sets `wrap = true`; prove it with the §3 packaging row. A wrapped comment tail becomes text, and `boxes` catches it |
| Bibliography (author's `thebibliography`) | keep it in a format task; moving to `.bib` + the venue style changes rendering and needs missing metadata (content) (P) |
| Bibliography (already `.bib` + revtex journal option) | no `\bibliographystyle`: the journal option picks apsrev4-2; an explicit one goes in the preamble (S3#16–S3#18). `longbibliography` is the default since 4.2a (S3#19, S3#20) |
| Bibliography shipping, arXiv | `main.bbl` at the upload root with the main file's base name (S3#64, S5#82), plus the `.bib`; `arxiv_latex_cleaner --keep_bib` (S5#94) |
| Bibliography shipping, APS | at acceptance the `.bbl` is pasted into, or `\input` from, the main `.tex` (S3#38, S3#39) |

## §5 Build pinning — which TeX to verify against

| Question | Rule |
|---|---|
| Which TeX Live years | the arXiv pair, TL2025 (default) and TL2023, plus the local build (S3#47) |
| How to pin a year | a frozen `tlnet-final` (no updates after YYYY+1 ships) or a Docker image by digest; tags are rebuilt, so a tag is not a pin (S5#52–S5#58, S5#64) |
| What the CI log must show | `\listfiles` output, so package versions are on record (S5#69) |
| Reproducible PDF dates | `SOURCE_DATE_EPOCH` sets pdfTeX PDF dates; `\today` follows it only with `FORCE_SOURCE_DATE=1` (S5#66, S5#67) |
| Which latexmk rc is read | system, then user (`$XDG_CONFIG_HOME/latexmk/latexmkrc` before `~/.latexmkrc`), then the INVOCATION directory, then `-r` files; all before `-cd` acts (S5#1, S5#2, S5#5, S5#6). A per-paper rc needs the build to start in the paper directory |

## §6 NOTATION contract — notation as an editing interface

A paper edited by more than one hand keeps two files next to `main.tex` (house; no primary source covers it, S6-NF#3).

| File | Holds | Never holds |
|---|---|---|
| `notation.tex` | semantic macros only, loaded by `\input{notation}`; packages stay in `main.tex` | aliases of one built-in, layout hacks, `\def` |
| `NOTATION.md` | one row per macro (meaning, typeset form, banned raw spellings), the physics-syntax mapping, the AI-disclosure decision, ONE `forbidden` fenced block | content claims; those are MC5 reports |

Start from `assets/NOTATION.md`: its block is the REVTeX/APS + arXiv profile, every rule carrying its evidence id.
An editor uses only listed macros; a new macro adds its row and its raw-spelling rule in the same change.
Record the venue's AI-disclosure threshold in it.
APS exempts light editing (S6#9) and requires disclosure of result-affecting code (S6#10).

The `forbidden` block grammar, enforced by `tex-oracle.ts lint` (any violation exits 2):

```text
block   = "```forbidden" NL { line } "```" NL      exactly one block per NOTATION.md
line    = blank | rule
rule    = regex TAB reason NL                      split at the FIRST tab
regex   = ECMAScript RegExp source, non-empty, no literal TAB (write \t); compiled with flag g
reason  = free text, non-empty after trimming; ends with the evidence id, e.g. (S3#29)
```

| Lint behavior | Rule |
|---|---|
| Scope | `main.tex` plus every `\input{x}`/`\include{x}` reached from it, `x.tex` tried first, resolved against the main file's directory |
| Comments | stripped first: `%` after an even run of backslashes starts a comment; `\%` is text |
| Matching | per rule, per comment-stripped line; a construct spread over lines is invisible to it |
| Output | one line per hit, `file:line:col: [Rn]`, the match in backticks, then the reason; non-ASCII prints as `<U+XXXX>` |
| Verdict | last line `LINT CLEAN` or `LINT FAILED: k hits`; exit 0 clean, 1 any hit, 2 contract or usage error |
| A raw-spelling ban hits its own definition in `notation.tex` | exclude the definition site with a lookbehind, e.g. `(?<!\\operatorname\{)\bspan\b` |
