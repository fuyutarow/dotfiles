# Agent dispatch contract

## Worker display IDs

`agent-dispatch run --name <name>` or ticket front matter `name = "<name>"` assigns the worker ID `agt_<name>`; the CLI value takes precedence. Names keep their typed case and must contain 1..16 ASCII letters, digits, `_` or `-`. Without either name, the dispatcher assigns `agt_` followed by four lowercase base36 characters. A live ID on this host cannot be reused; finished runs release it. Resume keeps the original display ID. `resume`, `result`, `grade` and `ack` accept the display ID, choosing the most recent run when finished history contains more than one match.

## Pre-spawn ticket grading

Schema 1 and 2 tickets may declare `premises = ["file:<relative-path>", "symbol:<exact-text>", "symbol:<exact-text>@<path-glob>"]`; before Jev is asked, the router checks paths and exact-text symbol occurrences in tracked files for this checkout (or text files via `rg` elsewhere), bounded to five seconds total. Missing premises refuse with exit 2, a `premise` ticket-grade violation, and the fix `correct the brief's premise or remove it`; a timeout is recorded as `premise check skipped: timeout` and proceeds.

Every parsed brief receives the model-free ticket floor before its real worker starts. Unless
`--no-grader` is set, the dispatcher then asks Jev to pick a roster row for a short read-only
grader worker bounded to 90 seconds. A schema 2 ticket refused by the floor skips the grader.
The grader is a sub-step of the parent run: it has no run record, verify step, autograde, or
independent stats entry.

The grader receives the full brief, the BIBIFI microticket rules (one consumed decision,
`first_return` is an early checkpoint of that same final deliverable, split only at two or more
independently checkable final deliverables, queues are still containers, and long work cannot be
obtained by chaining; a change stays with its own test, dry-run, seal/hash check, required params/config, and paired claim bounds unless pieces deliver independently consumable results), and the strict JSON shape emitted in an `agent-dispatch-grade` fenced block.
Read-only tickets (`writes = []` or `read_only_diagnostic`) split only across independent questions; derived or mutually-referencing sections stay together.
The dispatcher validates the fence and schema. Every proposed piece is converted to a schema 2
ticket and must pass the model-free floor. A piece whose outcome is contained in the parent's
`first_return` is rejected as a split. Ready-to-paste piece headers carry `split_from`, and a ticket
with that marker cannot be split again. Piece write globs must be disjoint or ordered by a
transitive `depends_on` relation.

A ticket may include `urgent_reason = "<why>"`. If the floor passes but the grader returns a valid
split or clarify, the dispatcher prints the remand and proceeds with the run; the receipt retains
the reason and grader verdict. Floor violations still refuse. In `stats --grading`, each refusal
adds wall time through the next dispatch by the same dispatcher to grading overhead. The report
shows urgent and matching `--no-grader` split overrides separately under `overridden_splits`.

Malformed output, invalid pieces, process failure, or timeout records grader status `failed` and
uses the floor verdict. A grader failure never refuses the run. A valid grade merges floor and
grader violations with source `floor+grader`. Schema 2 split/clarify grades refuse with exit 2 and
print actionable violations plus ready-to-paste piece headers or clarifying questions. Plain briefs
and schema 1 tickets whose model-free floor verdict is not `pass` are refused with named violations
and fixes; `--legacy-brief "<why>"` records a one-release exception. Schema 1 floor-pass tickets
continue to run. The parent receipt carries grader status, reason, Jev pick, chosen row, elapsed
time, usage and cost.

`--no-grader` records status `skipped` and its reason. `agent-dispatch grade-replay <dir>
[--expect <file.tsv>]` applies the floor and grader to every top-level `*.md` brief and never starts
the brief's real worker. Expectations are `file<TAB>verdict` rows; replay reports agreement and the
false-refusal rate among expected-pass briefs.

## Throughput and acknowledgements

`agent-dispatch ack <run_id> [--consumed|--rejected] [--note "<why>"]` appends an acknowledgement
with the current dispatcher session and timestamp. It accepts finished runs with any outcome; an
unknown run is refused without writing a record. Omitted outcome means consumed. A later
acknowledgement supersedes an earlier one for stats.

`agent-dispatch stats [--since <ISO|duration>]` defaults to 24 hours. Its throughput section reports
run counts, accepted artifacts, accepted artifacts per worker hour, median time to first return,
timeout and acceptance rates, cost per accepted artifact, and wasted tokens by row and dispatcher
session. The pre-1.4.0 report remains under `legacy`. `--grading` adds Jev pick latency, grader time
and cost, verify time, refusal-to-next-dispatch wall time, their shares of total wall time and cost,
and remand refusal/split counts. The grading report counts same-brief `--no-grader` runs after a
grader split refusal as likely false splits. Its savings estimator uses the timeout-or-waste frequency among unrefused runs in the same window,
multiplied by remand refusal/split count; saved time and cost use the average worker time and cost
among those timeout-or-waste runs. `--grading --check` exits 1 if either grading time or cost is
larger than its corresponding estimated save.

`stats --replay <candidate.json>` compares recorded accepted artifacts per worker hour with an
offline candidate. Candidate JSON is `{ "rules": [{ "when": { "row": "...", "effort": "...",
"ticket_schema": 2, "capability_tags": ["..."], "confidence_bin": "high" }, "row": "..." }] }`;
rules are tried in order and omitted predicate fields are ignored. A candidate row's accepted rate
comes from the measured window. The estimate assumes row rates are independent of task.
