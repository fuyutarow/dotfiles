# CONFIGURATION CONTRACT

Copy this file into the target design record and replace every angle-bracket value. The mechanical
floor rejects placeholders. This contract describes a configuration system; it is not the signed
configuration artifact itself.

- Consumer: <human editor / generator / verifier / runtime>
- Authority / writer: <human role, service, or deterministic generator>
- Effective configuration: <path, endpoint, or generated artifact>
- Source representation: <TOML / JSON / generated JSON / other named format>
- Trust regime: <comma-separated human-authored, generated, signed-raw, signed-canonical, gated-decision>
- Signature / digest input: <n/a, raw-byte: UTF-8 bytes with line-ending policy, or canonical: named profile output>
- Canonicalization profile: <n/a or named profile and version, e.g. RFC 8785 JCS>
- Schema / version: <schema identity and version>
- Duplicate-key policy: <reject / exact target behavior>
- Number / Unicode policy: <exact precision, range, and Unicode handling>
- Precedence / merge: <source order plus per-field merge/replace/error behavior>
- Decision record: <none: effective declaration writer is sole authority, or record: authoritative rationale/approval/expiry record>
- Exception encoding: <none: target rejects exceptions, or encoded: machine-readable exception/expiry/owner representation>
- Verification command: <target command that validates the effective input>
- Positive case: <accepted fixture or input>
- Negative case: <rejected fixture or input and expected failure>
