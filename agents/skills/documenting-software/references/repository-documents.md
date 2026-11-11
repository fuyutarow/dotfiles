# Repository-level documents

**Read when:** creating or auditing the repository-level README, contribution guide, security policy
or project site for a hosted or OpenSSF-targeted project.

**Source labels:** each item is single-source or two-source, as marked. The sources describe
platform behaviour and assessment criteria, not requirements of this house.

## Placement and display (GitHub Docs)

- A repository's documents are looked up in `.github`, then the root, then `docs`. [XS-C12]
- A README is displayed truncated when its content exceeds 500 KiB. [XS-C12] Keep the README within
  that size, or move detail to a linked document.
- These are behaviour observed at capture time; re-check them against the current platform before
  relying on them. [XS-C12]

## OpenSSF passing criteria (single source)

- The project site presents the software's content, how to obtain it, how to give feedback, and how
  to contribute. [XS-C13]
- Vulnerability reporting steps are published. [XS-C13]
- For reports in the last six months, the first response is within fourteen days. [XS-C13]
- Scope is the passing level only. Having a SECURITY file is not the same as meeting that level.
  [XS-C13] Do not claim a level was met without running its criteria.

## Basic repository document set (two sources, below threshold)

- An overview, a contribution method and a vulnerability-reporting procedure form a basic set. [XS-C14]
  GitHub Docs describes them as typically included; OpenSSF states them as criteria. Two sources
  is below the threshold for a principle, so this is a convention: adopt it by declaration, not as a
  requirement of this skill.
