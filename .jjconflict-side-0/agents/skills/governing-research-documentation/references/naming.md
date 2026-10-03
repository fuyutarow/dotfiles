# Document identity and filename contract

> **SOLE owner of R&D concept naming.** This is a constructed local profile rule, not an OKF v0.2
> requirement and not a repository-wide Markdown convention. It applies only to governed concepts in
> the knowledge-bundle root when the checker runs in profile mode.

## Grammar

Every non-reserved concept uses one stable ID followed by one descriptive title:

```text
{type_code}{YYYYMM}_{seq}-{content_title}.md
```

Example:

```text
pos202608_003-implicit_declarative_backprop_routes.md
```

The single hyphen is the structural boundary between identity and navigation text. Underscores stay
inside each component.

| Component | Contract |
|---|---|
| `type_code` | 2–8 lowercase ASCII letters, selected from the bundle-local registry for frontmatter `type` |
| `YYYYMM` | four-digit year `1000`–`9999` plus a real month `01`–`12`; the concept's first DOC ADMISSION month, never its update month |
| `seq` | exactly `001`–`999`, unique within the `type_code` and admission month; gaps are legal and numbers are never reused |
| `content_title` | lowercase ASCII snake_case: `[a-z0-9]+(?:_[a-z0-9]+)*`; a frozen navigation label, not a mutable title or truth claim |
| `rd_document_id` | the filename prefix through `seq`, for example `pos202608_003`; it must exactly match the filename and be unique across the bundle |

Do not use `YYMM`: a durable ID must remain interpretable without century context. Do not rename a
concept when its human title or conclusion changes. `title` is mutable reader-facing metadata;
`content_title` is a stable locator aid.

## Closed type-code registry

The bundle root contains `rd-types.json` as a regular, non-symlink file:

```json
{
  "schema": "rd-document-types/v1",
  "type_codes": {
    "research_briefing": "view",
    "research_evidence": "evi",
    "research_position": "pos",
    "review_request": "rev"
  }
}
```

The mapping is one-to-one. `type` remains the content kind and `rd_role` remains the authority and
lifecycle role; a filename code is neither. Add a type or change an unused mapping only through the
same reviewed profile/schema change as the checker and templates. A mapping used by an admitted
concept is not reassigned: doing so would invalidate existing identities.

The admitted `type` is identity-bearing through that code and is not changed by an ordinary update.
If a concept truly changes kind, retire it and admit a successor. Correct a pre-enforcement
misclassification only inside the explicitly reviewed migration described below.

The registry is profile infrastructure, not an OKF concept. It therefore keeps its fixed filename and
does not carry concept frontmatter or an `rd_document_id`.

## Allocation follows admission

1. Inspect the current authority, evidence, reviews, generated views, and existing IDs.
2. Choose the DOC ADMISSION action. `update`, `retire`, and correction preserve the existing ID and
   path; they allocate nothing.
3. Only after a new `create` or `derive` is admitted, select the registered code for its content
   `type`, use the admission month, and allocate the next unused sequence above that code/month's
   current maximum.
4. If parallel branches collide, do not merge both under the same ID. Keep one allocation, reissue
   the other artifact before merge, and update its references. Never renumber existing concepts to
   make the sequence contiguous.
5. If `999` is exhausted, freeze admission and revise the versioned naming profile. Never wrap or
   reuse a retired number.

A live generated view retains its ID while regenerated in place. Once deleted, a later derivation is a
new artifact and receives a new ID. Durable evidence, canonicals, and review history retain their IDs
through deprecation and correction.

## Scope and exceptions

Inside the bundle, only `index.md`, `log.md`, and `rd-types.json` have fixed reserved names. Raw
artifacts live outside the bundle and keep source identity. Template, schema, README, AGENTS, and other
repository infrastructure also live outside the governed concept tree; their own contracts name them.
Do not add a general `README.md` or `legacy` exemption inside the bundle because it creates an
unreviewed document class.

For an existing corpus, inventory references, approve one explicit migration, add the registry and
IDs, rename concepts, update every link/index entry, and establish the migrated commit as the new
integrity baseline. The normal `--base` gate deliberately rejects durable renames. Do not weaken it or
add a permanent legacy exemption to make migration convenient.

## Checker boundary

The checker can establish registry shape, filename and ID syntax, registry/code agreement, live bundle
uniqueness, and Git-visible preservation of admitted ID, type, role, and path. Relative to that Git
base, new IDs in each code/month must form the contiguous suffix above the prior maximum; existing
gaps remain legal and cannot be filled. The checker also rejects reuse of a base-visible ID at a
different path and preserves every mapping used by a snapshot concept. It cannot decide whether the
selected content type is scientifically apt, whether a title describes the content, whether two IDs
answer the same question, whether an ID or mapping absent from the comparison snapshot was reused, or
whether admission was justified. Those remain review and governance judgments.
