# Decision record layouts by lineage

**Read when:** writing an ADR, RFC, PEP-style or design-proposal record in a named lineage. The body
layout for a decision record in general is the "Understand a decision" row of SKILL.md; this file gives the
lineage details. Do not treat any lineage's template as a standard.

**Source labels:** each lineage is single-source unless marked. Nygard-style records combine an
article and a summary site; the summary is not the article's wording.

## Nygard-style ADR

- Status values are proposed, accepted, deprecated and superseded. A superseded record names its
  replacement. [XS-C32] Source: Nygard's article (descriptive) and the adr.github.io summary.
- Numbering increases sequentially; the example path is `doc/arch/adr-NNN.md`; a record is one to
  two pages as a guide. [XS-C32] The path is an example, not a requirement.
- The status-transition rules are not stated in the captured text. [XS-C32 limit]
- The five headings Title, Context, Decision, Status, Consequences come from the adr.github.io
  summary, not the article's wording. [XS-S04]
- Context in Nygard's sense is a statement of fact, not a rationale. Rationale and alternatives
  come from other lineages. [XS-P06]

## Rust RFC

- The RFC template has nine sections: Summary, Motivation, Guide-level explanation,
  Reference-level explanation, Drawbacks, Rationale and alternatives, Prior art, Unresolved
  questions, Future possibilities. [XS-C34] Source: Rust 0000-template (a template).
- Whether Prior art is required is not stated in the captured text. [XS-C34 limit]

## Python PEP 1

- A PEP has ten sections; the wording is should-level. [XS-C35] The full names of all ten are not in
  the captured text.
- Rationale includes alternatives and related work. [XS-P06]
- Rejected or withdrawn PEPs are kept, because the record of rejection matters. [XS-C36]

## Ecma TC39 stage process

- States run from Stage 0 to Stage 4. Champions are responsible for a proposal from Stage 0 through
  Stage 4; maintenance moves to an editor group after Stage 4. [XS-C37]
- The transfer procedure is not captured. [XS-C37 limit]

## Status values are not interchangeable

Nygard lists four values with no rejected; PEP 1 lists nine including Rejected; TC39 uses Stage 0 to 4;
Rust uses merge, close and postpone. The correspondence between sets is not stated by the sources.
Declare the set your document uses rather than assuming a shared state machine. This is a local
precaution: XS-C33's DPR-085 locator does not support the claimed correspondence judgment; the
source audit records that defect. The captured enumerations do not establish current process rules.

## Keeping rejected and withdrawn records

- Nygard's superseded records keep the old decision; PEP 1 says the record of rejection matters. Two
  lineages state this in the same sense, below the threshold for a principle, so keep rejected
  records by declaration. [XS-C36]
