---
name: messaging-codex-sessions
description: >-
  Send messages to an existing Codex CLI session by thread ID and arrange an optional reply
  through `codex queue`. Use when asked to contact another Codex session, relay a finding, or
  test cross-session messaging. New agent dispatch and team topology belong to
  `orchestrating-agents`.
---

# Messaging Codex sessions

Use this skill when the user asks to send a message to a specific, already-running or saved
Codex CLI session. It owns the `codex queue` interaction and the distinction between queued,
delivered, and replied. It does not create agents or choose work for a team.

## Send a message

Use the recipient thread ID or exact session name supplied by the user. Do not guess a target
from a project name or assume the other session is on this machine. Preserve the user's intent
and send only the requested message. For a simple connectivity test, send a short request for
an acknowledgement.

```sh
codex queue --thread "$TARGET_THREAD" --message "$MESSAGE"
```

The command queues text for the selected session; it does not return that session's response.
Treat its `Queued message … for thread …` output as an enqueue receipt only. Report failure as
failure. In particular, a read-only Codex home or blocked app-server startup means the message
was not queued; retry only through the normal permission path.

Codex documents `--thread` as accepting a UUID or exact session name. See the [CLI command
reference](https://learn.chatgpt.com/docs/developer-commands#codex-queue) for current options.

## Arrange a reply

When the user wants a round trip, resolve this session's reply address from `CODEX_THREAD_ID`,
falling back to `CODEX_SESSION_ID` if needed. Pass that ID in the message to the recipient and
ask it to send its reply with:

```sh
codex queue --thread "$SENDER_THREAD" --message "$REPLY"
```

Do not claim a round trip from the recipient's enqueue receipt. It is complete only after the
reply appears in this session. If the sender ID is unavailable, ask the user for a reply target
rather than inventing one. Keep the exchange short and avoid looping unless the user asks for
continued coordination.

## Scope

- Use for direct communication with existing Codex CLI threads.
- For a Claude Code session, use its native cross-session messaging workflow.
- For creating, dispatching, or coordinating new agents, use `orchestrating-agents`.
