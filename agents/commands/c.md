---
description: Short alias for /quote — copy this session's last response to the clipboard with `from: <session name>` prefixed. Named to match the shell's own `c` clipboard alias (zsh/aliases.zsh). Behavior lives in agents/claude/hooks/copy-session-response.sh; keep this file and quote.md in step.
argument-hint: (no arguments)
disable-model-invocation: true
---

```!
sh ~/.claude/hooks/copy-session-response.sh
```

Based on `STATUS` above:
- `delivered` — one short sentence: copied, naming `NAME`. `PANE` is incidental; the user does
  not need it.
- `undelivered` — one short sentence saying auto-copy could not reach an idle shell pane, then
  output the exact text between `PAYLOAD_START` and `PAYLOAD_END` verbatim in a fenced code
  block so the user can select-and-copy it.
- `no-body` — say there is no captured response yet for this session (capture-last-response.ts
  writes it on each Stop — this may be the first turn).

Take no other action.
