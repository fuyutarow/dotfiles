# Loop — TEST & WRITE-VALUES: the cheapest falsifying test that moves a node's 確信度

> Scope: the ONLY phase that runs a test and WRITES a confidence value onto an EXISTING node.
> Loop is cheap, discard-intent, epistemic action — you act to LEARN, not to keep. It owns
> **学びの最大化** (maximize confidence-delta-per-cost on the load-bearing node).

| comes from | this file produces | goes to |
|---|---|---|
| the load-bearing node Map flagged (`map.md`) — a single named, 確信度×影響度-tagged target | a written confidence value on that node + the discrimination table + the STOP/escalate decision | back to `map.md` if a missing node surfaced, or on to `leap.md` once fatal risk is retired |

**Verb seam (do not cross it).** Loop's verb is TEST & WRITE-VALUES. Loop **never** adds, removes,
or repositions nodes — that is Map's verb (STRUCTURE & POSITION). If a test reveals a node that
should exist, Loop **flags** it and hands a cheap in-place Map pass the restructure (see §5). Loop
also never stakes a kept output — that is Leap's verb (COMMIT & REALIZE). Loop only moves a number
on a node Map already drew.

**What "学びの最大化" means.** 学び = a confidence MOVEMENT caused by evidence that COULD have gone
the other way. The unit of learning is one such movement on the load-bearing node, per unit cost.
努力の量と学びの量が比例するとは限らない — effort is not the metric; confidence-delta-per-cost is. A
test that cannot move the number, or whose result you would explain away either way, produces zero 学び
no matter how much work it took.

> **Learning is Loop's DESIGN GOAL, not a monopoly on all confidence movement.** Leap also moves
> confidence — but that is POST-COMMIT realized confidence, a byproduct of staking (`leap.md` §5).
> Loop owns 学びの最大化 as the thing it is *designed* to maximize (cheap, pre-commit, discard-intent);
> it does not own every confidence change in the skill.

## §1 — Plan in reverse (L→M→B), execute forward (B→M→L)

Loop IS Build-Measure-Learn (Ries' リーンスタートアップ lineage), but you DESIGN it backwards so the
build is the minimum the learning requires — never the maximum you could build.

| step | PLAN order (L→M→B) | what you decide |
|---|---|---|
| **L — Learn** | 1st | What is the ONE thing I want to learn? = which node's 確信度 do I move, and which direction would kill it? |
| **M — Measure** | 2nd | What signal discriminates that? What threshold = pass vs fail? (decide BEFORE building — §3) |
| **B — Build** | 3rd | The minimum artifact that produces that signal — nothing more (§4) |

Then EXECUTE forward B→M→L and repeat. Planning B-first is the classic trap: you build a thing, then
ask "what does this tell me?" and accept whatever it happens to say. Plan L-first or you will measure
a vanity signal.

## §2 — The discrimination table (R3, built per iteration) — the literal "cheapest test that discriminates"

Before running ANY Loop test, write this two-row table. This is where R3 (declared in SKILL.md) is
*operationalized* — the rule names the law; here you build the artifact each iteration.

| outcome | what it tells me | DIFFERENT next action |
|---|---|---|
| **PASS** (signal ≥ threshold) | … | … |
| **FAIL** (signal < threshold) | … | … |

**The veto.** If the two "next action" cells are the SAME, the test is a **vanity test** — it cannot
move a decision, so it produces zero 学び. **FORBIDDEN: do not run it.** Either find a test whose two
outcomes fork the next action, or you are not actually uncertain about anything testable here.

**Aim it.** Point the test at the belief most likely to be WRONG *and* most DECISIVE — i.e. the
load-bearing node Map named, not the node you are most confident about. Treat disconfirming evidence
as the WIN: a test that kills a wrong belief cheaply is the best possible outcome (証明モードではなく
反証モード — seek the fact that contradicts you, with the humility to act on it).

## §3 — Metric pre-commitment + vanity-metric avoidance

Decide the measurement BEFORE you build, and pin all four:

1. **The signal** — what you will observe.
2. **The pass/fail threshold** — the specific number that counts as passing (e.g. "≥3 of 5 ask
   about the rollout"), set BEFORE acting. This is R2's artifact for the node.
3. **The interpretation** — agreed in advance with any stakeholders, so the result is not
   re-litigated after it arrives.
4. **The cost** — keep the measurement itself cheap (売上 / a passing test / a reproduced number are
   cheap and hard to fake).

**Prefer an objective behavioral signal over self-report.** Confidence moves on evidence that the
subject *sacrificed something* — money, time, or reputation (a payment, a signed contract, real
sustained attention, a green test, a reproduced figure). Self-reported enthusiasm ("that's a great
idea", a thumbs-up, a 👍) is a **vanity metric**: it costs the giver nothing and predicts nothing.
Measure 結果的行動 (what they DID), not 表明 (what they SAID).

## §4 — Minimum-scope, discard-intent probes (sized to the SIGNAL, not the outcome)

A Loop action is one you pre-commit to **throw away / not depend on** (this is what distinguishes it
from a Leap — see `leap.md`). Size it to the signal you need, then stop. 一番安い実験 = the smallest
scope that yields the discriminating signal; same 学び, an order of magnitude less cost.

| pattern | what you actually build | the signal it buys |
|---|---|---|
| **Sell-before-build (売ってから作る)** | a landing page / pitch / pre-order ask for a product that does not exist | will they pay/commit BEFORE you spend the build cost |
| **Concierge / Wizard-of-Oz (手作業型 MVP)** | deliver the value by hand, no system behind it | does the value land at all — before automating |
| **Spike** | a throwaway code stub that touches only the risky path | does the approach work technically — discard the code after |
| **Single real signal** | ONE real run, ONE real user, ONE reproduced number | the first disconfirming-or-not data point on the riskiest node |

Run FAST and expect to fail: 失敗前提で回す — most hypotheses are wrong, and a fast cheap failure is
PROGRESS (it retired a risk for almost nothing). Speed has two levers: shrink the scope, and shorten
the cycle. Scale-discipline: スケールしないことをしよう — the manual, unscalable probe is correct here
*because* you intend to discard it.

## §5 — Write the confidence value; never edit structure

When the signal arrives:

1. **WRITE the value.** Update the node's 確信度 (0–100%, a gradation — never 0/1). Record what the
   evidence was and which direction it moved the number.
2. **If a missing node surfaced** — the test revealed a belief you had not mapped — **FLAG it and
   hand a cheap in-place Map pass the restructure**, emitting the seam artifact:
   `NEW NODE flagged by Loop iteration N: <node>` (`map.md` §6). Loop never *adds* the node itself
   (verb seam) — but a single iteration legitimately runs **Loop (test) → Map (node-add)**; what stays
   separable is the ARTIFACT, not the wall-clock moment. The deck folds map-修正 into ループ; this skill
   re-partitions the edit to Map for MECE (`map.md` §6 honesty note). A surprising result that demands a
   structural change can also **demote a planned Leap** back to more Loop; route that through Map.
3. **Otherwise, loop or stop** — apply §6.

## §6 — STOP: decision-sufficiency, not certainty

**Stop Loop when the fatal risks on the load-bearing node are retired — NOT at 100% confidence (it
never comes).** 100%の確信は永遠に得られない; you have learned ENOUGH when no remaining unknown could
be *fatal* to the decision riding on the node. Then hand off to Leap.

- **Over-learning is waste.** Continuing to test past the decision threshold is itself a failure mode
  (it is analysis-paralysis wearing a Loop costume) — the chip is "kept testing a node whose number
  is already decision-sufficient." Force the Leap.
- **Decision-sufficient ≈ enough to act, not enough to be sure.** A mid 確信度 with a retired fatal
  risk and asymmetric reversible upside is a GO for Leap (`leap.md` sizes reversibility); it is not a
  reason to keep looping.

## §7 — Honest limit: 反証 = seek disconfirming SIGNAL, not a controlled experiment

Per rmaruy's critique (kept with weight): a business 仮説 is **真逆** of a natural-science hypothesis.
Business hypotheses advance by **対話 / co-creation**, NOT by clean Popperian falsification. So here
**反証 means "seek a disconfirming SIGNAL," not "run a controlled experiment."** Do not oversell
scientific rigor the author himself disclaims.

- **Falsify WHERE falsification is possible.** When you CAN point a discriminating test at the node
  (a real user, a real run, a reproducible number), do §1–§6 as written.
- **When you CANNOT** — the load-bearing node is not falsifiable by any test you can actually run
  here (no access to the real signal, or it is fundamentally a co-creation/relationship question) —
  do NOT felt-Loop an unrunnable node. **Unrunnability is artifact-gated, not a feeling: before
  declaring a node unrunnable, NAME the specific signal you lack access to AND confirm no cheaper
  proxy signal exists. Vague "testing is hard" is NOT unrunnability** — that is just an expensive
  Loop you have not scoped down (re-run §4). Only once you can name the missing signal: switch the
  node from **FALSIFY-mode to DIALOGUE / CO-CREATION-mode** (advance it by direct dialogue with the
  people who co-determine the answer), OR escalate that **access / location is the blocker** —
  回らないなら、いる場所が悪いのかも. Churning an unrunnable loop is not learning; this is the stagnation
  check's DIALOGUE/CO-CREATION exit (see SKILL.md RECURRING — STAGNATION CHECK), and it has a home
  here, not a footnote.

## Loop anti-patterns (run this on your own output)

| tell | what's wrong | recovery |
|---|---|---|
| Built first, then asked what it tells you | B-first planning → vanity signal | re-plan L→M→B (§1); discard and re-scope to the signal |
| Two "next action" cells are identical | vanity test, zero 学び | do not run it; find a forking test or admit nothing is testable (§2) |
| Threshold set/interpreted AFTER the result | post-hoc rationalization | pre-commit the metric next time (§3); treat this result as untrusted |
| Confidence moved on a 👍 / "great idea" | vanity metric, no sacrifice | re-test for 結果的行動 — money/time/reputation (§3) |
| Loop added/removed a node | crossed Map's verb seam | flag the node, hand a cheap Map pass (§5) |
| Still testing a decision-sufficient node | over-learning / paralysis | STOP, force the Leap (§6) |
| Re-running an unrunnable loop, hoping | felt-Loop, no real signal accessible | name the missing signal + rule out a cheaper proxy; only then switch to DIALOGUE/CO-CREATION or escalate location (§7) |
