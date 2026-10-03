---
name: forging-skills
description: >-
  Creates, revises, evaluates and consolidates Agent Skills from observed failures and current
  authoring guidance. Use for SKILL.md work, スキル作成・改善・統廃合, trigger collisions,
  skill evals, unnecessary scaffolding, or retirement and listing-cost review.
  Owns content, boundaries and proportionate verification; harness loading and enforcement
  belong to operating-the-harness. Reuse available skill-creator machinery.
  English skill; respond in the user's language.
---

# Forging skills

> **Version**: v2610.1.0 (2026-10-03) — outcome-first design and proportionate verification.
> Revision evidence and historical findings: `tests/forge-verification-ledger.md`.

Verify this package from the repository root:

```sh
bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/forging-skills
bun test agents/skills/forging-skills/tests
```

This package has five references, a shared floor and a historical ledger.
That is its maintained structure, not a template required of every target skill.

## LAW — earn the intervention

Add guidance only when it changes a useful decision, action or deliverable.
Preserve the user's task, chosen approach and authorization.
Start with the smallest instruction that addresses an observed failure or a demonstrated need.
An explanation earns space when it makes a constraint usable or auditable.

The collection's objective is valid knowledge discovery per unit time.
For research work, name the observation, discriminating result or checked proof supported.
For enabling work, name its current consumer and the failure or delay removed.
Do not invent a research experiment, numerical benefit or extra workflow for an ordinary task.

The executor and human auditor must both understand the manual.
Its success criterion must be observable; named gates and custom artifacts are optional.
A skill is not enforcement. Put mandatory runtime restrictions in the appropriate harness mechanism.

Stable tokens: `F1–F4`, `fire / no-fire`, `function map`, `one home`, `baseline`.
Use specialized cut or delegation vocabulary only when it resolves an actual boundary.

## F1–F4 — decisions to check, not mandatory scaffolds

| Gate | Decision | Sufficient evidence |
|---|---|---|
| **F1 OPERATIONALITY** | Does the instruction supply a needed capability or correct a concrete failure? | Named task, useful behavior and observable acceptance; source and scope for load-bearing claims. |
| **F2 PLACEMENT** | Is this a separate job, an existing skill's mode, a script, or enforced policy? | Input → decision/action → result → stop; inspect the closest incumbent and assign one maintained home. |
| **F3 SELF-VERIFICATION** | What has actually been checked, and how strongly may success be claimed? | Checks sized to the changed behavior and risk; distinguish structure, selection, execution and comparative benefit. |
| **F4 STANDING** | Should the skill remain discoverable at this scope and cost? | Current inventory, demand, usage coverage, admission age and dependencies; separate footprint estimates from observed context. |

Keep these decisions in the existing change, review or evidence record.
Do not copy this gate table, mint a new schema, or add a ledger to every target.

## Choose placement before naming a skill

| Observed need | Default placement | Reason to split |
|---|---|---|
| Reusable job with a distinct acceptance boundary | Extend an existing owner if it already serves the job | Different decisions, failures or stops would misroute under one entrypoint |
| Provider, runtime, format or difficulty variant | Conditional mode and reference | Selection otherwise loads irrelevant guidance or loses an essential boundary |
| Deterministic work repeatedly reimplemented | Reusable script under its actual owner | Independently useful executable contract |
| A rule that must be enforced | Hook, settings or another existing machine gate | Enforcement is not supplied by skill prose |
| An alias adding invocation convenience | Existing command or entrypoint | Substantive capability beyond routing |
| Established unused or superseded guidance | Scope reduction, consolidation or archive | Current task or protected dependency justifies continued registration |

A differently named packet, role or topic is not sufficient proof of independence.
Different technologies are not automatically duplicates either.
Compare actual decisions and consumer paths; retain necessary domain-specific rules.
When a split is justified, name the distinguishing question.
Check both collision and mutual deferral.

Read `operating-the-harness`'s commands-and-skills reference for the target host's mechanical contract.
Refresh facts affected by the revision; consult current official guidance and creator resources.
For a paper corpus, let `systematizing-knowledge` synthesize it before distillation.

## Revise the smallest coherent unit

1. Locate the requested outcome, current failure and affected callers.
2. Inspect current source, the nearest owner and existing verification.
3. State the correction and success criterion before substantial drafting.
4. Write minimal instructions; put conditional detail in a reference with a read condition.
5. Check the affected behavior and relevant near miss; repair findings and report uncertainty.
6. Keep referenced files and caller changes reviewable together; relink after deployment changes.

A narrow correction does not require a full audit fleet.
Repeated failure, contradictory contracts or major boundary changes need broader re-examination.
When a result changes the premises, revise the affected scope.
Do not accumulate universal rules from one incident.

## Write for selective loading

| Resource | Carries |
|---|---|
| Description | Capability and invocation conditions; exclusions for likely misrouting |
| Body | Shared purpose, decisions, essential constraints and usable links |
| References | Mode-specific procedures, substantial examples, schemas and source detail |
| Scripts | Repeated deterministic operations or meaningful reliability checks |
| Assets | Material copied into the user's deliverable |

No fixed description anatomy, chapter count, execution model or ancillary file set is required.
Use concise predicates, tables, examples or prose according to the decision.
Keep one substantive home for a rule; other occurrences point there or declare a necessary local guard.
Remove generic advice and stale policy copied from another owner.
Readability warnings identify review candidates, not proof of an unusable skill.

## Verify the claim you intend to make

| Claim | Necessary observation |
|---|---|
| Package is structurally sound | Valid metadata and resolving references; changed helpers exercised |
| Description selects intended work | Representative explicit and implicit asks, plus adjacent negatives |
| Procedure works on the target path | Actual permitted actions and artifacts, including the relevant failure |
| Revision improves outcomes or cost | Matched old/no-skill and new runs under stated conditions |

Choose cases from demonstrated misses and consequential boundaries.
The case count follows coverage; do not pad to a fixed quota.
A small instruction-only skill can use focused review and an actual task check.
A delicate tool sequence needs direct execution evidence.
A structural floor or wording match cannot establish selector accuracy or runtime compliance.

Use independent evaluation when it adds needed confidence and is authorized and available.
Freeze inputs and criteria; give evaluators the task and raw artifacts without expected findings.
Without an independent evaluator, use scoped serial checks and state that limitation.
Do not invent multiple votes or independent consensus inside one model response.
Generic dispatch, resources and trust mechanics belong to `orchestrating-agents`.

## Read doctor statistics correctly

Distinguish an absent skill, a truncated description, an unselected skill and a failing procedure.
Inspect the host and measurement period.
A Claude-only usage record does not cover Codex-only skills.
Invocation counts may omit manual reference reads and indirect application.
A high count is not proof of benefit.
A zero warrants investigation of demand, discovery and duplication.

| Measurement | Interpretation |
|---|---|
| Static name-plus-description characters | Conservative collection-footprint proxy |
| Observed listing tokens | Host/session context actually reported |
| Invocations and body/reference loads | How often and what was read |
| Attributed session tokens | Workload-associated usage, not manual size or causal loading cost |

Here, `agents/skills-listing-budget.json` and the shared floor maintain the static footprint ceiling.
A binding ceiling needs an explicit retire/merge/shorten/raise decision.
Do not raise it silently or call its character sum measured tokens charged on every turn.

For retirement, check admission age, covered usage, callers and the user's retention policy.
A newcomer grace period is a declared local policy, not an industry constant.
Archive outside discovery; update links, catalog and provenance.
Preserve required executable consumers.
Do not automatically reactivate a retired skill through a surviving reference.

## Routes and boundaries

| Request | Owner / relationship |
|---|---|
| Skill content, placement, distillation, trigger evaluation or standing | **Here** |
| Host loading, permissions, hooks or listing diagnostics | `operating-the-harness`; resolve the affected mechanical contract first |
| Scaffold, format validator, package or eval runner | Available `skill-creator` machinery and current guidance |
| Ordinary prose | `linting-prose`; skill wording and operational clarity remain here |
| Task manual versus cross-actor trade-offs | Here versus `codifying-doctrine` |
| Domain result or ordinary use of a skill | Domain owner; no forge ceremony |
| One-line typo or straightforward packaging | Direct edit or tool operation |

Current creator roots, if installed:
- `$CODEX = ~/.codex/skills/.system/skill-creator`
- `$PLUGIN = ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator`

These identify reusable machinery and guidance, not permanent superiority.
Inspect the installed interface before invoking a helper.
Retired domain manuals are references through the archive index, not callable skills.

## This skill's selection cases

| Ask | Expected route |
|---|---|
| 「実際の失敗を踏まえてskillを直して」 | Here |
| 「同じ仕事を持つskillを統合したい」 | Here |
| 「descriptionが広すぎて別の仕事にも発火する」 | Here |
| 「未使用skillを退役させて」 | Here; inspect age, coverage and callers |
| 「繰り返す手順をskillにしたい」 | Here; check the smallest useful placement |
| 「skillが一覧に出ない」 | Harness diagnostics first |
| 「このskillを使ってPDFを処理して」 | Existing domain skill |
| 「SKILL.mdの一文字だけ直して」 | Direct edit |
| 「hookで必ずこの処理を止めたい」 | Harness owner |
| 「Rustコードを実装して」 | Implementation and language owners |

These are desk-review cases, not measured live-selection accuracy.
Recheck affected rows after a description or routing change.

## References

| File | Read when |
|---|---|
| `references/distilling.md` | Deriving rules from incidents, frameworks, corpora or documentation |
| `references/architecture.md` | Choosing boundaries, resource homes, loading levels or package structure |
| `references/triggering.md` | Editing descriptions or investigating false positives and missed selection |
| `references/execution-models.md` | Delegation or a consequential trust boundary is actually needed |
| `references/verifying.md` | Choosing checks, comparative evaluation, machinery or maintenance |
| `tests/forge-verification-ledger.md` | Revision lineage, applicability, findings and verification limits |
| `tests/decision-cases.json` | Static review of small skills, splits, retirement, statistics and evidence boundaries |
