# GPU task wchan persistence fix — static evidence

Date: 2026-10-21

## Scope and result

The task-level `/proc/<tgid>/task/<tid>/wchan` unavailable branch creates a bounded candidate after its existing leader and task identity rechecks. It does not immediately refuse. The existing candidate collection takes one shared `DXG_CONFIRMATION_INTERVAL_MS = 3000` ms delay and rechecks both start-time identities before deciding.

This is task-only. The leader-level initial unavailable-wchan branch retains its immediate
fail-closed policy from the 1.5.12 scope; it is neither a candidate nor covered by this
new confirmation. The proposition concerns distinct D-state tasks, so changing the leader
branch would expand the authorized behavior.

## Task transition table

| Initial task observation | Confirmation observation after >=3000 ms, same TGID/TID start times and D state | Result |
| --- | --- | --- |
| unavailable/empty/zero/unreadable wchan | unavailable/empty/zero/unreadable wchan | Refuse with `GPU persistent D-state wait channel unavailable`, TGID/TID, leader state, `observations=2`, and interval/evidence. |
| unavailable/empty/zero wchan | non-D | Discard candidate. |
| unavailable/empty/zero wchan | task or leader gone | Discard candidate. |
| unavailable/empty/zero wchan | task or leader reused identity | Discard candidate. |
| unavailable/empty/zero wchan | readable non-dxg wchan | Discard candidate. |
| unavailable/empty/zero wchan | readable dxg wchan | Refuse as `GPU persistent D-state mixed wait-channel evidence`; it names initial unavailable and confirmed dxg evidence and is deliberately not called two dxg observations. |
| readable dxg wchan | readable dxg wchan | Existing persistent-dxg refusal is unchanged. |

The readable-dxg row is the only two-readable-dxg result. The confirmation delay is shared
across collected candidates, so this adds neither a per-task sleep nor an unbounded wait.
The fast path has no readable-dxg candidate and no D-state task with an unavailable wait
channel. The snapshot remains admission-only: it neither monitors the driver nor guarantees
future driver health.

## Limits

This is static source reasoning with an independent documentation review limitation. The
earlier narrow TypeScript lint passed for the source patch; this documentation-only repair
runs the requested Markdown check. No tests or GPU/process probes were run. This repair
does not change source, runtime policy, stat/enumeration/identity failure handling, the
six-job or VRAM limits, retry behavior, or the existing patch release intent.
