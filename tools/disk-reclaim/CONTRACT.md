# Process-use contract

Process evidence is scoped to the owner's uid. Only a process whose uid equals
the uid being checked can make a candidate `KEEP` or `ASK`; every other uid,
including root, is skipped. This applies to all targets and the approved-delete
path. The earlier root-process and private-ancestor exception does not apply.

The reason for this scope is: "all agents and workers run as the owner's uid;
foreign-uid daemons do not use user scratch or workspaces (owner decision
2026-10-08)".

For a same-uid process, a readable cwd or fd under the candidate is positive use
and yields `KEEP`. On `EACCES`, the scan rechecks process starttime once: a
vanished or reused pid is treated as gone; a still-live process whose readable
comm is in `ignore_unreadable_procs` is ignored; otherwise the result is
unknown and yields `ASK`. Permission failures for a same-uid process in
approved-delete remain a refusal because delete supplies no ignore list.

If the process table itself cannot be listed, the scan remains unknown because
it cannot establish that same-uid processes were examined. Unit tests may set
`RECLAIM_UNIT_PROC_ROOT`; normal target and delete scans use `/proc`.
