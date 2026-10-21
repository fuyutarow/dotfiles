# XMSG proven no-send evidence — 2026-10-22

## Proposition

A clean, complete Claude relay trace with zero top-level `SendMessage` tool uses
is distinguishable as unavailable from a possibly accepted send whose receipt is
missing. This is a parser/CLI result change only; it does not change recipient
resolution or dispatch a message.

## What the local source can certify

- `src/xmsg.ts` waits for the child exit and drains stdout to EOF. A nonzero child
  exit remains acceptance-unknown (exit 4), even if stdout contains a receipt.
- `src/claude-receipt.ts` parses each nonblank output line as JSON. A no-send
  result requires the final parsed record to be the existing `result/success`
  frame with a string `result` field, and no top-level assistant `tool_use`
  named `SendMessage` anywhere in the captured stream. A malformed
  assistant/user event, malformed JSON, or missing/non-final result frame
  cannot prove no-send.
- The no-send path also requires internally consistent framing: assistant/user
  message roles agree with event types; each tool-result ID refers to exactly
  one earlier top-level tool-use ID; every tool-use has exactly one result;
  tool-use IDs are unique; and content blocks use recognized text, thinking,
  tool-use, or tool-result shapes. Orphan/unpaired/duplicate results, wrong
  roles, malformed possible tool uses, nested events, and unknown blocks disable
  the no-send result.
- The captured native framing contained `system/hook_started`,
  `system/hook_response`, `system/init`, `system/thinking_tokens`,
  `system/informational`, `rate_limit_event`, assistant `thinking`/`text`/
  `tool_use` blocks, user `tool_result` blocks, and a final `result/success`.
  The parser accepts only those observed metadata subtypes with their observed
  top-level field types; it ignores their values. Other frame types/subtypes fail
  closed. No captured values, messages, IDs, session data, or project data are
  stored in this evidence record.
- The captured `result/success` envelope had 26 top-level fields:
  `api_error_status`, `duration_api_ms`, `duration_ms`,
  `fast_mode_disabled_reason`, `fast_mode_state`, `first_content_frame_ms`,
  `is_error`, `modelUsage`, `num_turns`, `permission_denials`,
  `queued_turn_count`, `result`, `result_index`, `safety_stops`, `session_id`,
  `stop_reason`, `subagent_stats`, `subtype`, `terminal_reason`,
  `time_to_request_ms`, `total_cost_usd`, `ttft_ms`, `ttft_stream_ms`, `type`,
  `usage`, and `uuid`. The fake terminal carries all 26 fields with fake values;
  the parser checks the complete strict top-level envelope, including success
  subtype and non-error status. Nested usage/stat objects are checked as objects
  without interpreting their values. Unexpected top-level fields and error
  result envelopes remain unknown.
- That complete zero-call case returns a typed `no-send` result. The CLI reports
  `no SendMessage attempted` and exits 3. It does not rely on model prose or only
  on a missing success receipt.
- A single top-level send still needs exactly one correlated `tool_result` for
  the same call ID and exact message. Existing explicit rejection and accepted
  receipt handling remain. A missing/corrupt receipt, multiple sends, failed
  child, timeout, or incomplete/malformed trace remains acceptance-unknown
  (exit 4); no automatic retry is added.

## Fake-only regression evidence

`tests/xmsg.test.ts` uses its existing isolated fake `claude` executable and
stream fixture. Focused regressions cover a completed zero-call stream, orphan
tool result, wrong-role SendMessage event, malformed possible tool use, a valid
correlated ListAgents use/result with native metadata, an unpaired ListAgents
use, a called send with no receipt, malformed and incomplete streams, child
failure, multiple sends, correlated accepted receipt, and a contradictory error
result envelope. The fake native-shaped stream exercises the actual CLI parser
path. The tests do not invoke a real Claude CLI, relay, inventory, or model turn.
The focused suite passed with 113 tests and 503 assertions. The native-shaped
fake terminal contains the full 26-field observed envelope; the paired
ListAgents trace includes all six observed metadata frame kinds and assistant
thinking content.

## Identity limit

The source can correlate a top-level call ID, exact message text, and its
tool-result receipt. The receipt schema has no verified destination identity
field. Claude `agents --json` registrations and the relay's `ListAgents` peer
set are separate authorities; this change establishes no registration UUID to
relay-peer mapping and changes no UUID/prefix routing. A successful correlated
receipt is evidence of acceptance reported by the relay, not proof that a
registration UUID and relay endpoint are the same identity. The parser's
metadata shapes are grounded in a local captured native stream, but the fake
tests do not prove all future CLI versions use those shapes; unrecognized
framing remains acceptance-unknown.
