# Anti-patterns — self-audit: observable TELL + recovery for every misuse mode

> Scope: in-skill MISUSE diagnostics only (the decks' 「ないとき / 下手」 columns). Each row has an
> **observable TELL** (something you can detect in your own output) + a **recovery**. This file is
> distinct from `boundaries.md` (external/inter-skill routing) and from the three verb files (which hold
> *correct* technique; their per-file tables catch phase-local slips — this file is the consolidated
> whole-skill self-audit, including the GATE-level and cross-phase failure modes those files cannot see).

Run this list on your own output before declaring a Map/Loop/Leap cycle done.

## The eight named misuse modes

| # | mode | observable TELL | recovery |
|---|---|---|---|
| 1 | **Freeze / over-ask** | you asked the user a clarifying question, or said "let me research more", about something you could instead cheaply TEST | R1: convert the "I'm not sure" into a NAMED node (確信度×影響度) + the single cheapest discriminating action. Uncertainty is a test coordinate, not a reason to ask. |
| 2 | **Big-bang on unvalidated assumptions** | you built/committed code/design/decision at full scale on a load-bearing node with NO written pre-test threshold | R2: stop; write the pass/fail threshold; run the cheapest test FIRST. Felt confidence ≠ earned confidence. |
| 3 | **Vanity test** | the two "next action" cells of your discrimination table are identical | R3: do NOT run it (zero 学び). Find a test whose two outcomes fork the next action, or admit nothing testable is uncertain here. (`loop.md` §2) |
| 4 | **Endless Loop** | still testing a node whose 確信度 is already decision-sufficient (fatal risk retired) | STOP — this is analysis-paralysis in a Loop costume. Force the Leap. (`loop.md` §6) |
| 5 | **Endless Map** | polishing the hypothesis tree, no test has run yet | time-box the Map, STOP, hand the load-bearing node to Loop. (`map.md` §4) |
| 6 | **Reckless irreversible Leap** | you committed a one-way door (irreversible/unbounded loss) at mid 確信度 | demand more Loop OR restructure into staged/reversible (two-way-door) commits. (`leap.md` §4) |
| 7 | **Small-bet disease** | you defaulted to the safe small bet — 君の仮説は小さくまとまっているね | re-evaluate weighting **影響度** (確信度は後で上げられる, 影響度は上げづらい); resist the default. (`leap.md` §2) |
| 8 | **Felt-Loop on an unrunnable node** | you re-ran a "loop" with no access to the real signal, hoping it turns | the node is not falsifiable here: switch it to DIALOGUE/CO-CREATION-mode, or escalate that access/location is the blocker — 回らないなら、いる場所が悪いのかも. (`loop.md` §7) |

## Five structural anti-patterns (the GATE + cross-phase modes the verb files cannot self-detect)

| mode | observable TELL | recovery |
|---|---|---|
| **Be-bold theater (over-firing)** — the PRIMARY liability | you ran the three-phase ceremony on routine / deterministic / known-method work | STEP 0 GATE: fire ONLY when a load-bearing belief is untested AND expensive (>~1 reversible session) or hard-to-reverse work rides on it. Otherwise use the domain/plain executor and return the raw result + provenance to directing-research-sections. |
| **Relabeling present-understanding as a Loop** | you "Looped" something that was actually citing a fixed present fact (no confidence-delta on an undecided outcome) | that was a resolution gap: route to raising-resolution (or the inline fallback in `boundaries.md`). Do not call inspection a Loop. (the cut: `boundaries.md` §1) |
| **Cheap probe laundered into Leap** | a bounded reversible one-session trial was given a Map/Loop/Leap wrapper only because you might keep its output | route it to the domain/plain executor; return `EXECUTOR RESULT` to directing-research-sections. AOH is for expensive/irreversible work riding on the result. (`boundaries.md` §3) |
| **OPEN residual absorbed into the tree** | an incoming `OPEN` item became a premise/node/confidence, or lost its provenance/reopen trigger | restore the unchanged pass-through; if its trigger fired, emit `FRAME-BREAK primary=OPEN` and return to directing-research-sections. If the mandate is exceeded, only its typed `SECTION_REOPEN_REQUEST` may ask the Programme Supervisor to reopen. (`map.md` §6 / `loop.md` §5) |
| **Confidence laundered through a subagent** | at LEAP time, the load-bearing node's 確信度 traces back to an agent's report — no raw signal you adjudicated exists in context (a cross-phase leak Loop's own table can miss once the moment has passed) | revert the value; re-run the probe under the `loop.md` §8 contract (raw signal + locus, adjudicated by you) BEFORE staking. |
| **Source-success laundering** | a transfer candidate's donor result, a surface similarity, or a fluent analogy is recorded as the target node's pass | restore `target-side evidence: UNTESTED`; run a target-side discriminating test and return `TARGET RESULT` with candidate ID, observation, prewritten threshold, and locus to directing-research-sections (`loop.md` §3). |
| **Loop-created mapping break** | a negative target result is renamed `MAPPING-BREAK`, or Loop declares the correspondence invalid | retain the target result as an execution record. If it calls the correspondence into question, request a new mapping assessment from `forging-novel-theses`; only that skill may emit `MAPPING-BREAK`, and directing-research-sections records local `MAPPING_TRANSFER_DISPOSITION` (`loop.md` §3). |

## The recap anti-pattern (what this skill must not become)

Reciting 馬田『仮説行動』 back to the user (Lean Canvas walkthroughs, the startup examples, the book's
TOC) is itself a misuse: the book is **lineage, not content to recite**. The contribution is the verb-seam
MECE + R1/R2/R3 artifact rules + the inter-skill cut. If your output is a book summary rather than a
Map/Loop/Leap cycle with the named artifacts (a tagged node, a discrimination table, a WIN/KILL/LOSS
triple), you have produced the recap anti-pattern.
