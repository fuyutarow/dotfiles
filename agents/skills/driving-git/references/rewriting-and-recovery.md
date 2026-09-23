# Rewriting and recovery — the G3 protocol and the recovery ladder (SOLE home)

> Scope: what happens BEFORE and AFTER any operation that changes commits others may hold. Also how
> to get work back when git looks like it lost it. Job rows point here (`jobs.md` §4, §8, §12–§14).
> Nothing here is version-pinned; dated facts live in `config.md`.

## 1. G3 — the rewrite protocol, sized by blast radius

First inspect publication and sharing evidence:

```
git branch -r --contains <oldest-commit-to-rewrite>     # a hit is evidence of publication
git branch --contains <oldest-commit-to-rewrite>        # a branch you did not make, or a `+` (other worktree) → SHARED
git worktree list; bun scripts/git-check.ts state         # worktrees>1, or peers known → SHARED
```

Remote-tracking refs can be stale or incomplete; an empty result does not prove UNPUBLISHED.
Check the relevant remote refs and known publication history before choosing the private row.
Reuse existing authorization covering the same rewrite; do not require the user to repeat it.

| Radius | Before | After |
|---|---|---|
| **Private** — unpublished, own checkout | nothing; the reflog is the undo | `git range-diff` when more than one commit moved |
| **Published, own branch** — topic branch only you push | `git tag backup/<b>-<yyyymmdd>` | `range-diff`; push with `--lease` (`jobs.md` §8) |
| **Shared** — `<base>`, or any branch a peer has checked out | user authorization covering the rewrite · freeze coordination with affected peers · safety tag · peer checkouts at op=none | `range-diff` · lease push · landed notice · peers replay only unpushed work or re-clone |

For removal/expiry, §3 and `storage-and-cleanup.md` §2 override an in-repository safety tag with an independent backup.
Draft the freeze notice for external collaborators; send it only when communication is authorized.

A rewrite that removes a blob must remove it from every commit that carries it. `git revert` of
the adding commit leaves the blob reachable and the push still fails (firedancer, 2026-09-21).
Rewrite the range, do not revert.

**Freeze notice** — the text is the artifact. It carries:

| Field | Content |
|---|---|
| who / which branch / what range | the rewriter, `<base>`, `<oldest>..<tip>` |
| expected duration | minutes, not "soon" |
| what peers must not do | commit, rebase, gc, launch jobs that read tracked files |
| the receipt they will see | `range-diff` summary + the new tip sha |

## 2. Recovery ladder — take the cheapest rung that has the observable

| Rung | Symptom | Do | Receipt |
|---|---|---|---|
| 1 | "my commit vanished" after rebase/reset/amend | `git reflog` (also `git reflog show <branch>`) → `git branch recover/<x> <sha>` | the commit under `git log recover/<x>` |
| 2 | dropped stash | `git fsck --lost-found` → objects in `.git/lost-found/commit/`; `git stash apply <sha>` on the one whose tree matches | `git stash show -p <sha>` |
| 3 | file deleted, never committed | not git's — editor local history, or the trash (`rip` keeps one) | — |
| 4 | detached HEAD commits abandoned by a `switch` | `git reflog` shows `checkout: moving from <sha>`; branch it | as rung 1 |
| 5 | rebase went wrong mid-way | `git rebase --abort` returns to `ORIG_HEAD`; if already continued, `git reflog` for the pre-rebase tip (`rebase (start)` entry) | `git range-diff` old vs new |
| 6 | missing objects after concurrent GC | stop writers; preserve the store; re-run `git fsck --connectivity-only` when idle; restore missing objects from a verified backup/remote | no missing/corrupt objects; never assume they will reappear |

Reflog entries expire (`gc.reflogExpire`, `gc.reflogExpireUnreachable`; the defaults are in
`config.md` §1). `reflog expire --expire=now` and `gc --prune=now` delete the safety net. Both are
on the deny-list, and never run on a checkout someone else is writing.

## 3. Remove historical content — SOLE home of the rewrite procedure

### 3.1 Choose the reason and scope

| Reason | Before the rewrite | Completion target |
|---|---|---|
| Ordinary size reduction / rejected large-file push | diagnose with `storage-and-cleanup.md`; enumerate unwanted blob IDs or every historical path | selected objects absent from intended reachable history; retained content correct; measured size/transfer result |
| Exposed credential | revoke/rotate first; determine whether historical removal is also needed | revoked credential, redacted removal checks, and separately tracked cleanup of hosted copies |
| Other sensitive data | identify occurrences, historical paths, refs, and affected copies without printing the content | the declared removal scope verified; unresolved forks/caches reported |

Use `--sensitive-data-removal` for the sensitive-data rows after checking installed support (`config.md` §6).
Size alone does not trigger credential rotation or a sensitive-data support request.
Apply §1 to the actual branch ownership; a published topic branch is not automatically shared.

### 3.2 Freeze the input and filter an independent clone

1. Record local refs, remote URL, and advertised remote ref OIDs before rewriting.
   Define the ref universe: affected branches, tags, other refs, and any host-managed refs requiring separate handling.
   An ordinary clone's branches are not evidence that every server ref was fetched.
2. Preserve an independent recovery copy outside the rewrite clone; record which local-only work it contains.
   Restrict access to backups containing secrets. A backup tag inside the rewritten store is insufficient.
3. Make a fresh independent clone covering the declared refs. For a local source, use `git clone --no-local`.
   Mirror cloning may help capture advertised refs; it does not authorize mirror pushing.
   Do not bypass the fresh-clone check with `filter-repo --force` as a routine repair.
4. Inspect `filter-repo --analyze` reports and freeze the removal list.
   Paths do not follow renames: enumerate previous names too.
   For exact blobs, use `--strip-blobs-with-ids <reviewed-file>`.
   For whole paths, use `--path <old-path> --path <new-path> --invert-paths`.
   Use `--strip-blobs-bigger-than <size>` only when every affected blob is intended for removal.
5. For text removal within a retained file, use `--replace-text <restricted-file>` with the sensitive-data flag.
   Keep secret values out of argv, logs, and receipts. Protect the expressions file and dispose of it deliberately.
6. Run the selected filter in that clone. Preserve `commit-map`, `ref-map`, and changed-ref/removal reports it emits.
   Normal full filtering can remove `origin`, expire reflogs, and prune old objects.
   Verify the destination URL before restoring a removed remote; do not fetch old history into the cleaned clone.

### 3.3 Verify locally, then publish the full intended ref change

| Check | Required result |
|---|---|
| Removal | enumerate reachable objects over the declared refs; no selected blob IDs remain; deleted historical paths are absent |
| Sensitive content | scan the declared content/history scope with redacted output; blob-ID absence alone does not prove text removal |
| Preservation | compare mapped old/new ref tips against the external backup; only intended tree changes; run relevant repository tests |
| Commit structure | inspect maps for dropped commits, tags, and merges; `range-diff` is supplementary and cannot prove whole-repository absence |
| Integrity / capacity | `git fsck --connectivity-only` reports no missing/corrupt objects; repeat the storage measurements |
| Publication plan | account for every changed/deleted remote ref, including tags; record host-owned refs that cannot be updated by push |

Apply G4's timeout and explicit expected-OID lease to each enumerated update/deletion.
The bundled push helper covers branches; other refs need an explicit full-ref lease and a refspec.
Example for a rewritten tag, under the runner's timeout:

```sh
git push --force-with-lease=refs/tags/<tag>:<old-oid> origin refs/tags/<tag>:refs/tags/<tag>
```

Read remote refs again after publication; every planned update/deletion must match.
If a lease rejects new work, reconcile it; never replace the lease with an unconditional force.
Do not use `--mirror` as a shortcut: it can overwrite/delete refs outside the intended change set.

Hosted PR refs, cached views, forks, and LFS objects require the host-specific path in `config.md` §6.
Report partial publication or pending hosted cleanup explicitly; local success cannot close those items.
For other clones, prefer re-cloning after preserving unpushed work.
Replay only unpushed commits against the cleaned base. Merging old history can restore removed data.
Handle local object reclamation through `storage-and-cleanup.md`; no automatic reflog expiry or immediate pruning.

## 4. Abandoned operations — leaving the tree clean

| Paused | Finish | Abandon |
|---|---|---|
| rebase | resolve → `git add -- <f>` → `git rebase --continue` | `git rebase --abort` |
| merge | resolve → `git add -- <f>` → `git merge --continue` | `git merge --abort` |
| cherry-pick / revert | `--continue` | `--abort` (or `--quit` to keep the tree) |
| bisect | — | `git bisect reset` |
| stash pop conflict | resolve → `git add` → `git stash drop` (pop keeps the entry on conflict) | `git restore --staged . && git restore .` ONLY after the stash entry is confirmed still present |

`git-check state` refuses while any of these is paused. "You must edit all merge conflicts" with
no unmerged paths means a dirty tracked file blocks `--continue`. `git status --short -uno` must
be empty (submodule lines excepted) before continuing.
