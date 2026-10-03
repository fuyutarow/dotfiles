# Dotfiles Codex Guidance

## Canonical Context

This repository's detailed operating context lives in `CLAUDE.md`. Before any non-trivial edit, read `CLAUDE.md` and treat it as repository guidance unless the current user request overrides it. The human-facing *why* behind these rules is `README` → **Design — the invariants** (the canonical statement of intent).

## Repository Rules

These mirror `CLAUDE.md`'s "Conventions to preserve" for Codex, which does not auto-load `CLAUDE.md`; on any conflict, `CLAUDE.md` wins and `README`'s **Design — the invariants** explains the reasoning.

- Preserve the topic-first layout: one tool owns one directory.
- Keep dotfile symlinks centralized in `scripts/link-dots.sh`.
- Keep agent symlinks centralized in the `link:skills` task in `mise.toml`.
- Do not reintroduce a `justfile`; this repo uses `mise.toml`.
- For OS-dependent shell logic, use the existing `IS_MAC` / `IS_WSL` booleans from `zsh/aliases.zsh`.
- Do not write machine-absolute paths into shared dotfiles under `zsh/`, `git/`, or `tmux/`.
- No implicit global toolchain (INV-6): a managed tool is reachable where a config declares it,
  or not at all. Never `mise use -g`, never add a second version manager (fnm, nvm, volta) to a
  login shell, and never put the mise shim directory on an interactive shell's PATH — it is the
  delivery path for non-interactive shells only. Verify with `mise run test:mise-scope`.

## Agent Assets

- `agents/codex/AGENTS.md` is the source for personal Codex guidance. It is linked to `~/.codex/AGENTS.md`.
- `agents/skills` is the source for Agent Skills. It is linked to Claude Code at `~/.claude/skills` and to Codex at `~/.agents/skills`.
- `agents/commands` is the source for slash-command style prompts. It is linked to Claude Code at `~/.claude/commands`, Codex legacy prompts at `~/.codex/prompts`, and Gemini workflows.
- Do not link `agents/commands` into a Codex skills directory; Codex skills require `SKILL.md` directories.

## Verification

Use `mise` tasks for repo work. For link changes, run `mise run link:skills` and inspect the symlink targets.
