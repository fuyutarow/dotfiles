---
type: review_request
title: "Review request: bounded decision"
description: "A decision contract over one canonical candidate and named evidence."
status: draft
generated:
  by: human:requester-id
  at: 2026-08-01T00:00:00+09:00
stale_after: 2026-08-15
sources:
  - id: candidate
    resource: ../canonicals/research-question.md
  - id: evidence-route-comparison
    resource: ../evidence/route-comparison.md
rd_role: review_request
rd_owner: human:requester-id
rd_retire_when: "The named reviewer records an outcome or the candidate is superseded."
rd_review:
  candidate: ../canonicals/research-question.md
  candidate_sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  reviewer: human:reviewer-id
  decision: "Accept, reject, or request a bounded revision to the candidate position."
  state: open
  questions:
    - id: evidence-boundary
      question: "Does the candidate separate evidence from hypothesis?"
      evidence:
        - ../evidence/route-comparison.md
      accept_if: "Each material claim is attributed to evidence or marked unresolved."
---

# Review request: decision title

Read the candidate and evidence linked in frontmatter. Put only the decision context here; do not copy the
candidate into a parallel “review summary.”
