---
name: wiring-repositories
description: >-
  Wires a repository and keeps that wiring honest — decides WHICH layers it admits, lays them in
  the order whose violations are SILENT, and audits the joint for the repo's whole life.
  Use for 新しいリポジトリ, プロジェクトを立ち上げ, リポジトリ初期構築, 雛形, scaffold a project,
  bootstrap a repo — and equally for 配線監査, 健全性チェック, health check, repo audit,
  不備がないか, 発火しない hook, 呼ばれない tool, 版が固定されていない, "clone したら動かない".
  Owns the SET, the ORDER, the JOINT, and the GIT-HOOK shape (a hook is a thin wrapper; its body
  lives in a `hook:*` mise task) across git/.gitignore, mise [tools], the language manifest,
  .claude/, .githooks + core.hooksPath, the ccc index, and research-governance config — never a
  layer's contents. LAW: a layer enters only with the failure it prevents named in the commit.
  Cuts — CARDINALITY vs wiring-mise-tasks: ONE artifact (the task graph, its verbs, its
  templates) is theirs; the SET and the ORDER are here. PURPOSE vs operating-the-harness: Claude
  Code hooks are theirs, GIT hooks are here; standing .claude/ up is here, its contents theirs.
  PURPOSE vs driving-cocoindex: `ccc init` is theirs. DECISIVE vs writing-julia/python/rust/
  bun-scripts and the built-in init: one manifest, or a CLAUDE.md alone, is theirs.
  Workflow-native: admission, order and cuts stay SOLO. English skill; respond in the user's
  language (default Japanese).
---

# Scaffolding repositories — the SET, the ORDER, and the JOINT

> **Version**: v2608.1.0 (2026-08-30) — initial forge. Receipts, calibration, and the F3
> desk-check: `tests/forge-verification-ledger.md`. **Durability**: no tool version or
> per-language recipe is load-bearing here; dated facts live in `references/layers.md`.

```bash
test -f references/layers.md || echo MISSING layers.md; test -f scripts/wiring-check.ts || echo MISSING wiring-check.ts; test -f tests/forge-verification-ledger.md || echo MISSING ledger; test -d templates && echo STALE-DIR templates || echo OK
```

The negative check is load-bearing. `wiring-mise-tasks` ships the five `*.mise.toml` templates.
A `templates/` dir here would be a second arguing home, not a convenience.

## Language

English skill; respond in the user's language (default Japanese). These stable tokens stay fixed
even inside Japanese prose. **LAW**, **gate** (S1–S4), **layer**, **SET / ORDER / JOINT**.
**silent ordering**, **admission**, **accretion**, **fire / no-fire**, **owner skill**.

## THE LAW

> A repo is scaffolded when **a fresh clone reaches green through the house verb**. Not when the
> files exist. This skill owns three things. The **SET** — which layers this repo admits. The
> **ORDER** — whose violations are silent. The **JOINT** — that the layers agree. **It owns no
> layer.** Every wire is laid by its owner skill and governed there afterwards. And the default
> is the **smallest wiring whose absence you can name a failure for**.

A rule about a layer's *contents* appearing in this file is a bug.

**Why the default runs that way.** The human failure this corrects is *under*-wiring — ship the
code, never wire the checks. A capable model fails the other way. Handed "make a new project" it
emits mise.toml, `.claude/`, hooks, CI and a docs site for a three-file script. Measured in this
house: one repo carries a hook registered in no matcher, plus tools invoked by nothing. So
**MUST-NOT-FIRE and S1 ADMISSION are first-class here.** Generosity is the failure mode, not
thrift. The argument and its receipts are in the ledger.

## The four gates — S1 / S2 / S3 / S4

| Gate | Inverts (the error) | ARTIFACT |
|---|---|---|
| **S1 ADMISSION** | generous scaffolding — a layer laid because a template had it | The failure each admitted layer prevents **in this repo**, named in the commit. `scripts/wiring-check.ts --audit` lists laid-but-inert layers |
| **S2 ORDER** | discovering the order by hitting the failure — impossible, because each failure is SILENT | The five silent orderings below, each machine-detected by `scripts/wiring-check.ts` |
| **S3 GREEN-FROM-CLONE** | "the files are there" as done | `mise run check` green **in a fresh clone**, plus `wiring-mise-tasks`' own `mise-contract.ts`. Their verb contract is **not restated here**; this gate only requires it |
| **S4 HANDOFF** | this skill becoming a second home for a layer it laid | Every admitted layer names its owner skill. Later edits fire the owner, not this |

## S2 — the five silent orderings

**Every violation below produces no error.** So the order is written down, not discovered. The
feedback that would teach it does not exist. Each row was measured in this house.

| # | Lay this first | …before this | What breaks, silently | Measured |
|---|---|---|---|---|
| 1 | `[tools]` version pins | any task body that runs a toolchain | tasks resolve against ambient PATH — green here, different elsewhere | one repo has **no `[tools]` at all**; Julia and bun run off PATH |
| 2 | the task **and the script it runs** | `git config core.hooksPath` | git finds the hook, the hook calls a task, the task runs a missing file — **commits pass ungated** | `.githooks/pre-commit` landed 2.5 h before the script it invokes |
| 3 | a **relative** `core.hooksPath` | any clone or worktree | an absolute path silently stops applying outside the original checkout | one repo's `core.hooksPath` is absolute |
| 4 | the `.gitignore` and ccc `exclude_patterns` decision | `ccc init` | default `**/.*` excludes every dotfile dir. **`.claude/` becomes unsearchable**, and search answers NO_MATCH, which reads as *absent* | all four repos checked; confirmed by control query |
| 5 | tracking `settings.yml`, ignoring the index | telling anyone the repo is searchable | the corpus policy is scaffold, the index is a per-clone artifact — a blanket ignore loses the first | one repo versions the policy; another ignores the whole dir |

Rows 4 and 5 are one defect in two directions. **An empty search result and an unindexed repo are
indistinguishable.** Both read as "this does not exist." Where the dominant waste is re-deriving
known work, that is the most expensive silent failure here.

## The git-hook shape — owned here, because nobody else owns it

`operating-the-harness` owns **Claude Code** hooks: events, matchers, `settings.json`. Its hooks
reference does not mention git hooks at all. So the git-hook layer's shape had no owner, while
four repos each independently wrote the same rule into a comment at the top of their own hook.
It is stated once, here.

| # | Rule | Why, and what it costs when broken |
|---|---|---|
| **HOOK-1** | A git hook is a **thin wrapper**. The body lives in a `hook:<name>` mise task | A hook carrying logic is absent from `mise tasks`, unrunnable without git, and untestable. **Exempt**: a hook that consumes git's positional arguments cannot be run standalone, so the rule's own reason fails and it does not apply |
| **HOOK-2** | The commit filter covers **every language the repo declares** | A filter is an allowlist. A language added later is silently uncovered, and staged files reach the commit without ever meeting the formatter |

Measured 2026-08-30: three of four repos follow HOOK-1; the fourth had copied the third's shape
in 2026-07 and stayed there after the original moved on. Convention propagates by citation here,
so it also drifts by citation.

**Waivers.** A finding is answered, not silenced, in the form this house already uses:

```toml
# wiring-check: waive ORDER-4 -- why this repo decided otherwise. 解消条件: what lifts it
```

A reason is required; without one the line is inert. That is the whole mechanism — S1 says name
the decision, and a waiver is where a repo names it.

## S1 — the layer table

Admit a layer only when its question answers YES **for this repo**. "A template had it" is not an
answer.

| Layer | Admit when | Owner skill after |
|---|---|---|
| `git` + `.gitignore` | always — it is the frame every later layer is measured against | — |
| mise `[tools]` pins | the repo runs any tool whose version changes its output | `wiring-mise-tasks` |
| mise `[tasks]` verb contract | always — the contract is repo-invariant | `wiring-mise-tasks` |
| language manifest | the repo holds that language's source | `writing-julia` / `writing-python` / `writing-rust` / `writing-bun-scripts` |
| `.claude/settings.json` | a repo-specific rule exists that the **global** hooks do not already enforce | `operating-the-harness` |
| `.githooks/` + hooksPath | a check must run at commit time, not only on demand | **this skill** owns the hook's SHAPE (below); `wiring-mise-tasks` owns the task it calls |
| `.cocoindex_code/` | unknown-name search will happen, and the corpus is too big to read | `driving-cocoindex` |
| research-governance config | **multiple uncoordinated writers** produce documents here | `governing-research-documentation` |
| repo-local `.claude/skills/` | a procedure repeats across sessions **in this repo only** | `forging-skills` |

**The global-inheritance rule.** Global settings already wire four PreToolUse hooks for every
repo, plus the session-lifecycle set. The global mise config already pins the shared language
majors. A repo-local file re-declaring any of them is not belt-and-braces. It is a second arguing
home, and it will drift. Repo-local carries **only** what is repo-specific. Which majors are
global, and the exact-patch exception, are dated facts — `references/layers.md` §2.

## The pipeline

1. **CLASSIFY** — repo, or scratch directory. One that will never be cloned, shared, or written
   by a second session takes `git init` and nothing else. Say so and stop.
2. **ADMIT (S1)** — walk the layer table. For each YES, write the failure it prevents. That list
   is the scaffold plan, and it goes in the commit message.
3. **LAY (S2)** — in the order above, calling each layer's owner skill for its contents. This
   skill writes no task body, no hook body, no manifest, no settings block.
4. **VERIFY (S3)** — `bun scripts/wiring-check.ts` for the joint. Then the owners' own gates:
   `mise run check` and `mise-contract.ts`. **Then clone to a temp dir and run them again.** That
   second run is the gate; the first only proves it works where it was built.
5. **HAND OFF (S4)** — record the owner per layer. Later edits fire the owner skill.

## Execution model

The modal invocation — scaffolding ONE repo — is **SOLO, zero agents**. The layers are few and
the order is fixed, so spawn overhead exceeds the work. **Admission, order, and the sibling cuts
always stay SOLO.** A scaffold assembled from shards is the accretion this skill prevents. Fan
out only for a multi-repo drift audit (≥3 repos): one read-only `wiring-check.ts --audit`
runner per repo, merged by the caller. No harness → the same pipeline, serially.

## MUST-NOT-FIRE — and the fire/no-fire set

Over-firing is this skill's own first-class liability. Ceremony on a scratch directory is this
skill failing its own S1.

FIRES:

| Ask | Why here |
|---|---|
| 「新しいリポジトリ立ち上げたいんだけど、一式そろえて」 | core territory — the SET and the ORDER |
| "set up a new repo for this project, Julia plus a Rust harness" | polyglot admission and order; manifests route to their owners |
| 「この repo、hook が効いてない気がする。配線見て」 | S2 rows 2–3, machine-detectable |
| 「qoed に同じ配線を入れたい」 (existing repo, wiring named by comparison) | S1 audit — which layers are missing, which accreted |
| "why does semantic search never find anything in .claude/?" | S2 row 4 — the ordering, owned here even though `ccc init` is not |
| 「使ってない hook とか tool が溜まってる。棚卸しして」 | S1 ADMISSION run backwards |
| "I cloned this repo and nothing works" | S3 — green-from-clone is the definition of done |

MUST NOT fire (with route):

| Ask | Route |
|---|---|
| 「mise.toml に task 足して」 / renaming a verb | `wiring-mise-tasks` ALONE — one artifact, not the set |
| 「新リポに mise.toml 置いて。Rust プロジェクト」 (only the task runner named) | `wiring-mise-tasks` ALONE — it owns this ask and ships the template |
| 「hook が発火しない」 with `.claude/` already wired | `operating-the-harness` — matcher and event mechanics |
| "make this repo searchable" (wiring already settled) | `driving-cocoindex` ALONE — registration is theirs |
| `uv init` / `cargo new` / `bun init` for one package | that language's own skill — one manifest is theirs |
| "write a CLAUDE.md for this codebase" | the built-in `init` — one file, not a wiring set |
| a scratch dir for one throwaway script | no skill — `git init` if even that, and stop |
| 「この SKILL.md を直して」 | `forging-skills` — skill craft, not repo wiring |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `wiring-mise-tasks` | **CARDINALITY** — "Is the ask about ONE wiring artifact, or about which artifacts this repo gets and in what order?" One → theirs. The SET and the ORDER → here. It already claims 新リポの雛形 for the mise layer and **keeps it**. This skill calls it, ships no competing template, and writes no task body. Seam: agrees in substance; do not diff for byte-identity |
| `operating-the-harness` | **PURPOSE, on two seams.** *Hooks*: theirs are Claude Code's (events, matchers, `settings.json`); **git** hooks are HOOK-1/HOOK-2 above, here. *`.claude/`*: standing it up and the inheritance rule → here; its contents and rule scoping → theirs, **MANDATORY co-fire once content is written** |
| `driving-cocoindex` | **PURPOSE** — "Is there already a `cd`-able directory?" Registration, indexing, freshness, query shapes, and every daemon resource rule → theirs, **never restated**. Whether this repo admits an index, and the two orderings around it, → here |
| `writing-julia` / `writing-python` / `writing-rust` / `writing-bun-scripts` / `running-python-tools` | **DECISIVE by artifact** — a language's manifest, lockfile and idiom → theirs; each already owns its own `init`. Which languages this repo declares, and how several coexist without a root manifest that lies about the layout, → here |
| `governing-research-documentation` | **CARDINALITY** — the governance config is ONE admissible layer here. Its schema, document lifecycle, authority and retirement → theirs |
| `forging-skills` | **PURPOSE** — a repo-local `.claude/skills/` is a layer this skill may admit; the craft of any SKILL.md → theirs |
| the built-in `init` | **DECISIVE by cardinality** — it produces exactly one file. One file → it; a wiring set → here. This skill may invoke it for that layer |
| `compiling-latex` / `wrangler` | **DECISIVE** — a per-technology setup is theirs. This skill names the layer and calls them |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/layers.md` | Per-layer detail: the file each layer is, its owner's entry point, global-vs-repo-local, the exact-patch exception, the polyglot-root rule, the ccc cost, and dated facts | laying any layer; any "which version / which file" question |
| `scripts/wiring-check.ts` | The deterministic floor: five silent orderings plus laid-but-inert detection. Run it, never read it into context | S2 and S3; every audit of an existing repo |
| `tests/forge-verification-ledger.md` | Provenance grades, the calibration inversion, measured receipts, the F3 desk-check, proof-of-fire, and the F4 budget answer | reforging; auditing this skill; disputing any measured claim |
