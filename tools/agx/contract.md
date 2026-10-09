# agx contract

## Command layout

The suite has exactly four nouns; there are no former command aliases.

| Operation                           | Command                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| Run a worker                        | `agx dispatch --prompt-file <brief> --cd <dir> --sandbox …` |
| Resume a worker                     | `agx dispatch --resume <run_id>`                            |
| Choose a row                        | `agx pick --prompt-file <brief> [--cd <dir>]`               |
| Ask typed selection questions       | `agx pick ask --request <file                               | ->`                    |
| Inspect route availability          | `agx pick doctor`                                           |
| Replay ticket grading               | `agx ticket replay <dir> [--expect <file.tsv>]`             |
| Grade or waive a finished run       | `agx ticket grade <run_id> --evidence <file>                | --waive <why>`         |
| List workers                        | `agx ledger ls`                                             |
| Show statistics                     | `agx ledger stats`                                          |
| Export/import the routing record    | `agx ledger record export                                   | import`                |
| Note artifact consumption/rejection | `agx ledger note <run_id> --consumed                        | --rejected [--note …]` |
| Export runs                         | `agx ledger export`                                         |
| Show a run result or stored brief   | `agx ledger result <run_id> [--json                         | --brief]`              |

Flags and output retain their existing meanings. Runtime state is only in
`$XDG_STATE_HOME/agx` (default `~/.local/state/agx`), with `AGX_STATE_DIR` as the test seam.
The owner may run `mise run agx:migrate-state` to merge the previous directory into agx,
including when both directories exist. JSONL logs are deduplicated by exact line and ordered
by timestamp. Content-addressed and per-run files require identical bytes on name collisions.
Live run IDs and owned files remain in place; unrelated state merges with exit 3 until a rerun
can finish. `--wait` polls every 30 seconds, bounded by `--wait-max` (default four hours).

### Mutable state inventory and migration rules

The state writers in `src/agx.ts`, `src/routes.ts`, `src/state.ts`, and `src/workers/`
currently produce two singleton mutable files. The other files are JSONL logs,
content-addressed briefs, or per-run markers, progress, receipts, briefs and evidence.

| File or kind                                                                                                          | Writer / purpose                                                                    | Migration rule                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route-capability.json`                                                                                               | `probeRoutes` in `src/routes.ts`; regenerable route probe cache                     | Keep the newer mtime; retain the agx copy on ties.                                                                                                                                                                          |
| `imported-record.json`                                                                                                | `importRecord` in `src/agx.ts`; replaceable snapshot of exported routing statistics | Keep the newer mtime, matching the last-import replacement behavior. Preserve the winning snapshot rather than combining statistics from different hosts/windows.                                                           |
| Other root `*.json` singletons without `run_id`; files named `cache` or in `cache/` or `caches/`                      | Compatibility with additional cached state                                          | Keep the newer mtime; copy if absent. Preserve the source mtime when it wins.                                                                                                                                               |
| Lock files named `lock`, `.lock`, `*.lock`, `*.lock.json` or another `lock` filename component                        | Compatibility rule; the current router has no singleton lock writer                 | Never copy or overwrite an agx lock. Discard the old lock only after old live runs exit.                                                                                                                                    |
| Counter files with `counter`, `counters`, `count`, `sequence` or `seq` filename components; root numeric scalar files | Compatibility rule; the current router has no singleton counter writer              | Take the maximum scalar, or maximum per key for numeric JSON maps. Preserve keys from both maps. If one copy is unreadable, keep the valid copy; if both are unreadable or shapes differ, keep the newer snapshot and warn. |

Temporary write siblings (`*.tmp`) are produced by `importRecord`, `storeBrief`, progress
writers and the migration routine. They are unfinished writes: never copy them from the old
directory, and discard them only after old live runs exit. This also applies inside per-run
directories; live-owned files remain protected before applying any rule.

The cache, lock and counter compatibility rules do not classify files in `active/`, `worker-receipts/`, `grader/`,
`evidence/`, or `briefs/`, or files named by a SHA-256 digest, as mutable singletons.
Live-owned files are protected before applying any merge rule. Mutable file content differences
never cause a conflict refusal; writes still use a temporary file and rename before removing
the old source. No migration runs against the real HOME are needed for verification.

## Probabilistic row selection

Jev returns a choice and per-row probabilities. The router first masks rows whose routes are unavailable, whose expected cost exceeds ticket `budget_usd`, or whose xhigh/max effort lacks a justifying ticket capability. For the remaining n eligible rows, it smooths each probability as `(1 - epsilon) * p_jev + epsilon / n` (epsilon defaults to 0.1; zero disables smoothing), then samples proportionally to `p'^(1/T)`. Temperature defaults to roster `auto.pick_temperature` (currently 1.0), may be set by ticket `pick_temperature` or CLI `--pick-temperature` (0 ≤ T ≤ 5), and zero gives argmax of Jev's original probabilities. The seed defaults to a value derived from `run_id`; CLI `--pick-seed` overrides it. The run record and receipt keep `pick.choice` and add `mode`, `argmax_row`, `sampled_row`, `temperature`, `epsilon`, `seed`, `masked_rows`, `sampled_probability` (after smoothing and temperature), and a fallback reason where applicable. Missing probabilities fall back to Jev's choice, or the roster default when Jev's choice is invalid. Resume preserves the original pick without resampling. `--choice` remains refused.

## RETURN outcomes and escalation

A final message containing a valid `agx-return` block has worker outcome `returned`
and exit 0, including a RETURN with no changed files and a `for_coordinator` question. Verification
still runs and its results and summary are recorded beside the outcome; a failed verify does not
turn a RETURN into non-delivery. Receipts (`outcome_summary`) and stderr say
`returned — needs the coordinator: <first question>`, using the first report `for_coordinator`
entry or the RETURN's `proposed_next` when no question is supplied. RETURNs never auto-escalate.
The strict RETURN schema remains unchanged; both incident messages from 2026-10-09 fit it.

True `non_delivery` (declared writes with an empty checked delta and no valid RETURN) and
first-return stalls may escalate once. An owner-approved `--row` preserves its row and approval
and resumes its own vendor session. Without a session, the dispatcher stops for the coordinator.
Other escalations use `pick.source = "escalation"`: among available rows that fit the ticket's
budget and Claude run bounds, other than the failed
row, require a known AA index at least the failed row's and known input/output prices, then
minimize `price_in + price_out`. Price ties prefer the same model family's next effort up,
then the lowest sufficient AA index, effort order, and row ID. No Jev call, sampling, epsilon,
or weaker default fallback is used. Escalation itself permits the higher effort after a failure.
The dispatcher asserts that the selected AA index cannot be lower and records `escalation.rule`,
`failed_aa_index`, and `selected_aa_index` alongside `escalated_from`. Missing capability evidence
or no capable available row stops escalation for the coordinator. A second failure exits nonzero
without a third worker.

## Worker display IDs

`agx dispatch --name <name>` or ticket front matter `name = "<name>"` assigns the worker ID `agt_<name>`, name in [A-Za-z0-9_] (hyphens become underscores); the CLI value takes precedence. Names keep their typed case and must contain 1..16 ASCII letters, digits, `_` or `-`. A hyphenated name is normalized to underscores with one stderr note; other characters are refused with exit 2. Without either name, the dispatcher assigns `agt_` followed by four lowercase base36 characters. A live ID on this host cannot be reused; finished runs release it. Resume keeps the original display ID. `resume`, `result`, `grade` and `ack` accept the display ID, choosing the most recent run when finished history contains more than one match; hyphenated spelling resolves to the underscore ID.

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
obtained by chaining; a change stays with its own test, dry-run, seal/hash check, required params/config, and paired claim bounds unless pieces deliver independently consumable results), and the strict JSON shape emitted in an `agx-grade` fenced block.
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

`--no-grader` records status `skipped` and its reason. `agx ticket replay <dir>
[--expect <file.tsv>]` applies the floor and grader to every top-level `*.md` brief and never starts
the brief's real worker. Expectations are `file<TAB>verdict` rows; replay reports agreement and the
false-refusal rate among expected-pass briefs.

## Throughput and acknowledgements

Routing includes each roster row's overall seven-day median first-return time, timeout rate,
accepted rate and cost per accepted result. For every capability tag on the current ticket, it also
includes that row's record restricted to runs whose ticket carried that tag. Each row also gets a
comparable-ticket tradeoff from runs with the same exact capability tags and the same size class
(writes-glob count and brief length): expected time to first return, timeout rate, accepted rate,
cost per accepted, and expected accepted-returns-per-hour. The row with the best observed expected
throughput is marked, and Jev is asked to maximize that quantity. A record with fewer than five
runs is marked `little record`; thin comparable history is stated per row and is never silently
replaced by overall averages. These are evidence for Jev's choice and do not let a caller select a
row.

For a ticket `name` reused within 24 hours, or a continuation through `resume`, the router treats
the run and its resumes as one lineage. Rows with at least two lineage runs graded `fail` or
`partial`, or returned without an ack-consumed, are masked from Jev's candidates. The receipt records
each masked row and reason. If every candidate is masked, the overall-record argmax remains
available and the receipt says which row was kept; Jev still makes the choice.

`agx ledger note <run_id> [--consumed|--rejected] [--note "<why>"]` appends an acknowledgement
with the current dispatcher session and timestamp. It accepts finished runs with any outcome; an
unknown run is refused without writing a record. Omitted outcome means consumed. A later
acknowledgement supersedes an earlier one for stats.

`agx ledger stats [--since <ISO|duration>]` defaults to 24 hours. Its throughput section reports
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
