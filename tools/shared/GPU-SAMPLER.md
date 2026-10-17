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

Each invocation inventories Linux `/proc` before starting `nvidia-smi -q -x`.
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

The protocol serializes participating sampler invocations. Unmanaged programs must
also migrate their driver queries to state reads: process inventory cannot prevent
an unrelated program from independently launching a query after the inventory.
Whether polling triggers the WSL driver deadlock remains unverified.
