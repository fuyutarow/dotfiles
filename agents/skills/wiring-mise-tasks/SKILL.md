---
name: wiring-mise-tasks
description: >-
  Wires per-language toolchains into the house-standard mise task graph — one muscle-memory verb
  contract for every repo (setup/i, fmt/f, fmt:check, lint/l, test/t, up/u, check/c = all-gates
  aggregate; tokens resolve via `mise run` / the `m` alias) with per-language template bodies
  (Julia Runic/Pkg, Rust cargo, Python uv/ruff, TypeScript bun/biome) and a machine gate
  (scripts/mise-contract.ts) proving the tokens resolve. MANDATORY — read before naming or adding
  any mise task. Use when creating or editing a mise.toml, adding/naming/renaming tasks
  (<domain>:<action>, colon-only, X + X:check pairs), scaffolding a new repo's task runner,
  auditing task drift across repos, or when `mise run X` / `m up` dies with "no task found" —
  mise タスク設計, タスク命名, タスク追加, mise.toml 作成, 新リポの雛形, タスクがない,
  ドリフト監査, タスク体系を揃える. Cuts: WHICH tool is right for language L → writing-<lang> (a
  language merely NAMED while scaffolding stays here); TeX task wiring → compiling-latex co-fires
  FIRST and owns the latex:* bodies, while a bare latexmk/chktex problem with no task-graph ask
  stays there alone; hook/settings enforcement → operating-the-harness; [tools] runtime pinning
  (mise use/install) → model-native. Workflow-native: one repo's mise.toml stays SOLO (zero
  agents); only multi-repo drift audits fan out one read-only gate-runner per repo. English
  skill; respond in the user's language (default Japanese).
---

# Wiring mise tasks — one verb contract, per-language bodies

> **Version**: v2607.1.0 (2026-07-17)
> **Scope**: the cross-repo mise task GRAPH — verb contract, naming grammar, templates, the
> resolution gate. Per-language tool CHOICE is cited from its owner skill, never re-argued here;
> tool VERSIONS, provenance grades, and rulings live ONLY in the dated `references/recipes.md` —
> the body matrix is a synced working summary (agrees in substance; re-sync on reforge, do not
> diff for byte-identity).
> **Build order (atomic).** SKILL.md, the reference, 5 templates, the gate, and the ledger ship
> in ONE commit. Verify:
> `test -f references/recipes.md || echo MISSING recipes; for t in julia rust python typescript polyglot; do test -f templates/$t.mise.toml || echo MISSING $t; done; test -f scripts/mise-contract.ts || echo MISSING gate; test -f tests/forge-verification-ledger.md || echo MISSING ledger`

## Language & stable tokens

English skill; respond in the user's language (default Japanese). Stable tokens, fixed even
inside Japanese prose: **verb contract**, **token**, **HARD / SOFT**, **resolution**, **gate**,
**waiver**, **view / SSOT**, **筋肉記憶**. Two deliberate Japanese seams — do not "fix" either:
template task descriptions/comments (they ship into repos whose `mise tasks` output is read in
Japanese), and corpus artifacts quoted as evidence (mise.toml header comments stay verbatim).

## THE LAW

> The verb contract is repo-invariant; only the bodies vary by language. Every muscle-memory
> token resolves via `mise run <token>` in every repo — an unresolved token is drift, and drift
> is caught by the gate (`scripts/mise-contract.ts`), never by memory. Grammar and contract are
> argued ONLY in this file; templates and repo mise.tomls are VIEWS — change the rule here and in
> the gate, then propagate, never the reverse.

Forging incident (2026-07-17): `m up` (= `mise run up`) died in xoria — the one workspace repo
with no `up` task. The convention existed only as hand-copied header comments across five
mise.tomls (「命名規則(qoed/correoと同一)」…), with no SSOT and no gate — exactly the drift this
skill now closes.

## The verb contract

| Token(s) | Tier | Meaning |
|---|---|---|
| `fmt` / `f` | HARD / HARD | format in place; >1 language → depends-only aggregate over `fmt:<lang>` |
| `fmt:check` | HARD | non-mutating format verification (the CI form of fmt) |
| `lint` / `l` | HARD / SOFT | static analysis, report-only (fixes belong to fmt) |
| `test` / `t` | HARD / SOFT | the test surface; blocked-with-pointer is legal (body may `exit 2` naming focused `test:*` — the TOKEN must still resolve) |
| `up` / `u` | HARD / SOFT | dependency update — the lockfile-moving verb |
| `check` / `c` | HARD / SOFT | ALL-GATES AGGREGATE: depends-only, never a body; CI = `mise run check` |
| `setup` / `i` | SOFT / SOFT | instantiate deps/toolchain (Rust legitimately waives: cargo resolves at build) |

- **Resolution** = the token is a LOCAL task name or alias (`mise tasks ls --json`, source under
  the repo root — global `~/.config/mise` tasks do not count).
- **Always invoke via `mise run`** (user alias `m`). NEVER bare `mise <token>`: `fmt`, `i`, `t`,
  `r` shadow mise BUILT-INS — observed: bare `mise fmt` runs mise's own mise.toml formatter, not
  the repo task.
- **Waiver** = a visible hole: `# mise-contract: waive <token> -- <reason>` in mise.toml. Waiving
  a verb waives its standard alias (one decision per family). Silent absence is the failure mode;
  a waiver is a recorded decision.

## The grammar

1. Separator is `:` ONLY — `<domain>:<action>`. A hyphen never replaces the separator
   (`link-dots` → `link:dots`); hyphens inside a segment are flagged by the gate — prefer one word.
2. do/verify pairs are `X` + `X:check` (`fmt`/`fmt:check`, `up`/`up:check`, `solver:render`/`solver:check`).
3. `check` is the aggregate CI gate. Every gate task you adopt lands in `check.depends` **in the
   same edit** that creates it — a gate outside `check` is decoration.
4. Single clean words are RESERVED for the contract verbs and cross-cutting hygiene gates
   (`banned`, `records`, `claims`, `taxonomy`). Two or more siblings on one object → namespace
   them (`lint:*`, `slides:*`, `papers:*`).
5. Polyglot: repo-level verbs are depends-only; language bodies live in `<verb>:<lang>` subtasks
   (`references/recipes.md` §6, qoed exemplar).

## Per-language bodies — the matrix

Verified snapshot + provenance + conflict rulings: `references/recipes.md` — read it BEFORE
deviating from a cell; the matrix here is the working summary.

| Verb | Julia | Rust | Python (uv) | TS (bun) |
|---|---|---|---|---|
| setup | `Pkg.instantiate(); Pkg.precompile()` | *(waived)* | `uv sync` | `bun install --frozen-lockfile` |
| fmt | `-m Runic --inplace .` | `cargo fmt --all` | `uv run ruff format` | `bunx biome format --write .` |
| fmt:check | `-m Runic --check .` | `cargo fmt --all -- --check` | `uv run ruff format --check` | `bunx biome format .` |
| lint | tiered: fmt:check reuse → Aqua+ExplicitImports+JET | `cargo clippy --all-targets --all-features -- -D warnings` | `uv run ruff check` | `bunx biome lint .` |
| test | `Pkg.test()` | `cargo test` | `uv run pytest` | `bun test` |
| up | `Pkg.update()` | cargo-edit: `cargo upgrade --incompatible allow` + `cargo update` | `uv lock --upgrade && uv sync` | `bun update` |

TeX: leaf tasks (`latex:*`) are owned by `compiling-latex`; the repo-level `check` aggregates
`latex:check`. That skill's template instantiates THIS grammar for TeX.

## Two rules the task graph cannot be sound without (2026-07-25, measured)

| Rule | Artifact | Origin |
|---|---|---|
| **RUNTIME-DECLARED** — every runtime a task body invokes (`bun`/`node`/`uv`/`julia`/`cargo`/`deno`) is declared and pinned in `[tools]`. | `mise-contract.ts` prints `OK tools: <x> declared`; an invoked-but-undeclared runtime FAILs. | Census 2026-07-25, 3 repos: two had no `[tools]` section at all, the third declared one runtime of four. Every one of them invoked runtimes from task bodies regardless. |
| **BODY-IS-DECLARATION** — a task body is a launcher, not a program. Over 10 non-blank lines, **or any branching/parsing logic**, moves to a script file. | `mise-contract.ts` FAILs on BOTH halves (2026-08-30). Control flow = `if`/`for`/`while`/`until`/`case`/`[` test/`test` at command position. Comments and quoted spans are stripped first. `&&`/`||` are not tells. | `cc:install-mcp` was a 52-line body that pruned nothing for weeks, invisibly. A body in TOML **cannot be imported or tested**. |

> `実測` 2026-08-30. Two defects, one cause. Only the LENGTH half was ever enforced. And the
> section parser split on the first line-initial `[`. So a `'''` body holding `[ -z "$x" ]` ended
> its own section. The closing `'''` was never found, and **the body vanished from the gate**.
> Proven with a 14-line fixture: no over-length FAIL, and the runtime census counted one
> task instead of two. The gate was blind to exactly the bodies most likely to violate it. With
> the parser fixed and control flow detected, five repos went from **8 violations to 39**.

The first rule exists because the two halves are not separable: a body that says `bun x` is only
correct if `[tools]` says `bun`. Pinning was previously routed out of this skill as model-native
trivia, and the result was a task graph resting on whatever each machine happened to have.

The second is `writing-bun-scripts`' NO-NEW-BASH at the mise boundary. That skill owns the rule
(bash only as a thin shim); this owns where the boundary falls in `mise.toml`. Once a runtime is
declared under the first rule, moving a body to `scripts/*.ts` costs nothing — mise provisions it.

## Templates and the gate

- **Scaffold**: copy the nearest `templates/<lang>.mise.toml` (or `polyglot`), adapt bodies, keep
  verbs + aliases.
- **Verify — after EVERY mise.toml edit**:
  `bun ${CLAUDE_SKILL_DIR}/scripts/mise-contract.ts [repo-dir ...]`
  Exit 0 = contract holds (WARNs allowed) · 1 = HARD violation · 2 = environment error. The gate
  is resolution-based by design — do NOT rewrite it as mise.toml regex parsing (rejected
  precedent; evidence in the ledger).
- **Wire per repo**: every template carries `[tasks."mise:contract"]`, hardcoding
  `~/.claude/skills/...` (not `${CLAUDE_SKILL_DIR}`, which exists only inside a live session —
  `mise run` must work without it). It stays OUT of `check.depends` by default (a machine without
  the skills deployment would break CI); wire it in where deployment is guaranteed.
- **Prove the gate fires** after any gate edit: run it against a repo known to miss a token and
  watch it FAIL (xoria pre-fix was the forge's proof case). A gate never seen red is decoration.

## Execution model — solo; fleets only for multi-repo audits

The modal invocation — writing or editing ONE repo's mise.toml — is SOLO, zero agents (spawn
overhead exceeds the work). A drift audit over ≥3 repos fans out ONE read-only gate-runner per
repo. Evidence is CITATION-RELAY: a compliance verdict must carry the gate's verbatim output
lines + exit code — an agent's bare PASS is zero evidence. No harness → the same passes, serial.
Durable operating guidance from a frontier model (Fable 5, 2026-07), encoding a production
failure observed the day of forging; if a constraint here feels unnecessary, that feeling is the
failure mode — follow the map.

## MUST-NOT-FIRE — and the fire/no-fire set

FIRES:

| Ask | Why |
|---|---|
| 「xoria に up タスク足して。`m up` が no task up found になる」 | the forging incident shape |
| 「新しいリポに mise.toml 置いて。Rust プロジェクト」 | scaffold — copy `templates/rust.mise.toml` |
| 「タスク名 `fmt-md` と `fmt:md` どっち？」 | grammar rule 1 |
| "add a test task to this repo's task runner" | verb contract, no "mise" keyword needed |
| 「全リポで `mise run f` が効くか監査して」 | multi-repo audit — the fan-out case |
| 「このプロジェクトのタスク体系を qoed と揃えたい」 | contract adoption, no headline keyword |

Co-fire:

| Ask | Order |
|---|---|
| 「papers リポに mise タスク組んで」 | `compiling-latex` FIRST (TeX bodies, `latex:*` template); this skill for the repo-level verbs |
| 「Julia の新リポ、lint どこまで入れる？」 | `writing-julia` (JG2/JG3 substance) + this skill (the two-tier wiring, recipes §1) |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| 「latexmk がエラーで落ちる」 | `compiling-latex` — TeX build internals |
| 「clippy の warning 直して」 | `writing-rust` / `implementing-and-debugging` — the code, not the graph |
| 「hook で `mise run check` を強制したい」 | `operating-the-harness` — enforcement machinery (this skill only names the task) |
| 「mise で node 20 に固定したい」 — a pin with NO task invoking it | model-native. But a runtime any task body INVOKES is this skill's business: see RUNTIME-DECLARED below (2026-07-25 reversal — this row previously routed all of `[tools]` away, and the census found 3/3 repos invoking undeclared runtimes) |
| 「この justfile にタスク足して」(他家リポ) | no skill — house repos have no justfile; other projects' justfiles are their own convention |

## Routing — sibling cuts (typed)

| Sibling | Cut |
|---|---|
| `writing-julia` / `writing-rust` / `writing-python` / `writing-typescript` | PURPOSE — "which tool/flags are CORRECT for language L?" → theirs; "which verb, what name, where in the graph?" → here. Matrix cells cite them; conflicts are recorded as rulings in `references/recipes.md`, never silently overridden. |
| `compiling-latex` | PURPOSE — TeX toolchain + `latex:*` leaf tasks → there (its `assets/mise-latex.toml`); cross-language verb contract + grammar → here. Reciprocal pointer lives in its Core Decisions. Both sides agree in SUBSTANCE; do not diff for byte-identity. |
| `operating-the-harness` | PURPOSE — hooks/settings/CLAUDE.md enforcement → there; the task graph a hook invokes → here. `mise run check` as a verification loop is the seam: the loop's EXISTENCE is their doctrine, its SHAPE is this contract. |
| `driving-cocoindex` | no overlap — ccc state facts are theirs entirely. |
| `wiring-repositories` | CARDINALITY — the names carry the cut: this wires ONE artifact, that wires the SET. This task graph, its verbs, its `templates/*.mise.toml` → here, INCLUDING 「新リポに mise.toml 置いて」. Which layers a repo admits, in what order, and whether the joint holds → there; it calls this skill for the mise layer and ships no competing template. Agree in SUBSTANCE; do not diff. |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/recipes.md` | per-cell provenance grades, the lint-tier / test-blocked / clippy-location / biome-config rulings, polyglot composition, known corpus deviations, dated tool versions | before deviating from a matrix cell; before an audit; any "why this body?" question |
| `templates/*.mise.toml` | copy-out scaffolds (julia, rust, python, typescript, polyglot) — views of this contract | scaffolding a repo |
| `scripts/mise-contract.ts` | the resolution gate — run, never read into context | after every mise.toml edit; per-repo in audits |
| `tests/forge-verification-ledger.md` | F3 artifact: fleet findings, drift baseline 2026-07-17, provenance of this skill's own claims | reforging; auditing this skill |
