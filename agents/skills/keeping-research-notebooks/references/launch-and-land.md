# Launch and land — gates N3 and N4 detail

> Scope: the one launch path and the one landing path in a shared notebook checkout.
> jj command semantics are `driving-jujutsu`'s. Task bodies are `wiring-mise-tasks`'. Resource envelopes are `orchestrating-agents` P7.

## §1 Launcher preconditions

| Precondition | How it is checked | On failure |
|---|---|---|
| runner, params and resource manifest are committed as-is | the launcher compares the working copy to a commit | land them through the COMMITTER, then relaunch |
| the benchmark is registered in the records store | the launcher looks it up, if it does | register it first; see `driving-polysearch` |
| the cause is a hypothesis with frozen predictions | launcher exit status if it checks; else read the hypothesis record by hand | write the hypothesis first; never launch causeless |
| params use only the keys the runner reads | the launcher's params schema, if it has one | remove the key or teach the runner, in a REVISION |
| the model slug is in every registry the launcher reads | the dry-run (§2) | complete registration; `references/editions.md` §2 |
| the run is one question | one hypothesis, one changed variable | split the run |

If the launcher reads registries at a commit, an uncommitted registry edit is invisible to it.
Check which it reads in its `--help` or source.

## §2 Dry-run resolution checks

Run the launch command with `--dry-run` first. Then read its JSON, field by field.

| Field | Required value | FAIL even at exit 0 if |
|---|---|---|
| `ok` | true | false |
| `modelCode` | an object | `null` |
| `modelCode.slug` | the slug you intend | null or a different slug |
| `modelCode.revision` | equals the edition's REVISION constant | null or another number |
| digest, commit, cause (if printed) | the ledger digest; the commit holding your inputs; your hypothesis id | mismatched |

Field names follow the repo's launcher; map each row to its printed key.
A digest mismatch may surface only at run time; read the run's exit status too.

Paste the resolved JSON lines into the ticket. That is N3's artifact.

## §3 COMMITTER protocol

| Step | Act | Receipt |
|---|---|---|
| 1 | Agents finish and hand back changed paths. They run no jj or git write. | path list |
| 2 | The COMMITTER lands on a cadence, one batch per event, not per path. | — |
| 3 | Inspect the selected diff (§4). | `jj diff --stat <paths>` plus the commit task's selected-path receipt |
| 4 | `mise run commit -- -m '<msg>' [flags] -- <paths>`; flags first, `--` and paths last. | the task's receipt lines |
| 5 | Land only run dirs whose run record file exists; use the task's flag for this (e.g. `--records`) if it offers one. | no in-flight run dir in the stat |
| 6 | Confirm the change and the bookmark. | `jj log -r '@\|@-'`; `jj bookmark list --all-remotes` |
| 7 | Confirm each included file is tracked at the new change. | `jj file list -r @- <path>` |
| 8 | Judge a push by the remote bookmark, not the exit code. | local and remote bookmark on one change |

After `--`, every token is a path. A flag placed there becomes a path.

## §4 Pre-commit diff check

| Look for | Why | Action |
|---|---|---|
| a path you did not name | record landing can stage another writer's working file | drop it from the selection; tell its owner |
| a staged path outside your list | the store's landing may write the git index, which `jj diff` does not show | compare the commit task's selected set with your list; the jj-era check is unverified (ledger §5) |
| a run dir with no run record | the run is in flight | leave it for a later landing |
| a control path | owner-only | drop it; report it |
| a large or generated file | it belongs outside VCS | move it under an ignored path |
| a registry edit without its checker green | the launcher will see a half registration | finish `references/editions.md` §2 first |

## §5 Failure → recovery

| Symptom | Diagnose | Recover | Never |
|---|---|---|---|
| `index.lock` held | another process: record landing, a hook, a push | wait; find the holder with `ps`; remove the lock only when no process holds it | delete a lock a live process holds |
| snapshot refused a file | `jj status` names the file and the size cap | move the bytes under an ignored path | raise the cap for one file |
| commit task crashed after the commit; bookmark not moved | first check `jj log` for a divergent change (`??`); then `jj log -r '@\|@-'`; `jj bookmark list --all-remotes` | confirm the change content, then `jj bookmark set <bookmark> -r <change>` | rerun the commit blindly |
| divergent change (`??` in `jj log`) | `jj op log`; `jj op show <op>` | `driving-jujutsu` J4; abandon the unintended copy | `jj undo` without reading the op log |
| formatter rewrote a file after its digest was computed | the digest checker reports a mismatch | format, recompute with `--worktree`, update the ledger, land again | hand-edit a digest |
| hook or formatter touched a path outside the selection | `jj diff --stat` shows it | leave it to its owner; keep it out of the paths | sweep it into your landing |
| commit gate refused (lint, format, digest) | read the refusing line | fix the cause; run the commit task again | a bare `jj commit`, which runs no gate |
| two writers edited one file | the diff mixes two tickets | the COMMITTER splits by owner (`jj split`) or returns it | land a mixed change |
