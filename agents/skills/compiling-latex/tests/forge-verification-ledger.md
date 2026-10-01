# compiling-latex — forge verification ledger

## 2026-10-01 — extension: format-only manuscript cleanup (references/manuscript-cleanup.md)

**Function map.** existing manuscript source + "clean the format, keep the content" →
baseline (MC0) → census (MC1) → stage 1 proven word-box identical (MC2) → package bisect (MC3) →
stage 2 listed and explained (MC4) → content defects reported (MC5) → cleaned source + evidence.
EXTEND, not a new skill: the artifact is a LaTeX source and its build, which this skill owns;
a sibling would charge the listing again (F4).

**Source.** Practice, one manuscript (revtex4-2 twocolumn, 1265-line main file plus a
516-line personal macro file, upLaTeX + dvipdfmx), cleaned in QINotebook on 2026-10-01.
Every row of §2 Traps is an observed failure of a rewrite that looked harmless:

| Trap | Observation |
|---|---|
| Ord vs Inner | Bracket macros re-implemented without the outer group: page 4 pixel diff 2.6%; with the group, 0.19% |
| bbold | `boxes` showed ℂ moved 2.55pt vertically; leave-one-out isolated bbold |
| color whatsits | items (iii)–(v) shifted 0.041pt; pairwise bisect: bbold+color, or bbold+tikz, restores identity |
| `{}^\dagger{}` | `^\dagger` rewrite: "Double superscript" at `L\suplam_{\theta,i}\dagg` |
| `\scriptsize` in math | 16 "invalid in math mode" warnings, yet removal produced a 16.58pt overfull align |
| `\s*\n` regex | the `\lineskim` line removal merged "…latter." with "We have several remarks." |
| `\ip` collision | physics already defines `\ip`; `\newcommand` caught it |
| engine extraction | uplatex vs pdflatex: raw pdftotext differed on ligatures and `⟨`; prose line breaks equal |

Census of that manuscript: 203 names, 142 unused, 11 redefined; delimited-macro traps `\e1`, `\m1`, `\sofc2`.

**Floor.** `scripts/tex-oracle.ts` exercised on the real files: `boxes` IDENTICAL for the stage-1
build with bbold+color and DIFFERS (80) without; `words` lists exactly the four intended token
changes; `paras` 52 = 52, and 2 vs 1 on a two-paragraph fixture merged into one (teeth).

**Not covered (owner-named).** A `.bib` migration recipe for revtex/apsrev4-2 (content-adjacent:
needs metadata) — next reforge here. The `assets/mise-latex.toml` HARD failures against
`mise-contract.ts` recorded in keeping-research-notebooks ledger §7 — still open here.

**Adversarial verification** (workflow `wf_91e16854-fb0`, three read-only lenses on the cleaned file):
content preservation (opus-medium) found no meaning change. It found one index-layout change,
`(J)^{-1}{}_{ij}` stacked into `^{-1}_{ij}`, which was restored. Visual regression (sonnet-high)
found nothing beyond the intended changes; it noted smaller `\smqty` matrices and float gaps.
Format debt (sonnet-high) returned 16 items. The format-only, invisible ones were applied:
revtex front matter, `reprint`, label prefixes, the 6→5 Table II columns, the italic `$\lambda LD$`,
prose spaces before "(", and `wrap = false`. Visible style moves (BibTeX/apsrev4-2, definition
style, `\spn` limits, `braket`→mathtools, vector figures) went to the author as proposals.
New §2 rows from that round: a prose fix inside a narrow table overflowed it by 2.1pt, and a
hard-wrapping formatter broke inline math.
`assets/tex-fmt.toml` now ships `wrap = false`. Repos holding a copy keep theirs until they adopt it.

## 2026-10-01 — revision against a sourced survey; NOTATION contract and `tex-oracle.ts lint`

**Function map.** cleaned manuscript bound for REVTeX/APS + arXiv, edited by co-authors and AI →
venue rules applied by stage (§1, §4) → notation fixed in `notation.tex` + `NOTATION.md` (§6) →
`lint --contract` exit 0 (MC6) → a packaging copy proven by `boxes` (§3). EXTEND, not a sibling:
same artifact (the manuscript source), same owner.

**Source.** Survey of 2026-10-01 in the QINotebook session scratchpad (`survey/`): S1-math,
S2-canon, S3-venue, S4-floats, S5-build, S6-ai, VERIFY2-FINDINGS (V2#1–V2#25), and SYNTHESIS
§C/§D (22 LOOKUP rows D1–D22). Grades: A = manual/publisher/arXiv/LaTeX Project, B = package
author or LaTeX-team answer. The scratchpad is not durable; the soks units U6 (journal source
rules), U7 (arXiv processing), U1, U2, U4, U9, U10 and U11 are the durable home once the soks-side
session lands them. Id resolution until then: `Sk#n` = row n of the claims table in survey file Sk.

**Contradicted by primary sources (rows changed).**

| Old row | Source | New rule |
|---|---|---|
| §1 and §4 Floats: "`\label` right after `\caption`" | S4#45 (APS Author Guide 4.2: "best practice is to put the label within the argument of the \caption command") | revtex: `\label` inside `\caption{...}`; other classes keep right-after |
| §4 Definitions "no `\def`" as style, and the §2 `\def\e1` trap "never rename it", which left a used `\def` in place | S3#29 (APS: "Authors may not use TEX's low-level commands \def, \edef, and \gdef") | APS forbids `\def`/`\edef`/`\gdef` outright; a used delimited `\def` is rewritten at its use sites |
| §4 Packages "(`braket` before `physics`)" | S1#44–S1#49, S2#36 | never physics or braket beside mathtools paired delimiters; physics → mathtools is stage 2 |

**Added (D1–D22 → section).** D1, D2, D7, D19 → §4 Floats/Figures/Boxes (S4#43–S4#45, S3#30,
S3#31, S3#44, S4#51, S4#71, S4#74, S4#75). D3 → §4 Bibliography rows, incl. `.bbl` shipping for
arXiv and APS (S3#16–S3#20, S3#38, S3#39, S3#64, S5#82, S5#94). D4 → §4 APS packaging copy,
80-column ASCII, reconciled with one sentence per line: the authoring source keeps `wrap = false`;
only a separate packaging directory wraps, and `boxes` + an `awk` length check prove it (S3#41,
S5#31). D5 → §4 Definitions (S3#29, S2#31, S2#36). D6 → revtex + array/tabularx/dcolumn on
TL2025+ (S3#49–S3#51; S3#53 says the maintainers know, no release newer than 4.2f). D8 → cleveref
(S4#67). D9 → packages revtex loads (S3#21–S3#25, S3#28). D10–D13 → §1 stage rows (S1#6, S1#7,
S1#13, S1#18, S1#22). D14–D18 → §2 traps: APS box fixes (S3#30, V2#9), regex backreference to an
optional group (V2#25), ledger replay (V2#24), chktex exit 0 on lone warning 15 (S5#27, S5#29),
latexmk rc read before `-cd` (S5#5–S5#8). D20 → §4 Engine and Tagging (S5#75, S2#58, S4#82). D21 →
§5 Build pinning, with latexmk rc order (S5#1, S5#2, S5#52–S5#58, S5#64, S5#66, S5#67, S5#69).
D22 → §6 NOTATION contract and gate MC6 (house; S6-NF#3: no primary source on lint gates for
LLM-edited LaTeX; S6#9, S6#10 for the APS disclosure threshold). Every pre-existing practice row
now carries `(P)`, which points at the first 2026-10-01 entry above.

**Script.** `tex-oracle.ts lint <main.tex> --contract <NOTATION.md>`: one ```` ```forbidden ````
block, `<regex><TAB><reason>` per line; comment-stripped, per-line matching over main + every
`\input`/`\include`; exit 0/1/2. Two side changes in shared code: (1) comment stripping now treats
`%` after an even backslash run as a comment (the old `(?<!\\)%` missed `\\%`), which also
affects `census`; (2) every unknown flag now exits 2 through `rejectPrototypeFlag` (cleye's own
strict exit was 1, which this CLI reserves for "the oracle does not hold"). `census` now counts
`\DeclarePairedDelimiter(X|XPP)` definitions, the macro form §4 recommends.
`assets/NOTATION.md` ships the 21-rule REVTeX/APS + arXiv profile.

**Receipts.**

- `bun test agents/skills/compiling-latex/tests` → 18 pass / 0 fail. Teeth: the dirty fixture hits
  each of the 21 template rules exactly once across three files (main, `\input{notation}`, nested
  `\input{sections/body}`), exit 1. `\%` before `\raisebox` still hits; `\\%` before `\mbox` and a
  commented `\input{missing-file}` do not. The clean fixture exits 0. Seven contract-grammar errors
  and seven CLI boundary cases (missing or empty `--contract`, extra positional, unknown flag,
  `--__proto__`, missing contract, missing `\input` target) all exit 2.
- `skill-check.ts agents/skills/compiling-latex` → exit 0; prose debt 16 long sentences in
  SKILL.md (= the pre-revision count), 0 in `references/`, 0 long table cells.
- `mise run lint:bun` → exit 0 (FAIL=0; the 4 WARNs are in other skills' files).
- `oxlint` on the skill → 1 warning, the pre-existing `max-depth` in `boxes`.

**Not covered (owner-named, next reforge here).** `assets/mise-latex.toml` `latex:lint` still gates
on chktex's exit code, which D17 shows leaks a lone warning 15; it should parse output and call
`tex-oracle.ts lint`. The lint matches one line at a time, so a `\caption{...}` spanning lines
escapes the `\label` rule. Re-check the APS 80-column page at acceptance (listed 2012, S3#41).
Disputed and left as is: booktabs single rules vs APS double rules (synthesis A30), `[H]` (A29).
