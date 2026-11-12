# Changelog and commit-message grammars

**Read when:** the repository declares a changelog format or a commit-message grammar, or when a
changelog is being created or reviewed. Repository instructions override these grammars.

**Source labels:** each item is single-source. A grammar is a property of the repository that adopts
it; none is a universal rule.

## Changelog categories (Keep a Changelog 1.1.0)

- Category headings: Added, Changed, Deprecated, Removed, Fixed, Security. [XS-C11]
- An Unreleased section comes first; versions run newest first. [XS-C11]
- Deprecated and Removed are separate categories, so a notice of a coming removal is recorded apart
  from the removal itself. The timing advice is SemVer's advice, not MUST. [XS-P08, XS-C11]
- The source does not state the heading format beyond these names; do not invent one.

## Commit subjects (Conventional Commits 1.0.0)

- Form: `type(scope): description`. A breaking change is marked by a footer or by `!` after the type.
  [XS-C09]
- Correlation the source states: `feat` relates to MINOR and `fix` to PATCH in semantic versioning.
  The correlation is not a version rule of this skill. [XS-C09]
- The source states the grammar only; it does not say how to enforce it. [XS-C09]

## Conflict to declare

Keep a Changelog groups entries into six categories; Conventional Commits centres on two types
(`feat` and `fix`). When both apply to one repository, state how a commit's type maps to a changelog
category. [XS-C09, XS-C11]

## Contribution commit subjects (GitLab)

- A contribution commit subject is three to five words, capitalized at the start, with no full stop
  at the end. [XS-C10] Source: GitLab documentation contribution procedure. It is a procedure for
  contributors, not a criterion for completeness.
