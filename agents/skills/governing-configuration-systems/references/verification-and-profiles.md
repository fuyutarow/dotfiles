# Verification and profiles

> **SOLE owner** of CONFIGURATION CONTRACT fields and acceptance receipts.

It does not invent a target parser, schema, or cryptographic verifier.

## Contract field meanings

| Field | It answers |
|---|---|
| Consumer / authority / writer | Who reads it and who produces the effective value? |
| Effective configuration / source representation | Which artifact operates and which syntax creates it? |
| Trust regime / signature-digest input | Is it authored, generated, raw-byte signed, canonical, or gated? |
| Canonicalization profile | Which named algorithm/version produces protected bytes? |
| Schema / duplicate-key / number-Unicode policy | Which inputs have one accepted interpretation? |
| Precedence / merge | Which source wins and what happens to conflicts? |
| Decision record / exception encoding | Where do rationale, authority, scope, and expiry live? |
| Verification command / positive-negative cases | How does the target consume the effective declaration and reject input? |

Run the mechanical floor:

    bun scripts/configuration-contract-check.ts path/to/CONFIGURATION-CONTRACT.md

It rejects absent fields and unknown trust regimes.

It also checks conditional raw-byte, canonical-profile, and gated-decision fields.

Gated inputs use record: or none: for decision records.

They use encoded: or none: for exception encoding.

It cannot validate a signature, target schema, or actual merge behavior.

Representation choices belong to
[canonicalization-and-representation.md](canonicalization-and-representation.md).

## Acceptance receipt

| Receipt field | Required value |
|---|---|
| CONFIGURATION ACCEPTANCE | Receipt marker. |
| CONTRACT | Path and digest. |
| TARGET VALIDATOR | Exact command. |
| PROFILE / SCHEMA | Named versions. |
| POSITIVE INPUT | Fixture/locator and verbatim pass output. |
| NEGATIVE INPUT | Fixture/locator and verbatim reject output. |
| RESIDUAL | What the target validator does not prove. |

For a signature boundary, include protected bytes and signer/key trust evidence.

For layered configuration, expose resolved output or another precedence observable.

The validator must consume the named effective declaration, not only an authored source file.

A green contract floor is not an acceptance receipt.
