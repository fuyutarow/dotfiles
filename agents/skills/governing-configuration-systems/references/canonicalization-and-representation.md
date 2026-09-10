# Canonicalization and representation

> **SOLE owner** of raw-byte versus canonical semantic boundaries.

The target owns its schema and verifier.

## Pick the integrity object

| Object | Pipeline | Formatting edit | Required details |
|---|---|---|---|
| Raw bytes | Author bytes → digest/signature | Invalidates by design. | Encoding, line endings, byte-order mark, scope, signer, verifier. |
| Canonical value | Parse → validate → canonicalize → digest/signature | May retain protected value. | Grammar, schema, duplicate policy, number/Unicode policy, profile, input. |

Do not sign parsed data and call it canonical without naming a serializer.

Do not canonicalize unvalidated data and call it accepted policy.

A digest alone establishes neither signer authorization nor gate acceptance.

## JSON is not automatically canonical

RFC 8259 permits insignificant whitespace and multiple escape forms.

Object-member order can be observable to an application.

Therefore “strict JSON” is not a sufficient semantic-integrity profile.

If JCS is selected, name its version and input constraints.

| JCS-sensitive input | Contract decision |
|---|---|
| Duplicate names | Reject before canonicalization. |
| Numbers | Constrain to the profile's supported model. |
| Unicode | State the profile's string-preservation policy. |
| Objects | Sort properties recursively. |
| Arrays | Preserve element order. |

JCS is not a signature protocol or application schema.

JWS signs a defined encoded input.

Application-level signature acceptance remains an application decision.

## TOML is a source format

TOML v1.0.0 maps unambiguously to a hash table.

Its dotted keys, tables, inline tables, arrays, and comments are source choices.

Those choices do not make parsed values ambiguous.

A semantic TOML digest needs a named parse-to-value mapping and serializer.

TOML v1.0.0 does not supply that profile here.

Choose TOML when its editing model and ecosystem fit the consumer.

Choose JSON plus a named profile only when canonical JSON bytes are required.

## Profile selection checks

| Situation | Representation details to name |
|---|---|
| JSON plus JCS | JCS version, I-JSON rules, schema, number/Unicode policy, signature input. |
| Raw TOML or JSON | Exact bytes, encoding, line endings, formatter policy, verifier input. |
| Parsed TOML semantic digest | Parser/version, type mapping, serializer, schema, duplicate/error behavior. |
| Generated lock or rendered config | Inputs, writer/version, hand-edit policy, regeneration, validator. |
| Layered local/shared config | Discovery paths, precedence, merge/replace/error behavior, resolved-output test. |

## X.509 comparison boundary

An X.509 certificate profile signs a DER-encoded certificate component.

The useful analogy is only that integrity needs specified bytes.

It does not make JCS DER or a JSON config an X.509 certificate.
