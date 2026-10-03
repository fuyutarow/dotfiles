# Goal Kernel

Goal Kernel is the smallest control-plane slice needed before adopting another agent harness. It
does not replace Claude Code or Codex and it does not orchestrate a collection of external tools.
It binds one human-authorized Goal snapshot to a native provider session, records privacy-bounded
events, and reconstructs postmortem evidence from one run id.

## Decision boundary

The current decision is **native hooks plus a repository-local kernel**, not an off-the-shelf
harness and not a tool zoo.

- Reina Maestro supplied useful card/session/event primitives, but its installed hook path did not
  persist native prompts, denied attempts, supplied authority fields, or historical Goal/decision
  identity. Those are the product slice required here, not configuration gaps.
- Opik, Phoenix, Langfuse, and similar systems are observability backends. They can consume this
  event model later; they cannot be the pre-effect Goal authority.
- OPA is a policy evaluator, not the Goal/version store or transcript ingestor. DBOS/Temporal are
  durable workflow runtimes; this bounded local file transaction does not yet require either.
- Haiku, Luna, or another small model may later emit an `alignment.assessed` event. A model verdict
  remains advisory until it has a measured error budget and a human-approved escalation policy.
  It is deliberately not allowed to become the authority merely because it runs on every turn.

The extension seam is the append-only run-event schema. A later backend or evaluator must consume
that seam; it must not add a second Goal store.

This is not a permanent rejection of existing harnesses. The 2026-08-03 pilot tested Reina
Maestro `0.107.0` as the one candidate spine. A disposable patch could repair denied-event
recording without changing its architecture, but native Claude/Codex transcript ingestion,
historical Goal/decision authority, and run-id postmortem reconstruction were still absent as a
product slice. Installing Maestro and then adding separate Goal, transcript, and postmortem stores
would have created multiple authorities instead of removing custom harness code.

An external spine can replace this kernel when one bounded pilot demonstrates all of the following:

1. the exact Goal version is immutably bound before a native session can act;
2. prompts, tool attempts (including denials), outcomes, decisions, and delegation share one run id;
3. a pre-effect storage/authority failure blocks, while post-effect failures cannot replay effects;
4. one command reconstructs a historical incident without chat copy/paste; and
5. migration leaves one Goal authority and one event lineage, not synchronized peer stores.

Until that gate passes, optional observability or model evaluators remain consumers of this event
seam, not additional control planes.

## Authority and state

Activation validates a JSON contract, writes a canonical immutable snapshot, and moves the active
pointer. The first configured event for a provider session creates an immutable run binding.
Changing the active pointer affects future sessions only.

```text
.agent-state/goal-kernel/
├── config.json
├── ACTIVE.json
├── goals/<goal-id>/v<version>-<sha256>.json
└── runs/<run-id>/
    ├── binding.json
    └── events/<timestamp>-<uuid>.json
```

`.agent-state/` is private and ignored by this repository. Files are written with private modes.
Each event repeats the bound Goal and policy digests. Prompt text, tool input, tool output, and tool
errors are represented by SHA-256 plus bounded metadata; they are not copied into the ledger.
Goal snapshots, run bindings, and event files are content-digest checked on read, so accidental or
post-hoc edits are detected. This is tamper-evidence, not a signature: a same-user attacker can
rewrite digests or delete files. Cryptographic non-repudiation needs a separately trusted signer or
remote append service and is outside v1.

Goal changes are explicit version changes. Version `n` must name the exact digest of version
`n-1`. Reusing one `(goal_id, goal_version)` for different content is rejected. A decision that
does not alter the North Star can be appended to a run with a parent decision and evidence refs.
Activation and per-run decision appends use exclusive state locks, so two writers cannot both pass
the conflict check and commit. A crashed writer leaves a visible `GK_BUSY` interlock; stale locks
are never deleted automatically.

The `authority` object is an auditable assertion, not identity proof. The kernel cannot determine
whether a human or an agent typed the activation command. Strong authentication or signatures are
a separate future decision.

## Command surface

Run the CLI from the target repository, or pass an exact `--root`.

```sh
bun ~/dotfiles/agents/goal-kernel/cli.ts activate goal.json --json
bun ~/dotfiles/agents/goal-kernel/cli.ts status --json
bun ~/dotfiles/agents/goal-kernel/cli.ts decide <run-id> decision.json --json
bun ~/dotfiles/agents/goal-kernel/cli.ts postmortem <run-id> --include-transcript --json
```

Activation and decision recording are non-interactive. `--json` emits one line. Exit codes are `0`
for a clean result, `1` when a readout has findings, and `2` for invalid input or an environmental
failure. The native transcript is read only on demand, size-bounded, reduced to user/assistant text
plus tool-call identity/input hashes, and redacted before output. Arbitrary tool-call bodies are
never emitted. Natural-language redaction is necessarily pattern-based and best-effort, so
`--include-transcript` remains an explicit sensitive-data operation. Transcript formats are
explicitly treated as unstable provider adapters.

## Hook behavior

The user-scope Claude and Codex hook configurations observe `SessionStart`, `SessionEnd`,
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and subagent lifecycle events. Claude also
observes `PostToolUseFailure`.

- An unconfigured workspace is a silent pass.
- A configured session receives its exact Goal at start/compact and a compact reminder on every
  user prompt.
- If configured authority or the event ledger is unavailable, `UserPromptSubmit` and `PreToolUse`
  are denied before the effect. Post-effect hooks can only warn; they never retry a side effect.
- The dedicated runner treats Bun as an enforcement prerequisite. If it is unavailable, it scans
  only from the hook working directory to the nearest Git boundary: a workspace with no Goal
  Kernel state passes silently, while configured or indeterminate `UserPromptSubmit` and
  `PreToolUse` events exit `2`. Observation-only events report the missing event and pass with
  neutral JSON. This avoids unconfigured-repository breakage, configured pre-effect bypass, and
  `Stop` continuation loops.
- Goal Kernel returns no `allow` decision. Normal provider permissions and other deny hooks retain
  authority.
- Concurrent hooks mean a requested tool with no completion may have been denied by another hook,
  cancelled, or interrupted. The postmortem reports `not_observed_completed`; it does not invent a
  cause.

This is a guardrail, not a total mediation theorem. Codex documents that hosted tools and some
specialized paths can bypass local function-tool hooks. Hook disabling, untrusted/unreviewed Codex
hook definitions, and a missing Bun runtime still prevent observation-only coverage. Semantic
consistency between a new instruction and the North Star is not deterministically proven; v1 makes
the authority visible and the failure reconstructable.

## Interaction gates

### U1 gesture ledger

| gesture | divergent states | deciding state | legibility at the act |
|---|---|---|---|
| `activate <contract>` | first version; identical replay; conflicting rewrite; version successor; rollback | validated contract plus stored lineage | one-line verdict names Goal/version/digest; `status` shows the current pointer |
| native `SessionStart` | unconfigured; configured with a prior binding; configured with only an active Goal; broken authority | workspace config and immutable session binding | injected context names run id, Goal version, digest, North Star, acceptance, and non-goals |
| native `UserPromptSubmit` | unconfigured; bound; authority/ledger failure | exact run binding and ledger write result | bound state is injected; failure blocks with a stable `GK_*` code |
| native `PreToolUse` | unconfigured; bound and recorded; configured but unbound; ledger failure | config, binding integrity, and event write | silent defer when recorded; structured provider-compatible deny with `GK_*` reason otherwise |
| `decide <run-id> <decision>` | new id/valid parent; duplicate id; missing parent | immutable Goal decisions plus earlier run events | verdict returns run, decision, and event ids |
| `postmortem <run-id>` | complete evidence; unobserved tool result; missing/malformed transcript | immutable binding plus append-only events | JSON findings name every evidence gap without guessing its cause |

An existing run never changes meaning when `ACTIVE.json` moves. A genuinely changed North Star
requires a new version and a new task; this is an intentional interlock, not a hidden mode.

### U2 absorber ledger

| braid | separation | absorber |
|---|---|---|
| provider payload shape + Goal semantics | thin Claude/Codex adapters versus one canonical state model | implementation |
| current Goal pointer + historical authority | mutable future-session pointer versus immutable run binding | implementation/storage |
| auditability + secret retention | hash-only ledger versus on-demand redacted transcript read | implementation; the user retains native transcript custody |
| deterministic enforcement + semantic judgment | binding/ledger gate versus a future measured evaluator | platform/human for semantic judgment |

### U3 delegation table

| task | non-interactive path | machine-legible result | failure signal |
|---|---|---|---|
| activate Goal | `activate <file> --json` | one JSON envelope with version and digest | exit `2` plus `FATAL` |
| inspect authority | `status --json` | active snapshot plus run bindings | exit `1` when not configured |
| append decision | `decide <run-id> <file> --json` | decision event id and lineage | exit `2` on duplicate/missing parent |
| reconstruct incident | `postmortem <run-id> --include-transcript --json` | one joined evidence envelope | exit `1` plus typed findings; exit `2` on invalid state |
| native hook act | stdin JSON to the provider adapter | hook JSON or silent defer | provider-compatible deny/warning and `GK_*` code |

### U4 action classification

| action | class | undo/interlock |
|---|---|---|
| activate a Goal snapshot | reversible | move the pointer to a prior immutable snapshot; existing runs remain unchanged |
| create a run binding | intentionally irreversible history | new session/task is the escape; the binding is never rewritten |
| append an event or decision | intentionally irreversible history | append a superseding decision; never mutate prior evidence |
| read a postmortem/transcript | reversible/read-only | no state change; transcript access is explicit via `--include-transcript` |

No delete or overwrite command is exposed in v1.
