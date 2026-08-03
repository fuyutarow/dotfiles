# Governing research documentation — forge verification ledger (2026-08-01)

## Existence decision

A repository-wide battery searched existing Skills for research-document admission, authority,
lifecycle, review contracts, canonical/evidence/generated roles, and retirement. The nearest owners
were intentionally narrower:

- `structuring-documents`: information architecture inside one document;
- `linting-prose`: reader-facing words, sentences, paragraphs, and prose lifecycle surfaces;
- `systematizing-knowledge`: the known/uncertain/disputed position of a source corpus;
- `arguing-research-papers`: one finished manuscript claim and absent-reviewer argument;
- `directing-research`: research-stage, problem, thesis, and portfolio judgment;
- `continuing-long-running-tasks`: one transient `TASK-CONTINUATION.md` with a writer transaction.

No owner covered all four missing dimensions: cross-document **admission + authority + lifecycle +
review contract**. The local failure corpus initially reproduced the gap in six positive and five
negative fixtures; the current regression set has seven and six. **Decision: create one new
sibling**, not expand a single-document or transient-state Skill.

## Function and artifact map

```text
documentation request + current R&D corpus
  -- create | update | derive | freeze | retire | delete -->
DOC ADMISSION + one governed artifact transition
  --> one active authority per question
  --> evidence preserved; generated views disposable; review decision answerable
```

| Function | One home |
|---|---|
| LAW, admission gates, sibling cuts, execution model | `SKILL.md` |
| detailed action/retirement correction rules | `references/admission-and-lifecycle.md` |
| stable document identity, filename grammar, registry, allocation, migration | `references/naming.md` |
| exact OKF v0.2/local `rd_` profile | `references/okf-rd-profile.md` |
| exact review-request contract | `references/review-contract.md` |
| repo-local command/hook/CI boundary | `references/harness-integration.md` |
| external lineage and claim grades | `references/sources.md` |
| deterministic floor | `scripts/research-docs-check.ts` |
| copyable concept starting points | `assets/templates/` |
| trigger and local failure regressions | `tests/triggers.md`, `tests/local-failure-corpus.md` |
| receipts and semantic ceiling | this ledger |

There is no Skill-local README or changelog. History stays here; the public Skill remains an
operating manual.

## Source and calibration boundary

`references/sources.md` is the external source ledger. The normative upstream claim is limited to
OKF field/conformance meaning. The `rd_` role taxonomy, admission gate, append-only policy, review
contract, and deletion rules are constructed local policy.

| Base source/tool suggests | Agent consumer is likely to overclaim | Corrective profile bias |
|---|---|---|
| Markdown + YAML is portable | therefore the documents are high quality | label base OKF separately from the stricter profile |
| an LLM can maintain a wiki | generated synthesis is a source of truth | raw/evidence are protected; generated views cannot feed durable concepts |
| more context helps future agents | every session deserves a new status report | admission may choose freeze/update/derive; new authority is exceptional |
| review prose helps feedback | a second long summary is a review contract | request one decision with evidence-bound, testable questions |

## Mechanical regression contract

The focused test suite must prove at least:

1. `type`-only passes OKF mode and fails the local profile;
2. valid draft/open-review and stable/accepted-review lifecycles pass;
3. duplicate active authorities fail;
4. stable canonical provenance, current human verification, and accepted review are enforced;
5. raw SHA-256, typed locator resolution, raw/evidence append-only history, and durable deletion
   rules fire;
6. per-question review evidence and acceptance conditions are structurally required;
7. generated views are draft, expiring, source-aligned, and non-authoritative;
8. broken internal links, index orphans, generated back-edges, and typed supersession cycles fail;
9. ordinary concept-link cycles and new evidence additions remain legal;
10. type-code registry shape, snake_case-tail filename grammar, ID agreement/uniqueness, and
    admitted ID/type/role/path plus used-mapping immutability are enforced only in profile mode;
11. bad CLI input is fatal exit 2, distinct from content findings exit 1.

## Semantic ceiling

A passing checker does **not** establish that a document deserves existence, two authority keys are
semantically distinct, a source entails a claim, a raw capture is truthful, a human identity is
authentic, a registered content type/title is apt, a historical generated ID was never reused, or a
review question is scientifically useful. One test deliberately proves that vague but structurally
non-empty review text can pass. Those judgments remain with the admission owner, domain Skill, and
named human reviewer.

## Verification receipts

Terminal forge run on 2026-08-01:

- `bun test agents/skills/governing-research-documentation/tests/research-docs-check.test.ts`:
  46 pass, 0 fail, 60 assertions.
- Biome on the checker and focused test: two files checked, no fixes required.
- `script-check.ts` on the production checker: `FAIL=0 WARN=0`.
- `skill-check.ts agents/skills/governing-research-documentation`: exit 0 with no warning or
  failure; no prose-debt waiver is open for this Skill.
- system `quick_validate.py` through `uv run --with pyyaml --no-project`: `Skill is valid!`.
- `rumdl check --no-exclude agents/skills/governing-research-documentation`: 13 files clean.
- `mise run lint:skills-index`: complete. `bun install --frozen-lockfile`: no change.
- `mise run check`: pass. Component receipts include 140 hook tests passing with one intentional
  skip, 39 repo-search tests, and 27 Bun-script-floor tests. Its 14 Bun warnings are pre-existing,
  unrelated files and are not waived here.
- Three independent final audits checked forge boundaries, commit scope, and validator bypasses.
  Re-audit passed after fixes for closed-review history, CI merge-base use, raw symlink escape,
  reference-link parsing, Git `T` type changes, `file:` URI escape, and typed locator resolution.

One test-harness defect was found during verification: `objectContaining(new Set(...))` accepts a
wrong Set member in Bun 1.3.14. Every affected assertion now converts the Set to an array and uses
`arrayContaining`; the 46-test receipt is after that correction.

## Reciprocal-cut status

Completed in all six closest siblings. `systematizing-knowledge` and
`continuing-long-running-tasks` remain clean. `structuring-documents`, `linting-prose`,
`arguing-research-papers`, and `directing-research` retain the exact pre-existing warning counts in
their own dated, artifact-named ledgers. This forge did not claim that unrelated prose debt was
cleared.

## 2026-08-02 — transfer-artifact lifecycle and repository-surface residual

This reforge keeps transfer semantics out of the portfolio owner. `DONOR SET`, transfer bundle,
`MAPPING-BREAK`, `TARGET RESULT`, and `TRANSFER DISPOSITION` retain their domain owners; governance
records only their authority/locus, digest lineage, review interface, supersession, and retirement.
In particular, `derive` may render an existing bounded SoK position but never make a new corpus
conclusion.

The harness reference now records an OPEN residual: `repo-search` is discovery, a future `repo-read`
would need to emit a frozen READ BUNDLE, and generic `repo-write` is prohibited. A future apply surface
would require a domain-signed input, base digest, allowlist, and acceptance commands. No tool, profile
role, checker, or hook changed. These are constructed house controls, not claims of OKF or LLM-wiki
effectiveness.

## 2026-08-02 — research-run durability and orchestration seams — KEEP

Decision: `KEEP`; no merge with evidence synthesis, research direction, or orchestration.
This skill uniquely owns `DOC ADMISSION` and durable document authority/lifecycle meaning.

`RUN INTENT`, `RUN RECEIPT`, and `RETROSPECTIVE JUDGMENT` remain semantic artifacts of
`directing-research`. This skill does not restate their schema or alter a semantic lens verdict or
programme transition. If any artifact becomes durable, it receives a separate `DOC ADMISSION` decision
for role, locus, lineage, review, retention, and retirement.

Failed, stopped, aborted, excluded, and other negative terminal evidence remains in the denominator.
A later success does not authorize erasure. Exceptional privacy/security/legal deletion follows the
existing authorized purge, dependent-claim correction, and safe-tombstone rule in
`references/admission-and-lifecycle.md`.

The orchestration seam is also explicit. This skill may request fan-out inventory or evidence checks.
`orchestrating-agents` owns actors, visibility, dependencies, vetoes, and acceptance topology.
This skill consumes receipts and retains admission/lifecycle judgment.

Trigger receipts:

- document create/update/freeze/retire/delete/authority only → this skill alone;
- research-process semantic audit only → `directing-research` alone;
- dispatch topology only → `orchestrating-agents` alone;
- corpus position plus canonical authority → `systematizing-knowledge`, then this skill;
- durable research postmortem → `directing-research`, then this skill for durability only;
- multi-agent inventory plus retirement → this skill frames lifecycle, orchestration fans out, this
  skill adjudicates.

Verification receipts: description length 998; trigger desk-check inventory `F=12 N=13 C=9`;
both `quick_validate.py` runs returned `Skill is valid!`; `skill-check.ts` exited 0 with
`FAIL=0 WARN=0`; the combined relevant Bun suites passed `76 pass / 0 fail / 157 assertions`.
Scoped `git diff --check` passed; `mise run lint:skills-index` reported a complete index.

## 2026-08-02 — compact durability trigger repair (v2608.1.2)

Fresh stage-1 probe required the 998-character description to retain all seams under a 960-character
house budget. The compact surface keeps S→G ordering, D semantic verdict→G durable admission, O actor
topology versus G lifecycle, and negative-terminal retention. The new durable-RUN FIRE row starts only
after RUN semantics are fixed; the ordered row keeps `directing-research` before DOC ADMISSION. No OKF,
checker, or lifecycle claim was strengthened.

Receipts: description 937 characters; `quick_validate.py` valid; targeted `skill-check.ts` silent
exit 0 (`FAIL=0 WARN=0`); `research-docs-check.test.ts` 46 pass / 0 fail / 60 expectations; durable
RUN-only and D→G ordered desk-check 2/2 PASS.

## 2026-08-03 — stable document identity and structured filename grammar (v2608.2.0)

Decision: extend this Skill rather than create a naming sibling or generic repository tool. Naming is
part of DOC ADMISSION because allocation, update, retirement, evidence history, and review links all
depend on one stable identity. `references/naming.md` is the sole owner; the profile, templates,
checker, triggers, and lifecycle references point to it.

The admitted grammar is:

```text
{type_code}{YYYYMM}_{seq}-{content_title}.md
```

The left side is a structured document ID, not a prefix slug. The one hyphen is therefore the
top-level ID/title boundary. Underscores remain inside the ID and its lower_snake_case title. This is
a constructed R&D profile convention, not an OKF rule, URL rule, or universal filesystem custom.
POSIX and RFC 3986 provide no delimiter hierarchy; Google URL guidance applies to public URL words,
while Google's C++ guide explicitly defers to local filename convention.

Allocation occurs only after a new `create` or `derive` passes DOC ADMISSION. Ordinary update,
correction, and retirement preserve ID, admitted type/role, and path. Generated-view deletion permits
a later derivation only under a new ID. A regular bundle-local `rd-types.json` keeps type codes
one-to-one; a mapping used by a concept visible at the Git comparison base cannot be reassigned.
Migration of an existing corpus is one reviewed re-baseline, never a permanent legacy exemption.

The deterministic floor remains narrower than governance. It proves current grammar, registry shape,
agreement, live uniqueness, base-visible ID/path binding, admitted ID/type/role preservation, and
used-mapping preservation. It also requires the new IDs in each code/month to be the contiguous suffix
above the Git-base maximum, so an existing gap stays legal but cannot be filled later. It does not prove
semantic type/title aptness, admission quality, or reuse of an ID/mapping absent from the selected
comparison snapshot.

Adversarial verification found and closed: duplicate JSON keys; registry symlink escape; final-line
terminator filenames; generated-view ID/role laundering; ID reuse at a new path; used-code
reassignment after deleting the last view; a diagnostic-code collision; and late filling or skipping
of a sequence relative to the Git base. The last finding came from an additional independent
architecture/checker challenge after the initial re-audits; its red test failed before `RDI013` and
passed after the allocation floor was added. A final checker audit then exposed duplicate `RDI007` /
`RDI013` reporting for in-place reissue and one `git show` subprocess per base Markdown file. The
checker now distinguishes base paths from new paths and performs the base-tree identity scan through
one bounded `git cat-file --batch -Z` subprocess. Change-specific history and registry reads remain
bounded by the changed-file set. The forge audit's missing receipt and source-calibration findings are
closed by this section and the revised POSIX wording.

Verification receipts:

- red phase after naming regressions but before implementation: 34 pass, 27 fail;
- late allocation-floor red phase: 73 pass, 1 fail, 99 expectations;
- diagnostic-separation red phase: 73 pass, 2 fail, 103 expectations;
- final focused checker suite: 76 pass, 0 fail, 105 expectations;
- `skill-check.ts`: silent exit 0, `FAIL=0 WARN=0`; description 951 characters;
- `script-check.ts`: `FAIL=0 WARN=0` on the production checker;
- system `quick_validate.py`: `Skill is valid!`;
- Biome format/lint: two scoped TypeScript files clean; `rumdl --no-exclude`: 14 files clean;
- atomic-build inventory: silent pass; trigger desk-check inventory: `F=14 N=14 C=9`;
- stale literal fixture search: no old route/question/brief filenames and no `kebab` contract;
- `mise run lint:skills-index`, `git diff --check`, and both installed Skill symlink targets: pass;
- `mise run check`: pass — 140 hook tests passed with 1 intentional skip, 39 repository-search
  tests passed, and 73 script-floor tests passed; 11 unrelated pre-existing Bun warnings remain.
