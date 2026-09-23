# Storage and cleanup — diagnosis, action, and size receipt (SOLE home)

> Scope: local disk reclamation and large-repository performance. History-removal mechanics live
> in `rewriting-and-recovery.md` §3. Sources and changing platform facts live in `config.md` §6.

## 1. Measure the thing the user wants to reduce

Record the target: local disk, clone/download size, hosted storage, or elapsed time for a named operation.
An exit code or a fast `status` does not prove disk reclamation.

Start from the target repository; resolve directories instead of assuming `.git` is a directory:

```sh
git rev-parse --path-format=absolute --git-common-dir
git rev-parse --path-format=absolute --git-path objects
git worktree list --porcelain
git count-objects -v
git config --get-regexp '^(extensions\.partialClone|remote\..*\.promisor|lfs\.storage)$'
```

No matching config exits 1; other command failures are not zero-sized results.
Use `du -sk` on the resolved directories and worktree; record each path and KiB separately.
Nested measurements overlap: do not add a common directory to its objects subdirectory.
Inspect `git lfs env` when LFS is installed; measure its actual storage path separately.

| Observation | Next inspection | Interpretation limit |
|---|---|---|
| Worktree dominates | measure its largest directories; preview untracked/ignored candidates (§3) | deleting a tracked file now does not erase its historical blobs |
| Object database dominates | `count-objects`: `size`, `size-pack`, `size-garbage`, `alternate`; then the reachability comparison below | these exclude worktree files and LFS payloads |
| Partial clone / promisor or alternates present | record the storage dependency before walking all objects | a full walk may require missing objects; use a complete independent diagnostic clone when needed |
| LFS storage dominates | §3 LFS row | ordinary Git GC cannot reclaim LFS payloads |
| Hosted usage or download size is the complaint | measure that host/transfer separately | local `du` cannot verify a server-side reduction |
| Operation is slow but disk is acceptable | §4 | no history rewrite justified by latency alone |

For a complete local object database, compare:

```sh
git rev-list --disk-usage --objects --all
git rev-list --disk-usage --objects --all --reflog
```

The first reports bytes reachable from local refs; the second also includes reflog roots.
Compare them with `count-objects` storage, converting its KiB to bytes.
Treat the differences as diagnostic signals, not exact reclaimable-byte promises.
Delta compression, duplicate copies, other worktrees, indexes, and alternates affect accounting.
Local `--all` does not inventory a host's hidden refs or other people's clones.

If reachable history dominates, run `git filter-repo --analyze` in the diagnostic clone.
It writes reports without rewriting history; use its blob/path/directory reports to select candidates.
Keep object IDs and historical paths, including renamed paths, in the deletion proposal.
Blob content size is not its packed disk cost. Never turn a size threshold into an unreviewed deletion list.
Tool installation/execution for `filter-repo` follows `running-python-tools` when Python tooling is needed.

## 2. Establish the deletion boundary

Before mutation, record the measured cause, exact targets, expected effect, and recovery source.
Apply G2/G3; existing user authorization for the same scope remains valid.

| Boundary | Required observation before deletion |
|---|---|
| Shared object store | resolve the common directory; account for every worktree, writer, fetch/push, and maintenance job using it |
| Repacking / GC | an idle maintenance window and enough scratch space for old and replacement packs to coexist; no universal space multiplier |
| Uncommitted files | saved copy or explicit discard scope covering those files; a tag protects no uncommitted bytes, and `stash -u` excludes ignored files |
| Reflog-only or unreachable work | recovery need resolved; a backup must contain the objects being discarded, not merely current branch tips |
| History rewrite | independent recoverable copy outside the rewritten store; G3 plus `rewriting-and-recovery.md` §3 |
| Missing/corrupt objects | stop reclamation; preserve the store and investigate recovery (§2 of `rewriting-and-recovery.md`) |

A linked worktree shares objects; it is not an independent backup or a GC isolation boundary.
A bundle made with `--all` does not preserve untracked files, LFS payloads, or every unreachable object.
Do not expire all reflogs or prune immediately as an automatic follow-up to cleanup.

## 3. Choose the smallest operation that addresses the measured cause

| Cause / objective | Action after §2 | Receipt / stop condition |
|---|---|---|
| Untracked build output | preview `git clean -nd -- <paths>`; after review use the same paths with `-fd` | listed targets gone; retained files unchanged |
| Ignored build output | preview `git clean -ndX -- <paths>`; after review use `-fdX` | same; ignored secrets and local configuration are not automatically disposable |
| Both ignored and untracked output | `-ndx` then `-fdx`, only for the same reviewed paths | no widened paths/flags after preview; never add a second `-f` to erase a nested repo |
| Stale remote-tracking refs | inspect fetch refspecs; `git remote prune --dry-run <remote>` then prune that remote | only reviewed refs removed; no claim that blobs were immediately reclaimed |
| Finished local branches | verify retained integration tip, unpushed work, and worktree ownership; `git branch -d <branch>` | branch absent, retained tips unchanged; refusal is a review point, not a reason for `-D` |
| Unneeded worktree | preserve detached/unmerged commits and files; `git worktree remove <path>` | worktree list and disk measurement; never force through dirty/locked state |
| Stale worktree metadata | `git worktree prune --dry-run --verbose`, then prune with the same expiry | metadata removed; confirm missing path is not an offline mount; this does not remove a live worktree's files |
| Loose/obsolete packed objects | when idle, `git maintenance run --task=gc`; retain configured expiry policy | §5 comparison; inspect effective `gc.*` expiry first; do not add `--aggressive` or immediate prune |
| Space retained by recovery history | keep retention unless discarding that recovery history is in scope; use a verified independent copy before changing expiry | record remaining bytes and retention reason; smaller size is not worth silent loss of recoverability |
| Large reachable historical blobs | `rewriting-and-recovery.md` §3 | absence of selected blobs across intended refs, retained content, local/host size separately |
| LFS cache | verify storage is not shared by different repos; preview `git lfs prune --dry-run --verbose` | inspect selected objects and remote before deletion; next paragraph owns the execution flags |
| Abandoned `tmp_pack_*` / locks | identify owner/process and prove it is no longer running before targeted cleanup | no filename-only deletion rule; preserve valid packs and unexplained files for recovery |

For LFS execution, check installed help for `--verify-remote`, `--verify-unreachable`, and `--when-unverified=halt`.
Run `git lfs prune --verify-remote --verify-unreachable --when-unverified=halt` only with those protections available.
If verification fails or the storage is shared across repositories, stop and preserve the local objects.
Git reflogs do not protect LFS payloads; do not add `--force` or `--recent` to increase reclamation.
Local LFS pruning does not reduce the host's LFS bill or quota.

`git maintenance run` without `--task` follows effective configuration and may select GC.
It is not a concurrency-safe substitute for arbitrary GC.
Use explicitly selected background-safe tasks only when their documented behavior fits the concurrent workload.

## 4. Reduce future cost without deleting history

| Need | Operation | What to measure |
|---|---|---|
| Download fewer blobs in a new clone | `git clone --filter=blob:none <url>` when the server supports filtering | transfer bytes plus later on-demand fetches; this does not shrink an existing full clone |
| Materialize fewer tracked files | `git sparse-checkout set <dirs>` after preserving tracked, untracked, and ignored work | `sparse-checkout list` and worktree bytes; downloaded objects remain; ignored files in excluded directories may be removed |
| Faster status on a large tree | inspect platform support, then repo-local fsmonitor/untracked-cache configuration | same `git status` invocation before/after; no fixed latency promise |
| Recurring maintenance | inspect strategy and schedule, then `git maintenance start` when user-level registration/scheduling is authorized | global registration, repo config, and scheduler; registration is not a space-reclamation receipt |

Prevent recurrence through the actual producer: generated-output policy → `wiring-repositories` for `.gitignore`.
Choose LFS/artifact storage explicitly; adding an ignore rule or LFS tracking does not migrate old history.

## 5. Close with a storage receipt

Record before/after for the same paths, units, ref scope, and command; report reclaimed bytes or zero.
For local object cleanup, also compare retained ref OIDs and run `git fsck --connectivity-only`.
No missing/corrupt objects is required; dangling objects may be expected under the retention policy.
For file cleanup, verify retained tracked changes and saved local files; for a rewrite, use its §3 checks.
For hosted cleanup, keep the server result pending until the host's own metric or confirmation arrives.
If the target is not met, return to §1 using the remaining measured cause; do not automatically escalate deletion.
