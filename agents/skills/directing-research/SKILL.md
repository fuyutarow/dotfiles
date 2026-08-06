---
name: directing-research
description: >-
  Routes legacy broad or ambiguous creative-research invocations to the new sole owners and emits a
  routing decision only. Use only for old directing-research requests, bare 「研究を進めて」,
  end-to-end 創造的研究, or mixed programme/section/audit asks with no clear owner.
  Programme/frame/portfolio→supervising-research-programmes; one granted
  section/candidate-test/run/learning→directing-research-sections; frozen episode/process
  postmortem→auditing-research-processes. Specific asks invoke those skills directly. It owns no
  programme, section, candidate, admission, run, audit, retrospective, or transition semantics.
  Documentation→governing-research-documentation; continuity→continuing-long-running-tasks;
  dispatch/visibility→orchestrating-agents. English skill; respond in the user's language (default Japanese).
---

# Routing legacy research invocations

> **Version**: v2608.3.0 (2026-08-03) — route-only compatibility shim after the v2 family split.
> **Scope**: classify a legacy broad invocation, name the sole owner, and stop.

```bash
bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/directing-research && \
  bun test agents/skills/directing-research/tests/family-routing.test.ts
```

## THE LAW — route, never research

> This compatibility shim emits one `ROUTING DECISION`.
> It never authors, interprets, updates, or validates research meaning.
> Once the owner is named, stop and invoke that owner.

The routing artifact is:

```text
ROUTING DECISION
INPUT CLASS: <legacy-broad | programme | section | frozen-audit | external-owner | legacy-v1>
SOLE OWNER: <one skill or compatibility reader>
ORDERED ROUTE: <skill names in invocation order>
COMPATIBILITY NOTE: <NONE or immutable-v1-record note>
STOP: ROUTED
```

Do not add a frame, candidate, method, test, verdict, transition, metric value, or recommendation to
this artifact. Those would turn the shim back into a semantic owner.

## Function map — routing decision is the only owned artifact

| Input state | Route | Stop condition |
|---|---|---|
| Legacy broad or ambiguous creative-research ask | Classify the earliest explicit state below; for a genuinely mixed lifecycle, order the three new owners | `ROUTING DECISION`; no research content |
| Programme question, problem/frame construction, issue portfolio, cross-section allocation, or programme transition | `supervising-research-programmes` | Programme owner invoked |
| Current `OPEN_ISSUE`, `SECTION_MANDATE`, or exactly one section's candidate/test, intent, receipt join, local learning, or signal | `directing-research-sections` | Section owner invoked |
| One frozen terminal, stopped, failed, or bounded research episode requiring process review | `auditing-research-processes` | Process auditor invoked |
| Existing v1 record or checker request | Preserve the record as immutable compatibility material; use its legacy structural floor only, then route any new semantic question to the applicable owner above | No schema rewrite and no shim verdict |

Specific programme, section, and frozen-audit asks bypass this shim and invoke their owner directly.
An explicit old `directing-research` request or a mixed ask may enter here only to obtain the routing
decision.

For an end-to-end lifecycle, the maximum route is:

```text
supervising-research-programmes
  -> directing-research-sections
  -> auditing-research-processes  # only after a frozen bounded episode and only when audit is asked for
```

Each skill retains its own entry gate. This route does not create an `OPEN_ISSUE`, infer a
`SECTION_MANDATE`, freeze an episode, or require an audit.

## Existing specialist routes

| Ask | Sole owner |
|---|---|
| Corpus position or target-agnostic donor discovery | `systematizing-knowledge` |
| A signed position's gaps turned into typed, test-bound, addressed, expiring openings | `operationalizing-research-gaps` |
| One present fact, source, dataset, code path, or anomaly | `raising-resolution` |
| Premises or tacit constraints in one existing plan/frame | `surfacing-blind-spots` |
| Candidate-thesis genesis or selected-target mapping | `forging-novel-theses` |
| One expensive or hard-to-reverse load-bearing bet | `acting-on-hypotheses` |
| One deterministic bounded reversible probe | domain/plain executor |
| One finished research claim or manuscript argument | `arguing-research-papers` |
| Research-document authority, admission, retention, or retirement | `governing-research-documentation` |
| Cross-session continuity, resume, or handoff record | `continuing-long-running-tasks` |
| Bearers, dispatch, visibility, dependency, veto, verification, or acceptance | `orchestrating-agents` |
| Generic software incident or postmortem | `implementing-and-debugging` |

These are direct routes. The shim does not co-own their artifacts or add an orchestration overlay.

## Operational North Star is external

The new research family owns the operational North Star:

```text
valid SEARCH receipts/hour + receipt-linked LEARN commits/hour
```

This shim does not calculate, report, interpret, target, or optimize either term. Route programme-level
accounting to `supervising-research-programmes` and section-local receipt/commit questions to
`directing-research-sections`. A frozen integrity question routes to `auditing-research-processes`.

## Legacy v1 readability boundary

The existing v1 assets, references, scripts, and regression tests remain readable and byte-compatible.
They are historical/compatibility material, not active guidance for this shim. Do not rewrite a v1
schema identifier or mutate a frozen v1 record. Never present a v1 structural PASS as a v2 or semantic
verdict.

### Legacy quarantine manifest — readability only

The retained references below are discoverable for compatibility audits. Never load them as current
instructions or treat them as an arguing home.

| Retained v1 reference | Status in this shim |
|---|---|
| `creative-research-loop.md` | Historical; superseded by the three-owner route |
| `selecting.md` | Historical; no active admission authority |
| `formulating.md` | Historical; no active programme authority |
| `not-fooling-yourself.md` | Historical; no active run or audit authority |
| `steering.md` | Historical; no active portfolio authority |
| `research-process-postmortem.md` | Historical; no active retrospective authority |
| `reconciliation.md` | Historical; no active semantic authority |
| `sources.md` | Historical evidence ledger; not current operating guidance |

## MUST-NOT-FIRE

| Specific ask | Direct route |
|---|---|
| Design or revise a research programme/problem/frame/portfolio | `supervising-research-programmes` |
| Bid, charter, direct, register, learn, or signal inside one section | `directing-research-sections` |
| Audit one frozen terminal research episode | `auditing-research-processes` |
| Generate candidates, inspect a fact, synthesize a corpus, expose premises, test one bet, or argue a finished claim | the named specialist owner above |
| Govern documents, preserve continuity, or design dispatch/visibility | the named external owner above |

The fire/no-fire desk-check and historical reforge receipts live under `tests/`.
They verify routing language only. They do not make this shim a research authority.
