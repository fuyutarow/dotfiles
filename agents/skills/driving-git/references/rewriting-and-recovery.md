# Rewriting and recovery — the G3 protocol and the recovery ladder (SOLE home)

> Scope: what happens BEFORE and AFTER any operation that changes commits others may hold. Also how
> to get work back when git looks like it lost it. Job rows point here (`jobs.md` §4, §8, §12–§14).
> Nothing here is version-pinned; dated facts live in `config.md`.

## 1. G3 — the rewrite protocol, sized by blast radius

First answer PUBLISHED and SHARED with observables, not memory:

```
git branch -r --contains <oldest-commit-to-rewrite>     # any output → PUBLISHED
git branch --contains <oldest-commit-to-rewrite>        # a branch you did not make, or a `+` (other worktree) → SHARED
git worktree list; bun scripts/git-check.ts state         # worktrees>1, or peers known → SHARED
```

| Radius | Before | After |
|---|---|---|
| **Private** — unpublished, own checkout | nothing; the reflog is the undo | `git range-diff` when more than one commit moved |
| **Published, own branch** — topic branch only you push | `git tag backup/<b>-<yyyymmdd>` | `range-diff`; push with `--lease` (`jobs.md` §8) |
| **Shared** — `<base>`, or any branch a peer has checked out | user approval in THIS turn · freeze notice to every peer session · safety tag · every peer's checkout at `git-check state` op=none | `range-diff` · lease push · notice that the rewrite landed · peers `git fetch` and `git rebase --onto` or re-clone |

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
| 6 | "fsck reports missing objects" on a live shared repo after a peer's `gc --prune=now` | stop all writers; re-run `git fsck --connectivity-only` when idle; objects referenced by in-flight writes reappear or were never reachable | clean fsck |

Reflog entries expire (`gc.reflogExpire`, `gc.reflogExpireUnreachable`; the defaults are in
`config.md` §1). `reflog expire --expire=now` and `gc --prune=now` delete the safety net. Both are
on the deny-list, and never run on a checkout someone else is writing.

## 3. Remove a pushed secret or large blob

| Step | Do | Note |
|---|---|---|
| 1 | **Rotate the secret** | a rewrite does not un-leak; the platform and every clone has it |
| 2 | Blast radius = SHARED | a pushed blob is published by definition; §1 shared row in full |
| 3 | Find it: `git rev-list --objects --all \| git cat-file --batch-check='%(objectsize) %(objectname) %(rest)' \| sort -n \| tail -20` | |
| 4 | `git filter-repo --path <file> --invert-paths` or `--strip-blobs-bigger-than 50M` | refuses a non-fresh clone by design; run on a fresh clone, or `--force` only once the safety tag exists in ANOTHER clone |
| 5 | `git range-diff` old vs new | every row except the removals is `=` |
| 6 | push with `--lease` per branch; push rewritten tags by name | |
| 7 | ask the platform to purge | GitHub keeps unreachable objects until support purges them |
| 8 | every other clone re-clones, or `git fetch && git rebase --onto` for unpushed local work | local `reflog expire --expire=now --all && git gc --prune=now` only in a clone with NO other writer |

`git filter-branch` prints its own warning ("a glut of gotchas … use git filter-repo"). BFG is an
acceptable alternative for the size-only case.

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
