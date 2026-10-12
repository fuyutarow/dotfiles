# CLI CONTRACT

## C0 CONSUMERS

- Consumer regimes: human-interactive, agent, shell-pipeline, ci

| Regime                    | Supported work                          | Noninteractive path                      | Machine-readable result            |
| ------------------------- | --------------------------------------- | ---------------------------------------- | ---------------------------------- |
| human-interactive / agent | Dispatch, continue and inspect a ticket | Explicit files, ticket names and sandbox | Dispatch receipt; show/ps `--json` |
| shell-pipeline / ci       | Inspect records and verify contracts    | No interactive prompts; explicit flags   | Schema-tagged JSON and exit status |

## C1 INVOCATION

- Parser profile: Cleye with strict flags and explicit operands; kebab-case flags, no option-prefix abbreviations. Help/version exit 0; framework parse errors exit 1; local usage refusals exit 2.
- Ambiguous / invalid cases: choose one of `--ticket`, `--resume`, `--amend`. `--ticket` and `--prompt-file` combine only for repick instructions. `--file` requires `--amend` or `--repick`. Empty or missing instruction files refuse before interrupting a worker. Ticket names resolve to live work first, then its latest finished run; run IDs and unique vendor-session prefixes remain accepted. A shared vendor session selects its latest run. Ticket names in different projects require project context or a run ID.

The command table below is the invocation inventory. `dispatch --resume my_ticket --repick
--file next.md --prompt-file context.md` retains the ticket and combines both instruction files
with a compact handoff. A fresh `--prompt-file` dispatch also accepts `--repick --file next.md`.
`ticket amend --file -` reads stdin; dispatch instructions require filesystem paths.
Use `agx dispatch --help`, `agx show --help`, or the noun's `--help` to discover flags.

`agx wait <ticket|run> [--all-live]` attaches a session-owned foreground command to existing
work, including detached and amend-resumed workers. It prints each final dispatch receipt and
waits through verification. `--all-live` snapshots the other currently live runs at invocation;
each run is counted once. Exit is 0 for delivered/returned, 3 for timeout, and 1 for other failures.
`agx follow <ticket|run> [--json]` emits one line per picked, started, interim RETURN, verify result
and terminal event, then ends. JSON events carry `schema`, `run_id`, `state` and `detail`.
Existing events are replayed before following new ones. Resume and amendment stay attached by
default; `--detach` hands them to the OS manager and prints `agx wait <ticket>`.

| Invocation                                                     | Input                       | Work resolution                                  |
| -------------------------------------------------------------- | --------------------------- | ------------------------------------------------ |
| `dispatch --prompt-file brief.md --cd DIR --sandbox read-only` | Brief file                  | Create a state ticket                            |
| `dispatch --resume ticket --repick --file next.md`             | Ticket and instruction file | Latest run of that ticket                        |
| `show ticket`; `ledger note ticket`                            | Ticket name                 | Live inspection; latest finished acknowledgement |

## C2 EFFECTS

- Effects / recovery: dispatch selects a row and starts a bounded worker; it writes a ticket, marker, content-addressed brief and receipt under state. A named ticket retains its existing home. Identical prompt-file instructions may reuse a released ticket name; different instructions require amendment or a new name. No force flag overwrites history. `--amend` validates input, interrupts the live router with SIGINT, waits up to 30 seconds, appends one AMEND section and resumes its vendor session (or repicks when requested). A failed stop leaves the worker running. Stored briefs and historical ledger rows remain readable.

Before spawning, a per-run event journal records the sandbox, ticket, row, directory and known
session. An unreadable worker receipt retains that metadata, so the ticket remains resumable,
amendable and repickable. A historical continuation can inherit sandbox from its recorded ancestor.
An initial run with no vendor session can repick; vendor resume requires an actual session ID.

Every brief is a schema 2 ticket; there is no plain-brief or schema 1 path. One zod schema
(`src/ticket.ts`) is the whole admission contract for its fields, so dispatch, pick, ticket
lint/new/amend and resume refuse the same way. It requires `outcome`, `consumer`,
`first_return`, `writes`, `verify` (or `read_only_diagnostic = true`) and a strict
`[proposition]` table: `id`, one-line `claim` and `refuted_by`, `decides` (decisive | mechanism |
prerequisite | infrastructure), `graph_node` when decisive or mechanism, non-empty `serves` when
prerequisite or infrastructure. agx checks shape only; whether the id or graph node exists is the
coordinator's. The recap is sent verbatim to Jev as `state.proposition`, printed by `agx pick`,
opens the worker's promise block, and its id is kept on the marker and run record and shown by
`agx ps` and `agx show`. Split pieces inherit the parent's proposition.

`agx ps --mine` filters the run list to the current `dispatcher_session`. Table output includes
the short dispatcher session id; `ps --json` rows include the full `dispatcher_session` (or
`null` when the run has no recorded dispatcher session).

Capabilities accept plain routing tags or `{ need, lower_effort_lacks }` objects with non-empty
strings. Only an object justifies xhigh/max. Without one, positive selection mass goes to the
highest admissible lower effort in the same model family; receipt masks and fallback reasons
record the change. The admission check also applies to overrides and continuation/escalation.
Ticket lint warns once when tools/ or scripts/ writes may create a file without `reuses = [...]`.
Wildcard scopes conservatively count as potential creation. The warning directs authors to run
`rr exists '<capability>'` first; warnings do not reject dispatch.

Workspace dispatch validates the ticket schema, timeout reason, local lint and write scope before
allocation. Read-only writes and protected `.git`, `.agents`, `.codex` paths are refused in the
corresponding Codex sandbox. Automatic names combine second-resolution time with a UUID;
creation exclusively claims a sibling directory until setup completes or fails. A collision fails
before invoking the workspace creator. Detached children reuse the prepared workspace.

| Effect boundary   | Partial state                                      | Recovery                               |
| ----------------- | -------------------------------------------------- | -------------------------------------- |
| Dispatch / repick | Durable ticket, archived instructions, run receipt | Resume or amend the ticket             |
| Amendment         | Old instructions remain in the same file           | Append a corrective amendment          |
| Live interruption | Partial run and vendor session recorded            | Continue by ticket after graceful stop |

## C3 CHANNELS

- Machine mode: dispatch receipt, `show --json`, `ps --json`, ledger JSON.
- Machine framing: one JSON object per stdout line, with `schema`; human show/ps use readable fields and tables.
- Machine compatibility: additive fields; old records may omit ticket identity and live selection fields. Unknown fields are tolerated by readers. Removed command names acquire no compatibility aliases.
- Waits / liveness: worker and verification waits retain their declared bounds; stderr progress defaults to 300 seconds. Amendment waits at most 30 seconds; detached manager acknowledgement at most 15 seconds. Live show exposes row, picked probability, cumulative worker cost in USD, phase, last activity and its timestamp, and elapsed time. Unreported probability/cost are unknown, not zero. JSON adds `name`, `row`, `picked_probability`, `last_activity`, `last_activity_at`, and `elapsed_s` to the marker.

| Mode / TTY                  | stdout                    | stderr                                   | Framing             |
| --------------------------- | ------------------------- | ---------------------------------------- | ------------------- |
| Dispatch, piped or TTY      | One receipt               | Routing, worker progress and diagnostics | Schema-tagged JSON  |
| Human show / ps             | Live fields / ticket rows | Lookup diagnostics                       | Plain readable text |
| `show --json` / `ps --json` | Snapshot / run list       | Lookup diagnostics                       | One JSON object     |

## C4 OUTCOMES

- Fallbacks / handoffs: row-selection fallbacks remain recorded; resume preserves the selected row and vendor session, while repick explicitly starts a fresh selection and session. A detached acknowledgement confirms manager handoff, not completed work. A live resume directs callers to amendment rather than starting a concurrent continuation.

| Outcome class          | Exit / status                                | Output                                                                  | Retry / next action                          |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| Completed / returned   | 0 / receipt result                           | Verification and final report on stdout                                 | Inspect or acknowledge the ticket            |
| Timeout / interruption | 3 (Codex), 124 (Claude), 130 / 143 (signals) | Partial receipt, recorded vendor session                                | Resume or amend the ticket                   |
| Invalid local request  | 2                                            | Diagnostic on stderr                                                    | Correct input; no worker starts              |
| No grading decision    | Run exit unchanged                           | `grade-waived` with `decision: "no-decision"` for returned/stopped runs | Explicit grading/acceptance remains possible |

Dispatch emits no warning about historical ungraded runs. A no-decision counts one finished
run without a grading judgment; it is neither a pass nor acceptance. Existing grades and waivers
retain their meanings.

## C5 EVOLUTION

- Positive receipt: `bun test tools/agx/tests/agx.test.ts -t 'prompt-file dispatch creates a ticket|repick accepts instruction files'` exits 0 and proves amendment by ticket, both instruction files and resolved ledger acknowledgements. `bun test tools/agx/tests/run-control.test.ts` proves live human/JSON fields and ticket names in ps.
- Negative receipt: the ticket-home fixture attempts to replace an amended ticket with a fresh brief and receives an error while preserving history; invalid target combinations and instruction files refuse before worker interruption.

| Surface                  | Promise                                         | Change / deprecation                                            | Verification receipt                                |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| Ticket identity          | One handle and file per unit of work            | Every dispatch has a ticket; prompt-file copies are state-owned | Ticket creation, live amendment and repick fixtures |
| Run / vendor identifiers | Existing records and explicit IDs remain usable | Latest continuation in one vendor session is selectable         | Resume and historical ledger fixtures               |
| Live marker / receipt    | Schema-tagged additive fields                   | Picked probability and canonical ticket path are recorded       | Live show, state writer and ps fixtures             |
| Grading                  | Explicit grades remain readable                 | Warning removed; returned/stopped runs record no-decision       | Historical warning and no-decision fixtures         |

## Command layout

The suite has eight top-level commands: dispatch, pick, ticket, ledger, show, ps, wait and follow.
There are no former command aliases.

| Operation                           | Command                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| Run a worker                        | `agx dispatch --prompt-file <brief> --cd <dir> --sandbox …`       |
| Resume a worker                     | `agx dispatch --resume <ticket>`                                  |
| Choose a row                        | `agx pick --prompt-file <brief> [--cd <dir>]`                     |
| Ask typed selection questions       | `agx pick ask --request <file                                     | ->`                    |
| Inspect route availability          | `agx pick doctor`                                                 |
| Replay ticket grading               | `agx ticket replay <dir> [--expect <file.tsv>]`                   |
| Grade or waive a finished run       | `agx ticket grade <ticket> --evidence <file>                      | --waive <why>`         |
| List workers                        | `agx ledger ls`                                                   |
| Show statistics                     | `agx ledger stats`                                                |
| Export/import the routing record    | `agx ledger record export                                         | import`                |
| Note artifact consumption/rejection | `agx ledger note <ticket> --consumed                              | --rejected [--note …]` |
| Export runs                         | `agx ledger export`                                               |
| Show a run result or stored brief   | `agx show <ticket> [--json]`; `agx ledger result <ticket> [--json | --brief]`              |
| List work                           | `agx ps [--all] [--mine] [--json]`                                |

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

Jev returns a choice and per-row probabilities. The router first masks rows whose routes are unavailable, whose expected cost exceeds ticket `budget_usd`, or whose xhigh/max effort lacks a justifying ticket capability. Over ALL remaining eligible rows, it makes a plain categorical draw from `p_i^(1/T) / sum_j p_j^(1/T)` (equivalently `softmax(log p / T)`), without epsilon smoothing, a probability floor, or a top-p cutoff. Temperature defaults to roster `auto.pick_temperature` (currently 0.5), may be set by ticket `pick_temperature` or CLI `--pick-temperature` (0 ≤ T ≤ 5), and only zero gives argmax of Jev's original probabilities. Legacy epsilon fields remain readable in historical receipts. The seed defaults to a value derived from `run_id`; CLI `--pick-seed` overrides it. The run record and receipt keep `pick.choice` and add `mode`, `argmax_row`, `sampled_row`, `temperature`, `seed`, `masked_rows`, `sampled_probability` (after temperature), and a fallback reason where applicable. Missing probabilities fall back to Jev's choice, or the roster default when Jev's choice is invalid. Resume preserves the original pick without resampling. `--choice` remains refused.

## Ticket coordination

Ticket home precedence is `--home <path|state>` → `AGX_TICKET_HOME` → nearest
upward `.agx.toml ticket_home` → repo `.agents/tickets` if it exists →
`$AGX_STATE_DIR/tickets/<project>`. State uses the basename of the repository root
backing `--cd`; for jj workspaces this is resolved through `.jj/repo`, so every workspace
of one repository shares a project. Explicit `--project` wins. `ticket ls` prints the rule
that selected its home and this default project rule.
`ticket import <dir> [--project P]` copies Markdown files byte for byte, retaining
ids and appended history. Undated names acquire the import day's YYMMDD prefix;
collisions on ticket filenames (ignoring date prefixes) are skipped without overwriting.
Counts are files imported and files skipped for name collisions. Reruns are idempotent.
`dispatch --amend <name> --file F` without a live worker appends the amendment and
dispatches that ticket, resuming its last vendor session when resumable. It prints
`amend: worker not running — amended ticket and redispatched`.

Every `dispatch --prompt-file` creates an anonymous ticket under
`$AGX_STATE_DIR/tickets/<project>` regardless of the repository's named-ticket home.
The name is CLI `--name`, then front-matter `name`, then four generated base36 characters;
the same name is printed by ps and accepted by work-targeting commands. The state copy has
that name in its front matter.
The original source remains unchanged. Markers and run records keep `ticket.name` and
`ticket.path`; `brief.sha256` still identifies the exact archived dispatch instructions.
Ticket lookup includes these state tickets and recorded canonical paths, so amendment does
not depend on the original working directory or prompt file surviving.

## RETURN outcomes and escalation

A final message containing a valid `agx-return` block has worker outcome `returned`
and exit 0, including a RETURN with no changed files and a `for_coordinator` question. Verification
still runs and its results and summary are recorded beside the outcome; a failed verify does not
turn a RETURN into non-delivery. Receipts (`outcome_summary`) and stderr say
`returned — needs the coordinator: <first question>`, using the first report `for_coordinator`
entry or the RETURN's `proposed_next` when no question is supplied. RETURNs never auto-escalate.
The strict RETURN schema also accepts optional `interim: true`. Such a report is
stored in the active marker, progress log and final receipt, visible through `agx show`
and the statusline phase. The same vendor session resumes with
`continue; send the final report when done`, using only the remaining hard timeout.
It never resets the first-return checkpoint or triggers ticket verification between reports.
An unmarked RETURN (or `interim: false`) still ends the run. A missing vendor session
or exhausted hard timeout preserves the interim history and records failure.

True `non_delivery` (a naturally completed worker with declared writes, an empty checked delta,
and no valid RETURN) and proven all-flat stalls may escalate once. Workers stopped while still
progressing, including at `timeout_s`, never auto-escalate. An owner-approved `--row` preserves its row and approval
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

`first_return_s` is a soft checkpoint, never a stop condition. At that time, the router asks
Codex to queue an interim RETURN request for its existing session and records whether the request
was sent (or why it could not be sent), whether a valid RETURN appeared, and whether progress
appeared by the deadline. This request says to continue authorized work and keep running jobs.
Claude has no live prompt injection; its receipt records that limitation and the same observations.
Neither route is interrupted because of this checkpoint. If a worker naturally exits
with an explicitly interim RETURN, agx continues the same session.

The independent stall window is ticket `stall_s` (positive integer seconds, default 600). A run
stops early only when ALL observed inputs have been flat throughout the window: cumulative CPU
time of the worker's process tree (including descendants and retained CPU of exited children),
mtime and size of files matching declared writes, and vendor stdout/stderr activity or session
progress/last-message files. Wrapper heartbeat messages do not count as worker output. Unavailable
CPU or filesystem observations prevent a stall verdict. The stall message and receipt print the
CPU seconds/PIDs, each declared file's mtime and size, output metadata, and observed flat duration.
Otherwise the worker runs to completion or `timeout_s`.

Observation never waits on shutdown: timers are unref'ed and cleared as soon as the worker
exits, in-flight CPU/filesystem samples and soft requests are canceled, and receipt construction
uses the request's current result without waiting. CPU samples have a 250 ms budget; declared-write
scans yield to the event loop, start at each glob's fixed prefix, prune `.git`, `.jj`, and
`node_modules` before traversal, and have a 20,000-entry limit and a 500 ms budget (250 ms for
live samples). Incomplete scans are unavailable, never evidence of no progress or non-delivery.

Write globs resolve against the repository/workspace root, even when `--cd` names a subdirectory
(outside a repository, `--cd` is the root). At run start the router snapshots matching files'
mtime and size, including ignored files. Only changes since that snapshot count. Files declared
by another live run in the same workspace, or a run whose lifetime overlapped this one, are
reported as `changed by others (not attributed)` and `writes_unattributed`; they are excluded
from this run's changed paths and scope violations, including when both tickets claim the path.

## Worker display IDs

Worker IDs `agt_<name>` remain diagnostic metadata in records and worker logs. Ticket names
keep their typed case and hyphens; only the worker display normalizes hyphens to underscores.
Names contain 1..16 ASCII letters, digits, `_` or `-`. Without a supplied name, the dispatcher
generates four lowercase base36 characters for the ticket and corresponding display ID.
A live display ID on this host cannot be reused; finished runs release it. Resume retains it.
Historical recorded display-ID lookup remains readable; no new command aliases are introduced.

## Ticket home and worker promises

`agx ticket new <name> [--label L ...] [--home DIR] [--cd DIR]` creates one ticket file with
front-matter `name`. Home precedence is `--home`, `AGX_TICKET_HOME`, nearest upward `.agx.toml`
`ticket_home`, then `.agents/tickets`; `ticket ls` prints the resolved home. `agx ticket amend
<name> --file F|-` appends a dated AMEND section without rewriting earlier instructions. `agx
dispatch --ticket <name>` resolves that home and continues the prior vendor session when one exists;
`agx dispatch --amend <run|name> --file F` validates the amendment, SIGINTs a live router,
waits up to 30 seconds, appends to its canonical ticket, and resumes the same vendor session.
Live prompt-file runs use their state ticket; the source may be gone. Historical runs lacking
a ticket path can still use their recorded brief or a retained copy.
`agx dispatch --resume <run|name> --repick` starts a fresh
row selection with the prior report and open items as a compact handoff. `--file` and
`--prompt-file` add instructions; `--ticket <name> --repick` and `--amend <name> --file F
--repick` retain the same ticket too.

The worker receives a compact promise before the body: outcome, consumer, absolute write
paths/globs, first-return artifact and seconds, verify, kind, labels, and sandbox mode.
RESOURCE-CLASS(NONCOMPUTE) derives `token`; RESOURCE-ENVELOPE derives `compute`. Kind is
computed, never a user field. Optional labels are opaque strings; active markers store
`kind`/`labels`, and ledger run rows store `resource: { kind, labels }` because ledger `kind`
already identifies the event type.

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

A ticket may include `urgent_reason = "<why>"`; the receipt retains it. All grader split/clarify
verdicts proceed with warnings, regardless of urgency. Hard local floor violations still refuse. In `stats --grading`, each refusal
adds wall time through the next dispatch by the same dispatcher to grading overhead. The report
shows urgent and matching `--no-grader` split overrides separately under `overridden_splits`.

Malformed output, invalid pieces, process failure, or timeout records grader status `failed` and
uses the floor verdict. A grader failure never refuses the run. A valid grade merges floor and
grader violations with source `floor+grader`. Grader split/clarify verdicts print warnings with ready-to-paste piece headers or clarifying
questions, remain in the receipt, and run. Shared local lint checks schema (including timeout),
RESOURCE, verification/diagnostic declarations, and missing premises together before routing;
violations refuse with exit 2 and all fixes. Optional promise fields receive compatible defaults. The parent receipt carries grader status, reason, Jev pick, chosen row, elapsed
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

`agx ledger note <ticket> [--consumed|--rejected] [--note "<why>"]` appends an acknowledgement
with the current dispatcher session and timestamp. It accepts finished runs with any outcome; an
unknown run is refused without writing a record. Omitted outcome means consumed. A later
acknowledgement supersedes an earlier one for stats. Its `run_id` is the resolved run ID,
so naming a ticket or vendor session links the acknowledgement to the same run as show.

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
