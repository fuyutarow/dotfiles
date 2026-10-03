# Boundaries — ROUTING & external positioning (no phase technique lives here)

> Scope: where this skill sits relative to raising-resolution, surfacing-blind-spots, the other repo skills, and
> external frameworks. This file owns the inter-skill cut, co-fire arbitration for braided tasks, the
> inline-resolution fallback, and the external-lineage differentiation. It contains NO phase technique
> (that is `map.md` / `loop.md` / `leap.md`) and NO in-skill misuse diagnostics (that is `anti-patterns.md`).

## §1 — The cut vs raising-resolution: VERB + OBJECT, not the shared noun "hypothesis"

The two siblings are complements along the **axis of time**. They share the word 仮説 / "hypothesis"
and the token 仮説検証, so the cut is NOT lexical — it is by **what you must DO to the OBJECT**:

| | raising-resolution | acting-on-hypotheses |
|---|---|---|
| purpose | 現状理解の明晰さ — sharpen the view of a **present, knowable** reality | 不確実な未来への前進 — bet/act on an **undecided future** |
| OBJECT | a **FIXED fact** that already exists | a **confidence-delta on an outcome that does not exist yet** |
| VERB | **INSPECT** to cite it (Read a line, run a command, fetch a source) | **ACT** to earn it (run the cheapest discriminating test) |
| load-bearing rule | CITATION GATE (can you cite an observation?) | THE LAW (Map → Loop → Leap; no big-bang on untested nodes) |

### The trigger-time test (sharper than the noun-level gate)

The SKILL.md gate phrases it as "could a smart person, given enough primary info about what ALREADY
EXISTS, know the answer?" — that is the noun-level cut. The **sharper, fire-time** form is verb+object:

> **Is the missing thing a FIXED fact you can cite by LOOKING** (→ raising-resolution) **— or a
> confidence-delta on an outcome that does not exist yet until you ACT** (→ acting-on-hypotheses)?

Clean cases: unclear bug / vague spec / unfamiliar codebase / "what do users do today" = fixed fact →
raising-resolution. "should we commit to X" / "size this bet" / "set a kill condition" = forward bet →
acting-on-hypotheses.

## §2 — Braided tasks LEGITIMATELY co-fire — the ordering rule (the most frequent real case)

The highest-frequency trigger — **"will this approach scale / work?"** — is **braided**: it has a
present-knowable half AND a forward-bet half. Both siblings fire legitimately. They **STACK
sequentially, they do not race**:

> **raise-resolution FIRST (cite the present), THEN acting-on-hypotheses (Loop the forward bet).**

### Worked example — "will this architecture scale?" on an unfamiliar codebase

1. **raising-resolution (present half):** Read the hot path, run the profiler, grep the ORM calls,
   measure current latency, name the real bottleneck — all FIXED facts, cite each. (This is its §3 N+1
   exemplar exactly.) Output: "current p99 = 180ms, bottleneck = the per-row SELECT at `repo.ts:88`."
2. **Gate the forward half by downstream exposure:** the residual gap — "does it hold at 10× load?" —
   is NOT a fixed fact. If the load run and the decision riding on it are bounded/reversible within one
   ordinary session, a domain/plain executor runs it and returns the raw result + provenance to
   `directing-research-sections` under the current mandate and charter. If an untested node guards an expensive migration or hard-to-reverse
   commitment, **acting-on-hypotheses** fires: Map the node ("the batched query holds at 10× load",
   確信度×影響度), Loop the cheapest discriminating test with a pre-committed threshold, then Leap.

Doing step 2 BEFORE step 1 is the error: you would Loop a bet whose present constraints you never cited
(a felt-Loop on an un-inspected node). Doing step 1 and stopping is the *other* error: you cited the
present and never crossed to the forward bet (over-staying in raising-resolution — the leak this skill's
reciprocal pointer in raising-resolution §4 is meant to catch).

## §3 — The inline-resolution FALLBACK (when raising-resolution is NOT loaded)

When STEP 0's cut routes to "present-understanding gap" but raising-resolution is not available, do a
**bounded inline resolution pass** here — do NOT relabel it a Loop:

1. Take the cheapest action-ladder rung that turns the unknown into an OBSERVED fact:
   `grep/glob → read the file/source → run / probe / log / measure → reproduce n=1 → web-fetch → ASK`.
2. Stop at **ONE citation** for the blocking claim (sufficient, not maximal).
3. Return to STEP 0 with the present now grounded; re-run the cut. If a forward-bet residue remains,
   NOW it is a Map node.

This fallback is bounded and citation-gated precisely so it does not silently become a Loop. The moment
you are running a test to earn a confidence-delta on an undecided outcome (not citing a fixed fact), you
have left the fallback. It enters Loop only when expensive-or-hard-to-reverse work rides on the
load-bearing result; otherwise use the cheap executor return below.

### The cheap-executor return — no ceremonial one-tree bet

When a future-facing probe is deterministic/known-method, bounded, and reversible inside one ordinary
session **and no expensive/irreversible work rides on its result**, route it to the domain owner or plain
executor. The executor returns:

`EXECUTOR RESULT: <raw observation> — provenance=<command/source/locus>`

That artifact returns to `directing-research-sections`, which owns its local handling under the current
`SECTION_MANDATE` and `SECTION_CHARTER`.
Do not invent a Map, pass/fail table, confidence write, or Leap. A cheap discard-intent test that protects
a later expensive/irreversible commitment is different: AOH legitimately designs/adjudicates that Loop;
the domain executor may perform only its contracted B→M work (`loop.md` §8).

## §4 — Repo neighbors (no overlap; differentiated by OBJECT + OWNERSHIP)

| skill | its object | relation |
|---|---|---|
| **raising-resolution** | a fixed present fact | complement along time; interlocks at the Map seam (§1–§3); reciprocal pointer in its §4 |
| **surfacing-blind-spots** | hidden premises and human tacit constraints in one existing plan/frame/tree | **VERB**: an explicit EXPOSE ask goes there even after tree selection; HERE resumes only to STRUCTURE already-explicit nodes, TEST, or COMMIT. Human answers marked `UNELICITED` cannot become Map nodes as facts; incoming `OPEN` stays a provenance/reopen-trigger-bearing pass-through |
| **directing-research-sections** | one current `SECTION_MANDATE` / `SECTION_CHARTER`, local admission, local evidence handling, and declassified return | **CARDINALITY/PURPOSE**: ONE selected tree enters HERE only under the current mandate and charter when an untested load-bearing result guards expensive/irreversible work; its per-test threshold/outcome/commit/kill stay HERE. Cheap bounded probes and AOH's `TARGET RESULT`, `FRAME-BREAK`, and triggered `OPEN` return there. It records local `MAPPING_TRANSFER_DISPOSITION`; a frame break exceeding the mandate may become a typed `SECTION_REOPEN_REQUEST`, never a programme enactment. |
| **supervising-research-programmes** | programme problem landscape/construction/formulation, OPEN_ISSUE portfolio, multiple independent bets, and global ADOPT/RETIRE/REOPEN | **CARDINALITY/PURPOSE**: programme-level choice or enactment → there. It receives no raw result, `FRAME-BREAK`, `OPEN`, or method content from AOH. Only a declassified `SECTION_REOPEN_REQUEST` may ask it to reconsider a programme boundary; only its `PROGRAMME_DECISION` may enact reopening. |
| **forging-novel-theses** | candidate genesis for a selected local problem/frame, including source→target mapping and the SOLE `MAPPING-BREAK` emission | **DECISIVE**: no thesis or no correspondence map yet → there; a selected transfer candidate enters HERE only when an untested target-side load-bearing result guards expensive/irreversible downstream exposure. HERE returns `TARGET RESULT` to `directing-research-sections`, never a mapping verdict. If the result calls correspondence into question, request a fresh assessment there; only that skill may emit `MAPPING-BREAK`, which the Section Director records in local `MAPPING_TRANSFER_DISPOSITION`. Donor success never substitutes for a target-side test; otherwise use the domain/plain executor. |
| **systematizing-knowledge / sok** | MANY papers → ONE defensible position (claim ledger) | acting-on-hypotheses borrows only its grep-able-ARTIFACT discipline as a structural mirror; it does not synthesize a corpus. The bare token "survey" is sok's. |
| **arguing-research-papers** | one finished evidence-backed manuscript claim | test an expensive/irreversible future bet HERE; run a cheap reversible probe with the domain/plain executor; argue completed evidence there |
| **orchestrating-agents** | role topology, evidence visibility, veto timing, verification, acceptance | the one-tree decision artifacts stay HERE; multi-agent control may co-fire around probes |
| **growing-oss-adoption** | making a specific OSS spread (distribution > love) | an OSS bet enters HERE only at the expensive/irreversible hard gate; cheap trials use the domain/plain executor, while adoption tactics stay with growing-oss-adoption |
| **operating-the-harness** | `.claude`/config & harness engineering | orthogonal; a harness change still uses the GATE but defers config technique |

**Precedence.** Domain-neutral and UPSTREAM of execution; defers to any domain owner (writing-julia /
proving-theorems / growing-oss-adoption / operating-the-harness) for HOW. Owns only the selected
expensive/irreversible one-tree bet's threshold, adjudication, and commitment — not routine execution.

## §5 — External frameworks: LINEAGE, not loaded skills (cannot co-fire — keep SHORT)

None of these are SKILL.md files in this repo, so they **cannot mechanically double-fire**. This is
differentiation-for-the-reader, not routing — one line each, do not bloat:

| framework | relation / what this skill adds |
|---|---|
| **lean / Build-Measure-Learn** (Ries) | Loop **IS** BML (direct lineage, planned L→M→B). This skill ADDS the **Map front** (draw the whole tree, name the load-bearing node first) and the **Leap back** (the evaluated, win/kill/loss-gated commit) that bare BML lacks. |
| **OODA** (Boyd) | a fast situational-adaptation cycle; Loop is near-kin, but OODA has **no explicit Map pre-design** and **no long-horizon high-影響度 Leap**. |
| **仮説思考** (内田和成 / BCG) | optimizes **THINKING speed** (early answer-guessing). This skill's thesis is **行動**: 行動なくして良い仮説なし — earn confidence by ACTING, not by pondering harder. |
| **effectuation** (Sarasvathy) | 許容可能な損失 / レモネード is kin to Leap's survivable-loss cap and learn-by-acting, but this skill keeps a **goal-directed 仮説 (○○課題×××解決) 骨格** (causation-leaning), where effectuation fixes means not ends. |

> Honesty: the book itself is *lineage, not content to recite*. The contribution of THIS skill is the
> verb-seam MECE (Map/Loop/Leap by verb) + the three artifact-emitting rules (R1/R2/R3) + this
> inter-skill cut — NOT a recap of 馬田『仮説行動』.
