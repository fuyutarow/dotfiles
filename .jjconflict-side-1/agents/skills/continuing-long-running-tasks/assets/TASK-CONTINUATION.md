# TASK CONTINUATION

SCHEMA: 1
TASK_ID: <stable-slug>
STATE: active
REVISION: 1
PATH: <canonical-record-path>
WRITER: <session:platform-slot-basename; none only when closed>
UPDATED: <ISO-8601 timestamp + actor>
RECONCILED_AT: <ISO-8601 timestamp + inspected surfaces>

## Contract

- Objective: <observable completion condition>
- Scope in: <authorized work>
- Scope out: <explicit exclusions>
- Constraints: <safety, compatibility, authority, timing>

## Established state

- Fact: <observed claim>
  Evidence: <file:line | command + result digest | URL + observation date>

## Decisions and assumptions

- Decision: <choice>; because: <evidence locator>
- Assumption: <untested claim>; resolution: <smallest check or owner>

## Material changes

- Revision 1: <path or remote target>; <what changed>; <verification locator>

## Validation

- VERIFY: <exact command or check>
- RESULT: not-run — <why>

## Drift and blockers

- DRIFT: none
- BLOCKER: none

## Handoff

- NEXT: <one smallest executable action>
- SUCCESS: <observable result that advances STATE>
- DO_NOT_REDO: <completed work + evidence locator>
