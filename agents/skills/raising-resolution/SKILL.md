---
name: raising-resolution
description: >-
  Raise the RESOLUTION (解像度) of THIS code/data/API/source/problem BEFORE you assert or act — INSPECT, don't guess — from 馬田隆明『解像度を上げる』. CITATION GATE: before a factual claim, ask — can you cite a line Read, a command run, or a source fetched for THIS claim? NO → stop and inspect; YES → assert and act. LOWEST precedence; yields to any owner: multi-paper/corpus synthesis → systematizing-knowledge/sok; OSS adoption → growing-oss-adoption; .claude/CLAUDE.md/hooks/SKILL.md authoring/auditing → operating-the-harness; Julia/Lean → writing-julia/proving-theorems; a future-bet (MVP/prototype/spike/賭け/kill-condition/will-it-scale) → acting-on-hypotheses. Owner applies → does NOT fire (silent sub-step); else FIRES only when about to SPECULATE INSTEAD OF inspect a fact about THIS artifact that nothing grounds yet, BLOCKING a next action, inspecting non-trivial — not a "read before asserting" baseline. DECISIVE CUT vs acting-on-hypotheses: a smart person could know it from what ALREADY EXISTS → here; needs a forward TEST reality hasn't decided → there. CARDINALITY CUT vs systematizing-knowledge: single artifact → here; a CORPUS of papers/sources → there. Trigger: probably/likely/usually/typically/I think/should be/in my experience/たぶん/おそらく/一般的に/はず; 推測するな/ちゃんと調べて/inspect/guessing/speculating/一次情報/primary information/解像度/resolution/解像度を上げる; 深さ・広さ・構造・時間, 症状 vs 病因, なぜなぜ/Why so, 課題 vs 解決策. Agent relay is NOT a citation — harness note in §C.8. English skill; reply in user's language, Japanese default.
---

# Raising resolution — inspect THIS thing before you assert, don't guess harder

> **What this is**: an operational procedure that turns 馬田隆明『解像度を上げる』(英治出版, 2022;
> built on the 2021 SpeakerDeck『解像度を上げる🔬』) into a single agent-checkable discipline —
> raise the 解像度 of your grasp of ONE problem/solution by acquiring primary information, then act.
> **Scope**: sharpening YOUR OWN understanding of THIS code / data / API / library / source / problem
> before you commit a claim, plan, or fix. Content-agnostic, upstream, LOWEST-precedence.
> **Out of scope**: producing domain artifacts (defer to the owners in §4); the book's 第8章
> 未来の解像度 (future-forecasting) is deliberately EXCLUDED — it belongs to acting-on-hypotheses (bet
> timing) / forging-novel-theses (a thesis's why-now / future-state extrapolation, e.g. SF プロトタイピング).
>
> **Build order (ATOMIC — ship in ONE commit).** This skill is `SKILL.md` + one reference. Self-check
> (run from the skill dir): `test -f references/reference.md || echo MISSING reference.md` (must print
> nothing) AND `test -f references/action-loop.md && echo STALE-FILE || echo OK` (must print `OK` — there
> is deliberately NO `action-loop.md`; the acquisition mechanism lives in `references/reference.md §D`).
> Every pointer below that touches the HOW-layer resolves to `references/reference.md §D`; do not reintroduce a
> separate action-loop file.

## §0. The load-bearing rule — the CITATION GATE (precedence over everything below)

> **Before you assert any fact about THIS code / data / API / library / system / source — or give any
> plan that depends on such a fact — run the citation check: can you point to a specific line you Read,
> a command you ran (with its output), or a source you fetched that grounds THIS exact claim?
> If NO → you are SPECULATING INSTEAD OF inspecting: STOP, do NOT think harder, take the cheapest
> action-ladder rung that turns the unknown into an observed fact, then re-check. If YES → it is
> grounded; assert and act.**

- **The detector is BINARY** and survives an over-confident model: it keys on *citable evidence*, not on
  a *feeling* of certainty — a fluent wrong answer feels exactly like a fluent right one, so the gate
  can force you through even when you do not feel unsure. This targets an agent's #1 failure: speculating
  about code/data/sources (*"it's probably an N+1"*) instead of inspecting them.
- **ACTION LADDER** (bare enumeration; rationale in `references/reference.md §D` — cheapest-first, why
  each rung, the worked 起業家 ladder):
  `grep/glob → read the file/source → run / probe / log / measure → reproduce n=1 → web-fetch → ASK`.
  Allowed evidence is ONLY one of these.
- **NEGATIVE-EVIDENCE LIST** (never counts as a rung): *"in my experience" / "usually" / "this kind of
  library typically" / "probably" / "should be"* / たぶん・おそらく・はず・一般的に; a (sub)agent's conclusion
  WITHOUT its verbatim observable (output + locus) — a relayed "probably"; N agents agreeing is still
  ZERO citations (`references/reference.md §C.8`). A claim resting on any of these is un-grounded —
  the gate fires.
- **STOP CONDITION** — operationalizes 『十分』(SUFFICIENT, not maximal): fire at **ZERO** citations on a
  blocking claim, **STOP at ONE**. Per-claim and countable, never a global "am I sufficient overall?"
  judgment. A multi-element structural/temporal claim is **N blocking claims** (one per grouped element),
  so it needs **N citations** — "stop at one" means one-per-claim, **not** one grep for a whole tree.
  Rationale owned by `references/reference.md §C.1`.
- **The loop** = 解像度 = 情報(収集) × 思考 × 行動 (a PRODUCT — if any factor is zero the product is zero,
  so 思考 is co-equal, NOT worthless; this is NOT "never think"). For a coding/research agent the scarce
  factor is ground truth, so bias the loop toward inspection. Fidelity owned by `references/reference.md §C.3`;
  the mechanism (内化⇄外化 → agent actions) owned by `references/reference.md §D`.

## §1. The diagnostic table — 4 LENSES applied ASYMMETRICALLY across {課題, 解決策}

The 4 are **lenses you ROTATE THROUGH**, NOT a MECE partition and NOT a symmetric 4×2 grid — depth weights
to the problem side (`references/reference.md §B.3`). Use this table to find **WHERE your thinking is thin**, problem
first. Every HIGH cell **requires a citable artifact** (a lens whose HIGH needs no observation is decorative
and is cut); a 構造/時間 HIGH claim decomposes into per-element sub-claims, **each needing its own citation
(N-for-N)**. This table is the SOLE home of the LOW/HIGH tells; `references/reference.md §A` deepens the Unit/boundary only.

| Lens | LOW tell (no citation) | HIGH tell (cited) |
|---|---|---|
| **深さ** depth — ONE phenomenon drilled DOWNWARD (vertical) | abstract subject + vague verb ("users struggle", "auth is broken"); deck tell: 5W1Hが言えない | symptom AND the **root-cause line/identifier named** — 固有名詞・数字・メカニズム |
| **広さ** breadth — the SET of SIBLING candidates listed SIDEWAYS (horizontal) | first explanation taken as the only one; deck tell: 競合はいません / 全部勝っている (over-confidence = breadth-blind) | **≥2 candidates, EACH ruled in/out by a cited check**; you can name what you eliminated |
| **構造** structure — RELATIONSHIPS among already-surfaced elements (adds NO new elements) | long/tangled flat list, no priority; deck tell: 説明が長い・冗長 (verbosity = structure missing) | elements grouped MECE + the **leverage-bottleneck named**, each grouped element CITED (N-for-N) |
| **時間** time — how elements CHANGE / FLOW (dynamics) | no sequence / path | ordered process + dynamic causality + a **concrete next-step path**, each step grounded |

**Overall deck test:** can you state the hypothesis **明確 かつ 簡潔 かつ ユニーク**? If not, the table tells you which lens is thin.

**Disambiguation (ONE-LINE pointers only — owner is `references/reference.md §A.5`):**
- **Bottleneck split** — ROOT-CAUSE of one phenomenon = **深さ**; HIGHEST-LEVERAGE among already-surfaced candidates = **構造**. (`references/reference.md §A.5`.)
- **Causality split** — "cause" has 3 senses (snapshot root cause = 深さ / atemporal relative-weight map = 構造 / time-indexed sequence-or-feedback = 時間); **state WHICH sense you mean before saying "cause."** (`references/reference.md §A.5`.)
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

When the gate fires, raise resolution via ACTION (the 内化⇄外化 cycle; the kata→tool engine, action ladder,
and worked 起業家 ladder live in `references/reference.md §D`). Interlocks, applied **as-needed** — **NOT** a
mandatory pre-pass that scores all four lenses (that pre-pass IS the box-ticking the skill forbids). Each is a
one-line imperative POINTING to its owner; never re-explained here:

- **PROBLEM BEFORE SOLUTION** — raise 課題 resolution before 解決策; lead 深さ-first on 課題, 広さ→構造→時間 on 解決策 (`references/reference.md §B.2`). Cardinal anti-pattern: 課題の解像度が低いまま解決策に飛びつく — coding / refactoring / library-picking before inspecting the problem.
- **バーニングニーズ GATE before deepening** — is anyone actually paying time/money/effort, or does leaving it unsolved block the goal? If not, you may be deepening the WRONG problem (`references/reference.md §B.5`).
- **PER-NODE 広さ INTERLOCK** — at EVERY Why-so node, before descending: "what sibling causes am I skipping, and why this branch?" (`references/reference.md §A.6`; EXECUTION in `references/reference.md §D`).
- **ROOT-STATE rule** — at the empty tree, 広さ runs FIRST: enumerate ≥2 candidate causes from one cheap observation BEFORE committing a drill direction (`references/reference.md §D`).
- **STOP & ACT** — once the blocking claim has its one citation, stop raising and act. Acting yields new primary info → re-enter at the gate.
- **HARNESS NOTE** — independent 広さ candidate checks and N-for-N element citations may run as parallel
  rung-executions; evidence crosses an agent boundary only as verbatim output + locus; the Why-so descent,
  the 構造 grouping, and the stop-at-one call never shard (rationale + map: `references/reference.md §C.8`).

## §3. Worked before/after exemplar

**BEFORE→AFTER (same effort budget; every clause in AFTER cites an observation):**
- **BEFORE (speculating)** — User: *"the API is slow."* Agent: *"It's probably an N+1 or a missing index;
  let me add caching and pagination."* (既視感; problem un-inspected; jumped to 解決策 on a guess.)
- **AFTER (acted)** — Agent times the endpoint, reads the handler, greps the ORM call →
  *"Measured 1.8s; trace shows 1.74s in a loop issuing one SELECT per row (N+1) at `users/repo.ts:88`
  over ~400 rows — 深さ: symptom=slow, 病因=this line. Ruled out: index present, network <5ms (広さ).
  Bottleneck = the loop (構造). Path: batch to one IN-query, re-measure (時間 → 十分 → act)."*
- **解決策-side, SAME N+1 病因 (the solution column instantiated):** candidates = batch IN-query /
  dataloader / denormalize (**広さ**); IN-query is lowest-risk highest-leverage (**構造**); ship behind a
  flag, re-measure, then delete the loop (**時間**). The fix targets the VERIFIED 病因, not a guessed one.

## §4. MUST-NOT-FIRE / over-application defense + routing

**OVER-application is the DOMINANT error for a capable model** — the inverse of the book's human
audience, whom it corrects for *under*-deepening (『特に課題の深さが足りない』). This list is first-class,
not an appendix. Each guardrail is a **one-line imperative**; its rationale is owned by
`references/reference.md §C` — do NOT re-argue it here.

1. **Blocking claim already has ONE citation** → assert and move; re-diagnosing is analysis-paralysis (§C.1).
2. **Ordinary edit/debug where inspecting is already the obvious next step** → does NOT fire; this is not "read before asserting" (baseline), only "speculate INSTEAD of inspecting."
3. **A domain OWNER applies** → raising-resolution is at most a silent sub-step, never the firing skill (subtractive predicate; owner filter runs FIRST).
4. **Trivial / already-grounded task** → do NOT run the table; the 4 lenses are a DIAGNOSTIC, never a 4-checkbox ritual. (テンプレート checks 広さ・構造 but NOT 深さ — the author's own anti-box-ticking warning.)
5. **Deepen the WRONG problem / WRONG branch** → guard with the バーニングニーズ gate + the per-node 広さ interlock + the root-state rule (§C.2 #2).
6. **行動なき情報収集 / 既視感 repackaging / a book summary** → dead forms; the contribution is the 4-lens vocabulary + the citation gate, not novel technique. Every retained line must change a tool call (§C.2 #3/#5/#6).

### Routing / owner-filter table (SUBTRACTIVE — sole owner of routing)

This skill is **LOWEST precedence**: once loaded, apply the owner filter FIRST (before the trigger keywords),
so it yields to any owner that applies — auto-activation is description-matched, never a hard guarantee (verify invocation). Fires standalone ONLY when no owner applies and the
blocker is purely your own un-grounded understanding. The bare token "survey" is NOT a trigger here (it is sok's word).

| If the task is… | Route to | Cut |
|---|---|---|
| a CORPUS of papers/sources synthesized into a position | **systematizing-knowledge / sok** | CARDINALITY: single local artifact → here; corpus → there |
| OSS-adoption diagnosis | **growing-oss-adoption** | owner |
| `.claude` / CLAUDE.md / hooks / SKILL.md authoring or auditing | **operating-the-harness** | owner (closes the meta-loop) |
| Julia / Lean execution | **writing-julia / proving-theorems** | owner |
| a future-bet (MVP / prototype / spike / 賭け / kill-condition / will-it-scale) | **acting-on-hypotheses** | DECISIVE (see below) |

**See also — acting-on-hypotheses (the forward-bet sibling).** Cut by PURPOSE/OBJECT; the SOLE owner of the
boundary is `references/reference.md §C.7` (cross-referenced, not duplicated, here). raising-resolution = **現状理解の明晰さ**:
sharpen YOUR OWN grasp of a PRESENT, KNOWABLE-BUT-BLURRY reality by acquiring PRIMARY INFORMATION.
acting-on-hypotheses = **不確実な未来への前進**: bet and ACT on an UNCERTAIN FUTURE that cannot be known by
inspecting what already exists. **DECISIVE CUT** (agrees in substance with acting-on-hypotheses STEP 0 — same
smart-person test, same YES/NO routing; the QUESTION clause is identical, the routing destination flips because
each file names the other, so do NOT diff for byte-identity — canonical phrasing owned by `references/reference.md §C.7`):
*"Could a smart person, given enough primary info about what ALREADY EXISTS, know the answer? YES →
present-understanding gap → raising-resolution. NO → future-bet gap → acting-on-hypotheses."*
**SEQUENCING (self-imposed by THIS skill, one-directional)** — when a single task contains BOTH gaps (e.g.
*"should we adopt this library"* = present "what does it do" + future "will it scale"), raising-resolution runs
FIRST and EXHAUSTS the present-understanding gap (inspect what exists) before handing the residual future-bet off.
**HANDOFF TRIGGER:** every blocking claim about what ALREADY EXISTS has its citation, and what remains can only
be known by a forward test → hand to acting-on-hypotheses STEP 0. They share the word "hypothesis" but operate
on DIFFERENT OBJECTS (here: guess-to-be-VERIFIED-against-the-present-by-inspection; there: node-to-be-FALSIFIED-by-forward-test
then COMMITTED) and INTERLEAVE at the seam but never overlap. Pattern: **Diagnose & ground HERE → execute THERE.**

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/reference.md` | **§A** the four lenses (Unit / boundary / citable HIGH cell + the SOLE home of all owner rules: bottleneck, causality tripartite, MECE分解, プロセス/流れ, 関係性, システム思考; per-node 広さ interlock; lenses-are-revisable-hypotheses) · **§B** 課題 vs 解決策 (order, depth-asymmetry / 解決策×深さ thin by design, 良い課題の3条件, バーニングニーズ gate, research mapping) · **§C** limits/epistemics (stop-at-十分 rationale, six failure modes, over/under-firing calibration, 既視感 honesty, source-grade table, the acting-on-hypotheses boundary + SEQUENCING handoff, the §C.8 agent-boundary harness note) · **§D** the ACQUISITION MECHANISM (action-ladder rationale, 内化⇄外化 kata-by-function table, Why-so / 症状-vs-病因 protocol with per-node 広さ EXECUTION, root-state rule, n=1, 語彙, the worked 起業家 ladder; SOLE owner of "the loop must close on an action") | you need to justify a guardrail, confirm book fidelity, deepen a lens beyond the §1 table, or actually go acquire primary information |
