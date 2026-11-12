# Reader discovery follow-up — 2026-11-12

Disposition: all three instruction candidates returned without adoption. The maintained skill and
catalog remain unchanged. This record is evidence of an unsuccessful revision, not a repair receipt.

## Failure and proposed intervention

The owner repeatedly had to supply obvious reader questions before the reviewer recognized them.
The preceding skill revision tested mixed claim classification; it did not establish proactive
reader discovery or a useful page responsibility design for a broad public documentation audience.

Root stated before editing: the reviewer follows supplied categories/questions instead of deriving
who needs answers and tracing those decisions across pages. The existing skill already requires
reader decisions and representative operations. Therefore the incident includes failure to apply
existing guidance; it cannot honestly be attributed entirely to missing skill text.

Candidates moved proactive discovery into the description and opening, then made the proposed
review output concrete: reader → question → page evidence or remaining inference. Host-provided
services and extension points supplied examples for deriving operators and third-party developers.
Page duties were to precede directories; narrow references retained their declared context.
These were local interventions on an observed failure, not findings derived from an external survey.

## Inputs and attention condition

Source skill/catalog baseline: dotfiles `cd925c1fc4589a1935c01db36c019e4c05960f73`.
Six consumer pages were copied without editing from Coralbase
`c00df30f6113a237a3c172c8f6467259118c69ed`:

| Evaluation file | Source path |
|---|---|
| site-index.md | apps/docs/src/content/docs/index.md |
| spec-index.md | spec/README.md |
| architecture.md | spec/platform/architecture.md |
| infrastructure.md | spec/platform/infrastructure.md |
| db-guide.md | spec/platform/db-guide.md |
| heritage-overview.md | spec/heritage/overview.md |

The separately authored `narrow-reference.md` is included here. Regression inputs for the second
candidate are the existing `../responsibility-input/{api,architecture,schema}.md`.
`initial-input-hashes.txt` records exact input/description hashes; the consumer repository is required
to reconstruct its six pages. No full primary-source corpus was included in this skill package.

Fresh independent workers received only their assigned description and permitted raw input, with
no skill body, prior conversation, criteria, counterpart output, code or network access. This tests
a selection-time attention condition, not full-body use or measured human comprehension. The
normal worker harness and its standing instructions were still present; it was not a bare model.
Ordinary agx capability routing selected haiku-low for all five runs; no model/effort was specified.

The shared broad request was: the six pages are an extract of current public OSS documentation;
review its structure and usefulness, identify issues/doubts without editing, cite supplied locations,
and do not infer that unseen linked pages are absent. Limit 850 words, Japanese allowed.
Initial runs also requested an independent exact-reference review, at most 150 words. Candidate v2
added the existing mixed-responsibility regression task, at most 450 words. The last matched pair
removed those task requests. However the permitted input directory still included the synthetic
reference: both last-pair workers treated it as part of the extract. This is a test-design defect;
removing a task did not isolate its input. No clean broad-only experiment is claimed.

`criteria.md` was written in the author's working state before the first dispatch. Its later tracked
copy is not independent proof of preregistration time. No expected findings were given to workers.
Artifact completion checks only required a nonempty result, not semantic success.

## Runs and judgments

| Run | Condition | Observed result and disposition |
|---|---|---|
| b2984583-2ae1-4991-bbe7-6bb4d2454d65 | Baseline, broad + narrow | Mostly local wording/configuration findings; no broad reader-path analysis. Accept only as a baseline observation, not a correct consumer review. |
| 27ff3538-a2cc-411a-9c01-d3071b4dbad9 | Candidate v1, broad + narrow | No useful discovery differential; imports unrelated SDK names into the independent reference task. Reject. |
| bf9420cf-b43a-4d25-b550-359541b7a98d | Candidate v2, plus regression | Names some readers but does not trace their decisions; invents a uniform audience-preamble requirement and mixes reference contexts. Reject. |
| 4507ef0e-ce25-4f80-b151-89be54270589 | Baseline control, broad task | Mostly the same local findings; also interprets the synthetic reference with Coralbase assumptions. Accept only as control evidence. |
| 9a980f40-aad2-4f91-b46f-3c7d779aadd1 | Candidate v3, broad task | Adds reader names and questions, but no useful mapping across distinct adoption, extension, application-participant and operating-cost decisions. Again mixes reference context. Reject. |

All five executions exited 0 and their nonempty-file checks passed. These mechanical results do
not change the judgments above. Raw reviews, description variants and the final rejected body are
retained beside this record. Their asserted consumer defects are unaccepted review material.

Candidate v2 does distinguish guarantee/design/coding policy in the old synthetic case, but also
credits its management preamble and imports unrelated context. This does not establish a successful
regression check. The last pair's reader enumeration is a small observable difference, insufficient
under the frozen requirement for a consequential discovery/path improvement without new overreach.

## Consequence and limits

Per base-revise's no-difference rule, restore the original skill and catalog rather than install a
candidate. Preserve this failed attempt so the next revision cannot reuse it as success evidence.
The earlier accepted mixed-claim correction remains valid only at its previously recorded scope;
it never certified broad reader discovery, page architecture or general reviewer competence.

This evaluation does not identify a model, skill or harness as the sole cause. It contains a known
case, changing candidate descriptions, a multitask regression and an input-isolation error. It does
not measure general effectiveness, selection accuracy or human reader outcomes. No source survey,
feature-parity conclusion, machine enforcement or recurrence prevention is claimed.

The operational acceptance gap remains: an adequate broad review must demonstrate actual reader
questions and page paths before its author can certify documentation structure. A menu, reader list,
file move, nonempty review or successful build is insufficient evidence. This is the author's
acceptance conclusion, not an implemented automatic gate. Semantic adequacy cannot be established
by checking for a heading or counting reader roles.

## Package checks

`skill-check agents/skills/documenting-software`, `rumdl check --no-exclude` on this folder and the
parent revision record, and `mise run gate:land` all exited 0. Existing prose-debt/repository warnings
remain. `cmp` confirms the maintained SKILL.md and catalog match the baseline. These checks validate
the evidence package's mechanical integrity, not documentation-review quality. No runtime sync was
performed for this rejected revision.
