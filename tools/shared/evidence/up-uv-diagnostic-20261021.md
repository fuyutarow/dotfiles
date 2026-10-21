# UP-UV-DIAGNOSTIC — diagnosis and owner fix

Observed: `2026-10-21T19:39:02+09:00` via `date -Iseconds`.

## Outcome

The configured Topgrade `uv` step is a uv **self-update**, not an upgrade of
uv-managed tools. Its dry-run prints exactly:

```text
Dry running: /home/linuxbrew/.linuxbrew/bin/uv self update
```

The target executable is presently Homebrew-owned: `command -v uv` reports
`/home/linuxbrew/.linuxbrew/bin/uv`; `brew list --versions uv` reports
`uv 0.13.4`; and `uv --version` reports `uv 0.13.4 (Homebrew 2026-10-20
x86_64-unknown-linux-gnu)`.

The native Topgrade step therefore crossed an ownership boundary: it asked the
Homebrew-provided executable to use uv's self-update mechanism. The candidate
source configuration now disables only that native `uv` step; the deployed live
Topgrade setting and updater state were not changed. Homebrew retains its
existing `brew_formula` update path. This prevents the crossed update path. It
does **not** prove that it caused the omitted historical failure.

## Current-contract evidence

- `scripts/up.ts:43` invokes `topgrade --disable containers ${skip}`; it
  delegates the selected updater behavior to Topgrade.
- `topgrade/topgrade.toml:13-15` documents the Homebrew owner and adds `uv` to
  the native Topgrade disable list. It does not disable `brew_formula`.
- `topgrade --help` lists `uv` as a valid step and defines `--dry-run` as
  "Print what would be done".
- Before the patch, `topgrade --only uv --dry-run --no-ask-retry --notify-end
  never` produced the self-update command above. This was printing-only; no
  updater ran.
- `uv self update --help` identifies the command as "Update uv" and offers a
  `--dry-run` option. It contains no tool-upgrade operation.
- `uv tool list` is read-only and reports only `cocoindex-code v0.2.42`
  (`ccc`, `cocoindex-code`); it was not upgraded.
- `brew --prefix uv` reports `/home/linuxbrew/.linuxbrew/opt/uv`, consistent
  with the resolved executable's Homebrew prefix.

## Candidate-config plan proof

`topgrade --help` documents `--config <PATH>` as the configuration-input flag.
The normal candidate plan was run as:

```text
topgrade --config topgrade/topgrade.toml --dry-run --show-skipped --no-ask-retry --notify-end never
```

It accepted the candidate config, planned `brew upgrade --formula`, and printed
neither a `uv` section nor `uv self update`. This is dry-run only; it did not
execute an update. `--only uv` is not an acceptance probe: its explicit
selection overrides the configured disable and prints `uv self update`.

## Limits and unknowns

- No retained stderr, exit code, timestamp, or failed command from the past
  `uv` step was supplied or located. The historical failure cause is unknown.
- `tools/shared/src/up.ts` is absent: direct read returned
  `No such file or directory`, and locator-only `rr files '**/up.ts'` returned
  only `./scripts/up.ts`. No source behavior is attributed to that absent path.
- No `uv self update`, `uv tool upgrade`, install, sync, live-config, or Git
  mutation was run. The promised source-config edit and the pre-patch and
  candidate-config dry-runs are the only changes/plan observations.

## Minimal evidence needed to explain the past failure

Retain the failed Topgrade `uv` section verbatim, including the command,
stderr, and exit status, plus `uv --version` and `command -v uv` from that
same run. Those records would distinguish a Homebrew/self-update refusal from
network, release, permission, or another uv error without rerunning an update.
