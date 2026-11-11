# Normative language and conformance

**Read when:** writing a specification, standard-like document, or conformance section that uses
requirement levels, or naming extension points.

**Source labels:** each item names its source. Most are single-source; the two-source item says so.
Apply a convention only with its source's rules.

## Choose a marking and declare it

The sources do not agree on how requirement keywords are marked. Choose one, state it in the
document's conventions line, and never write a general rule that all requirements must be upper-case.
[XS-C01, XS-C02]

- **IETF (BCP 14, RFC 2119 with RFC 8174).** Keywords have their defined meaning only when written in
  upper case; the same words in lower case carry their ordinary English meaning. [XS-C01] Source:
  IETF BCP 14.
- **W3C (2005 Recommendation).** Normative keywords are marked in bold lower case, and the list has
  ten words. [XS-C02] Source: W3C 2005 Recommendation, as captured.

The two keyword lists differ: BCP 14 has eleven words including NOT RECOMMENDED; the W3C list has
ten and omits it. [XS-C02, XS-C03] Declare the list you use.

## Equivalences and optionality (IETF)

- MUST, SHALL and REQUIRED mean the same; SHOULD and RECOMMENDED mean the same; MAY and OPTIONAL
  mean the same. [XS-C03] Source: IETF BCP 14 (RFC 2119 §1–§2, RFC 8174). The captured text does not
  state a difference between the three words of each pair, so do not state one.
- An optional item is truly optional and does not affect conformance. [XS-C04] Source: IETF BCP 14
  for MAY; W3C 2005 for the same point. Two sources is below the threshold for a principle.

## Normative and non-normative parts (W3C)

- Separate normative from non-normative parts. In non-normative sections avoid normative keyword
  wording. [XS-C05] Source: W3C 2005 only.

## Conformance clauses (W3C)

- A conformance clause states the kind of product the requirements apply to and the date of the
  conformance claim, and uses a single conformance label. [XS-C06] Source: W3C 2005 only.

## Extension naming (OpenAPI 3.1.1)

- Extension names begin with `x-`; the prefixes `x-oai-` and `x-oas-` are reserved. Additional
  properties of a Schema Object may omit the prefix. [XS-C07] Source: OpenAPI 3.1.1 §4.9 (MUST),
  §4.8.24.2–4.8.24.3 (MAY). This is not a requirement that every extension in every specification
  carry `x-`.

## Version semantics

- Meanings of the three parts of a version number differ between sources (patch means different
  things in SemVer and OpenAPI). [XS-C08] Those semantics are owned by `designing-version-schemes`;
  this document states the version and scope it describes (XS-P07) and points there.
