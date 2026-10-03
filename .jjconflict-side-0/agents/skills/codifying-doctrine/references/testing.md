# Testing — the divergence probe and the audit (pipeline step 11)

> **Scope**: SOLE home of the DIVERGENCE PROBE protocol, the observable tells of a decorative
> doctrine, and the audit of a doctrine someone else wrote. What a rule must contain is
> `references/deriving.md` and `references/binding.md`; sources are `references/canon.md`.

## 1. The DIVERGENCE PROBE — the only test of the thing the doctrine claims

The claim a doctrine makes is: *actors who cannot confer will decide alike.* Document quality is
not evidence for that claim. The probe is.

**Protocol.**

1. **Write ≥5 dilemmas.** Each is a concrete situation where two of the doctrine's values collide
   and the actor cannot ask. Use real shapes from the case log (`deriving.md` §2), not invented
   scenarios — invented ones test the writer's imagination, not the doctrine.
2. **Include ≥1 dilemma the doctrine should NOT decide.** A doctrine that appears to answer
   everything is being read as a Rorschach test. The expected answer for that row is "escalate" or
   "out of scope," and getting a confident answer instead is a finding.
3. **Issue them independently and blind.** One actor per dilemma-run, no shared context, no
   visibility into other responses. Shared context destroys the measurement outright.
4. **Collect every decision BEFORE any comparison.** Each return carries the dilemma id, the
   decision, and the rule the actor believed it was applying. A return with no cited rule is a
   finding: the actor decided on taste, and so will everyone else.
5. **Report divergence as a count, naming the diverging rows.** Not a score, not a verdict.

**Read the result with the asymmetry.**

> Divergence found → the rule is underdetermined. This is a hard signal; act on it.
> No divergence found → **untested-so-far**, and must be reported in those words.

The reason is structural: independent agents drawn from the same model are correlated readers.
Their agreement systematically **overstates** what a human organization would reach, and no amount
of fan-out fixes correlation. Human actors also carry private incentives — career risk, local
optimization — that agents do not simulate; the observed pattern is that a shared default holds in
low-stakes drills and breaks in the live incident precisely where someone's payoff is asymmetric.
Where a dilemma has that shape, mark it and say the probe does not cover it.

**Where divergence came from matters.** Diagnose before fixing:

| Diverging because | Fix in |
|---|---|
| two rules both apply and neither yields | `binding.md` §2 — precedence and same-rank tie-break |
| the rule applies but the trigger is judgment-shaped | `deriving.md` §5.2 — name a checkable fact |
| nobody cited a rule at all | the doctrine does not cover this class; add it or declare it out of scope |
| everyone cited the same rule and read it oppositely | the wording, not the ordering — rewrite as `A > B` |
| the actor knew the rule and chose against it | `binding.md` §1 — there is no binding surface |

**No harness → the same protocol, serial.** Issue each dilemma to yourself in a separate focused
pass and write the decision down before reading the next. The blindness, not the parallelism, is
what makes the measurement valid.

## 2. Rehearsal is part of publishing

A rule is not shared until it is **common knowledge** — until each actor knows that the others
hold it too. Distribution alone does not achieve this, and the failure has a signature: divergence
appears specifically at doctrine *updates*, because each actor suspects the others are still on the
previous version.

Two consequences for the shipping step:

- Budget an acknowledgment or back-brief pass as part of any doctrine change, and treat an
  un-rehearsed change as provisional rather than active.
- Version-lock every change. Two actors citing contradictory text with no way to tell which is
  current is a document defect, not a discipline problem.

## 3. Audit — twelve tells, each checkable in about a minute

Use on a draft, or on a doctrine someone else wrote. Each row is a question with an observable
answer; a row that cannot be answered is itself the finding.

| # | Tell | Ask | Gate it violates |
|---|---|---|---|
| 1 | **Costless virtue** | Negate the sentence. Would anyone here propose the negation? | D1 |
| 2 | **"We do both"** | Find every conjunction of two goods. Which loses? | D1 |
| 3 | **Un-cased rule** | Name one dated decision this reversed. | D4 |
| 4 | **No consequence** | What happens to our best performer who violates this next week? | D5 |
| 5 | **Unpaired cap** | What still rewards exceeding the ceiling? | D5 |
| 6 | **Standard in rule clothing** | Can an actor resolve this from the text before acting? | D3 |
| 7 | **Purpose-as-trigger** | Does the trigger name a fact, or restate the justification? | D3 |
| 8 | **Regime-free** | Would this read identically at any other organization? | D2 |
| 9 | **No retirement trigger** | What observable would tell us this rule is now wrong? | D2 |
| 10 | **No custodian** | Who may change it, and when is it next reviewed? | D2 |
| 11 | **Silent partition** | What do I do if I cannot reach anyone by T? | D6 / `binding.md` §3 |
| 12 | **Deviation invisible** | Where does a legitimate deviation get recorded? | D6 |

Two further checks that are not per-rule:

- **Metric capture.** For every number attached to a rule, name the cheapest way to satisfy its
  letter while violating its intent. If a cheap path exists and stays open, the number is not a
  binding surface; it is a target that will be hit and a purpose that will be missed.
- **Asymmetric enforcement.** A rule phrased bidirectionally that has only ever bound junior
  positions is not bidirectional. Require one recorded instance where it bound the senior party
  against their own preference, or restate it as what it is.

## 4. Red-team lenses — one per agent, never a shared prompt

When the audit fans out, give each agent a DIFFERENT lens and name only the lens, never the
expected finding. A prompt that lists expected findings gets them back.

| Lens | Attacks |
|---|---|
| **Sacrifice** | every rule that names no defeated value, or names one nobody would defend |
| **Grounding** | every rule with no dated reversal case; verify the cited cases are real |
| **Binding** | every rule whose surface cannot be pointed at, and every unpaired cap |
| **Regime** | premises the doctrine assumes without stating; what environment it silently needs |
| **Adversary** | how a motivated actor complies with the letter and defeats the intent |
| **Obsolescence** | which rule is closest to its retirement trigger already, and what would confirm it |
| **Provenance** | every named external doctrine cited: does the promulgated document exist? |

The last lens is not optional when a doctrine borrows authority from a famous one. The dominant
public failure is a name that circulates without a document behind it — the cases are in
`canon.md` §3, and citing one uncritically imports a myth into your own doctrine's foundation.

## 5. Auditing someone else's doctrine — the order that avoids wasted work

1. **Provenance first.** Does the document exist, and is the version you have the current one?
2. **Set size and typing.** Count the rules. Type them. Duplicates surface immediately.
3. **Run the twelve tells** over the whole set, recording which gate each finding violates.
4. **Then and only then** run the DIVERGENCE PROBE. Probing a set that fails the tells wastes the
   probe: you will measure divergence caused by defects you already knew about.
5. **Report findings with the gate**, so the fix is routed rather than argued.
