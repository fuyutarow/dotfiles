# agx CLI contract

`agx` is the minimal worker CLI. Its package bin points to `src/next/cli.ts`; `agx-next` remains
an alias for one release. The CLI has exactly five commands:

| Command | Purpose |
| --- | --- |
| `agx run TICKET [--cd TREE] [--sandbox MODE] [--continue RUN_ID]` | Route a ticket to a roster worker, run it, and append run records. |
| `agx check TICKET [--cd TREE]` | Validate a ticket and its premises without starting a worker. |
| `agx ls [--json]` | List runs and judgments. |
| `agx judge RUN_ID accept\|reject [--note TEXT]` | Append an acceptance or rejection judgment. |
| `agx stats [--import-legacy]` | Report run counts; optionally import legacy run records. |

Tickets are caller-owned files. `agx run` accepts positional ticket paths and optionally a working
tree and sandbox mode. A continuation uses the previous run ID and resumes its vendor session.
Run events, progress, and judgments are stored in one append-only `records.jsonl` file. The default
state directory keeps its `agx-next` name for compatibility; the real state directory is not
migrated by this CLI switch.

Use `agx ls --json` as the machine-readable view. Its rows include the run ID, ticket, state,
workspace, selected roster row, write globs, judgment, report path, progress path, and continuation
metadata. `scripts/land.ts` consumes this view alongside legacy run records when deciding whether a
workspace has an accepted run.

For a durable run on Linux, use a named transient systemd user unit:

```sh
systemd-run --user --unit=agx-<name> --collect -- agx run TICKET.md
```

The dispatcher does not detach, amend, or create ticket stores and does not run a pre-dispatch
grader. `agx run` records an interim return as progress and continues the worker until completion or
its timeout. Verification commands declared by the ticket run after the worker exits.

See [next-records.md](docs/next-records.md) for the append-only record schema and JSON listing.
