# Jev question design — one judgment, explicit policy

> **SOLE home** for durable question/state/uncertainty rules in `driving-jev`. Current model-specific
> limits and endpoint facts belong to `model-and-api.md`.

## 1. Fit before phrasing

Use Jev for a quick semantic judgment over supplied state with a bounded answer type.
Keep these elsewhere:

| Need | Owner |
|---|---|
| exact parse, lookup, schema validation, arithmetic, count, or date comparison | ordinary code |
| prose/code generation, explanation, open-ended analysis, or multi-step investigation | a generative/reasoning model |
| permissions, thresholds, control flow, retries, and side effects | caller policy/code |
| semantic whether/which/degree judgment over bounded evidence | Jev |

The inversion test is decisive. If code can answer exactly, Jev adds failure and cost.

## 2. Choose the primitive by answer meaning

| Meaning | Primitive | Design rule |
|---|---|---|
| whether one condition holds | Noul | ask one condition; define true and false when boundaries matter |
| one winner among competing options | Choice | make options collectively adequate; add `other`/`none` when coverage is not guaranteed |
| degree along one ordered dimension | Score | each level describes a concrete standalone situation; order low to high |

Several labels that may all apply are several Nouls, not one Choice.
Intensity is a Score, not a Noul probability.
A Choice distribution is relative among supplied options.
Separate Nouls are absolute yes-probabilities and need not reproduce that distribution.

## 3. Shape the state

Prefer a named JSON object when the decision compares more than one value. Put the evidence in
`state`; put the judgment and answer definitions in `instructions`/`criteria`. Point to nested
values with backticked paths such as `ticket.messages[0].text`.

State admission checklist:

- Include every fact needed to answer.
- Exclude unrelated history and prompt residue.
- Keep observed facts distinct from prior model inferences.
- Label policies, candidates, identities, and timestamps instead of concatenating them.
- Remove secrets and personal data not needed for the judgment.
- Record which external service receives non-public state.

More context is not a safety margin. It increases cost and may reduce accuracy through distraction
and indirection.

## 4. Write atomic questions

An atomic question yields one independently useful answer. It need not be one sentence, but it must
not hide multiple conditions whose failures need different recovery.

Use this shape:

```json
{
  "type": "noul",
  "instructions": "Does `message` explicitly request cancellation?",
  "criteria": {
    "true": "The sender directly asks to cancel the service or subscription",
    "false": "The sender reports a problem, complains, or asks a question without requesting cancellation"
  }
}
```

If a wrong answer makes you say “what I really meant was…”, add that condition to the question.
Avoid double negatives. Prefer a named evidence field over positional indirection.

## 5. Batch only independent questions

Questions over the same state should travel in one request when each can be answered without seeing
another answer. They execute independently; ordering does not create a reasoning chain.

Make a second request only when code needs the first result to build the next state or candidate set.
Batch speculative branch questions only when each premise is explicit.
Code must ignore answers from unused branches.

For many items, keep identity stable. Use keyed objects or place the relevant item in each question.
Do not make the model chase a distant numeric index through a long array.
Evaluate batching at representative lengths. A technically accepted context is not proof of accuracy.

## 6. Interpret uncertainty without laundering it

| Output | Meaning | Does not mean |
|---|---|---|
| Noul `noul` | probability the stated condition is true | intensity; permission to act |
| Choice `probabilities` | relative probability across supplied options | coverage of an omitted option |
| Choice/Score `confidence` | concentration of the returned distribution | correctness of the question, evidence, or workflow |
| Score `score` | probability-weighted location on the declared levels | an exact measurement |

Thresholds belong to a loss policy, not to the model name. Declare the consequence of false
positive, false negative, abstention, and service failure. Then choose among act, confirm, human
review, reasoning-model fallback, deterministic fallback, or stop. Preserve raw responses so a
later policy change need not rerun unchanged evidence/questions.

## 7. Diagnose a miss by layer

| Layer | Question |
|---|---|
| evidence | Was the needed fact absent, stale, mislabeled, or buried in irrelevant state? |
| question | Did instructions state the literal condition and criteria cover the boundary? |
| candidate set | Was the correct Choice option or extractable value missing? |
| primitive | Was whether/which/degree modeled with the wrong type? |
| model | Did Jev misjudge a well-specified, evidenced case? |
| policy | Did code misuse probability/confidence or apply the wrong threshold/action? |
| service | Was the response missing, timed out, throttled, or rejected? |

Change only the layer supported by the failure evidence. A threshold tweak does not repair missing
state; a longer prompt does not repair code that asked the model to count.

## Sources

- <https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md>
- <https://docs.typesafe.ai/concepts/state.md>
- <https://docs.typesafe.ai/primitives.md>
- <https://docs.typesafe.ai/confidence.md>
- <https://docs.typesafe.ai/model-jaggedness/jev-1.13.md>
