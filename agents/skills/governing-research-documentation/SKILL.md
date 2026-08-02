---
name: governing-research-documentation
description: >-
  Governs a RESEARCH REPOSITORY'S document portfolio: choose create, update, derive, freeze, retire,
  or delete; keep one active authority per question; preserve raw evidence and negative results;
  expire generated views; and require review decision, questions, evidence, and acceptance criteria.
  Use for R&D documentation norms, duplicate or stale docs, canonical-vs-derived conflict,
  retention/removal, reviewable technical communication, OKF adoption, or LLM-wiki governance.
  Owns cross-document admission, authority, lifecycle, and review contracts. MUST NOT fire for
  one-document structure (structuring-documents), prose polish (linting-prose), corpus synthesis
  (systematizing-knowledge), finished-paper argument (arguing-research-papers), research direction
  (directing-research), transient task state (continuing-long-running-tasks), or wiki/search
  installation alone. English skill; respond in the user's language (default Japanese).
---

# Governing research documentation

> **Version**: v2608.1.1 (2026-08-02) — transfer-artifact lifecycle and repository-surface residual.

**Atomic build.** Ship the authority contract, profile, templates, floor, regressions, trigger matrix,
and forge ledger in one change. Run from this Skill directory; success prints nothing:

```bash
for f in SKILL.md agents/openai.yaml \
  references/admission-and-lifecycle.md references/harness-integration.md \
  references/okf-rd-profile.md references/review-contract.md references/sources.md \
  assets/templates/canonical.template.md assets/templates/evidence.template.md \
  assets/templates/generated-view.template.md assets/templates/review-request.template.md \
  scripts/research-docs-check.ts tests/research-docs-check.test.ts \
  tests/local-failure-corpus.md tests/triggers.md tests/forge-verification-ledger.md; do
  test -f "$f" || echo "MISSING $f"
done
```

## LAW — a document must earn its continued existence

A durable file is not evidence that the repository needed a new authority. Before writing one,
decide which lifecycle action is justified. Maintain exactly one current authority for each
research question. Preserve immutable evidence separately. Make every audience-specific view
derivable and expiring. A review request must say what decision is needed and what evidence can
change it. Every durable file needs an authority or source and a reader decision. It also needs an
owner and retirement condition. Without them, excellent prose is still documentation debt.

OKF v0.2 is the exchange envelope, not this quality law. Base OKF accepts a concept with only
`type`. It tolerates missing lifecycle fields, broken links, and unknown extensions. The local R&D
profile deliberately adds stricter `rd_` fields and deterministic failures. Never call a profile
failure an OKF-conformance failure.

## Function map — SOLE owner

```text
documentation request + current R&D corpus
  -- create | update | derive | freeze | retire | delete -->
DOC ADMISSION + one governed artifact transition
  --> one active authority per question
  --> evidence preserved; generated views disposable; review decision answerable
```

This Skill owns the `DOC ADMISSION` decision and the cross-document transition. It does not own
the research claim or the internal architecture of one document. It also does not own sentence
quality or repository hook implementation.

## Gates D0–D5

### D0 · Declare the requested decision

Before drafting, write this compact artifact in the response or working record:

```text
DOC ADMISSION
REQUEST: <what prompted documentation work>
READER / DECISION: <who will do what differently>
QUESTIONS: <the bounded questions feedback must answer>
EXISTING AUTHORITY: <authority key + path, or none after inspection>
ACTION: create | update | derive | freeze | retire | delete
ROLE: canonical | evidence | review_request | generated_view | none
SOURCES: <evidence paths, or none with reason>
SUPERSEDES / RETIRES: <paths, or none>
OWNER: <human:<id> or process:<id>>
RETIRE WHEN: <observable event/date, or not applicable>
```

If the answer is useful only in the current conversation, choose `ACTION: freeze`, `ROLE: none`,
and answer inline. “Write this down” is a request to run the gate, not automatic admission.

### D1 · Inspect before admission

Locate the existing authority and its evidence. Inspect open reviews, generated views, index
entries, and deprecated predecessors. Search by the research question and authority key, not only
by the proposed filename. If no owner exists, say so; do not fill the ownership void with a second
quasi-canonical report.

Choose exactly one action:

- `create` — no existing artifact owns the purpose, and its durable review/lifecycle value exceeds
  its maintenance cost.
- `update` — the purpose already has an authority. Change that file; do not fork its facts.
- `derive` — an audience needs a temporary brief, index, graph, or rendering of an **already bounded**
  SoK position. Record its sources and expiry; it never becomes evidence or authority. A new corpus
  conclusion is not derivation: route it to `systematizing-knowledge` before any view is rendered.
- `freeze` — admission evidence, review intent, or authority is missing. Preserve the request and
  make no durable file yet.
- `retire` — keep identity and history, mark the concept deprecated, and name one successor or a
  retirement reason.
- `delete` — only a reproducible generated view, or an explicitly authorized privacy/security
  purge. Evidence and prior authorities are not ordinary deletion targets.

Detailed adjudication and correction rules live in `references/admission-and-lifecycle.md`.

### D2 · Assign role and authority

Use an OKF v0.2 knowledge bundle with the raw source tree outside it. Every concept has one
`rd_role`: `canonical`, `evidence`, `review_request`, or `generated_view`.

- `canonical` is the only role that may carry `rd_authority_key`.
- `evidence` binds an immutable raw artifact to a locator and SHA-256. It records what was
  observed, including negative results; it is not the interpretation authority.
- `review_request` fixes candidate, reviewer, decision, questions, cited evidence, and `accept_if`.
- `generated_view` is draft-only, expires within 30 days, and cannot feed durable concepts.

Read `references/okf-rd-profile.md` before creating or changing the bundle schema. Read
`references/sources.md` before changing profile claims or their external lineage.

### D3 · Delegate content craft to the correct owner

After admission, route research meaning to the domain Skill. Send one document's section
architecture to `structuring-documents` and prose-in-place to `linting-prose`. Send corpus
synthesis to `systematizing-knowledge` and manuscript claims to `arguing-research-papers`. This
Skill returns after those edits to check authority, provenance, reviewability, and lifecycle.

### D3a · Govern transfer artifacts without owning their meaning

`DONOR SET`, transfer bundle, `MAPPING-BREAK`, `TARGET RESULT`, and `TRANSFER DISPOSITION` remain
domain artifacts. They are not new `rd_role` values. Semantic ownership stays with
`systematizing-knowledge`, `forging-novel-theses`, `acting-on-hypotheses`, and
`directing-research`.

This Skill may decide only their durable locus, authority key, source/digest lineage, review request,
and retirement transition:

| Artifact | Governance action | Never do here |
|---|---|---|
| `DONOR SET` | retain its corpus scope, source locators, and frozen digest as lineage for later mapping | select a target or infer a target claim |
| transfer bundle | link candidate IDs and donor-set digest to the governed decision record | construct a correspondence map or suppress failed candidates |
| `MAPPING-BREAK` | preserve it as negative/limiting decision history; supersede only by a later, separately reviewed artifact | delete it because a preferred transfer passed elsewhere |
| `TARGET RESULT` | retain its frozen transfer-bundle binding, candidate ID, target observation, prewritten threshold, exact locus, digest, and review/retirement event | rewrite the threshold after observation or turn the result into a mapping verdict |
| `TRANSFER DISPOSITION` | record the decision, consumed target-side evidence, owner, and retire/reopen event | decide adoption, target truth, or test outcome |

Use the existing four profile roles; do not mint a generic “transfer” document class. A generated
view may render these records but may not become their source of authority.

### D4 · Make feedback executable

Do not ask “thoughts?” or create a second manual summary. Create a small `review_request` that points
to the candidate and evidence. Each question names an observable `accept_if`. A longer reviewer
packet is a `generated_view` derived from those sources and retired after the decision.

Read `references/review-contract.md` when advice, feedback, approval, or handoff is requested.

### D5 · Close the lifecycle transition

Update the reachable bundle index. Deprecate displaced authorities in the same change. Run the
profile validator, and use Git review for semantic changes. The deterministic floor checks format,
typed references, and digests. It also checks append-only evidence, authority uniqueness, review
shape, and expiry:

```bash
bun ~/.agents/skills/governing-research-documentation/scripts/research-docs-check.ts \
  --root research/knowledge --raw-root research/raw --base origin/main
```

Use `~/.claude/skills/...` under Claude Code. Read `references/harness-integration.md` before wiring
repo-local tasks, hooks, permissions, or CI. Do not add a global hook for one repository's policy.

## Execution model

The admission decision is **SOLO** because its output is one mutually exclusive action. Read-only
inventory and evidence checks may fan out, but workers return paths and findings to the one
adjudicator. The validator is a deterministic serial gate, never an LLM reviewer. Humans and domain
owners judge semantic truth and whether a new document deserves existence. They also judge whether
`accept_if` is scientifically adequate.

## MUST-NOT-FIRE and sibling cuts

| Request | Owner |
|---|---|
| Facts duplicated across sections of one document | `structuring-documents` |
| Wording, register, paragraph logic, or reader comprehension | `linting-prose` |
| Known/uncertain/disputed position across a source corpus | `systematizing-knowledge` |
| Finished paper's claim, novelty, method, or reviewer argument | `arguing-research-papers` |
| Research-stage, thesis, or portfolio decision | `directing-research` |
| One task's resumable transient state | `continuing-long-running-tasks` |
| Wiki/search product installation without a governance problem | product/setup owner |
| Cross-document admission, authority, lifecycle, or review contract | **HERE** |

Trigger and near-miss fixtures live in `tests/triggers.md`. Forge evidence and reciprocal-cut
status live in `tests/forge-verification-ledger.md`.
