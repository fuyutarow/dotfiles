# Jujutsu version and Git compatibility

Checked 2026-09-30 against official latest-release documentation and local `jj 0.45.1`.

On another installed version, recheck the official pages and `jj <command> -h`.

These are paraphrases unless marked as local observations.

## Migration and colocation

| State or need | Action |
|---|---|
| Existing Git repo; user wants jj | Inspect `git status --short`, `.gitignore`, submodules/LFS, and other writers. Run `jj git init` in that Git worktree only when colocation is intended. Check `jj git init -h` before choosing a separate destination. |
| Git-backed colocated workspace | `.jj` and `.git` share a working copy. jj imports/exports Git refs automatically. Check mode with `jj git colocation status`. Git may be at detached HEAD. Inspect both views after interleaving mutations. |
| Non-colocated jj workspace | `jj git import` / `jj git export` synchronize with its backing Git repo when needed. `gh` may need `GIT_DIR` pointing to `jj git root`. |
| Pull an upstream change | `jj git fetch --remote <remote>` then rebase the intended branch/change onto the fetched base. A fetch does not by itself rebase every local stack. |

Jujutsu uses Git for remote authentication and honors only a subset of Git configuration.

Do not assume `.gitconfig` options or Git hooks run for jj operations.

`.gitignore` suppresses automatic tracking. A tracked file stays tracked until
`jj file untrack`; first ignore it or exclude it from `snapshot.auto-track`.

## Capability boundary

Unsupported according to the official page: Git hooks, LFS, submodules, partial
clones, and `git-worktree`.

jj has its own `jj workspace` mechanism. Git submodules may be preserved in
storage but do not appear in the jj working copy.

Check the actual workflow before recommending jj for a repo that needs these features.

Jujutsu can record unresolved conflicts in commits. A push rejects them by default.

Inspect `jj status` and `jj log`. Resolve the file, then inspect `jj diff`.
`jj squash` can move a resolution into the conflicted parent.

`jj resolve` supports suitable external merge tools.

Git tools may misread jj's internal conflict representation in a colocated repo.

## Source-grade table

| Rule or fact | Grade | Source and scope |
|---|---|---|
| Working copy is a commit; most jj commands snapshot; new files auto-track | author-confirmed, paraphrase | [Working copy](https://docs.jj-vcs.dev/latest/working-copy/), Introduction and Ignored files. |
| Bookmark is not an active branch and does not advance with ordinary commits | author-confirmed, paraphrase | [Bookmarks](https://docs.jj-vcs.dev/latest/bookmarks/) and [GitHub workflow](https://docs.jj-vcs.dev/latest/github/). |
| Git colocation and feature limits | author-confirmed, paraphrase | [Git compatibility](https://docs.jj-vcs.dev/latest/git-compatibility/). |
| Operation log, undo, revert, restore, read at operation | author-confirmed, paraphrase | [Operation log](https://docs.jj-vcs.dev/latest/operation-log/). |
| Conflict commits and resolution choices | author-confirmed, paraphrase | [Conflicts](https://docs.jj-vcs.dev/latest/conflicts/) and [Working copy](https://docs.jj-vcs.dev/latest/working-copy/). |
| Split/squash instead of staging | author-confirmed, paraphrase | [Jujutsu for Git experts](https://docs.jj-vcs.dev/latest/git-experts/). |
| J1–J4 receipts and explicit push target | skill-supplied | Conservative agent operating rules; official docs establish command semantics, not this gate set. |
| Bookmark did not advance after `jj commit` | local observation | Isolated `jj 0.45.1` probe in [ledger](../tests/forge-verification-ledger.md). |
| `jj undo` restored the working copy; push dry-run refused an undescribed change | local observation | Same isolated probe in [ledger](../tests/forge-verification-ledger.md). |
