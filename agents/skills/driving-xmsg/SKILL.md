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

Set `TARGET` to the supplied or verified address and `MESSAGE` to the authorized text:

```sh
xmsg send --to "$TARGET" --message "$MESSAGE" --timeout-ms 60000
```

Discovery and send share this single deadline. There are no automatic retries.

| Send exit | Meaning and next action |
|---|---|
| 0 | Accepted for enqueue. Report acceptance; reading and replying remain unconfirmed. |
| 1 | Transport rejection/error. Report the failure. |
| 2 | Invalid usage, missing/invalid selector or ambiguity. Correct the selector or flags. |
| 3 | CLI or required discovery unavailable/incomplete, or discovery exhausted the deadline before send. Report the diagnostic. |
| 4 | Acceptance unknown: timeout, failed Claude run or missing confirmed tool result. Check the recipient before considering another send. |

Codex acceptance comes from successful queue execution. Claude send uses a one-shot model
relay with `ListAgents` and `SendMessage`; acceptance requires a correlated tool result for
the unchanged text with `success: true` and a valid `msg_id`. Relay prose is not a receipt.
The relay's target selection remains model-assisted.

Known limit: `claude agents --json` can list an interactive session that the relay's
`ListAgents` cannot reach. Such a send can exit 4 without a confirmed `SendMessage` result.
Listing does not guarantee sendability, and this skill does not repair that gap. A timeout
can also occur after acceptance. Never automatically resend an unknown outcome.

## Optional reply

When the task requests a reply, include this sender's actual backend-qualified ID or exact
native name in the message and ask the recipient to reply using:

```sh
xmsg send --to "$SENDER_ADDRESS" --message "$REPLY" --timeout-ms 60000
```

Verify the sender address from session context or inventory; if unavailable, obtain a reply
target instead of inventing an identity. xmsg provides no reply tracking. A round trip is
confirmed only when the reply is observed in this session; enqueue acceptance alone does
not establish delivery or a reply. Keep the exchange bounded by the task's authorization.
