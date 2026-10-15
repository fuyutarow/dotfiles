+++
schema = 2
name = "baseline"
outcome = "a stateless tool `baseline` (tools/baseline, package bin) turns test runs into data: `baseline record <rev> -- <test command>` runs the command in a clean checkout of <rev> (a temporary jj workspace it removes afterwards) and writes the failing test names as sorted text lines to stdout (`<file>\\t<test name>`); `baseline diff <base.txt> <head.txt>` prints only failures present in head and absent in base (new failures), exit 1 if any, 0 otherwise; so an acceptance compares a worker's verify with alpha mechanically instead of by a person re-running tests"
writes = ["tools/baseline/**", "package.json", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["bun test tools/baseline", "mise run lint:ts", "mise run lint:bun"]
timeout_s = 2400
premises = ["file:tools/spec/architecture.md"]

[proposition]
id = "BASELINE-DATA"
claim = "fixtures: a bun test run with 3 failures yields 3 sorted lines; diff of base {a,b} and head {b,c} prints only c and exits 1; diff of equal sets exits 0; record leaves no workspace behind and no /tmp entry"
refuted_by = "a diff that reports a pre-existing failure as new, or a record that leaves a workspace or temp entry behind"
+++

Architecture G5 (verify baseline), bottleneck B2 in the coordinator's report: tonight the coordinator re-ran tests on alpha
by hand at least five times to separate pre-existing failures (statusline VRAM/snapshot, skills:sync, changeset relay) from
regressions. Text lines in, text lines out (Unix: filters, flat text). Wiring it into agx is a later ticket; do not edit
tools/agx. Test data outside the workspace. Do not commit or push.
