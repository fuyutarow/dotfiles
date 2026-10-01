---
name: keeping-research-notebooks
description: >-
  Routes each artifact of a research notebook repo to its ONE home and ONE entry point,
  and gates when a model change may be measured. Use for 研究リポジトリ, ノートブック,
  置き場所, どこに置く, ディレクトリ構成 (新規リポ含む), 論文の置き場と図の出所, 一元的な入口, launcher dry-run, 単一コミッタ, agents committing
  to a shared checkout, run dir landing, edition / revision, conformance / acceptance
  rows, 系譜, 劣後, 登録漏れ, scratchpad 禁止. Cuts: store CLI → driving-polysearch;
  jj/git commands → driving-jujutsu / driving-git; task bodies → wiring-mise-tasks;
  repo layers → wiring-repositories; Julia → writing-julia; evidence meaning →
  validating-experimental-evidence; documents → governing-research-documentation.
  Workflow-native: home, acceptance and commit stay SOLO; retrieval may fan out.
  English skill; respond in the user's language.
---

# Keeping research notebooks — one home, one entry, one landing

> **Version**: v2610.2.0 (2026-10-01) — top-level layout (homes §0) and paper homes; incidents, sources and grades in `tests/forge-verification-ledger.md`.
> **Durability**: this file names no repo, package, branch or edition. Bindings are discovered per repo (§ Bindings).

```bash
for f in homes-and-layout launch-and-land editions; do test -f references/$f.md || echo MISSING $f; done; test -f tests/triggers.md || echo MISSING triggers; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language

English skill; respond in the user's language (default Japanese).
These tokens stay fixed inside Japanese prose.

| Token | Meaning |
|---|---|
| **HOME** | The one place an artifact kind may live. |
| **ENTRY** | The one command that admits an artifact to its HOME. |
| **GATE** | The repo's write gate: its declared paths decide admission, not the writer. |
| **RECORDS STORE** | The gated store of claims, runs, measurements, hypotheses and findings. |
| **EDITION / REVISION** | An independent model module / a numbered, digested change to one edition. |
| **PREDECESSOR ROW** | The best committed predecessor result per benchmark member, on the same contract. An acceptance guard, not a claim. |
| **COMMITTER** | The one actor that writes VCS in a shared checkout. |
| **LANDING** | A commit that takes named paths plus finished run dirs only. |
| **gate N1–N5** | This skill's gates. |

## THE LAW

> Every artifact has ONE HOME and ONE ENTRY, and the GATE decides admission, not the writer.
> Anything that exists only outside the GATE does not exist for the notebook. That covers
> scratchpad code, an agent's report, an uncommitted run dir, and a claim kept only in memory.
> A new REVISION below its PREDECESSOR ROW on the official path is not progress.
> Whether it is a regression claim is `validating-experimental-evidence` EV4.

## Bindings — discover, never assume

Read each binding from the repo before the first act. A missing binding is a finding; report it.

| Binding | Read it from | Command |
|---|---|---|
| Write gate and path classes | the gate config's `declared.*` keys | `polysearch doctor`; read `polysearch.json` |
| Commit verb | the repo's `commit` task | `mise tasks`; body per `wiring-mise-tasks` |
| Launch verb | the repo's single launcher task | `mise tasks`; then its `--dry-run` |
| Edition ledgers | catalog file, per-edition versions ledger, digest checker CLI | `rr about` where ccc is wired; else read the task list and the registry dir |
| Retention homes | gate config, records store, knowledge repo, memory index | `references/homes-and-layout.md` §1–§2 |

## Gates N1–N5

| Gate | Predicate (before acting) | Artifact | Deny |
|---|---|---|---|
| **N1 HOME** | Look up the kind in § Homes; a new top-level dir and the root follow homes §0. Code → inside a declared project path. Records → typed command only. Ruling or knowledge → that home's entry. Large bytes → an ignored path. | The path or record id, and the key or command that admits it. | Scratchpad code; `.agent-state`; `probes/`; a worktree where the gate assumes the main checkout; anything on homes §0's root-deny list. |
| **N2 RETRIEVE BEFORE CREATE** | Before a kernel, mechanism, record or benchmark, run a concept query over the repo index and the shared-primitive library. | The hit, or a ≥3-paraphrase battery line, pasted in the ticket. | Re-implementing a shared primitive; claiming absence from one query. |
| **N3 ONE LAUNCH** | Inputs are committed as-is. `--dry-run` runs first. The cause is a hypothesis with frozen predictions. | Dry-run JSON with the model slug and code revision resolved. | `modelCode:null` or an unresolved revision, even at exit 0; hand-assembled runner commands; uncommitted code. |
| **N4 ONE LANDING** | One COMMITTER per shared checkout. It commits named paths plus finished run dirs only, on a cadence (batch per event), after inspecting the selected diff. | Commit receipt plus the `bookmark list --all-remotes` line. | Any agent running jj/git writes; `-- <paths>` before flags; in-flight run dirs. |
| **N5 EDITION ACCEPTANCE** | REVISION by minimal diff unless the owner changed the frame. Registered in every registry the launcher resolves. Rows (a) official-path conformance, (b) predecessor row, (c) perf floor, (d) CPU==GPU, written before code. | Catalog line; `--worktree` ledger digest from the checker; green acceptance log. | Fixture-only conformance; overwriting a committed revision; reading numbers as progress before (a)–(d) are green. |

N3 and N4 detail: `references/launch-and-land.md`. N5 detail: `references/editions.md`.

## Homes — the LOOKUP

| Artifact kind | HOME | ENTRY | Semantics owner |
|---|---|---|---|
| claim, run, measurement, hypothesis, finding | RECORDS STORE | its typed commands; runs only through the launcher | `driving-polysearch`; meaning `validating-experimental-evidence` |
| library or model code | a package under `packages/`, as an EDITION REVISION | working-copy edit, landed by the COMMITTER | the language skill |
| shared device primitive | the shared-primitive library, additive only | new public name plus oracle test | language skill; device design `optimizing-julia-gpu-kernels` |
| experiment runner code | an apparatus record | the store's apparatus command | `driving-polysearch` |
| benchmark semantics, literature values | the benchmark package | schema-validated data plus its tests | `validating-experimental-evidence` |
| research document, report, plan | the document portfolio | DOC ADMISSION | `governing-research-documentation` |
| paper or slide source | `deliverables/papers/<dir>/`, `deliverables/slides/<dir>/` | working-copy edit, landed by the COMMITTER | dir name `compiling-latex`; argument `arguing-research-papers`; deck `designing-presentations` |
| number, figure or table in a paper | a run artifact, cited by run id | the paper's build reads it | home here; evidence anchor `arguing-research-papers` |
| ruling, owner feedback | memory; never a claim (a claim needs a record) | memory file plus index line | `operating-the-harness` |
| primary-source knowledge | the knowledge repo | that repo's distillation entry | `systematizing-knowledge` |
| task or work state | TASK-CONTINUATION if the repo declares a locus, else "no declared home" | `continuing-long-running-tasks` | there |
| large bytes | an ignored path inside the repo | write there; record its digest | — |
| none of the above | "no declared home" | say so in the hand-back | never invent a dir |

## Act → ENTRY

| Act | ENTRY | Precondition | Receipt |
|---|---|---|---|
| Decide or rule | memory line, or a records-store finding for a claim | N2 retrieve | path or record id |
| Write code | the working copy, inside a declared path | N1, N2 | `jj diff --stat` |
| Change a model | a REVISION of an existing edition | N5 | ledger digest plus catalog line |
| Run an experiment | launcher `--dry-run`, then the same command without it | N3 | resolved dry-run JSON; run id |
| Record a result | a records-store typed command | the run record exists | record id |
| Land | the commit task, run by the COMMITTER | N4 | commit receipt plus bookmark line |
| Finish an agent ticket | hand back the changed paths | no VCS write | the path list |

## MUST-NOT-FIRE

| Ask | Route |
|---|---|
| A repo with no write gate, no records store and no launcher, and none being adopted | `driving-jujutsu` or `driving-git` alone |
| Records-store flags, record schema, cause roles | `driving-polysearch` alone |
| A jj conflict, rebase or op-log recovery with no multi-writer question | `driving-jujutsu` alone |
| Write or rename the commit or launch task body | `wiring-mise-tasks` |
| What a measured number licenses: leak, footing, regression claim | `validating-experimental-evidence` |
| Which experiment to run next | `driving-bibifi-cycles` |
| Fix a bug inside a kernel | `implementing-and-debugging`, then the language skill |

The full fire/no-fire set is `tests/triggers.md`; desk-check it after any description edit.

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `driving-polysearch` | **PURPOSE:** the store's CLI and record model → there. WHERE an artifact goes and which ENTRY admits it → here. Its `run --exec` is the primitive a launcher wraps; where a launcher exists, use only the launcher. |
| `driving-jujutsu` | **PURPOSE:** jj commands → there. WHO commits WHAT, WHEN in a multi-writer notebook → here. |
| `driving-git` | **PURPOSE:** git commands and the git-only shared-checkout protocol → there. Notebook landing and the single COMMITTER → here. A repo whose gate validates one tree takes no worktree. |
| `wiring-mise-tasks` | **CARDINALITY:** the commit verb and any task's naming and body shape → there. Their use as the only ENTRY, and launcher preconditions → here. |
| `wiring-repositories` | **PURPOSE:** which layers a repo admits and their wiring order → there. The notebook class predicate and top-level layout (homes §0), and operating a wired notebook repo → here. |
| `writing-julia` | **BY ARTIFACT:** Julia module and package mechanics, and the workspace-root manifest mechanics (PK0 notebook row) → there. Where `packages/` sits (homes §0), EDITION/REVISION lifecycle and acceptance → here. |
| `validating-experimental-evidence` | **PURPOSE:** what a number means, and what the rows must assert about validity (EV0, EV2) → there. Where the record goes, and whether rows exist and are green before measuring → here. |
| `governing-research-documentation` | **PURPOSE:** documents, their retention, freezing and retirement → there. Typed records (negative results included), code and run artifacts → here. |
| `continuing-long-running-tasks` | Task state → there. Here only routes to it. |
| `orchestrating-agents` | Dispatch and resources → there. Here: an agent never writes VCS and hands back paths. |
| `driving-bibifi-cycles` | Which experiment next → there. |
| `compiling-latex` | **BY ARTIFACT:** a paper dir's name, TeX build and `latex:*` tasks → there. Where papers live in a notebook repo (homes §0) → here. |

## Execution model

| Stage | Mode | Why |
|---|---|---|
| N1 home choice, N5 revise-or-new, N4 commit | SOLO | One owner per HOME and per checkout. |
| N2 retrieval batteries | FAN-OUT, read-only | Independent queries; workers return hits. |
| Acceptance test runs | FAN-OUT under a resource envelope (`orchestrating-agents` P7) | Tests write logs and use compute; workers return logs and paths. |
| Landing a fan-out's output | SOLO, the COMMITTER | Workers hand back paths; they never write VCS. |

No harness → the same gates, serially.

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/homes-and-layout.md` | Top-level layout (§0), homes expanded (§1), binding discovery (§2), path classes (§3), scratchpad ban (§4), large bytes (§5), identifiers (§6) | N1; scaffolding a notebook repo; any "where does this go"; minting an id |
| `references/launch-and-land.md` | Launcher preconditions (§1), dry-run checks (§2), COMMITTER protocol (§3), pre-commit diff (§4), failure → recovery (§5) | N3, N4; any launch or commit failure |
| `references/editions.md` | Revise-or-new (§1), registration (§2), revision bump (§3), acceptance rows (§4), shared-primitive library (§5) | N5; any model code change |
| `tests/triggers.md` | Fire, near-miss no-fire, co-fire rows | Any description or cut edit |
| `tests/forge-verification-ledger.md` | Spec, sources, grades, calibration, incidents, checks, budget | Reforge or audit |
