# Jev model and API — dated official snapshot

> **Verified**: 2026-09-21 against TypeSafe's live documentation and official `typesafe-ai` skill.
> Re-fetch every cited URL before asserting a current product fact.
> This file is the SOLE home for perishable Jev facts.

## Direct API contract

| Surface | Verified fact |
|---|---|
| evaluation endpoint | `POST https://api.typesafe.ai/v1/systemone` |
| authentication | `Authorization: Bearer $TYPESAFE_API_KEY` |
| request | `{state, model, questions}`; each question is Noul, Choice, or Score |
| success response | `{model, answers, usage}`; `usage` includes input/output token counts |
| model discovery | authenticated `GET https://api.typesafe.ai/v1/models` |
| documented errors | 401 invalid/missing key; 422 invalid request; 429 rate limit; 529 overloaded |

The bundled runner does no automatic retry. Its recovery exits are:

| Exit | Class |
|---|---|
| 2 | local usage or configuration failure |
| 3 | authentication or permission failure |
| 4 | retryable timeout, network, rate-limit, or overload failure |
| 5 | other upstream failure |

The caller owns a bounded retry policy.

## Model snapshot

| Fact | Verified value |
|---|---|
| stable alias | `jev-latest` |
| version behind the stable alias | `jev-1.13.0` |
| preview alias | `jev-preview`; currently the same version at verification time |
| price | $0.042 per million input tokens; output tokens free |
| rate limits | 250,000 tokens/second and 1,200 requests/minute; docs warn these may change dynamically |
| context | 64k total per request; 32k for state plus the longest question |
| input | text in string/JSON object/array form; no image/audio/video input |

Aliases move. Log the response's resolved `model`.
Pin a version when thresholds are tuned to it; re-evaluate before moving.
An accepted context is not an accuracy guarantee. The current docs warn about context rot.

## Primitive response shapes

```json
{"type":"noul","noul":0.95}
```

```json
{
  "type":"choice",
  "choice":"billing",
  "probabilities":{"billing":0.88,"technical":0.12},
  "confidence":0.81
}
```

```json
{
  "type":"score",
  "score":1.05,
  "legend":{"0":"Calm","1":"Frustrated","2":"Very angry"},
  "probabilities":{"0":0.0,"1":0.95,"2":0.05},
  "confidence":0.92
}
```

Choice criteria accept up to 255 options. Score criteria require at least two ordered levels and
accept up to 10. Noul has no separate confidence field.

## Current model limitations

The official Jev 1.13 jaggedness page was last reviewed there on 2026-09-17.
It names these failure modes:

- Literal reading.
- Numeric precision and counting.
- Date/time comparison.
- Indirection and irrelevant large state.
- Adversarial content.
- Contradictory instructions and criteria.
- Assumed identities across separate questions.
- Generation.

Durable corrections live in `question-design.md`. Do not copy this versioned list into `SKILL.md`.

The state docs say Jev's primary training language is English.
They report lower current accuracy for other languages, including CJK.
Preserve source text when translation would lose evidence. Test the actual language regime before
unattended use. Do not claim translation is better without a matched evaluation.

## Data and credentials

The official docs say customer requests/responses are not used for training.
They mention zero data retention for enterprise customers. Do not infer that every account has it.
Apply the actual account agreement and data policy before sending private state.

The runner reads only `TYPESAFE_API_KEY`. It never accepts a key flag.
A custom base URL is a data-and-credential routing decision.
It requires `--allow-custom-base-url`; non-loopback HTTP is rejected.
The caller must trust the endpoint named by `--base-url`.

## Official skill boundary

TypeSafe's official `typesafe-ai` skill owns application integration and cookbook discovery.
`driving-jev` adds a direct runner, agent-side fit gate, relay contract, and sibling cuts.
It does not fork the vendor SDK documentation.

## Primary sources

- Official skill: <https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md>
- Documentation index: <https://docs.typesafe.ai/llms.txt>
- API: <https://docs.typesafe.ai/api.md>
- Models: <https://docs.typesafe.ai/models.md>
- State: <https://docs.typesafe.ai/concepts/state.md>
- Primitives: <https://docs.typesafe.ai/primitives.md>
- Confidence: <https://docs.typesafe.ai/confidence.md>
- Jev 1.13 jaggedness: <https://docs.typesafe.ai/model-jaggedness/jev-1.13.md>

## Source grades

| Rule group | Grade | Handling |
|---|---|---|
| endpoint, schema, model, pricing, limits, primitive fields, language/data statements | official-doc-confirmed | dated here; re-fetch on reforge |
| direct-runner interface, exit classes, secret handling, relay form | skill-supplied | verified by local fixtures; never attributed to TypeSafe |
| J0–J5 operational gates and sibling cuts | constructed | engineered for this agent environment; not vendor claims |
