# Boundaries — sibling cuts argued, and the two deferral risks

> **Scope**: the argument behind SKILL.md's routing table. SKILL.md owns the one-line questions;
> this file owns why each cut falls where it does and what order co-fires run in. Cross-skill
> references go by skill NAME, never by path.

## The function map this skill sits inside

```text
fact in doubt            --raising-resolution-->      cited factual row
cited row + account      --HERE (A1)-->               CONTRAST
CONTRAST                 --HERE (A2, A3)-->           SUPPLIED + CLOSED ROUTE record
closed route SUCCEEDED   --HERE (A4)-->               HYPOTHESIS, Status CLOSED-VOCABULARY (terminal)
closed route EXHAUSTED   --HERE (A4)-->               HYPOTHESIS, Status LICENSED
HYPOTHESIS + frame       --forging-novel-theses-->    CANDIDATE batch / MAPPING-BREAK
one selected candidate   --acting-on-hypotheses-->    Commit / Pivot / Kill
```

The void this skill fills is the middle three rows. `forging-novel-theses` has an entry gate. It requires a selected frame, plus a provenance-bearing
seed or a frozen `DONOR SET`. It does not manufacture that precondition. Nothing else did either.

## Cut-by-cut

### `forging-novel-theses` — DECISIVE, and sequential

Runtime question: *is a frame already SELECTED, and is a seed or frozen `DONOR SET` in hand?*

- Yes → there. It owns GENESIS, emits `CANDIDATE` with target evidence `UNTESTED`, or
  `MAPPING-BREAK`. Do not duplicate that machinery here.
- No, and there is an anomaly → here. This skill builds exactly ONE hypothesis and never ranks.

The artifacts do not overlap. A `HYPOTHESIS` packet is one claim with the record of what entitled
it. A `CANDIDATE` is one member of a ranked batch, generated from an already-selected frame.
Cardinality is the cut you can answer at runtime: one versus many.
A packet typed `TRANSFER`, with a non-empty `Introduced terms` row, seeds that skill's entry-gate
item 4. Handoff direction is one-way; that skill never routes back here.

**Deferral risk.** Both skills are about "new ideas" and both could plausibly decline an anomaly-
plus-no-frame ask. Declared owner: **HERE**. If an ask arrives with an anomaly and no frame, this
skill fires even if the user's words sound like idea generation.

**The conjunction, and why order settles it.** An ask can satisfy BOTH halves at once: a live
anomaly AND a frame already selected with a frozen `DONOR SET`. The precondition is checked FIRST,
so that ask goes there. Their entry gate exists to consume exactly that state; this skill exists to
manufacture the state when it is missing. The description states the cut in that order for the same
reason, because stage-1 firing never reads this file.

### `raising-resolution` — ORDER cut, always co-fire first

An anomaly is a conflict between a FACT and an ACCOUNT. If the fact is not established, there is no
conflict — only a misread. That skill establishes THIS row; this skill fires afterwards. The sequencing is not politeness. A1 asks you to write `P observed`. An unverified P makes every
downstream row garbage.

### `surfacing-blind-spots` — PURPOSE cut

Input type decides. An existing plan/frame/decision ARTIFACT to audit → there; it emits a
Blind-spot packet with an OPEN residual. An OBSERVATION the account does not predict → here.

They compose in one direction. A Blind-spot packet's assumption ledger is good material for this
skill's `Supplied:` row. It cannot supply the `Contrast:` row. A premise audit has no foil. Manufacturing one from
an audit is how a chosen contrast gets mistaken for an observed one.

### `acting-on-hypotheses` — CARDINALITY / PURPOSE cut

That skill runs on ONE selected hypothesis where the work is costly or hard to reverse. It answers
Commit / Pivot / Kill. Here, no hypothesis exists yet — this skill builds the one that skill acts on.
The `Kill condition` row is not that skill's kill decision. It is the retirement condition written
into the packet before anyone commits to anything.

### `systematizing-knowledge` — co-fire, sequential, never racing

A literature corpus runs as an SoK there FIRST. Its signed position is what a `Supplied:` row should cite
when the background is literature rather than a local model. Never survey from inside a packet. This skill has no coverage
contract, no claim ledger, and no appraisal grammar. Improvising one produces exactly the
unreconciled corpus that skill exists to prevent.

### `operationalizing-research-gaps` — PURPOSE cut

An `OPENING` is a bill of work derived from a SIGNED position, addressed and expiring. A `HYPOTHESIS` is a claim about what is happening,
derived from a live anomaly. It expires when its kill condition fires. Signed position with gaps → there. Anomaly in front of you → here.

### `implementing-and-debugging` — PREDICATE cut, and the over-firing guard

Runtime question — does the current account already predict this failure? A stack trace naming the
line. A known bug class. An obvious cause. In each, the account predicts it. There is no anomaly.
This skill firing is ceremony. Route there with no packet.

This cut carries the most over-firing risk. "Something broke and I do not yet know why" reads like
an anomaly and usually is not one. The discriminator: an anomaly requires an
ACCOUNT that made a prediction. "I have not looked yet" is not an account.

## The two deferral risks, named

1. **Anomaly with no frame** — could be declined by both this skill and `forging-novel-theses`.
   Owner: HERE.
2. **Unexplained failure in code** — could be declined by both this skill and
   `implementing-and-debugging`. Owner: `implementing-and-debugging`, unless an account exists that
   positively predicted the opposite outcome.
3. **Anomaly WITH a selected frame and a frozen `DONOR SET`** — both entry conditions hold at once.
   Both skills could claim it. Owner: `forging-novel-theses`, by order of check. Desk-checked as
   N9 in `tests/triggers.md`; found by the 2026-09-05 adversarial pass (ledger §8).

Both are recorded so a later cleanup pass does not "resolve" them into silence.
