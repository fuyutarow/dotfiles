# Personal Codex Guidance

## Claude-Aware Repositories

Many of this user's repositories keep their richest project intelligence in Claude Code files. When a repository contains `CLAUDE.md`, `.claude/`, or `.claude/skills`, do not treat the absence of detailed Codex-specific guidance as absence of project policy.

Before non-trivial planning or editing in such a repository:

- Read the closest `AGENTS.md` first when present.
- Read `CLAUDE.md` and apply it as project guidance.
- Inspect `.claude/settings.json`, `.claude/skills`, and `.claude/commands` when they are relevant to the task.
- Prefer project-specific guidance over generic defaults unless the current user request overrides it.

## Skills

Use Codex skills from `.agents/skills` and user skills from `~/.agents/skills` when their descriptions match the task. If repository guidance points to a `SKILL.md` outside those discovery paths, read it as a task reference even if it is not surfaced as an invokable Codex skill.

## QODE

`/Users/fuyu/Workspace/QODE` is the primary Codex work repository. In QODE, read `AGENTS.md` and `CLAUDE.md` before substantive work. For A-optimal POVM theory claims, use `aopt-handbook` when available and follow the read-first discipline in QODE's `AGENTS.md`.

## Verification

Prefer the narrowest relevant verification command before broader gates. Report the command and result when work changes code, claims, or agent configuration.
