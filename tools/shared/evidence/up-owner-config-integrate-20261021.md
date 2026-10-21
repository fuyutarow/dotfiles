# UP-OWNER-CONFIG-INTEGRATE — combined candidate acceptance record

## Scope and baseline

This record validates the combined source candidate against frozen baseline
`f7a79651209d6e28a6c6f8bd00ee30f3ab3964de` (the `alpha` baseline supplied for
this review). The source reports retain their 2026-10-21 observation times:
the UV diagnosis was observed at 19:39:02 JST and the Git diagnostic records
the candidate Git dry plan at 19:46:15 JST. This review does not replace those
dates or treat them as observations made by this combined acceptance.

## Native TOML semantic comparison

`Bun.TOML.parse` parsed the baseline obtained with `jj file show -r
f7a79651209d6e28a6c6f8bd00ee30f3ab3964de topgrade/topgrade.toml` and the
candidate `topgrade/topgrade.toml`. A recursive structured comparison produced
exactly these semantic leaves:

| Path | Baseline | Candidate |
| --- | --- | --- |
| `git.pull_predefined` | absent | `false` |
| `misc.disable` | `flutter`, `tlmgr`, `gcloud`, `snap` | `flutter`, `tlmgr`, `gcloud`, `snap`, `uv` |

The comparison passed and found all pre-existing values in the `misc` and
`commands` tables unchanged. The new `[git]` table is therefore structurally
separate from the following `misc` comments and cannot reassign an active
configuration key through TOML section placement.

## Planned normal-run acceptance

The next evidence row will record one bounded, non-mutating normal candidate
Topgrade plan using `--config topgrade/topgrade.toml --dry-run`; it deliberately
does not use `--only uv`, because explicit selection overrides `misc.disable`.
Required outcomes are no `uv self update`, no implicit dotfiles Git pull, and
the retained Homebrew formula path.

## Candidate normal dry plan

At 2026-10-21 20:17:52–20:17:54 JST, the following foreground command
completed within the 60-second bound with exit 0:

```text
timeout 60s topgrade --config topgrade/topgrade.toml --dry-run --show-skipped --no-ask-retry --no-tmux --notify-end never
```

Its `Brew` section planned:

```text
Dry running: /home/linuxbrew/.linuxbrew/bin/brew update
Dry running: /home/linuxbrew/.linuxbrew/bin/brew upgrade --formula
```

The plan printed neither a `uv` section nor `uv self update`. Its summary says
`Git Repositories: SKIPPED: No repositories to pull`; it did not print a pull
of `/home/fuyu/dotfiles`. This is a printing-only plan: no updater, Git
operation, or deployed live setting changed.

## Acceptance result

The combined candidate preserves Homebrew ownership of `uv` through the normal
`brew_formula` path, disables Topgrade's uv self-update, and excludes only
predefined Git repository discovery while leaving explicit `git.repos`
available. The frozen-baseline semantic diff is exactly the two intended
changes. Historical failure causes remain unknown because no historical stderr
was supplied.
