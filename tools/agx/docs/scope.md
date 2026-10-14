# agx scope and ownership

## 1. agx does

agx has four jobs:

- **Route:** Jev picks a roster row for a ticket.
- **Launch:** start the selected vendor worker in the tree passed with `--cd`.
- **Record:** append run events to the single event data file, `records.jsonl` (under the agx state directory). After the worker exits, this job also executes each declared verify command in order through `sh -c` in the `--cd` tree, captures its exit and output tail beside `report.json`, and stores those facts in the `ended` event. Verification failures do not change the worker's run exit.
- **Fold:** `ls`, `stats`, and `judge` read or append those events. `judge` appends a judgment; `ls` and `stats` fold existing records.

Its five commands are `run`, `check`, `ls`, `judge`, and `stats`. `check` validates ticket premises in the supplied tree and reports overlapping live write globs; it does not reserve writes. The event log is the single durable run-event data file. A run also creates per-run brief, report, and progress artifacts alongside that log.

`ls` owns fold and selection: `agx ls [SELECTOR] [--json]` accepts a run id, a unique run-id prefix, or an exact ticket name. Ticket selection returns that ticket's runs oldest first, with the newest run last. Ambiguous ID prefixes and unmatched selectors exit 2 with one line naming candidates. The acceptance view is composed outside agx by `scripts/agx-accept.ts`; agx deliberately does not render reports or inspect workspace diffs.

## 2. agx does not

| concern | owner | why |
| --- | --- | --- |
| Ticket storage, history, and amendments | Plain files plus jj | Tickets are inputs; `agx check` validates an input and does not own its history. |
| Write exclusion between workers | jj workspaces plus rebase at land | agx only prints overlap `WARN` lines; it does not lock or block writes. |
| Workspace creation and landing | `jj workspace` / `mise run land` | agx accepts a tree through `--cd`; it does not create or land workspaces. |
| Durability or detach beyond the session | `systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agx-<name> --collect -- agx run ...` | The caller chooses a service lifecycle; `-E NAME` carries the dispatcher's session into the unit. |
| CPU/GPU/RAM admission | `agent-resource-run` | Resource admission is outside agx's routing and event-recording jobs. |
| Commits and pushes | `mise run commit` / `mise run land` | agx records worker outcomes; repository publication belongs to the repository tasks. |
| Acceptance | A human or coordinator | Verify results are recorded facts; a human or coordinator reads them and decides acceptance. `agx judge` records the accept/reject decision and optional note; agx does not decide acceptance. |
| Notifications and recap demands | Hooks consuming `agx ls --json` | Hooks can derive notifications from folded state; they must run the installed tool, not a checkout's working copy. |
| Searching code | `rr` | Code retrieval belongs to the repository search tool, not agx. |
| Routing quality | Jev, corrected through the brief and roster `use_for` | Routing is Jev's choice among roster rows; agx has no routing override. |
| Worker continuity records | The worker harness | A dispatched worker receives a bounded environment without coordinator slot or vendor session IDs. It owns its brief and workspace and does not bind a continuation record. |

## 3. Derived, not stored

- A superseded run is a run that a later run names in `continues`.
- The ticket's latest run is the last run in that continuation chain.
- Per-ticket judgment is the judgment on that latest run.
- `--continue` takes its timeout from the ticket supplied to that invocation: `ticket.timeout_s ?? 600` in [`src/next/run.ts`](../src/next/run.ts#L189-L213). The resumed vendor session does not carry a separate timeout field.

These are folds or interpretations of existing events and ticket inputs; they do not require new stored state fields.

## 4. How to triage a new ask

1. Does it fit one of agx's four jobs?
2. If not, which owner in section 2 handles it?
3. Can a fold of existing events answer it?

Only an ask that fits a job and cannot be answered by folding existing events may add code to agx.

## 5. Worker input and bounded outcomes

Codex and Claude workers receive a closed stdin stream. Their prompts remain explicit arguments
(the final `codex exec` argument and `claude -p <prompt>`), so a vendor cannot wait for an interactive
input stream. Their environment is rebuilt from `PATH`, `HOME`, `LANG`, `TZ`,
`AGX_DISPATCHER_SESSION`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`, and `CODEX_API_KEY`, with `AGX_WORKER=1`. Coordinator
continuation slots and vendor session IDs are omitted; each vendor creates its own session identity.
When a worker hook has no
bound continuation record, the worker owns its brief and workspace and does not become read-only.
A Codex `Reading additional input from stdin...` stderr line with no subsequent stdout event for 30
seconds ends the worker with a `stdin-wait` receipt and the line as its cause. Five identical
consecutive tool errors end the worker with a `spin` receipt; a wall-clock bound remains `timeout`.
