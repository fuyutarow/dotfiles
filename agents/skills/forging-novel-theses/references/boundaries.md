# boundaries — routing, co-fire arbitration, anti-patterns

Where this skill fires, where it yields, and how it fails from the inside. The SKILL.md CORE holds the
decisive cut inline; this file is the full arbitration + the misuse diagnostics. Load when you are unsure
whether to fire, when a sibling seems to also apply, or when auditing your own output.

## The firing predicate (both must hold)

Fire **forging-novel-theses** only when BOTH are true:

1. **GENESIS is required** — you must *construct* a thesis that does not yet exist (decompose to
   primitives → transfer a relation-structure from another domain → recombine), NOT merely validate or
   deliver an idea already in hand. The tell: the task asks "is there something novel here / how do I find
   the non-obvious wedge / 第一原理で割ると何が慣習か", not "should I ship X" or "how do I present X".
2. **SURVIVAL matters** — the thesis is meant to be *bet on* (venture / research program / product), so the
   control loop (falsify · why-now · capital · withdrawal) is load-bearing, not decorative.

If only generation matters and there is no bet to survive (pure ideation, a brainstorm with no stake) you
may still run Phase 1 alone — but say so, and do not pretend Phase 3 was satisfied.

## Routing / owner table

| If the task is… | Route to | Cut |
|---|---|---|
| **test / commit a bet you ALREADY HOLD** (no invention: "should we do X", "de-risk this approach", spike/MVP to decide, kill condition for an existing plan) | **acting-on-hypotheses** | DECISIVE — GENESIS test (see below) |
| the **pitch / deck / talk** itself (order, slides, governing sentence, Q&A, open/close) | **designing-presentations** | this skill makes the thesis CONTENT; that skill makes the DELIVERY |
| **distributing / getting adoption** for an EXISTING OSS tool (naming, launch, README, positioning, "blazing fast", drop-in replacement) | **growing-oss-adoption** | lifecycle — genesis (here) precedes distribution (there) |
| **inspecting a PRESENT, knowable fact** about code / data / an API / a source | **raising-resolution** | axis-of-time — construct what does NOT exist (here) vs sharpen what DOES (there); lower precedence, yields to this owner |
| turning a **corpus of papers/sources** into one defensible position | **systematizing-knowledge / sok** | cardinality — a corpus synthesis, not a thesis to bet on |

## DECISIVE CUT — vs acting-on-hypotheses (the sibling that overlaps most)

They share vocabulary (反証・撤退・pivot・kill condition・bet) and will *feel* interchangeable. They are not.

- **acting-on-hypotheses** takes an idea/approach as GIVEN and runs a domain-neutral decision discipline:
  Map (position hypotheses) → Loop (cheapest falsifying test) → Leap (commit). It has **no generation
  engine** — it never invents the thesis; it decides whether and how to bet on one.
- **forging-novel-theses** fires when the thesis must be **invented**: first-principles decomposition,
  cross-domain structure-transfer, recombination. Its Phase 3 then *reuses* acting-on-hypotheses' Loop/Leap
  machinery — specialized into venture gates (adding why-now timing and capital-fit, which acting-on-
  hypotheses does not carry).

**The one-question cut:** *"Is there a NOVEL thesis I still have to construct, or do I already have the
bet and only need to test/commit it?"*
- construct → **forging-novel-theses** (then borrow Loop/Leap for Phase 3).
- already have it, just validate/commit → **acting-on-hypotheses**.

**Pattern: 生成は HERE → 一般的な検証・コミットは THERE.** In a braided task ("invent a wedge AND decide
whether to bet the quarter on it") they co-fire *sequentially*: forge the thesis here through Phase 2, then
hand Phase 3's falsify-and-commit to acting-on-hypotheses' Loop/Leap — do not run two parallel control loops.

## Co-fire arbitration (sequential, never racing)

- **+ designing-presentations** — forge the thesis (Phases 0–2b: content + which future-state to
  communicate), THEN hand the narrative to designing-presentations for the deck/talk. This skill stops at
  "説得 or 知覚変容 を明示"; that skill owns the order, slides, and Q&A that realize it.
- **+ acting-on-hypotheses** — as above: this skill through Phase 2, then Loop/Leap for the bet.
- **+ raising-resolution** — if a Phase 1 "箱A vs 箱B" call depends on a PRESENT fact you are guessing at
  (e.g. "is this really a physical limit or just a convention?"), raising-resolution is a *silent sub-step*:
  inspect the primary source to settle A-vs-B, then continue forging. It never becomes the firing skill here.

## In-skill anti-patterns (observable TELL → recovery)

Each is a way the skill fails from the inside — the same "reproduce the criticized defect" failure the CORE
forbids. Audit your own output against these.

| Anti-pattern | TELL | Recovery |
|---|---|---|
| **箱B 未達 (fake decomposition)** | Phase 1 output lists primitives but the「制約を装った慣習」row is empty or generic ("it's just how it's done"). You *described* the object, you did not decompose it. | Re-run 1a-2: for each "できない理由" ask 物理 か 合意 か, and write the 1-line 経路依存 origin. G1 fails until ≥1 box-B convention is named with its history. |
| **表層転移 (metaphor, not recombination)** | The transferred analogy "sounds apt" but yields no *new testable prediction* about the target. It is decoration. | Apply G2: demand a new prediction from the mapping. If none, the mapping is surface-similar — reject it and search for a relation-structure match. |
| **反証不能 = 信仰 (no kill-experiment)** | Phase 3a is empty, or the "experiment" survives every outcome ("we'll learn either way"). | Write the cheapest experiment that *splits* kill vs keep, with a threshold, BEFORE full build. G3 fails until this exists on paper. |
| **後付け検証 (post-hoc rationalization)** | The 反証条件 are written AFTER the thesis is loved, phrased to be passed. Circular, like the idea-book's "genius thought this, so the method is right". | Fix kill-signals at 着手時 (cool head), objective thresholds only. If you cannot, flag that the bet is un-falsified — do not present it as validated. |
| **タイミング欠落 (no why-now)** | "Now" is justified by "I want to do it now", no named enabling change. | Name a concrete change (規制/コスト曲線/技術成熟/需要転換) absent 5 years ago and not stale in 5. If none, place the thesis as early/late and say so. |
| **金尽き撤退 (worst withdrawal)** | Capital horizon ignored; time-to-truth > runway silently. Withdrawal will be forced by 資金枯渇, not by 反証 — learning-zero death. | Run 3c: fit time-to-truth to runway (shorten verification / extend runway / swap beachhead) so 3d can fire on falsification, not on empty coffers. |
| **10-個を並べる (static list, no loop)** | Output is a flat menu of ideas with no 現実接触 → 反復修正. Exactly the criticized book's shape. | This skill is a control LOOP: seed 1c candidates back into 1a for 2–3 passes; run Phase 3 as iteration, not a one-shot verdict. |
| **気質を工程化 (training the untrainable)** | Treating 内発性 / 合意非依存 as steps to "improve" rather than a gate to pass. | They are Phase 0 *filters*, judged once. If the 合意非依存 1-sentence is absent, stop and ask to continue-or-swap — do not coach it into existence. |

## Excluded 運用 layer (organization-level — out of scope, and WHY each is out)

These are real levers, deliberately NOT工程化'd because they are組織運用, not個人の生成認知. Kept here as
the fuller reasons behind SKILL.md's terse parentheticals — a separate プレイブック文書 owns them:

- **相補的チーム編成 (Wasserman『創業者のジレンマ』)** — 実証: **単独 CEO は生存率が低い**。個人の着想工程では
  なくチーム構成の問題。
- **脅威の定点監視 (Grove の戦略的変曲点)** — 要点は **「不安という感情」ではなく「体系的モニタリングという
  手続き」**。感情でなく手続きなので、生成認知でなく運用に属する。
- **時間選好の固定 (Bezos)** — 機構は **1997 年株主書簡の毎年再添付・1 万年時計** のような、長期 horizon を
  構造で固定する仕掛け。個人の一回の着想でなく、組織の時間規律。

## Lineage (foil, not scripture)

Distilled as a *correction* to 着想系書籍 (代表: 山崎良兵『天才思考』の 10 の思考法): the book is the foil whose
two defects (抽象度の混在 + 制御ループの欠如) define this skill's shape. Named sources inside the phases —
Thiel (合意非依存), Gentner (structure-mapping), Schumpeter (新結合), Brian David Johnson (SF プロトタイピング),
Tesla master plan (ナラティブ), Bill Gross (timing), Wasserman / Grove / Bezos (excluded 運用 layer) — are
*lineage anchors*, not authorities to recite. The contribution is the stack + the artifact-emitting gates,
not the citations.
