---
name: designing-command-line-interfaces
description: >-
  Design and audit CLIs: grammar, help, interaction, storage, exits, waits and failures. Default to XDG config, cache and state for config, cache and history; flags > environment > project > user > system. Refuse or expose consequential defaults for missing input. Prompt only on TTY stdin; otherwise accept input or fail. Bound waits, say what is awaited, time out or cancel. Errors state observations and uncertainty, not guessed causes. Config integrity and authority: governing-configuration-systems; implementation: repository and language rules.
---

# Designing command-line interfaces

A CLI is a protocol for its human and machine consumers. When suitable, use XDG config, cache
and state for configuration, cache and history; prefer flags > environment > project > user > system.
Refuse or expose consequential defaults for missing input. Prompt only on TTY stdin; otherwise accept
input or fail. Bound waits, say what is awaited, and time out or allow cancellation. Errors state
observations and uncertainty, not guessed causes. Select conventions for consumers and compatibility;
apply `base-usecase-first` to payoff, costs, prohibitions and acceptance evidence.

> **Version**: v2610.2.0 (2026-10-30) — principle-first CLI ownership.

## Contract

Identify the actual human, shell, CI and agent consumers and the tasks they need. Make invocation,
effects, streams, outcomes and compatibility consistent for those callers. Do not infer semantics
from a flag, format, or exit number. State the parser profile and grammar, including relevant order, repetition, abbreviations and `--`
behavior, ambiguity and invalid input behavior; parser conventions such as `--` depend on that profile and
GNU conventions do not by themselves establish POSIX portability. Specify
stdin and help as needed. Choose a machine format only when a consumer needs one, and describe its
parsing and compatibility guarantees. For an established CLI preserve its existing promises unless
a migration is justified.

For state-changing commands, describe effects, partial results and what remains after interruption;
state what can be inspected or cleaned up and when retry is safe. A preview must say which effects it suppresses and when its forecast is
accurate; a force option must identify protections it bypasses and how that bypass is acknowledged. Support recovery appropriate to the
cost: where feasible offer undo, and where an irreversible action carries material cost provide an
appropriate safeguard. Decide whether confirmation, undo or both are needed from the actual risk.
Do not claim atomicity or idempotence without their preconditions. For multiple items describe
continuation, aggregation and per-item reporting when some fail.

Distinguish results when callers need different recovery. Do not report an unobserved effect as
success: report a handoff or unknown result. Make a consequential fallback visible or refuse it;
identify its target and recovery where applicable. Bound external waits and indicate material delays;
choose warning thresholds above ordinary variation. The incidents motivating these choices are in
`tests/local-failure-corpus.md`. For silence, false success or a wrong target, fix the command's
outcome and behavior before polishing an error message.

For each relevant failure, give a human understandable observation and, when justified, a next
step; distinguish observed facts from inferred causes. Select exact, conditional, investigative or
no recovery according to evidence. Do not offer an unverified repair as certain. Expose useful
location and related evidence, and make errors distinguishable without color alone. Where a stable
machine diagnostic is needed, define its identifier and compatibility. Test representative success,
failure, noninteractive and interruption paths on the actual command; a structural check alone
cannot prove behavior. For a substantial diagnostic, use one `assets/diagnostic-card.md` per failure class; choose the
recovery mode from evidence and validate exact recovery and its preconditions. Run
`diagnostic-card-check <card>`
to check required fields and recovery consistency. This structural floor does not establish truth:
execute positive and negative cases and record their command and expected output, exit and channel.

Declare stable, extensible, deprecated or unpromised surfaces as appropriate and verify changes
against affected consumers. For machine output specify version and unknown-field handling when they matter.
Record exact command and input, output, exit and expected result for representative accepted and
rejected paths, and compare them with the contract being accepted. Record evidence and its limits; do not treat a dependency's exit alone as proof
of an external effect. For config integrity, effective authority and trust, use
`governing-configuration-systems`; CLI storage and override defaults are below.

## Conditional defaults

Use the following CLIG conventions when they suit the command and its consumers; justify deviations
when compatibility, safety or the use case calls for them. CLI Guidelines by contributors, licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); these are adapted from
[Command Line Interface Guidelines](https://clig.dev/).

- [Basics](https://clig.dev/#the-basics): success exits zero, failure nonzero; put primary results on
  stdout and diagnostics on stderr. Choose specific exit meanings for actual recovery needs.
- [Help](https://clig.dev/#help): offer `-h` and `--help`, lead with examples, and give short help
  on missing required input. [Documentation](https://clig.dev/#documentation): consider detailed
  terminal documentation and a web reference, including a man page when useful.
- [Arguments and flags](https://clig.dev/#arguments-and-flags): favor explicit flags for options,
  provide long names and short aliases for frequent options, use familiar names, and support `-`
  for file streams where appropriate. Avoid secrets in flags because process arguments may be visible.
  [Subcommands](https://clig.dev/#subcommands): use consistent naming, flags and output across them;
  avoid ambiguous names and arbitrary prefix abbreviations.
- [Output](https://clig.dev/#output): make human results legible, provide machine output when needed,
  disable color on non-TTY or `NO_COLOR`, offer quiet output when useful, and indicate useful next
  steps after changes. Preserve machine-readable output from decoration and progress.
- [Errors](https://clig.dev/#errors): distinguish an actionable diagnostic from the result channel.
- [Interactivity](https://clig.dev/#interactivity): prompt only with interactive stdin; give automation
  a noninteractive input path, such as `--no-input`, and actionable failure if input is missing.
  Hide password echo and provide a way to exit prompts.
- [Signals](https://clig.dev/#signals): respond promptly to Ctrl-C, bound cleanup, and consider a
  second interrupt to skip cleanup when safe. Specify remaining state and retry consequences.
- [Configuration](https://clig.dev/#configuration) and [environment variables](https://clig.dev/#environment-variables):
  use flags for invocation-specific options and environment or files for persistent settings; prefer
  flag > environment > project > user > system when those layers exist. Document overrides, validate
  inputs; get consent and show changes before modifying another person’s configuration. Use
  dedicated files rather than appending to unrelated config. Name environment variables with uppercase
  letters, digits and underscores, avoid generic names, and honor established variables such as
  `NO_COLOR`, `EDITOR`, proxy settings and `PAGER` where applicable. Treat `.env` as a limited
  string-based convenience, not a substitute for structured configuration. Prefer a credential file,
  pipe, socket or secret manager to environment variables for secrets.

For storage, separate configuration, durable data, disposable cache and persistent local state.
On Unix-like systems XDG is a default: `$XDG_CONFIG_HOME` (otherwise `~/.config`),
`$XDG_DATA_HOME` (`~/.local/share`), `$XDG_CACHE_HOME` (`~/.cache`), and `$XDG_STATE_HOME`
(`~/.local/state`); XDG paths must be absolute. On Windows choose roaming or local AppData according
to data and roaming needs. On macOS choose XDG or native Library locations for the CLI's consumers;
neither is universally superior. Honor explicit overrides and existing legacy locations with a
compatible, documented migration. See [XDG Base Directory](https://specifications.freedesktop.org/basedir/latest/)
and [Windows known folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid).

## Scope

This skill owns CLI interaction, diagnostics and protocol decisions together. For an existing
interface, inspect its actual behavior and consumers; for implementation follow the repository and
language owner. General design principles belong to `base-usecase-first`.
