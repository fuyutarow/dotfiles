# Test and referee — what retires a row, and when a row becomes a task

> **SOLE owner** of gate O3: what qualifies as a retiring observation, the promotion test to `TASK`,
> the referee triple, threshold pre-fixing, and the anti-post-hoc rules. It does NOT own running the
> observation — a cheap deterministic probe goes to a domain or plain executor; one selected expensive
> bet goes to `acting-on-hypotheses`. This file writes the specification; someone else performs it.

## 1. The retiring observation — four conditions

A `RETIRED-BY` cell qualifies only if all four hold. Write the cell before the row's prose; a row
whose observation is invented after the description is a description looking for a justification.

1. **Performable by someone.** Name who could make it with what they already have. "Someone proves the
   theorem" is not performable; "run the r=1 vs r=max comparison the position says is missing, on the
   existing fixture" is.
2. **Cheaper than the work it gates.** The observation exists to make the risky move cheap. If the
   observation costs as much as the thing it decides, it is not a discriminator — it is the project.
3. **Discriminating.** Its outcomes must point to *different* next states. Write both: what a pass
   licenses and what a fail licenses. If both outcomes lead to the same next action, the observation
   is decorative and the row is not yet an opening.
4. **Pre-declared.** State the outcome that counts as retirement before anyone looks. An outcome
   written after observation is a narrative, not a threshold.

## 2. What is NOT a retiring observation

| Non-qualifying form | Why | Where it goes |
|---|---|---|
| "More research is needed on X" | names no observation, no performer, no outcome | reformulate, or drop |
| "When the primary source becomes reachable" / "when the paywall lifts" | a world-condition nobody here can act on | `systematizing-knowledge` living-update procedure (`references/delivery.md` §9) |
| "When someone publishes a comparison" | delegates to an unnamed future author | reformulate as the comparison *we* could run, or route as a world-condition |
| "Benchmark it properly" | no fixed criterion, so no outcome can be pre-declared | promote to `TASK` with a referee, or drop |
| "Ask a model whether these are related" | a judgment, not an observation; agreement is not evidence in this population | forbidden — see the deny-list |
| "Do a deeper literature search" | this is corpus work, and it changes the position | `systematizing-knowledge` |

The second and third rows are the specific failure this skill exists to catch. A survey that lists
world-conditions in the place where openings belong has produced a knowledge state and no action
state.

## 3. Promotion to `TASK` — the referee test

Ask one question: **could someone else's output be scored against a fixed criterion without consulting
us?**

- **Yes** → the row must be promoted to `TASK`. This is not optional. A refereed task is the strongest
  row type available, and a `GAP` that could carry a referee and does not is under-specified.
- **No** → the row stays `GAP`, `CONTRADICTION`, or `NON-ADJACENCY`, and the `RETIRED-BY` cell carries
  the observation instead.

The promotion test is mechanical on purpose. It asks about *scorability by a third party*, never about
importance, tractability, or stakeholder value — which `systematizing-knowledge`
`references/delivery.md` §5 owns as judgments rather than properties extracted from the literature.
This skill inherits that prohibition and does not restate it.

## 4. The referee triple

A `REFEREE` cell carries three parts, after the Common Task Framework's ingredients (Donoho 2017,
crediting Liberman; verification class `SECONDARY-SUMMARY` — see `references/sources.md`):

| Part | Contract |
|---|---|
| **Input** | the exact material an attempt starts from — a dataset, fixture, corpus slice, formal statement, or reproducible generator. Named by locus, not described |
| **Interface** | what an attempt must produce for scoring to be possible: the output's form, not its method. The referee never constrains how |
| **Sequestered check** | the criterion and the data or cases the criterion runs on, held back from the attempt. Plus the fixed threshold |

If the check cannot be sequestered — because the criterion is the same material the attempt sees —
say so on the row. A non-sequestered referee is still useful and is weaker; it must not be described
as one.

## 5. Threshold discipline — the anti-post-hoc rules

- The threshold is written **into the row** before any attempt exists, and is part of what the floor
  script checks for presence.
- A threshold may be **raised** only by retiring the row and opening a new one that cites it. It is
  never edited in place after an attempt, and it is never lowered.
- The referee is written by whoever writes the row, and it is not revised in response to an attempt.
  A referee adjusted after seeing an attempt has scored nothing.
- If an attempt reveals the referee was malformed — it cannot be run, or it scores something other
  than what the row asked — the row is retired `WITHDRAWN` with the defect stated, and a new row
  replaces it. Silently repairing the referee destroys the record of what was actually asked.

## 6. Evidential ceiling — what a retirement may claim

A retirement closes a row. It does not, by itself, change the signed position.

| Retirement | What it licenses | What it does not |
|---|---|---|
| `RETIRED-BY-EVIDENCE` | the observation was made and the pre-declared outcome occurred | it does not add, upgrade, or negate a claim in the position — that requires the corpus owner to re-run its own gates |
| `SUPERSEDED` | a later position or a broader row covers this one | it does not imply the question was answered |
| `EXPIRED` | nobody acted before the date | it says nothing about the question's value, and it is not an incident |
| `WITHDRAWN` | the author pulled it, or the referee was defective | it is not an error, and the reason is recorded |

The one-way gate: a row may cite the position; the position may never be edited from a row. When a
retirement genuinely should change what is believed, hand the observation to
`systematizing-knowledge` as evidence and let it re-sign — that is the only path by which belief moves.
