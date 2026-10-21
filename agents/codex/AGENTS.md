# Personal Codex Guidance

## Project instructions

For each repository, follow the nearest `AGENTS.md` and applicable project instructions. Where a repository contains `CLAUDE.md` or Claude configuration, read the relevant files when they carry project policy. The current user request takes precedence over standing guidance.

## Agent dispatch

Use the repository's ordinary `agx` ticket and capability routing for worker dispatch. Do not add a fixed model or roster unless the task owner explicitly requires it. Hook enforcement applies only where the active hook actually covers the dispatch path; do not infer enforcement on other surfaces.

## Skills and prompts

Use an applicable skill from the active Codex skill paths or the repository's declared skill source. Retired skills are indexed in `~/dotfiles/archives/skills/README.md`; consult an archived contract only when the task requires it, and do not restore retired registrations automatically. Personal prompt aliases are defined in `agents/commands/umada.md`; when `/umada` or `/prompts:umada` is passed as plain text, apply its current instructions.

## Search and verification

In a repository with ccc configured, declare repository searches through `rr` using the appropriate query shape. Known-symbol definitions and references belong to Serena. Do not bypass a blocked search route with another tool; an empty result is not proof of absence.

Use the narrowest relevant verification for the change and report the command and result when changing code, claims, or agent configuration.

## Long-running work

Use `continuing-long-running-tasks` only when work must survive compaction, resume, or handoff and a continuation locus is actually injected and bound for this run. Reconcile any record with current files and external state before relying on it; only its named writer may checkpoint it. A dispatched worker's brief and workspace are its state unless that worker has its own bound locus.
