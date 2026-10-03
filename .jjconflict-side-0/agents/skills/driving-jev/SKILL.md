---
name: driving-jev
description: >-
  Drives TypeSafe Jev as a bounded judgment engine through a bundled Bun runner. Use for Jev /
  TypeSafe / System One, Jev を使う, Noul / Choice / Score, semantic classification, routing,
  ranking, batch triage, confidence gates, or offloading narrow judgments. LAW: Jev is not an agent
  or generator; the caller owns control flow, exact work, permissions, side effects, thresholds,
  and abstention. State plus atomic typed questions go in; probabilities come out. Product SDK
  integration → the official typesafe-ai skill plus the language owner; generation or multi-step
  reasoning → driving-claude / driving-codex / driving-grok / driving-antigravity; exact predicates
  → plain code. Workflow-native: question design, policy, and acceptance stay SOLO; approved
  independent calls may fan out within declared data and rate budgets. English skill; respond in
  the user's language (default Japanese).
---

# Driving Jev — typed judgments, not an agent

> **Version**: v2609.1.0 (2026-09-21) — initial forge against official TypeSafe docs.
> **Durability**: perishable facts live only in `references/model-and-api.md`. Re-fetch before current claims.

```sh
for f in references/question-design.md references/model-and-api.md references/cli-contract.md scripts/jev.ts tests/jev.test.ts tests/forge-verification-ledger.md; do test -f "$f" || echo "MISSING $f"; done
```

## Language

Keep these tokens stable: **JUDGMENT-NOT-AGENT**, **CODE-OWNS-POLICY**, **MINIMAL-STATE**.
Also keep **ATOMIC-QUESTION**, **ABSTAIN-PATH**, **RELAY-TYPED**, **fire / no-fire**, and **SOLO**.

## THE LAW

> Jev is **JUDGMENT-NOT-AGENT**. It independently answers typed questions over one bounded state.
> It does not generate prose, execute tools, carry a conversation, or choose a next action.
> **CODE-OWNS-POLICY**: the caller does exact work, sets thresholds, and owns every side effect.
> Jev supplies probabilities, not permission or truth. Preserve the raw response and **ABSTAIN-PATH**.

## Function map and stop

```text
bounded text/JSON + a semantic decision need
  --design atomic typed questions and evaluate through Jev-->
typed response {answers, probabilities/confidence, usage, resolved model}
  --> caller policy acts, asks, falls back, or escalates
```

**Stop at the typed response.** This skill never authorizes the downstream action.
For product integration, first fix the judgment contract here. Then hand off to the official
`typesafe-ai` skill and the target language owner.

## Gates

| Gate | Decision rule | Required artifact |
|---|---|---|
| **J0 FIT** | Use Jev only when the missing operation is a fast semantic judgment over a bounded state. Exact lookup, parsing, arithmetic, counting, date comparison, permission checks, and side effects stay in code. Generation or multi-step investigation stays with a generative/reasoning model. | one sentence naming what Jev judges and what code still owns |
| **J1 ATOMIC-QUESTION** | Each question evaluates one independently useful property. Pick the primitive by answer meaning: Noul = whether; Choice = one closed-set option; Score = degree along ordered described levels. | request question map; every question has explicit `instructions`, and Choice/Score has complete `criteria` |
| **J2 MINIMAL-STATE** | Send only evidence needed by those questions. Use named JSON fields and backticked paths when several values interact. Never send a whole repository, transcript, or secret-bearing artifact merely because it is available. | bounded state object + data-classification note when non-public data leaves the host |
| **J3 ABSTAIN-PATH** | Before the call, define how probability/confidence maps to act, review, clarify, fallback, or stop. No universal threshold exists. Noul returns probability of yes; Choice/Score confidence measures distribution concentration, not correctness. | risk-specific policy + low-confidence/low-coverage path |
| **J4 RELAY-TYPED** | Invoke the bundled runner. Preserve the response's `model`, `answers`, and `usage`; do not collapse it to “Jev said yes.” API credentials come from `TYPESAFE_API_KEY`, never argv, prompt, request JSON, logs, or a committed file. | runner stdout JSON + exit code; stderr only for diagnostics |
| **J5 TARGET EVAL** | Before unattended or consequential use, run representative labeled cases, including boundary/adversarial cases. Separate missing evidence, model error, question error, policy error, and service failure before changing a prompt or threshold. | dated case table with expected action and observed typed response |

## Primitive lookup

| Need | Primitive | Read the result as |
|---|---|---|
| Does one condition hold? Multiple labels may all apply. | **Noul** per condition | `noul` = probability of yes; there is no separate confidence field |
| Which one option wins from a closed set? | **Choice** | selected `choice`, full `probabilities`, and concentration `confidence` |
| Where does the item lie on one ordered dimension? | **Score** | probability-weighted `score`, `legend`, `probabilities`, and `confidence` |

Do not transfer a threshold between primitive types. Read `references/question-design.md` before
designing or revising questions, batching work, or interpreting uncertainty.

## Invocation recipe

Write the request outside the skill directory. Declare the model in the request; the runner has no
hidden model default.

```json
{
  "state": {
    "ticket": "The export has failed three times. Please refund me."
  },
  "model": "jev-latest",
  "questions": {
    "asks_for_refund": {
      "type": "noul",
      "instructions": "Does `ticket` explicitly request a refund?",
      "criteria": {
        "true": "A refund or money back is directly requested",
        "false": "No refund is requested"
      }
    },
    "route": {
      "type": "choice",
      "instructions": "Which team should handle `ticket`?",
      "criteria": {
        "billing": "Charges, invoices, or refunds",
        "technical": "A product malfunction without a billing request",
        "other": "Neither description covers the ticket"
      }
    }
  }
}
```

```sh
# Codex / portable personal-skill link
bun "$HOME/.agents/skills/driving-jev/scripts/jev.ts" request.json

# Claude Code while this skill is active
bun "${CLAUDE_SKILL_DIR}/scripts/jev.ts" request.json

# Machine pipeline: one JSON request on stdin, one JSON response on stdout
printf '%s' "$REQUEST_JSON" | bun "$HOME/.agents/skills/driving-jev/scripts/jev.ts" -
```

The default endpoint is the official TypeSafe API.
A custom endpoint needs both `--base-url URL` and `--allow-custom-base-url`.
That opt-in means the named endpoint receives the API key and request data.
HTTP is accepted only for loopback testing. The runner performs no automatic retries.
Exit 4 marks a retryable class; the caller owns one bounded retry policy.

## Gotchas

| Symptom | Likely cause | Correction |
|---|---|---|
| Plausible answer to the wrong intent | Jev reads literally | Put the exact condition and boundary cases into instructions/criteria. |
| Wrong count, calculation, magnitude, or time comparison | System One was asked to compute | Compute/extract in code; ask Jev only for the semantic predicate per item. |
| Confident but irrelevant answer | State contains distracting material or the option set omits “none/other” | Trim state; add a no-match option or separate presence Noul. |
| One question appears to depend on another's answer | Questions in one request are independent | Make the premise explicit, or make a second request only after code fetches/builds dependent state. |
| Noul probability treated as intensity | Probability of yes was confused with degree | Use Score for intensity; keep Noul for whether a condition holds. |
| Call succeeded, downstream action was wrong | Typed output was treated as authority | Repair J3 policy/eval; success proves schema delivery, not truth or permission. |

## Execution model — CITATION-RELAY

| Stage | Mode | Why |
|---|---|---|
| fit, question decomposition, state selection, and threshold policy | **SOLO** | meaning, risk, and downstream consequence must sit in one context |
| independent calls over already-approved disjoint states | bounded **FAN-OUT** | only execution shards; each return carries exact request locus, response JSON, and exit |
| labeled-case evaluation and final acceptance | **SOLO** | failures across question, model, data, and policy must be adjudicated together |

Evidence is **CITATION-RELAY**: an accepted return is `{request locus, exact stdout JSON, exit}`.
“Jev passed” without that observable is zero evidence. No harness → same map, serial.

## MUST-NOT-FIRE — fire/no-fire set

FIRES:

| Ask | Why |
|---|---|
| 「Jev を使って、この問い合わせが返金要求か判定して」 | direct bounded Noul judgment |
| “Use TypeSafe Choice to route these tickets, with an uncertain fallback.” | primitive + policy core |
| 「Codex が全部読む前に、200件を意味判定で絞りたい」 | agent-side bounded semantic triage |
| “My Jev Noul keeps returning 0.5; improve the state and criteria.” | question/state diagnosis |
| 「この判定を Jev に渡すべきか、普通のコードで書くべきか」 | J0 fit decision, even without a CLI keyword |
| “Call `/v1/systemone` safely and preserve usage/model fields.” | runner + relay contract |

MUST NOT FIRE:

| Ask | Route |
|---|---|
| “Have Claude inspect this repository and write the fix.” | `driving-claude`; this needs an agent and generation |
| 「Codex にこの diff を深くレビューさせて」 | `driving-codex`; multi-step reasoning, not a snap judgment |
| “Count ERROR lines and compare dates.” | deterministic code; Jev is the wrong tool |
| “Add the TypeSafe JavaScript SDK to my production app.” | official `typesafe-ai` skill + `implementing-and-debugging` + `writing-typescript` |
| 「Jev の API キーをブラウザに埋め込んで」 | refuse the credential placement; server-side integration owner |
| “What is Jev?” | answer directly; no operating manual needed |

Co-fire on “design a reusable Jev CLI for customers.” `designing-command-line-interfaces` owns
the public contract; this skill supplies Jev semantics.
For implementation, fix the judgment boundary here first. Then use `implementing-and-debugging`
and the target language owner.

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `driving-claude` / `driving-codex` / `driving-grok` / `driving-antigravity` | PURPOSE: those tools run generative agents/models that can produce prose and often execute multi-step work; Jev only returns typed judgments over supplied state. If the output must be newly written text or a tool-using investigation, route there. |
| TypeSafe's official `typesafe-ai` skill | PHASE/PURPOSE: use this skill to operate Jev now from an agent/shell and preserve the call boundary; use the vendor skill to design SDK/API integration inside an application and retrieve current product cookbooks. Re-fetch vendor docs here before current claims. |
| `designing-command-line-interfaces` | PURPOSE: a new public CLI's consumers/grammar/channels/outcomes → there; invoking this bundled private runner and interpreting Jev → here. |
| `writing-bun-scripts` | PURPOSE: Jev semantics, question design, endpoint handling → here; generic Bun runner implementation craft → there. |
| `operating-the-harness` | PURPOSE: wiring a hook/MCP/skill trigger that calls Jev → there first; the Jev call and result policy → here. |
| deterministic code | DECISIVE: if a parser, lookup, calculation, schema, permission rule, or time comparison can answer exactly, do not call Jev. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/question-design.md` | atomic question design, primitive selection, state shaping, batching, uncertainty, failure diagnosis | designing/revising any request or interpreting a surprising result |
| `references/model-and-api.md` | dated official endpoint, request/response schema, models, aliases, prices, limits, language/data facts, source URLs | asserting any current API/model/cost/limit fact or diagnosing provider errors |
| `references/cli-contract.md` | runner consumers, invocation, effects, channels, outcomes, compatibility, receipts | changing or auditing `scripts/jev.ts` |
| `scripts/jev.ts` | request validator and bounded official-API runner | executing a Jev judgment |
| `tests/forge-verification-ledger.md` | function map, source grades, calibration, trigger and verification receipts | reforging or auditing this skill |
