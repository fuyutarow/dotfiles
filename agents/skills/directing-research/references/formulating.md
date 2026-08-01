# Formulating a research problem without cheap victories

> **Sole home**: the normative formulation of a selected research problem. Inspecting what an existing
> benchmark or dataset actually contains is `raising-resolution`; implementing a metric is
> `implementing-and-debugging`.

## 1. Decisive formulation

```markdown
- Research relation / contrast:
- Competing accounts:
- Observation that separates them:
- Population / regime:
- Scope deliberately excluded:
- Result that would leave the question unresolved:
```

A formulation is decisive only if plausible outcomes change what may be believed or done.

## 2. The cheap victory

Before optimizing anything, state one concrete way to score well without resolving the research
problem:

```markdown
- Apparent objective:
- Cheap victory:
- Why it misses the research relation:
- Closure: metric change, data split, constraint, or rejection of the formulation
```

If the cheap victory cannot be closed, the metric is not an admissible proxy for the question.

## 3. Optimize / trust firewall

Separate:

- the metric used for search, training, or selection;
- a held-out witness never used in that search or selection;
- a divergence rule that stops trust when the two decouple.

The witness must remain held out across adaptive rounds. Once it affects candidate selection, it is no
longer a witness; rotate or replace it and record the contamination.

## 4. State what the formalization throws away

Every formalization discards context. List the removed variables, regimes, stakeholders, and causal
structure. If the hard part of the original problem was removed, reformulate rather than celebrate the
easier task.

## 5. Freeze rule

Do not freeze the formulation merely to start optimizing. Freeze when:

1. bounded exploration no longer changes the decisive relation;
2. a discriminator is reachable;
3. the cheap victory is closed;
4. the witness lifecycle is defined;
5. exclusions are explicit.

If new controlled results later change the relation, reopen through `directing-research`; that is a
recorded update, not silent metric drift.
