# The dossier — the default deliverable

Default output is the **full dossier**. Fill every section. Where evidence is thin, **write the
abstention** ("withheld per G3 — Tier-C trait, single sample") rather than manufacturing a
paragraph. A short read is a dossier with honest `withheld` rows, not one with sections removed.

`scripts/dossier-check.sh <file.md>` greps for the required gate headings — run it on a produced
dossier; a missing section = a gate un-passed.

## Required sections (one per gate + the method layers)

```markdown
# Personality read: <name/handle> — provisional case-formulation
_Evidence base: <what you have — e.g. "~40 messages over 3 weeks, 1 context (work Slack)">_
_Purpose (G6): <understand / communicate / self-protect — must be legitimate>_

## Baseline (G1)
<This person's neutral-context normal: pace, message length, warmth, register, emoji/punctuation
habits, typical topics, response rhythm. Idiographic. If you cannot establish one: say so — every
"deviation" below is then unanchored and must be softened.>

## Observations (L1)
<Low-inference cues WITH the triggering stimulus. Clusters (≥2 co-occurring), never a lone tell.
e.g. "went terse + formal + delayed reply when the promotion topic came up (3×)".>

## State vs trait (G2)
<For each pattern: is this state (mood/stress/role) or a stable trait? Single-sample patterns are
labelled STATE. Trait claims cite ≥2 time/context-separated observations.>

## HEXACO estimate (L3 / G3) — confidence-tiered
| Dimension | Read | Tier | Confidence | Evidence (≥2 obs for a trait claim) |
|---|---|---|---|---|
| Honesty-Humility | <…or "withheld — Tier C, needs acquaintance"> | C | low/withheld | |
| Emotionality (N) | <…or "withheld — Tier C, internal, single sample = state only"> | C | low/withheld | |
| eXtraversion | | A | | |
| Agreeableness | <trait-level withhold; but warmth *aspect* is Tier A via IPC — read that> | C | low/withheld | |
| Conscientiousness | | B | | |
| Openness | | B | | |
<Never phrase above the stranger-level ceiling (r≈.4 rich / ρ≈.1–.27 single conversation).>

## Values / attachment / motivation (L4)
<Schwartz values read from what they praise/criticize/sacrifice for/defend. Regulatory focus
(promotion vs prevention → the framing that engages them). Attachment SIGNATURE
(hyperactivating/deactivating/flexible/oscillating) as relationship-specific behavior, NOT a
clinical type; dimensional not categorical.>

## Interpersonal prediction (L5)
<Dominance × warmth placement. Complementarity: where friction is structurally likely (dominant-vs-
dominant, warm-vs-cold), what will feel natural to elicit. Demand-withdraw conflict style.>

## Dyadic read — 相性 (only when TWO people are profiled; method.md §L5-dyad)
<Run the full dossier per person first, then: shared concrete material (callback inventory, in
their own words); values alignment/clash; complementarity fit + structural friction (dominance ×
warmth, tempo); demand-withdraw × attachment pairing risk. MANDATORY ceiling sentence: pre-meeting
相性 is a meeting-viability + friction forecast — relationship variance is largely unpredictable
before interaction (Joel 2017), so never phrase as "deep compatibility confirmed". Dyadic flip
indicators: reciprocated questions, deepening self-disclosure, future hooks from the OTHER side.>

## Competing hypotheses (G5)
<≥2 explanations for the key pattern. Prefer the LEAST-disconfirmed, not the most-confirmed. For
each: the diagnostic evidence, and the INDICATOR THAT WOULD FLIP the read.>

## Barnum filter note (G4)
<Statements struck for failing base-rate/falsifiable/unique/favorability, and why. Proves the
filter ran. If nothing was struck, say what you checked against.>

## How to engage (L6)
<Proactive, relationship-building actions: frame requests in their regulatory fit; appeal to their
actual values; defuse the predicted friction before it happens. Live-test the read with a LABEL or
calibrated question (which also makes them feel understood) — watch for "that's right" (confirmed)
vs "you're right" (your read is off).>

## Ethics & limits (G6)
<Legitimate purpose restated. What is withheld and why. Reversible/falsifiable framing. Explicit:
which parts rest on VALIDATED constructs vs HEURISTIC technique vs must-never-be-science
(no MBTI/microexpression/fixed-type claims here).>
```

## Worked mini-example (abbreviated — shows the discipline, not a full read)

> **Baseline (G1):** In neutral work chat, K writes medium-length messages, warm, uses 2–3 emoji,
> replies within the hour, initiates logistics topics.
> **Observation (L1):** 3× over two weeks, when a teammate's promotion came up, K went terse + dropped
> emoji + delayed reply 6–8h (a cluster, tied to one stimulus).
> **State vs trait (G2):** The promotion-topic cluster recurs across 3 separated instances → beyond
> single-sample state; a stable *topic-specific* reaction. General terseness elsewhere: not observed,
> so no global trait claim.
> **HEXACO (G3):** eXtraversion — moderate-high (Tier A, warmth+initiation+emoji, moderate confidence).
> Emotionality/N — **withheld** (Tier C; the promotion reaction could be envy, insecurity, or a values
> conflict — internal, single-context, can't separate from thin text). Honesty-Humility — **withheld**
> (Tier C, needs acquaintance).
> **Competing hypotheses (G5):** (a) status-anxiety/envy; (b) a fairness/values reaction (thinks the
> promotion was unearned — Schwartz Self-transcendence); (c) unrelated life stressor coinciding.
> Least-disconfirmed currently (b) — K elsewhere praises fairness and criticizes favoritism. **Flip
> indicator:** if K reacts the same way to *their own* good news being discussed, (a) rises and (b)
> falls.
> **How to engage (L6):** Don't probe the promotion directly. Label gently ("sounds like how people
> get recognized here matters a lot to you") and watch for "that's right." If confirmed, K feels seen
> and you've learned a core value to align with — proactive rapport, not surveillance.
> **Ethics (G6):** Purpose = communicate better with a colleague. N and H withheld. Framed as
> revisable hypotheses, not "K is an envious person."
