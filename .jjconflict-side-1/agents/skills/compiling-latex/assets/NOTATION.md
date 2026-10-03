# NOTATION — <paper directory name>

> Contract for every editor of this paper, human or AI. Format: compiling-latex
> `references/manuscript-cleanup.md` §6. Gate: `bun tex-oracle.ts lint main.tex --contract NOTATION.md`.
> Profile: REVTeX 4.2 / APS, pdfLaTeX, arXiv TL2023 and TL2025.

## Macros

Every macro lives in `notation.tex`, loaded by `main.tex` with `\input{notation}`.
An editor uses only the macros listed here. A new macro gets its row in the same change.

| Macro | Meaning | Typeset | Banned raw spellings (each one gets a forbidden rule) |
|---|---|---|---|
| `\ket{x}` | state vector | `\lvert x\rangle` | `\left\|`, `\|x\rangle` |

## Physics-syntax mapping

| physics | here |
|---|---|
| `\qty(..)` | `\bigl(..\bigr)` or a paired delimiter with `[\big]` |
| `\mqty`, `\smqty` | `pmatrix`, `smallmatrix` |
| `\abs`, `\norm` | `\DeclarePairedDelimiter` with `\lvert`/`\rvert` |
| `\dv`, `\pdv` | `\partial_i` |
| `\expval`, `\mel` | `\braket`, `\matrixel` |

## AI-use disclosure

Venue threshold: APS exempts light editing and requires disclosure of result-affecting code or figures (S6#9, S6#10).
Decision for this paper: <none | the statement and where it is printed>.

## Forbidden patterns

One rule per line: `<regex><TAB><reason>`. Append the paper's raw-spelling bans after the profile rules.

```forbidden
\\[egx]?def(?![A-Za-z])	APS forbids \def, \edef, \gdef; use \newcommand (S3#29)
\\DeclareDocumentCommand	overwrites silently; use \NewDocumentCommand or \newcommand (S2#36)
\$\$	display math is \[...\] or equation*, never $$ (S2#3, S2#21)
\\begin\{eqnarray	use align or align* (S2#15)
\\(?:bf|it|rm|sf|tt|sl|sc)(?![A-Za-z])	obsolete font switch; use \textbf, \mathrm and kin (S2#9)
\\over(?![A-Za-z])	use \frac (S2#7)
\\centerline(?![A-Za-z])	obsolete TeX command (S2#13)
\\centering(?![A-Za-z])	REVTeX floats center themselves; boxes decides the stage (S4#44)
\\(?:mbox|parbox|fbox|raisebox|rule|newfont)(?![A-Za-z])	APS bans box macros and \newfont; re-lay out instead (S3#30, S3#31)
\\begin\{minipage\}	APS bans minipage; compose panels in the figure script or subfig[caption=false] (S3#30, S4#51)
\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:physics|braket)\b	use mathtools paired delimiters; physics takes over \div and declares with \DeclareDocumentCommand (S1#44, S2#36)
\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:cite|mcite|multicol|endfloat|natbib)\b	REVTeX conflicts with it or already loads it (S3#28, S3#21)
\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:caption|subcaption)\b	incompatible with revtex4-2; use subfig[caption=false] (S4#51)
\\usepackage(?:\[[^\]]*\])?\{[^}]*\bcleveref\b	broken on arXiv TL2025; write Fig.~\ref (S4#67)
\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:array|tabularx|dcolumn)\b	revtex with array fails on TL2025+ (S3#49, S3#50)
\\(?:qty|mqty|smqty|pqty|bqty|dv|pdv|expval|mel|vb|va|vu)(?![A-Za-z])	physics syntax; use the mapping table above (house)
\\left\||\\right\|	a bar is not a paired delimiter; use \abs or \norm (S1#18)
\\(?:cite|ref|eqref)\{\s*\}	empty key is a content defect: report it, never guess (MC5)
\\caption(?:\[[^\]]*\])?\{.*\}\s*\\label\{	REVTeX puts \label inside \caption{...}; same-line check only (S4#45)
\\(?:today|pdfoutput)(?![A-Za-z])	arXiv: no \today in \date, no \pdfoutput (S3#60, S3#72)
[^\x00-\x7F]	APS accepted source is ASCII only (S3#41)
```
