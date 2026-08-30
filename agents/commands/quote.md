---
description: Copy this session's recent responses to the clipboard WITH their source attached — `from: <session name>` then the bodies. For pasting into a chat or another session where several Claude Code sessions are in flight and the reader needs to know which one said it. The built-in /copy copies one body alone. `/quote N` takes the last N turns (a quantity — unlike /copy N, which is an index).
argument-hint: "[N] — how many recent turns to copy (default 1)"
disable-model-invocation: true
---

<!--
PLACEHOLDER BY DESIGN — this body never runs.

The work happens in agents/claude/hooks/quote-command.ts, a UserPromptExpansion hook matched
on this command's NAME, which blocks the expansion so the turn costs no inference. See that
file's header for why a normal command body can't do this. All this file does is make `quote`
a real command name for the hook's matcher to match, and carry the description users see.

If the hook is ever removed, this command silently becomes a no-op — wire them together, or
restore a `!` block here.
-->

Copy this session's last response to the clipboard, prefixed with `from: <session name>`.
