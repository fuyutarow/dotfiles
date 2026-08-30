---
description: Copy this session's last response to the clipboard WITH its source attached — `from: <session name>` then the body. For pasting into a chat or another session where several Claude Code sessions are in flight and the reader needs to know which one said it. The built-in /copy copies the body alone. `/c` is the short alias.
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
