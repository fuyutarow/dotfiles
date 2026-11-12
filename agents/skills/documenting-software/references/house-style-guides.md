# Named style guides

**Read when:** writing for one of the named guides below, or when the repository adopts it. Each
section applies only to its guide.

**Source labels:** each section is single-source (one guide). A guide's self-declared strength is
stated in its section; a guide that calls itself guidelines is not a rule of this house.

## Kubernetes documentation (Kubernetes project)

- Self-declared: guidelines, not rules. [XS-P01]
- A concept document's "what's next" list has at most five bullets. [XS-C19]
- Reference pages are generated from the commands of the component tools. [XS-C19]
- Placeholders use angle brackets; inline code uses single backticks; API kind names are not
  backticked; API object names use UpperCamelCase. [XS-C20]
- Third-party content may be listed only under the project's stated conditions, and where content
  already exists inside the project, link to it rather than copy it. [XS-C41] This source-specific
  guidance does not prohibit local examples or explanatory summaries.
- The style guide does not state whether lint or CI enforces these forms. [XS-C20 limit]

## MDN Web Docs (Mozilla)

- The page type is identified by a `page-type` key in the front matter. [XS-C21]
- Headings do not skip levels. [XS-C21]
- Sentence-case headings, and straight quotation marks only. [XS-C21]
- Enforcement strength is not confirmed in the captured text. [XS-C21 limit]

## Django documentation (Django project)

- Written in reStructuredText; wrap at 80 characters except code examples. [XS-C22]
- A new-feature note goes at the start of the section; a changed-behaviour note goes at the end.
  [XS-C22]
- Spelling and link checks must pass in CI. [XS-C23] A how-to document puts the user's goal first.
  [XS-C42] (Single source: treat as the Django project's order.)
- These are "should" rules in Django's own guide; the CI check is "must pass". [XS-C22, XS-C23]

## Google developer documentation style guide

- US spelling, written for a global audience, addressed to "you". [XS-C25]
- Reference order: project-specific guidance first, then this guide, then third-party references, and
  deviations from the guide are applied consistently across the document. [XS-C24]
- Self-declared: guidelines, not rules. [XS-P01]
- Passive voice and other sentence rules differ across guides (XS-P09); apply the adopted guide
  within its scope. Sentence checks belong to `linting-prose`.

## GitLab documentation

- Topic types: Concept, Task, Reference, Troubleshooting. A page starts with a Concept and continues
  with a Task or Reference. [XS-C40]
- Related topics sit above Troubleshooting; avoid a topic of only one or two sentences. [XS-C40]
- The guide frames these as suggestions and allowances, not requirements. [XS-C40]
- The guide suggests trying Vale for prose checks; Django requires its check in CI. Declare which
  applies to the repository. [XS-C23]
