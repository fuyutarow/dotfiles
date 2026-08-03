# Fire / no-fire desk-check — forging-novel-theses

Read only sibling `name` + `description` fields. Any race is a description bug.

## FIRES

| Ask | Why here |
|---|---|
| “This materials frame is selected, no thesis explains run-42.csv, and these anomalies are the seeds. Generate three candidates including a grounded control.” | selected frame, missing thesis, provenance-bearing observations, and batch genesis are visible at stage 1 |
| 「問いは固定済みで有力仮説はまだない。この出典付き残差から、新規仮説候補を複数つくって」 | selected frame, absent thesis, and sourced seed are explicit |
| “No adequate thesis exists for this selected assay frame. Map this frozen target-agnostic DONOR SET onto it; return CANDIDATE/UNTESTED or MAPPING-BREAK.” | selected-target structural transfer belongs here |
| “For this selected frame with no adequate thesis, use the supplied endpoint-state account as a seed and generate a transition-state alternative.” | provenance-bearing representation change |
| “No adequate thesis exists. Decompose this fixed problem from the supplied constraints into candidate explanations; do not rank them.” | candidate genesis from supplied seeds, with the no-ranking boundary visible |
| 「選択済みの問いには有力仮説がまだない。出典付き観測から grounded control と前提破壊 anti-default を含む候補バッチを作って」 | grounded-control batch from an honest entry state |
| “Use this answered, attested Blind-spot packet as the seed for thesis candidates in the selected frame; no adequate thesis exists.” | a provenance-bearing human-tacit handoff enters genesis without elicitation |
| “The batch is frozen and deduplicated. This coverage-gap packet names one missing cell; regenerate once, then return COVERAGE GAP if diversity still collapses.” | the sole post-freeze recovery attempt is part of genesis |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| “How should I do creative research end-to-end?” | `directing-research` emits only a routing decision; it owns no lifecycle stage |
| “Here are three observations, but I have not selected or formulated the research problem yet.” | `supervising-research-programmes` formulates and selects the frame |
| “This frame is selected, but there is no sourced seed or frozen donor set. Invent something anyway.” | `directing-research-sections` stops and requests admissible local input; genesis does not launder an unsourced seed |
| “The frame, seed, and adequate thesis are already fixed; which thesis should we admit?” | `directing-research-sections` freezes, deduplicates, and decides local admission |
| “Is this idea actually absent from the literature?” | `systematizing-knowledge` |
| “Find analogies across fields for this target, but do not map them yet.” | `systematizing-knowledge` — target-agnostic donor discovery and `DONOR SET` |
| “I have a frozen DONOR SET but no selected target. Tell me which target to choose.” | `supervising-research-programmes` owns problem/frame choice; no selected-target mapping exists yet |
| “Interview the operator to expose tacit knowledge and hidden assumptions.” | `surfacing-blind-spots` |
| “Is the residual real?” | `raising-resolution` |
| “Here is one expensive/irreversible thesis; precommit its cheapest kill experiment.” | `acting-on-hypotheses` |
| “The first recovery still collapsed. Try three more missing cells until one works.” | stop with `COVERAGE GAP`; `directing-research-sections` decides the local stop or sends a reopen request |
| “Run this deterministic 30-second reversible check.” | domain/plain executor; return `EXECUTOR RESULT` to `directing-research-sections` |
| “Should we fund/commit/withdraw?” | `acting-on-hypotheses` for one gated expensive/irreversible tree; `supervising-research-programmes` for a portfolio |
| “Store this frozen transfer bundle as the durable reviewed authority and define retirement.” | `governing-research-documentation` governs locus/lineage/lifecycle; it never revises the mapping or break semantics |
| “Who should ideate blindly and who may veto?” | `orchestrating-agents` |
| “Reframe this finished paper's contribution.” | `arguing-research-papers` |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| broad creative-research workflow | `directing-research` emits only a routing decision -> `supervising-research-programmes` selects/publishes the frame -> `directing-research-sections` charters a granted section -> HERE only at selected-frame + no-adequate-thesis + supplied-seed -> section freeze/dedup/admission |
| anomaly to new thesis | `raising-resolution` -> `supervising-research-programmes` problem-frame decision -> granted `directing-research-sections` section -> HERE |
| literature to candidates | `systematizing-knowledge` -> `supervising-research-programmes` selects/frame -> `directing-research-sections` charters -> HERE -> section freeze/dedup/admission |
| donor discovery to transfer admission | `systematizing-knowledge` freezes target-agnostic `DONOR SET` -> HERE maps it to the selected target and emits `CANDIDATE` or `MAPPING-BREAK` -> `directing-research-sections` freezes the denominator and decides local admission |
| problem formulation to genesis | `supervising-research-programmes` formulates/selects the frame -> `directing-research-sections` charters -> HERE only if no adequate thesis and a provenance-bearing seed exists -> section freeze/dedup/admit-or-reject |
| expensive selected tree | `acting-on-hypotheses` directly; HERE does not design the test or commitment rule |
| freeze a transfer result into repository history | HERE signs mapping/break semantics -> `governing-research-documentation` governs durable locus, review, supersession, and retirement without changing those semantics |
| blind spots to candidates | `surfacing-blind-spots` -> HERE only when its handoff names this skill and contains sourced facts |
| multi-agent candidate batch | HERE defines packets/coordinate cells -> `orchestrating-agents` defines topology -> HERE returns packets -> `directing-research-sections` selects locally |
| frozen/deduplicated batch collapsed | `directing-research-sections` sends one coverage-gap packet -> HERE regenerates exactly once -> HERE emits packets or explicit `COVERAGE GAP` -> section stops or requests programme reopen |
| finished claim must reopen | `arguing-research-papers` -> `supervising-research-programmes` reopen decision -> a new granted section -> HERE only if thesis becomes missing |

## Regression predicate

The description must expose all of these stage-1 predicates:

- selected problem/frame and no adequate thesis;
- provenance-bearing seed or frozen target-agnostic `DONOR SET`;
- batch genesis and grounded control;
- one-shot recovery only after frozen/deduplicated collapse, ending in explicit `COVERAGE GAP` on failure;
- selected-target mapping that returns `CANDIDATE` with `UNTESTED` evidence, or `MAPPING-BREAK`;
- explicit refusal to rank, test, admit, adopt, or discover donors;
- donor discovery -> `systematizing-knowledge`, formulation -> `supervising-research-programmes`,
  local freeze/dedup/admission -> `directing-research-sections`, and expensive selected tree ->
  `acting-on-hypotheses`;
- allocation and final packets stay `SOLO`.

Do not promote body-only packet fields, coordinate axes, tacit-seed checks, or orchestration details
into stage-1 regression predicates unless the description itself exposes them.

The stage-only desk-check must reject donor discovery, problem formulation, ranking/admission/testing,
mapping without a selected target, and a second recovery attempt. It must not read the body to rescue
an underspecified description.
