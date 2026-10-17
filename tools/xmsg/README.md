# xmsg

Send one message to an existing Codex or Claude Code session on this machine.

```sh
xmsg send --to codex:<thread-id-or-exact-name> --message 'Can you check this?'
xmsg send --to claude:<session-id-or-exact-name> --message 'Can you check this?'
```

Codex targets use `codex queue`. Claude targets use a one-shot `claude --print` process, limited
to Claude Code's `ListAgents` and `SendMessage` tools; it sends only when it finds one exact,
unique match. Both `codex` and `claude` must be on `PATH`. The Claude route uses a Claude CLI turn
and its tool names depend on Claude Code's local messaging feature being available.

The command's successful exit reports that the underlying CLI accepted the request. It does not
prove that the target read the message or replied. For a round trip, include the sender's exact
Codex thread ID in the message and ask the recipient to reply with `xmsg send --to codex:<id> ...`.
