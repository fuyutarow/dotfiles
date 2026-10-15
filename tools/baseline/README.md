# baseline

`baseline` turns Bun test failures into flat text for shell scripts and acceptance checks.
The repository package bin installs it through the existing `bun link` flow.

```sh
baseline record alpha -- bun test tools/example > base.txt
baseline record worker-revision -- bun test tools/example > head.txt
baseline diff base.txt head.txt
```

`record` runs the exact argument vector after `--` in a full, clean temporary jj workspace
at the requested revision. The command must produce Bun's default test reporter output
(a wrapper such as `mise run test` may do so). Dependencies must already be available to
the command; baseline does not install packages or copy the caller's ignored files.
Relative command paths resolve in the checkout. Each unique failure is one line:
`<repository-relative file><TAB><suite > test name>`. Lines use deterministic lexical
sorting and LF endings; durations and terminal colors are removed. A failure count means
named failing test executions before deduplication, and must match Bun's summary.

Completed test runs, including failed tests, exit 0 from `record`. Incomplete or unsupported
reporters, unnamed errors, failed commands, and cleanup errors exit 2 without emitting a
partial baseline. Progress and errors go to stderr; stdout contains only data. Commands
have a 30 minute bound. SIGINT, SIGTERM, and SIGHUP request cancellation and cleanup;
SIGKILL and host crashes cannot run cleanup. The jj workspace registration and the entire
owned temporary tree (including child TMPDIR) are removed before stdout is emitted.
No baseline state or cache is retained.

`diff` reads both files as sets of exact lines, ignores empty lines, accepts CRLF, and prints
the sorted unique lines present only in head. It exits 1 if any are new and 0 otherwise;
file read errors exit 2. Existing failures and resolved failures produce no output.
Both commands provide `--help`; unknown options and missing required arguments are rejected
by the CLI parser. The v0.1 text format and exit meanings are the compatibility surface.
