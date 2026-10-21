# Dotfiles Codex Guidance

Read [CLAUDE.md](CLAUDE.md) before substantive repository work; it is the operational authority. The human-facing rationale is in [README.md](README.md), especially **Design — the invariants**. Follow the current user request where it overrides either document.

Preserve topic-first ownership and one-way configuration flow: declaration → render/deploy → runtime, with one writer per file. Register configuration surfaces in `scripts/config-registry.ts`; use `mise.toml` for tasks. Never add implicit global toolchains or write generated content into hand-written/tool-owned files. Consult the authorities above for details and use their narrow verification tasks when changing these boundaries.

Agent asset ownership and deployment are declared in `mise.toml`: `mise run agents:link` links commands and Codex guidance; `mise run skills:sync` installs skill copies. Do not assume skill directories are symlinks. `agents/codex/AGENTS.md` is the source for personal Codex guidance.
