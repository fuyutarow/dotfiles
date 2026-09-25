# Forge verification ledger — wiring-mise-tasks F3 artifact (2026-07-17)

Adversarial-verification findings ledger demanded by gate F3 (`forging-skills`). Append on
reforge, never overwrite. The fire/no-fire trigger set lives in SKILL.md (MUST-NOT-FIRE section)
and is desk-checked after every description edit.

## Harvest fleet (AUDIT phase)

8 read-only sonnet lenses, 2026-07-17: 4 language recipe extractors (writing-julia/-rust/-python
+running-python-tools/-typescript vs the 5-repo corpus), 1 sibling mapper (compiling-latex), 1
mise CLI facts prober, 1 drift-matrix runner, 1 qoed `mise:refs` gate dissection. 543k tokens,
104 tool calls, 0 errors. Full returns: session workflow `wf_2d6aa6dd-edd` journal.

Load-bearing harvest facts (each grounded in a command + output in the journal):

- `mise tasks ls --json`: `aliases` is ALWAYS an array; `source` is the defining file's absolute
  path; empty dir → `[]` exit 0; JSON is pure on stdout (upgrade nag → stderr).
- Bare `mise <token>` shadows BUILT-INS: `mise fmt` = mise's own config formatter (observed),
  `i`/`t`/`r` are built-in aliases → the contract is phrased over `mise run`.
- qoed `mise:refs` (regex approach) has a CONFIRMED bug: bare hyphenated headers
  (`[tasks.link-dots]`) are invisible to its header regex while its reference regex DOES match
  hyphens — false-positive stale refs; also misses file-based tasks, depends=, alt configs.
  → resolution-based gate ruled strictly more robust for token-existence checking.

## Drift baseline — 2026-07-17 (gate output, machine-verified)

| Repo | HARD | SOFT misses | Grammar |
|---|---|---|---|
| beateater | 0 fail | — (12/12, sole full compliance) | clean |
| correo | 0 fail | setup i l t u c | clean |
| qoed | 0 fail | l t c | clean (73 tasks, colon-only) |
| xoria | **1 fail: up** (the forging incident) | u | clean |
| dotfiles | **3 fail: fmt:check test check** | setup i l t u c | 5 hyphen names: link-dots check-tools cc:install-mcp lint:skills-index wsl:fix-gitexe |

Gate proof-of-fire (build day): xoria → FAIL exit 1; beateater → exit 0; empty dir → FAIL
"not adopted"; waiver smoke (waive up/test) → WAIVE + exit 0; family closure (waive setup →
alias i auto-waived) → verified on templates/rust. All 5 templates pass the gate in a clean
temp dir (rust: 2 deliberate WAIVEs, 0 warns).

## Provenance — this skill's own claims

| Content class | Grade | Notes |
|---|---|---|
| mise CLI behavior (JSON schema, built-in shadowing, empty-dir, exit codes) | probe-verified | live probes 2026-07-17, mise 2026.7.5; re-verify on reforge — mise moves fast |
| Verb contract + grammar rules 1–5 | corpus-observed + constructed | grammar text existed as hand-copied header comments in 5 mise.tomls (qoed's the fullest); HARD/SOFT tiering, family-closure waivers, and `mise run`-phrasing are THIS skill's operationalization — engineered, not measured |
| Recipe cells | graded per-cell in references/recipes.md §0 | skill-endorsed / corpus-observed / probe-verified / synthesized (`bun update` is the only synthesized cell) |
| Rulings (lint tiers, blocked test, clippy location, biome config home) | ruling (constructed) | house decisions over documented conflicts — sources named in recipes.md |
| Sibling-cut claims about compiling-latex | author-confirmed | its SKILL.md read in harvest; reciprocal pointer landed in its Core Decisions (same commit) |

## Verification fleet (VERIFY phase) — findings

Fleet: 6 read-only sonnet lenses (self-contradiction, architecture/one-home, sibling cuts vs the
live collection's actual text, bloat/operationality, trigger desk-check over name+description
only, gate-script attack with live exploit attempts), per `forging-skills`
references/verifying.md §2. 27 findings (1 BLOCKER · 8 MAJOR · 18 MINOR); every fix applied solo
by the editor and re-proven red→green. Full lens returns: session workflow `wf_53d1c19d-d8f`.

| Severity | Lens | Finding | Resolution |
|---|---|---|---|
| BLOCKER | gate-attack | Waiver grep matched `# mise-contract: waive …` lines INSIDE triple-quoted run bodies — a run-body comment could spoof a HARD waiver (exploit reproduced) | awk pre-filter strips `'''`/`"""` blocks before the waiver scan; attack re-run → spoof blocked, check FAILs |
| MAJOR | gate-attack | `depends = ["task args"]`/array-form entries corrupted floor 3 into garbage warnings | jq normalization (`if type=="array" then .[0] else split(" ")[0]`); attack re-run clean |
| MAJOR | gate-attack | stderr swallowed → `mise trust` failures indistinguishable from broken toolchain | stderr captured + surfaced with a `mise trust` hint |
| MAJOR | self-contradiction | polyglot template's `lint` was the exact "silent starter" its own ruling forbids | written deferral added (description + comment citing recipes §1) |
| MAJOR | self-contradiction | recipes §6 rule 1 (depends-only for ALL verbs) contradicted qoed itself and the template | rule amended to fmt/lint aggregates + primary-language bodies for setup/test/up (corpus-true) |
| MAJOR | self-contradiction | rumdl cells shipped in templates with no graded home | §4b Markdown cell added (corpus-observed ×4) |
| MAJOR | architecture | Scope banner banned flag facts from the body while the matrix carries them | banner rewritten: matrix = declared synced seam (agrees in substance, no byte-diff) |
| MAJOR | architecture + bloat | check-aggregation rule argued in BOTH SKILL.md grammar 3 and recipes §6.2; TeX check-wiring argued twice | both recipes passages demoted to pointers; unique facts (qoed 34-task aggregate) kept |
| MAJOR | sibling-cuts | writing-rust's project.md names xtask "the Rust-native pattern" for the same territory — unrecorded conflict | mise-vs-xtask RULING added to recipes §2 + reciprocal line landed in writing-rust project.md |
| MAJOR | trigger | bare "Rust" in a scaffold ask co-fires writing-rust; TeX cut's "latexmk" token risked co-fire on pure build crashes | description cuts rescoped: "language merely NAMED while scaffolding stays here"; "bare latexmk/chktex problem stays there alone"; co-fire order made explicit (FIRST) |
| MINOR ×5 | gate-attack | reasonless waive accepted; multi-token waive silently partial; typo'd waiver inert without notice; multi-repo run aborted on first ENV error; SSOT disclaimer too narrow | reason (` -- `) now REQUIRED + WARN; one-token-per-line documented; dead-waiver WARN added; per-repo ENV continue + exit 2 at end; disclaimer widened with seam note |
| MINOR ×4 | trigger | no MANDATORY clause; missing タスク追加 doublet; co-fire order implicit; >1024 API cap | MANDATORY + doublet added; order explicit; >1024 accepted (house norm, siblings 1489/1496) — desk-check re-run on the changed rows |
| MINOR ×5 | self-contradiction | template headers non-uniform (grammar restated in 2); rulings restated without citation (rust/ts); python setup description promised unimplemented `--locked`; `${CLAUDE_SKILL_DIR}` vs `~` divergence unexplained | headers standardized pointer-only; citations added; promise moved to a comment; divergence reason written into SKILL.md |
| MINOR ×4 | bloat | LAW-adjacent restatements (views ×2, gate history); Japanese quotes outside declared seams | duplicates cut; gate history compressed to a do-not-rewrite constraint; Language section now declares the quoted-corpus seam |
| no_change | bloat | lineage/immunization sentence flagged as narrative | KEPT — the header formula (components f+g, verbatim immunization) is mandated by forging-skills execution-models Step B; verifier lacked that bar |
| no_change | bloat | frontmatter Workflow-native/Cuts "duplicate" the body | KEPT — frontmatter must be self-contained for match-time routing (accepted pattern) |
| deferred | sibling-cuts | operating-the-harness carries no reciprocal pointer to this skill's `check` seam | DEFERRED, owner named: land a one-line pointer in operating-the-harness §2 on its next reforge (seam is named from this side; its file is untouched this commit) |

## 2026-08-30 — C-B's second half was never enforced, and could not have been

The rule always read "over 10 non-blank lines, **or any branching/parsing logic**". Only the count
was ever checked. Worse, `taskBodies` split sections on the first line-initial `[`, so any `'''`
body containing a shell test — `[ -z "$files" ] && …` — terminated its own section, its closing
`'''` was never found, and the body left the gate's view entirely.

Proven with a fixture: a 14-line body whose third line began with `[` produced no over-length
FAIL, and the runtime census reported one task where two existed. **The gate was blind to exactly
the class of body the rule exists to catch.**

Fixed together: a multi-line-string-aware parser, and control-flow detection at command position
with comments and quoted spans stripped first (a body that MENTIONS `if` in an echo string is not
branching — the mention-as-action failure this house has recorded three times). `&&` and `||` are
deliberately not tells; a fail-fast sequence is not logic.

Census across five repos went from 8 visible violations to **39**. Migration of 36 of them
followed in the same session; two in a repo with 82 files of another session's in-flight work
were deferred rather than merged into that tree.

### PROSE-DEBT waiver (`forging-skills` architecture.md §5)

This commit edits `SKILL.md`, so "touch it, clear it" applies. **Waived, dated 2026-08-30.**
The additions themselves land at zero: measured before and after, SKILL.md prose >120 chars stays
at 13 and no new oversize table cell survives. The residue is pre-existing — 13 in SKILL.md, 18 in
`references/recipes.md`, and a 9-line version header. Queue position: behind the recipes.md
rewrite, which is the larger half and wants its own pass.

## 2026-09-22 — grammar rule 6: `hook:<event>` (seam with wiring-repositories)

Trigger: the user asked how this skill connects to the git-hook rule forged in
`wiring-repositories` the same day. It did not: zero mentions of `hook:`, `pre-commit`, `:::`,
`--jobs` or `.githooks` here, templates without a commit gate, and `mise-contract.ts` warning on
`hook:pre-commit` as a hyphen violation.

One home per fact: the task NAME (grammar rule 6) and the three mise facts (recipes §8) are here;
the hook SHAPE stays in `wiring-repositories` HOOK-1, pointed at, not restated. `mise-contract.ts`
exempts exactly githooks(5) names after `hook:` (test added: `hook:pre-commit` and
`hook:post-merge` clean, `hook:my-thing` still warns; 14/14 pass). All five templates ship
`hook:pre-commit = ["fmt:check", "lint"]` and parse under mise. recipes §7's dotfiles line was
stale and is updated.

**PROSE-DEBT waiver (2026-09-22).** This seam edit adds one grammar rule. The existing WARNs (long
sentences, a 9-line version header) predate it and are untouched. Queue: the next reforge.

## 2026-09-23 — Cargo scope and polyglot task composition

**Source and ownership.** Rust construction survey, admitted in soks commit `e0c6dff`:
`urn:uuid:01a0ce18-54a8-7386-8e88-79633e144b34`, especially RCP-004/005/014/016/021/027/028.
`writing-rust` RG5 supplies package/feature/test-mode scope; this skill wires it into tasks.
`wiring-repositories` supplies the manager roots, including valid peer roots.

**Changes.** Rust template and matrix now explicitly select one workspace with default features.
Feature combinations, nested workspaces and simulators need their own declared leaves.
Removed the automatic all-features assumption and retained doctest coverage when choosing nextest.
Polyglot setup/test/update/format-check bodies now live in leaves under depends-only repository verbs.
Removed the runtime-pinning handoff that contradicted RUNTIME-DECLARED.

**Template status.** These are materialization fragments, not immediately runnable repositories.
The user of a template must select runtime pins, paths and supported scopes before verifying it.
The old Rust header's “mise unmanaged” wording was an invalid blanket exemption and is removed.

**F3 receipts.** Both templates parse as TOML and every task dependency names an existing task.
Local one-off check: materialized Rust and polyglot fixtures each passed mise-contract: 0 hard, 0 warn.
The ignored fixtures live under `.agent-state/skill-rust-20260923/fixtures/{rust,polyglot}/mise.toml`.
Each prepends `[tools]` to the corresponding template: rust `1.85.0`, bun `1.3.14`, plus Julia `1.12.0` for polyglot.
Command: `mise exec -- bun agents/skills/wiring-mise-tasks/scripts/mise-contract.ts <rust-fixture-dir> <polyglot-fixture-dir>`.
These fixtures are not checked-in CI regression coverage; versions are parser inputs, not tool recommendations.
No Rust/Julia build or toolchain install was performed.
Existing mise-contract suite: 14 tests pass, 0 fail, 39 assertions.
Edited-file Markdown and shared skill floor pass.
The four paired response probes are recorded in the writing-rust ledger; this is a qualitative comparison.

**PROSE-DEBT waiver, 2026-09-23.** Remaining: 14 long reference sentences and 11 body sentences.
Baseline was 18 / 13 plus a 9-line header; header debt is removed.
Queue: next full recipes/body reforge. No new checker or skill was added.

**Gate startup repair.** This commit's hook exposed Node shebangs in the oxlint/oxfmt/tsgo wrappers.
Plain `bunx` reached an unconfigured Node shim although this repository declares Bun.
The root mise tasks now use `bunx --bun` for those three Bun-compatible wrappers.
Their local version commands, lint and typecheck passed; no global runtime configuration was added.

## 2026-09-25 — `fmt:staged` (v2609.2.0)

Owner request, relayed by firedancer-agt_eraw: the commit gate should fix formatting in place, not
refuse on a lint check. Measured blocker: `hook:pre-commit = ["fmt:check", "lint"]` checked the
whole tree, so in firedancer any session's WIP refused every session's commit (4 blocks across ~20
sessions, 10–20 min each). The hook SHAPE rule is `wiring-repositories` HOOK-1c (its ledger §10).

New SOFT verb `fmt:staged`, body `scripts/fmt-staged.ts`: formats only the staged files, refuses a
file that also has unstaged hunks, re-adds exactly the changed files, and fails when a formatter
changes anything outside the staged set. It re-stages through `git add` in the hook's environment,
so `git commit -- <path>` (a temporary index) is honoured.

Receipts: `tests/fmt-staged.test.ts` 12 pass (in-place + re-stage; partial refusal untouched;
other sessions' unstaged and untracked files untouched; no-op; `--exclude`; formatter failure;
stray write; deletion; usage; three real commits through a hook incl. the temporary index).
`mise-contract.test.ts` updated for the new soft token (14 pass). Rust `--tool` pins `--edition`:
bare `rustfmt` 1.9.0 parses as 2015 (`async fn` → E0670). Templates: all five gained `fmt:staged`;
four gate on `["fmt:staged", "lint"]`, Julia on `["fmt:staged"]` because its starter `lint` reuses
the whole-tree `fmt:check`. skill-check WARN counts equal HEAD (SKILL.md 11, references 14).
