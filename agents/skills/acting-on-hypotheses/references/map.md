# Map — STRUCTURE & POSITION: draw the hypothesis tree, name the load-bearing node

> Scope: the ONLY phase that adds/removes/repositions in-tree nodes and tags each 確信度×影響度.
> Map produces **no evidence** and writes **no test-derived confidence value** (that is Loop's verb).
> Map's product is structure: a tree of falsifiable 言い切り plus the single named node Loop will
> attack. Any incoming Open-set residual is a provenance-bearing pass-through, never a node.

| comes from | this file produces | goes to |
|---|---|---|
| STEP 0 GATE's "future-bet, fire" verdict — one selected expensive/irreversible bet, optionally with an incoming Open-set residual | a hypothesis tree (nodes tagged 確信度×影響度) + ONE named load-bearing node + the unchanged residual/provenance/reopen trigger | `loop.md` (the node and residual to carry); a surprising Loop result returns HERE for a cheap in-place restructure |

## §1 — The overarching hypothesis as one falsifiable 言い切り

Write the whole idea as a single declarative sentence you could be WRONG about, not a question.
- ✅ 「この顧客はXが原因でYに苦しんでおり、Zで解決できて売れる」 (a 言い切り — provable false)
- ❌ 「AIで何かすると良いのでは？」 (ふわっと; a question, not a hypothesis — cannot be killed)

A hypothesis that cannot be false cannot be tested, so it cannot be Looped. If you can only ask a
question, you are upstream of Map — that is a present-understanding gap (route per STEP 0 to
raising-resolution), not a node to draw.

## §2 — Decompose into a sub-hypothesis tree (the node set depends on the task type)

通常、1つのアイデア（仮説）は複数の下位仮説から構成される. Pick the node set that fits:

| task type | sub-hypothesis nodes (each a falsifiable 言い切り) |
|---|---|
| **build / product** | value (誰の何の課題に価値があるか) · feasibility (技術的に作れるか) · approach (この設計で解けるか) · integration (既存系に乗るか) · cost (見合うか) |
| **research** | claim (主張は何か) · method (この手法で示せるか) · data (データは足りるか) · baseline (既存比較に勝つか) |

Structure is 仮説 → 推論 → エビデンス hung as a tree. The book's startup example (価値仮説 → {顧客 /
課題 / 解決策 / 価格}; 市場仮説; 戦略仮説) is **lineage, not a fixed schema** — abstract to the node set
your actual task needs.

## §3 — Tag every node 確信度(0–100%) × 影響度

Two axes, the book's evaluation 2-axis, on EVERY node:
- **確信度** — how sure you are it is true (a gradation 0–100%, never 0/1). This is your CURRENT belief,
  not yet test-earned — Loop is what earns it.
- **影響度** — how much the whole hypothesis swings on this node being right or wrong (= the 痛み: 「これが
  間違うと総崩れ」).

**影響度 bias (carry forward to Leap).** When unsure which axis to weight, weight **影響度** — 確信度は後で
上げられるが影響度は上げづらい. A high-影響度 node is worth mapping even at low 確信度.

## §4 — Draw ざっくり, then STOP (TIME-BOX is a first-class rule)

まずは"ざっくり"と描いて構造化する（最初から完璧でなくてOK）. Then **STOP** — set an explicit time-box and
move to Loop. **Endless Mapping (perfectionist tree-drawing) is a banned failure mode** (`anti-patterns.md`:
endless-Map). The map is a revisable hypothesis about the structure, not a deliverable to polish; Loop
results will correct it.

## §5 — The two prioritization scans → the load-bearing node

Scan the drawn tree twice, then pick ONE node:

1. **Low-確信度 scan** — which nodes are you least sure of? = candidates for what to TEST.
2. **Win/lose scan** — which nodes, if wrong, collapse everything (高影響度)? = which are DECISIVE.

**Load-bearing node = max(uncertain × decisive)** — the most uncertain AND most decisive node. This is
the single node you hand to Loop. (The book's 「これが正しければ勝ち / 間違っていたら総崩れ」 node.)
Do not hand Loop a node that is low-影響度 (testing it is vanity even if uncertain) or already
high-確信度 (nothing to learn).

## §6 — Integration (統合): merging sub-maps — Map's verb, including when Loop triggers it

統合 = merging separate sub-maps / restructuring the tree (add, remove, reposition, merge nodes). This is
**Map's verb (STRUCTURE & POSITION)**, never Loop's. Two occasions:

- **Proactive** — at STEP 1, when several partial maps must cohere into one consistent tree.
- **Reactive — triggered by a Loop result.** A surprising test result can reveal a node you never mapped,
  or demand the tree be reshaped. **This is a legitimate Loop-then-Map sequence within a single
  iteration** — see the seam rule below. The structural edit is still Map's verb; Loop only *flagged* it.

Run the ownership cut before placing a reactive node:

### Incoming Open-set residual — pass through; never domesticate it

For each item received from `directing-research`, preserve this interface verbatim in every Map output:

`OPEN-SET RESIDUAL (PASS-THROUGH): <residue> — provenance=<source/packet locus>; reopen-when=<observable trigger>`

The provenance and reopen trigger are required interface fields. If either is missing, emit
`HANDOFF DEFECT: OPEN residual lacks <field>` and return it to `directing-research`; do not guess. Map
must not give the item a confidence value, turn it into a premise, or classify it into the tree.

### The in-tree / frame-break cut — full vocabulary and deterministic tie-break

- **IN-TREE missing node** — it refines a dependency or condition while preserving the selected
  thesis family and every classified coordinate:
  `OBJECT / RELATION / OBSERVATION / REGIME / VALUE / ACTION`. It must not originate from an `OPEN`
  residual. Emit `NEW NODE` and place it here.
- **FRAME-BREAKING discovery** — placing it would change any classified coordinate, replace the
  overarching thesis family, or consume an `OPEN` residual. Do **not** absorb it into Map. `VALUE`
  (whose success/harm/trade-off governs) and `ACTION` (intervention, order, fallback, or authority)
  are frame breaks just as surely as object or regime changes. `OPEN` always remains external until
  `directing-research` classifies it.

Emit exactly one primary slot using this vocabulary:
`OBJECT / RELATION / OBSERVATION / REGIME / VALUE / ACTION / OPEN`.

Tie-break deterministically. `OPEN` wins when the discovery came from an incoming Open-set residual,
its reopen trigger fired, or the evidence cannot justify a concrete type; AOH never reclassifies it.
Otherwise choose the first coordinate that must be rewritten in the contract order
`OBJECT → RELATION → OBSERVATION → REGIME → VALUE → ACTION`; list every other affected coordinate as
cross-tags. This order is only a classification tie-break, not a claim that earlier coordinates matter
more. Emit:

`FRAME-BREAK flagged by Loop iteration N: <discovery> — primary=<slot>; cross-tags=<slots|NONE>; provenance=<locus>; reopen-trigger=<observed trigger|NONE>`

Return the artifact to `directing-research`, which owns stage diagnosis and decides whether to reframe
or send a new thesis-generation request to `forging-novel-theses`.

Map is therefore structurally complete only **inside one selected tree**. It does not proactively search
for unknown premises; that upstream exposure function belongs to `surfacing-blind-spots`.

### The Loop→Map seam is OBSERVABLE, not nominal (closes the residual Map∩Loop overlap)

A single iteration legitimately spans **Loop (test) → Map (node-add)**. The verbs co-occur in one cycle;
what stays separable is the **ARTIFACT**, not the wall-clock moment. Make the seam attributable:

> When a Loop iteration surfaces a missing node, emit one line:
> **`NEW NODE flagged by Loop iteration N: <node> — placed under <parent>, tagged 確信度×影響度`**

That line is the Map artifact. It makes the structural edit **time-boxed and attributable** (which
iteration caused it) instead of an unlabeled relabel of test work as "a Map pass". We claim only that the
artifacts are separable — not that the verbs never share an iteration. (Honesty note: the book folds
map-修正 *into* its definition of ループ — 「学びを得ながら仮説と仮説マップを修正」. This skill re-partitions
that edit to Map for MECE; that is the skill's OWN tightening, not the book's structure. See §7.)

## §7 — Provenance + the "can't name nodes" route

- **「can't even NAME the nodes」 → resolution gap, not a Map failure.** If the present is too blurry to
  write nodes at all, that is a present-understanding gap: route per STEP 0 to **raising-resolution** (or
  the bounded inline fallback in `boundaries.md`). Do NOT relabel that inspection work as a Loop.
- **「the plan is nameable, but its premises or tacit constraints may be hidden」 → exposure gap.** Route
  to **surfacing-blind-spots** for a bounded Blind-spot packet. Map must not invent human tacit answers.
- **Provenance.** 確信度×影響度, the sub-hypothesis tree, the two prioritization scans, and 統合 all trace
  to 馬田『仮説行動』(deck: マップ). The MECE re-partition of map-修正 out of Loop and into Map is this
  skill's engineering tightening of the book's looser ループ definition.

## Map anti-patterns (run this on your own output)

| tell | what's wrong | recovery |
|---|---|---|
| Polishing the tree, no test run yet | endless-Map / perfectionism | time-box, STOP, hand the load-bearing node to Loop (§4) |
| Only a question, no 言い切り | upstream of Map | write it as a falsifiable claim, or route to raising-resolution (§1) |
| Handed Loop a low-影響度 node | testing the wrong node | re-run the win/lose scan; pick max(uncertain×decisive) (§5) |
| Node-add done silently inside a test | the Loop→Map seam is invisible | emit the `NEW NODE flagged by Loop iteration N` line (§6) |
| Frame-breaking discovery squeezed into the selected tree | Map silently changed research altitude | emit `FRAME-BREAK` and return to directing-research (§6) |
| Open-set residual copied without provenance/reopen trigger, or converted into a node | an open-world caveat became an unsupported in-tree fact | preserve the pass-through interface or return the handoff defect; only directing-research may classify it (§6) |
| Every node at 確信度 100% / 0% | binary, not a gradation | re-tag 0–100%; a binary node has nothing for Loop to move (§3) |
