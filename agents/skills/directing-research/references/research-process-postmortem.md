# Research-process postmortem — semantic retrospective judgment

> **Sole home**: semantic judgment of a completed, failed, stopped, or aborted research episode.
> This mode audits the research process separately from its outcome, then chooses a semantic state
> update and a programme disposition. It does not own document lifecycle, agent control, or
> cross-session transport.

## 1. Function and fire gate

```text
completed | failed | stopped | aborted research episode
+ frozen RUN INTENT(s) + terminal RUN RECEIPT(s) + current frame
  -- compare expectation, controls, missingness, alternatives, and process integrity -->
RESEARCH PROCESS POSTMORTEM
  = RETROSPECTIVE JUDGMENT + updated RESEARCH JUDGMENT SPEC
  --> TRANSITION: tree | thesis | problem | portfolio | finished claim | no change
  + EPISODE_DISPOSITION: PERSIST | PAUSE | RETIRE | REOPEN
```

Fire this mode for a retrospective judgment about how a research episode was framed, generated,
selected, tested, interpreted, or learned from. Ordinary progress, problem formulation, and one new
result stay on the low-ceremony creative-research loop. A generic software incident review is outside
this Skill.

Use the shipped components rather than restating their schemas:

- create prospective records from `assets/RUN-INTENT.md` before relevant access or execution;
- close every run in the declared denominator with an immutable `assets/RUN-RECEIPT.md`, including
  failed, stopped, aborted, and excluded runs;
- create the semantic verdict from `assets/RETROSPECTIVE-JUDGMENT.md`;
- run `scripts/research-run-check.ts` on the joined artifacts before semantic adjudication.

The checker is a floor, not the judgment. File names, field grammar, identifiers, digests, and join
rules belong to those components. This reference owns what the checked record means for research.

## 2. Prospective evidence and historical limits

A `RUN INTENT` is prospective only when frozen before the data, result, reviewer signal, or execution
surface it governs becomes available. Never reconstruct a prediction, threshold, alternative, or
decision rule after seeing the outcome and label it prospective.

A terminal `RUN RECEIPT` is an append-only account of what happened. Join receipts to every admitted
intent and keep the declared denominator visible. A missing receipt is missing terminal evidence, not
permission to drop the run.

Historical episodes may lack these artifacts. Give the postmortem an overall evidence status:

- `PARTIAL` when public artifacts support some lens judgments but the prospective boundary or terminal
  coverage is incomplete;
- `UNAUDITABLE` when the available record cannot support a truthful process judgment.

The structural set equations remain exact even for historical evidence. `AUDITABLE` requires
intents = receipts = `RUN_IDS` and no missing list. `PARTIAL` requires `RUN_IDS` = supplied intents
and missing = intents minus receipts. `UNAUDITABLE` requires supplied intents to be a subset of
`RUN_IDS` and missing = `RUN_IDS` minus supplied receipts; every supplied receipt still joins to a
supplied intent and its exact-byte digest. Thus a judgment-only reconstruction marks every listed
run missing rather than implying unprovided terminal evidence exists.

Do not fabricate a cleaner history to escape either status. Within a partial audit, use
`NOT-EVIDENCED` for each unsupported lens. `UNAUDITABLE` still permits a bounded repair such as
prospective registration for the next episode; it does not license a verdict about the past one.

Only public task artifacts and decisions may enter the record. Exclude raw chain-of-thought,
conversation transcripts, prompt or control text, credentials, secrets, and private memory.

## 3. Semantic lenses — process is not outcome

Audit every applicable lens separately. Use only `EVIDENCED`, `VIOLATED`, `NOT-EVIDENCED`, or
`NOT-APPLICABLE`. Each lens judgment must carry an evidence locus, the consequence for the research
decision, and a repair or earliest-stage reopen action. A locator proves where a statement came from;
it does not by itself prove causality, independence, or scientific importance.

| Lens | Semantic question |
|---|---|
| **Frame/problem co-evolution** | Did observations have a declared route to revise the object, relation, regime, value, action, or problem frame? |
| **Generation/evaluation separation** | Was the candidate denominator frozen before comparative evaluation or veto-bearing critique began? |
| **Terminal denominator** | Does the account retain every admitted run and every failed, stopped, aborted, or excluded terminal state with its reason? |
| **Premise and alternative breadth** | Were load-bearing premises and live alternatives explicit enough that one favored account did not silently become the whole search space? |
| **Discriminating action** | Did registered outcomes imply genuinely different next actions, rather than a vanity check whose pass and fail both preserve the same decision? |
| **Surprise uptake** | Before treating surprise as discovery or frame evidence, were controls, leakage, missingness, instrumentation, and artifact alternatives checked? |
| **Audit independence** | Is there evidence that the load-bearing result was not certified only by its generator, with the required frozen evidence surface and hostile lens preserved? |
| **Negative-result retention** | Are nulls, failed transformations, mapping breaks, exclusions, and stopped runs retained without being generalized beyond the tested family? |

Judge process and outcome on separate axes. A favorable outcome cannot repair a process violation.
An unfavorable outcome does not prove the process failed. Do not average the lenses, emit a creativity
score, or claim that the episode proves creativity.

## 4. Retrospective judgment and transition

Complete `assets/RETROSPECTIVE-JUDGMENT.md` only after the structural floor passes or its bounded
failure is recorded. The signed judgment must:

1. preserve every lens verdict and its evidence boundary;
2. distinguish an observed association from a supported causal consequence;
3. state which current research conclusion remains licensed;
4. update the existing `RESEARCH JUDGMENT SPEC` rather than creating a second program authority;
5. choose exactly one value on each judgment axis;
6. argue why the two values are compatible with the evidence and current program state.

The two axes answer different questions:

- `TRANSITION` selects the semantic research-state update: tree update, thesis regeneration,
  problem reconstruction, portfolio update, finished claim, or no change.
- `EPISODE_DISPOSITION` selects the programme action: `PERSIST`, `PAUSE`, `RETIRE`, or `REOPEN`.

The axes are independent but not semantically arbitrary. Argue their compatibility from the lens
evidence, the conclusion that remains licensed, and the updated `RESEARCH JUDGMENT SPEC`. The checker
verifies only that both fields exist and use allowed enum values. It does not judge whether their pair
is coherent. Structural acceptance therefore cannot substitute for the compatibility argument.

Use the episode dispositions this way:

- `persist` — the process evidence licenses the current frame and the next uncertainty is reachable;
- `pause` — access, instrumentation, missing terminal evidence, or audit independence blocks the next
  discriminating step; name an observable reopen condition;
- `retire` — evidence bounds a tested family or route tightly enough to stop repeating it; retain all
  negative evidence and state the boundary;
- `reopen earliest research stage` — a violation or controlled surprise invalidates an earlier
  dependency; return to the earliest affected stage in the Stage diagnosis table.

Outcome valence is never the transition rule. A positive but process-invalid run may reopen. A negative
but informative and well-controlled run may support persist, bounded retirement, or a later-stage reopen.

## 5. Ownership cuts

- `directing-research` owns the semantic lens verdicts and the research transition.
- `governing-research-documentation` owns durable admission, authority, review, retention, retirement,
  and deletion of the resulting files. It never changes a semantic verdict.
- `orchestrating-agents` owns bearers, visibility, veto timing, verification, acceptance, and only
  dispatch/pacing/delegation postmortems. Its records may supply cited control-plane evidence here;
  they do not decide the research transition.
- `continuing-long-running-tasks` may transport artifact loci across sessions. It never copies the
  research evidence or makes the retrospective judgment.

If one request mixes these concerns, run this semantic judgment first from the frozen domain artifacts.
Then apply the control-plane overlay, durable document transition, or continuation transport owned by
the corresponding sibling. Co-firing never creates joint ownership.

## 6. Checker and harness boundary

`scripts/research-run-check.ts` may check fields, hashes, enums, identifier joins, terminal coverage,
and known privacy-pattern violations. It cannot judge creativity, causal validity, the importance of a
surprise, true actor independence, or completeness outside the declared coverage.

The loader refuses static final-component and ancestor symlinks, opens one no-follow handle where the
platform supports it, compares pre-open and handle identity, bounds both stated and actually read bytes,
and hashes the bytes read from that handle. This is not a proof against a same-UID actor replacing an
ancestor during resolution, nor can platforms without no-follow semantics provide the same race bound.
Keep evidence directories non-writable by untrusted concurrent actors when that distinction matters.

Keep enforcement repository-local. Escalate only after the same omission is observed repeatedly:

1. an explicit repository task;
2. CI for the governed research surface;
3. a narrow repository hook when task and CI feedback are demonstrably too late.

Never install a user-global hook for one repository's research policy. A structural PASS does not clear
the semantic review, and a semantic judgment must cite the exact checker result it consumed.

## 7. Deny list

Reject a postmortem that:

- reconstructs a prospective commitment after outcome access;
- drops failed, stopped, aborted, excluded, or inconvenient runs from the denominator;
- turns a successful outcome into evidence that the process was sound;
- turns a null result into proof that the wider research space is empty;
- replaces lens verdicts with one scalar creativity, quality, or integrity score;
- claims causal failure, true independence, or complete coverage from structural conformance alone;
- stores raw reasoning, transcripts, prompt/control text, secrets, or credentials;
- lets documentation, orchestration, continuity, or a global hook take over the semantic verdict.
