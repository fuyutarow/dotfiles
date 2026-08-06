# Sources — graded basis for every rule in this skill

> **SOLE owner** of this skill's source-grade table and of the rule→source map. The full corpus
> position, its coverage contract, its counterevidence section, and its update conditions live in
> `agents/research-control/GENERATIVE-SOK.md` — read there before changing any rule here. This file
> exists so a maintainer can see, per rule, exactly how strong its basis is.

## 1. Verification classes

Assigned from how the row was actually obtained during the 2026-08-05 sweep, not from the source's
prestige.

| Class | Meaning | Handling |
|---|---|---|
| `VERBATIM` | the quoted sentence was read at the source in that pass | may be quoted |
| `ABSTRACT-ONLY` | only the abstract was read | may be cited; the body's details may not be asserted |
| `SECONDARY-SUMMARY` | a search-engine or third-party summary; the primary text was NOT opened | **may not be quoted as verified**; a rule resting on it is labeled here and in the SoK |
| `HOUSE` | an artifact inside this repository, read in place | cite by path and line |

## 2. Source table

| Source | Class | What it licenses here |
|---|---|---|
| McMahan & McFarland, *American Sociological Review* 86(2):341–376, 2021, abstract | `VERBATIM` | The burial declaration and the `CONTRADICTION` row type — reviews divert citations from what they cite and concentrate attention on the works they name as bridges (GL2, GL3, GF1) |
| Uzzi, Mukherjee, Stringer & Jones, *Science* 342(6157):468, 2013, abstract | `VERBATIM` | The anchoring rule and the tail cap — highest impact is exceptional conventionality plus an intruding tail, ~2× hit rate (GL4, GL5, GF2) |
| Foster, Rzhetsky & Evans, *ASR* 2015 (arXiv:1302.6906), abstract | `VERBATIM` | Lower the cost of the risky move rather than exhorting it — reward does not compensate risk (GL6) |
| Rzhetsky, Foster, Foster & Evans, *PNAS* 112(47):14569–14574, 2015, abstract | `VERBATIM` | Same, plus admitting negative and failed observations as openings (GL6, GL7, GF3) |
| Crocker, RFC 3 *Documentation Conventions*, 1969 | `VERBATIM` | The one-sentence publication threshold and `AUTHORITY: NONE`'s stated rationale (GL12, GL13, GF6) |
| Cestnik, Kastrin, Koloski & Lavrač, arXiv:2502.16450 | `ABSTRACT-ONLY` | The restraint on `NON-ADJACENCY` — the discovery tradition built on this structure has acknowledged reproducibility problems (GF4) |
| Kastrin, Cestnik & Lavrač, arXiv:2506.12385 | `ABSTRACT-ONLY` | Same (GF4) |
| Robinson, Saldanha & McKoy, *J. Clin. Epidemiology* 64(12):1325–1330, 2011 / AHRQ methods report | `SECONDARY-SUMMARY` | The four reason classes and their action mapping (GL9). **Weakest basis among the load-bearing rules** — verify at the primary text before hardening |
| Brown et al., *BMJ*, 2006-10-14, EPICOT | `SECONDARY-SUMMARY` | Supports the structured-recommendation idea generally; no field name here is taken from it |
| 3ie / Campbell evidence-and-gap maps | `SECONDARY-SUMMARY` | Declare the axes before counting empty cells (GL11) |
| Donoho, *50 Years of Data Science*, *JCGS* 26(4), 2017, CTF section (term credited to Liberman) | `SECONDARY-SUMMARY` | The referee triple: input, competitor interface, sequestered scoring (GL14, GL15, GF7) |
| Health-research priority-setting reviews; endocrinology recommendation-uptake indication | `SECONDARY-SUMMARY` | Expiry as the modal outcome and the self-retirement threshold (GL16, GL17). **Weak and one-directional**; no contrary result was found, and the lane was single-pass |
| Chu & Evans, *PNAS* 118(41):e2021636118, 2021 | `SECONDARY-SUMMARY` | Background for why consolidation is the failure mode; no rule rests on it alone |
| Getzels & Csikszentmihalyi, *The Creative Vision*, 1976 | `SECONDARY-SUMMARY` | Background only — problem finding is a distinct capability. Small, single-domain, old; **no rule rests on it** |
| IEEE S&P SoK call for papers | `SECONDARY-SUMMARY` | The negative rule: the genre charter does not license a generative claim (GL1) |
| Romera-Paredes et al., *Nature*, Jan 2024, DOI 10.1038/s41586-023-06924-6, abstract | `ABSTRACT-ONLY` | The referee is the gate, not a conversation: "an evolutionary procedure based on pairing a pretrained LLM with a systematic evaluator" (GL14) |
| Zhang, Cui, Chen, Wang, Zhang, Wang, Wu & Hu, arXiv:2502.08788, abstract | `ABSTRACT-ONLY` | `AUTHORITY: NONE`'s second rationale — multi-agent debate "often fail[s] to outperform simple single-agent baselines" at higher inference cost, so agreement between workers is not evidence (GL13) |
| Si, Hashimoto & Yang, arXiv:2506.20803, abstract | `ABSTRACT-ONLY` | The forbidden ideation counters — executed LLM-generated ideas fell significantly on every metric, with rank flips, so ideation-stage counts mislead (GF8) |
| ~~`agents/research-control/IDEA-FACTORY-SOK.md` §M1, §M7, §M9~~ | **REMOVED 2026-08-06** | Cited as `HOUSE` at v2608.1.0 and no longer in the repository. GL13, GL14, and GF8 are re-anchored to the three primary rows above; GF6's Bell TM half is **withdrawn** — the archival verification was never re-done in this repo and may not be cited |
| `agents/skills/systematizing-knowledge/references/delivery.md` §5, §9 | `HOUSE` | The gap typology and the no-manufactured-priorities rule, inherited whole (GL10, GF5); the living-update route for world-conditions |
| `agents/skills/directing-research/references/creative-research-loop.md:119–121` | `HOUSE` | The prior this skill carries forward: no documentation form is established to cause discovery (GL18) |

## 3. Rule map — where each rule is argued

| Rules | Arguing home |
|---|---|
| GL1, GL18, GF1, GF3, GF6, GF7 | `GENERATIVE-SOK.md` §3 — evidence only; this skill states the consequence |
| GL8, GL9, GF4 | `references/opening-types.md` |
| GL7, GL14, GL15 | `references/test-and-referee.md` |
| GL2, GL3, GL4, GL5, GL11, GL12, GL13, GL16, GL17, GF8 | `references/circulation-and-accounting.md` |
| GL6 | `SKILL.md` LAW and procedure step 3 — it is the whole point of binding a cheap observation |
| GL10 | `systematizing-knowledge` `references/delivery.md` §5 — inherited by pointer, never restated |
| GF5 | `SKILL.md` deny-list — the RULE about openings is this skill's own; its BASIS ("Importance, tractability, and stakeholder value are judgments, not properties extracted from the literature alone") is inherited from that same §5 and never restated |
| GF2 | `SKILL.md` deny-list and LAW corollary 2 |

## 4. Staleness triggers — any one forces a reforge

| Trigger | Note |
|---|---|
| A `SECONDARY-SUMMARY` row verified at its primary text | Especially Robinson et al. and the uptake lane; both carry load-bearing rules on the weakest basis in the table |
| A documented case of systematically stated gaps being substantially taken up | Weakens GL16's prior and changes the layer's expected value |
| Two consecutive cycles at or below a corpus's retirement threshold | The layer retires itself there; record it and reforge the rule if the cause was the design |
| `systematizing-knowledge` changes its gap typology or its priorities rule | The inheritance in GL10/GF5 is by pointer; re-read the seam |
| A skill that owns delivery (consent, need-matching, offer, pull) is forged or restored | The declared residual in `circulation-and-accounting.md` §5 and the `SKILL.md` routing row collapse back into a real PURPOSE cut; restore it in the same commit |
| The `soks/` corpus adopts declared coverage axes | GL11's compliance finding (`GENERATIVE-SOK.md` §6) would be closed; update it rather than leaving a stale claim |
