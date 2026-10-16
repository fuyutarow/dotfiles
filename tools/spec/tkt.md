# Ticket lifecycle — `tkt`

`tools/tkt` owns issuance and collection of plain ticket files for any repository. It is the
counterpart of `ws` for workspaces. agx runs and judges work; jj retains ticket history.
Install the root package bins with `mise run deps`. The first release is 0.1.0 (seed metadata 0.0.0 plus the pending minor changeset).
Land generates tools/tkt/CHANGELOG.md.

## Proposition TKT-LIFECYCLE

Fixtures in `tools/tkt/tests/lifecycle.test.ts` use real jj repositories and fake `agx ls --json`.
They exercise issuance without overwrite, three input lines producing three files, all five
states, and GC deleting exactly accepted tickets with landed workspaces. A GC deletion of a
no-run, running, unjudged, rejected or unlanded ticket, an overwrite, or a tkt state file refutes
the proposition. Fixtures and fake state live outside the checkout, under `/tmp`.

## CLI contract

Consumers are people at terminals, shell scripts, and coordinating agents. No command requires
a TTY or reads stdin. Flags may follow positionals; Cleye rejects unknown flags and excess
arguments. `--help` and `--version` are read-only. Repeat `--set` to supply multiple values.

```text
tkt new <slug> [--from <template>] [--set k=v]... [--each <inputs-file>] [--repo P]
tkt ls [--repo P] [--json]
tkt gc [--dry-run] [--repo P]
```

`--repo` defaults to cwd. Repository discovery walks upward to jj metadata or a Git root.
For a jj workspace, files belong to that checkout; its backing store identifies matching runs.
The default directory is `<repo>/.agents/tickets`. A repo may declare another directory:

```toml
# .agx.toml (other agx keys are preserved)
tickets = "plans/tickets"
```

Relative directories resolve from the repository root. Absolute directories and `~/` are
supported. Paths under `/tmp`, `/private/tmp`, `/var/tmp`, `/dev/shm`, or `/run` are marked
volatile in listings and collection output; jj history is not assured there.

### Issuance

A slug contains letters, digits, `_`, and `-`, starting with a letter or digit. `new` writes
`<slug>.md`, with exclusive creation (`wx`), and never overwrites files or symlinks. It checks all
planned names and renders every template before creating files. An I/O failure during a batch
reports the paths already created; fix the failure and issue the remaining names separately.
There is no force flag or automatic rollback that might delete another writer's file.

The built-in template produces schema 2 TOML front matter with a name, outcome, empty writes and
verify arrays, and a proposition to refine. `--from` reads a template relative to the caller's cwd.
Placeholders are `{{key}}` for verbatim substitution or `{{key:json}}` for an escaped JSON/TOML
string literal. Values are substituted once. Unset placeholders fail before issuance.

`--set owner=alice` defines a value (last repeated key wins). Reserved values are `slug`, `index`
(one-based), and, with `--each`, `input`. They override explicit settings. `--each` reads UTF-8
lines, ignores blank lines, and creates `<slug>-1.md`, `<slug>-2.md`, etc. Nonblank input text is
preserved. Empty input fails. Counts mean files, one per nonblank line.

```sh
tkt new inspect --from template.md --set owner=alice
tkt new inspect --from template.md --each inputs.txt
```

### Derived listing

`ls` reads `agx ls --json --all` once, so history beyond agx's default 30-run window is included.
It lists regular `.md` files immediately inside the ticket directory and ignores symlinks.
Ticket identity is front matter `name`, falling back to the filename stem. agx's ticket name,
absolute path, or filename must match, and its workspace must share the jj store or its cwd must
resolve to this repository. A removed workspace under the standard sibling <repo>.ws directory
also preserves run identity; it cannot establish landing after jj forgets it. A ticket with a foreign repository's run stays `no-run`.

Runs are ordered by `started_at` as instants. Any still-running matching run vetoes collection,
even if a newer ended run exists. Otherwise the latest run determines the state:

| Evidence | State |
| --- | --- |
| No matching run | `no-run` |
| Matching run still running | `running` |
| Ended without a recognized judgment, or orphaned | `ended-unjudged` |
| Ended with judgment `accept` | `accepted` |
| Ended with judgment `reject` | `rejected` |

Landing uses jj's stored workspace tip (`<workspace_name>@`) and optional `end_commit`.
All nonempty ancestors must be reachable from `.ws.toml`'s `trunk` revset, default `trunk()`.
Read-only jj probes use `--ignore-working-copy`: they never snapshot or rebase a workspace.
Landing is therefore about recorded commits; a coordinator should finish and snapshot work
before accepting it. A forgotten workspace, failed revset or non-jj repository yields unknown
landing and prevents collection. An agx read or schema failure fails the whole listing.

Human stdout contains one tab-separated line per file:
`state <TAB> true|false|unknown <TAB> path <TAB> reason`.
`--json` emits one array with `ticket`, `path`, `state`, `landed` (boolean or null), `run`
(id or null), `reason`, and `volatile`. No progress or diagnostics enter JSON stdout.

### Collection and recovery

GC selects only `accepted` rows with `landed: true`. Dry-run prints exactly those paths as
`would-collect <TAB> path`, appending a volatile-path notice when applicable. It changes nothing.
Actual GC re-reads agx and jj immediately before each deletion and checks the run id still matches,
then unlinks only regular ticket files. Output is `collected <TAB> path`. Other files remain.
An error stops further deletion and exits nonzero; completed deletions are reported in the error diagnostic.
Recover versioned tickets through jj history. No workspace, agx record, or history is removed.

No tkt ledger, cache, lock, or state file is written. The only writes are issued ticket files and
eligible file deletions. agx owns its own storage behavior. Without a cross-tool transaction, a
new dispatch concurrent with the final unlink can race GC; coordinators must serialize dispatch
and GC. The recheck reduces that window and never treats a failed read as permission to delete.

## Channels, outcomes and evolution

All verbs run in the foreground. Before external reads, stderr prints `tkt: reading …`; jj is
never killed by a timeout. Operational failures use `tkt: …` and exit 1. Cleye usage errors exit
nonzero (normally 1; prototype-flag rejection exits 2). Success, including empty listings and
empty GC selections, exits 0. Interruptions may leave a completed subset of a batch; exclusive
creation protects retries from overwriting. The tool does not interpret exit-zero runs as accepted.

Command names, state tokens and the JSON array framing are the 0.1 interface. Future JSON fields
may be added; readers should ignore unknown fields. Changes to state meaning, file selection or
deletion conditions require fixture updates and a release changeset.
