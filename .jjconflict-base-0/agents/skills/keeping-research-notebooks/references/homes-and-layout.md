# Homes and layout — gate N1 detail

> Scope: where each artifact kind lives, how to read a repo's own bindings, and the identifier scheme.
> Record operation is `driving-polysearch`'s. Layer wiring is `wiring-repositories`'.

## §0 Top-level layout — the house layout of a notebook repo

| Class predicate (the ONE definition; siblings cite this row) | Class |
|---|---|
| the repo holds, or is being scaffolded to adopt, a records store (`polysearch.json`) | notebook |
| otherwise | plain: the language owner's default layout; this § does not apply |

In a notebook, a research project is a set of member packages plus its papers; it is not a dir of its own.
All members share one resolution. A project gets `envs/<slug>/` only when it needs a resolution the shared workspace cannot hold.
The tables below are the layout for a NEW notebook repo.
In an existing repo, the gate config's declared paths (§2) list what exists; the root predicate below is never outranked.

| Path | HOME of | Create it when | Contents owner |
|---|---|---|---|
| repo root | tool, VCS and harness config files only; no source, no manifest | at scaffold | `wiring-repositories` |
| `packages/` | language packages; a Julia workspace root is `packages/Project.toml` (no `name`) plus `packages/Manifest.toml` | at scaffold | `writing-julia` PK0 (notebook row) |
| `packages/<Name>.jl/` | one package: `Project.toml`, `src/`, `test/` | its first module | `writing-julia` |
| `envs/<slug>/` | an execution env with its own lock, for a resolution the workspace cannot share | the first such env | `writing-julia` PK0 notebook row |
| `deliverables/papers/<dir>/` | one paper's source and build dir | the first paper | dir name: `compiling-latex`; argument: `arguing-research-papers` |
| `deliverables/slides/<dir>/` | one deck's source | the first deck | dir name: `compiling-latex`; deck: `designing-presentations` |
| records-store root | records and run dirs (tracked; landed by N4) | at scaffold, after VCS init (`polysearch init --help`; no skill documents init yet) | records: `driving-polysearch` |
| document portfolio root | governed research documents | the first admitted document | `governing-research-documentation` |
| `data/` (ignored) | large bytes (§5) | the first large file | — |
| archive path | frozen retired material (§1 row) | the first retirement | — |

| Predicate | Action |
|---|---|
| a `Project.toml`, `Manifest.toml`, `src/`, `test/`, `scripts/` or `_research/` is planned at the repo root (the ONE root-deny list) | refuse; the target is `packages/` or `packages/<Name>.jl/`. A gate config that declares one of them is a finding for the owner |
| a top-level dir in the table above gets its first artifact | the owner adds it to the gate config's declared paths in the same landing |
| a dir is declared but holds nothing | do not declare it yet; an empty dir does not survive a clone, so the gate reports it absent there |
| `Pkg.generate` would write to the repo root | generate at `packages/<Name>.jl/` instead (`writing-julia` PK2 notebook row) |
| a DrWatson project is proposed | refuse; the records store is the experiment layer (`writing-julia` setup.md §3.4) |
| a recorded run selects a Julia env | `--project=packages`, never a member path: `polysearch run --reproduce` restores a workspace root only from the repo root's or the named dir's tracked files |

## §1 Homes, expanded

| Kind | HOME | ENTRY | Deny | Receipt |
|---|---|---|---|---|
| claim, measurement, hypothesis, finding | RECORDS STORE | the store's typed record command | a markdown note, a report, a memory line | record id |
| run | RECORDS STORE run record plus its run dir | the launcher only (§ N3) | a hand-run `run --exec`; a run dir written by hand | run id; run record file |
| route tried, negative numbers, discarded paths | a finding per iteration | typed finding command | the agent's report alone | record id |
| library or model code | a package under `packages/` (§0) | working-copy edit; COMMITTER lands it | scratchpad; `probes/`; an external code dir | `jj diff --stat` |
| model change | a REVISION of an edition | `references/editions.md` §3 | a new edition for a fix; an overwrite | ledger digest |
| shared device primitive | the shared-primitive library | new public name plus oracle test | a copy inside an edition | test log |
| experiment runner | an apparatus record | the store's apparatus command | a runner file under packages; scratchpad | apparatus id |
| launch inputs (params, resource manifest) | the paths the launcher reads | committed as-is | an uncommitted edit | commit id |
| benchmark semantics, contracts, literature values | the benchmark package | schema-validated data plus tests | numbers in a runner; in-house metrics | schema test log |
| ruling, owner feedback | memory; never a claim | file plus one index line | a TODO in code; a claim kept only in memory | memory path |
| primary-source knowledge | the knowledge repo | its distillation entry | a summary in the notebook | unit id |
| task state | TASK-CONTINUATION where the repo declares a locus; else "no declared home" | `continuing-long-running-tasks` | `.agent-state`; scratchpad notes; an invented `tasks/` | record locus, or the stated gap |
| research document, report, plan | the document portfolio | `governing-research-documentation` DOC ADMISSION | a loose markdown file | admission record |
| paper or slide source | `deliverables/papers/<dir>/`, `deliverables/slides/<dir>/` (§0) | working-copy edit; COMMITTER lands it | a paper at the repo root; a built PDF outside the paper's build dir | `jj diff --stat` |
| a number, figure or table in a paper | a run artifact in the RECORDS STORE, cited by run id; versioned with its run dir, so §5 does not apply | the paper's build reads the run's artifact | a figure saved by hand into the paper dir; a number typed with no run id | run id beside the figure source |
| frozen retired material | the archive path | write once | edits after freeze | — |
| large bytes (serialized models, caches, datasets) | an ignored path inside the repo | write there; record its digest | committing them | digest |

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
| Edition registries | catalog, versions ledger, model registry, checker | `rr about` on "edition catalog", "code digest checker" where ccc is wired; else the task list and registry dir | a registry has no checker |
| Rulings | memory index | read the memory index | a ruling sits only in a report |
| Records store root | the gate config's protocol directory | `polysearch doctor` | no store and none being adopted: this skill does not apply (a repo being scaffolded to adopt one takes §0) |
| Knowledge repo | the repo's knowledge-distillation hook or memory index | read `.claude/settings.json` hooks; the memory index | a primary source read with no distillation entry |

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
| path outside the repo (scratchpad included) | not gated | none for code or claims | the gate cannot see it, so N1 denies it for code and claims |

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
| file is generated, large, or binary, and no paper build reads it | write under an ignored path; record its digest in the run's artifacts |
| the snapshot refuses a file for size | prefer ignoring the path; raise the size cap only for a file that must be versioned |

## §6 Identifiers

| Class | Rule |
|---|---|
| records-store ids | minted by the store; never supply or rename one |
| ids you mint (tickets, jobs, runners, params) | `{type}{YYMM}-{semantic-slug}` with a hyphen |
| private labels (`T-12`, `A1`, `P3`) | forbidden in any landed artifact |
| edition names | state the design choice; obey the banned-name list in the repo's model registry header |
