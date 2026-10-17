# xmsg

One shell address syntax for sending unchanged text once to an existing local Codex or Claude
session, with an enqueue outcome. Prefer the native route when already inside its harness:
Claude's `SendMessage`, `codex queue` for Codex, or `herdr agent prompt` under Herdr.

```sh
xmsg send --to codex:<thread-id-or-exact-name> --message 'Can you check this?'
xmsg send --to claude:<session-id-or-exact-name> --message 'Can you check this?'
```

Only the selected CLI must be on `PATH`. Codex targets use `codex queue`. Claude targets use a
one-shot `claude --print` relay, with `--tools` limiting built-in tools to `ListAgents` and
`SendMessage` and `--allowedTools` pre-approving those tools. The relay uses a Claude turn to
resolve one exact, unique target; this selection remains model-assisted. The unchanged message
and the `SendMessage` call ID are checked against its structured `tool_result`. Model prose is
never accepted as a send receipt. Success requires `success: true` and a `msg_id`.

| Exit | Outcome                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| 0    | Accepted: Codex queue succeeded, or a Claude tool_result confirms acceptance |
| 1    | Rejected/error reported by the transport                                     |
| 2    | Invalid command usage                                                        |
| 3    | Selected CLI unavailable or could not start                                  |
| 4    | Acceptance unknown: timeout, failed Claude run, or no confirmed tool_result  |

The default send deadline is 60 seconds; `--timeout-ms N` changes it. A timeout can occur after
the message was accepted. **Do not resend an unknown outcome without checking the recipient.**
There are no automatic retries.

Accepted means enqueued, not read or replied. xmsg owns no broker, inbox, launch/delegation, or
reply tracking. To arrange a reply, include the sender's exact address in the message; the
recipient can send another message using its native route or xmsg.
