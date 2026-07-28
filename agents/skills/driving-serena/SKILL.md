---
name: driving-serena
description: >-
  Drives Serena MCP / セレナ:
  wrong project/cwd, Serena LSP coverage, health-check/index, stale onboarding/memory integrity,
  symbols/refactors, parse failures, Serena-owned FD/process
  exhaustion, or Serena+ccc triage→here first. LAW: LIVE-CONTRACT-FIRST — read
  `initial_instructions` and live
  schemas; PROJECT-CAPABILITY — prove the target locus;
  MEMORY-IS-CACHE — reconcile memories with canonical files. Cuts: MCP registration / trust /
  handshake → operating-the-harness (stop); install/pin/version/help → running-python-tools
  (stop); direct memory CRUD → live Serena tool (stop); unknown concept → driving-cocoindex;
  exhaustive lexical occurrences → rg; known semantic
  symbol → here. Before a Serena EDIT: feature/bugfix → implementing-and-debugging;
  behavior-preserving refactor → refactoring-code. Julia code/experiment → writing-julia, Serena
  Julia-LSP capability → here; Serena's Python source → implementing-and-debugging + writing-python
  (stop). English skill; respond in the user's language (default Japanese).
---

# Driving Serena — prove the symbolic service before trusting it

> **Version**: v2607.1.0 (2026-07-27). Live-session evidence plus current official Serena docs.
> **Scope**: Serena capability, project state, memory hygiene, and resource-safe operation.

> **Build order (atomic; run from this Skill directory):**

```bash
test -f references/operations.md || echo MISSING operations; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

Fast-moving tool names, schemas, client syntax, versions, and platform limits live outside this
body. Read the live contract or the dated ledger; a static catalog here is a bug.

## Language

Keep these tokens stable:

```text
LIVE-CONTRACT-FIRST
PROJECT-CAPABILITY
ROUTE-BY-OPERATION-SHAPE
RESOURCE-BUDGET
MEMORY-IS-CACHE
CAPABILITY RECEIPT
fire / no-fire
```

## THE LAW

> A listed Serena tool is not proof that Serena can analyze the target code. Once routing selects
> Serena, read the live contract before its first call. Prove the active project and actual target
> locus before a load-bearing semantic claim. Treat memories as caches and resident services as
> resource consumers. Never trade an unverified fallback for a symbolic guarantee.

The Serena MCP server owns current tool semantics. This skill owns the surrounding checks and
routing between Serena, native tools, CocoIndex, and change-discipline skills.

## Gates SR1–SR6

| Gate | Required action | Artifact |
|---|---|---|
| **SR1 LIVE CONTRACT** | Before the first Serena call, read `initial_instructions` once per server session. Discover each needed schema before calling it. Missing or dead tools route to `operating-the-harness`. | `{client, transport, server_pid, server_start, context, active_project, operation}` |
| **SR2 PROJECT-CAPABILITY** | Prove root, backend, and the actual load-bearing locus. Treat health check as a sample. Probe the target file/symbol and require the observed result to match the expected locus/result; nonempty alone never passes. Repeat for each locus/language the claim depends on. | **CAPABILITY RECEIPT** `{session, backend, root, language, target_file, target_symbol, operation, expected_result, observed_result}` |
| **SR3 ROUTE** | Name the operation shape before choosing a tool. Follow the routing table below. | `OPERATION-SHAPE=<shape> → <route>` |
| **SR4 MUTATE** | Follow the live manual's retrieval and reference checks. Use a dedicated semantic refactor when available; otherwise state the weaker guarantee before editing. | `{retrieval_locus, operation_receipt}` |
| **SR5 RESOURCE-BUDGET** | On spawn/FD errors, process multiplication, or heavy-service coexistence, inspect ownership and headroom first. Stop only revalidated task-owned identities. | `{owner_pid, owner_start, transport, limit, used_fds, relevant_children, pre_state, action, post_state}` |
| **SR6 MEMORY-IS-CACHE** | Verify every load-bearing memory claim against its canonical file or command. Write only durable facts, then run the live memory checker. | `{memory, canonical_locus, checked_fact}` |

No gate artifact means no semantic-capability claim. A protocol-success result proves only the
returned locus. It does not prove completeness, another target, correctness, freshness, or safety.

## ROUTE-BY-OPERATION-SHAPE — SOLE owner

| Operation shape | Route |
|---|---|
| literal string, regex, exhaustive lexical occurrences, config, docs, git, tests | native search/read/shell tools |
| concept known, identifier unknown | `driving-cocoindex` or an Explore pass; hand the exact symbol to Serena |
| multi-line structural text shape, not a semantic symbol relation | `driving-cocoindex` structural search |
| exact symbol, member outline, semantically resolved declaration/implementation/reference | Serena query under SR1–SR3 |
| semantic symbol edit after the change owner selects it | Serena mutation under SR1–SR4 |
| feature, bugfix, performance change | `implementing-and-debugging` selects the instrument and authorizes any Serena edit |
| behavior-preserving structural change | `refactoring-code` selects the instrument and authorizes any Serena edit |
| Julia code or recordable experiment | `writing-julia`; Serena's Julia-LSP capability remains here |
| MCP scope, trust, registration, handshake, or missing tools | `operating-the-harness` first |

This table owns the cut. Sibling descriptions may mirror it in substance; do not require
byte-identical wording.

## Operating loop

1. Classify the operation shape and load its owner skill.
2. If the user requests Serena diagnosis or the owner selects Serena, establish SR1.
3. Establish SR2 at the actual target locus before a semantic conclusion or edit.
4. Follow the live Serena manual for retrieval, references, and mutation.
5. Run the task's real oracle; report the capability receipt separately from the behavior result.
6. Refresh relevant memories only after the canonical state is green.

Read [`references/operations.md`](references/operations.md) for activation, indexing, and memory
repair. Also read it for migration acceptance or resource failure.

## Resource failure branch

Do not react to an FD error by repeatedly spawning servers. Measure the client owner, its limits,
open descriptors, and Serena/CocoIndex/LSP children. Establish process ownership before any stop.

When two heavy services interfere, validate one service in isolation, then reintroduce the other
once. `driving-cocoindex` owns its daemon commands. Leave unrelated sessions and their processes
untouched. A transient limit increase is evidence for the diagnosis, not a durable fix.

## Acceptance

[`references/operations.md`](references/operations.md) §5 is the sole acceptance matrix. Keep
diagnosis separate from external harness handoff/repair. Keep activation, target capability,
index, memory, and edit separate. Durable resource repair is its own receipt. Server processes
may retain startup state; restart them by transport, not merely by reconnecting a client.

## Gotchas

| Symptom | Wrong inference | Next action |
|---|---|---|
| tools are listed | "Serena is ready" | SR1 then SR2 |
| target language appears in config | "the LSP works" | health check plus actual target-locus probe |
| Serena reports a successful rename | "behavior is preserved" | run the owner skill's behavior oracle |
| Serena's Julia probe passes | "the Julia program is correct" | run `writing-julia`'s task oracle |
| project index completed | "the live server sees it" | cold-probe the same target on a fresh server PID |
| memory checker exits zero | "memory facts are current" | inspect findings, then compare each claim to its source |
| teardown prints a stack fragment | "the whole index failed" or "all is fine" | adjudicate report, log, failures, and cold probe |
| many Serena processes exist | "kill them all" | revalidate ownership; use the owner's graceful path |

## MUST-NOT-FIRE — F3 trigger set

FIRES:

| Ask | Why |
|---|---|
| 「Serena が Julia language server 0件。シンボル解析まで直して」 | SR2 language-capability failure |
| "Serena tools show up, but TypeScript parsing fails in this repo" | listed is not capable |
| 「実験前に Serena と CocoIndex を整えたいが FD 枯渇で新規プロセスが起動しない」 | SR5 plus the cross-service seam |
| "The active Serena project is the wrong cwd; prove the right repo before editing" | SR1/SR2 project identity |
| 「Serena memory のコマンドが古い。正本と照合して整備して」 | SR6 cache reconciliation |
| "Use Serena to rename an overloaded method across the repo and prove references were handled" | non-trivial semantic refactor |
| "The new project.yml works in a standalone health check but this task still sees the old language set" | startup-state/server-restart failure |

MUST NOT fire:

| Ask | Route |
|---|---|
| "What is Serena?" | plain answer |
| "Find every literal TODO" | native grep/search |
| 「識別子不明。レート制限に相当する実装を概念検索して」 | `driving-cocoindex` |
| "Serena MCP handshake fails and no tools load" | `operating-the-harness` first |
| 「Julia の数値実験を実装して回して」 | `implementing-and-debugging` then `writing-julia` |
| "Refactor this God class without changing behavior" | `refactoring-code` first |
| "List or delete this named Serena memory; no freshness claim" | direct live memory operation |
| "Install, pin, upgrade, or print Serena's version/help" | `running-python-tools` |
| "The OS is generally out of file descriptors; no Serena-owned child is implicated" | owning system/harness diagnosis |
| "Edit the Serena client registration or its declarative renderer" | `operating-the-harness` |
| "Fix a bug in Serena's own Python source" | `implementing-and-debugging` then `writing-python` |

CO-FIRE, ordered:

| Ask | Order |
|---|---|
| Serena+CocoIndex resource failure | `operating-the-harness` liveness → this SR5 → `driving-cocoindex` daemon operation |
| behavior-changing fix on a known symbol | `implementing-and-debugging` selects Serena → SR1–SR4 → behavior oracle |
| behavior-preserving cross-file rename | `refactoring-code` selects Serena → SR1–SR4 → preservation oracle |

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `operating-the-harness` | MCP-LIFECYCLE-FIRST: registration, trust, scope, handshake, and tool listing are there. Once live, Serena-specific project, language, memory, and resource capability are here. |
| `driving-cocoindex` | SYMBOL-vs-CONCEPT: an unknown identifier needs concept search there. An exact symbol and its semantic relationships belong here. Pipeline: locate there, navigate/edit here. |
| `implementing-and-debugging` | PURPOSE cut: it owns why and how a behavior-changing fix is safe. This skill supplies a code-intelligence instrument only. |
| `refactoring-code` | PURPOSE cut: it owns the behavior-preservation oracle and motive. This skill supplies semantic refactor capability and its receipt. |
| `writing-julia` | OBJECT cut: Julia source and experiments are there. Whether Serena can start and use Julia LSP for that source is here. |
| `running-python-tools` | PYTHON-LAUNCHER-vs-SEMANTICS: uv isolation, install, pin, upgrade, and trivial version/help are there. Nontrivial Serena result semantics are here. |
| `raising-resolution` | Silent sub-step: capability claims require observables. This skill owns which Serena observables count. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/operations.md` | live-contract discovery, client/project and language checks, memory reconciliation, FD/process diagnosis, coexistence sequence, acceptance matrix | setup, migration, parsing failure, stale memory, indexing, or resource pressure |
| `tests/forge-verification-ledger.md` | live-session provenance, official-source snapshot, source grades, calibration, placement, trigger desk-check, verification findings | reforging or auditing this skill |
