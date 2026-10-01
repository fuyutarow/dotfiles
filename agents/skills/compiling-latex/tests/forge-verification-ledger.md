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
