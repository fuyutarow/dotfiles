# Harness VCS reads and REDO-JJSAFE4 disposition

Audience: maintainers reviewing the recovered patch against alpha `3d7c611804d4`.
Source: `/home/fuyu/.cache/coord/triage2/dotfiles-ws-jjsafe4.patch`;
triage: `verdicts.tsv` marks it REDO; its adjacent `.desc` file is empty.

The recovered intent is to install filesystem write denial before a bounded VCS read can
start, so cancellation cannot interrupt a shared-store writer started by that read.
`readonlyCommand` transports an argv/cwd job to a helper. Linux x64/arm64 uses Landlock
ABI >=3; macOS uses `sandbox-exec`. Failure installs no unrestricted fallback. The only
filesystem write exception is the `/dev/null` character device. Linux directly calls
`execv` from the restricted thread; all asynchronous preparation finishes before restriction.
Child processes inherit the boundary. `JJ_READ_ARGS` suppresses ordinary snapshots and
operation reconciliation; the kernel boundary supplies write denial.

## Call sites

This inventory counts **18 active logical VCS command variants**, plus one disabled legacy
hook route. Repeated invocations and disposable test setup do not add variants.

| Caller | Variants | Protection and evidence |
| --- | --- | --- |
| agx premises | `jj root`, `bookmark list`, `log`; `git show-ref` (4) | Boundary before the premise deadline; jj read flags, Git optional locks disabled. Premise and installed-jj tests. |
| Premise transitive `scripts/tracked-files.ts` | `git rev-parse`, `git ls-files`, fallback `jj file list` (3) | Entire enumeration script runs inside the boundary; descendants inherit denial. Kernel descendant test. |
| Official-execution hook | `jj file list -r @-`, `git cat-file -e` (2) | Boundary before five-second timeout; installed jj/Git hook fixtures. |
| repo-retrieve ccc-index | HEAD, dirty status, freshness rev-list, freshness diff, index-status rev-list (5) | `child.ts` wraps Git, including absolute executable paths, before deadlines; optional locks disabled. Router suite. |
| repo-retrieve ccc-scope | `git diff --name-only -z` (1) | Boundary before capture timeout; Python scope matcher remains outside it. Scope/router suites. |
| repo-retrieve definitions | committed diff, dirty status, HEAD (3) | Same `child.ts` boundary; optional locks disabled. Definition/router suites. |
| Storage hook, disabled legacy route | Checkout policy/count probes (excluded from active count) | Parsed raw adds, including sparse/wrapped adds, are denied before policy loading. Help remains usable. Storage adapter tests use invalid policy config to prove ordering. |

Workspace creation belongs to foreground `agx ws` (landed in `56e774eec9e0`, renamed to
`tools/agx-ws` in `6bff24ef563e`). Its standalone policy/CLI probes are outside this recovered
boundary scope. The compatibility workspace hook retains its existing advice; the storage hook
provides the unconditional refusal. Codex TERM/KILL cleanup already landed in
`1262f7e85cee`; its 30-second grace is preserved. SIGINT now shares the same stop path and
listener cleanup as SIGTERM, with both signals tested. The old one-second replacement is obsolete.
The `agt_<name>` documentation follows alpha’s run-name convention (`266d259898c3`).

## Verification and platform limits

The kernel fixture verifies reads, denied overwrite/lock creation/deletion/rename/directory
creation, symlink aliases, inherited child restrictions, abrupt termination, and invalid-job
refusal. The installed-jj fixture checks recorded file contents, operation heads, Git refs,
HEAD, and preservation of an ownerless lock while the working copy is dirty. Fixture data
lives under the test process’s temporary directory outside the workspace.

Linux enforcement is exercised on this host. macOS execution remains a platform verification
item; the macOS profile is retained from the recovered design. Unsupported platforms/kernels
refuse the target. No claim is made that all VCS calls elsewhere in the repository are isolated.

## Exhaustive old-patch hunk classification

Each row corresponds to one original `@@` block, in patch order: **47 hunks**.
“Re-implemented” means the intent was adapted to current files, not blindly applied.
The final report carries concrete affected-test results and required gate exits.

| # | Old path | Old hunk | Disposition |
| --- | --- | --- | --- |
| 1 | `agents/claude/hooks/enforce-official-execution.ts` | `@@ -47,6 +47,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 2 | `agents/claude/hooks/enforce-official-execution.ts` | `@@ -135,10 +136,11 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 3 | `agents/claude/hooks/enforce-official-execution.ts` | `@@ -147,19 +149,30 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 4 | `agents/hooks/enforce-storage-headroom.ts` | `@@ -2,9 +2,30 @@` | Re-implemented as an early raw-add check in the storage adapter. Preserve the legacy compatibility exports for the separately slugged hook; its existing advice contract remains covered by its tests. |
| 5 | `agents/hooks/enforce-storage-headroom.ts` | `@@ -13,6 +34,15 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 6 | `agents/hooks/storage-headroom.contract.md` | `@@ -14,7 +14,7 @@` | Re-implemented with current `tools/agx-ws` ownership and accurate boundary scope. Drop the old unsupported claim that standalone shared workspace-policy reads are isolated: the abandoned patch never wired that boundary. |
| 7 | `agents/hooks/tests/enforce-storage-headroom.test.ts` | `@@ -80,6 +80,30 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 8 | `tools/agx/contract.md` | `@@ -32,9 +32,14 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 9 | `tools/agx/docs/ref-writer-inventory.md` | `@@ -0,0 +1,75 @@` | Re-implemented as this current call-site inventory and exhaustive hunk ledger; correct the grace period and omit unimplemented standalone workspace-policy isolation claims. |
| 10 | `tools/agx/docs/scope.md` | `@@ -20,7 +20,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 11 | `tools/agx/docs/scope.md` | `@@ -59,3 +59,6 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 12 | `tools/agx/src/premises.ts` | `@@ -1,6 +1,8 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 13 | `tools/agx/src/premises.ts` | `@@ -19,8 +21,13 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 14 | `tools/agx/src/premises.ts` | `@@ -105,7 +112,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 15 | `tools/agx/src/premises.ts` | `@@ -116,14 +123,14 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 16 | `tools/agx/src/premises.ts` | `@@ -156,13 +163,13 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 17 | `tools/agx/src/workers/codex.ts` | `@@ -500,7 +500,7 @@` | Already in alpha: `1262f7e85cee` sends TERM then KILL and handles external TERM. Drop the obsolete one-second grace and duplicate lifecycle wiring; preserve alpha’s intentional 30-second cleanup window. |
| 18 | `tools/agx/src/workers/codex.ts` | `@@ -508,6 +508,26 @@` | Partly already in alpha (`1262f7e85cee`: TERM/KILL and external TERM). Re-implemented missing SIGINT forwarding and cleanup in the current stop path; passing signal tests cover both. Dropped obsolete one-second grace and duplicate lifecycle wiring. |
| 19 | `tools/agx/src/workers/codex.ts` | `@@ -627,8 +647,13 @@` | Already in alpha: `1262f7e85cee` clears deadlines/listeners and waits for the vendor. Current cleanup now also removes the re-implemented SIGINT listener. |
| 20 | `tools/agx-worker/tests/codex.test.ts` | `@@ -1,4 +1,11 @@` | Dropped as obsolete: no additional startup overhead per Codex test; the existing explicit budgets suffice for the signal cases. |
| 21 | `tools/agx-worker/tests/codex.test.ts` | `@@ -17,6 +24,12 @@` | Dropped as obsolete: no additional startup overhead per Codex test; the existing explicit budgets suffice for the signal cases. |
| 22 | `tools/agx-worker/tests/codex.test.ts` | `@@ -764,6 +777,29 @@` | TERM cleanup is covered in alpha (`1262f7e85cee`). Dropped the obsolete one-second escalation assertion (alpha intentionally allows 30 seconds); extended the existing passing cleanup test to SIGINT for the missing forwarding behavior. |
| 23 | `tools/agx-worker/tests/jj-read.test.ts` | `@@ -0,0 +1,84 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 24 | `tools/agx-worker/tests/premises.test.ts` | `@@ -47,6 +47,23 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 25 | `tools/agx-worker/tests/premises.test.ts` | `@@ -116,8 +133,11 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 26 | `tools/agx-worker/tests/readonly-command.test.ts` | `@@ -0,0 +1,102 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 27 | `tools/repo-retrieve/.changes/isolate-git-inspection-from-shared-ref-writes-under-router-deadl.md` | `@@ -0,0 +1,5 @@` | Re-implemented using `mise run changeset -- repo-retrieve patch ...`; generated filename/schema replace the old handwritten release record. |
| 28 | `tools/repo-retrieve/src/ccc-index.ts` | `@@ -580,7 +580,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 29 | `tools/repo-retrieve/src/ccc-index.ts` | `@@ -599,7 +599,14 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 30 | `tools/repo-retrieve/src/ccc-index.ts` | `@@ -715,6 +722,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 31 | `tools/repo-retrieve/src/ccc-index.ts` | `@@ -730,6 +738,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 32 | `tools/repo-retrieve/src/ccc-index.ts` | `@@ -1246,6 +1255,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 33 | `tools/repo-retrieve/src/ccc-scope.ts` | `@@ -12,6 +12,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 34 | `tools/repo-retrieve/src/ccc-scope.ts` | `@@ -33,8 +34,11 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 35 | `tools/repo-retrieve/src/ccc-scope.ts` | `@@ -62,7 +66,17 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 36 | `tools/repo-retrieve/src/child.ts` | `@@ -2,6 +2,8 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 37 | `tools/repo-retrieve/src/child.ts` | `@@ -16,10 +18,14 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 38 | `tools/repo-retrieve/src/child.ts` | `@@ -48,10 +54,14 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 39 | `tools/repo-retrieve/src/definitions.ts` | `@@ -314,7 +314,12 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 40 | `tools/repo-retrieve/tests/repo-retrieve.test.ts` | `@@ -12,12 +12,19 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 41 | `tools/repo-retrieve/tests/repo-retrieve.test.ts` | `@@ -277,7 +284,9 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 42 | `tools/repo-retrieve/tests/repo-retrieve.test.ts` | `@@ -290,7 +299,7 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 43 | `tools/repo-retrieve/tests/repo-retrieve.test.ts` | `@@ -301,6 +310,9 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 44 | `tools/repo-retrieve/tests/repo-retrieve.test.ts` | `@@ -574,7 +586,10 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 45 | `tools/shared/src/jj-read.ts` | `@@ -0,0 +1,3 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 46 | `tools/shared/src/readonly-command.ts` | `@@ -0,0 +1,20 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
| 47 | `tools/shared/src/readonly-exec.ts` | `@@ -0,0 +1,109 @@` | Re-implemented here against alpha; affected test suites pass (see checks in the final report). |
