# Herdr sidebar regression: producer evidence and candidate

## Current candidate: `bf90866f` safe cut

`bf90866f` supersedes the `81f5deea` registration-fallback candidate documented
below. The current cut keeps a known provisional ID visible as an honest
unavailable display when its independent footer is absent. A registered ID alone
does not refresh fleet state. The normal exact-footer path remains current.

The current source/fixture delta has 25 tests. It establishes this safe cut; it
does not establish a deployed UI-after result, server authentication, a current
pane, or total sidebar/UDF closure. No new native Herdr call is evidenced here.

The shared atomic helper is common machinery, not a sole logical writer. Multiple
whole-record producers remain an **OPEN** audit issue. The projected-count meaning
remains successful rename/metadata pairs, not successful exact native bindings.

This evidence-only correction has no tool release version, CHANGELOG entry, or
changeset. No runtime deployment or native mutation is claimed.

## Superseded registration-fallback candidate: `81f5deea`

The supplied `/tmp/herdr-owner-list-oct21.json` previously supported a proposed
registration fallback for wK:pY and wS:pB while their display tokens claimed no
session ID. Capture time and server endpoint were not supplied. That proposal is
historical and superseded; it is not the current fallback or runtime behavior.

The historical account attributed the baseline to `AgentSchema` retaining only
`agent_session.value`, then erasing that value before a footer read. Its proposed
fallback retained source/kind/vendor provenance, accepted explicit
`herdr:codex` / `kind=id` / Codex UUID registrations, and ran rollout and bounded
metadata checks. Those details record the superseded candidate only.

`owner-native-validation-oct21.json` remains a factual read-only snapshot from
2026-10-21T01:58:21Z: all three supplied Codex IDs passed its strict
exact-rollout ID/vendor/cwd checks; wK:pY and wS:pB had no model/effort observation
in the bounded tail, while wM:p3 yielded `gpt-6.1-sol` / `high`. Its **dry-run**
`projectAgents` replay used synthetic tab handles and a recording callback only.
It neither tests the current safe cut nor proves a deployed UI-after state.

The historical regression fixture `tests/owner-list-oct21.json` preserves the
supplied excerpts, and its synthetic tab handles reflect the missing real handles.
The prior candidate's 26 tests and 264 assertions, including its intentional
old-parser failure, are historical results, not verification of `bf90866f`.

## Baseline inspection before the supplied native artifact

Observed 2026-10-21, 10:46–10:47 JST. UI repair is **unverified**.
This report changes no runtime behavior and requires no release changeset.

## Observations

- The supplied image
  `/tmp/herdr-clipboard-images-1000/client-4-clipboard-1792546482110452916-0.png`
  shows two Codex rows with `n/a(no session id)`, one Codex row with
  `n/a(name unavailable)` and `GPT-6.1-Sol medium`, and one Claude row with
  `n/a(no session file)`. It exposes no server/session/pane handles. Rows have
  not been assigned to panes by position, cwd, or historical identity.
- `herdr --skill` supplies the installed skill. Its caller rule says:
  “Do not inspect or control the focused Herdr session from outside Herdr.”
  This worker has no `HERDR_ENV=1`; no native session/pane inspection or mutation
  was performed. Own producer files and unit state were inspected under the
  brief's explicit permission.
- `readlink -f ~/.bun/bin/herdr-projector` resolves to
  `/home/fuyu/dotfiles/tools/herdr-projector/src/herdr-projector.ts`.
  Installed package version is `0.1.11`.
- SHA-256 matches workspace and deployed source:
  projector `c346281bdab83bd63a8c1ee95484caa53a1fd50f5733402a56c4e7b13b16da33`;
  shared fleet reader `0d2edd5407a7a992025b845ef095e7cba9a5e1ae848099707e46c91495d34c90`;
  service declaration `cc719c99310bb1480d2f0ccabd08ee62bc03473d69bd57ed0861f705f44d3a95`.
  An outdated deployed source is not supported by this sample.
- `systemctl --user show` reports path active/running, timer active/waiting,
  both Result=success. Service was activating/start-pre, Result=success,
  ExecMainStatus=0. StartLimitBurst=5 and StartLimitIntervalUSec=10s remain;
  ExecStartPre is sleep 3. No reset/reload/start was requested.
- The bounded journal (`--since '30 minutes ago' -n 100`) includes successful
  executions at 10:45:34, 10:45:41, 10:45:50, 10:46:06 and 10:46:14 JST,
  each reporting `projected 14 pane(s)`, interspersed with unchanged/zero
  executions. This is producer activity, not proof of native identity or UI
  correctness. The count is the existing count of successful rename/metadata
  pairs, not successful exact native bindings (source lines 351–353).
- At `2026-10-21T01:47:19.372Z`, read-only inspection of the unit's pre-start
  process `/proc/2065568/environ` showed `XDG_RUNTIME_DIR=/run/user/1000` and
  no HERDR_ENV, HERDR_SESSION_ID, HERDR_WORKSPACE_ID, HERDR_TAB_ID,
  HERDR_PANE_ID, HERDR_SOCKET_PATH or CODEX_HOME. Only those keys were emitted.
  Unit Environment, PassEnvironment and UnsetEnvironment are empty.

## Producer boundaries demonstrated by source

- `src/herdr-projector.ts:234–241` invokes `herdr agent list` without an explicit
  session/machine selector. `:372–385` then reads explicit pane handles returned
  by that invocation. `systemd/herdr-projector.service:13` supplies no target
  declaration. Combined with the sampled environment, there is no explicit
  producer target binding to match against the image. This does not establish
  that the default target is wrong; it establishes the missing correspondence.
- `src/herdr-projector.ts:144–153` clears the tick's prior identity and silently
  skips absent/unrecognized footers, unavailable cwd and unresolved rollouts.
  `:178–208` also silently skips metadata validation failures, changed footer
  observations, native-report failures and fleet-write failures.
  `:214–229` clears the native authority for unsuccessful bindings.
  `:249–261` reduces absent identity to `no session id`. The journal cannot
  distinguish these failure stages retrospectively.
- Four sampled Codex fleet records exist, with explicitly unavailable names:

  | session_id | recorded pane | updated_at (UTC) | model / effort |
  | --- | --- | --- | --- |
  | 01a15424-5f6d-7ce0-9244-eb632a37f579 | wK:pY | 2026-10-21T01:28:13.854574461Z | GPT-6.1-Sol / high |
  | 01a15c21-4663-7d72-ade8-d32de082ac17 | wW:p6 | 2026-10-21T01:44:31.078867521Z | GPT-6.1-Sol / high |
  | 01a15754-405f-7222-9cb9-a4689bfda188 | wS:pB | 2026-10-20T04:18:49.661821348Z | GPT-6.1-Sol / high |
  | 01a15756-fa1f-7da2-96c7-a02502d5a3d1 | wW:p4 | 2026-10-20T03:32:43.364152684Z | GPT-6.1-Sol / medium |

  These files do not establish current pane occupants, current native registration,
  or correspondence with the image. Old records must not become fallback bindings.

## Exact missing artifact and bounded proposal

The indispensable missing artifact is a contemporaneous owner-context witness
that links the image to its **server identity and session/socket selection**, then
links each failing row to an explicit native pane handle. For each such handle,
the witness needs the native `agent_session` and display tokens, the bounded
visible bottom five rows, and the exact-ID rollout resolution/metadata validation
outcome. It needs observation timestamps; a fleet record alone is insufficient.

Do not select a server/session from this report's historical pane examples. Do
not invent HERDR_ENV or attach/focus/restart anything to obtain that witness.
No worker native-introspection command is proposed outside the skill's context.

Once supplied, the smallest producer change can be selected from evidence:
correct a demonstrated target declaration mismatch, or fix the specific rejected
footer/rollout form with a matching fixture. Separately, a bounded diagnostic
would make existing rejection stages inspectable: one reason code per listed
Codex pane per pass (footer-read/shape, cwd, rollout-resolution, metadata,
observation-changed, native-report, fleet-write), no pane text or transcript in
logs. Such diagnostics must retain exact-ID checks, the three observations,
no-op writes and start-limit coalescing. Neither proposal has been implemented
or presented as a UI repair.

## Verification

The required foreground command completed with exit 0:

```sh
bun check --threads=1 tools/herdr-projector/tests/projector.test.ts && bunx --bun oxlint --type-aware tools/herdr-projector/src tools/herdr-projector/tests/projector.test.ts tools/shared/src/fleet-session.ts && bun test tools/herdr-projector/tests/projector.test.ts
```

Typecheck: six files, no errors. Lint: success. Tests: 23 passed, 204 assertions.
These are existing regression checks, not a new live-failure fixture or UI witness.
