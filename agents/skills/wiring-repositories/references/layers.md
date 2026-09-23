# Layers — the per-layer catalogue and the dated facts

> **SOLE home** for four things. What file each layer is. Its owner's entry point. The
> global-vs-repo-local split. Every dated fact this skill leans on.
> **Staleness**: re-verify §2 and §7 whenever the global mise config or the global Claude
> settings change. Measured 2026-08-30 across 10 repos.

The SKILL.md body carries none of this. A version number or a path detail there is a bug.

## 1. What each layer IS, and who owns it after

| Layer | The actual artifact | Owner's entry point |
|---|---|---|
| git boundary | `.git/`, `.gitignore` | — (this skill; it is the frame, not a wire) |
| toolchain pins | `mise.toml` `[tools]` | `wiring-mise-tasks` |
| verb contract | `mise.toml` `[tasks]` + aliases | `wiring-mise-tasks` → its `templates/<lang>.mise.toml`, gate `scripts/mise-contract.ts` |
| language manifest | `Project.toml`+`Manifest.toml` / `pyproject.toml`+`uv.lock` / `Cargo.toml`+`Cargo.lock` / `package.json`+`bun.lock` | `writing-julia` / `writing-python` / `writing-rust` / `writing-bun-scripts` |
| agent harness | `.claude/settings.json`, `.claude/hooks/` | `operating-the-harness` |
| commit enforcement | `.githooks/pre-commit` + `core.hooksPath` | `wiring-repositories` (Git-hook shape) + `wiring-mise-tasks` (task) |
| semantic index | `.cocoindex_code/` | `driving-cocoindex` |
| research governance | the governance config + declared document scopes | `governing-research-documentation` |
| repo-local skills | `.claude/skills/` | `forging-skills` |

## 2. Global inheritance — what a new repo must NOT re-declare

Measured 2026-08-30. Re-declaring any of these creates a second arguing home that drifts.

| Surface | Already global | Consequence for a new repo |
|---|---|---|
| global mise `[tools]` | **none** (re-measured 2026-09-12; `[settings] idiomatic_version_file_enable_tools=[]` only) | Every managed runtime a repo invokes (`julia`, `node`, `bun`, `rust`, `uv`) **must** be declared in that repo's `mise.toml`. The `julia`/`node` majors measured global on 2026-08-30 were an INV-6 violation. dotfiles `test:mise-scope` §6 had failed on them since 2026-08-23. Removed 2026-09-12; firedancer, the one repo that leaned on them, now declares `julia = "1.12"` |
| global Claude PreToolUse | dispatch-contract, search-route, supervised-execution, goal-kernel; matchers `Agent\|Task\|Workflow`, `Grep\|Bash`, `Bash`, `*` | Every repo inherits all four. Repo-local carries only repo-specific rules |
| global lifecycle hooks | SessionStart / SessionEnd / PreCompact / Stop / PostToolUse, plus the statusline | Inherited; never re-registered per repo |
| `autoMode.environment` | scoped **by name** to one trusted repo | **Not** a template. A new repo inherits none of its entries |

**The exact-patch rule** (formerly "exception", when a global major sat above it). A repo may pin
an exact patch (`julia = "1.12.6"`) rather than a major (`"1.12"`). Do so when a lockfile or
`Manifest.toml` pins a resolution that patch drift would invalidate — a narrower constraint, not a
duplicate.

**Require the reason in a comment.** An exact pin with no stated reason cannot be told apart from
a copy-paste. It will never be relaxed.

## 3. Polyglot repos — declare each manifest's scope

Record `manager | manifest/root | governed packages | command cwd | lockfile | owner skill`.
Use a short table in the scaffold plan; no extra document is required.

| Actual layout | Decision | Verification |
|---|---|---|
| Independent component in a subtree | Keep its manifest there | Tasks select that root explicitly |
| Two managers govern graphs from the repository root | Root manifests may coexist | Inspect both membership declarations and both command scopes |
| Nested/excluded workspace | Name its separate build/test/release boundary | Run its own checks; parent success does not cover it |

Source location alone does not decide manifest placement; a root workspace can govern subdirectories.
Cargo membership, target paths and package selection belong to `writing-rust`.
Other language owners validate their own manifests.
`wiring-mise-tasks` turns the declared scopes into leaf tasks and repository aggregates.
Check each leaf from its declared cwd; pass-through manifest paths do not override every tool's config lookup.

Counterexample `[dated:2026-09-23]`:
[Tauri Cargo workspace](https://github.com/tauri-apps/tauri/blob/8265c982f0a38832ec80c57ac3a857f22a7ad66b/Cargo.toml)
coexists with a root
[pnpm workspace](https://github.com/tauri-apps/tauri/blob/8265c982f0a38832ec80c57ac3a857f22a7ad66b/pnpm-workspace.yaml).
Do not relocate either solely to enforce one language at root.

## 4. The ccc layer — what registration actually costs

`driving-cocoindex` owns registration and every daemon rule. Two consequences are recorded here
only because they bind the scaffold ORDER (SKILL.md S2 rows 4–5). Neither is stated on that side.

**The corpus policy and the index have opposite fates.** `settings.yml` decides what the index can
ever see, so it is scaffold and belongs in git. Everything else under `.cocoindex_code/` is a
per-clone daemon artifact. The pattern that separates them, measured in this house:

```gitignore
/.cocoindex_code/*
!/.cocoindex_code/settings.yml
```

A blanket `/.cocoindex_code/` loses the policy. One repo here does exactly that.

**A fresh clone is not searchable.** The index is local. The scaffold is not done for a new
contributor until they run the owner's registration themselves. Say so when handing a repo over.

**The exclude set is decided once, at registration.** Both governed repos exclude `**/.*`, so
`.claude/` is invisible to semantic search. Confirmed by control query: a string demonstrably
present in `.claude/settings.json` returns NO_MATCH through the search route. The house rule is
*empty output is NO_MATCH, never PASS*. So this turns a policy choice into a standing
false-absence. Decide the exclude set **before** registering.

Everything else about ccc is owned there and must be routed to, never restated. That includes
`ccc init`, indexing, freshness, query shapes, and the daemon's ownership and resource ceiling.

## 5. Accretion — what laid-but-inert looks like

The failure S1 prevents, measured in one repo on 2026-08-30:

| Observed | Why it is inert |
|---|---|
| `detect-stale-frontier.ts`, one commit of history | Registered in **no** matcher; called by **no** task. Its successor `detect-stale-frontline.ts` *is* registered — the predecessor was never removed |
| Files under `.claude/tools/` | Invoked by no task run-line and registered in no matcher |
| A 17 KB `.git-stage-list.txt` at repo root | Untracked, zero history, matched by the repo's own `/*.txt` ignore rule — on disk only |

**A detection caveat that matters.** The lexical search route does not descend into `.claude/`
(§4). An audit that searches for a filename will report *absence* for files that are registered.
So `scripts/wiring-check.ts` reads `settings.json` and `mise.toml` directly instead. It also
reads sibling source, because a shared helper is referenced by the files that import it.

## 6. Order of laying — the operational sequence

SKILL.md S2 gives the constraints. This sequence satisfies all five:

1. `git init`; write `.gitignore` **first**. Every later layer is measured against it.
2. `mise.toml`: `[tools]` pins, then the verb contract. Call `wiring-mise-tasks`.
3. Language manifests. Declare each manager's scope and invocation root (§3).
4. Install and lock. Run `setup` when adopted; otherwise validate its waiver and selected build/check entrypoint.
5. `.claude/`, only if a repo-specific rule exists that the global set does not cover (§2).
6. The pre-commit **task and its script**. Then, last, `git config core.hooksPath .githooks`.
7. `ccc` registration, after the exclude set is decided (§4). Per clone, not per repo.
8. Research governance, if multiple uncoordinated writers produce documents.

Steps 5–8 depend on their S1 questions. Apply steps 1–4 to each admitted language and respect a valid setup waiver.

## 7. Dated facts

| Fact | Value | Measured |
|---|---|---|
| Repos surveyed under the workspace | 10 git repos | 2026-08-30 |
| `core.hooksPath` discipline | set in every repo that has `.githooks/`; unset in every repo without | 2026-08-30 |
| Absolute-vs-relative `hooksPath` | one repo absolute (breaks on clone/worktree); the rest relative | 2026-08-30 |
| Repos with **no** `[tools]` section | one, running two toolchains off ambient PATH | 2026-08-30 |
| Repos excluding `**/.*` from the index | **all four checked** — a house-wide state, not a per-repo defect | 2026-08-30 |
| Scaffold generators on this machine | **none**. No cookiecutter, copier or Yeoman config; no generator among the dotfiles scripts. Bounded to depth 4 under `$HOME` | 2026-08-30 |
| The only generator-adjacent resource | `wiring-mise-tasks/templates/*.mise.toml`, five files | 2026-08-30 |
| Task-naming lineage | the three Julia repos cite each other in their own `mise.toml` headers. Convention propagates by citation, not by a generator | 2026-08-30 |
