# Process, kind names and checks

**Read when:** deciding how to name a document kind, which checks a document must pass, how often it is
updated, or whether to start from a template.

**Source labels:** each item is single-source or two-source, as marked.

## Diátaxis decision questions (single source)

- A document's kind is decided by two questions: whether it is about action or cognition, and whether
  the reader is acquiring or applying. [XS-C26] Source: Diátaxis. The captured text does not say the
  two-axis logic is valid; use it as the source's method, not as proof.
- Diátaxis builds documentation in small, responsive iterations that reveal a pattern, rather than
  by planning top-down first. [XS-C27] Source: Diátaxis. This is the source's method; no effect is
  measured.

## Kind names (the correspondence is inference)

The four-way kind split is cross-source, but the names differ: Diátaxis uses tutorial, how-to,
reference and explanation; Django uses tutorial, how-to, reference and topic; Kubernetes uses concept,
task, tutorial and reference; GitLab uses Concept, Task, Reference and Troubleshooting; the Good Docs
Project uses quickstart, how-to, concept and reference. Troubleshooting in GitLab is outside the four.
Whether two names are the same kind is not stated by the sources. [XS-S01] State the names you use.

## Checks

- Django: spelling and link checks run in CI and must pass. [XS-C23]
- GitLab: suggests trying Vale. [XS-C23]
- The two sources name different tools and different strengths. Declare the check the repository
  uses. [XS-C23]

## Update cadence (WTD, single source)

- A wrong document is worse than a missing one. [XS-C28] This is one of WTD's principles; it is not
  ranked against the others in the captured text, so do not use it to override another principle.
- When software changes faster than its documents, users suffer, so keep documents current. [XS-C29]
  No measure is given.
- Documentation begins before development (precursory). Two sources point the same way, but neither
  states the relation in time, so this is inference. [XS-C30]

## Templates

- The Good Docs Project's templates have fixed heading counts: README fifteen, quickstart seven,
  how-to five, concept four, reference three; API reference overview eight, resources four,
  endpoints twelve. [XS-C31] These describe the templates only; they are not a standard,
  and a template is a starting point to adapt, not a target count.
