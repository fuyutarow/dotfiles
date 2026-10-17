# acpx replacement decision — 2026-10-22

Keep the native Codex and Claude transports. Do not introduce an acpx production route in
this change. The released replacement fails two required capacity contracts; this is an
executed rejection, not a decision deferred because testing is missing.

The reproducible observations and fixture source snapshots are in
[the comparison receipt](../evidence/acpx-native-comparison-20261022.json).

## Required outcome and responsibility boundary

A ticket selects an eligible worker, executes inside the requested boundary, and returns
an attributable result. An observed provider overload must end as `capacity`/75 without
another wrapper retry. It must not become a successful return or a worker failure. Quoting an overload
message in ordinary assistant text must remain harmless.

The intended composition would be:

```text
ticket / roster / run owner
  -> agx receipt + policy bridge
  -> acpx session / turn / cancellation
  -> vendor ACP adapter
  -> native hooks and native sandbox
```

acpx owns ACP transport, session management, and normalized events. The native vendor
owns hook execution and OS isolation. agx owns ticket provenance, routing, required run
outcomes, cooldown, verification and recorded judgments. Resource admission belongs to
`agent-resource-run`, and workspace creation belongs to `agx ws`; neither moves into acpx
or becomes a new responsibility of agx-worker.

Disabling acpx filesystem and terminal callbacks is not OS isolation. The probes disable
those callbacks and separately exercise native filesystem writes and native denial.

## Executed replacement acceptance

Versions checked against the current npm registry: acpx 0.20.0, codex-acp 2.2.2,
claude-agent-acp 0.94.0. Native executables: Codex 0.163.0 and Claude Code 2.1.306.
The replacement is a concrete 99-line receipt bridge using the published runtime.

The native executables, ACP adapters, hooks, and filesystem operations are real. Only
the model HTTP endpoint is a deterministic localhost fixture. No real inference or paid
vendor call is needed for these transport and failure contracts. This does not measure
model quality, live quota, all sandbox escape classes, or all hook types.

| Required observation | Codex replacement | Claude replacement |
| --- | --- | --- |
| Allowed tool call actually writes a marker | Passed | Passed |
| SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and Stop run | Passed | Passed |
| Native PreToolUse denial prevents the marker write | Passed | Passed |
| Workspace sandbox prevents an outside marker write | Passed | Passed |
| Read-only mode prevents an inside marker write | Passed | Passed |
| Quoted capacity words remain successful ordinary output | Passed | Passed |
| Native overload becomes capacity/75 before attempt two | **Failed: returned/0** | **Failed: retries, then timeout/3** |

With provider HTTP retries disabled, the two native agx capacity controls both return 75
after one model attempt. The complete
14-test matrix was re-executed: **12 passed, 2 failed**, with precisely the replacement
capacity expectations failing. That nonzero exit is evidence against adoption.

The fixtures trust only their isolated hook file. They do not alter user hook trust.
Claude gets a short, run-owned temporary path so an initialization failure caused by
Unix socket path length cannot masquerade as a successful sandbox denial.

An earlier compatible codex-acp 1.13.1 control allowed a read-only marker write. The
latest 2.2.2 denies it. The rejection above uses the latest adapter's capacity failure,
not that older compatibility counterexample.

## Can a small configuration bridge repair capacity?

The stock runtime does not advertise the adapters' AIR `sessionFailure` capability.
Codex therefore emits a terminal service error as an ordinary assistant text chunk and
finishes `end_turn`. Searching that text for an overload phrase would also misclassify
the successful quotation control.

A further wire-proxy probe advertised only AIR `sessionFailure`, without patching the
adapters or changing the simulated model responses:

- Codex now exposes a structured failure with the original 503 message on the wire and
  in the terminal result's public `_meta`. The original bridge ignores this field and
  still returns success. A further candidate interprets that typed terminal metadata:
  it recovers capacity/75 without classifying quoted assistant output as an error.
  This needs the custom capability-negotiating wire proxy; it is not a stock-runtime
  configuration option. Codex is therefore repairable through extra integration, not
  fundamentally incompatible with ACP.
- Claude exposes a service-warning record titled `Retrying Claude, attempt 1 of 10.`
  Its original 529 status and `overloaded` error do not survive in that record.
- A separate HTTP 500 `api_error` control exposes the **same warning fields** for the
  same attempt. Incident/session identifiers differ; they do not encode the error kind.
  Both cases make five attempts before the fixture timeout.

Thus negotiating that extension alone cannot reconstruct Claude's overload identity.
Treating every service warning as capacity would change the existing error contract.
Restoring the distinction needs the adapter to preserve status/error kind before retry,
or a retained native-event side channel. The latter keeps a vendor-specific transport
observer beside acpx and defeats the proposed removal.

Increasing Codex's provider HTTP retry setting from zero to three made both the native
control and the repaired bridge call the fixture four times. This is provider-internal
retrying, not an extra wrapper dispatch. The one-attempt controls must not be generalized
to arbitrary native provider retry configurations.

## Concrete code comparison

| Current file | Whole-file lines | What acpx could replace | What still needs an owner |
| --- | ---: | --- | --- |
| `workers/codex.ts` | 811 | Native invocation and stream consumption, session resume transport | Model floor, host declaration, initial wait, bounded cleanup, receipts, checkpoint and spin handling |
| `workers/codex-progress.ts` | 343 | Codex-specific event decoding | Shared tally, progress persistence, cost projection, error-streak semantics; Claude also imports the shared writer |
| `workers/run-claude.ts` | 607 | Native invocation, session transport, JSONL consumption | Invocation policy, budget/turn constraints, bounded cleanup, interim reports, agx receipt mapping |
| `workers/claude-progress.ts` | 157 | Claude-specific event decoding | Projection of ACP usage, cost, tool activity and session identity into the existing progress contract |
| `workers/capacity.ts` | 86 | Nothing with the released combination | Typed capacity recognition, startup wait, exit 75 and stop grace |
| `workers/environment.ts` | 65 | Nothing | Child credential/environment selection and separation from coordinator identity |
| `workers/codex-host.ts` | 79 | Nothing | Explicit host-isolation declaration and effective-sandbox attribution |
| `workers/codex-resource-probe.ts` | 77 | Nothing | Resource reachability and the declared sandbox fallback policy |

All paths in this table are relative to `src/`. The first four files total **1,918 lines**,
an upper bound on the mixed transport/parser area, not a verified deletion count. Their
policy, persistence, and shared-writer code cannot simply be deleted. The 99-line bridge
implements the test boundary; it is not a complete production replacement with all of
those remaining behaviors.

Additional retained integration includes `src/next/run.ts` receipt consumption and verify
handling, `src/next/capacity.ts` five-minute cooldown, routing and continuation, ticket
snapshots, run leases, records and judgments. These remain useful independently of the
chosen execution transport.

**Safe production deletions for this migration: zero.** Neither vendor passes the
mandatory replacement contract. Keeping both native wrappers as fallback while adding
acpx would add dependencies and two execution paths without removing their maintenance.
Switching only the stock Claude or stock Codex path fails on that vendor. A custom Codex
path can repair capacity, but retains the protocol-negotiating proxy, result-metadata
interpretation, and every policy/projection/receipt responsibility listed above. It is a
different integration proposal from replacing the wrappers with the tested 99-line bridge.
Do not report 1,918 minus 99 as its maintenance saving.

## Decision and reopening conditions

Do not partially migrate the existing Codex/Claude worker routes to released acpx 0.20.0.
Keep the current working native paths and the corrected typed Claude 529 recognition.
No production acpx dependency or fallback route is added.

The conclusion is scoped to these released versions and this worker contract. Reopen
when a released client/adapter combination preserves overload status before adapter retry and
passes this acceptance matrix, including the quotation and HTTP 500 distinction. A new
vendor can independently use acpx after its required contract is exercised; the registry
entry alone does not establish hook, sandbox or capacity parity. The current roster also
accepts only `codex` and `claude`, so installing acpx does not automatically expand the
agx routing contract to every registry entry.

Repository splitting is a separate decision: the execution boundary is identifiable
without introducing another repository or a second run-state vocabulary.
