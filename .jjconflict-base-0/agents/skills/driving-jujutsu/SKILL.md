---
name: driving-jujutsu
description: >-
  Operates Jujutsu (jj) repositories: working-copy changes, revsets, bookmarks,
  Git colocation, fetch/push, conflict resolution, and operation-log recovery.
  Use for jj / Jujutsu / jujitsu, jj に移行, jj commit, jj git push,
  ブックマーク, 変更が消えた, or Git と jj の併用. Verify the working-copy snapshot,
  target revision, and exact bookmark before publishing. PURPOSE cut:
  jj commands and their Git interoperability → here; plain Git commands,
  shared Git checkout policy, and Git history cleanup → driving-git.
  Code changes → implementing-and-debugging or refactoring-code; this skill
  co-fires when recording or publishing those changes. English skill;
  respond in the user's language.
---

# Driving Jujutsu — changes, bookmarks, operations

> **Version**: v2610.1.0 (2026-10-01) — house jj repos record via `mise run commit`. Command forms checked against jj 0.45.1.
> Fast-moving compatibility and source links live only in [version-and-compatibility.md](references/version-and-compatibility.md); recheck them before migration or unsupported-feature claims.

Verify this package: `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/driving-jujutsu`.

## Language

Keep these tokens distinct:

| Token | Meaning |
|---|---|
| **CHANGE** | Revision identified by a change ID; its commit ID can change on rewrite. |
| **BOOKMARK** | Named pointer to a CHANGE. |
| **OPERATION** | Repo-state transition. |
| **SNAPSHOT** | Recording the working copy. |
| **RECEIPT** | Observable command output. |

`@` is the working-copy CHANGE; `@-` is its parent.

## LAW and gates

> Operate the intended CHANGE, then move the intended BOOKMARK, then publish the intended
> remote ref. These are separate decisions. Every mutation closes with a RECEIPT from the
> same repository. A successful command alone does not prove that the intended code or
> remote ref moved.

| Gate | Before action | RECEIPT |
|---|---|---|
| **J1 SNAPSHOT** | `jj status` snapshots new files by default. Before `jj git init`, inspect `git status --short` and ignore rules. Before `jj commit`, inspect `jj status`, `jj diff --stat`, and `jj file list -r @`; exclude unwanted paths. | Intended paths only in `jj diff --stat` and `jj file list -r @`. |
| **J2 TARGET** | Resolve the revision and bookmark separately with `jj log -r '<revset>'` and `jj bookmark list`. Confirm `@` and `@-` after `jj new`, `jj edit`, `jj commit`, `jj squash`, or `jj rebase`. | `jj log -r '@|@-'` plus the named target; `jj bookmark list` for the pointer. |
| **J3 PUBLICATION** | Before a push, explicitly choose remote and BOOKMARK or `--change`; inspect `jj git push --dry-run` and the commits it names. A rewrite of a published change may require a force push. | Push output followed by `jj bookmark list --all-remotes` or a remote-tip check. |
| **J4 RECOVERY** | Inspect `jj op log` and `jj op show <op>` before undoing. Use `jj undo` only when the latest operation is the intended target; use `jj op revert <op>` for a specific older operation. | `jj status`, `jj log`, and `jj bookmark list` show the recovered CHANGE and pointers. |

`jj status` and most ordinary `jj` commands may create a SNAPSHOT.

To read an earlier state, use `jj --at-operation=<op> status`.
To skip a snapshot, use `jj --ignore-working-copy status`.
Interpret either output as recorded state.

## Decision table

| Intent | Command path | Check |
|---|---|---|
| Start a change | `jj new <base>` | `jj log -r '@|@-'` shows the intended parent. |
| Record work in a repo with a `commit` mise task (house jj repos) | `mise run commit -- -m '<message>' [--push] -- <paths>` | Its receipts: the new `@-`, the diff stat, the bookmark; with `--push`, the remote bookmark. |
| Finish current change and start an empty child (no `commit` task) | `jj commit -m '<message>'` | `jj log -r '@|@-'`; verify the completed diff with `jj show @-`. |
| Change the current description without starting a child | `jj describe -m '<message>'` | `jj show @`; next file edit still amends this CHANGE. |
| Put only selected work into a change | `jj split <paths>` or `jj split` interactively; `jj squash <paths>` to move work into the parent | `jj show` both resulting changes; do not assume Git's staged index controls jj. |
| Rebase a stack | `jj rebase -b <branch-rev> -o <new-base>` | `jj log` shows descendants and any conflicts. |
| Publish a named change | `jj bookmark create <name> -r <rev>` or `jj bookmark move <name> --to <rev>`; `jj git push --bookmark <name> --remote <remote> --dry-run`; then push the same explicit target | `jj bookmark list --all-remotes` shows the expected local and remote positions. |
| Find missing work | `jj op log` → `jj op show <op>`; inspect with `jj --at-operation=<op> log` | Select recovery by J4; do not guess from the latest Git reflog entry. |

The table does not authorize mutation merely because `jj` is installed.

Read [version-and-compatibility.md](references/version-and-compatibility.md)
for migration, Git colocation, unsupported features, and conflicts.

## Deny-list and routing

| Do not assume or run blindly | Choose instead |
|---|---|
| A Git branch moves automatically with `jj commit` | Inspect and explicitly create/move the BOOKMARK. |
| `git add` or Git's staging area limits a `jj commit` | Use `jj split`/`jj squash` and verify the revision diff. |
| `jj git push --all` is a convenient way to publish one change | Name the BOOKMARK or CHANGE and preview with `--dry-run`. |
| A green rebase means all conflicts were resolved | Inspect `jj status` and `jj log`; jj can record conflicted commits. |
| `jj undo` is always the right recovery | Use the OPERATION log and J4; `jj op restore` changes the entire repo view. |
| Any writer may commit in a shared multi-writer research notebook checkout | `keeping-research-notebooks` N4 decides WHO commits WHAT, WHEN; jj commands stay here. |
| Git hooks, submodules, LFS, or Git worktrees behave like native jj features | Check the dated compatibility reference and the target repo's actual setup. |
| A bare `jj commit` runs the repo's commit gate | It runs none. Where a `commit` task exists, use `mise run commit` (`wiring-repositories` JJ-1). |

**PURPOSE cut:** This skill owns `jj` commands and jj↔Git interoperability.
`driving-git` owns Git commands, storage cleanup, and shared checkout policy.
Co-fire only when the job crosses that boundary. Repo wiring (ignore files,
hooks, install/links, a new repo's jj layer JJ-1..3) belongs to `wiring-repositories`. The code change itself belongs
to the relevant implementation skill.

## Fire / no-fire

This table is the trigger desk-check. Read only the name and description when rerunning it.

| Ask | Expected |
|---|---|
| 「Git の repo で jj を試したい。今の作業を壊さず始めるには？」 | FIRE: migration and colocation preflight. |
| “I committed with jj but the PR branch still points at the old code” | FIRE: BOOKMARK target. |
| 「jj の rebase 後に競合が残っている。どこを直す？」 | FIRE: conflict state. |
| “The change I was editing disappeared after jj undo” | FIRE: OPERATION recovery. |
| “I have two changes in the working copy and only one should go into this commit” | FIRE: SNAPSHOT/split; headline keyword absent. |
| 「git add したファイルだけ git commit して」 | NO-FIRE → `driving-git`. |
| “Please clean 10 GB from .git and prune old worktrees” | NO-FIRE → `driving-git`. |
| 「この関数のバグを直して。履歴は触らないで」 | NO-FIRE → `implementing-and-debugging`. |
| “Add a pre-commit hook and .gitignore to this new repo” | NO-FIRE → `wiring-repositories`. |
| 「柔術の試合ルールを調べて」 | NO-FIRE → sports-domain research. |
| “Fix this code, then record it with jj and open a PR” | CO-FIRE: implementation first, this skill at record/publish, `driving-git` only for Git/gh-side actions. |

## Execution model

The modal jj operation is SOLO in the session that owns the workspace. Independent
read-only source checks can run separately. Each returns command output and repository
locus, never a bare verdict.

Evidence is CITATION-RELAY. No harness → the same checks run serially.

Durable guidance from a frontier model (2026-09). If a constraint here feels
unnecessary, that feeling is the failure mode — follow the map.

| Stage | Mode | Why |
|---|---|---|
| J1–J4 decision and mutation | SOLO | One workspace and one operation log need one acting owner. |
| Independent documentation or remote-state read | FAN-OUT, read-only | Sources can be checked separately; the acting owner reconciles them. |
