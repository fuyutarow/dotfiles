---
name: raising-resolution
description: >-
  Inspects ONE factual present-state row of an existing code/data/API/source/problem artifact before a
  claim. Use when the agent would guess. CITATION GATE: zero cited line/output/measurement/primary source
  for THIS blocking claim→take the cheapest rung; one citation→stop and hand off the observation;
  otherwise remain a silent baseline. Standalone 解像度 fires only for factual present-state inspection
  of an existing artifact. Cuts: research-problem/課題 解像度・具体化・定式化 → supervising-research-programmes;
  here supplies only a silent cited factual row. Agent topology→orchestrating-agents. One paper:
  fact/extract→here; neutral summary→direct; argument/method/validity→arguing-research-papers.
  Corpus→systematizing-knowledge; costly future bet→acting-on-hypotheses; cheap reversible
  probe→domain/plain executor; thesis genesis→forging-novel-theses; premise/tacit
  exposure→surfacing-blind-spots. Agent relay without a locus is not a citation. English; answer in user
  language.
---

# Raising resolution — inspect THIS thing before you assert, don't guess harder

> **What this is.** This operational procedure distills 馬田隆明『解像度を上げる』
> (英治出版, 2022) and the 2021 SpeakerDeck『解像度を上げる🔬』.
> It raises the resolution of ONE factual present-state row through primary information, then stops.
>
> **Scope.** Sharpen YOUR OWN grasp of THIS existing code, data, API, library, source, or problem artifact.
> Apply it before a factual claim, plan, or fix. It is content-agnostic and LOWEST-precedence.
>
> **Out of scope.** Domain artifacts stay with their owners in §4.
> Future forecasting is excluded. Costly future bets go to `acting-on-hypotheses`.
> Cheap deterministic reversible probes use the domain/plain executor.
> Research problem-frame construction, formulation, selection, why-now, and steering go to `supervising-research-programmes`.
> Missing thesis candidates go to `forging-novel-theses`.
> Hidden premises and tacit constraints go to `surfacing-blind-spots`.
> This skill receives only fixed rows that need factual inspection.
> A neutral one-paper summary is a direct answer with this gate applied silently.
> Paper argument, method, or validity appraisal goes to `arguing-research-papers`.

**Build order is atomic.** Ship `SKILL.md`, one reference, and its ledger together.
Run these checks from the skill directory:

```bash
test -f references/reference.md || echo MISSING reference.md
test -f references/action-loop.md && echo STALE-FILE || echo OK
test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

The first and third commands print nothing. The second prints `OK`.
There is no `action-loop.md`. Every HOW-layer pointer resolves to `references/reference.md §D`.

## §0. The load-bearing rule — the CITATION GATE (precedence over everything below)

> **Before a factual assertion or a dependent plan, run the citation check.
> Can you point to a specific line read, command output, measurement, or fetched primary source?
> The evidence must ground THIS exact claim.
> If NO, you are SPECULATING INSTEAD OF inspecting. STOP and take the cheapest action-ladder rung.
> Re-check after it turns the unknown into an observation.
> If YES, assert the grounded claim and act.**

- **The detector is BINARY.** It keys on citable evidence, not a feeling of certainty.
  Fluent wrong and fluent right answers can feel alike. The gate therefore applies even without felt doubt.
  It targets speculation about code, data, or sources instead of inspection.
- **ACTION LADDER.** Use the cheapest rung first. Rationale and the worked 起業家 ladder are in
  `references/reference.md §D`:
  `grep/glob → read the file/source → run / probe / log / measure → reproduce n=1 → web-fetch → ASK`.
  Allowed evidence is ONLY one of these.
- **NEGATIVE-EVIDENCE LIST.** Experience, usually, typically, probably, should, たぶん, おそらく, はず,
  and 一般的に never count as a rung. Neither does an agent conclusion without verbatim output and locus.
  A relayed “probably” remains ungrounded. N agents agreeing is still ZERO citations.
  See `references/reference.md §C.8`.
- **STOP CONDITION.** This operationalizes 『十分』: sufficient, not maximal.
  Fire at **ZERO** citations on a blocking claim. **STOP at ONE** citation for that claim.
  The rule is per-claim and countable, never a global sufficiency judgment.
  A structural or temporal claim with N elements contains N blocking claims.
  Each element needs one citation. One grep never grounds a whole tree.
  Rationale owned by `references/reference.md §C.1`.
- **The loop** is 解像度 = 情報(収集) × 思考 × 行動.
  It is a product, so zero in any factor makes the result zero. 思考 is co-equal; this is not “never think.”
  Ground truth is often the scarce factor for an agent, so bias toward inspection.
  Fidelity is in `references/reference.md §C.3`. The action mechanism is in §D.

## §1. The diagnostic table — 4 LENSES applied ASYMMETRICALLY across {課題, 解決策}

Rotate through the four lenses. They are not a MECE partition or a symmetric 4×2 grid.
Depth is weighted toward the problem side; see `references/reference.md §B.3`.
Use the table to find where the current understanding is thin, problem first.
Every HIGH cell requires a citable artifact. A HIGH with no observation is decorative and must be cut.
For 構造 or 時間, decompose the claim by element. Each element needs its own citation: N-for-N.
This table solely owns the LOW/HIGH tells. `references/reference.md §A` deepens unit and boundary rules.

| Lens | LOW tell (no citation) | HIGH tell (cited) |
|---|---|---|
| **深さ** depth — ONE phenomenon drilled DOWNWARD (vertical) | abstract subject + vague verb ("users struggle", "auth is broken"); deck tell: 5W1Hが言えない | symptom AND the **root-cause line/identifier named** — 固有名詞・数字・メカニズム |
| **広さ** breadth — the SET of SIBLING candidates listed SIDEWAYS (horizontal) | first explanation taken as the only one; deck tell: 競合はいません / 全部勝っている (over-confidence = breadth-blind) | **≥2 candidates, EACH ruled in/out by a cited check**; you can name what you eliminated |
| **構造** structure — RELATIONSHIPS among already-surfaced elements (adds NO new elements) | long/tangled flat list, no priority; deck tell: 説明が長い・冗長 (verbosity = structure missing) | elements grouped MECE + the **leverage-bottleneck named**, each grouped element CITED (N-for-N) |
| **時間** time — how elements CHANGE / FLOW (dynamics) | no sequence / path | ordered process + dynamic causality + a **concrete next-step path**, each step grounded |

**Overall deck test:** can you state the hypothesis **明確 かつ 簡潔 かつ ユニーク**? If not, the table tells you which lens is thin.

**Disambiguation.** The owner is `references/reference.md §A.5`.

- **Bottleneck split.** ROOT-CAUSE of one phenomenon is 深さ.
  HIGHEST-LEVERAGE among surfaced candidates is 構造.
- **Causality split.** Snapshot root cause is 深さ. Atemporal relative weight is 構造.
  Time-indexed sequence or feedback is 時間. State the intended sense before saying “cause.”
- **解決策×深さ is INTENTIONALLY THIN** — owner `references/reference.md §B.3`.

## §2. The trigger-time GATE (run when about to assert or commit)

```
About to assert a fact about THIS code/data/API/source, or commit a plan that depends on one?
 └─ Owner filter: does a domain owner apply (§4)? YES → this skill is a silent sub-step, do not fire.
       NO ↓
 └─ Are you about to SPECULATE INSTEAD OF inspect, with nothing grounding the claim,
     and is it BLOCKING a concrete next action (inspecting non-trivial)?
       NO  → not this skill (ordinary edit/debug where inspecting is already obvious).
       YES → can you cite an observation (line Read / command run / source fetched) grounding THIS claim?
                NO  → take the cheapest action-ladder rung; re-check.
                YES → assert and act.
```

When the gate fires, raise resolution through ACTION.
The 内化⇄外化 cycle, kata-to-tool engine, action ladder, and 起業家 example live in `references/reference.md §D`.
Apply the following interlocks only as needed. Do not score all four lenses as a mandatory pre-pass.
That would be the box-ticking this skill forbids.

- **PROBLEM BEFORE SOLUTION.** Raise 課題 resolution before 解決策.
  Lead depth-first on 課題, then 広さ→構造→時間 on 解決策. See `references/reference.md §B.2`.
  Never code, refactor, or select a library before inspecting the problem.
- **バーニングニーズ GATE.** Ask whether anyone pays time, money, or effort for the problem.
  Also ask whether leaving it unsolved blocks the goal. If neither holds, it may be the wrong problem.
  See `references/reference.md §B.5`.
- **PER-NODE 広さ INTERLOCK.** Before each Why-so descent, ask which sibling causes are being skipped.
  State why this branch is chosen. Rules are in §A.6; execution is in §D.
- **ROOT-STATE rule.** At an empty tree, run 広さ first.
  From one cheap observation, enumerate at least two causes before choosing a drill direction. See §D.
- **STOP & ACT** — once the blocking claim has its one citation, stop raising and act. Acting yields new primary info → re-enter at the gate.
- **HARNESS NOTE.** Independent 広さ checks and N-for-N citations may run as parallel rung executions.
  Evidence crosses an agent boundary only as verbatim output plus locus.
  Never shard the Why-so descent, 構造 grouping, or stop-at-one decision. See §C.8.

## §3. Worked before/after exemplar

**BEFORE→AFTER.** Keep the effort budget equal. Every factual clause in AFTER cites an observation.

- **BEFORE (speculating).** User: *“The API is slow.”*
  Agent: *“It is probably an N+1 or a missing index; I will add caching and pagination.”*
  This is 既視感: the problem is uninspected, yet the agent jumps to 解決策.
- **AFTER (acted)** — Agent times the endpoint, reads the handler, greps the ORM call →
  *"Measured 1.8s; trace shows 1.74s in a loop issuing one SELECT per row (N+1) at `users/repo.ts:88`
  over ~400 rows — 深さ: symptom=slow, 病因=this line. Ruled out: index present, network <5ms (広さ).
  Bottleneck = the loop (構造). Path: batch to one IN-query, re-measure (時間 → 十分 → act)."*
- **解決策-side, same verified N+1 病因.** Candidates are batch IN-query, dataloader, and denormalization.
  This is 広さ. The IN-query is the lowest-risk, highest-leverage option; this is 構造.
  Ship behind a flag, re-measure, then delete the loop; this is 時間.
  The fix targets the verified 病因, not a guessed one.

## §4. MUST-NOT-FIRE / over-application defense + routing

**OVER-application is the dominant error for a capable model.**
The book's human audience instead needs correction for under-deepening.
Treat this list as first-class. `references/reference.md §C` owns the rationale; do not duplicate it here.

1. **Blocking claim already has ONE citation** → assert and move; re-diagnosing is analysis-paralysis (§C.1).
2. **Ordinary edit/debug with obvious inspection next** → does NOT fire. Reading before asserting is baseline.
   Fire only when the agent would speculate instead of inspect.
3. **A domain OWNER applies** → remain a silent cited-observation sub-step. Run the owner filter first.
4. **Trivial / already-grounded task** → do NOT run the table; the 4 lenses are a DIAGNOSTIC, never a 4-checkbox ritual. (テンプレート checks 広さ・構造 but NOT 深さ — the author's own anti-box-ticking warning.)
5. **Deepen the WRONG problem or branch** → use the バーニングニーズ gate, per-node 広さ, and root-state rule.
6. **行動なき情報収集, 既視感 repackaging, or a book summary** → dead forms.
   The contribution is the four-lens vocabulary plus citation gate. Every retained line must change a tool call.

### Routing / owner-filter table (SUBTRACTIVE — sole owner of routing)

This skill has **LOWEST precedence**. Apply the owner filter before trigger keywords.
It yields whenever another owner applies. Auto-activation is description-matched, so verify invocation.
It fires alone only for the agent's ungrounded grasp of one factual present-state row.
The bare token “survey” is not a trigger here; it belongs to SoK.

| If the task is… | Route to | Cut |
|---|---|---|
| verify or extract one bounded factual claim from one paper/source | **HERE, only if the trigger-time gate fires** | OUTPUT: citable observation, then stop |
| neutrally summarize one paper | **direct answer** | PURPOSE: apply this citation gate silently; no specialist skill owns a neutral single-paper summary |
| critically appraise one paper's argument, method, or validity | **arguing-research-papers** | PURPOSE: reviewer red-team there; factual extraction here only as its silent evidence step |
| synthesize a CORPUS of papers/sources into a position | **systematizing-knowledge / sok** | CARDINALITY: one bounded observation → here; corpus position → there |
| construct, formulate, or select a research problem frame; judge why-now or steer a programme | **supervising-research-programmes** | PURPOSE: research meaning and selection there; HERE may supply only a silent cited observation |
| overlay agents, visibility, dependencies, vetoes, verification, or acceptance | **orchestrating-agents** | PURPOSE: control-plane topology there; HERE supplies cited present-state rows only |
| implicit premises, ignored exceptions, or human tacit constraints in an existing plan/frame | **surfacing-blind-spots** | PURPOSE: EXPOSE into a Blind-spot packet there; inspect a fixed factual row HERE only after it is surfaced |
| OSS-adoption diagnosis | **growing-oss-adoption** | owner |
| `.claude` / CLAUDE.md / hooks config or harness mechanics | **operating-the-harness** | owner (closes the meta-loop) |
| skill creation / SKILL.md authoring/auditing (craft) | **forging-skills** | owner |
| Julia / Lean execution | **writing-julia / proving-theorems** | owner |
| an expensive/irreversible future bet or one with costly downstream exposure | **acting-on-hypotheses** | DECISIVE hard gate (see below) |
| a deterministic, bounded, reversible probe with no expensive downstream exposure | domain/plain executor | run it and return `EXECUTOR RESULT` to the domain owner |

**See also: `acting-on-hypotheses`, the forward-bet sibling.**
The sole owner of this purpose/object boundary is `references/reference.md §C.7`.

raising-resolution means **現状理解の明晰さ**.
Acquire primary information about a present, knowable-but-blurry reality.

acting-on-hypotheses means **高価/不可逆な不確実な未来への前進**.
Map and precommit when costly downstream exposure rides on a future result.
A cheap deterministic reversible residual goes to the domain/plain executor.

**DECISIVE CUT.** Could primary information about what already exists settle the question?
If yes, it is a present-understanding gap. Inspect here.
If no, apply the downstream-exposure gate in §C.7.

**SEQUENCING.** A task can contain both gaps, such as “should we adopt this library?”
Inspect present capabilities first. Then hand only the residual future bet onward.

**HANDOFF TRIGGER.** Every blocking present-state claim has a citation.
What remains can only be learned by a forward test. Apply `acting-on-hypotheses` STEP 0 for costly exposure.
Otherwise the domain/plain executor runs the residual.
Pattern: **Diagnose and ground HERE → gate, then execute THERE.**

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/reference.md §A` | lens units and boundaries; bottleneck, causality, MECE, flow, relations, systems, per-node 広さ | deepen a lens beyond the §1 table |
| `references/reference.md §B` | 課題 versus 解決策; order, depth asymmetry, good-problem conditions, バーニングニーズ | inspect problem-selection interlocks |
| `references/reference.md §C` | limits, source grades, failure modes, stop-at-十分, forward-bet cut, agent evidence relay | justify a guardrail or boundary |
| `references/reference.md §D` | action ladder, 内化⇄外化 kata, Why-so protocol, root-state, n=1, worked 起業家 ladder | acquire primary information |
| `tests/forge-verification-ledger.md` | reforge evidence, warning counts, and debt queue | auditing this skill itself |
