---
name: driving-xmsg
description: >-
  Uses xmsg to discover and message existing local Claude and Codex sessions, relay findings,
  or arrange a reply. Use for xmsg and existing-session communication; new agent dispatch
  belongs to agx and orchestrating-agents.
---

# Driving xmsg

Send the authorized text once to an existing session and report the actual enqueue outcome.
Use `xmsg` for either backend; backend transport commands are implementation details.
Creating agents, assigning workers and choosing team topology belong to `agx` and
`orchestrating-agents`.

## Discover and address

```sh
xmsg list
xmsg list --json --timeout-ms 5000
```

Use the exact address supplied by the task or copy a verified inventory address. Never infer
a recipient from cwd, row order or a project name. Human output shows reusable `shortAddress`
values; JSON retains full `address` and `id`, plus `recipients`, `count` and `backends`.
The count is unique vendor/ID addresses returned by successful inventories.
List exits 0 only when both inventories complete, even if empty; exit 3 retains partial
results and backend failure details. List membership is discovery evidence only.

Claude discovery uses read-only `claude agents --json` active registrations. Codex discovery
uses the already-running shared local app-server's loaded threads, excluding saved/unloaded
threads and other endpoints, including a separate Windows backend from WSL. Listing sends
no messages or model turns. Each backend has the supplied deadline (default 60 seconds),
a 1,000-record bound and a 4 MiB output bound; incomplete discovery is explicit.

Prefer `codex:<ID-or-exact-name>` or `claude:<ID-or-exact-name>` when the backend is known.
Unqualified UUIDs, UUID front prefixes and literal exact names require both inventories
to be complete and available, even for a full UUID. Resolution checks full UUID identity,
then exact names, then prefixes. Cross-vendor matches are ambiguous; qualify the address.

UUID prefixes need at least four hexadecimal digits, case-insensitively, with optional
canonical UUID hyphens. Human display starts at eight digits and extends through collisions.
Send rechecks uniqueness: qualified prefixes require complete selected-vendor inventory;
ambiguity exits 2 with sorted full candidates. Extend the prefix or select the intended full
address. Unavailable required discovery exits 3. These resolution failures send nothing.

A qualified full UUID bypasses discovery. Qualified opaque exact names use the native send
path; UUID-shaped names require inventory, where exact names take precedence over prefixes.
Names match literally, including spaces and punctuation; quote them. There is no fuzzy,
substring or wildcard matching. Do not assume opaque-name uniqueness was checked locally.

## Send once and interpret the result

Set `TARGET` to the supplied or verified address and `MESSAGE` to the authorized text. When
the exact current sender address is supplied or verified, declare it with `--from`; this
sets the single authoritative `from` header, followed by a blank line and the exact message
body. For example, set `SENDER_ADDRESS` to `codex:<fullUUID>` or `claude:<fullUUID>` only
when that current address is known:

```sh
xmsg send --to "$TARGET" --from "$SENDER_ADDRESS" --message "$MESSAGE" --timeout-ms 60000
```

`--from` is an explicit declaration, not authentication. Do not infer current worker identity
from inherited environment/session IDs (including `CODEX_THREAD_ID`) or reuse a parent
session's ownership ID. Do not perform sender inventory/lookup or infer identity from cwd.
Without `--from`, send remains supported and the envelope truthfully declares
`from: unknown(reason)`.

Discovery and send share this single deadline. There are no automatic retries.

| Send exit | Meaning and next action |
|---|---|
| 0 | Accepted for enqueue. Report acceptance; reading and replying remain unconfirmed. |
| 1 | Transport rejection/error. Report the failure. |
| 2 | Invalid usage, missing/invalid selector or ambiguity. Correct the selector or flags. |
| 3 | CLI or required discovery unavailable/incomplete, or discovery exhausted the deadline before send. Report the diagnostic. |
| 4 | Acceptance unknown: timeout, failed Claude run or missing confirmed tool result. Check the recipient before considering another send. |

Codex uses a queue that may wait for the active response to finish. Exit 0 only confirms
enqueue; it does not mean the coordinator was notified immediately and cannot satisfy a
realtime ACK or wake requirement. No verified realtime or steer mode is implemented here.
Claude send uses a one-shot model
relay with `ListAgents` and `SendMessage`; acceptance requires a correlated tool result for
the unchanged text with `success: true` and a valid `msg_id`. Relay prose is not a receipt.
The relay's target selection remains model-assisted.

Known limit: `claude agents --json` can list an interactive session that the relay's
`ListAgents` cannot reach. Such a send can exit 4 without a confirmed `SendMessage` result.
Listing does not guarantee sendability, and this skill does not repair that gap. A timeout
can also occur after acceptance. Never automatically resend an unknown outcome.

## Optional reply

When the task requests a reply and this sender's exact current backend-qualified address is
supplied or verified, set `SENDER_ADDRESS` to that address and ask the recipient to send
their reply to it. In the recipient's reply command, `REPLY_TO` is that supplied address
and `SENDER_ADDRESS` is the recipient's own exact current address, if known:

```sh
xmsg send --to "$REPLY_TO" --from "$SENDER_ADDRESS" --message "$REPLY" --timeout-ms 60000
```

If the recipient's current sender address is unavailable, state that honestly and omit
`--from`; do not reuse a parent ownership ID. If the original sender did not provide a
reply target, do not invent one. xmsg provides no reply tracking. A round trip is confirmed
only when the reply is observed in this session; enqueue acceptance alone does not establish
delivery or a reply. Keep the exchange bounded by the task's authorization.
