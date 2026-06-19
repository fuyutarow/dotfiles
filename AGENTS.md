# Dotfiles Codex Guidance

## Canonical Context

This repository's detailed operating context lives in `CLAUDE.md`. Before any non-trivial edit, read `CLAUDE.md` and treat it as repository guidance unless the current user request overrides it.

## Repository Rules

- Preserve the topic-first layout: one tool owns one directory.
- Keep dotfile symlinks centralized in `scripts/link-dots.sh`.
- Keep agent symlinks centralized in the `link:skills` task in `mise.toml`.
- Do not reintroduce a `justfile`; this repo uses `mise.toml`.
- For OS-dependent shell logic, use the existing `IS_MAC` / `IS_WSL` booleans from `zsh/aliases.zsh`.
- Do not write machine-absolute paths into shared dotfiles under `zsh/`, `git/`, or `tmux/`.

## Agent Assets

- `agents/codex/AGENTS.md` is the source for personal Codex guidance. It is linked to `~/.codex/AGENTS.md`.
- `agents/skills` is the source for Agent Skills. It is linked to Claude Code at `~/.claude/skills` and to Codex at `~/.agents/skills`.
- `agents/commands` is the source for slash-command style prompts. It is linked to Claude Code at `~/.claude/commands`, Codex legacy prompts at `~/.codex/prompts`, and Gemini workflows.
- Do not link `agents/commands` into a Codex skills directory; Codex skills require `SKILL.md` directories.

## Verification

Use `mise` tasks for repo work. For link changes, run `mise run link:skills` and inspect the symlink targets.
