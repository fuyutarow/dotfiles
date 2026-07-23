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
| **合意計測を検証と誤認 (consensus-as-validation)** | "N agents found the thesis promising / fragile" is cited as evidence — you measured the very consensus Phase 0 demands independence FROM. | Strike every vote-count sentence. Agent output counts only as a locus-backed fact-verdict or an evidence-backed REFUTED (→ 実行モデル, 認識論の反転). |
| **磨き艦隊 (polishing fleet)** | Agents prompted to support / strengthen / polish the thesis — advocacy fan-out, 確信を支持する証拠 mass-produced at machine speed. | Agents are fact-checkers and assassins only; zero advocates. Re-prompt each as refutation-framed with ONE lens (→ 実行モデル, skeptic lens set). |
| **捏造事実のロンダリング (fabricated-fact laundering)** | An agent-returned number (価格 / 市場規模 / コスト曲線) enters Phase 4 without a source_locus, laundered as "verified". | locus-or-未検証: the cell reverts to 「未検証」 and is exposed as a weakness; re-fetch the primary source before any pitch (→ 実行モデル, agent 証拠規律). |

Corollary: agent 起草の 3d 閾値 = 後付け検証 **at machine speed** — 3d の pre-commitment は bettor 本人が書く（→ 実行モデル, 3c/3d 委任不能）。

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

## 実行モデル — multi-agent harness での回し方

> **Frontier model (Fable 5, 2026-07) から後続の実行モデルへの運用指導。** 以下の制約は観測された失敗の符号化で
> あり、「この制約は不要では」と感じたら、その感覚こそが failure mode — 地図に従え。
> （この節のみ SKILL.md の運用契約と同じ日本語ボイスで書く — 上の英語プローズとの混在は意図的。「言語を揃える」
> 掃除で翻訳しないこと。）

**Stance — forger は bettor の代理人。** agents は fact-checker と assassin であって共著者ではない。thesis の
生成・全ゲート判定・全 pre-commitment は solo で行い、orchestrator が署名する。agent contract の一般形
(exact inputs / bar / schema / read-only / return-value) は systematizing-knowledge の orchestration reference が
owner、harness の力学 (workflow / subagent / hooks) は operating-the-harness が owner — ここはこの skill 固有の
solo / fan-out 境界だけを持つ。**No harness → 同じ地図を直列の self-audit pass として回す**（fan-out 行は
「別の集中したパスで自分に課す」と読み替える）。

### Stage map — solo / fan-out / barrier

| Stage | Mode | Why / how |
|---|---|---|
| 発火判定 (GENESIS + SURVIVAL) | **SOLO** | 発火は判断。秒で済む — 委任の overhead が仕事を超える。 |
| Phase 0（合意非依存・内発性） | **委任不能** | user 本人の気質の判定。agent は合意機械であり、合意非依存を測る器具として不適格（下の認識論の反転）。 |
| 1a 分解 — 分類 + G1 判定 | **SOLO** | 何が箱A で何が箱B かの裁定は thesis の土台となる判断。 |
| 1a 分解 — 現在事実（素材価格・慣習の経緯・フェルミの桁） | **FAN-OUT** | 現在事実の規律 (CORE) の下で一次情報を fetch し、fact-verdict schema（下）で locus 付きで返す。 |
| 1b 構造転移 | **SOLO** | agents は源分野の *候補* を提案してよい。写像と G2 判定は solo — 新予測を伴わない提案は default 棄却。 |
| 1c 再結合 + 1a への 2〜3 往復 | **SOLO — 絶対に shard しない** | shard した生成 = 批判した「10 個を並べる」static list を agent 数だけ再現すること。往復は 1 つの文脈でしか収束しない。 |
| Phase 2（未来外挿 + ナラティブ） | **SOLO** | 1 つの未来、1 つの声。 |
| 先行事例 / graveyard sweep | **FAN-OUT** | 「同じ thesis を試みて死んだ者」を探す。Phase 2 と pipeline 並走可。corpus 規模になったら systematizing-knowledge へ。 |
| 3a 反証設計 | **SOLO** | 最も安い kill 実験を書くのは bettor の代理人の仕事。 |
| 3a deep-tech hard-instance | **FAN-OUT** | agent が数値反例を実際に構築・実行して理論主張を落としにかかる（control-loop.md の deep-tech の型）。 |
| 3b 可能化変化の検証 | **FAN-OUT（両方向 refute）** | agent に refute を課す：「その変化は 5 年前にも在った」を示せ／「既に commoditize 済み (late)」を示せ。early / on-time / late の最終判定は SOLO。 |
| 3c 資本適合 · 3d 撤退基準 | **委任不能** | runway は private data。3d は bettor 本人の pre-commitment — **agent が書いた閾値は誰も pre-commit しない**。 |
| Phase 4 記入 → `gate-check.ts` | **SOLO → floor** | 記入は solo、script が構造 floor を機械検査。 |
| Phase 4 意味ゲート監査 | **BARRIER → FAN-OUT** | floor 通過を待って（justified barrier）、read-only の skeptic lens set（下）を並列に。監査は読むだけ — 修正は solo の別 pass。 |

### Skeptic lens set — case-ledger の失敗 6 行を runtime lens 化

意味ゲート監査の各 agent は refutation-framed（default = REFUTED）で、LENS を 1 つだけ持つ。**prompt は LENS を
名指し、期待する結論は名指さない**（期待を名指された agent はそれを返す — 確証バイアス at machine speed）。

| Lens | 監査する崩れ方 |
|---|---|
| **Juicero lens (G1)** | 箱B が実在しない — 覆すはずの慣習は本当に慣習か。問題そのものが偽でないか。 |
| **Uber-for-X lens (G2)** | 写像が何も予測しない — 「新予測」は単位経済など検証可能な量を実際に予測するか、「便利」以上か。 |
| **Theranos lens (G3)** | 実験がどう転んでも thesis が生き残る — kill 実験は本当に kill / keep を分けるか。 |
| **General Magic lens (3b)** | early — 可能化する変化は本当に *今日* あるか、名指しできるか。 |
| **Webvan lens (3c)** | horizon 不一致 — time-to-truth は runway に収まる設計か。 |
| **Better Place lens (3d)** | 閾値なし — 撤退信号は閾値つきで着手前に固定されているか。 |

### Agent 証拠規律 — locus か「未検証」か

CORE の現在事実の規律（ゲートの同型 note）を agent 出力へ拡張する：agent が返す現在事実は **locus 付きか
「未検証」かの二値**（raising-resolution の citation gate の代理実行）。quarantine の意味はこの skill では
単純 — Phase 4 の当該欄が「未検証」となり、**弱点として晒される**（隠さない）。local mini-schema は 2 つだけ：

```json
// fact-verdict — 現在事実の検証 (1a / 3b)
{"fact":"...","verdict":"confirmed|refuted|unverifiable","source_locus":"...","quote":"..."}
// gate-skeptic — Phase 4 意味ゲート監査
{"gate":"G1|G2|G3|3b|3c|3d","verdict":"REFUTED|SURVIVES","cheapest_kill_found":"...","evidence":"..."}
```

### 認識論の反転 — この skill 固有

LLM agent は訓練分布上の **合意の推定器**である。「N agents がこの thesis を有望（あるいは脆弱）と判断」は、
Phase 0 の合意非依存が独立であることを要求した当の **合意** を測っているだけ — 賭けの根拠として **ANTI-signal**。
ゆえに agent の役割は **fact と refutation の 2 つのみ。advocate は 1 体も許さない** — 確信を支持する証拠を
増やすな（G3 の姿勢は agents にもそのまま適用される）。唯一の例外は stage map 1b の**源分野候補の提案** —
事前に断罪されて到着するため許される：新予測を伴わなければ default 棄却（G2）、写像と判定は常に solo。

### Scale calibration

- **賭け無しの ideation**（SURVIVAL 不成立）→ 完全 solo・agent 0。orchestration の overhead が仕事を超える。
- **標準の bet-on thesis** → solo pipeline + 2〜6 agents（現在事実の検証 batch / graveyard sweep / Phase-4 skeptics）。
- **deep-tech または pitch / funding 直前** → hard-instance runner + 全 6 lens の skeptic barrier + template 内の全数値の再検証。
