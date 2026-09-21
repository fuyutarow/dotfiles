# Config and dated facts — the ONE file that rots (SOLE home of version-pinned claims)

> **Snapshot**: git 2.55.0, man pages dated 2026-06-29, read locally 2026-09-21; RelNotes 2.50–2.55
> fetched raw from github.com/git/git `Documentation/RelNotes/<v>.adoc`. Every version number and
> "still experimental" claim in this skill lives HERE. A version number in SKILL.md or another
> reference is a bug. Re-verify on reforge: `git --version`, `man git-switch | grep -c EXPERIMENTAL`.

## 1. Status of the verbs this skill relies on (2.55)

| Verb | Status | Source |
|---|---|---|
| `git switch` / `git restore` | **No longer experimental since 2.51** ("declared to be no longer experimental", RelNotes 2.51). Man pages carry no EXPERIMENTAL notice | RelNotes 2.51; `man git-switch` 2.55 |
| `git checkout` | Not deprecated by git; two modes remain. The BAN is a house decision (`zsh/aliases.zsh` refuses `checkout`/`co`/`cb` interactively) and costs nothing now that its replacements are stable | `man git-checkout` 2.55 |
| `git worktree` | Stable; BUGS still: "Multiple checkout in general is still experimental, and the support for submodules is incomplete" | `man git-worktree` 2.55 |
| `git rebase --update-refs` | Stable (2.38+); 2.55 fixed a `%d`-in-instructionFormat bug | `man git-rebase`; RelNotes 2.55 |
| `git push --force-with-lease` | Only the `<ref>:<expect>` form is non-experimental; bare form "still experimental" | `man git-push` 2.55 |
| `git push --force-if-includes` | Stable. Has effect ONLY with the bare / refname-only lease; with `--force-with-lease=<ref>:<expect>` it is a documented no-op, and without any lease it is a no-op | `man git-push` 2.55 |
| `git merge-tree --write-tree` | Stable; the old 3-tree form is DEPRECATED | `man git-merge-tree` 2.55 |
| `git replay` | EXPERIMENTAL (still, 2.55) | `man git-replay` |
| `git history fixup/reword/split` | EXPERIMENTAL (new 2.54, fixup 2.55); runs no hooks; updates descendant branches by default | `git help history` 2.55 |
| `git sparse-checkout` | Cone mode is the default; command still marked EXPERIMENTAL | `man git-sparse-checkout` 2.55 |
| `git repo info`, `git last-modified`, `git format-rev`, `git backfill` | EXPERIMENTAL (2.52–2.55) | `git help -a` 2.55 |
| `git config get/set/list/unset` | The official spelling since 2.46; `git config foo.bar=baz` now prints advice (2.55) | RelNotes 2.54, 2.55 |
| `git maintenance` | default strategy "geometric" since 2.54 (man page text still describes "incremental" — unresolved wording drift) | RelNotes 2.54; `man git-maintenance` |
| `core.fsmonitor` built-in daemon | Linux support arrived in 2.55 (mac/Windows earlier) | RelNotes 2.55 |
| reftable ref backend | Not the default in 2.55; Git 3.0 will make it default for new repos; `init.defaultBranch` will default to `main` in 3.0 | RelNotes 2.51, 2.52 |
| `diff.algorithm` | Default is still `myers`; `histogram` is opt-in | `man git-diff` 2.55 |
| `git filter-branch` | Prints its own warning pointing to `git filter-repo` (external, python) | git-filter-repo README quoting the warning |
| `git absorb` | External (tummychow/git-absorb, Rust); not in git | its README |
| `gc.cruftPacks` | default true; `gc.auto` 6700; `gc.pruneExpire` 2.weeks.ago; reflog expiry 90/30 days | `man git-gc`, `man git-reflog` 2.55 |

## 2. The modern-defaults config set

Who recommends: Julia Evans (2024). GitButler (2024). Scott Chacon (FOSDEM 2024, via
third-party notes). The Pro Git book (third-party summary). Each row states the
failure it prevents. A row you cannot name a failure for is not adopted. That is
wiring-repositories' admission rule, applied to config.

| Key | Value | Prevents |
|---|---|---|
| `rerere.enabled` | `true` | re-resolving the same conflict on every rebase replay |
| `rerere.autoUpdate` | `true` | forgetting to `add` a recorded resolution |
| `rebase.updateRefs` | `true` | a stack's lower branches left pointing at abandoned commits |
| `rebase.autoSquash` | `true` | `fixup!` commits surviving `rebase -i` |
| `rebase.autoStash` | `true` (house: present) | "cannot rebase: you have unstaged changes" |
| `merge.conflictStyle` | `zdiff3` | resolving a conflict without seeing the base |
| `diff.algorithm` | `histogram` | mis-paired hunks when blocks move |
| `diff.colorMoved` | `default` | a moved block reading as delete+add |
| `push.autoSetupRemote` | `true` | the `-u` dance on every new branch |
| `push.useForceIfIncludes` | `true` | a BARE lease defeated by a background fetch (the explicit `<ref>:<sha>` form never needs it) |
| `push.default` | `simple` (house: present) | pushing to a differently named branch |
| `pull.rebase` | `true` (house: present) | merge bubbles on `git pull` |
| `merge.ff` | `only` (house: present) | accidental merge commits on `<base>` |
| `fetch.prune` | `true` | stale `origin/*` branches |
| `branch.sort` | `-committerdate` | hunting a branch alphabetically |
| `column.ui` | `auto` | one-per-line branch lists |
| `commit.verbose` | `true` | committing without seeing the diff in the editor |
| `help.autocorrect` | `prompt` | a typo silently running the guessed command (`10` = auto-run after 1 s — worse for agents) |
| `core.fsmonitor` / `core.untrackedCache` | `true` | slow `status` on large trees |
| `blame.ignoreRevsFile` | `.git-blame-ignore-revs` | mass-reformat commits owning every line |
| `init.defaultBranch` | `alpha` (house) | a `master`/`main` split across repos |

Not adopted as defaults: `core.pager=delta` (a tool choice), `transfer.fsckobjects` (per-repo),
Conventional Commits (per-repo convention, `jobs.md` §17), `help.autocorrect=10` (auto-runs).

## 3. House state (`git/gitconfig`)

**After 2026-09-21**: every row of §2 is set except `core.fsmonitor` (opt-in per repo — the
Linux daemon is new) and the `init.defaultBranch` house value `alpha`. `git-check lint
git/gitconfig` is clean. New aliases: `rs`/`rss` (restore), `fixup`, `wip`, `rd` (range-diff),
`mt` (merge-tree dry run), `wt`/`wtl`.

**Before** (measured 2026-09-21, kept as the receipt): present `pull.rebase`, `merge.ff=only`,
`rebase.autostash`, `push.default=simple`, `init.defaultBranch=alpha`; the other 15 keys absent.
Legacy aliases the floor flagged (7) plus two by hand, all retired the same day:

| Alias | Body | Why legacy |
|---|---|---|
| `co` / `cb` | `checkout` / `checkout -b` | shadowed interactively by the shell guard; live for scripts |
| `acm` | `add -A && commit -m` | globs the tree |
| `aca` | `add . && commit --amend` | globs the tree AND rewrites |
| `merge-force` | `merge -Xtheirs` | discards "ours" silently |
| `pull-force` | `fetch & reset --hard origin/master'` | hard reset; stray quote, may not even run |
| `ignore` | `rm -r --cached . & add .` | backgrounded `&`, races itself |
| `res` | `reset` | a 3-letter path to `--hard` |
| `undo` | `reset HEAD~1 --mixed` | unconditional; no published check |

The safe siblings `sw` / `ch` / `chc` / `chd` → `switch` were already present and were kept.

## 4. Platform limits that shaped the gates

| Limit | Value | Consequence |
|---|---|---|
| GitHub single-file push limit | 100 MB hard (docs.github.com repository-limits); ~50 MB warning | `git-check staged --max-bytes` default 50 MB; over 100 MB the push fails inside send-pack, and under `-q` it fails silently |
| Claude Code `Bash(git push *)` deny rule | does NOT match `git -C . push`, `git -c … push`, `git 'push'` (code.claude.com permissions doc) | a permission rule is not a boundary; the deny-list is behavior, and a `-c`/`-C` spelling to dodge a rule is itself denied |
| Claude Code worktree enforcement | blocks edits, cwd, and git redirects (`-C`, `--git-dir`, `GIT_DIR`, `cd`) into the main checkout while isolated; cannot be turned off | mechanics → `operating-the-harness` |

## 5. Sources (fetched; grades in the ledger)

| Source | Where |
|---|---|
| man pages, git 2.55.0 local | `git-{switch,restore,checkout,worktree,rebase,commit,push,merge-tree,replay,range-diff,bisect,log,blame,reflog,stash,gc,maintenance,sparse-checkout,status,rev-parse,fsck,add}`; `git help history`; `git help -a` |
| RelNotes 2.50–2.55, raw | https://raw.githubusercontent.com/git/git/master/Documentation/RelNotes/2.50.0.adoc … 2.55.0.adoc |
| Julia Evans | https://jvns.ca/blog/2024/02/16/popular-git-config-options/ · https://jvns.ca/blog/2023/11/01/confusing-git-terminology/ |
| GitButler | https://blog.gitbutler.com/git-tips-1-theres-a-git-config-for-that |
| tools | https://github.com/tummychow/git-absorb · https://github.com/newren/git-filter-repo · https://github.com/rtyley/bfg-repo-cleaner |
| conventions | https://www.conventionalcommits.org/en/v1.0.0/ · https://trunkbaseddevelopment.com/ |
| Claude Code docs | https://code.claude.com/docs/en/worktrees · https://code.claude.com/docs/en/permissions · https://code.claude.com/docs/en/settings-reference |
| GitHub limits | https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits |
| Chacon FOSDEM 2024 (third-party notes) | https://gist.github.com/Drarig29/5580ccd123988af4fc6da1a2cacca054 |

Harvest caveat for the next reforge: a WebFetch summary of RelNotes fabricated feature
descriptions on its first call. Every RelNotes fact above was re-read from the raw `.adoc` text.
Cross-check any summary against the raw file before citing it.
