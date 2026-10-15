# storage-headroom

Part of the [tools/ architecture](../spec/architecture.md) (measure and guard: invariants I-R6 to I-R8).

Read-only view of the shared storage thresholds and current filesystem headroom.

```text
storage-headroom [--json] [--path P]
```

`--path` applies the guest drive policy to the requested filesystem. JSON output is the
contract's `headroom` object: a `drives` array containing each drive's label, path, free and total bytes, thresholds,
and `ok`, `warn`, or `deny` state. Exit codes are 0 for ok, 10 for warn, 11 for deny on any
drive, and 2 for usage or policy errors.

The library entry `src/decision.ts` exports `decide(payload): Promise<Verdict>`. It owns
config validation, command and checkout policy, measurement caches, artifact budgets,
recovery advice, and the `allow`, `warn`, or `deny` verdict. It reads no stdin, prints
no protocol envelope, and never exits the caller. A silent allow has no reason; a
scratchpad allow has a reason; warnings carry additional context; denials carry a
reason and optional additional context.

The declaration remains `agents/hooks/storage-headroom.toml`, overridable through
`STORAGE_HEADROOM_CONFIG`. The hook adapter handles JSON parsing, namespaced envelopes,
and exit status for both Claude Code and Codex. Existing cache paths and bounded
recovery requests are preserved. Decision tests use an isolated tools-entry fixture;
transport tests stay under `agents/hooks/tests`.
