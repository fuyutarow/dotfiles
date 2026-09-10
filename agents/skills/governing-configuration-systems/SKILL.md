---
name: governing-configuration-systems
description: >-
  Governs executable configuration systems: classify consumer/trust, define source/effective
  declaration/authority, choose raw-byte or canonical integrity, and verify actual target input. Use
  for config architecture / JSON vs TOML / JSONC / JCS / canonicalization / signing / digest / gating /
  policy bundle / schema / configuration layering / decision event / 構成設計 / 設定ファイル設計 /
  TOMLかJSONか / 正規化 / 署名対象 / ダイジェスト / ゲート / ポリシー設定 / 設定スキーマ /
  設定の階層. DECISIVE: .claude settings/hooks/MCP mechanics → operating-the-harness
  (generic configuration-contract design may co-fire); repository layer/wiring → wiring-repositories;
  language manifest/parser implementation → writing-*; cross-format consumer/trust/effective-declaration/
  integrity contract → HERE; R&D authority →
  governing-research-documentation; high-consequence risk ledger → practicing-tiger-style.
  Workflow-native: contract and final acceptance stay SOLO; source facts and validator receipts may fan
  out. English skill; respond in the user's language (default Japanese).
---

# Governing configuration systems

> **Version**: v2609.1.0 (2026-09-10) — initial forge from a bounded primary-source position.

    test -f assets/configuration-contract.template.md
    test -f references/consumer-and-trust-regimes.md
    test -f references/canonicalization-and-representation.md
    test -f references/authority-events-and-lifecycle.md
    test -f references/verification-and-profiles.md
    test -f scripts/configuration-contract-check.ts
    test -f tests/configuration-contract-check.test.ts
    test -f tests/fixtures/valid-contract.md
    test -f tests/triggers.md
    test -f tests/local-failure-corpus.md
    test -f tests/forge-verification-ledger.md
    bun test tests/configuration-contract-check.test.ts
    bun scripts/configuration-contract-check.ts tests/fixtures/valid-contract.md
    bun ../forging-skills/scripts/skill-check.ts .

## Language

This skill is English; respond in the user's language.

Keep **LAW**, **CONFIGURATION CONTRACT**, **effective declaration**, **decision record**,
**raw-byte**, **canonical**, **profile**, **gate**, and **SOLO** stable.

## LAW — the SOLE owner of the CONFIGURATION CONTRACT

> Select a format only after naming the consumer and trust regime.
>
> Expose the effective declaration, authority, representation, validation boundary, and verifier.
>
> A byte digest binds bytes, not intent.
>
> A semantic digest binds intent only through a named profile and constrained data model.

This skill owns the **CONFIGURATION CONTRACT**.

The artifact distinguishes authored source, generated artifact, raw-byte signature, canonical
semantic signature, gate input, and decision record.

It does not choose repository layers or implement a target parser.

It never turns a comment into an approval.

Do not call a file “strict JSON” as though that names canonical bytes.

JSON grammar is not itself a canonical profile.

JCS is one named JSON profile, not a universal mandate.

TOML's multiple source notations do not make its parsed value model semantically ambiguous.

The bounded source position and skill-supplied rules live in
[forge-verification-ledger.md](tests/forge-verification-ledger.md).

## Gates — every gate leaves an artifact

| Gate | Decision | Required artifact / stop |
|---|---|---|
| **C1 CONSUMER** | Who consumes the data: human editor, generator, verifier, gate, or runtime? | Name consumer and trust regimes. Stop if “config” is the only answer. |
| **C2 BOUNDARY** | Does integrity bind exact authored bytes or a semantic value? | Raw-byte names encoding/byte profile. Canonical names profile/input restriction. Stop if the boundary is unnamed. |
| **C3 AUTHORITY** | What is effective now, who can change it, and where is an exception authoritative? | Always name effective declaration and writer. For gated input, write Decision record as record: or none:. Write Exception encoding as encoded: or none:. |
| **C4 INTERPRETATION** | How are source values parsed, rejected, merged, and versioned? | Name schema, duplicate-key policy, number/Unicode policy, and merge rule. |
| **C5 VERIFY** | What command proves this contract is accepted by the actual target? | Run a target path that consumes the named effective declaration. Retain positive and negative receipts. |

Start from [configuration-contract.template.md](assets/configuration-contract.template.md).

Run the contract checker before interpreting it.

The checker tests field presence and conditional profile obligations.

Use the named target validator for semantic acceptance.

## Workflow

1. Run C1. Select every applicable regime.
   A TOML source that generates signed JSON has more than one regime.
2. Run C2 before choosing a format.
   Read [consumer-and-trust-regimes.md](references/consumer-and-trust-regimes.md).
   Read [canonicalization-and-representation.md](references/canonicalization-and-representation.md).
3. Run C3–C4. Separate executable state from attributable reason when readers differ.
   Read [authority-events-and-lifecycle.md](references/authority-events-and-lifecycle.md).
4. Fill the contract and run its mechanical floor.
   Run a target path that consumes the effective declaration.
   Retain one accepted and one rejected receipt.
   Read [verification-and-profiles.md](references/verification-and-profiles.md).

## Execution model

Classification, representation choice, authority boundary, and final acceptance stay **SOLO**.

They trade off interoperability, editability, integrity, and recovery in one contract.

Source facts or validator receipts may **FAN-OUT** only as exact loci and raw output.

Agent agreement is not a canonicalization profile or an acceptance result.

No harness means the same map, serial.

## MUST-NOT-FIRE and routing

| Ask | Route |
|---|---|
| “Add one flag to this existing CLI config parser.” | implementing-and-debugging plus the language owner. |
| “How do I configure Claude Code hooks, permissions, or MCP?” | operating-the-harness. |
| “Which config layers and tasks should this repository install?” | wiring-repositories. |
| “Which Rust/Python/Julia manifest key or parser API should I use?” | The applicable writing-* skill. |
| “Write or reforge a SKILL.md.” | forging-skills. |
| “Select a high-risk release bound or exception policy.” | practicing-tiger-style. |
| “Explain TOML or JSON syntax without a design decision.” | Answer directly. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| [consumer-and-trust-regimes.md](references/consumer-and-trust-regimes.md) | Regime classifier and role separation | Classifying a new surface. |
| [canonicalization-and-representation.md](references/canonicalization-and-representation.md) | Raw-byte/semantic integrity and TOML boundary | Signing or digesting configuration. |
| [authority-events-and-lifecycle.md](references/authority-events-and-lifecycle.md) | Effective declarations and decision records | An exception or override needs audit. |
| [verification-and-profiles.md](references/verification-and-profiles.md) | Contract fields and acceptance receipts | Filling or reviewing a contract. |
| [triggers.md](tests/triggers.md) | Fire/no-fire desk-check cases | Editing the description. |
| [local-failure-corpus.md](tests/local-failure-corpus.md) | Gates justified by failures | Challenging a rule. |
| [forge-verification-ledger.md](tests/forge-verification-ledger.md) | Provenance and verification receipts | Freezing or reforging. |
