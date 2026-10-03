# Architecture — task boundaries and selective loading

> Scope: placement and resource topology. Host format and loading belong to `operating-the-harness`.

## 1. Progressive disclosure

| Location | Content | Admission question |
|---|---|---|
| `SKILL.md` | Shared purpose, decisions, essential constraints and routing | Does the normal invocation need this? |
| `references/` | Conditional procedures, schemas, source detail and examples | Which task condition causes this file to be read? |
| `scripts/` | Repeated deterministic operations or reliability checks | Does execution avoid reconstruction or a concrete error? |
| `assets/` | Material used in outputs | Is this copied into a deliverable? |

A simple skill may contain only `SKILL.md`.
Do not create empty directories or placeholders to make it look complete.
A reference read every time may belong in the core.
A core section used only in one mode may belong in that mode's reference.
For a large reference, provide useful contents or search terms.

The resource index is a loading contract: name the file and its read condition.
Do not require all references to be read at invocation.

## 2. Function map and one home

Before selecting a name, state:
`input state → decision/action → result → stop or handoff`.

Keep that statement inline for a small job.
Use a fuller map when multiple responsibilities or actors need a shared boundary.
A new artifact name or role is not evidence of a new capability.
Compare the closest incumbent's actual decisions, failure modes and consumers.

| Relationship to an incumbent | Placement |
|---|---|
| Same job, acceptance and stop; different provider/runtime/format | Conditional mode or reference |
| Same rule repeated across jobs | One maintained home plus necessary pointers or local guards |
| Distinct decisions or failures cannot be selected clearly inside one job | Separate skill with a distinguishing question |
| Implementation operation repeated mechanically | Script under the existing owner |
| Mandatory host restriction | Existing enforcement mechanism |

Do not invent exhaustive partitions of open-world work.
Keep unresolved boundaries explicit and resolve them through a relevant task.
Declare a sole home for contested rules.
Reciprocal pointers help when live owners otherwise collide or defer to each other.
They are not mandatory for every mentioned tool or domain.

A deliberate local guard may repeat the actionable restriction.
Identify its owner and scope; do not copy a second explanation or schema.
An unavailable or retired sibling cannot be treated as callable.
Use the archive index to locate retained contracts.
Domain revisions do not redefine generic actor mechanics.

## 3. Complete changes without a mandatory package shape

Keep referenced resources and affected callers valid in the same reviewable change.
Check dangling references before distribution.
Templates, custom floors, ledgers and version headers are not required of every skill.

Exercise changed reusable helpers.
For retired resources, check that active callers no longer require the old executable path.
Use existing repository validators before writing another checker.
Record or publish only within the user's authorization and repository workflow.

## 4. Durability and provenance

Keep fast-moving model, product, version and availability facts in one dated source home.
Refresh facts affected by the current change.
Do not copy them into multiple bodies or describe a platform convention as universal.

A version or lineage note is useful when it supports a real review or compatibility decision.
Retain negative evidence and historical corrections.
Distinguish current instructions from superseded conclusions.
History belongs in an existing evidence record, not an expanding runtime header.

## 5. Mechanical floors and the dual-reader bar

The executor and human auditor must identify the action, condition and completion.
A short explanation may be necessary to apply a constraint correctly.
Use tables for lookups and prose for reasoning-dependent choices.
Sentence count or the presence of “because” does not decide whether a line earns space.

The shared `scripts/skill-check.ts` checks metadata, names and reference discoverability.
Its prose warnings are review signals.
These heuristics do not prove correctness, usability or runtime behavior.
Do not require a bespoke floor or waiver ledger for every small edit.

| Defect | Default check |
|---|---|
| Metadata, naming or missing referenced resources | Shared structural validator |
| Repeated deterministic operation | Existing helper and meaningful failure fixture |
| Confusing or irrelevant instructions | Focused review and representative task |
| Wrong task selected or permission crossed | Relevant negative case and target-host evidence |

A new machine gate needs a known bad case that actually fails.
Do not create a gate for a preference requiring contextual judgment.
After substantial revision, record the relevance and unresolved cost of remaining warnings.
A mechanical waiver cannot excuse a material behavior defect.

## 6. Language and terminology

Follow the reader and target environment.
Use consistent names; define specialized tokens when they matter.
Description examples should cover languages and request forms actually used.
Do not duplicate every English word or require a vocabulary section in every skill.
Gerund names are this repository's convention.
Platform grammar is a separate mechanical contract.

## 7. Failure cases

| Problem | Correction |
|---|---|
| Names chosen before responsibilities | Compare input/decision/result/stop |
| Every provider or chapter becomes a skill | Use selectable references unless a distinct boundary is demonstrated |
| Every skill gets gates, ledgers and agent roles | Remove components with no task or risk justification |
| Two copies of a rule drift | Choose one home and update consumers |
| Both owners route a request away | Assign the missing owner and exercise the boundary |
| All detail loads by default | Add read conditions and observe actual resource use |
| Retired references imply callable skills | Mark the contract and repair discovery or executable paths |

Source and incident lineage: `../tests/forge-verification-ledger.md`.
