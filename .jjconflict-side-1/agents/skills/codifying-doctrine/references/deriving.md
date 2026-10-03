# Deriving — where the rules come from (pipeline steps 1–5, 10)

> **Scope**: SOLE home of STEP 0's detail, decided-case mining, REGIME derivation, the negation
> test, the RULE-vs-STANDARD choice, and set sizing. What makes a rule BIND is
> `references/binding.md`; how a draft is tested is `references/testing.md`; every source cited
> here is graded in `references/canon.md` and never re-argued.

## 1. STEP 0 in detail — the four ways the gate fails

The parent SKILL.md carries the gate. This section carries the diagnosis when it fails, because
the failure mode determines the route and the route is what you deliver.

| Failure | How to detect it in one question | What to deliver instead |
|---|---|---|
| **Not recurring** | "How many times in the last year did someone actually face this?" — answer of 0 or 1 | the decision itself, plus a note to revisit at N=3 |
| **Not contested** | "Name someone who would argue for the other side, and what they would say." — silence | a one-line convention; no gates, no table |
| **Not a trade-off** | "What is lost by always choosing A?" — answer is "nothing" | a guardrail: it belongs in a lint, a hook, or a checklist |
| **Not partition-bound** | "Could they just ask?" — yes, cheaply, in time | fix the channel; doctrine is the expensive substitute for a channel |

The fourth row is the one models skip. Doctrine exists because **agreement cannot be guaranteed
over an unreliable channel** (the coordinated-attack result, `canon.md` §1). Where the channel
works, a channel is cheaper than a doctrine. Where it does not, no amount of channel investment
helps and the entire cost moves to the shared prior.

## 2. Mine decided cases FIRST — the anti-invention rule

**A model asked to write a doctrine will invent the trade-off from taste.** That is the second
dominant failure of this skill (the first is over-firing). The correction is mechanical: the rules
are read OUT of what the organization already did under pressure, not written INTO it.

Harvest, in this order — stop as soon as you have 3 real cases per candidate rule:

1. **Reverted or re-litigated decisions.** A revert, a rollback, a decision remade six months
   later, an argument that recurred with the same two positions.
2. **Incidents and postmortems.** What did people actually do when the plan broke and nobody
   was reachable? That behavior IS the current de facto doctrine — write it down before
   proposing to change it.
3. **Escalations.** Every escalation is a missing tie-break. Ask what the escalation was
   deciding between.
4. **Refusals.** Things the organization declined that others in its position accept. That is a
   sacrifice already being paid, usually unstated.
5. **The repo itself.** Commit messages that argue, config that encodes a preference, hooks that
   deny something. In this repository the live worked example is `~/.claude/CLAUDE.md`: five
   hook-enforced rules, each stating a value trade with a named enforcement mechanism.

For each candidate rule, the harvest must produce the D4 artifact — and specifically **one case
the rule would have REVERSED**. A rule that only ratifies what everyone already wanted is not
binding on anything. If no reversal case exists, the rule ships labeled 願望.

Cheap elicitation script when no artifact exists (the source is the user's head):

- "Tell me about the last time two people here made opposite calls on the same kind of problem."
- "What do you refuse to do that your competitors do?"
- "When the plan broke last time, what did people actually do?"
- "Which argument keeps coming back?"
- "Name a decision you'd make differently now, and what you'd have had to give up."

Cap the interview at the questions that BLOCK writing. Do not run a questionnaire.

## 3. REGIME — derive the rule from the binding constraint

A doctrine is not an ideal. It is what survives a specific scarcity. Name the constraint, then the
rule follows and its expiry becomes obvious.

| Constraint | Rule shape it forces | What it stops working against |
|---|---|---|
| Cannot confer in time | pre-declared default on silence; one main effort | a slow, high-stakes decision where waiting is cheap |
| Few people, cannot hire | hard headcount cap + reward decoupled from headcount | work that structurally needs more hands |
| Adversary adapts to you | secrecy/access as a scarce resource; short cycles | an environment with no adversary, where diffusion beats secrecy |
| Errors are expensive and late-detected | stop-right at the point of detection | high-throughput work with cheap, reversible errors |
| Bounded context / lossy handoff | redundant intent (purpose + key tasks + end state) | co-located actors sharing full state |
| Reversibility is unknown | classify by reversibility before routing weight | domains where everything is one-way |

**Write the constraint sentence into the doctrine.** It is what makes D2's retirement trigger
writable: the rule retires when the constraint that produced it ends, and that end is observable.

Rules that name no constraint are the ones that get cargo-culted into organizations that do not
share it — the documented mechanism behind most imported-doctrine failure (`canon.md` §3).

## 4. The negation test — what earns a place

For every candidate rule, write its literal negation. Then ask: **would anyone in this
organization seriously propose the negation as policy?**

- No → the rule carries no information. Demote it to a 最低基準 appendix, or cut it.
- Yes → keep it, and name the person or faction who would argue that side. That name goes in the
  `defeated value` column, because it is what you are overruling.

Worked contrasts:

| Fails | Passes |
|---|---|
| "We value quality." | "We ship two weeks late rather than skip the security review." |
| "Move fast and be careful." | "We accept a 2% regression rate to keep weekly releases." |
| "Respect the customer." | "We refuse the feature the largest customer asked for if it breaks the API contract." |
| "Use good judgment." | "Below the waterline, consult first; above it, act and report." |

The dominant public failure is the third row of the wrong column: **"we do both A and B."** A
conjunction of two goods with no ordering rule is not a doctrine — it is the conflict, restated.

## 5. RULE or STANDARD — decide by frequency, not by topic

The only real distinction: **is the clause's content settled BEFORE the actor acts, or afterwards
by an adjudicator?** (Kaplow; `canon.md` §2). Everything else follows.

| Choose | When | Cost you are accepting |
|---|---|---|
| **RULE** (bright line, resolvable from text) | the situation recurs often AND the fact patterns are similar | it will be wrong in known edge cases — deliberately |
| **STANDARD** (resolved after, by a named adjudicator) | the situation is rare OR the fact patterns vary wildly | per-case cost, and divergence until the adjudicator rules |

Two drafting rules follow, both checkable:

1. **Invest precision in proportion to frequency.** A high-frequency clause earns sub-cases,
   because the drafting cost amortizes. A rare clause does not — leave it a STANDARD.
2. **The trigger must name a FACT, not the rule's own purpose.** "If the change touches auth" is a
   trigger. "If the change is risky" re-imports the judgment the rule was supposed to remove.
   A clause whose trigger restates its justification is a STANDARD wearing a RULE's clothes.

**A rule's over- and under-inclusiveness is the design, not a defect.** It will decide some cases
wrongly; that is the price of deciding them before they arrive. Therefore: do not carve the
exception into the rule's text. Keep the text entrenched and send the known misfires to the
single-exception register (`binding.md` §4). Editing the rule case-by-case is how a doctrine
quietly becomes a standard while still being cited as a rule.

## 6. Set size and typing — growth must cost something

- **Type every rule** as one of: boundary (what we never do) · prioritizing (which comes first) ·
  stopping (when to quit) · how-to · timing · coordination. An untyped set hides duplicates.
- **Cap the set at what one actor can recite.** No validated number exists — treat sharp growth
  past roughly 7 as a flag requiring justification, and say plainly that the cap is a memory
  argument, not a measurement (`canon.md` §2, graded `constructed`).
- **Every addition forces a merge or a retirement.** Check each candidate against the existing
  set: if it never conflicts with an existing rule, merge it in; if it always conflicts, the
  resolution rule is what you write, not a second co-equal item.
- **Never publish two co-equal top priorities.** Divergence spikes precisely where two named
  "top priorities" compete, because the doctrine did not remove the choice it claimed to remove.

## 7. Anti-patterns (TELL → fix)

| Anti-pattern | TELL | Fix |
|---|---|---|
| **Invented trade-off** | the rules read well and no case log exists; the author cannot name who would argue the other side | §2 — mine decided cases; ship un-cased rules as 願望 |
| **Regime-free universal** | the rule would read identically in any organization | §3 — name the constraint, or accept that you copied someone else's |
| **Permission-to-play as core** | bare nouns: integrity, quality, excellence, safety | §4 negation test — demote to a 最低基準 appendix |
| **"We do both"** | a conjunction of two goods with no ordering | §4 — attach the ordering or the if-then resolution |
| **Purpose-as-trigger** | "if it is risky / inappropriate / significant" | §5.2 — name a checkable fact |
| **Silent exception erosion** | the written rule and actual practice have quietly diverged | §5 — entrench the text, register the misfires (`binding.md` §4) |
| **Additive growth** | the set grew every time an incident was discussed | §6 — merge-or-retire on every addition |
