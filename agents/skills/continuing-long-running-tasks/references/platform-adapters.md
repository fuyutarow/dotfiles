# Compact adapters — transport, not authority

> Verified: 2026-08-01 against Codex CLI 0.146.0 and Claude Code 2.1.220. Re-check official docs
> before changing event contracts or config keys.

The shared hook core computes a per-session transport slot under the git/workspace root:

```text
.agent-state/continuations/<platform>-<session-hash>/ACTIVE
```

`ACTIVE` contains only a workspace-relative `TCR_PATH` to the one task-stable record. Each incoming
Codex/Claude session binds its own slot to that same record with `continuation-check.ts --bind-slot`;
the slot is a transport mirror, not a second semantic state artifact.

Bindings are safe only after record validation and do not confer write ownership. The record names
one `WRITER`; simultaneous sessions remain readers unless an explicit handoff changes it. The
adapter cannot recover a long task that ignored the SessionStart instruction and never bound a
record. This is a bounded-task continuity harness, not automatic transcript persistence.

Write ownership is enforced by `continuation-checkpoint.ts`, not by binding. It compares the bound
slot basename with `WRITER`, holds a short exclusive lock, and applies a revision/digest CAS before
atomic rename. Two readers may coexist; stale or non-writer proposals cannot overwrite the record.

## Trust boundary

The product host, installed hook/config/Skill files, and the current Unix account are trusted.
Workspace record contents are untrusted data. The validator rejects static leaf or ancestor
symlinks, lexical path escape, forged `PATH`, oversized files, and known prompt/control markers.
It does not claim isolation from a malicious process running concurrently as the same Unix user:
that principal can already replace the installed hooks and configuration. Use an OS sandbox or a
separate account when same-UID code is adversarial. The randomized exclusive write plus atomic
rename protects normal updates; it is not a privilege boundary against that excluded actor.

`SessionStart(startup|resume|compact)` injects only the trusted slot/record locators and a
reconciliation instruction. It never injects transcript text or the record body. Record contents
remain untrusted data; `NEXT` must be authorized against trusted policy and current evidence.
`PreCompact(manual|auto)` validates a bound record. An invalid opted-in binding/record blocks manual
compaction; automatic compaction fails open so a context-limit recovery is not turned into a failed
request. Post-compact `SessionStart` reports valid/invalid/unbound status without exposing contents.

The platform adapters are intentionally thin:

- `agents/codex/hooks/task-continuity.ts` calls the shared core with `codex`.
- `agents/claude/hooks/task-continuity.ts` calls the shared core with `claude`.
- Product hook configuration owns event matcher and command wiring.
- This Skill owns the record schema, validation, reconciliation, and lifecycle gates.

## Codex controls

Codex exposes `model_auto_compact_token_limit`, `model_auto_compact_token_limit_scope`, and
`compact_prompt` in `config.toml`, plus `PreCompact`, `PostCompact`, and post-compact
`SessionStart` hooks. Do not invent a threshold: retain the model default until measured. The
installed hook supplies deterministic post-compact recovery without replacing the built-in summary
prompt.

- Configuration: https://learn.chatgpt.com/docs/config-file/config-reference
- Hooks: https://learn.chatgpt.com/docs/hooks

Codex documentation does not guarantee that previously loaded Skill bodies are re-injected after
compaction. The `SessionStart` compact hook is therefore the durable adapter.

## Claude Code controls

Claude Code accepts `/compact <focus>`, root-`CLAUDE.md` Compact instructions,
`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, and compact lifecycle hooks.
It re-injects project-root `CLAUDE.md` and invoked Skill bodies after compaction, subject to documented
Skill token caps. The same external record remains authoritative; context reinjection is transport.

- Context survival: https://code.claude.com/docs/en/context-window
- Environment controls: https://code.claude.com/docs/en/env-vars
- Hooks: https://code.claude.com/docs/en/hooks

Do not use `PreCompact` to block automatic compaction indefinitely: at the context limit that can
surface the original request failure. Never use `PostCompact.compact_summary` as the canonical state.
