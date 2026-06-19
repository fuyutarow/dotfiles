# Per-context skeletons: research talk, investor pitch, exec readout, defense, demo, keynote

> Scope: the concrete **judgment criteria and skeletons that differ by context**. `../SKILL.md` owns the
> universal design procedure (initial-state → governing sentence → audience-question staircase →
> assertion-evidence slides → explicit ask); this file owns the *per-context deltas*: which initial-state
> axes are load-bearing, which named skeleton to instantiate, and where each context **flips a default
> rule**. It also owns **Step 0 — the medium decision** (deck vs doc vs demo), because the medium is a
> context choice, not a content one. Cognitive-load mechanics live in `slides-visuals-cognitive-load.md`;
> ordering machinery (pyramid, SCQA/SCR, BLUF, strategic narrative) in `structure-and-narrative.md`; the
> myths-vs-evidence base in `delivery-objections-and-evidence.md` — this file *cites* them, never
> re-derives them.

## Table of contents

1. [Step 0 — pick the medium before the content (deck vs doc vs demo)](#1-step-0--pick-the-medium-before-the-content)
2. [Research / conference talk](#2-research--conference-talk)
3. [Investor pitch](#3-investor-pitch)
4. [Executive decision readout](#4-executive-decision-readout)
5. [Thesis defense / Q&A-heavy talk](#5-thesis-defense--qa-heavy-talk)
6. [Product / sales demo](#6-product--sales-demo)
7. [Keynote / inspirational talk](#7-keynote--inspirational-talk)
8. [The deck-vs-doc decision rule, restated as a gate](#8-the-deck-vs-doc-decision-rule-restated-as-a-gate)
9. [Quick-reference: what flips per context](#9-quick-reference--what-flips-per-context)

The unit of every playbook below is the same: **(a) the ONE goal as an audience future-state**,
**(b) the initial-state axes that actually decide this room**, **(c) the skeleton to instantiate**,
**(d) the rule that flips here**, and **(e) the ask**. Instantiate, do not improvise.

---

## 1. Step 0 — pick the medium before the content

Before writing a single slide, decide what artifact the situation actually needs. The medium is the
first design decision; getting it wrong cannot be repaired by good slides.

| Goal of the meeting | Right medium | Why |
|---|---|---|
| Real-time **decision**, live discussion, present audience | **Deck** (assertion-evidence) | Slides pace a shared room and aim attention. |
| High-stakes **complex** decision, rigor > stage presence | **Prose memo**, read silently first | Full sentences force you to state *how* claims relate; bullets let weak reasoning hide. |
| Async consumption (read alone, later) | **Memo / doc** | A deck without its narrator is unanchored fragments. |
| "Prove it works" | **Live demo** | The working thing *is* the evidence; slides about it are weaker. |

**The Amazon move (the canonical doc-first discipline).** Amazon banned PowerPoint for its main
meetings in favor of a **narrative memo** (commonly described as ~6 pages) read in silence at the top
of the meeting, *then* discussed. Bezos's stated rationale is exactly the cognitive point: a good
narrative memo is *harder* to write than a bulleted deck precisely because the prose structure forces
better thinking and a clearer sense of what matters most — bullet fragments let weak reasoning hide.
(The canonical primary source is an Amazon shareholder letter, not the 2013 book *The Everything Store*;
pin the exact edition/year and confirm the wording before quoting Bezos verbatim.) Treat this as: **when
the reasoning is the product, write prose to think; only compress to slides if a live talk genuinely
adds something the memo cannot.**

> **Default + escape hatch.** Default to a deck for a live, discussion-driven decision with people in
> the room. Escape to a **memo** the moment any of these is true: the content is complex, the reasoning
> (not the delivery) is the binding constraint, or it will be consumed asynchronously. The honest move
> on a hard decision is often *write the memo first, then ask whether a talk adds anything at all.*

---

## 2. Research / conference talk

**(a) Goal (future-state).** Almost never "the audience understands every detail." The realistic,
correct goal is: *"after this, the audience accepts that this is a **valid, important** approach to a
problem existing methods can't solve, and wants to read the paper / adopt the framing / collaborate."*
Comprehension of every equation is neither achievable in the slot nor the point.

**(b) Initial-state axes that decide this room.** problem-setup (what may you assume they know?) ·
**delta-vs-prior-work** (why this isn't just the last paper) · formulation · **validity / threats** ·
**limits**. Skepticism is the default prior, so **logos + ethos dominate; keep pathos restrained** —
emotional framing reads as a credibility red flag to an expert audience.

**(c) Skeleton — the Simon Peyton Jones budget.** SPJ's widely-taught talk advice ("How to give a
great research talk," Microsoft Research talk/notes, and the companion paper-writing guidance) gives
the load-bearing allocation:

- **~Motivation: budget the first slices to make them CARE** — you have roughly two minutes before
  attention drops; spend them on *why this problem matters*, with a concrete example, not on outline
  slides or a literature survey.
- **ONE key idea, narrow and deep.** SPJ's blunt rule: *"There is no point 3."* Pick the single idea
  you want them to leave with and go deep, rather than covering the whole paper shallowly. A talk is an
  **advertisement for the paper**, not a substitute for it.
- **Examples are the weapon.** Oscillate abstract↔concrete *hard* (`../SKILL.md` Step 3, concreteness;
  the pathos+logos engine is Step 9): claim → worked example → diagram → generalization. Pure formalism
  loses the room; pure examples lose the generality.
- **Cut:** the related-work survey ("I'll skip the related work" — then skip it), dense notation you
  won't use, and **apologies** ("sorry this is preliminary / sorry for the small font"). Apologies spend
  ethos for nothing.

**(d) Rule that flips here.** The "narrow and deep" rule *inverts the breadth instinct*: covering more
of the paper makes the talk worse, not more complete. Density of any single slide may rise for the one
core technical result you're actually defending.

**(e) Ask.** Soft but explicit: *"read the paper," "adopt this framing," "let's collaborate on X."*
Never close on "Thank you, questions?" with no carry-away. (Citations: Simon Peyton Jones, "How to
give a great research talk," Microsoft Research,
`microsoft.com/en-us/research/academic-program/give-great-research-talk/`.)

---

## 3. Investor pitch

**(a) Goal (future-state).** *"After this, the investor wants the **next meeting / to invest**"* — not
"the investor understands the product." A pitch's job is to earn the next conversation.

**(b) Initial-state axes that decide this room are FIXED and known in advance:** market **size + growth**,
**team**, **edge / why-you**, and — the most often-missing, most load-bearing slide — **WHY NOW** (what
changed in the world that makes this possible/inevitable *now* and wasn't true two years ago). An
investor is pattern-matching against a checklist; answer the checklist.

**(c) Skeleton — the Sequoia template** (Sequoia Capital, "Writing a Business Plan" / "How to write a
business plan," `sequoiacap.com`):

```
Company purpose → Problem → Solution → Why now → Market size →
Competition → Product → Business model → Team → Financials
```

- **Open jargon-free:** a two-sentence description of what the company does + one concrete example, in
  plain language. Then put your **strongest material immediately** — you must "earn the next two minutes."
- **"Why now" is non-negotiable.** This is the inflection slide; a pitch without a credible why-now reads
  as "why hasn't someone already done this?"
- **Strategic narrative on the front** (Andy Raskin, "The Greatest Sales Deck I've Ever Seen"): name a
  big **world-shift** → show there will be **winners and losers** → paint the **promised land** (the
  future the winners reach) → position your product as the **gift/magic gifts** that get them there.
  The customer is the hero; you are the guide.
- **Matter-of-fact tone.** Grandiose / hype language ("revolutionary," "world-changing") is a credibility
  *tell* — Y Combinator's standing advice is to describe what you do plainly and let the numbers carry it.

**(d) Rule that flips here — Guy Kawasaki's 10/20/30 is a COMPRESSION HEURISTIC, not a law.** "10 slides,
20 minutes, 30-point font minimum" (Guy Kawasaki, blog "The 10/20/30 Rule of PowerPoint," 2005). Its
*real* value is the **30-point-font floor**: it mechanically forces you to cut text, because dense bullets
won't fit. Treat the slide count and minute count as discipline, not gospel; the font floor is the part
that does the work.

**(e) Ask.** Direct, with milestones: *"we're raising $X to hit milestone Y; the next step I'm asking for
is a follow-on meeting / term sheet."*

---

## 4. Executive decision readout

**(a) Goal (future-state).** *"After this, the exec **approves option B**"* (or rejects it knowingly). A
decision, named, today.

**(b) Initial-state axes that decide this room:** the **decision** itself, the **risk**, and the **cost** —
plus the few numbers that bear on the choice. The exec **already feels the problem**; do not spend their
time re-establishing it.

**(c) Skeleton — BLUF + SCR.**
- **BLUF (Bottom Line Up Front):** the *first sentence* states the recommendation and the decision you're
  asking for. (BLUF is the principle codified — though not as the acronym itself — in **U.S. Army
  Regulation AR 25-50**, "Standards for Army writing": *"putting the main point at the beginning of the
  correspondence (bottom line up front)."* The acronym "BLUF" is military shorthand that grew up around
  the regulation, not text codified in it — see `delivery-objections-and-evidence.md`.)
- **SCR, not full SCQA:** *Situation → Complication → Resolution* (Barbara Minto's introduction structure).
  Drop the explicit **Question** and **minimize the Situation** — the exec is answer-hungry and already
  oriented. Spend the airtime on the **Resolution** + decision-relevant numbers + risks.
- **Present MECE options with a recommended default.** Lay out the real options (mutually exclusive,
  collectively exhaustive — no overlap, no missing alternative), state the cost/risk of each, and name
  **your recommendation and why**. Executives reject decks that hand them undifferentiated choices.

**(d) Rule that flips here.** The "build the gap / make them feel the problem" front-loading from the
research-talk and keynote playbooks is *wrong* here — it wastes a senior audience's time. And the medium
itself often flips: the right deliverable is frequently a **prose memo read silently** (see §1), with the
deck as backup.

**(e) Ask.** The specific approval: *"the decision I'm asking for today is to approve option B and fund the
PoC."* (SCQA/SCR ordering machinery: `structure-and-narrative.md`. The Minto *Pyramid Principle*
edition/date is genuinely contested — the dating caveat, with sources, lives in the attribution notes of
`delivery-objections-and-evidence.md`.)

---

## 5. Thesis defense / Q&A-heavy talk

**(a) Goal (future-state).** *"After this, the committee is convinced the work is **rigorous and the
candidate is in command** of it."* The decision usually moves in **Q&A**, not in the prepared talk.

**(b) Initial-state axes that decide this room:** demonstrated **rigor**, **goodwill** (you're not hiding
anything), and anticipated **objections/limitations**. The audience is expert and adversarial-by-role.

**(c) Skeleton.**
- **Main line earns ETHOS** through demonstrated rigor and goodwill, then gets out of the way so the real
  exchange — Q&A — can happen.
- **Backup slides are the actual arsenal: one per anticipated objection / limitation / "what about X?"**
  This is where defenses are won. Build the FAQ from your initial-state doubts axis (`../SKILL.md` Step 2),
  routed at Step 8; full procedure in `audience-and-message.md` §7. Back each doubt with a slide to jump to.
- **Pre-state the limits.** Do **not** apologize for them and do **not** bury them — naming your own
  limitations *before* the committee does demonstrates command and *builds* ethos. Hiding a known weakness
  ("contradiction-laundering") is the cardinal defense sin.

**(d) Rule that flips here — the sparse-slide default INVERTS.** For an expert audience, with slides that
will be **paused on and studied** (backup derivations, appendix tables), **higher information density per
slide is correct, not a violation**. This is the *expertise-reversal effect*: scaffolding and minimalism
that help novices slow experts down. (Mechanism and citation: `slides-visuals-cognitive-load.md`.)

**(e) Ask.** Implicit (pass the defense), but the prepared close should still hand the committee the frame
you want them to judge by: *"the contribution I'm claiming is X; the limits are Y; happy to go deeper on
any of them."*

---

## 6. Product / sales demo

**(a) Goal (future-state).** *"After this, the buyer takes the **next step** — trial, pilot, next
meeting"* — not "the buyer has seen every feature."

**(b) Initial-state axes that decide this room:** the buyer's **pain** (the status quo that hurts), the
**stake** attached to each capability, and the **before/after contrast** they'll feel.

**(c) Skeleton — the Story Spine** (Kenn Adams, *How to Improvise a Full-Length Play*, 1991; popularized
via Pixar by Emma Coats, 2012 — note this is **distinct from Campbell's Hero's Journey**, see
`delivery-objections-and-evidence.md`):

```
Once upon a time [status quo] → Every day [the routine pain] →
Until one day [the disruption / your product enters] →
Because of that … Because of that … [consequences cascade] →
Until finally [resolution] → And ever since [the new normal]
```

- **Structure the demo as this story around the CUSTOMER'S pain — customer as hero, product as the tool
  that resolves it.** Show the **before-pain / after-relief contrast live** (this is the what-is ↔
  what-could-be oscillation from Duarte, made literal on screen).
- **Anchor every feature to a stake.** "Here's a feature" is dead; "here's the feature that kills the pain
  we just felt" lands.

**(d) Rule that flips here — answer-first can flip to suspense.** A genuine **reveal** (the moment the
product does the thing) earns its power from *not* being spoiled. So unlike a BLUF readout, a demo may
deliberately *withhold* the punchline to land the contrast. The flip is bounded: it applies to the reveal
beat only, not the whole structure.

**(e) Ask.** The next step, concretely: *"let's get your team a 14-day trial / a pilot on dataset X."*

> **Demo anti-pattern (the failure mode to guard against):** the **feature tour** — clicking through every
> menu with no decision and no stake. It produces "that was thorough" and zero movement. Cure: every beat
> ties to the buyer's pain, and the demo ends on a named next step.

---

## 7. Keynote / inspirational talk

**(a) Goal (future-state).** *"After this, the audience **carries and spreads an idea**."* The "action"
is adoption of a frame, not a transaction.

**(b) Initial-state axes that decide this room:** what the audience already *feels*, what future they can
be moved to *want*. Pathos and the **is ↔ could-be** oscillation dominate here (Nancy Duarte, *Resonate*,
2010: alternate between "what is" and "what could be," repeatedly, to create forward pull).

**(c) Skeleton.**
- **Presentation-Zen restraint** (Garr Reynolds, *Presentation Zen*, 2008): high signal-to-noise, **one
  element per slide**, generous negative space, multisensory mental pictures over dense data.
- **Repeated what-is / what-could-be contrast** builds the emotional arc; end on the new normal the
  audience could inhabit.

**(d) Rule that flips here — the "18-minute rule" is a DISCIPLINE, not a law.** TED's 18-minute cap is an
**administrative format choice** (Chris Anderson, *TED Talks: The Official TED Guide to Public Speaking*,
2016), and the "scientific attention limit" rationale is **retrofitted** — peer-reviewed reviews find
little support for a fixed 10–15-minute attention ceiling (Wilson & Korn 2007; Bradbury 2016; see
`delivery-objections-and-evidence.md`). Use the cap as a **compression forcing-function**, never cite it
as an attention law.

**(e) Ask.** Softened but present: an idea to carry and act on, not "thank you."

---

## 8. The deck-vs-doc decision rule, restated as a gate

Run this gate before committing to slides at all (it operationalizes §1):

```
Is the reasoning itself the hard part of this decision?
  └─ YES → will it be read async, or is rigor the binding constraint?
        └─ YES → write a PROSE MEMO (Amazon 6-pager). Slides optional backup.
        └─ NO  → is there a live, present audience who must DECIDE together?
              └─ YES → DECK (assertion-evidence)
              └─ NO  → MEMO
  └─ NO → is the deliverable "prove it works"?
        └─ YES → DEMO (Story Spine)
        └─ NO  → DECK
```

The load-bearing reason to prefer prose for hard decisions: **bullet fragments let weak reasoning hide;
full sentences force you to state how claims relate.** A deck used to *perform around* a thin argument is
the failure the Amazon memo exists to prevent. (See the Columbia/PowerPoint discussion in
`delivery-objections-and-evidence.md` for what is — and is *not* — true about "slides cause bad
engineering decisions"; the defensible lesson is "bullet slides can mask reasoning," not "the tool is
defective.")

---

## 9. Quick-reference — what flips per context

| Context | One goal | Load-bearing axes | Skeleton | The rule that FLIPS (see §) |
|---|---|---|---|---|
| **Research talk** | Accept it's valid + read paper | delta-vs-prior, validity, limits | SPJ: ~motivation + ONE idea | Narrow-deep beats broad (§2) |
| **Investor pitch** | Next meeting / invest | market+growth, team, edge, **why-now** | Sequoia + Raskin narrative | 10/20/30 = font-floor discipline, not law (§3) |
| **Exec readout** | Approve option B | the decision, risk, cost | **BLUF + SCR**, MECE + default | Skip problem build-up; often a **memo** (§4) |
| **Defense / Q&A** | Rigor + command shown | rigor, goodwill, objections | Lean line + **backup arsenal** | Slide density **inverts up** (§5) |
| **Sales demo** | Next step (trial/pilot) | buyer pain, stake, before/after | **Story Spine**, buyer = hero | Answer-first → **suspense** for the reveal (§6) |
| **Keynote** | Carry + spread an idea | felt state, desired future | Zen restraint + is/could-be | "18 min" = discipline, not a law (§7) |

**The invariant under all six flips:** model the audience's initial state, compress to one governing
sentence that answers *their* question, order by *their* next question, put the claim in the title and the
evidence in the visual, and close on the **one explicit next action**. The playbooks change the *texture*
and the *defaults that flip* — never the spine. (Universal spine: `../SKILL.md`. Audience modeling +
governing sentence: `audience-and-message.md`. Ordering frameworks: `structure-and-narrative.md`.
Slide/figure mechanics: `slides-visuals-cognitive-load.md`. Delivery, objections, and the full
myths-vs-evidence ledger: `delivery-objections-and-evidence.md`.)

