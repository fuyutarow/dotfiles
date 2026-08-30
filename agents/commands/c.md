---
description: Short alias for /quote — copy this session's last response to the clipboard with `from: <session name>` prefixed. Named to match the shell's own `c` clipboard alias (zsh/aliases.zsh).
argument-hint: (no arguments)
disable-model-invocation: true
---

<!--
PLACEHOLDER BY DESIGN — see agents/commands/quote.md's note. The work happens in
agents/claude/hooks/quote-command.ts, matched on this command's name via the
UserPromptExpansion matcher in settings.json; keep that matcher in step with both names.
-->

Copy this session's last response to the clipboard, prefixed with `from: <session name>`.
