+++
schema = 2
name = "triage-unlanded"
outcome = "a table, one row per run, of five unlanded 2026-10-15 runs whose workers reported a finished change: csparse (d7538896), versionguard2 (b7cfe492), worker-jj-guard (57cefa11), jjsafe4 (65b42f2b), runslug (34f7bf94); for each: its workspace path (from `agx ls --json`), the files its change touches (`jj diff --stat` in that workspace against alpha), whether alpha already contains an equivalent change (cite the alpha commit), and a verdict LAND (still needed and applies), REDO (still needed but conflicts or is stale against alpha; name the conflicting files), or DROP (already in alpha or superseded; cite what supersedes it)"
writes = []
verify = []
timeout_s = 1200
premises = []

[proposition]
id = "TRIAGE-UNLANDED"
claim = "each of the five rows has a verdict backed by a diff stat and, for DROP, a cited alpha commit"
refuted_by = "a verdict without a diff stat, or a DROP without the superseding commit"
+++

Read-only: change no file in any workspace. Use `agx ls --json` for each run's workspace and report path
(~/.local/state/agx-next/runs/<id>/report.json). Use `jj log -r 'alpha' -n 200` and `jj diff` read-only. Return the
table in the summary field of your JSON return.

## Current state (coordinator — single current version)
Your stop was right: in the read-only sandbox jj cannot snapshot the working copy, so `jj diff` showed only the old
recorded state. The coordinator exported each workspace's real change (snapshot taken outside the sandbox) as a git
patch: /home/fuyu/.cache/coord/triage/<ticket>.patch, with its base commit in <ticket>.base, for csparse,
versionguard2, worker-jj-guard, runslug and jjsafe4. Judge from those patches against current alpha (`jj log -r alpha`,
`jj file show -r alpha <path>`; read-only). Do not run jj in the workspaces. Return the same table, using the patch's
diffstat as the change.

