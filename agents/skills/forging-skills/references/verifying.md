# Verifying — match the check to the claim

> Scope: checks, comparison and maintenance. Domain design stays with the skill's author.

## §0 Two verification objects

| Object | Question | Observation |
|---|---|---|
| Selection | Intended work selected; adjacent work excluded? | Relevant explicit, implicit and negative requests |
| Content | Intended outcome within scope and authority? | Task artifacts, actions and acceptance criteria |

Structural checks do not answer either question completely.
User feedback is useful; content-free satisfaction is not an acceptance test.
Wording matches check lexical contracts, not downstream effectiveness.

## §1 A proportionate revision loop

1. Inspect failure, source, nearest owner and affected callers.
2. Choose the minimal coherent change and acceptance criteria.
3. Draft or edit.
4. Check relevant behavior; compare baseline when claiming benefit.
5. Repair supported findings and report limits.

Do not turn every phase or lens into a separate ceremony.
A simple edit can use one focused pass.
Broaden review when failures repeat, boundaries move or consequences grow.
Keep design and final acceptance with one responsible author.

## §2 Choose review lenses

| Risk | Review |
|---|---|
| Contradiction or disputed sibling boundary | Actual competing contract and distinguishing request |
| Missing resource or broken helper | Shared validator and meaningful failure fixture |
| Scope or permission drift | Adjacent request and authorized action boundary |
| Repeated runtime/coordination failure | Multi-event rehearsal and observed receipts |
| Claimed improvement | Matched old/no-skill and new outcomes |
| Loading or scaffold overhead | Resources read, work required and current consumer |

Choose lenses for risk, not a fixed fleet count.
Use independent evaluation when it adds needed confidence and is available and authorized.
A serial review supports only its scoped claims.
A waiver cannot turn unperformed work into evidence.

## §3 Comparative evaluation

Freeze task, input version, host/model, criteria and permitted effects.
Use the old skill or no skill according to the intended comparison.
Do not leak expected findings or prior conclusions into evaluators.
Keep tuning cases separate from held-out checks during repeated optimization.

For an execution loop, deliver relevant events and inspect subsequent actions.
A one-shot plan cannot verify interruption, consumption, cleanup or restart.
Reuse an authorized evaluation surface.
A synthetic scheduler must not become its own oracle.

| Evidence | Claim supported |
|---|---|
| Format, resources and links | Package/install integrity |
| Static review or text answers | Specified decisions inspected |
| Tool-backed rehearsal | Observed action and failure paths on that environment |
| Matched task comparison | Outcome/cost difference under stated conditions |

Small prompt sets can be useful.
Select consequential boundaries and known misses; do not pad arbitrary quotas.
Do not demand numerical improvement claims unsupported by the sample.
Retain valid failures and negative outcomes.

## §4 Existing creator machinery

Roots `$CODEX` and `$PLUGIN` are defined in the core routing section.
Inspect installed guidance and helper interfaces before invoking them.
Keep changing flags and dependencies with the host/tool owner.
Python execution follows `running-python-tools`.

| Need | Existing resource |
|---|---|
| Codex format/metadata validation | `$CODEX/scripts/quick_validate.py` |
| Optional scaffold or UI metadata | `$CODEX/scripts/init_skill.py`, `generate_openai_yaml.py` |
| Plugin trigger/description evaluation | `$PLUGIN/scripts/run_eval.py`, `run_loop.py` |
| Grading, comparison and error analysis | Plugin grader/comparator/analyzer |
| Human viewer and packaging | Plugin eval-viewer and packaging helpers |
| House structure and footprint | `scripts/skill-check.ts` |

Inspect a proxy runner's measurement surface.
Command-proxy activation is not installed registration or procedural correctness.
Preserve the user's invocation policy and authorization.
Do not add unused resources because an initializer can generate them.
Current creators supply reusable guidance as well as machinery.
Reassess historical comparisons against current versions.

## §5 Shared floor and cost measurements

Run `scripts/skill-check.ts` over the affected package first.
When shared metadata or the floor changes, inspect the collection invariant.
Here `mise run lint:skills-floor` checks the staged index; label that scope.
An unstaged rewrite also needs the corresponding working-tree check.
An unchanged index cannot validate changed working files.

The floor checks names, descriptions and reference discoverability.
Readability warnings identify debt; they do not prove bad behavior.
A changed deterministic check needs a bad fixture and an expected valid case.
Prefer the shared checker to a custom floor per skill.

`--budget` compares a static character proxy to a declared ceiling.
It does not measure tokenizer output, truncation, body loads or session cost.
Use host doctor/statistics for observed context and invocation data.
Separate attributed workload tokens from causal loading cost.

## §6 Ship and maintain

Keep referenced resources and consumers complete in one reviewable change.
Record or publish within user authorization and repository policy.
Relink after discovery, location or deployment changes; inspect actual targets.
Report structure, selection, execution and benefit claims separately.

| Event | Action |
|---|---|
| Relevant task fails or violates scope | Repair the demonstrated boundary and regression |
| Source/tool contract changes | Refresh affected facts and instructions |
| Sibling creates collision or responsibility gap | Compare owners and exercise a distinguishing case |
| Reference accumulates irrelevant detail | Reassess loading and remove unsupported ceremony |
| Mature skill remains unused | Inspect usage coverage, age, demand and dependencies |
| Footprint ceiling binds | Retire, consolidate, shorten or explicitly justify a raise |

A narrow fix need not audit the world.
An architectural contradiction cannot be repaired by another appended slogan.
Before creation, compare the existing owner.
During consolidation, preserve needed modes and failure protections.
During retirement, preserve sources and repair actual callers.
Registration and functional independence are separate decisions.

## §7 Verification scale

| Change | Starting point |
|---|---|
| Small instruction/wording change | Focused review and relevant positive/negative task |
| Metadata or resource move | Floor, discovery/link check and affected consumer |
| Script or fragile sequence | Meaningful regression and direct execution |
| Broad boundary/coordination change | Coverage-driven cases; independent evaluation where available |
| Claimed productivity gain | Matched baseline and current measurements |

Expand only for unresolved risks or observed misses.
Simple skills need no fleet waiver, custom ledger or copied gate framework.
Record material findings and limits in the existing evidence home.
