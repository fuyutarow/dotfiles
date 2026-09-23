# Jobs — the JTBD catalog (SOLE home of the job → verb → receipt rows)

> Scope: every git job this skill owns, one row each, keyed by the job as a user states it. SKILL.md
> carries the same rows compressed. This file carries the exact command forms, the legacy idiom
> replaced, and the receipt. Rewrite protocol and recovery ladder: `rewriting-and-recovery.md`.
> Multi-session checkouts: `shared-checkouts.md`. Version-pinned facts and config: `config.md`.
> Every command below was read from the current man pages or the cited page (ledger §1).

Conventions: `<base>` is the integration branch (`alpha` in this house — `config.md`), `<b>` the
topic branch, `<paths>` an ENUMERATED list. `git-check` = `bun scripts/git-check.ts`.

## 1. Start work in isolation

| Situation | Do | Receipt |
|---|---|---|
| Own checkout, new topic | `git fetch origin && git switch -c <b> origin/<base>` | `git status -sb` header shows `## <b>...origin/<base>` |
| Another session (human or agent) may touch this checkout | `git worktree add ../<name> -b <b> origin/<base>` then work THERE | `git worktree list` shows the path; `git-check state` shows `worktrees=N` |
| Inspect a commit, no work intended | `git switch --detach <rev>` | `git-check state --allow-detached` |
| Existing remote branch | `git switch <b>` (`--guess` is the default: a unique remote match becomes a tracking branch) | `git status -sb` |

`switch -c` is transactional: the branch is not created unless the switch succeeds. `-C` resets an
existing branch. Treat `-C` as a rewrite (G3). Worktree caveat: git-worktree(1) BUGS says multiple
checkouts of a superproject with submodules are not recommended. A repo with submodules gets one
worktree per session only if the session never touches the submodule.

## 2. Park work in progress

| Situation | Do | Receipt |
|---|---|---|
| Must switch away for minutes | `git stash push -u -m "<why>" -- <paths>` | `git stash list` first line carries `<why>` |
| Must switch away for longer, or hand the state to someone | a WIP commit: `git commit -m "wip: <what>" -- <paths>`; later `--fixup`/`reset --soft` | `git log -1 --stat` |
| A peer's `rebase --continue` is blocked by your dirty file | `git stash push -- <file>`; pop after their rebase lands | `git status --short -uno` empty |
| Save only staged hunks | `git stash push --staged` | `git stash show -p stash@{0}` |

Stashes are tracked through `refs/stash` and its reflog.
After `drop`/`clear`, recovery may still work while the unreachable objects survive; pruning can make the loss permanent.
Prefer a WIP commit on a retained branch for work that must outlive this session.

## 3. Commit exactly what I mean (G1)

```
git add -p                              # or: git add -- <paths>       (never -A / . / :/)
git diff --cached --stat                # what is in the index
bun scripts/git-check.ts staged         # sizes + secret-shaped names; refuses on a flag
git commit -m "<subject>" -m "<body>"   # the index is the commit
git log -1 --stat                       # receipt
```

Path-scoped form when the index holds other things: `git commit -- <paths>`. `--only` is implied
when paths are given. **`--only` takes the working-tree contents of the named paths**, not what was
staged for them (git-commit(1)). So `--amend --only -- <paths>` cannot DROP a file. The file is
still on disk, so it is re-read into the commit.

| To drop a file from the last commit | Verify |
|---|---|
| `git rm --cached -- <paths>` then `git commit --amend --no-edit` | `git ls-tree -r -l HEAD \| sort -k4 -n \| tail` |

Never derive a pathspec from a regex over `git status`. The firedancer incident matched
`artifact` against `runs/artifacts/*.jls` and committed 3.9 GB. Enumerate, then stat.

Secrets: a `.env` or key that reaches ANY remote is compromised. Rotate first, then rewrite
(`rewriting-and-recovery.md` §3). Removal alone is not a fix.

## 4. Fix an earlier commit in an UNPUBLISHED series

| Situation | Do | Receipt |
|---|---|---|
| The fix belongs in commit `<c>` | `git add -- <paths>; git commit --fixup=<c>` then `git rebase -i --autosquash <base>` | `git range-diff <base> <old-tip> HEAD` |
| Only the message of `<c>` is wrong | `git commit --fixup=reword:<c>` then autosquash | same |
| Many small fixes, each obviously belonging somewhere | `git absorb --and-rebase` (external, `config.md`) | same |
| Experimental (`config.md` §1): `git history fixup <c>` / `reword` / `split` | works in bare repos, updates descendant branches by default. **Runs NO hooks** — the same effect as `--no-verify`, so never where a hook enforces policy | same |

`rebase.autoSquash=true` makes `-i` pick up `fixup!`/`amend!` automatically. The rebase is a
rewrite: G3 applies, and it is cheap only because nothing is published.

## 5. Keep a stack of dependent branches consistent

`git rebase --update-refs <base>` (or `rebase.updateRefs=true`): every branch pointing into the
rebased range moves with it. Branches checked out in another worktree are NOT moved (git-rebase(1)).
Receipt: `git log --oneline --graph <base>..<top-of-stack>` shows each branch label on its commit.

## 6. Bring my branch up to date with upstream

```
git fetch origin
git rebase origin/<base>          # rebase.autostash=true parks a dirty tree; pull.rebase=true makes `git pull` do the same
git log --oneline origin/<base>..HEAD   # receipt: only my commits remain
```

| Conflict situation | Do |
|---|---|
| ordinary conflict | `merge.conflictStyle=zdiff3` shows the base; resolve, `git add -- <file>`, `git rebase --continue` |
| the same conflict again | `rerere.enabled=true` records the resolution; the second replay is silent |
| "You must edit all merge conflicts" with zero unmerged paths | a dirty tracked file, not a conflict; stash it (§2 row 3) |

Merging `<base>` INTO the topic is the legacy idiom. It produces the merge commits that
`merge.ff=only` on `<base>` later refuses.

## 7. See what a merge WOULD do

`git merge-tree --write-tree --name-only <base> <b>` runs in memory. It touches neither index nor
worktree, and exits 1 with the conflicted paths listed. Parse the "Conflicted file info" section,
never the resulting tree (git-merge-tree(1) MISTAKES TO AVOID). Legacy: `merge` then `merge --abort`.

## 8. Publish (G4), and publish after a rewrite (G3 + G4)

| Situation | Do | Receipt |
|---|---|---|
| Fast-forward push | `bun scripts/git-check.ts push origin <b>` (= `timeout` + never `-q` + tip comparison) | `RECEIPT origin/<b>=<sha> == local` |
| Rewritten branch, and you know the remote tip you last saw | `bun scripts/git-check.ts push origin <b> --lease <sha>` (= `--force-with-lease=<b>:<sha>`; the explicit expect is what makes a background fetch harmless) | same |
| Rewritten branch, expect unknown | `git push --force-with-lease=<b> --force-if-includes origin <b>` — the bare lease reads `origin/<b>`, so a background fetch could have moved it; `--force-if-includes` then requires that tip to be an ancestor of yours | same |
| First push of a new branch | `git push -u origin <b>` (or `push.autoSetupRemote=true`) | `git status -sb` shows the upstream |

Only the `--force-with-lease=<ref>:<expect>` form is non-experimental (git-push(1)). The bare form
is defeated by any background fetch. `--force-if-includes` closes that gap for the bare form ONLY;
With `<ref>:<expect>`, it is a documented no-op. Plain `--force` is on the deny-list.
An unfinished push has no success receipt. Check surviving push processes after a shell is killed.
Confirm the process belongs to this operation before terminating it; a name match alone is insufficient.

## 9. Prove a rewrite changed only what it should

`git range-diff <base> <old-tip> <new-tip>` (or `<old>...<new>`). `=` rows are byte-identical
patches. `!` rows show the interdiff. The firedancer 17-commit blob removal should have been
verified this way instead of by `ls-tree` size scans. Also the receipt for §4 and §5.

## 10. Find which commit broke it

```
git bisect start <bad> <good>
git bisect run <cmd>      # exit 0 = good, 1–127 (≠125) = bad, 125 = skip
git bisect reset          # receipt: the first-bad sha printed by run
```

Custom terms for non-regression questions: `--term-old=<a> --term-new=<b>`. `bisect` leaves
`BISECT_LOG` in `.git` — `git-check state` refuses until `reset`.

## 11. Find when text or a function changed

| Question | Do |
|---|---|
| when did this string appear/disappear | `git log -S'<string>' --oneline -- <path>` |
| which commits touched lines matching a regex | `git log -G'<regex>' --oneline -- <path>` |
| history of one function / line range | `git log -L :<funcname>:<file>` or `-L <start>,<end>:<file>` (pickaxe and `--name-only` now work with `-L`; `config.md` §1) |
| who really wrote this line, through moves and reformatting | `git blame -w -C -C -C -- <file>`; skip mass-reformat commits with `blame.ignoreRevsFile` |
| which commit last touched each path | `git last-modified` (experimental; `config.md` §1) |

## 12. Undo — the four-state table

| What is wrong | Do | Reversible? |
|---|---|---|
| Unstaged edit in a file | `git restore -- <path>` | NO — the edit is gone. Stash first if unsure |
| Staged, don't want it staged | `git restore --staged -- <path>` | yes (edit stays in worktree) |
| Last commit, unpublished, wrong content | `git reset --soft HEAD~1` then recommit; or `--fixup` | yes (reflog) |
| Last commit, unpublished, wrong message | `git commit --amend -m "<msg>"` | yes (reflog) |
| Any commit, PUBLISHED | `git revert <sha>` — a new commit | yes |
| Whole branch state | `git reset --hard` is on the deny-list: tag first (`git tag backup/<b>-<date>`), then `git reset --keep <sha>` where it suffices | via the tag |

git(1) "Reset, restore and revert", one line each:

| Verb | Acts on | Moves the branch? |
|---|---|---|
| `restore` | files in the worktree or index | no |
| `reset` | the branch tip — adds or removes commits | yes, history changes |
| `revert` | a new commit that undoes another | forward only |

`checkout` did all of these under one verb. That is why the house shell refuses it.

## 13. Recover "lost" work

Recovery ladder: `rewriting-and-recovery.md` §2. Short form: `git reflog` → `git branch
recover/<x> <sha>`. Stash entries: `git stash list`. Dangling after `stash drop`: `git fsck
--lost-found` writes them under `.git/lost-found/`. Reflog entries expire (defaults in
`config.md` §1), so recovery has a deadline.

## 14. Remove a large file or secret that was pushed

`rewriting-and-recovery.md` §3 owns the reason-specific flow, independent backup, removal scope,
verification, and publication across refs. Ordinary size reduction starts with `storage-and-cleanup.md`.

## 15. Diagnose bloat, reclaim disk, or speed up a huge repo

`storage-and-cleanup.md` owns diagnosis, scoped cleanup, and the before/after receipt.
It also owns branch/worktree cleanup, LFS cache pruning, and recurring-maintenance scope.
Do not substitute clone/sparse-checkout advice for a request to shrink existing history.

## 16. Open a pull request from the CLI

```
gh pr create --base <base> --head <b> --fill      # title/body from the commits; edit with --title/--body
gh pr checks --watch                              # CI receipt
gh pr view --json url,state,mergeStateStatus      # machine-readable receipt
```

Push first (§8). `gh pr create` pushes only when asked. PR attribution lines come from the
session's own instructions (the harness injects them). Do not invent a second format.

| gh auth situation | Do | Receipt |
|---|---|---|
| any `gh` call fails with an auth error | `gh auth status` first — it names the host, account, token scopes, and the git protocol | its output |
| not logged in, or scopes missing | `gh auth login --hostname github.com --git-protocol https --web` (or `--with-token` from a secret the user supplies, never one you invent); `gh auth refresh -s <scope>` for a missing scope | `gh auth status` clean |
| git itself cannot push over https | `git config get credential.helper` should name `gh auth git-credential` (house `gitconfig` sets it) | a push receipt |

The ssh KEY (generation, agent, hardware backing) is `securing-remote-access`'s; everything
above is gh's own state.

## 17. Write the message

| Part | Rule |
|---|---|
| subject | imperative, English (house rule), ≤ 72 chars, names the artifact and the change |
| body | WHY, and the measured numbers if any — a run label can then cite its code commit |
| trailers | `--trailer "Key: value"` (git-commit(1)), never hand-typed into the body |
| attribution | whatever the session's instructions mandate, verbatim |
| Conventional Commits | per repo, not by default; if `git log` shows `type(scope): subject`, follow it |

The test: `git log --oneline` reads as a lab notebook.

## 18. Many sessions, one repository

`shared-checkouts.md` is the whole protocol. Default: one worktree per session. If the checkout
IS shared, S1–S8 apply. `git-check state` runs before every job that reads tracked files. A
paused operation is a global stop. Commits are `-- <paths>` only. A peer's rebase is announced
before it is finished.

## 19. Inspect state before acting (G2)

`bun scripts/git-check.ts state` prints one line: branch, HEAD, paused op, dirty/unmerged/untracked/stash,
ahead/behind, worktree count. Unmerged paths without a paused op may follow a stash-pop conflict.
It reads `git status --porcelain=v2 --branch` and `git rev-parse --abbrev-ref HEAD`.
It checks operation sentinels inside `git rev-parse --git-dir`.
For `git repo info` availability, see `config.md` §1.

## 20. Tags and releases (mechanics only)

`git tag -a v1.2.0 -m "<msg>"` then `git push origin v1.2.0` (tags are not pushed by default;
`--tags` pushes ALL, including scratch tags — name the tag). What a version number MEANS is
`designing-version-schemes`' question, not this file's.

## 21. Sign commits (config only)

| Step | Do |
|---|---|
| choose the key | an ssh key from `securing-remote-access` (its generation and agent backing are theirs), or a gpg key the user already has |
| configure | `git config set gpg.format ssh` · `git config set user.signingkey ~/.ssh/<key>.pub` · `git config set commit.gpgsign true` — proposed to the user; `--global` edits are on the deny-list for an agent |
| verify | `git log --show-signature -1`; for ssh signatures `gpg.ssh.allowedSignersFile` must list the key, or verification prints "No principal matched" |

Receipt: `git log --show-signature -1` reports a good signature.
