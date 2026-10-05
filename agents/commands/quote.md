---
description: Quote this session's recent responses with their source attached — `from <session name> | <MM-DD HH:MM> | turns: <n> | <bytes>B | <user>@<host>` then the bodies. `/quote N` takes the last N turns (a quantity — unlike /copy N, which is an index). Requests of 1-50 turns copy the text to the clipboard; 51-1024 turns create a UTF-8 text file and copy an scp download command to the local clipboard, including in Herdr remote sessions.
argument-hint: "[N] — recent turns, 1-50 copy; 51-1024 scp download (default 1)"
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

Quote this session's recent responses, prefixed with `from <session name> | <MM-DD HH:MM> | turns: <n> | <bytes>B | <user>@<host>`.
