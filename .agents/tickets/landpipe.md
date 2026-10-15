+++
schema = 2
name = "landpipe"
outcome = "an accepted run reaches alpha without coordinator hand-work: `agx judge <run> accept` enqueues it; one serial land queue drains it by rebasing the workspace onto current alpha outside the sandbox, running land's own gate, and committing; a rebase conflict or gate failure is returned to the same worker lineage automatically with the conflicting files or failing check attached; worker verify always includes land's own check in land's environment, so 'verify green' implies 'land green' on the same tree"
writes = ["tools/agx/**", "scripts/land.ts", "scripts/land-queue.ts", "scripts/tests/land*.ts", "mise.toml", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx", "bun test scripts/tests/land.test.ts", "mise run gate:land"]
timeout_s = 3600
premises = ["file:scripts/land-queue.ts", "file:scripts/land.ts"]

[proposition]
id = "ACCEPT-TO-ALPHA"
claim = "in a fixture repo, an accepted run whose workspace forked from an old alpha lands after automatic rebase; a conflicting one is re-dispatched to its lineage with the conflict list; a run whose land-equivalent verify failed cannot be accepted"
refuted_by = "a fixture where accept requires a manual land command, a conflict leaves the run idle without a re-dispatch, or verify passes while land's gate fails on the same rebased tree"
+++

Retro 2026-10-15 (/home/fuyu/Workspace/retrospectives/2026-10-15-integration-pipeline-retro.md, roots 2-4): finished
work does not reach alpha. Today: >20 accepted results, more than half of ~14 lands failed (changeset format x5,
rebase conflicts x5 because workspaces forked hours earlier, verify≠land environment), workers cannot rebase (the
shared .jj store is read-only in the sandbox), and the coordinator hand-runs judge → land serially, leaving accepted
work idle for up to an hour.
Existing pieces to reuse: scripts/land-queue.ts (land --enqueue / --run-queue / --queue-status already exist; read
them first), scripts/land.ts (preflight, rebase onto alpha, restore, release, gate, commit, rollback), agx judge, agx
--continue.
Do:
1. `agx judge <run> accept` enqueues the run's workspace in the existing land queue (with the run's commit message
   from the ticket outcome unless one is given); a queue drainer runs as a durable user unit (KillMode=mixed) and
   processes entries one at a time.
2. Before land, the drainer rebases the workspace onto current alpha (outside the sandbox). On conflict or gate
   failure it records the failure on the run and re-dispatches the same lineage (`agx run <ticket> --continue <run>`)
   with an appended machine section listing conflicting paths or the failing check output; it never edits files.
3. Worker verify: agx appends `bun scripts/land.ts --dry-run <ws>`-equivalent checks (rebase preview + gate) run in
   land's environment, i.e. outside the sandbox by agx after the worker exits, and records them as verify rows; a run
   with a failing land-equivalent row cannot be accepted (judge refuses with the reason).
4. `agx ls` shows per run: queued / landing / landed <commit> / returned <reason>.
Tests in a fixture repo for each. Ticket csschema (scripts/land-changesets.ts, scripts/changeset.ts) and jjsafe2
(agx workspace lifecycle, KillMode=mixed, lock checks in tools/agx) are running: do not edit land-changesets.ts or
changeset.ts; rebase-aware of jjsafe2 by touching only judge/queue/verify code paths in tools/agx. Probe against a temp
AGX_NEXT_STATE_DIR. Do not commit or push.
