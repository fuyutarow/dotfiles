# storage-headroom

Read-only view of the shared storage thresholds and current filesystem headroom.

```text
storage-headroom [--json] [--path P]
```

`--path` applies the guest drive policy to the requested filesystem. JSON output is the
contract's `headroom` object: a `drives` array containing each drive's label, path, free and total bytes, thresholds,
and `ok`, `warn`, or `deny` state. Exit codes are 0 for ok, 10 for warn, 11 for deny on any
drive, and 2 for usage or policy errors.
