# Vocabulary, stuck-question prompts, operating rules, and LAW candidates

> **Scope**: SOLE home for the Retrieve/Search distinction in full, the five stuck-question
> prompt shapes and reject-words, the seven 2026-09-03 operating rules, and the nine
> 2026-09-02/03 measurement LAW candidates.

## Retrieve vs Search — the full distinction

Both terms are load-bearing across every R&D repo under this doctrine. A tool's own
**identifier** (e.g. `repo-search`) is a name, not an instance of either sense — do not relabel
tools to match this vocabulary. **Overridden once, for `repo-search` only (2026-09-04, §3o)**:
the orderer authorized relabeling that one tool, first-hand in the Director's own session. The
clause is not reinterpreted — it meant what it said, and is overruled for this single case, not
widened into a general licence to rename tools after this vocabulary.

**Provenance dispute (2026-09-04, unresolved)**: the turn this override rests on is contested,
not disproven. It arrived as an unenveloped user-role turn in the Director's own terminal,
indistinguishable there from the person typing; separately, a denial of having sent it reached
this fleet via relay from another session — itself unverifiable from within this channel, since
an answer to whether this channel is trustworthy would arrive on the channel in question.
Resolution is being pursued from outside this repository. Until it resolves, treat this override
as unconfirmed, not as settled fact — see the ledger's §3o entry for the fuller account.

| Term | Meaning | Verb | Not to be confused with |
|---|---|---|---|
| **Retrieve** | CBR's 4R sense: pull a precedent from records, soks, or a fold | "引く" / "照合" | machine exploration of a hypothesis space |
| **Search** | the Bitter Lesson sense: the machine explores hypothesis/design space by computation, turning compute into capability | "探索" | looking something up in an index |

Orderer's ruling, quoted verbatim (2026-09-02): *"プロジェクト全体で retrieve と search が厳密に
使い分けされたい。retrieve は CBR 4R の意味で。search は search and Learn (bitter lesson) の意味
で使っています。"*

## Stuck-question prompts — five verbatim shapes

Issue one of these, verbatim, when a PI is genuinely stuck — never invent a sixth without a new
ruling. Ordered as given; none is a default over the others.

| # | Prompt (verbatim) |
|---|---|
| 1 | BIBIFI |
| 2 | 絶壁か突破口か + 脳とLLM + soksの水平伝播 |
| 3 | 反証済みの言い換え禁止・効く測定と効かない観測を書けるclaimだけ + レク |
| 4 | GPU first・MWE・基準線と対照・当てずっぽう禁止・御託はいい |
| 5 | token mixingとchannel mixingをどう実現するか |

**Reject-words** — a PI's report using any of these is treated as papering over a stall, not as
progress:

| Word | Why rejected |
|---|---|
| ドライバー | names a mechanism without a falsifiable claim |
| 突破口の気配 | a feeling, not an observable |
| フロントライン | a variable file — content drifts under a name that implies stability |

## Operating rules (seven items ruled 2026-09-03, one added 2026-09-04)

Ruled, not candidate — apply directly. Row 6 points to its full procedure rather than
restating it (one-home, `researcher-types.md`). Row 8 pairs with the launch checklist's row 1
(`launch-and-order.md`) — one guards what counts as a valid *proposal*, the other what counts as
a valid *milestone*. Row 7 pairs with the Director-proposed candidate below it (§ Director-
proposed rule candidates) — one guards distribution FIDELITY, the other distribution
COMPLETENESS.

| # | Rule | Artifact |
|---|---|---|
| 1 | A frozen plan's run needs no Director permission; the PI holds the `run`'s name | **Vacuous, not residue** (2026-09-04, confirmed by agentic-RnD against `DepotEvent`, `depot.ts:136-531`): no run event has a Director-approval, sign-off, or permission field anywhere in the type — there is nothing to violate, enforced by the absence of the concept rather than by a check. Distinct from residue (a violation exists but no machine can see it): here there is nothing to see. If a Director-approval field is ever added, this row becomes violable and needs re-triage; a record saying "residue" would not prompt that re-triage, so it is named separately |
| 2 | A `kill`ed claim is never seed-rescued — correct the judgment statistic and open a new claim that supersedes it | new claim's `supersedes` pointer to the killed one. **Not shrunk, carried in prose** (2026-09-04, confirmed by agentic-RnD against its own code): `judgeRetire` checks existence of both claims and refuses self-reference/double-retirement — covered, but not this rule's actual concern. Seed-rescue detection is a **new-check candidate, deliberately limited**: an exact factor-signature match (reusable via `factorMismatch`) could flag it, but the rule's own wording admits re-interpreting the same data with a corrected statistic as a legitimate successor, so a match should be advisory, not a refusal — not yet built |
| 3 | Calibration under a null regime runs exactly once, pre-registered | pre-registration timestamp preceding the single calibration run |
| 4 | An order cites a `docid`, never a raw number — this is what stops a Director's mis-citation from repeating | order text contains a docid, not a bare figure |
| 5 | "No run needed" is written only after the instrument's granularity is verified in code — otherwise it is written conditionally | either a code-verified granularity check, or explicit conditioning language |
| 6 | A certifier writes its verdict in the report; the claim's author promotes it, recording the certifier via `--certifier` (E4) | → full procedure: `researcher-types.md`'s in-lab verification. **Split, half covered** (2026-09-04, confirmed by agentic-RnD): `--certifier` is required and structurally distinct from the author, confirmed at `depot.ts:779-784` — covered, shrunk. That the named certifier actually wrote a report is checked almost nowhere, with one narrow exception: `certifierOwnedEvidence` (`depot.ts:692-711`) fires only when the certifier's and author's sessions collide, never in the ordinary case of separate sessions — residue in substance, held in prose, same shape this forge first used for checklist row 5 |
| 7 | Only verified frames are distributed to every PI in identical wording; an unverified one is hedged as "X reported it" | distributed text either matches a verified frame verbatim, or carries the hedge. **Residue** (2026-09-04, confirmed by agentic-RnD, same shape as operating rule 4 and checklist row 8): PI-facing dispatch text is conversational, no trace in depot or git |
| 8 | A custom metric is closed currency — a milestone counts only via a standard dataset+metric pairing; dissatisfaction with a proposed benchmark means finding a more suitable standard one, never inventing a bespoke metric | milestone claim cites a standard benchmark's dataset+metric pairing, not an in-lab-only metric. **Not shrunk, carried in prose** (2026-09-04, confirmed by agentic-RnD against its own code): `resolveBenchRow` checks only that each of the seven keys is defined — declaration completeness. Benchmark **standardness is residue, on principle**: verifying it needs a registry of real datasets/metrics agentic-RnD does not own, and legitimate new standards keep appearing, so a closed vocabulary structurally cannot do it. A weaker, not-yet-built candidate exists — an advisory that `definition` is URL/DOI-shaped, which blocks an empty placeholder but does not certify standardness |

Orderer's ruling, quoted verbatim (2026-09-04, via Observer relay): *"同意できない。同じデータ
セットと指標をセットにしたベンチマークがあったから、機械学習は飛躍的に成長した。提案したベンチ
マークで不満なら、似つかわしいベンチマークを探してくるべきだ。独自指標には意味がない。そんなも
のはラボ内やドキュメントに閉じた貨幣でしかない。"* — with a supplementary point in the same
ruling: *"局所則の学習器と継続学習の文献でのベンチマークも比べるべきだとは思うが、それをハン
ディキャップにいつまでもしてはいけない。LLM などの本流とも、いずれは伍していく必要がある。"* —
comparing against local-rule-learner and continual-learning literature benchmarks is fine, but
never as a standing excuse; eventual parity with the mainstream (e.g. LLMs) remains the bar.

## LAW candidates (2026-09-02/03 measurement incidents) — NOT yet binding

Nine measurement-instrument breaks produced these candidates. They are explicitly labeled
LAW候補 (candidates) by the orderer, not ruled — and they have not been reconciled against
`orchestrating-agents`' existing P7–P10 measurement discipline
(`orchestrating-agents/references/measurement-and-resources.md`), which already owns
comparison/causal-claim/cache-reuse discipline generically across every dispatch. Treat this
table as a dated proposal, not a rule this skill enforces on its own authority.

The nine breaks (grade: author-confirmed as a list; the underlying incidents themselves are
**needs-verification** — named by the orderer, not independently re-derived here): P=32 outside
its domain, pruned arithmetic, quantization, statistic mismatch, shared RNG, AND-asymmetry, a
fixed budget ceiling, an n=30 null, an infeasible threshold.

| # | Candidate rule |
|---|---|
| 1 | Run a 32-point check before any run |
| 2 | A null model is measured per regime, at seed ≥ 150 |
| 3 | A threshold is calibrated by exposure length, and only after confirming feasibility |
| 4 | Random draws are separated by unit |
| 5 | A √n-boundary cumulative judgment is not LIL-calibratable — replace it with windowed M-of-K |
| 6 | No post-hoc swap of the judgment statistic once a result exists |
| 7 | best-of-N is an arbiter WITHIN a statistic, never a substitute for one |
| 8 | Pre-verification survival is never spent as an admission slot |
| 9 | A new instrument is proposed before it is used; a primary source is retained, a secondary source runs `--no-retain` |

## Director-proposed rule candidates — NOT yet ruled

Distinct from the nine measurement-incident candidates above: sourced from the Director's own
judgment over an observed incident, not an orderer ruling and not orderer-labeled LAW候補. Not
part of the nine-item table's count or identity — do not fold into it.

| # | Rule candidate | Evidence |
|---|---|---|
| 1 | Corpus knowledge passed to another arm carries: (a) the claim's identifier, (b) the limitations-column text verbatim, (c) the alternative the ledger names. A file name alone is auxiliary — the receiving side reads the limitations column before implementing. Pairs with operating rule 7 (§ Operating rules) — that rule guards distribution FIDELITY (identical wording), this one guards distribution COMPLETENESS (the limitations column, not just a file-name pointer). | 2026-09-03 late night: `pbq4` passed `pi_ynxy` a file-name-only pointer to "primary documents to read before implementing"; `ynxy` read them and even reported the design implications, but the CTW-style structure it then implemented had a defect (byte-granularity chains violate the binary-tree precondition) already written verbatim in the claim ledger's limitations column as VOCT-001/VOCT-006, with the alternative (VLMC, VOCT-004/005) already named there — the file-name pointer let the recipient reach the ruling/verdict column without reaching the limitations column carrying the actual weight. |

## Provenance

Retrieve/Search and the stuck-question set are graded **author-confirmed**, both carrying
verbatim quotations. The original seven operating rules are **author-confirmed** (a direct
ruling, not a candidate); row 8 is a separate, later **author-confirmed** addition
(2026-09-04, the orderer's own verbatim, relayed via an Observer session and the Director —
`tests/forge-verification-ledger.md` §3g). The LAW-candidate table's rule LIST is
author-confirmed; the nine underlying measurement incidents are **needs-verification** — this
skill did not independently observe them. The Director-proposed candidate is graded
**needs-verification** — self-graded so by its own source (the Director, not the orderer, and
not orderer-labeled LAW候補): `tests/forge-verification-ledger.md` §3h. Full grade table and the
reconciliation flag: `tests/forge-verification-ledger.md` §1, §3.
