# Homes and layout — gate N1 (SOLE home of the homes table)

> Scope: where each artifact kind lives, how to read a repo's own bindings, and the identifier scheme.
> Record operation is `driving-polysearch`'s. Layer wiring is `wiring-repositories`'.

## §1 Homes, expanded

| Kind | HOME | ENTRY | Deny | Receipt |
|---|---|---|---|---|
| claim, measurement, hypothesis, finding | RECORDS STORE | the store's typed record command | a markdown note, a report, a memory line | record id |
| run | RECORDS STORE run record plus its run dir | the launcher only (§ N3) | a hand-run `run --exec`; a run dir written by hand | run id; run record file |
| route tried, negative numbers, discarded paths | a finding per iteration | typed finding command | the agent's report alone | record id |
| library or model code | a package under a declared project path | working-copy edit; COMMITTER lands it | scratchpad; `probes/`; an external code dir | `jj diff --stat` |
| model change | a REVISION of an edition | `references/editions.md` §3 | a new edition for a fix; an overwrite | ledger digest |
| shared device primitive | the shared-primitive library | new public name plus oracle test | a copy inside an edition | test log |
| experiment runner | an apparatus record | the store's apparatus command | a runner file under packages; scratchpad | apparatus id |
| launch inputs (params, resource manifest) | the paths the launcher reads | committed as-is | an uncommitted edit | commit id |
| benchmark semantics, contracts, literature values | the benchmark package | schema-validated data plus tests | numbers in a runner; in-house metrics | schema test log |
| ruling, owner feedback | memory | file plus one index line | a TODO in code | memory path |
| primary-source knowledge | the knowledge repo | its distillation entry | a summary in the notebook | unit id |
| task state | TASK-CONTINUATION | `continuing-long-running-tasks` | `.agent-state`; scratchpad notes | record locus |
| frozen retired material | the archive path | write once | edits after freeze | — |
| large bytes (serialized models, caches, datasets) | outside VCS, ignored path | write there; record its digest | committing them | digest |

When no row fits, write "no declared home" in the hand-back.
Do not create a directory to fill the gap.

## §2 Discover the bindings

| Binding | Read | Command | FAIL if |
|---|---|---|---|
| Declared project paths | gate config `declared.project_files` | read the gate config | target path outside every entry |
| Control paths | gate config `declared.control_paths` plus the gate's reserved paths | read the gate config | an agent plans to edit one |
| Protocol dirs | the records store root and its kind subdirs | `polysearch doctor` | a raw write is planned there |
| Store health | gate health checks | `polysearch doctor` | a check fails on a path you touch |
| Commit verb | `commit` task | `mise tasks` | absent: route to `wiring-mise-tasks` |
| Launch verb | the one launcher task | `mise tasks`; its `--help` | two launch paths exist |
| Edition registries | catalog, versions ledger, model registry, checker | `repo-retrieve concept` on "edition catalog", "code digest checker" | a registry has no checker |
| Rulings | memory index | read the memory index | a ruling sits only in a report |

Repo instruction files can be stale.
The gate config, the task list and the scripts outrank prose.
Archived instruction files are history, not live convention.

## §3 Path classes

| Class | Who writes | ENTRY | Gate refusal |
|---|---|---|---|
| declared project path | agents and owner | working-copy edit | none |
| control path | owner only | owner edit | control-path write refused |
| protocol dir | the records store only | typed commands | protocol-dir write refused |
| undeclared path | nobody | none; declare it first via the owner | undeclared-path write refused |
| path outside the repo | not gated | none for claims | the gate cannot see it; treat as nonexistent |

The last row is why N1 bans the scratchpad.
The gate allows it, so nothing stops it.

## §4 Scratchpad and agent-state ban

| Location | Allowed for | Never for |
|---|---|---|
| session scratchpad | throwaway intermediate output, briefs, harvest notes | code that a run uses; anything claimed |
| `.agent-state` and similar tool dirs | nothing | state, plans, code |
| `probes/` or a loose runner dir | nothing | runners; they go to apparatus records |
| a git or jj worktree | repos whose gate supports it | repos whose gate and hooks assume the main checkout |
| an external code dir passed to the run command | nothing | landed code |

A run whose code came from the scratchpad is not reproducible from the notebook.
Move the code to its HOME, land it, and rerun.

## §5 Large bytes

| Predicate | Action |
|---|---|
| file is generated, large, or binary | write under an ignored path; record its digest in the run's artifacts |
| a record needs the bytes | the store's blob mechanism, not VCS |
| the snapshot refuses a file for size | move it under an ignored path; do not raise the size cap for it |

## §6 Identifiers

| Class | Rule |
|---|---|
| records-store ids | minted by the store; never supply or rename one |
| ids you mint (tickets, jobs, runners, params, models) | `{type}{YYMM}-{semantic-slug}` with a hyphen |
| private labels (`T-12`, `A1`, `P3`) | forbidden in any landed artifact |
| edition names | state the design choice; never `new`, `v2`, `simple`, `main`, `gpu` |
