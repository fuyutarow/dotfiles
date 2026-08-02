# Program integrity — standing policy across runs

> **Sole home**: the program-level policy that keeps predictions, denominators, and admission audits
> visible across many runs. The pass/fail threshold and outcome table for one hard-gated
> expensive/irreversible experiment belong only to `acting-on-hypotheses`; a cheap deterministic
> reversible probe uses the domain/plain executor.
> Semantic review of a completed, failed, stopped, or aborted episode belongs to
> `research-process-postmortem.md`.

## 1. Prediction registry

Define an external registry or ledger and a temporal rule:

```markdown
- Registry locus:
- Who may append:
- What must be registered:
- Deadline: BEFORE data access / execution / unblinding
- Amendment rule:
- Exploratory-result label:
```

The policy does not duplicate a test threshold. It ensures that every threshold or prediction created
by the one-bet owner has a dated home and cannot be silently rewritten after seeing the result.

Exploratory findings are legitimate. They become candidates for a later registered test; they do not
retroactively become predictions.

For a postmortem-capable episode, instantiate the prospective record from `assets/RUN-INTENT.md`.
Do not duplicate its schema in this standing policy. The postmortem reference owns semantic use of the
frozen intent; `scripts/research-run-check.ts` owns only the structural floor.

## 2. Denominator policy

Predeclare what the denominator includes:

- generated problem frames and thesis candidates;
- configurations, seeds, datasets, endpoints, and analyses tried;
- exclusions and their reasons;
- stopped or failed runs;
- semantic duplicates removed from a candidate batch.

Report distributions and exclusions, not only the winning candidate or maximum result. The denominator
must follow the artifact into selection, testing, and publication.

Close every postmortem-capable run in the declared denominator with `assets/RUN-RECEIPT.md`. Terminal
coverage includes failed, stopped, aborted, and excluded states. Missing receipts stay visible.

## 3. Independent-audit requirement

The actor that generated a load-bearing result may not be its sole certifier.

This domain file states the invariant and acceptance surface, not the actor assignment:

```markdown
- Required separation:
- Frozen evidence surface / blind input:
- Specific hostile lens:
- Acceptance condition / clearance locus:
- Actor assignment: orchestrating-agents
```

Useful lenses include leakage, contamination, duplicate evidence, undisclosed search, cheap victory,
and artifactual explanation. “Looks fine” is not clearance. More auditors with the same context do not
create independence.

`orchestrating-agents` owns who performs the pass, who receives which evidence, whether generation is
blinded, when critique is released, veto/authority, and how acceptance is recorded. This file owns only
the research-integrity invariant, evidence surface, hostile lens, and acceptance condition.

## 4. Symmetric scrutiny

Apply the same artifact and debugging requirements to favorable and unfavorable results. A program is
biased if it investigates failures exhaustively but stops checking as soon as a desired number appears.

Record:

```markdown
- Expected-result checks:
- Unexpected-result checks:
- Shared minimum checks:
- Additional checks and why they differ:
```

Any asymmetry must be justified by a risk difference, not by whether the result is convenient.

## 5. Prediction, observation, and interpretation remain separate

Every run record distinguishes:

| Field | Meaning |
|---|---|
| registered prediction | what was written before access/run |
| observation | the measured or cited result |
| artifact checks | leakage, controls, missingness, instrumentation |
| interpretation | the current explanation |
| postdiction | a new explanation formed after observation |
| next registered test | how the postdiction will be tested later |

This separation permits problem-frame updates without laundering hindsight.

When an episode ends and a retrospective judgment is requested, join the prospective intent and
terminal receipt through `research-process-postmortem.md`. Historical absence becomes `PARTIAL` or
`UNAUDITABLE`; never infer a precommitment from the observed outcome.

## 6. Hand-offs

- Need to inspect a suspected present leak or anomaly -> `raising-resolution`.
- Need to fix the implementation -> `implementing-and-debugging`.
- Need the pass/fail threshold or outcome-to-action table for one expensive/irreversible selected tree
  -> `acting-on-hypotheses`.
- Need to run one cheap deterministic reversible probe -> domain/plain executor; return the result to
  `directing-research`.
- Need to synthesize an external source corpus -> `systematizing-knowledge`.
- Need to argue completed evidence in a paper -> `arguing-research-papers`.
- Need to judge the semantic integrity of a completed, failed, stopped, or aborted research episode
  -> `research-process-postmortem.md`.
