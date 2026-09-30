# Driving Jujutsu forge verification ledger

Date: 2026-09-30. Target: `driving-jujutsu` v2609.1.0.

## Function and existence

Input: a jj repository or an explicit jj adoption request. Function: select and run jj
operations while preserving the intended change, bookmark, and remote target. Artifact:
the resulting jj state plus command receipts. Next state: verified local or published
change. Stop: the target change and pointers match the user's requested outcome.

Existing `driving-git` explicitly called jj out of scope. Extending it would merge
Git index/branch semantics with jj snapshot/bookmark semantics and obscure the decisive
choice of command family. The sibling boundary is command ownership and interoperability.
No sibling is retired: the Git command contract remains necessary.

The knowledge artifact is an operational decision table and four gates. The blocking
failure it removes is treating a jj bookmark as an automatically advancing Git branch
or assuming Git staging limits a jj commit; either can publish the wrong revision or
omit the intended one. The expected decision-time delta is a direct lookup from job
to jj verb and check instead of reconstructing Git analogies during each operation.

## Calibration

| | Official documentation audience | Agent consumer |
|---|---|---|
| Dominant error | Git user may not know jj's model and commands. | Inverse risk: model confidently translates Git verbs and skips scope/target checks. |
| Corrective bias | Explain jj concepts and show convenient workflows. | Put J1–J4 and the deny-list before the command catalog. |
| Prominence | Features and examples. | Snapshot, bookmark, publication, recovery receipts. |

## Local command probe

Isolated scratch paths: `/tmp/jj-skill-probe.B13vYk` and a bare local Git remote.
`jj --version` returned `jj 0.45.1`. `jj git init .` made a colocated workspace.
After adding `second.txt`, `jj status` printed `A second.txt`. `jj bookmark create demo
-r @-` pointed to the earlier change. `jj commit -m second` created an empty child but
`jj bookmark list` still pointed `demo` to the earlier change. `jj undo` restored the
pre-commit working-copy change containing `second.txt`. `jj git push --bookmark demo
--remote local --dry-run` rejected the undescribed change; after `jj describe -m
'second change'`, dry-run printed the exact bookmark add and `Dry-run requested, not
pushing.` No network push occurred.

A second scratch Git repo at `/tmp/jj-git-existing.ADqjJL` confirmed that
`jj git init .` in an existing Git worktree reports colocation and preserves a clean
working tree. `jj git colocation status` reported `Workspace is currently colocated
with Git.` The probe also checked `jj op revert -h`, `jj split -h`, `jj bookmark list
-h`, and `jj git colocation -h` for the exact command forms used here.

## F3 trigger and content checks

The 5 FIRE, 5 NO-FIRE, and one CO-FIRE rows live in `SKILL.md`. Desk-check against the
new description and `driving-git`: jj-specific asks match the new description;
plain Git and storage asks remain with `driving-git`; code repair and repo wiring
retain their owners. The `jujitsu` spelling is deliberately included for the user's
request, while the sports near-miss remains excluded by the VCS-specific description.

No subagent was used for this small procedural skill.
The local command probe checks observed command behavior, not automatic skill loading
or future agent compliance. Static self-review checked the sources against every
gate and found no command-semantic contradiction. F3 solo-tier waiver: independent
hostile reviewers and live trigger evaluation were not run; a future failure should
reopen those exact cases.

## F4 standing

Before admission, `mise run lint:skills-floor` measured 73 skills and 64,107
characters. After admission and the reciprocal `driving-git` cut, it measured 74
skills and 64,818 characters under the existing 65,242-character ceiling.
The ceiling did not bind; no raise or retirement is needed. The final gate and
symlink receipt are recorded in the implementation turn.
