---
name: designing-command-line-interfaces
description: >-
  Designs and audits reusable CLI contracts: CLI design / CLI設計 / コマンド設計; subcommands,
  arguments/flags, help, stdin/stdout/stderr, exit status / 終了コード, machine-readable output,
  TTY/noninteractive, dry-run/force, partial failure, and compatibility. Produces one CLI CONTRACT
  joining invocation, effects, channels, outcomes, and evolution. Cuts: interaction meaning or
  reversibility → designing-interactions; one failure's message/locus/recovery card → designing-developer-diagnostics;
  config authority → governing-configuration-systems; version identifiers → designing-version-schemes;
  implementation → implementing-and-debugging/writing-*; existing CLI usage → driving-*; launch →
  growing-oss-adoption. Workflow-native: contract decisions and acceptance stay SOLO; inventories and
  transcript receipts may fan out. English skill; respond in the user's language.
---

# Designing command-line interfaces

> **Version**: v2609.1.0 (2026-09-18) — initial forge from a bounded primary-source position.

```sh
for f in \
  assets/cli-contract.template.md \
  references/{invocation-and-discovery,effects-and-recovery,channels-and-outcomes,evolution-and-verification}.md \
  scripts/cli-contract-check.ts \
  tests/{cli-contract-check.test,triggers,local-failure-corpus,forge-verification-ledger}.md \
  tests/fixtures/valid-contract.md
do
  test -f "$f" || echo "MISSING $f"
done
SCRIPT_FLOOR=../writing-bun-scripts/scripts/script-check.ts
SKILL_FLOOR=../forging-skills/scripts/skill-check.ts
bun test tests/cli-contract-check.test.ts && bun scripts/cli-contract-check.ts tests/fixtures/valid-contract.md
bun "$SCRIPT_FLOOR" scripts/cli-contract-check.ts && bun "$SKILL_FLOOR" .
```

## Language

This skill is English; respond in the user's language.

| Stable tokens |
|---|
| **LAW**, **CLI CONTRACT**, **gate C0–C5**, **consumer regime**, **parser profile**, **effect boundary**, **machine mode**, **outcome class**, **compatibility promise**, **receipt**, **SOLO** |

## LAW — the SOLE owner of the CLI CONTRACT

> A CLI is a multi-consumer protocol, not a bag of flags. Before implementation, declare who
> consumes it and make invocation, effects, channels, outcomes, and evolution agree. A flag name,
> format name, or exit number never supplies its own semantics.

This skill owns one **CLI CONTRACT**. It covers command-wide protocol behavior, not the meaning of
one interaction or one diagnostic.

## Gates — every gate leaves a CLI CONTRACT section

| Gate | Decision | Required artifact / stop |
|---|---|---|
| **C0 CONSUMERS** | Which human, shell, CI, agent, or other caller regimes are supported? | Consumer/regime table; stop if the answer is only “users”. |
| **C1 INVOCATION** | What grammar, parser profile, ordering, repetition, `--`, stdin, help, and examples are promised? | Invocation table and ambiguous/invalid cases. |
| **C2 EFFECTS** | What effects, preview fidelity, force bypass, partial state, retry, and cancellation are promised? | Effects/recovery table. Action reversibility itself → `designing-interactions`. |
| **C3 CHANNELS** | What belongs on stdout/stderr in human or machine modes, under TTY/non-TTY, with framing and compatibility? | Channel/mode matrix. A format name alone fails. |
| **C4 OUTCOMES** | Which caller-relevant outcomes map to exit, status, output, and retry? | Outcome matrix. One diagnostic card → `designing-developer-diagnostics`. |
| **C5 EVOLUTION** | Which surfaces are stable, extensible, deprecated, or versioned, and what proves them? | Compatibility table plus positive and negative transcript receipts. Release identifier semantics → `designing-version-schemes`. |

## Workflow

1. Name C0 consumers before choosing flags or formats. Start from `assets/cli-contract.template.md`.
2. Fill C1–C5 as one contract. Read the reference matching the current gate.
   Never universalize a parser profile, format, exit number, `dry-run`, or precedence chain.
3. Run `bun scripts/cli-contract-check.ts <contract>`. It is a structural floor, not semantic proof.
4. Probe the stated command path. Retain one accepted and one rejected transcript receipt.
5. A signer compares the receipts to the frozen contract before acceptance.

## Execution model

Inventory commands, modes, effects, and outcomes may **FAN-OUT** read-only as exact rows. C0–C5
trade-offs and final acceptance stay **SOLO**. Positive and negative transcript probes may fan out
when independent. Evidence is **CITATION-RELAY**: a relayed inventory or receipt includes its exact
locus or command/output/exit. No harness → same map, serial.

## MUST-NOT-FIRE and routing

| Ask | Route |
|---|---|
| “Which `codex exec` flag should I use?” or another one-shot existing-CLI invocation. | `driving-*`; usage is not a reusable surface design. |
| “Polish this error sentence.” | `linting-prose`; a known failure class may then use `designing-developer-diagnostics`. |
| “Choose SemVer or CalVer.” | `designing-version-schemes`. |
| “Canonicalize or sign this config.” | `governing-configuration-systems`. |
| “Launch or distribute this CLI.” | `growing-oss-adoption`. |
| A one-shot shell pipeline. | Use the shell directly; no contract is being kept. |
| “Implement this agreed CLI.” | `implementing-and-debugging` plus the language owner. |

Ordered co-fires:

| Situation | Order |
|---|---|
| Destructive CLI | `designing-interactions` → this skill |
| Known failure diagnostic | This outcome map → `designing-developer-diagnostics` |
| Config precedence | `governing-configuration-systems` → this skill |
| Unsettled CLI interface | This skill → `implementing-and-debugging` / `writing-*` |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/invocation-and-discovery.md` | C0–C1 consumer, parser-profile, discovery, and input rules | Choosing consumers or invocation grammar. |
| `references/effects-and-recovery.md` | C2 effects, preview, force, partial state, continuation, retry, cancellation | An action can change state or process many items. |
| `references/channels-and-outcomes.md` | C3–C4 stream/mode and outcome rules | Allocating stdout/stderr, machine output, or exit behavior. |
| `references/evolution-and-verification.md` | C5 compatibility, receipts, sources, and limits | Making an evolution promise or accepting a contract. |
| `scripts/cli-contract-check.ts` | Mechanical structural floor | After filling a contract; run, do not read as semantic proof. |
| `tests/triggers.md` | F3 fire/no-fire desk-check | Editing the description or cuts. |
| `tests/local-failure-corpus.md` | Failure cases motivating gates | Challenging a gate. |
| `tests/forge-verification-ledger.md` | SOLE provenance, calibration, and verification record | Reforging or assessing acceptance. |

