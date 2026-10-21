# GPU sampler operations

`src/gpu-sampler.ts` is the only driver-query owner. Statusline, transcript hooks,
resource admission, VRAM monitoring and service partitions read its state without
starting `nvidia-smi`.

On Linux, `mise run link:dots` installs and enables `gpu-sampler.timer` and its
one-shot service. The timer starts 15 seconds after boot and 60 seconds after each
run completes. `mise run doctor` checks that the timer is active and its last run
succeeded. The unit invokes `bun %h/dotfiles/tools/shared/src/gpu-sampler.ts` with
the declared core-tool PATH. Use the same absolute `XDG_STATE_HOME` for the service
and consumers if overriding the default `$HOME/.local/state/gpu-owner.json`.
Consumers never start this service.

`gpu-stall-notify.path` watches the default owner-state file and starts
`gpu-stall-notify.service` when it changes. The service reads the recorded stall
without querying the driver. Each new `unresponsiveSince` timestamp produces one
desktop notification naming the UTC time and `gpu-sampler --check`: a Windows
PowerShell toast on WSL, or `notify-send` on other Linux desktops. The WSL service
resolves PowerShell on PATH, then the default Windows C: mount.

Successful delivery commands are acknowledged separately in
`gpu-stall-notified.json` beside the owner state, by atomic replacement. Healthy
state (an omitted or null timestamp) does not notify. Restarting the service or
repeated sampler writes do not repeat an acknowledged stall. Failed commands leave
the stall pending for the next owner-state change; errors go to the user journal.
Systemd serializes service invocations. As with desktop notifications generally,
a successful command cannot prove the owner saw the toast; a crash between sending
and saving the receipt can repeat it. If overriding `XDG_STATE_HOME`, also override
the path unit's watched path and the notification service's environment.

Each invocation first inventories `/proc` for an existing `nvidia-smi`, then
checks the live `lslocks` rows for files matching `gpu.*` in
`$XDG_RUNTIME_DIR/agent-resource/slots` before starting any driver query. An
existing `nvidia-smi` is reported as a slow or unresponsive sample and is never
replaced with another query, even while a GPU slot is held. A held GPU slot
writes `paused: true`, the holder `{ slot, pid }`, and fresh
`attemptAt` and `sampledAt` timestamps. `sampledAt` marks the current owner
state as available during the admitted job; `lastProbeAt` marks when the
preserved device values were actually queried. The sample ring and device
values are preserved. A paused cycle does not add a probe miss and preserves any
existing `unresponsiveSince` and `stallEvidence`; it cannot clear a prior stall
without a successful probe. `gpu-sampler --check` treats an ordinary pause as OK
and prints the holder's slot and PID, while independently reporting live dxg
D-state tasks and any retained `unresponsiveSince`. The first cycle after all GPU slots
are free can probe without waiting out a pause-induced cooldown. Slot inventory
failures pause probing as well, fail-closed, and write fresh `attemptAt` and
`sampledAt`, `paused: true`, and a `why` containing the underlying error without
claiming a holder. They also preserve prior stall evidence. `lastProbeAt` still
identifies the preserved device observation; an inventory pause is not a
successful driver probe. The recovery check reports the inventory error. If no
slot directory exists, there are no admitted slots.

The inventory requests both `PID` and `PATH` from `lslocks`, matching the fields
it validates. Requesting only `PATH` omits `pid` from every row and incorrectly
rejects even unrelated locks as invalid slot state. Empty `lslocks` output means
no locks, matching `agent-resource-run status`. The unit receives
`XDG_RUNTIME_DIR` from the user manager; no shell initialization is required.

After the existing-process and slot checks, each invocation may start
`nvidia-smi -q -x`.
An existing process blocks the query regardless of its state, including D and Z.
Inventory errors fail closed; platforms without this inventory also refuse queries.
One XML response supplies device and process data. The owner atomically records an
attempt before spawning, preserves a 60-second cooldown across failures/restarts,
and records `unresponsiveSince` when a query has not answered. A timeout does not
prove that its child exited. Readers report `unresponsive since <time>` or `stale`;
successful observations expire after 120 seconds. One observation, rather than one
consumer read, counts toward the GPU averages. Brief peaks between observations can
be missed.

Locks record the owner's PID and a unique ID. They are reclaimed automatically only
when Linux `/proc` confirms that the owner PID is gone and no `nvidia-smi` remains.
A live PID, an unreadable inventory or a missing/corrupt owner record refuses
recovery; age alone never authorizes it. The state file survives recovery so the
60-second cooldown still applies. Retired owner directories remain beside the state
file to prevent delayed concurrent reclaimers from moving a successor's lock.
These small records must not be removed while sampler requests may still be running.
Corrupt sample state also refuses queries and requires operator repair.

The slot check and the subsequent spawn are separate operations. An admitted job
can acquire its slot after the sampler sees no lock and before the sampler spawns;
the sampler lock serializes sampler invocations only and does not make this
cross-tool check-and-spawn sequence atomic. A second slot check would still leave
a race window. Eliminating it requires shared mutual exclusion around admission
and spawn. The protocol serializes participating sampler invocations. Unmanaged
programs must also migrate their driver queries to state reads: process inventory
cannot prevent an unrelated program from independently launching a query after
the inventory.
Whether polling triggers the WSL driver deadlock remains unverified.
