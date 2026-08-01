# Admission and lifecycle adjudication

Use this reference when the action is not obvious. The decision unit is a purpose/authority pair,
not a filename.

## The admission test

A new durable concept is admissible only when all answers are concrete:

1. **Decision value** — who will make which decision from it?
2. **Ownership gap** — which existing artifact was inspected, and why can it not be updated?
3. **Role** — is this authority, evidence, a review request, or a reproducible view?
4. **Provenance** — which immutable evidence supports its load-bearing claims?
5. **Maintenance** — who updates it, on which event, and how is staleness detected?
6. **Retirement** — what observable event deprecates or deletes it?

Any missing answer means `freeze`; do not manufacture fields from inference.

## Action matrix

| Observed state | Action | Required transition |
|---|---|---|
| No durable reader decision; answer is momentary | `freeze` | Answer inline; create no file. |
| Existing artifact already owns the purpose | `update` | Edit that authority and re-review changed claims. |
| New reader/register, same underlying facts | `derive` | Generate from declared sources; add expiry; never copy authority. |
| New research question with evidence and reviewer | `create` | Add draft canonical plus an open review request. |
| Raw run, dataset, trace, or negative result arrived | `create` | Add raw artifact and immutable evidence record; do not add interpretation automatically. |
| A stable successor replaces an authority | `retire` | Deprecate predecessor atomically and point successor to it. |
| An authority is abandoned without successor | `retire` | Deprecate it and record a non-empty retirement reason. |
| Generated view expired or can be reproduced | `delete` | Remove it and rebuild indexes/caches. |
| Evidence or deprecated authority seems embarrassing/wrong | `freeze` | Preserve it; add correction evidence or successor. Never erase history silently. |
| Secret, personal data, or legal deletion is required | `delete` | Stop the ordinary lifecycle. Route to the repository's security/legal owner for an authorized purge, dependent-claim cleanup, and safe tombstone when allowed. |

The append-only checker has no self-authorizing purge flag. A privacy, security, or legal removal
therefore fails the ordinary integrity gate by design. The accountable repository owner must use
its exceptional purge and re-baseline process; an agent may not turn this row into a silent waiver.

## What must be maintained

- Stable and draft canonical concepts: evidence, verification, review decision, staleness, and one
  authority key.
- Evidence records and raw artifacts: append-only identity, digest, resolvable typed locator, and
  provenance.
- Review requests: state transitions and decision outcome; accepted/rejected records become history.
- The reachable index and supersession graph.
- The profile/schema and validator itself, under higher review than ordinary content.

## What should be retired or deleted

- **Delete** generated summaries, graph caches, search answers, dashboards, and reviewer packets
  once expired or reproducible.
- **Deprecate** superseded canonical concepts; retain their stable IDs and evidence lineage.
- **Withdraw/deprecate** abandoned review requests; retain the decision trail.
- **Do not create** meeting-summary or progress-report files whose only function is to repeat a
  current authority. Attach the source as evidence, update the authority, and derive a view if a
  reader needs one.

## Corrections

Do not edit an evidence record or raw artifact to make history agree with a later conclusion. Add a
new evidence record, update or supersede the canonical interpretation, and cite both when the
conflict matters. A negative result remains searchable evidence even when a later experiment
succeeds.

Do not silently turn a generated view into a canonical concept. Admission requires a new draft
canonical path or an update to the existing authority, an open review request, evidence-only
sources, and a later accepted review.
