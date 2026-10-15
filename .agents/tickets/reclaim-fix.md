+++
schema = 2
name = "reclaim-fix"
outcome = "disk-reclaim recovers at scale: the rip graveyard is a declared delete root so `disk-reclaim delete <graveyard>/<subtree> --yes` works; inside the graveyard (already-deleted data) the repo-store refusal does not apply; rip-expire and tmpfs process candidates fast-first (smallest/cheapest first) and can be limited to one named subtree; tmpfs usage is measured once per stage, not per candidate; liveness uses one snapshot per stage; progress reports files and bytes removed; a scale test (100k tmpfs candidates, 1M graveyard files) finishes within a stated bound"
writes = ["tools/disk-reclaim/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/disk-reclaim", "mise run gate:land"]
timeout_s = 3600
premises = ["file:tools/disk-reclaim/reclaim.toml", "file:tools/disk-reclaim/README.md"]

[proposition]
id = "RECLAIM-AT-SCALE"
claim = "fixtures: delete of a graveyard subtree succeeds with all live/uid checks still applied; a graveyard entry holding a .git/.jj is purged; 100k tmpfs candidates are reclaimed with O(1) mount measurements per stage; rip-expire purges a small subtree before a huge one; the scale test meets its stated time bound on this host"
refuted_by = "a graveyard subtree refused for being outside delete roots or for holding a repo store, per-candidate mount measurement, a huge entry processed before a small one, or a scale test over its bound"
+++

Postmortem N3/N4 (/home/fuyu/Workspace/retrospectives/2026-10-15-disk-tmp-exhaustion-postmortem.md). Live evidence
(owner's terminal, 19:11-19:58): tmpfs stage re-measured 6 tmpfs mounts and logged ~8 lines per deleted 4-inode dir
(~80k candidates → hours); rip-expire processed graveyard/home (134 GB) before graveyard/tmp (15 GB), refused
graveyard/home/fuyu/{dotfiles,Workspace/firedancer,…} as "repo store holder", freed 0 B and reported "reduced free
space by 24166400 bytes"; `disk-reclaim delete ~/.local/share/graveyard/tmp --yes` refused with
fail:configured-root (reclaim.toml:5 delete_roots = ["/tmp", "~/.cache"]). Keep the safety design (live process,
same-uid, protected roots) intact outside the graveyard. Never delete real data while testing; fixtures only. Scale fixtures must never live on the shared /tmp tmpfs, under any name: TMPDIR inside a Claude worker is /tmp/claude-1000, the same tmpfs (run 487d3dfc put 167k inodes there and was stopped). Put scale fixtures on disk under ~/.cache/reclaim-scale/<run-id> or on a private size- and inode-capped mount you create, cap them at 100k entries, and remove them in a finally block. Unit tests stay small.
Changesets via `mise run changeset`. Do not commit or push.

## Current state (coordinator, 11:0x — single current version)
Accepted on substance; lint:ts passes. Land's commit gate now includes lint:no-sync (landed 3008e6be) and refused the
change: "984 site(s), baseline 981 — FAIL": your change adds 3 synchronous fs/child_process calls in tools/disk-reclaim
(look in the files you changed: src/lib/remove-tree.ts, src/targets/tree.ts, tree-scan-worker.ts, tests/fixtures/scale.ts
are likely). Make them async; use `// sync-ok: <reason>` only where a synchronous call is required. Your workspace
predates the rule, so `mise run lint:no-sync` may be missing: count the `*Sync(` calls you added yourself. You cannot
rebase in the sandbox; land rebases. Definition of done: lint:ts, lint:bun, typecheck clean and no new *Sync( call in
your diff; paste `jj diff | rg -c 'Sync\('` style evidence (use rr) in your return. Test data outside the workspace.
Do not commit or push.

