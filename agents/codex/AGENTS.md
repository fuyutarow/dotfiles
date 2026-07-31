# Personal Codex Guidance

## Dispatch roles

Sol is the root planner and acceptance authority; it never spawns as a worker. Call every
`spawn_agent` with Terra. The local `Agent` / `spawn_agent` hook contract is mechanically
guarded by `~/.codex/hooks.json`; the Desktop `collaboration.spawn_agent` path still needs a
fresh-session live probe, so do not claim that Desktop path is enforced yet. This is advisory
context, not the guard itself.

## Claude-Aware Repositories

Many of this user's repositories keep their richest project intelligence in Claude Code files. When a repository contains `CLAUDE.md`, `.claude/`, or `.claude/skills`, do not treat the absence of detailed Codex-specific guidance as absence of project policy.

Before non-trivial planning or editing in such a repository:

- Read the closest `AGENTS.md` first when present.
- Read `CLAUDE.md` and apply it as project guidance.
- Inspect `.claude/settings.json`, `.claude/skills`, and `.claude/commands` when they are relevant to the task.
- Prefer project-specific guidance over generic defaults unless the current user request overrides it.

## Skills

Use Codex skills from `.agents/skills` and user skills from `~/.agents/skills` when their descriptions match the task. If repository guidance points to a `SKILL.md` outside those discovery paths, read it as a task reference even if it is not surfaced as an invokable Codex skill.

## Personal Prompt Aliases

Codex custom prompts are invoked as `/prompts:<name>` in the CLI/IDE, but some Codex surfaces may pass a leading slash prompt through as plain user text. When a user message starts with `/umada` or `/prompts:umada`, treat it as the personal alias defined in `agents/commands/umada.md`: use `raising-resolution` first, then `acting-on-hypotheses`, and apply both to the remaining prompt text.

## QODE

`/Users/fuyu/Workspace/QODE` is the primary Codex work repository. In QODE, read `AGENTS.md` and `CLAUDE.md` before substantive work. For A-optimal POVM theory claims, use `aopt-handbook` when available and follow the read-first discipline in QODE's `AGENTS.md`.

## Verification

Prefer the narrowest relevant verification command before broader gates. Report the command and result when work changes code, claims, or agent configuration.

## Search Routing

In a repository where `ccc` is installed and `.cocoindex_code/settings.yml` exists, do not issue
raw `rg`, `grep`, `find`, `fd`, `tree`, `ccc search`, or `ccc grep` calls. Declare the query shape
through `repo-search`: `concept` for unknown-name meaning, `battery` for absence/new-implementation
checks, `literal` for exact text, `exhaustive` for regex enumeration, `files` for path inventory,
and `structural` for by-example code patterns. Known-symbol definitions/references belong to
Serena. Do not reimplement repository search with Python, Node, shell loops, or another tool when
the route is blocked; repair the entrypoint instead. Empty ccc output is NO_MATCH, never PASS.
The router may select rg; the prohibited operation is unclassified search, not lexical search.
