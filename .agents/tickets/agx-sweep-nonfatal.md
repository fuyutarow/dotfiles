+++
schema = 2
name = "agx-sweep-nonfatal"
outcome = "a stale-temp sweep can never stop a new agx run: in tools/agx/src/temp.ts, sweepStaleTemps (called inside openDir, temp.ts:~85) turns every per-entry failure into one stderr warning naming the path and errno and continues; removeEntry (used by the sweep and by a run's own remove()) first restores owner write permission on every directory under the entry so read-only subtrees left by tests are removable; a run's own remove() at run end runs only after the ended record (report, verify, outcome) is written, and its failure is a warning, never an exit before or instead of the record; the new run's own mkdir/pid write still fail loudly"
writes = ["tools/agx/src/temp.ts", "tools/agx/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/agx/tests", "mise run lint:ts"]
timeout_s = 1800
premises = ["file:tools/agx/src/temp.ts"]

[proposition]
id = "SWEEP-NONFATAL"
claim = "fixtures: a dead owner's temp dir containing a 0555 subdirectory is removed by the sweep; a temp entry whose removal fails (e.g. a path made immutable in the fixture, or an injected rm error) yields one warning and the new run still gets its own temp dir and starts; a live owner's dir is never touched; a run whose own temp dir contains a 0555 subdirectory still writes its ended record and exits with the worker's outcome"
refuted_by = "any sweep failure that makes createRunTemp return an error, or a read-only subtree that survives removal"
+++

Incident 2026-10-16 00:01 (fleet-wide): every new agx run (coralbase merge28-2, mise-split-2) exited in 0.5 s with
`agx: cannot create run temp directory: Error: EACCES: permission denied, rm '/home/fuyu/.cache/agx/tmp/00ea0ea9-…'`.
The dead run's fixture (reclaim-fix) had created `graveyard-fuyu` with mode r-x; the sweep threw inside openDir and
aborted the new run. The coordinator removed that dir by hand to restore service. The same EACCES also killed the owning run itself at its end (temp.ts:43 removeEntry via temp.ts:92 remove) after 34 min of work, before its ended record was written, so its report was lost. Unix: the sweep is housekeeping and
must stay silent on success, loud but non-fatal on failure. Test data outside the workspace. Do not commit or push.
