# TASK CONTINUATION

SCHEMA: 1
TASK_ID: reclaim-regenerable-policy-regression
STATE: closed
REVISION: 3
PATH: /home/fuyu/dotfiles-arm-agx-20261013132438-02ea58b1-35ce-48ee-9821-08723614af52/tools/disk-reclaim/.verification/regenerable-policy/TASK-CONTINUATION.md
WRITER: none
UPDATED: 2026-10-13T14:45:51Z root
RECONCILED_AT: 2026-10-13T14:45:51Z final source, all five foreground checks, formatting, regression logs and no-host-scan process inventory

## Contract

- Objective: Changing regenerable_ignored invalidates cached workspace classification; tool caches become regenerable again; all five required checks observed.
- Scope in: tools/disk-reclaim regression repair and its fixture/docs; existing deploy fix verification.
- Scope out: Host scans, real-host reclamation, commits and pushes.
- Constraints: rr retrieval; one apply_patch operation per file; foreground verification; prior closed record remains read-only.

## Established state

- Fact: Before repair, the facts cache omitted regenerable_ignored. The repaired versioned key includes the deduplicated/sorted policy; changing allowed tool caches now reclassifies an unchanged workspace.
  Evidence: tools/disk-reclaim/src/targets/workspaces.ts gather; writable-cache regression before/after outputs.
- Fact: Writable isolated caching reproduced the coordinator failure with exit 1; including the normalized policy in the cache identity repaired it with exit 0 and eight assertions.
  Evidence: tools/disk-reclaim/tests/targets/c-workspaces.test.ts; narrow regression command before/after repair.
- Fact: Prior record is closed with WRITER none; this regression has a new active record rather than modifying the terminal record.
  Evidence: tools/disk-reclaim/.verification/incremental/TASK-CONTINUATION.md revision 3.

## Decisions and assumptions

- Decision: Include normalized classification policy in the workspace facts cache identity; because: source dependency above.
- Decision: Give the regression fixture its own writable scan cache; because: readonly default state masked reuse in the previous local run.
- Assumption: Other cached facts are unaffected by this policy change; resolution: five required verification commands.

## Material changes

- Revision 1: Reconciled the new regression and authorized the repair; no domain source edits yet.
- Revision 2: Workspace facts cache now includes deduplicated/sorted regenerable_ignored in its versioned identity; fixture owns writable cache and tests restriction after expansion. Updated existing unreleased 1.3.0 changelog and README.
- Revision 3: All five required foreground checks passed after the regression repair; close this episode without host scans, commits or pushes.

## Validation

- VERIFY: bun test tools/disk-reclaim; UV_CACHE_DIR=/tmp/reclaim-uv-cache bun test scripts/tests; bunx --bun tsgo --noEmit; bunx --bun oxlint --type-aware; MISE_STATE_DIR=/tmp/reclaim-mise-state MISE_CACHE_DIR=/tmp/reclaim-mise-cache mise run lint:bun
- RESULT: pass — exits 0, 0, 0, 0, 0; reclaim 253 passed/2 skipped, scripts 651 passed/4 skipped; Bun floor has six existing warnings; narrow writable-cache regression red 1 then green 0; formatting passed.

## Drift and blockers

- DRIFT: none — previous missing policy-transition coverage reconciled by the writable fixture and full successful verification.
- BLOCKER: none

## Handoff

- NEXT: none
- SUCCESS: Classification regression repaired and all five required commands have observed exit 0.
- DO_NOT_REDO: Host scans are prohibited; prior metrics and deploy fix remain in the previous closed record.
