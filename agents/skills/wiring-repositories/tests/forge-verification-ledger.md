# wiring-repositories — forge verification ledger

> F3 artifact. Provenance, calibration, the measured incidents SKILL.md cites, the fire/no-fire
> desk-check, and the proof-of-fire record. Narrative lives here; the manual carries only rules.
> Forged 2026-08-30.

## 1. Source class and provenance grades

Source class: **TACIT / ELICITED** (`forging-skills/references/distilling.md` §1) — no artifact
described the house scaffold; the source was ten existing repos plus the live session. Harvest ran
as seven read-only agents, one per surface; design, cuts, and description were solo.

| Claim in SKILL.md | Grade | Receipt |
|---|---|---|
| No skill owns language-agnostic new-repo scaffolding | **third-party, battery-backed** | 8-query EN/JA battery over 60 readable `*/SKILL.md`. Hits: `scaffold` 3 (forging-skills = "scaffold theater", prompting-llms = prompt scaffolding, wiring-mise-tasks = the mise layer), `bootstrap` 2 (operating-the-harness = `/init` for CLAUDE.md, writing-bun-scripts = POSIX shim class). Every hit incidental except wiring-mise-tasks |
| `wiring-mise-tasks` claims 新リポの雛形 for the mise layer and keeps it | **author-confirmed** | Its own description; its FIRES row 「新しいリポに mise.toml 置いて。Rust プロジェクト」; five `templates/*.mise.toml` on disk |
| `operating-the-harness` claims no scaffolding | **author-confirmed (negative)** | The words *scaffold* / *new repo* / *from scratch* appear nowhere in its 313 lines; §1 defers CLAUDE.md bootstrap to `/init`; §5 item 7 is phrased as an audit question. **Inferred from absence — see §5 residual** |
| `driving-cocoindex` scope starts at a `cd`-able directory | **author-confirmed** | Its PROJECT-REGISTER recipe opens `cd <repo>`; its scope line is "Operate `ccc`" |
| Hook bound 2.5 h before its script existed | **measured** | agentic-RnD `git log --reverse`: `.githooks/pre-commit` at commit #26 16:20; `scripts/pre-commit.ts` at #34 18:51 |
| A repo runs three toolchains with no `[tools]` | **measured** | firedancer `mise.toml`, 130 lines, no `[tools]`; reproduced by `wiring-check.ts` ORDER-1 |
| `core.hooksPath` absolute in one repo | **measured** | `git -C firedancer config --get core.hooksPath` → absolute; reproduced by ORDER-3 |
| `**/.*` makes `.claude/` unsearchable | **measured, two ways** | Present in all four checked repos' `settings.yml`. Control query: a string demonstrably in `.claude/settings.json` returns NO_MATCH through the search route |
| Laid-but-inert wiring accretes | **measured** | Hand survey named `detect-stale-frontier.ts` (one commit, registered in no matcher, called by no task). `wiring-check.ts --audit` independently returns the same file |
| Global settings/mise already cover every repo | **measured** | `~/.claude/settings.json`: 4 PreToolUse hooks, matchers `Agent\|Task\|Workflow`, `Grep\|Bash`, `Bash`, `*`. `~/.config/mise/config.toml`: julia + node majors only |
| No scaffold generator exists on this machine | **measured, bounded** | No cookiecutter/copier/Yeoman config; none of the 9 dotfiles scripts creates a repo. Bounded to depth 4 under `$HOME`, node_modules excluded |
| "the smallest wiring whose absence you can name" | **skill-supplied** | The house's own doctrine (SPEC §14 row 16 in the governed repo: 「一日で機構を14個追加した」) generalized into an admission gate. Not any source's category |
| The five orderings are *silent* | **skill-supplied, mechanism-checked** | Each verified to produce no error: git is silent on a hook calling a missing task; mise is silent on ambient resolution; ccc answers NO_MATCH, not an error |

## 2. Calibration inversion (`distilling.md` §4)

|  | Source's audience (the human) | This skill's agent consumer |
|---|---|---|
| dominant error | **Under**-wiring: ship code, never wire checks; the hook nobody installed | **INVERSE — over-wiring.** Handed "make a new project" a capable model emits mise.toml + `.claude/` + hooks + CI + a docs site for a three-file script, because a template had them |
| corrective bias | "set up your tooling properly" | "**lay nothing you cannot name a failure for**" |
| what to make prominent | a completeness checklist | **MUST-NOT-FIRE and S1 ADMISSION first-class**; the scratch-directory row is the first pipeline step, not a footnote |

Evidence the inverse is real in this house, not assumed: 3 inert wiring files survive in one repo
today, one of them a superseded predecessor whose successor is registered — nobody retired it.
The house's own specification files the same failure against itself under ADVANCE NON-COMPLIANCE.

A dual guard is NOT carried. Under-firing here is cheap (the user asks again, or a sibling skill
fires for its own layer); over-firing produces wiring that never retires. Asymmetric cost →
one-sided guard. Revisit if a repo is ever observed shipping *without* wiring it needed.

## 3. Proof of fire — the floor was red before it was green

`architecture.md` §5 requires the gate be seen red. It was, five times, and each red exposed a
defect **in the check itself**. Recorded because the same mistakes are the ones a maintainer will
re-introduce:

| # | Symptom | Defect | Fix |
|---|---|---|---|
| 1 | firedancer reported `core.hooksPath ... does not exist` alongside the absolute-path finding | `join(root, absPath)` concatenates instead of replacing | `resolve(root, hooksPath)` |
| 2 | every `lib.ts` reported INERT (25 files in one repo) | Haystack was `settings.json` + `mise.toml` only; a shared helper is referenced by the siblings that import it | Haystack includes sibling source under `.claude/hooks`, `.claude/tools`, `scripts`, `.githooks`. **25 → 2**, and the survivor matches the hand survey exactly |
| 3 | firedancer FATAL `EISDIR` | `readdir` returns subdirectories; `readIf` read them | `statSync(...).isFile()` guard |
| 4 | qoed reported `mise run f` as a missing task, ×3 | Aliases are call sites; the task map held only names | Parse `alias = …` into the map. Also deduped findings |
| 5 | firedancer reported `.cocoindex_code/` un-ignored | Its `.gitignore` uses `/.cocoindex_code/*` + `!…/settings.yml` — a **better** pattern the regex missed | ORDER-5 rewritten around `git ls-files`: the corpus policy must be TRACKED, the index must not |

Defect 5 changed a rule, not just a regex: versioning `settings.yml` while ignoring the index is
now the stated correct state, and agentic-RnD — which blanket-ignores the directory — fails it.

**Second round, same day**: running against a *fourth* repo (the dotfiles repo) exposed four more,
all false positives, all in the direction that trains a reader to ignore the check.

| # | Symptom | Defect | Fix |
|---|---|---|---|
| 6 | `${HOME}/…/link-dots.sh` reported missing though it exists | `pathTokens` expanded `{{config_root}}` but not `$HOME`/`${HOME}` | Expand both; DROP any token still holding `$` or `{` rather than report it |
| 7 | A filename named only in a task's `description` reported as a broken link | The whole task body fed path detection | Parse `run` separately from `description`; only `run` is a call site |
| 8 | Every task after the first `'''` shell body vanished from the parse | A run body's `[ -z "$files" ] && …` read as a TOML section header — **the parse truncated silently** | Track multi-line string state. This one produced no wrong output, it produced *missing* output — the worst shape |
| 9 | `mise run f` inside `echo "… run 'mise run f' manually"` reported as a call to a missing task | **A MENTION READ AS AN ACTION** | Strip comments and quoted spans before matching call sites |

Defect 9 is worth naming precisely: it is the same failure the governed repo files against itself
three separate times under 「言及を行為と誤認」. A checker written *by* someone who had just read
that record reproduced it on first contact with a new repo. The lesson recorded here is not "be
careful" — it is that any check scanning shell or prose for an invocation must strip strings and
comments first, and that this is cheap enough to have no excuse.

After both rounds, all four repos report only true findings.

**Third round** — adding HOOK-1/HOOK-2 and running against a fifth surface:

| # | Symptom | Defect | Fix |
|---|---|---|---|
| 10 | HOOK-1's positional-argument exemption never fired on a hook branching on `$3` | The test ran on the quote-STRIPPED body, and `[ "$3" = "1" ]` hides its positional inside quotes — stripping erased the exemption's own evidence | Test positionals on the comment-stripped raw body; strip quotes only for call-site detection |

**Where the rule stops.** HOOK-1 exempts a hook that reads git's positional arguments. This is
not an escape hatch: the rule's stated reason is "runnable standalone as a task", and a body
branching on `$1`/`$3` cannot be, because those values exist only because git supplied them.
Narrowing a rule at its actual limit beats reporting a defect whose repair would be worse than
the finding. Two repos' `post-checkout` hooks land in this exemption and are correct as written.

## 7. Ownership correction — git hooks were misattributed

The first draft of the layer table gave the commit-enforcement layer to `operating-the-harness`.
**That was wrong, and it was checked rather than assumed**: that skill's hooks reference covers
Claude Code hook events, matchers, and `settings.json`, and never mentions git hooks. Four repos
had each written the thin-wrapper rule into a comment at the top of their own hook file, in their
own words — the signature of a rule everyone follows and nobody owns. It is now stated once in
SKILL.md as HOOK-1/HOOK-2, and the routing row names the seam explicitly.

## 8. First field use — qoed, 2026-08-30

The check was wired into a fifth repo (`lint:wiring`, in its `check` aggregate) at the client's
request. Findings and disposition:

| Finding | Disposition |
|---|---|
| HOOK-1 on `pre-commit` — logic in the hook, no `hook:pre-commit` task | **Fixed.** Hook reduced to a thin shim; the body moved to a task, verified runnable standalone |
| HOOK-1 on `post-checkout` / `post-merge` | **Exempt** — both read git's positional arguments (see above) |
| HOOK-2 — commit filter omits `.ts` though `package.json` declares it | **Waived with a reason.** The repo has no `fmt:ts` task at all, so adding `ts` to the filter would format nothing. Resolution condition recorded: add `fmt:ts`, or declare TS out of scope |
| ORDER-4 — index excludes every dotfile dir | **Waived with a reason.** House-wide across all repos checked; not a single repo's call. Resolution condition: a house ruling |

The waiver mechanism was added for this, in the form the house already uses for `mise-contract`
(`# wiring-check: waive <TAG> -- <reason>`), reason required. It exists so that "we decided
against it" and "we never decided" stop looking identical — which is S1's whole subject.

**House-wide result at forge time** (`--audit`, four repos): ORDER-4 fires on **all four**. Every
governed repo in this house has made its own `.claude/` permanently unsearchable. That is a
standing finding for the owner of the ccc layer, not a per-repo defect, and it is why ORDER-4
names the decision rather than prescribing an exclude set.

## 4. F3 — fire / no-fire desk-check

Protocol: read ONLY `name:` + `description:`, answer fire / no-fire / co-fire. Run 2026-08-30
against the shipped description; re-run after any description edit.

| # | Query (as a user would type it) | Expected | Result |
|---|---|---|---|
| F1 | 「新しいリポジトリ立ち上げたいんだけど、一式そろえて」 | FIRE | ✓ |
| F2 | "set up a new repo — Julia at the root plus a Rust harness under harness/" | FIRE (co-fire writing-julia, writing-rust for manifests) | ✓ |
| F3 | 「qoed にも同じ配線入れたい。何が足りてない?」 (no headline keyword; situation only) | FIRE — S1 audit | ✓ |
| F4 | "why does semantic search never find anything under .claude/?" | FIRE (S2 row 4); driving-cocoindex co-fires for the index itself | ✓ |
| F5 | 「使ってない hook とか tool が溜まってる、棚卸しして」 | FIRE — INERT audit | ✓ |
| F6 | "I cloned this and nothing works" | FIRE — S3 | ✓ |
| N1 | 「mise.toml に lint:jl task 足して」 | NO-FIRE → wiring-mise-tasks | ✓ |
| N2 | 「新リポに mise.toml 置いて。Rust プロジェクト」 | NO-FIRE → wiring-mise-tasks **alone** — the nearest miss on the board; it owns this ask and ships the template | ✓ |
| N3 | 「PreToolUse の matcher が効かない」 | NO-FIRE → operating-the-harness | ✓ |
| N4 | "make this repo searchable" (repo already wired) | NO-FIRE → driving-cocoindex | ✓ |
| N5 | `uv init` for a one-off package | NO-FIRE → writing-python | ✓ |
| N6 | "write a CLAUDE.md for this codebase" | NO-FIRE → built-in `init` | ✓ |
| N7 | 「スクラッチ用に git init だけしたい」 | NO-FIRE → no skill (pipeline step 1 says so if it does fire) | ✓ |
| C1 | 「repo 立ち上げて、検索も効くようにして」 | CO-FIRE, this first (order + exclude decision), driving-cocoindex for `ccc init` | ✓ |

N2 is the deliberate near-miss: both descriptions carry 新リポ tokens. Resolution is the
CARDINALITY cut, stated in **both** — this skill's description names wiring-mise-tasks, and the
row above records that the incumbent keeps the ask.

## 5b. Rename — `scaffolding-repositories` → `wiring-repositories` (2026-08-30, same day)

Renamed before the first commit, on the client's challenge that the name had drifted from the
mental model. It had, and the session's own tally shows it: **0 repos scaffolded, 10 audited, 1
repaired, 1 cross-repo sweep built.** `scaffolding` names one moment — a repo's birth — while the
skill owns the SET, the ORDER, the JOINT and the git-hook shape, which bind for the repo's whole
life. Half the skill was invisible in its own name.

Cause, recorded because it is reusable: the name was taken from the requester's opening word
*before* the harvest narrowed the void, and was never re-derived afterwards. `architecture.md` §7
names the adjacent anti-pattern (skill-name-first design); this is its milder form — name-first
**survival**, where the map is written correctly and the name is simply not revisited.

`wiring-repositories` also makes the CARDINALITY cut legible from the names alone:
`wiring-mise-tasks` wires ONE artifact, `wiring-repositories` wires the SET. The floor script
and the waiver token moved with it (`wiring-check.ts`, `# wiring-check: waive`). Ordinary prose
uses of "scaffold" were kept — the act is still in scope; only the name was too narrow.

## 5. Residuals — what is NOT established

- **`.claude/`-from-zero ownership is inferred, not quoted.** No sibling says "this is not mine."
  The inference rests on `operating-the-harness` never using the words *scaffold* / *new repo* /
  *from scratch* and deferring CLAUDE.md bootstrap to `/init`. If that skill later claims the act,
  this skill's PURPOSE cut is the row to change.
- **Reciprocal pointers: one of three landed.** `wiring-mise-tasks` carries the CARDINALITY row
  (added 2026-08-30), which resolves the only measured near-miss, N2. `operating-the-harness` and
  `driving-cocoindex` do **not** yet name this skill; those cuts are one-sided.
  `architecture.md` §2 wants both sides. Queued.
- **Sibling references were not read in full** — only each `SKILL.md` plus reference indexes.
- **The `--audit` haystack is textual.** A tool invoked through a computed path or a generated
  string reads as inert. It is a floor, not a call graph.
- **PROSE-DEBT: clear.** `skill-check.ts` returns 0 WARNs across SKILL.md and `references/`
  (2026-08-30). F1 EXIT satisfied without a waiver.

## 6. F4 STANDING — what this admission costs

At forge time the collection's floor was **already red**: 56,664 chars charged against a declared
ceiling of 56,582 (`agents/skills-listing-budget.json`), i.e. 82 over **before** this skill.
Two descriptions also sit at or past the observed truncation window (~1520–1570): one at 1669,
one at 1515 — meaning their tail-positioned language directives may already be silently dropped.
That is a live defect independent of this admission and is reported to the owner rather than
quietly absorbed here.

The ceiling was raised in the same commit that adds this skill, with the reason recorded in
`skills-listing-budget.json` `raises[]`. The alternative — retiring a sibling to make room — was
rejected because no sibling was found to be doing this skill's job badly; the ceiling had simply
never been re-measured since it was set at 60 skills.
