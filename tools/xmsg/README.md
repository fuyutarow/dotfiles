# xmsg

One shell address syntax for sending unchanged text once to an existing local Codex or Claude
session, with an enqueue outcome. Prefer the native route when already inside its harness:
Claude's `SendMessage`, `codex queue` for Codex, or `herdr agent prompt` under Herdr.

```sh
xmsg send --to codex:<thread-id-or-exact-name> --message 'Can you check this?'
xmsg send --to claude:<session-id-or-exact-name> --message 'Can you check this?'
xmsg send --to 01a15424 --message 'Can you check this?'
xmsg send --to 'review (v2)' --message 'Can you check this?'
```

Qualification is optional for a globally unique full UUID, UUID front prefix (at least
4 hexadecimal digits, case-insensitive with canonical hyphens), or literal exact native
name. Unqualified selectors query both native inventories concurrently and require both
to be complete and available, even for a full UUID. Resolution checks full UUID identity
first, exact names second, and UUID prefixes third. The same UUID in both vendors is
ambiguous. Names, including spaces, parentheses and pattern characters, match literally;
there is no fuzzy or wildcard interpretation. A colon introduces an explicit vendor
qualifier; unknown qualifiers are usage errors.

Ambiguity exits 2 with sorted fully qualified candidates and names; qualify the target
or extend its UUID prefix. Missing or malformed selectors also exit 2. Incomplete or
unavailable discovery exits 3, identifies the backend, and asks for `codex:` or `claude:`.
These refusals send nothing. Exactly one global match sends once to its unchanged native
ID. Discovery and the send share one overall deadline; inventories describe only the
native endpoints below, not all saved or remote sessions.

For qualified selectors, only the selected CLI must be on `PATH`. Codex targets use `codex queue`. Claude targets use a
one-shot `claude --print --model haiku --effort low` relay, with `--tools` limiting built-in tools to `ListAgents` and
`SendMessage` and `--allowedTools` pre-approving those tools. The relay uses a Claude turn to
resolve one exact, unique target; this selection remains model-assisted. The unchanged message
and the `SendMessage` call ID are checked against its structured `tool_result`. Model prose is
never accepted as a send receipt. Success requires `success: true` and a `msg_id`.

| Exit | Outcome                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| 0    | Accepted: Codex queue succeeded, or a Claude tool_result confirms acceptance |
| 1    | Rejected/error reported by the transport                                     |
| 2    | Invalid usage, invalid/missing selector, or ambiguous prefix                   |
| 3    | CLI unavailable, required discovery unavailable/incomplete, or a complete Claude relay trace confirms no `SendMessage` was attempted |
| 4    | Acceptance unknown: timeout, failed Claude run, malformed/incomplete trace, multiple sends, or a called `SendMessage` without one correlated receipt |

A Claude no-send result requires a zero exit, parseable stream records, and a final
`result/success` record with a string `result` field. Each top-level tool use must
have exactly one later result. Captured non-action metadata frames are accepted
only for known shapes; unknown frame types or subtypes remain unknown. The diagnostic
says `no SendMessage attempted`; this differs from a called send with a missing or malformed receipt,
which remains acceptance-unknown exit **4**. Model prose and absence of a success
receipt alone never prove no-send. The top-level assistant/user roles must agree,
tool-result IDs must match one earlier tool-use ID exactly once, and content blocks
must use recognized text/tool-use/tool-result shapes. Orphan results, malformed
possible tool uses, nested or unrecognized frames, and inconsistent roles fail
closed as unknown. No outcome is retried automatically.

The default send deadline is 60 seconds; `--timeout-ms N` changes it. Required discovery and
the subsequent send share this single budget. A timeout can occur after
the message was accepted. **Do not resend an unknown outcome without checking the recipient.**
There are no automatic retries.

Accepted means enqueued, not read or replied. xmsg owns no broker, inbox, launch/delegation, or
reply tracking. To arrange a reply, include the sender's exact address in the message; the
recipient can send another message using its native route or xmsg.

## Discover recipients

```sh
xmsg list
xmsg list --json --timeout-ms 5000
xmsg send --to codex:<shown-short-UUID> --message 'Can you check this?'
```

Copy the shown address unchanged into `send --to`. Human output shortens UUIDs to the
shortest currently unique front prefix, starting at 8 hexadecimal digits. It extends
prefixes through UUID or exact-name collisions. Opaque native IDs remain full. JSON
preserves the full canonical `address` and `id`, and adds `shortAddress`.
Names may be duplicated; addresses are deduplicated by vendor and native ID (only actual
UUIDs are normalized; opaque IDs remain case-sensitive), never by name, cwd, or order.
The count is the number of unique addresses returned by successful inventories.

Qualified send accepts UUID front prefixes of at least 4 hexadecimal digits,
case-insensitively, with optional canonical UUID hyphens. It queries **only the selected
vendor** and requires a complete, available native inventory before resolving a prefix.
Exactly one match becomes the full native ID for one unchanged send. Ambiguity prints
deterministically sorted full candidate addresses and names on stderr; missing, malformed,
ambiguous or unverified prefixes cause no send. Exact registered names take precedence
over prefix matching and UUID-format rejection; local name resolution also requires
complete inventory. Full UUIDs take precedence over names and need no discovery.
Opaque exact names retain the existing native send path even if discovery is unavailable.
Spaces and punctuation in names, such as `review (v2)`, are passed literally; pattern-like
characters are native exact-name text, never wildcard or fuzzy UUID-prefix syntax.
Wildcards, fuzzy and substring matching are unsupported. UUID-shaped short names need
discovery to distinguish them from prefixes. Inventory can change after listing; send
checks uniqueness again rather than trusting the earlier display.

Listing uses Claude's read-only `claude agents --json` active registration inventory
(interactive and background), without a model turn or SendMessage. Codex listing connects
to the **already running shared local app-server control socket**, using
`thread/loaded/list` and metadata-only `thread/read`. This includes Desktop/shared
app-server threads visible on that endpoint. It does not launch a daemon or read historical
transcripts. Saved/resumable but unloaded threads are excluded, as are sessions owned by
other endpoints (including a separate Windows Desktop backend when running in WSL).
An absent/incompatible socket is explicitly unavailable; fleet/Herdr records are not used
as reachability evidence. Codex uses `CODEX_HOME`, falling back to `~/.codex`.

Human rows show only reusable short TO address, native name (or unavailable), cwd
(or unavailable), and actual reported state. Availability is summarized once per vendor;
source/RPC details and per-recipient availability remain in JSON and this documentation.
JSON contains `recipients`,
`count`, and per-vendor `backends`; each recipient includes `address`, `vendor`,
`id`, `shortAddress`, nullable `name`/`cwd`, `state`, `availability`, `source`, and
`observedAt` (observation time, not last activity). Registration/loading is discovery
evidence, not a delivery, read receipt, or guarantee the recipient remains available.
The Claude receipt parser correlates a top-level `SendMessage` call ID and the exact
message text, but it receives no verified shared identity field for the destination.
Claude registration UUIDs therefore are not proven to identify relay-visible peers;
this parser change does not establish or infer that mapping.

List exits **0** only when both inventories complete, including a genuinely empty result;
**3** means at least one backend is unavailable, failed, timed out, exceeded bounds or
returned an unsupported schema. Successful vendor results remain in partial output.
Failures appear in stderr and JSON backend details. Usage errors exit **2** before
discovery. `--to`/`--message` are send-only; `--json` is list-only.

The existing `--timeout-ms` deadline applies independently to both concurrent inventory
operations (default 60 seconds). Each backend is capped at 1,000 native records and 4 MiB
of output; Codex follows bounded pagination. Unsupported fragmented WebSocket frames are
reported as unavailable rather than silently omitted. Listing sends no agent messages,
per-recipient ping, or retry, and creates no registry/cache. Existing send acceptance and
exactly-once behavior remain unchanged.
