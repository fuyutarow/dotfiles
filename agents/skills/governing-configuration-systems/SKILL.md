---
name: governing-configuration-systems
description: >-
  Governs configuration integrity and authority. Choose representation only after naming its
  consumer and trust regime; bind integrity to exact bytes or a named canonical value profile;
  identify the effective declaration and its authority, then verify what the target actually
  consumes. Use for configuration interpretation editions, signed configuration, policy bundles,
  canonicalization, and authority contracts. CLI configuration sourcing belongs to designing-command-line-interfaces;
  repository wiring and language-specific parser implementation belong to their owners.
---

# Governing configuration systems

Choose representation after identifying the consumer and trust regime. Bind integrity to exact
bytes or to a named canonical value profile. Identify the effective declaration and its authority,
then verify what the target actually consumes.

> **Version**: v2610.3.0 (2026-10-30) — edition admission and compatibility decisions.

## Decisions

- Name the consumer, writer and trust regime before choosing a format: for example, human-edited,
  generated, signed or gate-consumed configuration. Identify the authored source, generated
  artifact and effective input where applicable.
- For raw-byte integrity, specify the protected byte range, encoding, line endings, BOM treatment,
  signer and verifier. For value integrity, specify the accepted grammar and schema, duplicate-key,
  number and Unicode policies, and the named canonical profile and serializer that produce the
  protected bytes. JSON syntax alone, including strict JSON, does not define canonical bytes.
- Identify who can change the effective declaration. Distinguish the values the target consumes
  from any decision record explaining authority, change, rationale, scope and expiry. When a
  signature is involved, identify the protected bytes and evidence for signer and key trust.
- Verify using the actual target path and named effective input, including accepted and rejected
  cases. For layered input, observe the resolved result; retain evidence sufficient to identify the
  input, target and outcome.
- When configuration outlives a reader upgrade, identify the interpretation selector and supported
  editions; reuse an existing selector and follow vendor-owned formats. Define how missing and
  unsupported selectors are handled before interpreting or activating values. For a change, compare
  the old and new readers' effective values and make migration and activation explicit; test the
  supported and rejected paths with the actual consumer.

These are domain applications of `base-usecase-first`: use it for contract design, type and
parser and state invariants, parser enforcement, and acceptance evidence.

For CLI configuration sourcing, precedence and XDG, use `designing-command-line-interfaces`;
its conditional defaults are grounded in [CLIG configuration](https://clig.dev/#configuration)
and [environment variables](https://clig.dev/#environment-variables). Repository layers and
wiring belong to `wiring-repositories`; language-specific formats and parser APIs belong to the
applicable `writing-*` skill. For Claude settings, hooks and MCP mechanics, inspect the declared
local configuration and executable checks.
