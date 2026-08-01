# OKF v0.2 R&D profile

> **SOLE owner of the profile.** This file defines the local profile layered on top of Open Knowledge
> Format (OKF) v0.2. It is intentionally stricter than OKF; do not describe a local requirement as
> an OKF requirement. Normative upstream source: [OKF v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

## Boundary and vocabulary

An **R&D knowledge bundle** is a versioned directory of Markdown concepts governed by this profile.
`raw/` input is outside that bundle. Raw material is append-only and read-only to agents: transcripts,
exports, PDFs, measurements, and captures keep their original identity there. A bundle records claims
*about* raw material through `evidence` concepts; it never rewrites raw material into a convenient
summary and calls that preservation.

The four `rd_role` values are mutually exclusive:

| `rd_role` | Job | May be authority? | Lifecycle |
|---|---|---:|---|
| `canonical` | Current answer to one named knowledge question | Yes, exactly one active document per `rd_authority_key` | `draft` → `stable` → `deprecated`; deprecation keeps this role |
| `evidence` | Citable observation, result, source note, or negative result | No | append-only after admission; do not silently revise or delete |
| `review_request` | Bounded request for a decision about a candidate | No | draft while open; retain the decision record when resolved |
| `generated_view` | Regenerable briefing, digest, navigation view, or extraction | Never | always `draft`, has an expiry, and may be deleted/regenerated |

There is deliberately **no `archive` role**. A retired answer remains `rd_role: canonical` with
`status: deprecated`, a successor or retirement reason, and its history intact. This makes retirement
searchable rather than making a second, ungoverned document class.

## Standard fields versus profile extensions

The upstream standard requires a non-empty `type` for each non-reserved concept and permits extension
fields. The profile uses that extension point; `rd_` fields below are local, not part of OKF v0.2.

| Field | Layer | Profile rule |
|---|---|---|
| `type` | OKF standard | Required, non-empty. It states the content kind, not authority. |
| `title`, `description` | OKF standard | Optional in base OKF; required and non-empty in this profile for index/review discovery. |
| `status` | OKF standard | Required explicitly even though base OKF has a default. One of `draft`, `stable`, `deprecated`. |
| `sources` | OKF standard | Base OKF permits broader resources. This local profile is local-only: canonical, review, and generated sources resolve to governed bundle concepts; evidence resolves to one captured raw artifact. Capture any external primary source under `raw/` first, then cite that capture. Source IDs are stable and body citations must use them. |
| `generated` | OKF standard | Required: producer `by` and ISO-8601 `at` say who or what last changed the concept. |
| `verified` | OKF standard | A stable canonical answer requires at least one `human:<id>` attestation. Other roles may use it when human review actually occurred. |
| `stale_after` | OKF standard | Required for active canonical, open review, and `generated_view`; stale active material fails the profile. |
| `rd_role` | R&D profile extension | Required; exactly one of the four roles above. |
| `rd_authority_key` | R&D profile extension | Required only for `canonical`; unique among active (`draft` or `stable`) canonicals in the bundle. It names the question, not a filename. |
| `rd_owner` | R&D profile extension | Required for canonical and review requests. It must be exactly `human:<id>` or `process:<id>`; it identifies the accountable owner for retirement or review closure. |
| `rd_retire_when` | R&D profile extension | Required for canonical and review requests; states the event that makes the artifact obsolete. |
| `rd_supersedes` | R&D profile extension | Optional list of prior canonical bundle paths. A deprecated canonical needs a successor listed elsewhere or a non-empty `rd_retired_reason`. |
| `rd_retired_reason` | R&D profile extension | Required for a deprecated canonical with no successor; records why no replacement is expected. |
| `rd_evidence` | R&D profile extension | Required for evidence: one `source_id`, lowercase SHA-256, and a typed locator that resolves in the raw artifact. |
| `rd_review` | R&D profile extension | Required for `review_request`; pins candidate bytes by SHA-256 and defines the decision contract in [review-contract.md](review-contract.md). |
| `rd_generated_from` | R&D profile extension | Required for `generated_view`; non-empty bundle-relative paths to canonical/evidence/review inputs. Generated views cannot be inputs to this list. |
| `rd_expires_at` | R&D profile extension | Required for `generated_view`, equal to `stale_after`, and at most 30 days after `generated.at`. |

`generated.by` and `verified.by` follow OKF actor syntax. Use `human:<id>` only for a real human
attestation; an agent, tool, or process identity is not a human approval.

`rd_owner` is narrower than a general OKF actor: only `human:<id>` and `process:<id>` are accepted.
Do not use a bare team name, `TBD`, or an agent identity. A process owner still requires a named,
reachable process identifier; it does not turn generated output into human verification.

`rd_evidence.locator` is closed and machine-checked. Use `whole` when the entire raw artifact is the
observation, `line:<N>[-<M>]` for an existing one-based line range, or
`json-pointer:<RFC6901 pointer>` for a path that resolves in valid JSON. Opaque prose, JSONPath, and
an out-of-range or absent target fail the profile. Extract a separately hashed raw artifact when a
PDF page, media timecode, or domain format needs a locator this profile cannot resolve.

## Admission invariants

The profile is an admission rule, not a prose style. Before creating a durable concept, decide whether
the right action is **update** an existing canonical, **derive** a generated view, **record** evidence,
**open** a review request, **deprecate** a canonical, or genuinely **create** a new authority key.

1. One active (`draft` or `stable`) canonical owns one `rd_authority_key`; a competing draft is an
   edit on a branch, not a second in-tree authority.
2. A draft canonical has exactly one open review request. Its `candidate_sha256` must match the
   candidate's current bytes. A closed request retains the digest of the historical bytes it reviewed.
   A stable canonical needs an accepted review whose `candidate_sha256` matches its current bytes,
   plus a real human verification at or after `generated.at`.
3. Evidence records bind exactly one raw artifact, verify its SHA-256 and typed locator, and are
   additive. Correct an interpretation in a canonical or a new evidence record; preserve the
   original observation.
4. A generated view is disposable. It must not receive `rd_authority_key`, be a cited source for a
   canonical, or be promoted to stable instead of updating its canonical input.
5. Every non-generated concept is listed by an `index.md`; a reviewer must be able to discover the
   current authority without semantic search.
6. All profile `sources` are local. Canonical, review, and generated sources resolve inside the
   bundle; evidence resolves inside `raw/`. Capture an external primary source under `raw/` before
   it enters this profile. This is a local tightening: base OKF may describe broader resources.

## What the checker can and cannot establish

The paired checker can deterministically parse frontmatter, reject missing/profile-invalid fields,
verify raw digests, detect duplicate active authority keys, resolve local references, detect expired
views, and compare a Git base to reject raw/evidence rewrites. Those are **floor** properties.

It cannot decide whether a new document should exist, whether two differently named authority keys are
really the same question, whether a source supports a claim, whether a human attestation was honest,
whether raw input was faithfully captured, or whether the review question is worth asking. Those remain
admission and review judgments. A passing check is never evidence that a research conclusion is true.
