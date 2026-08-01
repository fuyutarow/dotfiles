# Review contract

> **SOLE owner of review-request semantics.** A review request is a decision interface, not a second
> exposition of the candidate. The candidate canonical remains the single authority; a generated briefing
> is only a disposable reading aid.

## Required contract

Every `rd_role: review_request` concept carries an `rd_review` mapping with these fields:

| Field | The reviewer must be able to answer |
|---|---|
| `candidate` | Which bundle-relative canonical path is under review? |
| `candidate_sha256` | Which exact candidate bytes were reviewed? An open request must match the current candidate. A closed request retains its historical digest. |
| `reviewer` | Who is asked to make the decision, and in what capacity? |
| `decision` | What concrete choice, acceptance, rejection, or prioritization is requested? |
| `questions[].id` | Which stable key identifies this question in feedback? |
| `questions[].question` | Which bounded uncertainty must the reviewer address? |
| `questions[].evidence` | Which stable evidence concepts bear on this question? |
| `questions[].accept_if` | What observable condition would make this part acceptable? |
| `state` | `open`, `accepted`, `changes_requested`, `rejected`, or `withdrawn`. |
| `decided_at` | When a non-open decision occurred; forbidden while open. |

`rd_owner` identifies the person accountable for closing the request, while `rd_review.reviewer`
identifies the intended decision-maker. The owner must be `human:<id>` or `process:<id>`. They may
coincide, but do not infer one from the other.

## Review loop

1. Point at the existing candidate canonical; do not copy it into the request.
2. State the decision and questions before asking for prose feedback. “Please review” is not a decision.
3. Link the smallest evidence set that lets the reviewer test those questions; preserve conflicting or
   negative evidence rather than summarizing it away.
4. Record the outcome and preserve the request's candidate digest as the historical review target.
   If the candidate changes after a closed review, open a new request rather than rewriting the old
   digest. A stable candidate requires an accepted review whose digest matches its current bytes,
   plus current human verification. The review request records what was decided; it does not become
   the authority.
5. If a briefing helps, derive a `generated_view` from the candidate and evidence. Give it an expiry and
   delete/regenerate it after the review; never hand it back as the source of record.

## Minimal YAML shape

```yaml
rd_review:
  candidate: canonicals/implicit-backprop.md
  candidate_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  reviewer: human:theory-lead
  decision: "Accept the stated route comparison as the current research position."
  state: open
  questions:
    - id: route-status
      question: "Does the comparison separate established results from hypotheses?"
      evidence:
        - evidence/benchmark-2026-08-01.md
        - evidence/negative-result-conditioning.md
      accept_if: "Each route is linked to evidence or explicitly marked hypothesis."
```

The question wording above is a shape, not a stock checklist. A reviewer who cannot tell what choice
they are being asked to make should return the request without reviewing the prose.

## Limits

The harness requires `sources` to resolve to exactly the candidate plus question evidence. It can
require this schema and the existence of local paths. It cannot judge whether the
candidate actually answers the decision, whether the evidence is sufficient, or whether the acceptance
conditions are scientifically appropriate. Those are human review duties, not fields to game.
