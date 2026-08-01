# Fire / no-fire desk-check — surfacing-blind-spots

Read only skill names and descriptions. Any unresolved race is a description bug.

## FIRES

| Ask | Why here |
|---|---|
| “Before we approve this vendor decision memo, expose its hidden assumptions; do not recommend a vendor yet.” | one existing decision artifact, premise excavation only |
| 「この研究計画で私が当然視していることを、盲点として掘り出して。仮説案はまだ要らない」 | Japanese blind-spot ask with an explicit no-generation boundary |
| “Use a `/dig`-style interview on plan.md, but give me a traceable packet rather than rewriting the plan.” | context-first premise excavation and bounded human questions |
| 「水平思考でこの設計の前提を揺さぶって。解決策ではなく known unknowns にして」 | lateral perturbation requested as premise surfacing |
| “What have we not considered about this launch plan? Ask me only questions whose answers could change sign-off.” | situation described without the skill name |
| “The rollout keeps surprising us even though the checklist is green. Map what the checklist silently treats as true.” | messy operational context; existing artifact and hidden premises |
| “I have a decision frame and three pages of context. Identify which missing human knowledge is load-bearing, then stop.” | tacit provenance and strategic stop are the output |
| “Before testing this already-selected hypothesis tree, expose only its hidden premises and human tacit constraints.” | EXPOSE remains here even after tree selection; later action follows the AOH hard gate |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| “Help me find and choose a creative PhD research problem.” | `directing-research` |
| 「この領域を三つの別問題として再構成して、どれを研究するか決めて」 | `directing-research` |
| “Generate five structurally different theses for this selected frame.” | `forging-novel-theses` |
| “Does the trace at logs/run-14.json actually support the claimed race condition?” | `raising-resolution` |
| “For this expensive/irreversible bet, design the cheapest falsifying experiment and prewrite the kill threshold.” | `acting-on-hypotheses` |
| “Run this deterministic 30-second reversible check.” | domain/plain executor; return result to domain owner |
| “Synthesize these 40 papers into an evidence map and field position.” | `systematizing-knowledge` |
| “Review whether this manuscript's governing claim is overclaimed.” | `arguing-research-papers` |
| “Audit and reforge this SKILL.md.” | `forging-skills` |
| “Given this frozen Blind-spot packet, assign six evidence-inspection workers and an independent judge.” | `orchestrating-agents`; the domain packet already exists and only topology is requested |
| “Give me three product solutions for reducing onboarding abandonment.” | solution generation; not this skill |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| broad creative-research lifecycle with a blind-spot pass | `directing-research` fixes one artifact and decision → HERE returns packet → owner resumes |
| selected frame needs tacit seeds before thesis generation | HERE elicits real-human probes → `forging-novel-theses` consumes only HUMAN-provenanced answers named by `Handoff` |
| hidden premise depends on a present claim | HERE identifies assumption + locator → `raising-resolution` inspects it → HERE integrates provenance if needed |
| one expensive/irreversible forward bet needs premise audit and a kill test | HERE returns load-bearing premises → `acting-on-hypotheses` owns test/threshold/commit |
| evidence inspection needs several workers | HERE fixes the domain packet → `orchestrating-agents` owns topology → workers return locators → HERE integrates |
| six agents must independently excavate one plan's blind spots | HERE fixes artifact/decision/schema → `orchestrating-agents` owns topology/blindness → HERE integrates one packet |

## Regression predicate

The description must retain:

- `ONE existing` artifact;
- hidden assumptions / premise excavation / Japanese trigger doublets;
- `Blind-spot packet`;
- explicit refusal of solutions and thesis candidates;
- cuts to all five siblings;
- a Workflow-native clause naming SOLO integration and non-simulatable human answers;
- the final language directive.

The description must not imply exhaustive unknown-unknown coverage.
