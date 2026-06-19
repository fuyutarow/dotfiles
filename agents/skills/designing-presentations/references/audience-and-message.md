# Audience initial-state, the one goal, and the governing sentence

> Scope: the **front half** of the design procedure — everything that happens *before* you choose an
> order or build a slide. This file owns: defining the ONE goal as a future *state* of the audience
> (Working Backwards), modeling the audience's **initial state** on five axes, defeating the **Curse
> of Knowledge**, computing the **cognitive gap**, compressing to the **governing sentence**, and
> building the **doubts inventory / FAQ**. It ends in three worked examples (research talk, investor
> pitch, exec readout). The body's spine — *a talk is engineered cognition change, not information
> transfer* — is operationalized here as STEPs 0–4 of the design procedure; the steps that follow
> (ordering, slides, delivery) live in the sibling files below.
>
> **Cross-refs.** Ordering frameworks (pyramid, SCQA/SCR, BLUF, strategic narrative) →
> `structure-and-narrative.md`. Assertion-evidence slides, cognitive load, figures →
> `slides-visuals-cognitive-load.md`. Per-context skeletons & the medium decision (deck vs doc vs
> demo) → `context-playbooks.md`. Open/close/Q&A delivery and the full myths-vs-evidence ledger →
> `delivery-objections-and-evidence.md`.

## Table of contents

1. [The reframe: a talk changes a state, it does not transfer information](#1-the-reframe)
2. [Defining the ONE goal as a future audience STATE (Working Backwards)](#2-the-one-goal-as-a-future-state)
3. [The five initial-state axes (and what each context makes load-bearing)](#3-the-five-initial-state-axes)
4. [The Curse of Knowledge and its antidote (concreteness)](#4-the-curse-of-knowledge)
5. [Computing the cognitive gap (current → goal belief-shifts)](#5-computing-the-cognitive-gap)
6. [The governing sentence](#6-the-governing-sentence)
7. [The doubts inventory / FAQ (Working-Backwards PR-FAQ)](#7-the-doubts-inventory--faq)
8. [Worked example A — research / conference talk](#8-worked-example-a--research-talk)
9. [Worked example B — investor pitch](#9-worked-example-b--investor-pitch)
10. [Worked example C — executive decision readout](#10-worked-example-c--exec-readout)
11. [The front-half pre-flight](#11-the-front-half-pre-flight)

---

## 1. The reframe

A presentation is **not** information transfer; it is **engineered cognition change**. The deliverable
is not "the audience now knows X" but "the audience now *decides / does / believes / is* X." This single
reframe governs everything in this file: if the goal is a change of *state* in a specific head, then the
first design moves are (a) name the target state, (b) model the *starting* state, and (c) compute the
difference. Content, order, slides, and delivery are all downstream tooling subordinate to that gap.

The frame flips to honest information-transfer **only** when the genuine purpose is reference/archival —
documentation people will re-consult, a tutorial, a compliance record. There completeness beats
persuasion and "change a decision" is the wrong lens. For everything persuasive — a talk, a pitch, a
readout, a defense — stay in the cognition-change frame. (If the artifact will be read alone rather than
presented, the medium itself is wrong; see the deck-vs-doc gate in `context-playbooks.md`.)

---

## 2. The one goal as a future state

**Name the ONE goal as a future STATE of a specific audience:**

> *"After this, **[specific audience]** will **[decide / do / believe / be]** **X**."*

Reject information-frame goals — *"explain the research," "cover the project," "walk through the
roadmap."* These have no decision in them and produce an unfocused data dump (the master anti-pattern).
Force the goal down to ONE thing the audience should DO or BE; if you have three goals you have three
talks, or one talk with no spine.

| Frame | Bad (information) | Good (state-change) |
|---|---|---|
| Research talk | "Explain my method" | "After this, the committee accepts this is a **valid approach** to an important problem existing methods can't solve, and wants to read the paper." |
| Investor pitch | "Describe the product" | "After this, the investor wants the **next meeting**." |
| Exec readout | "Update them on the project" | "After this, the VP **approves option B** and funds the PoC." |

### Working Backwards: write the realized outcome first

Borrow Amazon's **Working Backwards** discipline: start from the *finished* outcome and write it down
before you design anything that leads to it. Two concrete forms:

- **The future press release.** Write the one-paragraph announcement you want to be *true* after the
  decision lands ("Team X approved the migration to Y; the PoC ships in Q3…"). If you can't write a
  crisp release, your goal is still an information dump, not a decision.
- **The one-sentence outcome.** *"The single thing that has to be different in the world because I gave
  this talk is ____."* Everything that does not move that sentence is candidate for cutting.

(Amazon's Working-Backwards and PR-FAQ practice: Colin Bryar & Bill Carr, *Working Backwards*, 2021;
the doc-first / memo discipline that pairs with it is covered in `context-playbooks.md` §1.)

> **Default + escape hatch.** *Default:* exactly one goal, phrased as an audience future-state. *Escape
> hatch:* a genuinely multi-thread briefing (e.g. a quarterly review covering several independent
> decisions) needs **one goal per decision-thread**, each its own mini-pyramid — *not* one forced
> super-thesis papering over independent asks. Multi-thread is the exception; prove you actually have
> independent decisions before you split.

---

## 3. The five initial-state axes

Before choosing any content, model where the audience **starts**. Design is backward from this state;
skipping it is why expert talks miss. The five axes:

| # | Axis | The question it answers | What it determines downstream |
|---|---|---|---|
| 1 | **Knowledge** | What can I assume they already know? | The SCQA **Situation** (`structure-and-narrative.md`); where to start, what to skip |
| 2 | **Interest / stakes** | What do they want / fear / are rewarded or punished for? | Where the **pathos** and the framing must hook |
| 3 | **Doubts** | Where will they resist or disbelieve? | The **objection inventory / FAQ** (§7) and Q&A backup slides |
| 4 | **Decision-criteria** | What must be *satisfied* for them to say yes? | The checklist your argument must visibly tick |
| 5 | **Expertise** | How fluent are they in the material? | **Slide density** via the expertise-reversal effect (`slides-visuals-cognitive-load.md` Part G) |

Axes 1 and 5 are distinct: *knowledge* is what facts they hold; *expertise* is how fast they process and
how much scaffolding helps vs. harms. A board member may be high-knowledge about the business but a
novice in your technical domain — that mix decides both where you start and how dense the slides get.

### The axis CONTENT flips by context — the constant is that you model all five

The **what** behind each axis is context-specific. Decision-criteria especially are nearly fixed and
knowable in advance per context:

| Context | Decision-criteria the audience is actually scoring against |
|---|---|
| **Investor** | Market size + growth · team · edge / why-you · **why-now** (the most-often-missing one) |
| **Researcher / committee** | Problem-setup · **delta-vs-prior-work** · formulation · validity / threats · limits |
| **Executive** | The decision itself · cost · risk · the few decision-relevant numbers |

Build the model explicitly — write the five axes down for *this* room, do not carry them in your head.
The doubts axis (3) and decision-criteria axis (4) are the two where MECE matters most: a *missed*
decision-criterion or an unanswered doubt sinks the talk silently. (Per-context full skeletons:
`context-playbooks.md`.)

---

## 4. The Curse of Knowledge

The deepest failure mode of expert presenters is the **Curse of Knowledge**: once you know something,
you can no longer reconstruct what it is like *not* to know it, so you default to abstraction and
shorthand the audience cannot decode. The term is from Camerer, Loewenstein & Weber (*Journal of
Political Economy*, 1989, "The Curse of Knowledge in Economic Settings"); it is the named obstacle to
modeling axis 1 (knowledge) and axis 5 (expertise) honestly. The expert's mental model of the novice is
*itself contaminated by the expert's own knowledge* — so the model in §3 must be built deliberately, not
by introspection ("what would confuse me?" returns nothing useful when you're the expert).

### The antidote is concreteness

The reliable cure is **concreteness**: drop from claim to a sensory, picturable example the audience can
hold, *then* generalize. Abstraction is fast to *say* and impossible to *decode* without the schema you
have and they lack; a concrete example carries the meaning across the knowledge gap because both of you
can picture it. This is the evidentiary backbone of the **abstract ↔ concrete oscillation** (claim →
worked example → diagram → generalization, applied *repeatedly* through the talk — see the engine of
pathos+logos in `delivery-objections-and-evidence.md`). Concreteness/picture-superiority is the
defensible evidence here, *not* the folklore "stories are 22× more memorable" (debunked —
`delivery-objections-and-evidence.md`).

**Diagnostics that the curse is biting you:**
- You used a term without defining it because "everyone knows that" — and your audience does not.
- A slide states a result with no example of the thing it is a result *about*.
- You can't name a 90-second concrete instance of your own central claim.

**Antidote checklist:** for each load-bearing claim, attach (a) one concrete example a non-expert can
picture, and (b) a check that every term in the claim is one the modeled audience already holds (axis 1).
When in doubt, assume they **cannot** decode your shorthand — the failure is silent and you will not see
it from the stage.

---

## 5. Computing the cognitive gap

The talk's actual job is the **difference** between the goal state (§2) and the initial state (§3):

```
COGNITIVE GAP  =  goal state (what they must believe to act)  −  initial state (what they believe now)
```

The gap is a *list of belief-shifts* the talk must produce, **in order**. Write them as explicit
deltas — "they currently believe per-device calibration is enough → they must come to believe it
cannot absorb manufacturing variation." Each delta is one rung of the staircase the talk will climb;
naming them *is* the outline before it is an outline. A belief the audience *already* holds needs no
slide (don't re-prove the obvious to a senior room); a belief they will *resist* (a doubt, axis 3) needs
the most evidence.

This is where the front half hands off to ordering: the belief-shift list, sequenced by the audience's
*next question*, becomes the **audience-question staircase** (Minto vertical logic) in
`structure-and-narrative.md`. The rule that survives the handoff: **order by the audience's questions,
not the speaker's discovery order.** A delta with no question that motivates it is misplaced or should be
cut.

The canonical question sequence the gap usually decomposes into:

> Is it important? → Is it really a problem? → Why don't existing methods work? → What's your proposal? →
> Why does it solve it? → What's the evidence? → What are the limits/risks? → So what do you want me to do?

---

## 6. The governing sentence

Compress the whole talk into **ONE sentence** — the central thesis. It has several names across the
canon, all the same object:

- **Minto apex** — the single governing thought at the top of the pyramid, supported by everything below
  (`structure-and-narrative.md`).
- **Single core** — the one idea you'd keep if you could keep only one.
- **SCQA Answer** — in Situation-Complication-Question-Answer, the governing sentence *is* the Answer.

The slides are then the **column of evidence supporting only that sentence.** A weak governing sentence
dooms the whole talk; if you cannot write it crisply, stop and rewrite — do not proceed to slides.

### Phrase it as the ANSWER to the audience's real question

The governing sentence is not a topic and not a summary of what you did; it is the **answer to the
specific question the audience is actually asking** (from the decision-criteria axis). Compare:

| Weak (topic / activity) | Strong (answer to their question) |
|---|---|
| "Our approach to manufacturing variation" | "Manufacturing variation cannot be absorbed by per-device calibration alone — so we calibrate at the population level." |
| "An overview of the new pricing model" | "Switching to usage-based pricing raises net revenue ~18% with no churn increase — we should ship it next quarter." |

### The "So what?" test

Run the governing sentence past **"So what?"** repeatedly until it states an *action-relevant claim*,
not a topic. "We studied X" → so what? → "X turns out to fail under condition Y" → so what? → "so the
standard method is unsafe in regime Z, and here's the fix." Stop when the next "so what?" would be the
*ask itself*. A sentence that survives "So what?" is action-relevant; one that doesn't is still a topic
label wearing a sentence's clothes.

> **Default + escape hatch.** *Default:* one governing sentence for the whole talk. *Escape hatch:* the
> multi-thread briefing (§2) gets one governing sentence **per decision-thread**. Never force a single
> super-thesis over genuinely independent asks — it reads as evasive glue.

This sentence is also the **carry-away**: the line you want repeated in the hallway afterward, and the
thing the open sets up and the close sharpens (delivery mechanics: `delivery-objections-and-evidence.md`).

---

## 7. The doubts inventory / FAQ

The doubts axis (§3, axis 3) is not background — it is a **deliverable**: an explicit FAQ of every
objection the audience will raise, built *before* you design the main line. This is the Working-Backwards
**PR-FAQ** move (the FAQ that ships *with* the future press release): force yourself to write down the
hard questions a skeptic will ask, and answer each, in advance.

**Procedure:**

1. **Enumerate every doubt** from the audience model — "the baseline is weak," "this won't scale," "the
   sample is too small," "why hasn't someone done this already (why-now)," "what about cost / security /
   edge case Z."
2. **Answer each** in one line, with the evidence that settles it.
3. **Route each** to one of two destinations:

| Destination | When | Form |
|---|---|---|
| **Pre-empt in the main line** | The doubt is so load-bearing that, unaddressed, the audience rejects the whole talk | State it yourself and answer it — a belief-shift rung in the staircase (§5). *Pre-stating a limitation builds ethos; it never costs it.* |
| **Hold for Q&A with a backup slide** | The doubt is real but narrower, or occurs only to a subset | One-objection-per-backup-slide arsenal *after* the close — pulling up the exact chart on demand is the strongest Q&A credibility move |

The routing decision and the full Q&A-as-design treatment live in `delivery-objections-and-evidence.md`;
the defense/Q&A playbook (where the backup deck is the real arsenal) is in `context-playbooks.md`. The
cardinal sin is **contradiction-laundering** — burying a known limitation so it can't be raised. It
surfaces in Q&A anyway, where concealment costs far more than the limitation would have. Pre-state the
load-bearing ones; never let them be discovered.

---

## 8. Worked example A — research talk

**STEP 0 — medium.** Live conference slot, present audience, decision is "do they accept + read the
paper" → **deck** (assertion-evidence). (Gate: `context-playbooks.md` §1.)

**STEP 1 — one goal (future state).** *"After this, the audience accepts that population-level
calibration is a valid, important approach to a problem per-device calibration can't solve, and wants to
read the paper."* (Not "explain the method.")

**STEP 2 — initial state.**
- *Knowledge:* fluent in device calibration; unfamiliar with our population-level formulation.
- *Interest/stakes:* they care about yield and reproducibility; they fear adopting a fragile method.
- *Doubts:* "isn't this just per-device calibration with extra steps?"; "does it generalize past your
  test set?"; "what's the cost at scale?"
- *Decision-criteria:* delta-vs-prior-work, validity/threats, limits.
- *Expertise:* high → the one core technical slide may run dense; backup derivations welcome
  (`slides-visuals-cognitive-load.md` Part G).

**STEP 3 — Curse of Knowledge guard.** Don't open in our notation. Anchor "manufacturing variation"
with a concrete picture: two physically identical-looking devices whose response curves differ by 30%.

**STEP 4 — cognitive gap (belief-shifts, ordered).**
1. variation is large and real (concrete example) →
2. per-device calibration *cannot* absorb it (the killer claim) →
3. population-level calibration *can*, and why (mechanism) →
4. evidence across six conditions →
5. honest limits.

**Governing sentence.** *"Manufacturing variation cannot be absorbed by per-device calibration alone —
population-level calibration removes it, at 3× lower error across all six conditions."* (Survives "So
what?": the standard method is insufficient → here's the fix → with evidence.)

**FAQ (pre-empt vs backup).** "Isn't this just per-device + extra steps?" → **pre-empt in main line**
(it's the whole point of belief-shift 2). "Cost at scale?" → **backup slide.** "Generalization past test
set?" → **pre-state the limit** in the main line, deeper backup slide ready.

**Ask.** Soft, explicit: *"read the paper; we're looking for collaborators on the scaling question."*
(Skeleton & the "no point 3" budget: `context-playbooks.md` §2.)

---

## 9. Worked example B — investor pitch

**STEP 0 — medium.** Live, decision is "earn the next meeting" → **deck**, strong front.

**STEP 1 — one goal.** *"After this, the investor wants the next meeting."* (Not "describe the product.")

**STEP 2 — initial state.**
- *Knowledge:* fluent in markets and business models; new to our specific space.
- *Interest/stakes:* return; fear of missing the inflection and of backing a team that can't execute.
- *Doubts:* "why now?"; "why hasn't an incumbent done this?"; "why this team?"
- *Decision-criteria (fixed):* market size+growth, team, edge, **why-now**.
- *Expertise:* high in business, low in our domain → plain-language open, no jargon.

**STEP 3 — Curse of Knowledge guard.** Open with a two-sentence, jargon-free description + one concrete
customer example, *not* the architecture.

**STEP 4 — cognitive gap.**
1. a big world-shift just happened (why-now) →
2. it creates winners and losers →
3. the market is large and growing →
4. we have the edge and the team to win it →
5. here's the milestone the money buys.

**Governing sentence.** *"[World-shift] just made [problem] solvable for the first time; we're the team
positioned to win the resulting [large, growing] market — and $X gets us to [milestone]."*

**FAQ.** "Why now?" → **pre-empt — it's the load-bearing slide** (the most-often-missing one). "Why not
an incumbent?" → **main line** (edge/why-you). "Unit economics?" → **backup slide.**

**Ask.** Direct, with milestone: *"we're raising $X to hit Y; the next step is a follow-on meeting."*
(Sequoia skeleton + Raskin strategic narrative + the 10/20/30 *compression heuristic* caveat:
`context-playbooks.md` §3.)

---

## 10. Worked example C — exec readout

**STEP 0 — medium.** High-stakes complex decision where reasoning rigor > stage presence → often a
**prose memo read silently**, deck as backup (the Amazon move; `context-playbooks.md` §1, §4).

**STEP 1 — one goal.** *"After this, the VP approves option B and funds the PoC."* (Not "update them.")

**STEP 2 — initial state.**
- *Knowledge:* already feels the problem — do **not** re-establish it.
- *Interest/stakes:* cost, risk, time-to-value; rewarded for good decisions, punished for surprises.
- *Doubts:* "is B reversible?"; "what's the cost of *not* deciding?"; "why not A or C?"
- *Decision-criteria:* the decision, cost, risk, the few relevant numbers.
- *Expertise:* high-knowledge about the business; answer-hungry.

**STEP 3 — Curse-of-Knowledge guard (deliberately light).** The exec is high-knowledge *in the business*,
so the curse risk is narrow: it bites only as over-technical option detail or unexplained jargon in the
A/B/C comparison. Guard accordingly — keep every option trade-off in cost / risk / time-to-value language,
never internal architecture or domain shorthand.

**STEP 4 — cognitive gap (compressed).** The exec already holds belief-shifts 1–2 (the problem). The
talk's real gap is: B beats A and C → its cost/risk is acceptable → approve now.

**Governing sentence (BLUF — first sentence).** *"I recommend we adopt option B and fund the PoC: it's
the only option that hits the Q3 deadline within budget, and the main risk is mitigated by [X]."*

**Structure — SCR, not full SCQA.** Drop the explicit Question, minimize the Situation (the exec is
oriented), spend airtime on the **Resolution** + decision-relevant numbers + risks. Present **MECE
options (A/B/C)** with a recommended default and each one's cost/risk. (SCR machinery and the
answer-first flip: `structure-and-narrative.md`.)

**FAQ.** "Cost of not deciding?" → **pre-empt** (executives weight inaction cost). "Why not A?" →
**main line** (it's part of the MECE option comparison). "Reversibility?" → **one-line answer ready.**

**Ask.** The specific approval: *"the decision I'm asking for today is to approve option B and fund the
PoC."*

---

## 11. The front-half pre-flight

Run this before touching order or slides. If any line fails, fix it *here* — no downstream work repairs
a broken front half.

- [ ] **One goal**, phrased as a future audience STATE ("after this, [audience] will [decide/do/be] X"),
      not an information goal ("explain / cover / update").
- [ ] **Working-Backwards check** — you can write the one-sentence realized outcome (or future press
      release) you want to be true.
- [ ] **All five initial-state axes modeled in writing** for *this* room: knowledge, interest/stakes,
      doubts, decision-criteria, expertise.
- [ ] **Curse-of-Knowledge guard** — every load-bearing claim has a concrete, picturable example, and
      every term in it is one the modeled audience already holds.
- [ ] **Cognitive gap written as an ordered list of belief-shifts** (goal − initial state), each
      motivated by an audience question.
- [ ] **Governing sentence written**, phrased as the ANSWER to the audience's real question, and it
      **survives "So what?"** to an action-relevant claim. (One per decision-thread if multi-thread.)
- [ ] **Doubts inventory / FAQ built**, each doubt answered and routed to *pre-empt in main line* or
      *backup slide*; no known limitation laundered.
- [ ] **The explicit ask is named** (you know the single next action the close will request).

Once these pass, hand off: sequence the belief-shifts by the audience's next question
(`structure-and-narrative.md`), put each on a slide as an assertion + visual evidence
(`slides-visuals-cognitive-load.md`), instantiate the per-context skeleton (`context-playbooks.md`), and
design the open/close/Q&A (`delivery-objections-and-evidence.md`).

