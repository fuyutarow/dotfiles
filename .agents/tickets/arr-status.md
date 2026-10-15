+++
schema = 2
name = "arr-status"
outcome = "agent-resource-run (tools/agent-resource-run) answers 'is this job waiting on a resource?' without reading logs (firedancer D9 and critical-path report, 2026-10-16: an integration lane waited behind slot julia-compile 'WAIT slot=julia-compile holders=2/2 ahead=3' for hours, unnoticed): (1) a read-only status command that lists every slot with its capacity, the source of that capacity (config file:key or the derived default and its formula, e.g. CPU count / 6), current holders (pid, unit, job id, since) and the queue (who waits, since when, position); (2) the wait itself is recorded as flat text events (slot, job, waiting-since, acquired-at) so another tool can compute wait time; (3) the capacity source is documented in the tool's README"
writes = ["tools/agent-resource-run/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agent-resource-run", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/agent-resource-run/package.json"]

[proposition]
id = "ARR-STATUS"
claim = "tests: with 2 holders and 3 waiters on a fixture slot, status prints both holders and the ordered queue with since-times, and the capacity line names its source; a job that waited records waiting-since and acquired-at; live probe: the status command run on this machine prints the current slots (paste it into checks)"
refuted_by = "a slot whose capacity source is not shown, or a waiting job absent from the status output"
+++

Read-only on the live state; never release or take a slot on this machine. Add no sync calls. Do not rebase; land rebases.
Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON return. Test data outside the
workspace. Do not commit or push.
