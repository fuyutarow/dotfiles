# Script changes

## 2026-10-10 — serialized land and deployment proof

`mise run land` now serializes direct landings and queued items with the same
land lock. The queue journal uses schema 1; these repo scripts have no separate
package version.

```sh
mise run land -- --enqueue <workspace-name-or-path> -m '<message>'
mise run land -- --run-queue
mise run land -- --queue-status
```

The state directory is `<agx-state>/land/<main-root-sha256-prefix>`, where
`agx-state` follows `AGX_STATE_DIR`, `XDG_STATE_HOME`, then `~/.local/state/agx`.
`queue.jsonl` contains schema-1 `enqueue`, `start`, and `result` records. Each
enqueue gets a new ID. Terminal results retain `OK` or `FAIL`, exit code, time,
and detail. Status counts queued attempts across the retained journal.

`queue.lock` protects journal access, `runner.lock` permits one queue runner,
and `land.lock` spans each landing through deployment. Locks use the existing
host/PID directory-lock implementation. The runner waits for a clean main
checkout before claiming the head, restores the item's applied paths after a
failed landing, and continues. It exits when drained, returning 1 if any item
failed during that drain. An interrupted started item is recorded as FAIL;
inspect its commit before enqueueing it again.

Rendering pins alpha or `DOTFILES_RENDER_REV` to a full commit ID and exports
inputs and renderer code with `jj file show`. The exported renderer writes
home files, retaining the host's private overlay and machine facts. Uncommitted
render inputs refuse before relinking. `mise run link:dots --
--from-working-copy` explicitly renders local changes; deployment forbids this
override.

Land relinks the local main checkout after committing and runs doctor locally.
Remote doctor runs after pull/deps under each host's deployment lock, with a
90-second timeout inside the existing 600-second SSH bound. Each host summary
reports `doctor PASS n / FAIL n` and prints FAIL findings. Counts come from
doctor's finding summary; an execution error or incomplete report adds one
failed proof. Doctor failures annotate the host as `ok (doctor FAIL n)` and
leave land's success decision to its commit/deployment stages.
