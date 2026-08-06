# Forge verification ledger — operationalizing-research-gaps

> Findings, waivers, and receipts for this skill's own forge. The source-grade table is NOT here: its
> SOLE home is `references/sources.md`, and the full corpus position it distils is
> `agents/research-control/GENERATIVE-SOK.md`.

## 1. Forge record

| Field | Value |
|---|---|
| Version | v2608.1.0 (2026-08-05) — first forge |
| Trigger | Operator asked what an ideal SoK would be if the whole artifact were oriented toward innovation emergence, using `~/Workspace/firedancer/soks` as the example, and to distil the answer into a skill |
| Source class | SURVEY/corpus. Per `forging-skills` `references/distilling.md` §1, the corpus was NOT distilled raw: a signed position (`GENERATIVE-SOK.md`) was written first and this skill distils that position |
| Existence gate | `repo-search battery` (4 paraphrases, JA+EN) over `/home/fuyu/dotfiles` returned the four nearest owners — `systematizing-knowledge` `delivery.md` §5 (gap typology), `transfer-sources.md` (`DONOR SET`), `governing-research-documentation` `review-contract.md`, `supervising-research-programmes` `pull-admission.md`. None owns the transition `signed position → typed, test-bound, addressed, expiring row → retirement accounting`. Void confirmed |
| Scale | SOLO end-to-end, zero agents — see the F3 waiver in §4 |

## 2. Calibration inversion (`distilling.md` §4)

| | Source's audience | This skill's agent consumer |
|---|---|---|
| Dominant error | Human reviewers state gaps vaguely ("more research is needed"), never structure them, and never check whether they were taken up | **INVERSE.** A capable model happily emits a long, confident, well-formatted list of "next steps" on demand. Its failure is over-production of untested openings, silent upgrading of a gap into a claim, and helpful ranking nobody asked for |
| Corrective bias | Be specific; use a structured format (PICO/EPICOT); name the reason the gap exists | Cap the output, anchor every row, refuse any row with no retiring observation, forbid ranking outright, and count only retirements |
| Prominence decision | The format is the contribution | The **deny-list, the tail cap, and "measured by retirements only" are first-class** — they sit in the LAW and the gates, not in an appendix. The format is demoted to an asset |

Consequence, recorded because it drove a design choice: the mechanical floor checks *presence of
constraint*, not richness of content. A sheet passes by having a cap, an anchor, a retiring
observation, and an expiry — never by being long.

## 3. Self-verification findings (solo lenses, 2026-08-05)

| Lens | Finding | Resolution |
|---|---|---|
| Self-contradiction | The LAW forbids creating claims, but an early draft let a `RETIRED-BY-EVIDENCE` retirement update the position directly | Added the one-way gate: a retirement hands its observation to `systematizing-knowledge`, which re-runs its own gates. `test-and-referee.md` §6 |
| Self-contradiction | GL12 ("publish at one sentence") appeared to contradict O3 ("no row without a retiring observation") | Resolved by making the threshold explicitly *one sentence **plus** a retiring observation* in both homes; the permission is about polish, not about the test |
| Architecture | The gap typology risked a second arguing home | Demoted to a pointer in `opening-types.md`'s header; the four reason classes are the only added axis, and they are declared as an addition, not a replacement |
| Architecture | `AUTHORITY: NONE` was defined in a sibling skill | Declared a deliberate seam at forge time; **invalidated 2026-08-06** when that sibling left the repository. The token now carries its two rationales from `GENERATIVE-SOK.md` §G7/§G8 directly — see §8 |
| Sibling cuts | `supervising-research-programmes` owns "formulate research problems", which reads close to writing an opening | Cut is CARDINALITY + authority: N unselected rows carrying no allocation here; selection, ranking, `OPEN_ISSUE`, and allocation there. Encoded as trigger rows N3 and C4, and C4 is deliberately a co-fire so a single-skill answer is visibly a bug |
| Sibling cuts | `acting-on-hypotheses` owns "cheapest discriminating test" | Cut is PURPOSE: it *runs* the test on one selected costly tree; this skill *writes* the observation for unselected rows and never performs it. Deny-list line 7 and trigger N5 |
| Bloat | An early draft restated the seven gap kinds "for convenience" | Cut. `architecture.md` §2's restated-for-completeness trap |
| Evidence | Two load-bearing rules (GL9 reason classes, GL16/GL17 uptake) rest on `SECONDARY-SUMMARY` rows | Not resolved — labelled as such in `references/sources.md` §2 and listed as the first staleness trigger. They are the rules most likely to be wrong |

## 4. Waivers

| Waiver | Scope | Rationale | Expires |
|---|---|---|---|
| **F3 fleet waiver** | The adversarial verification fleet (`forging-skills` `references/verifying.md` §2) was run as solo focused passes, not as parallel read-only agents | The session's operating instruction forbids spawning subagents unless the user requests them. The lens LIST was not shortened — self-contradiction, architecture, sibling cuts, bloat, and the trigger desk-check all ran; only the parallelism was dropped, which `verifying.md` §7 permits ("no harness → the same passes run serially") | On the next reforge, or on the first observed in-session failure this skill should have prevented |
| **Comparative-judge waiver** | No old-vs-new comparison was run | There is no incumbent: the existence gate found no owner for this transition. A comparative judge needs two arms | When any sibling claims this transition |

## 5. Receipts

| Check | Result |
|---|---|
| `bun scripts/openings-check.ts assets/OPENINGS-SHEET.md` | GREEN, exit 0 |
| Floor script red test #1 — missing `AUTHORITY: NONE`, `PRIORITY:` field, non-ISO expiry, `RELATION:` on a `NON-ADJACENCY` row, bad `REASON`, `REFEREE` with no `threshold=`, unknown row type | RED, exit 1, 7 distinct findings — each check proven to fire before being trusted |
| Floor script red test #2 — 2 `NON-ADJACENCY` rows against 1 `GAP` row | RED, exit 1, tail cap fired |
| Template re-run after both red tests | GREEN, exit 0 (no residue) |
| `bun ../forging-skills/scripts/skill-check.ts .` | see §6 |
| F3 trigger desk-check | `tests/triggers.md` — 7 fire, 11 near-miss no-fire, 5 co-fire, 2 contested rows recorded with their resolutions |

## 6. skill-check and prose debt

Recorded at forge exit; "touch it, clear it" applies to every later edit of `SKILL.md`
(`forging-skills` `references/architecture.md` §5).

| Run | Result |
|---|---|
| `bun ../forging-skills/scripts/skill-check.ts .` | silent, exit 0 — no structural FAIL, no WARN |
| Prose-debt WARNs | **0** at forge exit. First pass reported 17 long prose sentences, then 11; both rounds were fixed by splitting, not by waiver |
| Strict YAML parse of the frontmatter (`uv run --with pyyaml`) | parses; keys `[description, name]`; `name` matches the directory; lowercase/hyphen-legal; ≤64 chars |
| `description:` length | 1444 chars — under the 1500 house ceiling; block scalar `>-` |
| Reciprocal pointer landed in `systematizing-knowledge` | routing row + one description clause; that skill re-checked at prose-debt 0, exit 0. Its `references/delivery.md` §5 stays the SOLE gap-typology home |

## 7. Staleness

Owned by `references/sources.md` §4. Do not duplicate the trigger list here.

## 8. Post-forge adversarial audit — 2026-08-06

Ten agents, five independent lenses each with a hostile refuter, read-only. Run by the operator after
challenging whether a new skill was warranted at all.

**Verdicts after refutation**: 2 `NEW-SKILL-JUSTIFIED` (description-race, fold-in-counterfactual),
3 `UNDECIDED` (ownership-void, mece-partition, duplication-line-level). **Zero** lenses returned
`FOLD-INTO-SYSTEMATIZING-KNOWLEDGE` or `OWNED-BY-A-DIFFERENT-EXISTING-SKILL`.

**The MECE question was answered.** No lens found a double-owned artifact or transition. Every lens
that examined the boundary independently confirmed the claimed transition is unowned elsewhere:
`systematizing-knowledge`'s gap table carries no `RETIRED-BY`/addressee/`EXPIRES`/referee field and its
`SKILL.md` reciprocally hands the bill of work over; `supervising-research-programmes` requires
selection and allocation lineage; `acting-on-hypotheses` requires one selected tree;
`forging-novel-theses` requires a selected frame. The refuters recorded that the uptake-rate and
self-retirement mechanism "has zero analogue anywhere in the collection".

**Every `UNDECIDED` had the same cause, and it was not a sibling.** Two dependencies cited at forge
time did not exist in the repository when the audit ran:

| Broken dependency | Where it was load-bearing | Disposition |
|---|---|---|
| `agents/research-control/IDEA-FACTORY-SOK.md` | `references/sources.md` graded it `HOUSE` for GL13, GL14, GF6, GF8 — while `HOUSE` is defined in that same file as *read in place* | GL13/GL14/GF8 re-anchored to three primary sources read 2026-08-06 (FunSearch, Nature 2024; Zhang et al. arXiv:2502.08788; Si, Hashimoto & Yang arXiv:2506.20803). GF6's Bell TM half **withdrawn** |
| `agents/skills/brokering-research-encounters/` | the PURPOSE cut in the description, MUST-NOT-FIRE row, `circulation-and-accounting.md` §§1/5/7, `triggers.md` N6/C2, and `sources.md` §4 | converted to a **DECLARED RESIDUAL**: delivery has no owner today, this skill stops at addressing, and a staleness trigger restores the cut in one commit when an owner exists |

Both files were present at session start and were removed from the working tree while this skill was
being forged. The defect is mine regardless of who removed them: a pointer was written and never
re-verified at ship time, which is exactly what the atomic build order exists to prevent. The
build-order verify line checks this skill's own files and did not — and cannot — check cross-skill or
cross-directory citations. **That is the gap this incident exposes**, and it is why §5's receipts now
include a repo-wide dangling-reference sweep.

**Other surviving findings, all repaired 2026-08-06**: `sources.md`'s rule map mis-assigned GF5's
arguing home (the rule is this skill's own; only its basis is inherited); `test-and-referee.md` §3
paraphrased the inherited prohibition with a word ("interest") absent from the source, now matched to
`delivery.md` §5's actual wording ("stakeholder value"); no explicit cut existed against
`auditing-research-processes` for the cycle-close ask, now a MUST-NOT-FIRE row; `directing-research`'s
specialist-routes table omitted this skill, now added.

**Not repaired, recorded instead**: the seams with `governing-research-documentation` and
`supervising-research-programmes` are one-directional — only `systematizing-knowledge` and
`directing-research` carry reciprocal pointers. Adding rows to two more siblings was judged
out-of-scope for this pass; it is queued as the next reforge's first item.

**Unclosed**: the fold-in counterfactual survived its own refutation in favour of a separate skill,
but its K5-`DONOR SET`-precedent argument is real and was not defeated — `systematizing-knowledge`
already hosts one conditional branch with its own stop condition, output shape, reference file, and
floor script. The honest state is that a separate skill is *defensible*, not *proven necessary*. The
falsifiable condition stands: if this skill never wins an ask without `systematizing-knowledge`
co-firing, it is a branch and should be folded into a K6 gate.
