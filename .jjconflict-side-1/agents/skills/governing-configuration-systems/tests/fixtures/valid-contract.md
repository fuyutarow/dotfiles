# CONFIGURATION CONTRACT

- Consumer: package installer and policy verifier
- Authority / writer: deterministic resolver service
- Effective configuration: dist/policy.json
- Source representation: TOML declaration rendered to JSON
- Trust regime: human-authored, generated, signed-canonical, gated-decision
- Signature / digest input: canonical: UTF-8 bytes emitted after JCS
- Canonicalization profile: RFC 8785 JCS
- Schema / version: policy.schema.json v3
- Duplicate-key policy: reject before canonicalization
- Number / Unicode policy: IEEE 754 binary64; preserve Unicode strings as profile requires
- Precedence / merge: project source overrides global defaults; rules arrays replace; conflicting scalar values reject
- Decision record: record: decisions/policy-rulings.jsonl
- Exception encoding: encoded: signed exception object with owner and expiry
- Verification command: tool verify-policy --config dist/policy.json --signature dist/policy.jws
- Positive case: tests/fixtures/accepted-policy.json
- Negative case: tests/fixtures/duplicate-key-policy.json must be rejected before signing
