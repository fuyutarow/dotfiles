---
name: driving-git
description: >-
  Operates Git with scoped changes and checkable receipts. Use for commit / コミット, push,
  branch / ブランチ, rebase / リベース, merge, stash, worktree, reflog, PR / プルリク (gh),
  コンフリクト解消, 履歴の書き換え, force push, push が固まる, 消えたコミットの復元,
  "which commit broke it", git checkout, 複数セッションで同じ repo, repository bloat / Git肥大化,
  .git が大きい, クリーンアップ / cleanup, gc / prune, 巨大ファイルを履歴から消す,
  LFS cache, and leaked secrets. Measure storage before deleting; verify the selected outcome.
  Cuts by PURPOSE: .gitignore / hooksPath / git-hook wiring → wiring-repositories;
  harness permissions/isolation → operating-the-harness; code changes → implementing-and-debugging
  or refactoring-code, Git co-fires at commit; SSH keys → securing-remote-access, gh auth/signing here;
  version meaning → designing-version-schemes. Workflow-native: mutations stay SOLO with the
  checkout owner; only read-only forensics fan out. English skill; respond in the user's language.
---

# Driving git — jobs, verbs, receipts

> **Version**: v2609.2.0 (2026-09-23) — storage diagnosis, cleanup, and reason-specific history removal.
> Receipts, grades, calibration, F3 desk-check: `tests/forge-verification-ledger.md`.
> **Durability**: no version number or "experimental" claim in this body — all in `references/config.md`.

```bash
for f in jobs rewriting-and-recovery storage-and-cleanup shared-checkouts config; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/git-check.ts || echo MISSING git-check.ts; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

Resolve bundled `scripts/` paths against the directory of the loaded SKILL.md.
Keep the command's working directory at the target repository; do not run repository checks inside the skill directory.

## Language

English skill; respond in the user's language (default Japanese). These tokens stay fixed inside
Japanese prose.

| Token | Meaning |
|---|---|
| **LAW**, **gate** (G1–G4), **fire / no-fire** | house tokens, as in every forged skill |
| **JOB** | the thing the user is trying to do, one row of the jobs table |
| **RECEIPT** | the observable that closes an operation (sha, stat line, exit code) |
| **BLAST RADIUS** | private / published / shared — who else holds the commits being changed |
| **SHARED CHECKOUT** | one working tree that more than one session can write |
| **enumerated** | a pathspec written out as a list, never derived from the tree |
| **deny-list** | the unguarded forms this skill never runs |

## THE LAW

> Git is operated by **JOB**. Name what you are trying to do and take the verb that cannot be
> misread. Close with a **RECEIPT**: an observable the next reader can check. A silent success
> and a silent failure print the same nothing. History is **ENUMERATED, never globbed**. The
> working tree does not decide what a commit contains. **BLAST RADIUS sets the ceremony**.
> Apply the private / published-owned / shared protocol in `references/rewriting-and-recovery.md` §1.
> For cleanup, measure the cause before deleting and verify the same storage scope afterward.

**Why it runs this way.** The sources correct a human who does not know the features exist. A
capable model knows them and fails the other way. It globs the tree into a commit. It reaches for
`reset --hard` / `--force` / `--no-verify` to unblock itself. It reports "pushed" from the absence
of an error. Measured in this house (ledger §1): 3.9 GB swept into one commit by a regex
pathspec. A push that hung silently for 90 minutes. An amend that re-added the files it meant to
drop. So the **deny-list and G1/G4 are first-class**, and the feature catalog is a reference.

## The four gates — G1 / G2 / G3 / G4

| Gate | Inverts (the error) | ARTIFACT |
|---|---|---|
| **G1 SCOPE** | a commit shaped by the working tree — `add -A`, `add .`, `-a`, a pathspec built from `git status`, `--amend --only` re-reading disk | `git diff --cached --stat` and `bun scripts/git-check.ts staged` **in the turn, before `git commit`**; the pathspec is an enumerated list |
| **G2 STATE** | acting on an assumed tree — wrong branch, detached HEAD, a paused rebase, a peer's checkout | `bun scripts/git-check.ts state` before any mutation and before any job that reads tracked files in a SHARED CHECKOUT; `op=none` and the expected branch |
| **G3 BLAST RADIUS** | rewriting or discarding what others hold, or what nothing else references | publication/sharing evidence → `references/rewriting-and-recovery.md` §1; deletion scope and recovery source → `references/storage-and-cleanup.md` §2. A missing remote-tracking ref does not prove private history |
| **G4 RECEIPT** | "done" claimed from the absence of an error | commit → `log -1 --stat`; push → `git-check push` with remote-tip equality; rebase → `range-diff`; recovery → recovered sha; cleanup → same-scope before/after size plus preservation checks (`references/storage-and-cleanup.md` §5) |

## Deny-list — unguarded forms, with the verb that replaces each

| Never | Instead |
|---|---|
| `git checkout …` (branch, file, or `-b`) | `git switch [-c]` / `git restore [--staged] -- <path>`; the house shell refuses `checkout` |
| `git add -A` · `add .` · `add :/` · `commit -a` | `git add -p` or `git add -- <paths>`; `git commit -- <paths>` |
| pathspec from a regex/glob over `git status` | enumerate, then `git diff --cached --stat` |
| `commit --amend --only -- <paths>` to DROP files | `git rm --cached -- <paths>` then `commit --amend --no-edit`; verify `git ls-tree -r -l HEAD` |
| `push -f` / `--force` · `push -q` · a push with no timeout | `bun scripts/git-check.ts push origin <b> [--lease <sha>]` |
| `reset --hard` · unscoped `clean -f` · `restore .` · `stash drop/clear` · `branch -D` | preserve the actual data at risk; tags do not save uncommitted files. Cleanup uses the preview and scope rules in `references/storage-and-cleanup.md` |
| `--no-verify` | fix what the hook reports; a wrong hook is its owner's fix |
| amend / rebase / `switch -C` on a PUBLISHED commit | a new commit, or `git revert`; a rewrite only under G3 |
| immediate reflog expiry/prune · unqualified `maintenance run` as a "safe" GC substitute | diagnose and select the task; destructive housekeeping requires an idle common object store (`references/storage-and-cleanup.md` §2–§3) |
| `git filter-branch` | `git filter-repo` — git's own warning says so |
| `merge -Xtheirs` · `pull` that merges | resolve the conflict (`rerere` remembers); `pull.rebase` |
| `git config --global` edits, `-c`/`-C` spellings that dodge a permission rule | propose the config to the user (`references/config.md` §2); never dodge |
| `git submodule update --init`, LFS, hooks, `gitignore` edits as a side effect of another job | say so and stop — each is its own job with its own owner |

The floor: `bun scripts/git-check.ts lint <files>` finds these idioms in scripts, aliases, and hooks.

## Jobs — the lookup (SOLE home of the full rows: `references/jobs.md`)

| Job | Verb | Receipt |
|---|---|---|
| start isolated work | `git fetch origin && git switch -c <b> origin/<base>`; another session may touch this checkout → `git worktree add ../<name> -b <b>` | `git status -sb` header |
| park WIP | `git stash push -u -m "<why>" -- <paths>`, or a `wip:` commit if it outlives the session | `git stash list` / `log -1` |
| commit exactly this | `add -p` or `add -- <paths>` → `diff --cached --stat` → `git-check staged` → `commit` | `git log -1 --stat` |
| fix an earlier UNPUBLISHED commit | `commit --fixup=<c>` (or `--fixup=reword:<c>`) → `rebase -i --autosquash <base>`; `git absorb` for many | `range-diff` |
| keep a stack consistent | `rebase --update-refs <base>` | `log --oneline --graph` labels |
| update onto upstream | `fetch origin && rebase origin/<base>`; conflict → resolve, `add -- <f>`, `--continue` | `log --oneline origin/<base>..HEAD` |
| preview a merge | `merge-tree --write-tree --name-only <base> <b>` | its exit code + conflicted list |
| publish | `git-check push origin <b>`; after a rewrite add `--lease <sha-you-last-saw>` | `RECEIPT origin/<b> == local` |
| prove a rewrite | `range-diff <base> <old> <new>` | `=` rows except the intended `!` |
| which commit broke it | `bisect start <bad> <good>; bisect run <cmd>; bisect reset` | the first-bad sha |
| when did text/function change | `log -S'<str>'` · `-G'<re>'` · `-L :<func>:<file>` · `blame -w -C -C -C` | the sha |
| undo | unstaged `restore -- <p>` · staged `restore --staged -- <p>` · last unpublished `reset --soft HEAD~1` · published `revert <sha>` | `git-check state` |
| recover lost work | `reflog` → `branch recover/<x> <sha>`; dropped stash → `fsck --lost-found` | the sha under `git log` |
| remove historical blobs / sensitive data | reason → declared refs → independent clone → reviewed filter → verify → publish | `references/rewriting-and-recovery.md` §3 |
| reclaim disk / clean branches, worktrees, or LFS | measure → classify → preview → scoped cleanup → remeasure | `references/storage-and-cleanup.md` §1–§3, §5 |
| speed up a huge repo | select transfer/worktree/latency target → matching optimization | measured target before/after; `references/storage-and-cleanup.md` §4 |
| open a PR | push first → `gh pr create --base <base> --fill` → `gh pr checks --watch` | the PR URL |
| write the message | imperative English subject ≤72, body = why + numbers, `--trailer` for trailers; follow the repo's own `git log` convention | `git log -1` reads as a lab note |
| many sessions, one repo | one worktree per session; if truly shared → `references/shared-checkouts.md` S1–S8 | `git-check state` per job |

## The pipeline — per operation

1. **NAME THE JOB** — one row above. No row → it is another skill's job or a plain read; say which.
2. **G2** — `bun scripts/git-check.ts state`. Refused → finish/abort/wait, never work around.
3. **G3** — if the job rewrites or discards: PUBLISHED? SHARED? → the matching row's before-list.
4. **DO** — the verb from the row, enumerated paths, no deny-list form.
5. **G4** — the row's receipt, pasted into the turn. A claim of "done" without it is not done.

Reads (`log`, `diff`, `show`, `blame`, `status`) skip 2–3 and need no receipt.

## Execution model

The modal invocation is one commit, one push, or one rebase. It is **SOLO, zero agents**, inside
the session that owns the working tree. **A mutation is never delegated to a subagent on a shared
checkout.** Two writers on one index is the incident class this skill was forged from.

| Stage | Mode | Why |
|---|---|---|
| name the job, G2, G3, DO, G4 | SOLO | one index, one writer; the receipt must land in the acting session |
| big-blob hunt across N repos · `bisect run` over independent tests · `range-diff` review of N branches | FAN-OUT, read-only | independent reads; each returns sha + output, never a verdict |
| shared-branch rewrite approval | HUMAN | the blast radius is the user's to accept |

Evidence is CITATION-RELAY. The receipt (sha, stat line, exit code) crosses the agent boundary or
the return is quarantined. No harness → same pipeline, serial. Durable operating guidance from a
frontier model (2026-09); encodes failures observed in production. If a constraint here feels
unnecessary, that feeling is the failure mode. Follow the map.

## MUST-NOT-FIRE — and the fire/no-fire set

Ceremony on a `git log` is this skill failing its own G1. Reads never fire the pipeline.

FIRES:

| Ask | Why here |
|---|---|
| 「これコミットして」 / "commit this and push" | the modal job — G1, G4 |
| 「rebase したらコンフリクトした、どうしよう」 | update-onto-upstream row; rerere; the dirty-file trap |
| 「間違えて alpha に直接コミットしちゃった」 | undo row + G3 (published?) |
| "the push has been sitting there for 20 minutes" | G4 — a silent push is a failed push; blob-size hunt |
| 「800MB のファイルが履歴に入っちゃった、消したい」 | diagnose/removal row; G3 follows actual publication and ownership |
| 「ファイルは消したのに .git が 20GB、容量を減らしたい」 | storage diagnosis before choosing cleanup or rewrite |
| 「不要な branch と worktree を掃除して」 | scoped cleanup and preservation checks |
| "Git LFS cache is filling my disk" | LFS storage/remote checks, separate from ordinary GC |
| 「git gc しても小さくならない」 | reachable refs, reflogs, and physical storage comparison |
| 「別セッションも同じ repo 触ってるけど平気?」 | shared-checkouts protocol |
| "which commit broke the test?" | bisect row |
| 「git checkout って今は使っていいの?」 | deny-list row 1 + `references/config.md` §1 |
| 「昨日の作業が消えた気がする」 (no git keyword) | recovery ladder |
| "gh auth login keeps failing" / 「コミットに署名したい」 | gh auth + signing config rows (`references/jobs.md` §16, §21); the key is securing-remote-access's |

MUST NOT fire (with route):

| Ask | Route |
|---|---|
| 「新リポの .gitignore と pre-commit hook 配線して」 | `wiring-repositories` — the wiring set and git-hook shape |
| "add `Bash(git push *)` to the deny permissions" | `operating-the-harness` — permission rules |
| 「この関数、振る舞い変えずに整理して」 (commit only at the end) | `refactoring-code` owns the change; this skill co-fires at the commit |
| 「次のリリースは semver でいく? calver?」 | `designing-version-schemes` |
| "generate an ssh key for GitHub" (the key, not git) | `securing-remote-access` |
| 「jj (jujutsu) に乗り換えたい」 | no skill — out of scope; a colocated repo's git side still obeys this skill |
| "what's the difference between a merge and a rebase?" (conceptual, no operation) | answer directly — no ceremony |
| `git log --oneline -20` to orient before editing | a read — no pipeline, no receipt |
| 「C: がいっぱい。WSL の VHDX を縮めたい」 | `operating-wsl2-on-windows`; Git fires only if a Git store is the measured cause |
| 「この関数をクリーンアップして」 | `refactoring-code`; cleanup without a Git target is not this skill |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `wiring-repositories` | **PURPOSE** — "Is the ask about which layers this repo admits (`.gitignore`, `core.hooksPath`, the git-hook shape), or about operating the repo day to day?" Layers → theirs. Operations → here. Reciprocal: its layer table names `git` as the frame; this skill lays no layer |
| `operating-the-harness` | **PURPOSE** — Claude Code's `Bash(git *)` rules, `--worktree` / `EnterWorktree` / `isolation: worktree` mechanics and their enforcement, attribution settings → theirs. The git commands executed inside any of those → here. `references/shared-checkouts.md` assumes their mechanics and restates none |
| `implementing-and-debugging` · `refactoring-code` | **DECISIVE** — "Is the question what to change, or how the change enters history?" What → theirs. History (scope, message, rewrite, publish) → here; **co-fire at commit time**. Their `git stash`-not-`checkout .` line agrees in substance — do not byte-diff |
| `orchestrating-agents` · `commanding-research-fleets` | **PURPOSE** — dispatch, roles, acceptance → theirs. The git protocol every peer on one repo obeys (S1–S8) → here |
| `driving-codex` · `driving-grok` · `driving-antigravity` | **PURPOSE** — whether a foreign agent needs containment → theirs. The worktree/branch it gets and how its work is reviewed and integrated → here (`references/shared-checkouts.md` §4) |
| `securing-remote-access` | **DECISIVE by artifact** — the ssh key pair and its agent/hardware backing → theirs. `gh auth` state and the git-side signing config (`gpg.format`, `user.signingkey`, `commit.gpgsign`) → here (`references/jobs.md` §16, §21). Their body never mentions `gh`; this side owns it |
| `designing-version-schemes` | **DECISIVE** — what a version/tag MEANS → theirs; `git tag`/push mechanics → here |
| lazygit (`lg`) · jj | not siblings — `lg` is the human's interactive surface (house preference); an agent runs plain git. jj is out of scope; colocated repos obey this skill for their git side |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/jobs.md` | The full JTBD rows: exact command forms, the legacy idiom replaced, the receipt, per-job traps (`--only` semantics, the dirty-file `--continue` trap, tag push) | any job beyond the one-line lookup above |
| `references/rewriting-and-recovery.md` | G3 by blast radius, the freeze notice, the recovery ladder, removing a pushed secret/blob, abandoning paused operations | any rewrite, any "lost" work, any paused op |
| `references/storage-and-cleanup.md` | Storage diagnosis, cause/action table, deletion boundaries, LFS and worktree cleanup, client performance, before/after receipts | bloat, disk cleanup, GC/prune, large-repo latency or transfer |
| `references/shared-checkouts.md` | One-worktree-per-session default, the S1–S8 shared-checkout protocol, the measured incidents, foreign-agent worktrees | a second session or agent can write this repo |
| `references/config.md` | The ONE dated file: verb status in the current git, the modern-defaults config set with the failure each prevents, house `gitconfig` state and legacy aliases, platform limits, sources | any version / "is X still experimental" / config question; every reforge |
| `scripts/git-check.ts` | The floor: `state` (G2), `staged` (G1), `push` (G4), `lint` (deny-list in scripts/aliases). Run it, never read it | G1, G2, G4; auditing aliases and hooks |
| `tests/forge-verification-ledger.md` | Provenance grades, the calibration inversion, proof-of-fire, the F3 desk-check, F4 cost | reforging; disputing any claim here |
