# Fleet adapter next input — 2026-10-22

## Selected boundary

Select the Claude Code StatusLine callback handled by `tools/statusline`, specifically
the non-Codex stdin path. This is one current provider boundary: `tools/statusline/README.md`
declares `agents/claude/settings.json` to invoke this package with `--session stdin`.
At `tools/statusline/src/statusline-main.ts:433-468`, raw stdin JSON is parsed through
`ClaudeStatuslineInputSchema`; its normalized `SessionStatus` becomes `session`. When
`--session` is an explicit ID, `statusline-main.ts:469-478` rejects a callback whose
provider `session_id` does not match. The callback's exact `session_id`, `cwd`, context
tokens/percentage, model display name, effort, and rate windows are extracted by
`tools/statusline/src/adapters/claude-statusline.ts:15-89` before dataframe rendering.

## Existing read/write path and smallest next edit

The caller builds display data at `statusline-main.ts:522-529`, then invokes
`writeStatuslineFleetSession(session, "claude", df.sessionName)`. The current writer at
`tools/statusline/src/fleet-session.ts:100-159` constructs and writes a complete schema-1
record using `writeFleetSession`; `resolvedName` is display-derived and must not be treated
as raw callback evidence. The new Claude adapter should take the matched callback's raw
provider fields (or its typed callback representation retaining provenance), stamp their
observation time when accepted, and submit only fields this owner actually observed through
`updateFleetSession` with owner `claude-statusline`. Keep `session_id` / vendor in the
validated identity, not the patch. Omit absent fields; an explicit unavailable cell is a
new observation only for a field this callback owner owns. In particular, don't use
`process.env.PWD`, `process.cwd()`, or rendered/dataframe text as callback `cwd` evidence.

Smallest implementation scope: `tools/statusline/src/adapters/claude-statusline.ts`,
`tools/statusline/src/statusline-main.ts` (hand off the already session-matched callback
without using rendered text as authority), `tools/statusline/src/fleet-session.ts` (replace
the schema-1 whole-record write for this boundary), and the existing focused fixture suite
`tools/statusline/tests/fleet-session-writer.test.ts`. The accepted shared schema-2 core/store
is the dependency, not a deployed runtime: its accepted source branch is
`ws_fleet-store-fake-regressions@5c7e14bae4198981f318326b5d246cd5b6ce8cb9` and must be
present in the implementation checkout before adapter code can import its API.

This adapter can be implemented and fixture-tested with schema 2 disabled at runtime: inject
an isolated runtime directory and exercise the schema-2 read/update API in tests. That is
**prepare** only. **Enable** remains barred until the dual reader is deployed, statusline
reloaded, hooks fresh, projector re-executed/restarted, and no already-loaded direct v1
writer remains. Those reader, reload, and direct-writer inventory barriers are OPEN; a
prepared caller/helper is not whole-UDF closure.

## Preserved constraints and verification input

- Keep Claude callback identity (`session_id`, matched to `--session`) distinct from Codex
  rollout/provider identity. Do not route Claude callback values through Codex originator
  parsing or infer one vendor from rendered text.
- Keep each field's observation age separate from the record's `updated_at` commit clock.
  Omission preserves the old cell and its age; explicit unknown is a new owner observation.
- Reject stale patched cells atomically as a whole request. The adapter must not bypass the
  schema-2 store's identity, owner, freshness, lock, or merge checks.
- Projector F0 has no field ownership and supplies no adapter evidence. Herdr's native title
  projection 0.1.13 remains a separate readonly display feature.
- Existing focused command documented by the statusline package: `bun test
  tools/statusline/tests`. No runtime migration or enablement is claimed here.

## Frozen inputs

`.agents/inputs/fleet-update-api-oct21.md` and
`.agents/inputs/fleet-field-authority-oct21.md` are local frozen copies of the accepted
contracts and prior caller inventory. This note selects one next input and does not repeat
their field-authority or repository-wide audit.
