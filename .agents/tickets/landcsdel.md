+++
schema = 2
name = "landcsdel"
outcome = "`mise run land` of a workspace that adds a changeset commits: the consumed changeset (added by the workspace, removed by land's release step) is not passed to jj-commit as a path, while the version bump and CHANGELOG entry it produced are"
writes = ["scripts/land.ts", "scripts/land-changesets.ts", "scripts/tests/land*.ts"]
verify = ["bun test scripts/tests/land.test.ts scripts/tests/land-changesets.test.ts", "mise run gate:land"]
timeout_s = 1200
premises = ["file:scripts/land.ts", "file:scripts/land-changesets.ts", "rev:7c01798097f3"]

[proposition]
id = "LAND-CONSUMED-CHANGESET"
claim = "landing a workspace whose only tool change is an added changeset plus source files produces one commit containing the source files, the bumped package.json and the new CHANGELOG entry, and no changeset file"
refuted_by = "a land fixture with a new .changes/<slug>.md fails at commit, or the commit contains the changeset file, or omits package.json/CHANGELOG.md"
+++

Observed 2026-10-15 (alpha 7c01798097f3), `bun scripts/land.ts … cccgpu`:
    [land] paths: ok [..., "tools/agent-resource-run/.changes/ccc-gpu-only.md", ...]
    [land] restore: ok restored 6 paths
    [land] release: agent-resource-run 1.4.2 (1 changeset entries)
    [commit] $ bun agents/skills/wiring-mise-tasks/scripts/jj-commit.ts -m '…' …
    jj-commit: path is absent from the snapshot and base: "tools/agent-resource-run/.changes/ccc-gpu-only.md"
    [land] commit: FAIL mise exited 2
    [land] rollback: restored 8 path(s) to the pre-land checkout
The release step deletes the changeset (it was new in the workspace, so it is in neither base nor snapshot) but the
path list handed to commit still names it; the produced package.json and CHANGELOG.md must be in that list. Every land
with a changeset fails this way. The rollback worked.
Do: after release, compute the commit path list as (restored paths − consumed changesets) ∪ (files release wrote).
A changeset that existed in base and is consumed is a deletion and must be committed as one. Add a land fixture test
for both cases. Do not run land on the real repo. Do not commit or push.
