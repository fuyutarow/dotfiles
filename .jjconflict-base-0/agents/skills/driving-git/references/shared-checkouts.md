# Shared checkouts — many sessions, one repository (SOLE home)

> Scope: the git side of concurrency. What a session must check and announce when another session
> can write the same repository. The other session may be a human, an agent, or a fleet peer.
> Who dispatches whom, roles, acceptance → `orchestrating-agents` / `commanding-research-fleets`.
> Claude Code's own worktree mechanics belong to `operating-the-harness`. That covers
> `--worktree`, `EnterWorktree`, `isolation: worktree`, and its enforcement checks. This file
> assumes they exist and says what the git commands must do.

## 1. The default is one worktree per session

A worktree shares `.git` (objects, refs, config) and owns its index, HEAD, and paused-operation
sentinels. So peers see each other's commits and branches immediately, and NOT each other's
half-done rebases. GC, shared-ref rewrites, and pushes still affect the common repository.

```
git worktree add ../<repo>-<session> -b <session-branch> origin/<base>
cd ../<repo>-<session>
```

| Rule | Why |
|---|---|
| One branch per worktree; never `switch` a worktree to a branch another worktree holds (git refuses) | a branch checked out twice would have two indexes |
| `rebase --update-refs` does not move branches checked out elsewhere | git-rebase(1) — re-point them from their own worktree |
| Submodules: a repo with a submodule gets one worktree per session ONLY if the session never runs submodule commands there | git-worktree(1) BUGS: multiple checkouts of a superproject "NOT recommended" |
| Worktrees under the repo root need a `.gitignore` entry, or `git status` lists them as untracked | Claude Code uses `.claude/worktrees/` for this reason |
| Remove/prune worktrees through `storage-and-cleanup.md` §3 | preserve local work and offline mounts before removing files or metadata |

## 2. If the checkout IS shared — the protocol

Some repos cannot split (a resident daemon reads one path; a record store validates one tree).
Then every session obeys all of these, and a peer that does not is a finding, not an exception.

| # | Rule | Observable |
|---|---|---|
| S1 | **`git-check state` before any job that reads tracked files**, and before every commit | `op=none`, branch as expected. A paused rebase in a shared checkout has the working tree at a foreign commit; a compute job launched then loads the wrong code (firedancer 2026-09-21: the runner ran an old version, the run failed) |
| S2 | **A paused operation is a global stop.** Nobody commits, launches, or `gc`s until its owner continues/aborts, or announces a hand-over | `op=…` in `git-check state`; the announcement text |
| S3 | **Commits are path-enumerated** — `git commit -- <paths>` — never `-a`, never a pathspec built from `git status`, so a peer's untracked files cannot enter your commit | `git-check staged` output in the turn |
| S4 | **Taking over a peer's paused rebase is announced first**, then finished by ITS OWNER'S plan (`git rebase --edit-todo` shows it), never re-planned mid-way | the announcement; `git status` shows `interactive rebase in progress; onto …` |
| S5 | **No destructive housekeeping while any peer may write the common object store.** Explicit task selection and the idle-window gate live in `storage-and-cleanup.md` §2–§3 | accounted writers and maintenance jobs; an empty process-name search alone is insufficient |
| S6 | **Pushes are time-boxed and receipted** (`git-check push`) and a killed shell's push is killed with it | `pgrep -a 'git push'` empty after the turn |
| S7 | **Hooks are the repo's, not yours**: a pre-commit that refuses because a PEER's checkout changed file modes is reported to the peer, not bypassed with `--no-verify` | the report |
| S8 | **Rewrite of the shared branch** = G3 shared row: approval, freeze notice, tag, `range-diff`, lease push, landed notice | `rewriting-and-recovery.md` §1 |

## 3. The measured incidents behind the rules (firedancer, 2026-09-21; ledger §1)

| Incident | Rule |
|---|---|
| Regex pathspec swept 40 untracked `.jls` dumps (3.9 GB) into a commit; `push -q` hung 90 min in send-pack; 7.8 GB of `tmp_pack_*` left in `.git` | S3, S6, G1 |
| `commit --amend --only -- <paths>` re-added the dumps from disk after a peer's `rm --cached` | G1 (`jobs.md` §3) |
| Peer's `rebase -i` paused 15 min; HEAD detached at an old commit; a launched job loaded the old runner | S1, S2 |
| `rebase --continue` refused with zero unmerged paths — a dirty tracked file | `rewriting-and-recovery.md` §4 |
| Peer's `gc --prune=now --aggressive` during live commits → `fsck` phantoms | S5 |
| Killed shells left 5–8 zombie `git push` processes for an hour | S6 |
| Pre-commit refused for 10 min because a peer's checkout wrote record files with the wrong mode | S7 |

Separate worktrees prevent index/tree interference. The common-store rules still apply to every worktree.

## 4. Foreign agents (codex / grok / antigravity) inside this repo

Their skills own the containment decision. The git side:

| Step | Do |
|---|---|
| give | its OWN worktree on its OWN branch, never `<base>` |
| review | `git range-diff` or `git diff <base>...<their-branch>` |
| integrate | rebase onto `<base>` from your session |

A worktree bounds repo files only. It is not a credential boundary; their skills say so, and it is
repeated here only because the worktree is created here.
