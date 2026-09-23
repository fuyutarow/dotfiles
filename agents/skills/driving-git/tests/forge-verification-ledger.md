# driving-git — forge verification ledger

> F3 artifact. Provenance grades, the calibration inversion, proof-of-fire, the fire/no-fire
> desk-check, residuals, and the F4 cost. Narrative lives here; SKILL.md carries only rules.
> Forged 2026-09-21.

## 0. Function map and existence gate

```
working tree + a stated intent --NAME THE JOB--> the verb row --DO under G1–G3--> commit / branch / push / recovered sha --G4--> a RECEIPT in the turn
```

Owned artifact: the RECEIPT (an observable closing each git operation) and the deny-list. Stop
condition: the receipt is pasted. Handoffs: wiring layers → wiring-repositories; harness
permission/worktree mechanics → operating-the-harness; the change itself → implementing-and-debugging
/ refactoring-code.

Existence battery: the ccc concept route was UNAVAILABLE — `repo-search index` timed out at 600 s
(daemon at its 4 GB memory cap), so the required ≥3-paraphrase semantic battery could not run.
Substitute, recorded as such: `repo-search exhaustive` over `agents/skills` for
`git (commit|rebase|push|stash|worktree|reflog|bisect|switch|restore|checkout)` — 25 hits, all
incidental: refactoring-code (stash-not-`checkout .`, 4 lines), operating-the-harness (permission
examples, worktree isolation for subagents), commanding-research-fleets ledger (one pathspec-commit
line), driving-antigravity (worktree as containment), driving-cocoindex operations.md line 61 (a
raw `git checkout -- .gitignore` — a deny-list idiom in a sibling; reported, not edited). No skill
owns the transition above. **Re-run the semantic battery when the index is healthy** (residual §5).

## 1. Source classes and provenance grades

| Source | Class (`distilling.md` §1) | Engine |
|---|---|---|
| firedancer session interview (2026-09-21, 7 incidents, 5 proposed rules) | **Live SESSION** — highest grade | captured verbatim while the transcript existed |
| git 2.55.0 man pages (local) + RelNotes 2.50–2.55 (raw `.adoc`) | Official DOCS | fetched at build; every URL in `references/config.md` §5 |
| Evans / GitButler / Chacon / git-absorb / filter-repo / conventionalcommits / trunkbaseddevelopment | practitioner corpus | one read-only harvest agent; graded per claim |
| Claude Code docs (worktrees, permissions, settings-reference) | Official DOCS | one read-only harvest agent |
| house state (`git/gitconfig`, `zsh/aliases.zsh` guard, settings, hooks) | measured | read in full |

| Claim in SKILL.md / references | Grade | Receipt |
|---|---|---|
| A regex pathspec swept 40 `.jls` (3.9 GB, largest 882 MB) into commit `49dcc4f37`; `push -q` hung ~90 min; 7.8 GB `tmp_pack_*` | **live-session** | interview §2a |
| `commit --amend --only -- <paths>` re-added files a peer had `rm --cached` | **live-session + author-confirmed** | interview §2b; git-commit(1) 2.55: "taking the updated working tree contents of the paths specified" |
| Peer's paused `rebase -i` detached HEAD; a launched job loaded the old runner | **live-session** | interview §2c |
| `rebase --continue` refused with zero unmerged paths — dirty tracked file | **live-session** | interview §2d |
| `gc --prune=now --aggressive` during live commits → fsck phantoms | **live-session + author-confirmed** | interview §2f; git-gc(1): "increases the risk of corruption if another process is writing" |
| Zombie `git push` processes after killed shells | **live-session** | interview §2g |
| `switch`/`restore` no longer experimental | **author-confirmed** | RelNotes 2.51 verbatim; `man git-switch` 2.55 has no EXPERIMENTAL text |
| `checkout` not deprecated by git | **author-confirmed (negative)** | `man git-checkout` 2.55 |
| worktree BUGS: multiple checkouts of a superproject not recommended | **author-confirmed** | `man git-worktree` 2.55 |
| bare `--force-with-lease` still experimental; `--force-if-includes` closes the background-fetch gap for the BARE form and is a no-op with `<ref>:<expect>` | **author-confirmed** — the first draft stated the opposite; caught by the fact-refutation lens (§3b) | `man git-push` 2.55 |
| `merge-tree --write-tree` in-memory; MISTAKES TO AVOID | **author-confirmed** | `man git-merge-tree` 2.55 |
| `git history` experimental, no hooks, updates descendants | **author-confirmed** | `git help history` 2.55, read directly |
| `git replay`, `sparse-checkout`, `repo`, `last-modified`, `format-rev`, `backfill` experimental | **author-confirmed** | man pages / `git help -a` 2.55 |
| reflog expiry 90/30 days; `gc.auto` 6700; `gc.cruftPacks` true | **author-confirmed** | `man git-reflog`, `man git-gc` 2.55 |
| `diff.algorithm` default myers | **author-confirmed** | `man git-diff` 2.55 |
| git(1) "Reset, restore and revert" three-way split | **author-confirmed** | read directly 2026-09-21 |
| `bisect run` exit-code contract (125 = skip) | **author-confirmed** | `man git-bisect` 2.55 |
| `log -L` gained pickaxe/`--name-only` in 2.55; fsmonitor daemon on Linux in 2.55 | **author-confirmed** | RelNotes 2.55 raw |
| `git maintenance` default strategy "geometric" since 2.54 | **author-confirmed, wording drift noted** | RelNotes 2.54; man page still says incremental |
| `filter-branch` warning text | **author-confirmed (via filter-repo README quoting git)** | README |
| Modern-defaults config set | **third-party** (Evans fetched; Chacon via gist notes) | `config.md` §2 names who |
| GitHub 100 MB file limit | **third-party** (docs.github.com page search-summarized, not fetched) | needs a direct fetch on reforge |
| Claude Code `Bash(git push *)` does not match `git -C . push` etc. | **author-confirmed** | permissions doc quoted by the harvest agent |
| House `gitconfig`: 15 modern keys absent; 7 legacy-alias findings | **measured** | `git-check lint git/gitconfig` 2026-09-21 |
| "history is enumerated, never globbed"; "a silent push is a failed push"; blast-radius tiers; S1–S8 | **skill-supplied** | this skill's operationalization of the incidents; not any source's category |
| The four gates and the deny-list as a floor | **constructed** | engineered from the incidents + docs; "engineered, not measured" |
| Storage measurement distinguishes local refs, reflogs, packs, worktree, and LFS; packed size is not blob content size | **author-confirmed [paraphrase]** | 2026-09-23: git-count-objects, git-rev-list EXAMPLES, git-cat-file CAVEATS; URLs in `config.md` §6 |
| Cleanup uses matched dry-run scope; worktree removal differs from metadata prune; offline mounts need protection | **author-confirmed [paraphrase]** | 2026-09-23: git-clean, git-worktree, git-remote; `config.md` §6 |
| Generic `maintenance run` is not guaranteed non-destructive; `start` persists registration/scheduler state | **author-confirmed [paraphrase]** | 2026-09-23: git-maintenance SUBCOMMANDS/TASKS/CONFIGURATION; supersedes the blanket safe-maintenance alternative |
| `filter-repo` analysis, rename limitations, fresh-clone check, ref/commit maps, origin removal, and automatic old-history cleanup | **author-confirmed [paraphrase]** | 2026-09-23: upstream manual, `config.md` §6 |
| GitHub sensitive-data cleanup has a dedicated flag and host-owned residual refs; Support excludes ordinary non-sensitive data | **author-confirmed [paraphrase]** | 2026-09-23: GitHub sensitive-data guide fetched directly; `config.md` §6 |
| LFS prune ignores reflogs, forbids cross-repo shared storage, and exposes remote/unreachable verification | **author-confirmed [paraphrase]** | 2026-09-23: Git LFS prune manual; `config.md` §6 |
| Dropped stashes may be recovered before unreachable-object pruning; retained stashes have a reflog | **author-confirmed [paraphrase]** | 2026-09-23: git-stash DESCRIPTION and recovery example; independent verifier finding |
| Diagnose → scope → smallest matching action → same-metric receipt; no automatic expiry escalation | **skill-supplied** | 2026-09-23 cleanup function map (§7); workflow engineering, not a vendor-defined protocol |

Reflexive corollary: the harvest itself produced a fabrication — a WebFetch summary of RelNotes
invented feature descriptions on the first call. Every RelNotes claim above was re-read from the
raw file; the caveat is recorded in `config.md` §5 for the next reforge.

## 2. Calibration inversion (`distilling.md` §4)

|  | Source's audience (the human) | This skill's agent consumer |
|---|---|---|
| dominant error | does not know the feature exists (worktree, rerere, range-diff, `-S`); uses `checkout` for everything; fears rebase | **INVERSE**: knows every command, and (a) shapes commits from the tree (`add -A`, regex pathspecs), (b) unblocks itself with irreversible verbs (`reset --hard`, `--force`, `--no-verify`), (c) reports success from the absence of an error, (d) over-ceremonies a `git log` |
| corrective bias | "learn these features; rebase is safe" | "**enumerate, receipt, and size the ceremony by blast radius**" |
| what to make prominent | a feature tour | **deny-list + G1/G4 first-class**; the feature catalog demoted to `references/jobs.md`; reads explicitly exempt from the pipeline |

A dual guard IS carried, narrowly: under-firing shows up as the agent re-deriving a job (e.g.
verifying a rewrite by `ls-tree` size scans instead of `range-diff`) — the jobs table exists for
that direction. Over-firing (ceremony on reads) is guarded by the explicit exemption in the pipeline
and the MUST-NOT-FIRE rows.

## 3. Proof of fire — the floor was red before it was green

Run 2026-09-21 in a scratch repo (`scratchpad/proof`), then against the house `gitconfig`.

| # | Check | Injected state | Result |
|---|---|---|---|
| 1 | `state` | clean branch | exit 0, `op=none` |
| 2 | `staged` | nothing staged | exit 1, REFUSE G1 |
| 3 | `staged` | 60 MB blob + `.env` staged | exit 1: OVER-SIZE and SECRET-SHAPED both flagged |
| 4 | `state` | rebase paused on a conflict | exit 1: `op=rebase` AND detached HEAD, both refused |
| 5 | `state` | merge paused on a conflict (needed `-c merge.ff=true` — house `merge.ff=only` refuses the merge outright, a finding in itself) | exit 1: `op=merge` |
| 6 | `state --allow-detached` | detached, deliberate | exit 0 |
| 7 | `state` | second worktree added | `worktrees=2` |
| 8 | `lint git/gitconfig` | as-is | 7 DENY rows — but only 5 on the first run: `co = checkout` was MISSED because `[alias]` bodies omit the `git` prefix. Fixed by alias-aware rewriting (`name = verb` → `git verb`; `name = !cmd` → `cmd`). The defect class is the same as wiring-repositories' #9 inverted: an ACTION spelled without its verb read as a non-action |
| 9 | `lint` | a file with `git switch`, a commented `# git checkout`, and a lease push | exit 0 — a mention in a comment is not an action |
| 10 | `push` | local bare remote, fast-forward | exit 0, `RECEIPT origin/alpha == local` |
| 11 | `push --timeout 3` | remote at an unroutable address | exit 1 after 3 s, "killed at timeout" — the 90-minute hang would have been a 2-minute refusal |
| 12 | `push --lease <sha>` | amended tip | flags passed through; receipt matched |
| 13 | `state` | the dotfiles repo itself, 2026-09-21 | **Missed, then fixed**: two `UU` paths (a stash-pop conflict left by an earlier session) with NO sentinel file — `op=none`, exit 0. porcelain-v2 `u` rows are now counted as `unmerged=N` and refused. The floor's first real-repo run found a hole the scratch repo could not |

One conflict-test iteration produced no pause because the branches did not actually conflict — the
test was wrong, not the check. Recorded because "the gate went green" on a test that could not go
red is exactly the theater `architecture.md` §5 names.

## 3b. Verification fleet — two read-only lenses, findings and dispositions

Standard-tier fleet (`verifying.md` §7): one SIBLING-CUTS/TRIGGER-RACE lens over the nine
siblings' actual text, one FACTUAL-ACCURACY lens over every git claim against the local 2.55 man
pages plus a throwaway repo. Refutation-first prompts. Both reported; every finding below was
read with its evidence, not its verdict line.

| # | Lens | Finding | Disposition |
|---|---|---|---|
| V1 | facts | **WRONG**: `config.md` said `--force-if-includes` is "a no-op unless paired with a lease". git-push(1) says the opposite: it is a no-op WITH `--force-with-lease=<ref>:<expect>` and has effect only with the bare/refname form | **Fixed** in `config.md` §1–§2, `jobs.md` §8, the push helper (explicit `<b>:<sha>` lease only; the flag dropped), and §1 of this ledger. The first draft's safety rationale was inverted; the explicit expect is the defense, `--force-if-includes` is for the bare form |
| V2 | facts | IMPRECISE: `git branch -r --contains` misses a commit held only on a peer's local branch or another worktree | **Fixed**: `git branch --contains` (a `+` row = another worktree) added to G3 and `rewriting-and-recovery.md` §1 |
| V3 | facts | IMPRECISE: `lint` CLEAN-FORCE flagged `git clean -nfd` (a dry run) | **Fixed**: the regex excludes `-n…`/`--dry-run`; re-proved on `-nfd` / `-fd` / `--dry-run -f` |
| V4 | facts | 14 other claims confirmed verbatim or empirically (`--only` semantics, `--update-refs` worktree clause, bisect codes, `-z` parsing, `merge-tree` exit 1, stash forms, `reset --keep`, `gh` flags, maintenance schedule, gc/reflog defaults) | none |
| V5 | cuts | **BLOCK — mutual-deferral void**: "gh auth login fails" was routed to securing-remote-access, whose body never mentions `gh`; neither description fired | **Fixed**: `gh auth` and git-side signing config claimed HERE (`jobs.md` §16, §21; description; FIRES row); the ssh KEY stays theirs; reciprocal row added to securing-remote-access |
| V6 | cuts | BLOCK/FIX: commit signing had no owner | **Fixed** with V5 (`jobs.md` §21) |
| V7 | cuts | FIX: `git history` runs no hooks — a `--no-verify` by another path | **Fixed**: `jobs.md` §4 row now says so and forbids it where a hook enforces policy |
| V8 | cuts | FIX: "run codex in a worktree" is a 3-way stage-1 race; driving-codex's description lacks `worktree` | **Partially fixed**: reciprocal routing rows landed in driving-codex/grok/antigravity. Their descriptions were NOT edited (budget; their owners' call). Residual |
| V9 | cuts | NOTE: bare `push` / `rebase` / `merge` tokens may over-fire on conceptual questions | Accepted: the pipeline's read exemption makes a misfire cost nothing; the TRIGGERING LAW says trivial asks no-fire anyway |
| V10 | cuts | NOTE: no sibling carried a reciprocal pointer | **Fixed**: one row each in wiring-repositories, operating-the-harness, refactoring-code, implementing-and-debugging, driving-codex, driving-grok, driving-antigravity, designing-version-schemes, securing-remote-access (2026-09-21). orchestrating-agents / commanding-research-fleets not edited — their cut is one-directional by design (dispatch never routes git) |
| V11 | cuts | Confirmed accurate: the refactoring-code, wiring-repositories, and shared-checkouts.md cut claims; no contradiction between the deny-list's conditional `gc` ban and §3 step 8 | none |

## 4. F3 — fire / no-fire desk-check

Protocol: read ONLY `name:` + `description:`; answer fire / no-fire / co-fire. Run 2026-09-21.

| # | Query | Expected | Result |
|---|---|---|---|
| F1 | 「これコミットして push まで」 | FIRE | ✓ (コミット, push) |
| F2 | "rebase onto alpha blew up with conflicts, help" | FIRE | ✓ (rebase, コンフリクト解消 doublet is JA; EN "rebase" carries it) |
| F3 | 「間違えて alpha に直接コミットしちゃった、戻したい」 | FIRE | ✓ (間違えて main にコミットした — `alpha` vs `main`: the doublet says main; "コミット" + "戻したい" still land) |
| F4 | "my push has been hanging for twenty minutes, no output" | FIRE | ✓ (push が固まる is JA; EN "push" + LAW sentence "a silent push is a failed push") |
| F5 | 「800MB の jls が履歴に入った。消して」 | FIRE | ✓ (巨大ファイルを履歴から消す) |
| F6 | 「firedancer、他のセッションも触ってるけど commit して大丈夫?」 | FIRE | ✓ (複数セッションで同じ repo) |
| F7 | "which commit broke the test?" | FIRE | ✓ (verbatim in description) |
| F8 | 「git checkout って今使っていいんだっけ」 | FIRE | ✓ (verbatim) |
| F9 | 「昨日やった作業が見当たらない」 (no git keyword) | FIRE, weakly | △ — "消えたコミットの復元" needs コミット; a user who says 作業 may not trigger. Accepted: the recovery ladder is reachable once any git verb appears; not worth the listing chars |
| N1 | 「新リポの .gitignore と pre-commit hook 配線して」 | NO-FIRE → wiring-repositories | ✓ — both descriptions carry `.gitignore`/hook tokens; the PURPOSE cut is stated in BOTH (theirs names git as the frame, this names layers as theirs) |
| N2 | "add Bash(git push *) to deny permissions" | NO-FIRE → operating-the-harness | ✓ — the cut names `Bash(git *)` explicitly |
| N3 | 「この関数、振る舞い変えずに整理して」 | NO-FIRE (co-fire at commit) → refactoring-code | ✓ |
| N4 | 「semver と calver どっち?」 | NO-FIRE → designing-version-schemes | ✓ |
| N5 | "generate an ssh key for GitHub" | NO-FIRE → securing-remote-access | ✓ — re-run after V5: "gh auth login fails" moved to FIRES (gh auth is now in the description) |
| N6 | 「jj に乗り換えたい」 | NO-FIRE → none | ✓ (jj absent from description; no token matches) |
| N7 | "explain merge vs rebase" | NO-FIRE (conceptual) | △ — "rebase"/"merge" tokens match; the triggering LAW says a trivial ask no-fires anyway; if it fires, the pipeline's read-exemption makes it cost nothing |
| C1 | 「バグ直してコミットして」 | CO-FIRE: implementing-and-debugging first, this at the commit | ✓ (the DECISIVE cut states the order) |
| C2 | "run codex on this in a worktree and merge what's good" | CO-FIRE: driving-codex (containment), this (worktree, range-diff, integrate) | ✓ |

## 5. Residuals — what is NOT established

- **The semantic existence battery did not run** (§0). Lexical enumeration found no owner; the
  ccc route must be re-run when the daemon is healthy, and the result appended here.
- **Reciprocal pointers: nine landed** (§3b V10). Still one-directional: orchestrating-agents,
  commanding-research-fleets. The driving-codex/grok/antigravity DESCRIPTIONS do not carry
  `worktree`, so the stage-1 race in V8 is resolved only at body level.
- **A deny-list idiom lives in a sibling**: driving-cocoindex `references/operations.md:61` runs
  `git checkout -- .gitignore`. Reported to its owner; not edited here.
- **GitHub file-limit evidence resolved 2026-09-23** by direct official fetch; units corrected to MiB in `config.md` §4.
  The earlier Copilot-agent policy observation remains outside this cleanup refresh.
- **Maintenance decision corrected 2026-09-23**: choose explicit tasks from effective configuration.
  The procedure no longer relies on a single default-strategy claim or schedules work implicitly.
- **`push` subcommand tested only against a local bare remote and an unroutable host**; not against
  a GitHub-side 100 MB rejection (would need a real remote and a 100 MB blob).
- **House `gitconfig` legacy aliases and 15 absent keys**: reported (`config.md` §3), not changed —
  editing `git/gitconfig` is the user's call and outside this forge's scope.
- **`lint` reads a TS regex source as an action**: `git-check lint scripts/git-check.ts` flags its
  own `--prune=now` pattern literal. The lint is scoped to shell, aliases, hooks, and task bodies;
  a string literal in source code is a mention it cannot distinguish. Known limit, not fixed.
- **PROSE-DEBT: clear.** `skill-check.ts` returns 0 WARNs across SKILL.md and `references/`
  (2026-09-21, after 43 long sentences were split or tabled). F1 EXIT satisfied without a waiver.

## 6. F4 STANDING — what this admission costs

Before this skill the collection measured exactly at its ceiling (64,026 chars, 70 skills, pinned
2026-09-21 by the typesafe-ai admission). After: 65,242 chars, 71 skills — a delta of 1,216, which
is this skill's name+description exactly, so no drift was absorbed. The raise is recorded in
`agents/skills-listing-budget.json` `raises[]` with the reason. Retiring a sibling was considered
and rejected: no sibling does this job at all (§0), so nothing is doing it badly. `alsoFound`:
driving-codex charges 1,510, ten under the observed truncation window; reported, not absorbed.

## 7. Cleanup reforge — 2026-09-23

Request: extend the Git distillation to bloated repositories and cleanup, then reorganize/revise it.
Editor: `/root`. Baseline skill tree: `95ab5fb8b4c3c696ef9539914364923549f2787b`.
Scope: cleanup decisions and their seams; existing commit/push/rebase implementation is not re-certified.

### Function map and file treatment (editor-signed)

```text
storage/performance complaint -> select metric and classify cause -> measured scope
measured scope + authorized targets -> preview and smallest matching operation -> changed local state
changed local state -> same-scope measurement + preservation checks -> receipt or return to diagnosis
reachable content requiring removal -> reason-specific rewrite -> complete intended-ref publication + tracked host residuals
```

Stop: the requested outcome is evidenced, or the remaining cause/host action is explicitly unresolved.
`driving-git` already owns these Git operations; extend it rather than adding a skill/listing entry.

| Artifact | Treatment / sole responsibility |
|---|---|
| SKILL.md | cleanup trigger vocabulary and gates; route to the detailed owners |
| storage-and-cleanup.md | new reference: measurements, deletion boundaries, local cleanup, performance, storage receipt |
| rewriting-and-recovery.md | reason-specific historical removal and ref publication; shared rewrite/recovery remain here |
| jobs.md | retain job lookup; replace duplicated huge-repo recipes with pointers |
| shared-checkouts.md | retain concurrency ownership; remove claims that worktrees isolate GC or that bare maintenance is always safe |
| config.md | dated official source map, tool capability and hosting-policy facts |
| git-check.ts | two diagnostic hints only; detection logic unchanged |

Calibration: vendor docs help users discover maintenance/filtering tools.
The agent already knows the tools and may select a destructive one from the word "cleanup".
The correction is diagnosis before action, exact removal scope, and a receipt for the requested metric.
The transition and gates are skill-supplied; individual command facts retain the source grades in §1.

### Audit and resolutions

Read-only auditor: `/root/git_cleanup_audit`, Terra, separate context, official-source relay.
Root retained design/edit authority under `forging-skills`; no Git mutation was delegated.

| Finding | Resolution |
|---|---|
| Secret and ordinary bloat removal conflated | reason table; credential rotation only where applicable; separate host residuals and Support eligibility |
| Incomplete ref closure after filtering | declared ref universe, maps, expected-OID leases, and remote readback for every intended update/deletion |
| G3 summary contradicted published-owned/shared distinction | main gate points to the sole radius table; existing authorization is reused |
| Huge-repo row mixed performance with disk reduction | dedicated measurements and separate client-performance section; fixed latency receipt removed |
| Sparse checkout could discard ignored files | preservation includes ignored work; receipt includes sparse selection and worktree size |
| Maintenance start introduced persistent work implicitly | user-level registration/scheduling scope and explicit receipt |
| Root seam audit: safe-maintenance claim survived in checker hint and S5 | both corrected; concurrent worktrees still share the object store |
| Root seam audit: missing objects described as transient phantoms | preserve/recover and verify; no expectation of spontaneous object recovery |
| Independent verifier: inherited claim that stash is reflog-less and dropped entries are lost forever | corrected `jobs.md` §2 against git-stash; no promise that a WIP branch survives every destructive operation |

### Verification receipts

- `mise exec -- bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/driving-git`: exit 0, no WARNs after prose fixes.
- `mise run lint:skills-floor`: exit 0; 72 skills, 64,420 listing chars against 65,242 ceiling.
  Other skills account for 111 existing prose warnings; this skill is clear.
- Name+description charge: 1,216 → 929 characters (287 fewer), with cleanup vocabulary added.
  No listing-ceiling increase or new skill.
- `git diff --check -- agents/skills/driving-git`: exit 0.
- Disposable Git fixture `/tmp/git-cleanup-skill.SAndoW`, Git 2.55.0, isolated user/system config:
  retained tag kept 66,049 reachable bytes after branch deletion; removing the tag left 213 bytes from refs,
  while refs plus reflog still reached 66,049 bytes. This discriminates retained references from recovery history.
  A linked worktree resolved the same common directory; `fsck --connectivity-only` exited 0.
- `git-check.ts lint /tmp/git-cleanup-skill.SAndoW/unsafe.sh`: expected exit 1 on immediate GC and forced clean.
  Both updated hints printed. No cleanup command from this fixture was run against the user's repositories.

Independent verifier: `/root/git_cleanup_verify`, Terra, fresh context, read-only.
Verdict: SCOPE-LIMITED PASS on the five cleanup criteria, with the inherited stash finding above.
The comparison below is a desk comparison of immutable old tree vs revised text, not a live model benchmark.

| Ask | Old → new observed instruction difference |
|---|---|
| Deleted files, `.git` still 20 GB | client-performance suggestions → measured refs/reflogs/physical-storage diagnosis |
| Stale branches and old worktree | sparse removal mention → retained-work checks, removal vs metadata-prune distinction |
| LFS cache filling disk | side-effect exclusion only → cache measurement, preview, remote/unreachable verification |
| Pushed 400 MB file vs exposed token | one combined flow → reason-specific response, ref closure, tracked hosted residuals |

F3 description-only desk-check, independently performed:

| Query | Expected / observed route |
|---|---|
| 「これコミットして push まで」 | FIRE / FIRE |
| "rebase conflict, help" | FIRE / FIRE |
| 「消したのに .git が 20GB」 | FIRE / FIRE |
| 「不要 branch と worktree を掃除して」 | FIRE / FIRE |
| "Git LFS cache is filling my disk" | FIRE / FIRE |
| 「巨大ファイルを履歴から消して」 | FIRE / FIRE |
| "a token leaked in Git history" | FIRE / FIRE |
| 「別セッションも同じ repo を触っている」 | FIRE / FIRE |
| 「新リポの .gitignore と hook を配線」 | NO-FIRE / wiring-repositories |
| "deny Bash(git push *)" | NO-FIRE / operating-the-harness |
| 「この関数をクリーンアップ」 | NO-FIRE / refactoring-code |
| 「WSL の ext4.vhdx を縮めたい」 | NO-FIRE / operating-wsl2-on-windows |
| "explain merge vs rebase" | NO-FIRE / direct answer; generic tokens can still match (§4's residual) |

Follow-up on the corrected stash paragraph: independent verifier returned PASS with `jobs.md:35`
and git-stash as its evidence. Editor accepted the cleanup delta and the narrow stash correction.

Deployment: `mise run link:skills` exited 0.
Both `~/.agents/skills/driving-git` and `~/.claude/skills/driving-git` resolved to this source directory.
Final target floor and `git diff --check` exited 0 with no target WARNs.

### Limits

No real remote rewrite, hosted purge, scheduler registration, or LFS deletion was executed.
`git-filter-repo` and Git LFS were not installed in this environment; those paths were checked against official docs.
The fixture proves measurement/ref behavior, not a production cleanup's recovered capacity.
Live installed-skill auto-triggering requires a fresh session; a description desk-check is not that experiment.
The original semantic existence-battery residual remains; this revision extends the established owner.
